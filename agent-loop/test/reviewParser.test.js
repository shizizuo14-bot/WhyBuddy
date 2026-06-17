import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentReviewOutput, reviewVerdictAllowsDone } from '../src/reviewParser.js';

test('parseAgentReviewOutput reads nested grok json text', () => {
  const stdout = JSON.stringify({
    text: '{"verdict":"pass","summary":"ok","findings":[]}',
    stopReason: 'Cancelled',
  });

  const parsed = parseAgentReviewOutput(stdout);
  assert.equal(parsed.verdict, 'pass');
  assert.equal(reviewVerdictAllowsDone(parsed), true);
});

test('reviewVerdictAllowsDone rejects needs_changes', () => {
  assert.equal(reviewVerdictAllowsDone({ verdict: 'needs_changes' }), false);
});