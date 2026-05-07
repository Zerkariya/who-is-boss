import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ROLES, type Role, isRole } from './roles.js';

export interface AgentSpec {
  /** Display name shown in logs (e.g. "claude", "codex"). */
  name: string;
  /** Executable to invoke (e.g. "claude", "codex", "gemini"). */
  command: string;
  /** Extra args prepended before the prompt. */
  args?: string[];
  /**
   * How to pass the prompt to the agent.
   *  - "argv" (default): append prompt as the last argv
   *  - "stdin": pipe prompt into stdin
   */
  promptMode?: 'argv' | 'stdin';
  /** Optional env vars to inject. */
  env?: Record<string, string>;
  /** Working directory; defaults to project root. */
  cwd?: string;
  /** Hard timeout in seconds (default 300). */
  timeoutSec?: number;
}

export interface Config {
  /** Map of role -> agent spec. */
  roles: Partial<Record<Role, AgentSpec>>;
  /** Path the config was loaded from. */
  sourcePath: string;
}

const CONFIG_FILENAMES = [
  '.who-is-boss.yaml',
  '.who-is-boss.yml',
  'who-is-boss.yaml',
  'who-is-boss.yml',
];

export function findConfigPath(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(path?: string): Config {
  const resolved = path ?? findConfigPath();
  if (!resolved) {
    throw new Error(
      `No who-is-boss config found. Run \`wib init\` to create one, or set --config <path>.`,
    );
  }
  const raw = readFileSync(resolved, 'utf8');
  const parsed = parseYaml(raw) as { roles?: Record<string, unknown> } | null;
  if (!parsed || typeof parsed !== 'object' || !parsed.roles) {
    throw new Error(`Config ${resolved} is missing a top-level "roles" map.`);
  }
  const roles: Partial<Record<Role, AgentSpec>> = {};
  for (const [roleKey, spec] of Object.entries(parsed.roles)) {
    if (!isRole(roleKey)) {
      throw new Error(
        `Unknown role "${roleKey}" in ${resolved}. Allowed: ${ROLES.join(', ')}.`,
      );
    }
    roles[roleKey] = normalizeAgentSpec(roleKey, spec, resolved);
  }
  return { roles, sourcePath: resolved };
}

function normalizeAgentSpec(role: string, spec: unknown, source: string): AgentSpec {
  if (!spec || typeof spec !== 'object') {
    throw new Error(`Role "${role}" in ${source} must be a mapping.`);
  }
  const s = spec as Record<string, unknown>;
  const command = s.command;
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error(`Role "${role}" is missing required string field "command".`);
  }
  const promptMode = s.promptMode ?? 'argv';
  if (promptMode !== 'argv' && promptMode !== 'stdin') {
    throw new Error(`Role "${role}" promptMode must be "argv" or "stdin".`);
  }
  return {
    name: typeof s.name === 'string' ? s.name : command,
    command,
    args: Array.isArray(s.args) ? s.args.map(String) : undefined,
    promptMode,
    env: isStringRecord(s.env) ? s.env : undefined,
    cwd: typeof s.cwd === 'string' ? s.cwd : undefined,
    timeoutSec: typeof s.timeoutSec === 'number' ? s.timeoutSec : undefined,
  };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object') return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string');
}
