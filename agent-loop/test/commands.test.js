import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexReviewArgs, buildGrokJsonArgs } from '../src/commands.js';

test('codex review args use current working directory and uncommitted diff', () => {
  assert.deepEqual(buildCodexReviewArgs(), ['review', '--uncommitted']);
});

test('grok json args request approved non-planning turns in the target cwd', () => {
  assert.deepEqual(buildGrokJsonArgs({ promptFile: 'prompt.md', cwd: 'repo' }), [
    '--prompt-file',
    'prompt.md',
    '--output-format',
    'json',
    '--cwd',
    'repo',
    '--max-turns',
    '4',
    '--no-plan',
    '--always-approve',
  ]);
});

test('grok json args allow overriding max turns', () => {
  assert.deepEqual(buildGrokJsonArgs({ promptFile: 'prompt.md', cwd: 'repo', maxTurns: 7 }), [
    '--prompt-file',
    'prompt.md',
    '--output-format',
    'json',
    '--cwd',
    'repo',
    '--max-turns',
    '7',
    '--no-plan',
    '--always-approve',
  ]);
});
