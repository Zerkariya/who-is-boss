#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from './agent.js';
import { loadConfig, type AgentSpec } from './config.js';
import { ROLES, ROLE_DESCRIPTIONS, isRole } from './roles.js';
import { createWorktree, isGitRepo } from './worktree.js';
import { appendTranscript, recentTranscriptText } from './transcript.js';
import { wrapPrompt } from './prompts.js';

const RECENT_TRANSCRIPTS_FOR_CONSULTANT = 10;

const HELP = `who-is-boss — multi-agent CLI orchestration

Usage:
  wib ask <role> <prompt...>     Delegate a prompt to the agent assigned to <role>
  wib list                       List configured roles
  wib roles                      Print built-in role definitions
  wib init                       Write a starter .who-is-boss.yaml in the cwd
  wib --help                     Show this help

Options:
  --config <path>                Use a specific config file
  --stream                       Stream agent output as it arrives (default: capture only)
  --stdin                        Read additional prompt content from stdin and append it
  --no-isolate                   Skip git worktree isolation for reviewer/researcher
                                 (NOT recommended — they will run in the boss's repo directly)

Built-in roles: ${ROLES.join(', ')}

Role behavior:
  boss        runs as configured, no wrapping
  reviewer    runs in a temporary git worktree (read-only); transcribed
  researcher  runs in a temporary git worktree (read-only); transcribed
  consultant  runs as configured; recent transcripts auto-injected as context
`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  const command = argv[i++] ?? 'help';
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function cmdAsk(args: ParsedArgs): Promise<number> {
  const [role, ...promptParts] = args.positional;
  if (!role) {
    process.stderr.write('error: missing <role>\n\n' + HELP);
    return 2;
  }
  if (!isRole(role)) {
    process.stderr.write(
      `error: unknown role "${role}". Allowed: ${ROLES.join(', ')}\n`,
    );
    return 2;
  }
  let userPrompt = promptParts.join(' ');
  if (args.flags.stdin) {
    const piped = await readStdin();
    if (piped) userPrompt = userPrompt ? `${userPrompt}\n\n${piped}` : piped;
  }
  if (!userPrompt.trim()) {
    process.stderr.write('error: empty prompt\n');
    return 2;
  }

  const config = loadConfig(
    typeof args.flags.config === 'string' ? args.flags.config : undefined,
  );
  const spec = config.roles[role];
  if (!spec) {
    process.stderr.write(
      `error: role "${role}" is not configured in ${config.sourcePath}\n`,
    );
    return 2;
  }

  const projectRoot = dirname(config.sourcePath);
  const stream = Boolean(args.flags.stream);
  const isolate = !args.flags['no-isolate'];

  let runSpec: AgentSpec = spec;
  let wrappedPrompt = userPrompt;
  let cleanup: (() => void) | undefined;
  let worktreePath: string | undefined;

  try {
    if ((role === 'reviewer' || role === 'researcher') && isolate) {
      if (!isGitRepo(projectRoot)) {
        process.stderr.write(
          `error: role "${role}" needs a git repo at ${projectRoot} for worktree isolation.\n` +
            `       Run \`git init && git add . && git commit -m init\` first, or pass --no-isolate.\n`,
        );
        return 2;
      }
      const wt = createWorktree(projectRoot);
      worktreePath = wt.path;
      cleanup = wt.cleanup;
      runSpec = {
        ...spec,
        cwd: wt.path,
        env: {
          ...(spec.env ?? {}),
          WIB_PROJECT_ROOT: projectRoot,
          WIB_CONFIG_PATH: config.sourcePath,
          WIB_WORKTREE: wt.path,
          WIB_ROLE: role,
        },
      };
      wrappedPrompt = wrapPrompt(role, userPrompt, {
        worktreePath: wt.path,
        originPath: projectRoot,
      });
    } else if (role === 'consultant') {
      const recent = recentTranscriptText(projectRoot, RECENT_TRANSCRIPTS_FOR_CONSULTANT);
      wrappedPrompt = wrapPrompt(role, userPrompt, { recentTranscripts: recent });
    } else {
      wrappedPrompt = wrapPrompt(role, userPrompt, {});
    }

    const result = await runAgent(runSpec, wrappedPrompt, { stream });
    if (!stream) process.stdout.write(result.stdout);
    if (result.exitCode !== 0) {
      process.stderr.write(
        `\n[wib] agent "${spec.name}" exited with code ${result.exitCode} after ${result.durationMs}ms\n`,
      );
      if (result.stderr && !stream) process.stderr.write(result.stderr);
    }

    if (role !== 'consultant') {
      const file = appendTranscript(projectRoot, {
        timestamp: new Date().toISOString(),
        role,
        agentName: spec.name,
        prompt: userPrompt,
        output: result.stdout,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });
      process.stderr.write(`[wib] transcript: ${file}${worktreePath ? ` (worktree ${worktreePath})` : ''}\n`);
    }

    return result.exitCode;
  } finally {
    cleanup?.();
  }
}

function cmdList(args: ParsedArgs): number {
  const config = loadConfig(
    typeof args.flags.config === 'string' ? args.flags.config : undefined,
  );
  process.stdout.write(`Config: ${config.sourcePath}\n\n`);
  for (const role of ROLES) {
    const spec = config.roles[role];
    if (spec) {
      const argTail = spec.args?.length ? ' ' + spec.args.join(' ') : '';
      process.stdout.write(
        `  ${role.padEnd(11)} -> ${spec.name} (${spec.command}${argTail})\n`,
      );
    } else {
      process.stdout.write(`  ${role.padEnd(11)} -> (unassigned)\n`);
    }
  }
  return 0;
}

function cmdRoles(): number {
  for (const role of ROLES) {
    process.stdout.write(`${role}\n  ${ROLE_DESCRIPTIONS[role]}\n\n`);
  }
  return 0;
}

function cmdInit(): number {
  const target = join(process.cwd(), '.who-is-boss.yaml');
  if (existsSync(target)) {
    process.stderr.write(`refusing to overwrite existing ${target}\n`);
    return 1;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'examples', 'who-is-boss.yaml'),
    join(here, '..', '..', 'examples', 'who-is-boss.yaml'),
  ];
  const example = candidates.find((p) => existsSync(p));
  if (!example) {
    process.stderr.write('error: bundled example config not found\n');
    return 1;
  }
  writeFileSync(target, readFileSync(example, 'utf8'));
  process.stdout.write(`wrote ${target}\n`);
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help || args.command === 'help' || args.command === '--help') {
    process.stdout.write(HELP);
    return 0;
  }
  switch (args.command) {
    case 'ask':
      return cmdAsk(args);
    case 'list':
      return cmdList(args);
    case 'roles':
      return cmdRoles();
    case 'init':
      return cmdInit();
    default:
      process.stderr.write(`unknown command: ${args.command}\n\n${HELP}`);
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
