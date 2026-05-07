import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Worktree {
  /** Absolute path to the temporary worktree. */
  path: string;
  /** The git repo root the worktree was forked from. */
  origin: string;
  /** Remove the worktree from disk and from git's worktree registry. */
  cleanup: () => void;
}

export function isGitRepo(cwd: string): boolean {
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return r.status === 0 && r.stdout.toString().trim() === 'true';
}

export function gitRoot(cwd: string): string {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    throw new Error(`not a git repo: ${cwd}\n${r.stderr.toString()}`);
  }
  return r.stdout.toString().trim();
}

function hasCommits(repo: string): boolean {
  const r = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', 'HEAD'], {
    stdio: 'ignore',
  });
  return r.status === 0;
}

/**
 * Fork a temporary detached worktree at HEAD. Caller must invoke `cleanup()`
 * (or the registered exit handler will best-effort clean up).
 */
export function createWorktree(cwd: string, prefix = 'wib-'): Worktree {
  const origin = gitRoot(cwd);
  if (!hasCommits(origin)) {
    throw new Error(
      `git repo at ${origin} has no commits yet. ` +
        `Create at least one commit before using reviewer/researcher.`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const r = spawnSync(
    'git',
    ['-C', origin, 'worktree', 'add', '--detach', dir, 'HEAD'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`git worktree add failed: ${r.stderr.toString()}`);
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    spawnSync('git', ['-C', origin, 'worktree', 'remove', '--force', dir], {
      stdio: 'ignore',
    });
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  };

  // Best-effort cleanup if the process exits without running finally.
  const onExit = () => cleanup();
  process.once('exit', onExit);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  return { path: dir, origin, cleanup };
}
