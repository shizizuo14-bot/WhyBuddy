import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLoopArgs } from '../src/loopArgs.js';
import { evaluateGate } from '../src/gates.js';
import { decideNextState } from '../src/stateMachine.js';
import { hasDiffChanged } from '../src/diff.js';
import { buildGrokFixPrompt } from '../src/grokPrompt.js';
import { getWorktreePath } from '../src/worktree.js';

test('parseLoopArgs requires cwd, task, and at least one gate', () => {
  assert.deepEqual(
    parseLoopArgs([
      '--cwd',
      'C:\\repo',
      '--task',
      'task.md',
      '--gate',
      'npm test',
      '--gate',
      'npm run check',
    ]),
    {
      cwd: 'C:\\repo',
      task: 'task.md',
      gates: ['npm test', 'npm run check'],
      autoFix: false,
      createWorktree: null,
      fixCwd: null,
      skipReview: false,
      timeoutMs: 120000,
      maxIterations: 3,
      grokMaxTurns: 4,
      grokMaxRetries: 1,
      retryBackoffMs: 1000,
      pauseBeforeFix: false,
      pauseAfterIteration: false,
      guardTests: false,
      resume: null,
    }
  );

  assert.throws(() => parseLoopArgs(['--cwd', 'C:\\repo']), /--task is required/);
  assert.throws(() => parseLoopArgs(['--cwd', 'C:\\repo', '--task', 'task.md']), /at least one --gate is required/);
});

test('parseLoopArgs supports skip-review for gate-only runs', () => {
  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--skip-review',
  ]);

  assert.equal(parsed.skipReview, true);
});

test('parseLoopArgs supports pause and resume controls', () => {
  const paused = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--pause-before-fix',
  ]);

  assert.equal(paused.pauseBeforeFix, true);

  const pausedAfterIteration = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--pause-after-iteration',
  ]);

  assert.equal(pausedAfterIteration.pauseAfterIteration, true);

  const resumed = parseLoopArgs([
    '--resume',
    'C:\\repo\\.agent-loop\\latest\\state.json',
  ]);

  assert.equal(resumed.resume, 'C:\\repo\\.agent-loop\\latest\\state.json');
  assert.equal(resumed.cwd, null);
  assert.deepEqual(resumed.gates, []);
});

test('parseLoopArgs supports test tamper guard', () => {
  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--guard-tests',
  ]);

  assert.equal(parsed.guardTests, true);
});

test('parseLoopArgs supports max iteration budget', () => {
  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--max-iterations',
    '5',
  ]);

  assert.equal(parsed.maxIterations, 5);
  assert.throws(
    () => parseLoopArgs([
      '--cwd',
      'C:\\repo',
      '--task',
      'task.md',
      '--gate',
      'npm test',
      '--max-iterations',
      '0',
    ]),
    /--max-iterations must be a positive integer/
  );
});

test('parseLoopArgs supports Grok max turns budget', () => {
  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--grok-max-turns',
    '6',
  ]);

  assert.equal(parsed.grokMaxTurns, 6);
  assert.throws(
    () => parseLoopArgs([
      '--cwd',
      'C:\\repo',
      '--task',
      'task.md',
      '--gate',
      'npm test',
      '--grok-max-turns',
      '0',
    ]),
    /--grok-max-turns must be a positive integer/
  );
});

test('parseLoopArgs supports Grok retry budget', () => {
  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--grok-max-retries',
    '2',
    '--retry-backoff-ms',
    '50',
  ]);

  assert.equal(parsed.grokMaxRetries, 2);
  assert.equal(parsed.retryBackoffMs, 50);
  assert.throws(
    () => parseLoopArgs([
      '--cwd',
      'C:\\repo',
      '--task',
      'task.md',
      '--gate',
      'npm test',
      '--grok-max-retries',
      '-1',
    ]),
    /--grok-max-retries must be a non-negative integer/
  );
  assert.throws(
    () => parseLoopArgs([
      '--cwd',
      'C:\\repo',
      '--task',
      'task.md',
      '--gate',
      'npm test',
      '--retry-backoff-ms',
      '-1',
    ]),
    /--retry-backoff-ms must be a non-negative integer/
  );
});

test('parseLoopArgs requires explicit fix cwd when auto-fix is enabled', () => {
  assert.throws(
    () => parseLoopArgs([
      '--cwd',
      'C:\\repo',
      '--task',
      'task.md',
      '--gate',
      'npm test',
      '--auto-fix',
    ]),
    /--fix-cwd is required when --auto-fix is enabled/
  );

  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--fix-cwd',
    'C:\\repo-worktree',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--auto-fix',
  ]);

  assert.equal(parsed.fixCwd, 'C:\\repo-worktree');
});

test('parseLoopArgs allows auto-fix with create-worktree instead of fix-cwd', () => {
  const parsed = parseLoopArgs([
    '--cwd',
    'C:\\repo',
    '--create-worktree',
    'agentloop-fix-1',
    '--task',
    'task.md',
    '--gate',
    'npm test',
    '--auto-fix',
  ]);

  assert.equal(parsed.createWorktree, 'agentloop-fix-1');
  assert.equal(parsed.fixCwd, null);
});

test('getWorktreePath creates project-local hidden worktree paths', () => {
  assert.equal(
    getWorktreePath({ repoRoot: 'C:\\repo', name: 'agentloop-fix-1' }),
    'C:\\repo\\.worktrees\\agentloop-fix-1'
  );
  assert.throws(() => getWorktreePath({ repoRoot: 'C:\\repo', name: '..\\bad' }), /invalid worktree name/);
});

test('evaluateGate marks all-zero commands green and preserves raw runs', async () => {
  const gate = await evaluateGate({
    cwd: 'C:\\repo',
    commands: ['ok one', 'ok two'],
    run: async (command, args, options) => ({
      command,
      args,
      cwd: options.cwd,
      exitCode: 0,
      timedOut: false,
      stdout: `${args.join(' ')} passed`,
      stderr: '',
    }),
  });

  assert.equal(gate.ok, true);
  assert.equal(gate.failureCount, 0);
  assert.equal(gate.runs.length, 2);
  assert.match(gate.runs[0].stdout, /ok one passed/);
});

test('evaluateGate marks non-zero and timed-out commands red', async () => {
  const gate = await evaluateGate({
    cwd: 'C:\\repo',
    commands: ['ok', 'fail', 'slow'],
    run: async (_command, args, options) => ({
      command: _command,
      args,
      cwd: options.cwd,
      exitCode: args.at(-1) === 'fail' ? 1 : 0,
      timedOut: args.at(-1) === 'slow',
      stdout: '',
      stderr: args.at(-1) === 'fail' ? 'boom' : '',
    }),
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.failureCount, 2);
});

test('decideNextState keeps red baseline safe when autoFix is disabled', () => {
  assert.equal(
    decideNextState({ phase: 'BASELINE_GATE_RESULT', gateOk: false, autoFix: false }),
    'HALT_HUMAN'
  );
  assert.equal(
    decideNextState({ phase: 'BASELINE_GATE_RESULT', gateOk: false, autoFix: true }),
    'GROK_FIX'
  );
  assert.equal(
    decideNextState({ phase: 'BASELINE_GATE_RESULT', gateOk: true, autoFix: false }),
    'CODEX_REVIEW'
  );
});

test('hasDiffChanged detects empty and changed diff snapshots', () => {
  assert.equal(hasDiffChanged('', ''), false);
  assert.equal(hasDiffChanged('diff --git a/a b/a\n-old', 'diff --git a/a b/a\n-old'), false);
  assert.equal(hasDiffChanged('', 'diff --git a/a b/a\n+new'), true);
});

test('buildGrokFixPrompt includes task, gate failure, and safety rules', () => {
  const prompt = buildGrokFixPrompt({
    taskText: '修复 Python baseline',
    gate: {
      runs: [
        {
          label: 'pytest',
          exitCode: 1,
          timedOut: false,
          stdout: '1 failed',
          stderr: 'AssertionError',
        },
      ],
    },
  });

  assert.match(prompt, /修复 Python baseline/);
  assert.match(prompt, /pytest/);
  assert.match(prompt, /AssertionError/);
  assert.match(prompt, /Do not delete, weaken, skip, or rewrite tests/);
  assert.match(prompt, /Do not change gate commands, test scripts, CI config/);
  assert.match(prompt, /Do not bypass assertions/);
  assert.match(prompt, /不要提交/);
  assert.match(prompt, /只输出 JSON/);
});
