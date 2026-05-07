import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CLI = join(REPO_ROOT, 'dist', 'cli.js');

let project: string;

function git(args: string[], cwd?: string) {
  const r = spawnSync('git', args, { cwd, stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr.toString()}`);
  }
}

function runCli(args: string[], cwd: string = project) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

before(() => {
  if (!existsSync(CLI)) {
    throw new Error(
      `CLI build not found at ${CLI}. Run \`npm run build\` first.`,
    );
  }
  project = mkdtempSync(join(tmpdir(), 'wib-cli-'));
  git(['init', '-q', '-b', 'main', project]);
  writeFileSync(join(project, 'a.txt'), 'hi');
  git(['-C', project, 'add', '.']);
  git([
    '-C',
    project,
    '-c',
    'user.email=t@t',
    '-c',
    'user.name=t',
    'commit',
    '-q',
    '-m',
    'init',
  ]);

  // Each role uses a tiny bash mock that echoes its cwd / role / worktree.
  const mock = (extra = '') =>
    `bash -c '${extra}echo cwd=$(pwd) role=$WIB_ROLE worktree=\${WIB_WORKTREE:-none} project=$WIB_PROJECT_ROOT; cat'`;

  writeFileSync(
    join(project, '.who-is-boss.yaml'),
    `roles:
  boss:
    name: mock-boss
    command: bash
    args: ["-c", "echo cwd=$(pwd) role=$WIB_ROLE worktree=\${WIB_WORKTREE:-none}; cat"]
    promptMode: stdin
  reviewer:
    name: mock-reviewer
    command: bash
    args: ["-c", "echo cwd=$(pwd) role=$WIB_ROLE worktree=\${WIB_WORKTREE:-none}; cat"]
    promptMode: stdin
  consultant:
    name: mock-consultant
    command: bash
    args: ["-c", "echo cwd=$(pwd) role=$WIB_ROLE worktree=\${WIB_WORKTREE:-none}; cat"]
    promptMode: stdin
`,
  );
});

after(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('wib --help', () => {
  test('prints usage and lists built-in roles', () => {
    const r = runCli(['--help'], REPO_ROOT);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /who-is-boss/);
    assert.match(r.stdout, /Built-in roles: boss, reviewer, researcher, consultant/);
  });
});

describe('wib list', () => {
  test('shows configured roles and marks unassigned ones', () => {
    const r = runCli(['list']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /boss\s+->\s+mock-boss/);
    assert.match(r.stdout, /reviewer\s+->\s+mock-reviewer/);
    assert.match(r.stdout, /researcher\s+->\s+\(unassigned\)/);
    assert.match(r.stdout, /consultant\s+->\s+mock-consultant/);
  });
});

describe('wib roles', () => {
  test('prints all four built-in role descriptions', () => {
    const r = runCli(['roles'], REPO_ROOT);
    assert.equal(r.status, 0);
    for (const role of ['boss', 'reviewer', 'researcher', 'consultant']) {
      assert.match(r.stdout, new RegExp(`^${role}\\b`, 'm'));
    }
  });
});

describe('wib ask boss', () => {
  test('runs in the project root and writes a transcript', () => {
    const r = runCli(['ask', 'boss', 'do thing']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // Mock prints cwd; for boss it should be the project root (or the
    // private/ resolved equivalent on macOS).
    assert.match(r.stdout, /role=boss/);
    assert.match(r.stdout, /worktree=none/);

    const txDir = join(project, '.wib', 'transcripts');
    const files = readdirSync(txDir).filter((f) => f.includes('boss'));
    assert.ok(files.length >= 1, 'boss transcript should be written');
  });
});

describe('wib ask reviewer', () => {
  test('runs in an ephemeral git worktree (read-only)', () => {
    const r = runCli(['ask', 'reviewer', 'audit']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /role=reviewer/);
    // worktree should be set and NOT equal the project path
    const m = r.stdout.match(/worktree=(\S+)/);
    assert.ok(m && m[1] !== 'none', 'worktree must be set');
    assert.ok(
      !m![1].startsWith(project),
      `worktree (${m![1]}) must live outside the project (${project})`,
    );
    assert.equal(
      existsSync(m![1]),
      false,
      'worktree should be cleaned up after run',
    );
    // Read-only banner should be in the prompt that the mock cat'd back
    assert.match(r.stdout, /DISCARDED/);
  });

  test('refuses on a non-git project', () => {
    const non = mkdtempSync(join(tmpdir(), 'wib-cli-nongit-'));
    try {
      writeFileSync(
        join(non, '.who-is-boss.yaml'),
        `roles:\n  reviewer:\n    command: bash\n    args: ["-c", "echo x"]\n`,
      );
      const r = runCli(['ask', 'reviewer', 'q'], non);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /needs a git repo/);
    } finally {
      rmSync(non, { recursive: true, force: true });
    }
  });
});

describe('wib ask consultant', () => {
  test('runs in .wib/sessions/consultant and gets transcript context', () => {
    // First produce a transcript by running the boss
    runCli(['ask', 'boss', 'note this']);
    const r = runCli(['ask', 'consultant', 'what was just done?']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /role=consultant/);
    assert.match(r.stdout, /\.wib\/sessions\/consultant/);
    // Recent transcript context should have been embedded into the prompt
    // that the mock cat'd back
    assert.match(r.stdout, /Recent project activity/);
    assert.match(r.stdout, /note this/);
  });

  test('does NOT write its own transcript', () => {
    const txDir = join(project, '.wib', 'transcripts');
    const before = readdirSync(txDir).filter((f) => f.includes('consultant'));
    runCli(['ask', 'consultant', 'q']);
    const after = readdirSync(txDir).filter((f) => f.includes('consultant'));
    assert.deepEqual(before, after);
  });
});

describe('wib ask — error handling', () => {
  test('rejects unknown role', () => {
    const r = runCli(['ask', 'janitor', 'q']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown role/);
  });

  test('rejects unconfigured role', () => {
    const r = runCli(['ask', 'researcher', 'q']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not configured/);
  });

  test('rejects empty prompt', () => {
    const r = runCli(['ask', 'boss']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing|empty/);
  });
});

describe('wib init', () => {
  test('writes a starter config and refuses to overwrite', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'wib-init-'));
    try {
      const r1 = runCli(['init'], fresh);
      assert.equal(r1.status, 0);
      assert.ok(existsSync(join(fresh, '.who-is-boss.yaml')));

      const r2 = runCli(['init'], fresh);
      assert.notEqual(r2.status, 0);
      assert.match(r2.stderr, /refusing to overwrite/);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
