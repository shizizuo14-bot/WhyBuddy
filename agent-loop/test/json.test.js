import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFirstJsonObject } from '../src/json.js';

test('extracts fenced json object', () => {
  const input = [
    'review follows',
    '```json',
    '{"verdict":"pass","findings":[]}',
    '```',
    'done',
  ].join('\n');

  assert.deepEqual(extractFirstJsonObject(input), {
    verdict: 'pass',
    findings: [],
  });
});

test('extracts first balanced object from mixed text', () => {
  const input = 'prefix {"verdict":"blocked","note":"brace } inside string"} suffix {"ignored":true}';

  assert.deepEqual(extractFirstJsonObject(input), {
    verdict: 'blocked',
    note: 'brace } inside string',
  });
});

test('returns null when no parseable object exists', () => {
  assert.equal(extractFirstJsonObject('no json here'), null);
});
