import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFailureCountFromText,
  madeGateProgress,
  summarizeGateProgress,
} from '../src/gateProgress.js';

test('extractFailureCountFromText reads common test runner failure summaries', () => {
  assert.equal(extractFailureCountFromText('Tests: 50 failed, 10 passed'), 50);
  assert.equal(extractFailureCountFromText('1 failed, 59 passed'), 1);
  assert.equal(extractFailureCountFromText('failed: 3\npassed: 12'), 3);
  assert.equal(extractFailureCountFromText('2 failures, 8 successes'), 2);
  assert.equal(extractFailureCountFromText('all green'), null);
});

test('madeGateProgress uses parsed inner failure count before command failure count', () => {
  const previous = gate(false, 1, 'Tests: 50 failed, 10 passed');
  const current = gate(false, 1, 'Tests: 1 failed, 59 passed');

  assert.deepEqual(summarizeGateProgress(previous), {
    commandFailureCount: 1,
    innerFailureCount: 50,
    effectiveFailureCount: 50,
  });
  assert.equal(madeGateProgress(previous, current), true);
});

function gate(ok, failureCount, stderr) {
  return {
    ok,
    failureCount,
    runs: [
      {
        exitCode: ok ? 0 : 1,
        timedOut: false,
        spawnError: null,
        stdout: '',
        stderr,
      },
    ],
  };
}
