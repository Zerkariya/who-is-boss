import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../../src/agent.js';

describe('runAgent — argv mode', () => {
  test('appends prompt as the last argv', async () => {
    const r = await runAgent(
      { name: 'echo', command: 'echo', args: ['prefix'] },
      'hello',
    );
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.trim(), 'prefix hello');
  });
});

describe('runAgent — stdin mode', () => {
  test('pipes prompt via stdin', async () => {
    const r = await runAgent(
      { name: 'cat', command: 'cat', promptMode: 'stdin' },
      'piped content',
    );
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, 'piped content');
  });
});

describe('runAgent — env / cwd', () => {
  test('injects env vars into the child', async () => {
    const r = await runAgent(
      {
        name: 'sh',
        command: 'sh',
        args: ['-c', 'printf %s "$WIB_TEST_VAR"'],
        env: { WIB_TEST_VAR: 'injected-value' },
      },
      '',
    );
    assert.equal(r.stdout, 'injected-value');
  });

  test('honors cwd', async () => {
    const r = await runAgent(
      {
        name: 'sh',
        command: 'sh',
        args: ['-c', 'pwd'],
        cwd: '/tmp',
        promptMode: 'stdin',
      },
      '',
    );
    // macOS resolves /tmp to /private/tmp; Linux keeps /tmp.
    assert.match(r.stdout.trim(), /\/tmp$/);
  });
});

describe('runAgent — exit codes', () => {
  test('captures non-zero exit', async () => {
    const r = await runAgent(
      { name: 'sh', command: 'sh', args: ['-c', 'exit 42'] },
      '',
    );
    assert.equal(r.exitCode, 42);
  });

  test('captures stderr separately', async () => {
    const r = await runAgent(
      {
        name: 'sh',
        command: 'sh',
        args: ['-c', 'echo OUT; echo ERR >&2'],
      },
      '',
    );
    assert.match(r.stdout, /OUT/);
    assert.match(r.stderr, /ERR/);
  });
});

describe('runAgent — timeouts', () => {
  test('rejects when child exceeds timeoutSec', async () => {
    await assert.rejects(
      runAgent(
        {
          name: 'sleep',
          command: 'sleep',
          args: ['10'],
          promptMode: 'stdin',
          timeoutSec: 1,
        },
        '',
      ),
      /timed out/,
    );
  });
});

describe('runAgent — spawn errors', () => {
  test('rejects with a clear error when binary is missing', async () => {
    await assert.rejects(
      runAgent(
        { name: 'nope', command: '/this/binary/does/not/exist/anywhere' },
        '',
      ),
      /Failed to spawn/,
    );
  });
});
