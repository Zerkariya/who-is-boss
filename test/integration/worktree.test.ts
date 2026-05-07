import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isGitRepo, gitRoot, createWorktree } from '../../src/worktree.js';

let repo: string;

function git(args: string[], cwd?: string) {
  const r = spawnSync('git', args, { cwd, stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${r.stderr.toString()}`,
    );
  }
  return r.stdout.toString();
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'wib-wt-'));
  git(['init', '-q', '-b', 'main', repo]);
  writeFileSync(join(repo, 'a.txt'), 'hi');
  git(['-C', repo, 'add', '.']);
  git([
    '-C',
    repo,
    '-c',
    'user.email=t@t',
    '-c',
    'user.name=t',
    'commit',
    '-q',
    '-m',
    'init',
  ]);
});

after(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('isGitRepo', () => {
  test('returns true for a git repo', () => {
    assert.equal(isGitRepo(repo), true);
  });

  test('returns false for a plain directory', () => {
    const non = mkdtempSync(join(tmpdir(), 'wib-nongit-'));
    try {
      assert.equal(isGitRepo(non), false);
    } finally {
      rmSync(non, { recursive: true, force: true });
    }
  });
});

describe('gitRoot', () => {
  test('returns the repository top-level', () => {
    const root = gitRoot(repo);
    // /tmp/foo on macOS resolves to /private/tmp/foo; both are valid here.
    assert.ok(
      root === repo || root === `/private${repo}` || repo === `/private${root}`,
      `gitRoot returned ${root}, expected something matching ${repo}`,
    );
  });

  test('throws on non-git directory', () => {
    const non = mkdtempSync(join(tmpdir(), 'wib-nongit-'));
    try {
      assert.throws(() => gitRoot(non), /not a git repo/);
    } finally {
      rmSync(non, { recursive: true, force: true });
    }
  });
});

describe('createWorktree', () => {
  test('creates an isolated worktree at HEAD; cleanup removes it', () => {
    const wt = createWorktree(repo);
    try {
      assert.ok(existsSync(wt.path), 'worktree path should exist');
      assert.ok(
        existsSync(join(wt.path, 'a.txt')),
        'worktree should contain HEAD files',
      );
      assert.ok(
        !wt.path.startsWith(repo),
        'worktree must NOT live inside the origin repo',
      );
    } finally {
      wt.cleanup();
    }
    assert.equal(existsSync(wt.path), false, 'cleanup must remove the dir');
  });

  test('two concurrent worktrees get different paths', () => {
    const wt1 = createWorktree(repo);
    const wt2 = createWorktree(repo);
    try {
      assert.notEqual(wt1.path, wt2.path);
    } finally {
      wt1.cleanup();
      wt2.cleanup();
    }
  });

  test('cleanup is idempotent', () => {
    const wt = createWorktree(repo);
    wt.cleanup();
    // Second call must not throw.
    wt.cleanup();
    assert.equal(existsSync(wt.path), false);
  });

  test('refuses to create a worktree on a repo with no commits', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wib-emptygit-'));
    try {
      git(['init', '-q', '-b', 'main', empty]);
      assert.throws(() => createWorktree(empty), /no commits/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
