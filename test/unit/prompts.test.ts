import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { wrapPrompt } from '../../src/prompts.js';

describe('wrapPrompt(boss)', () => {
  test('returns the user prompt unchanged', () => {
    assert.equal(wrapPrompt('boss', 'do thing', {}), 'do thing');
  });
});

describe('wrapPrompt(reviewer)', () => {
  test('includes role banner, worktree path, origin path, and the user request', () => {
    const out = wrapPrompt('reviewer', 'audit plan A', {
      worktreePath: '/tmp/wt-xyz',
      originPath: '/repo',
    });
    assert.match(out, /role=reviewer/);
    assert.match(out, /\/tmp\/wt-xyz/);
    assert.match(out, /\/repo/);
    assert.match(out, /DISCARDED/);
    assert.match(out, /--- User request ---/);
    assert.ok(out.endsWith('audit plan A'));
  });

  test('falls back to read-only language when no worktree given', () => {
    const out = wrapPrompt('reviewer', 'audit', {});
    assert.match(out, /read-only/i);
    assert.doesNotMatch(out, /isolated git worktree/);
  });

  test('forbids writing production code', () => {
    const out = wrapPrompt('reviewer', 'q', {});
    assert.match(out, /NOT write production code/);
  });
});

describe('wrapPrompt(researcher)', () => {
  test('scopes researcher to outside-world sources', () => {
    const out = wrapPrompt('researcher', 'find prior art', {
      worktreePath: '/tmp/wt',
      originPath: '/repo',
    });
    assert.match(out, /role=researcher/);
    assert.match(out, /community projects/);
    assert.match(out, /OUTSIDE world/);
    assert.match(out, /find prior art/);
  });

  test('tells researcher to defer local-only questions to reviewer', () => {
    const out = wrapPrompt('researcher', 'q', {});
    assert.match(out, /reviewer/);
    assert.match(out, /stop/);
  });
});

describe('wrapPrompt(consultant)', () => {
  test('without recent transcripts, says no recent activity', () => {
    const out = wrapPrompt('consultant', 'what is X?', {});
    assert.match(out, /role=consultant/);
    assert.match(out, /No recent boss\/reviewer\/researcher activity/);
    assert.match(out, /what is X\?/);
    assert.match(out, /WIB_PROJECT_ROOT/);
  });

  test('with recent transcripts, embeds them under a delimiter', () => {
    const transcripts = '# boss (claude)\nTime: t\n## Output\noutput-A';
    const out = wrapPrompt('consultant', 'q?', { recentTranscripts: transcripts });
    assert.match(out, /Recent project activity/);
    assert.match(out, /output-A/);
    assert.match(out, /End of activity/);
    // The user's question must come AFTER the transcript block.
    assert.ok(out.indexOf('q?') > out.indexOf('output-A'));
  });
});
