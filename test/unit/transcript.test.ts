import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendTranscript,
  recentTranscriptText,
  transcriptDir,
} from '../../src/transcript.js';

let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'wib-tx-'));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('appendTranscript', () => {
  test('writes a markdown file under .wib/transcripts/', () => {
    const file = appendTranscript(dir, {
      timestamp: '2026-05-07T00:00:00.000Z',
      role: 'boss',
      agentName: 'claude',
      prompt: 'hello',
      output: 'world',
      exitCode: 0,
      durationMs: 5,
    });
    assert.ok(
      file.startsWith(transcriptDir(dir)),
      `${file} should be under ${transcriptDir(dir)}`,
    );
    const content = readFileSync(file, 'utf8');
    assert.match(content, /^# boss \(claude\)/);
    assert.match(content, /hello/);
    assert.match(content, /world/);
    assert.match(content, /Exit: 0/);
    assert.match(content, /Duration: 5ms/);
  });

  test('preserves empty output as "(empty)"', () => {
    const file = appendTranscript(dir, {
      timestamp: '2026-05-07T00:00:99.000Z',
      role: 'reviewer',
      agentName: 'codex',
      prompt: 'p',
      output: '',
      exitCode: 0,
      durationMs: 1,
    });
    assert.match(readFileSync(file, 'utf8'), /\(empty\)/);
  });
});

describe('recentTranscriptText', () => {
  test('returns chronologically ordered, concatenated entries', () => {
    appendTranscript(dir, {
      timestamp: '2026-05-07T00:01:00.000Z',
      role: 'reviewer',
      agentName: 'codex',
      prompt: 'p1',
      output: 'o1',
      exitCode: 0,
      durationMs: 1,
    });
    appendTranscript(dir, {
      timestamp: '2026-05-07T00:02:00.000Z',
      role: 'researcher',
      agentName: 'deepseek',
      prompt: 'p2',
      output: 'o2',
      exitCode: 0,
      durationMs: 2,
    });
    const recent = recentTranscriptText(dir, 2);
    assert.match(recent, /# reviewer/);
    assert.match(recent, /# researcher/);
    assert.ok(
      recent.indexOf('# reviewer') < recent.indexOf('# researcher'),
      'older transcripts should appear before newer ones',
    );
  });

  test('respects the N parameter and returns only the most recent N', () => {
    const recent = recentTranscriptText(dir, 1);
    // The most recent file written above is researcher.
    assert.match(recent, /# researcher/);
    assert.doesNotMatch(recent, /# reviewer/);
  });

  test('returns empty string when no transcripts exist', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wib-empty-'));
    try {
      assert.equal(recentTranscriptText(empty, 5), '');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
