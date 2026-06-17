import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNameStatusLines, parseWorktreeListPorcelain } from '../src/worktree.js';

test('parseNameStatusLines handles rename entries', () => {
  const entries = parseNameStatusLines('M\tagent-loop/src/worktree.js\nR100\told.md\tnew.md\n');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { code: 'M', path: 'agent-loop/src/worktree.js' });
  assert.deepEqual(entries[1], { code: 'R', oldPath: 'old.md', newPath: 'new.md' });
});

test('parseWorktreeListPorcelain parses git worktree list output', () => {
  const stdout = [
    'worktree C:/repo',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree C:/repo/.worktrees/task-a',
    'HEAD def456',
    'branch refs/heads/agent-loop/task-a',
    '',
  ].join('\n');

  const worktrees = parseWorktreeListPorcelain(stdout);
  assert.equal(worktrees.length, 2);
  assert.equal(worktrees[1].branch, 'refs/heads/agent-loop/task-a');
});