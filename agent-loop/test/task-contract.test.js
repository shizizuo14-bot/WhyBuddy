import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTaskAdmission, parseSuccessCriteria } from '../src/taskContract.js';

test('task admission accepts English acceptance criteria heading', () => {
  const taskText = [
    '# Runtime takeover task',
    '',
    '## Acceptance criteria',
    '- Python returns a stable ownership envelope.',
    '- Node bridge preserves fallback semantics.',
    '',
    '## Allowed files',
    '- service.py',
  ].join('\n');

  assert.deepEqual(parseSuccessCriteria(taskText), {
    hasCriteria: true,
    items: [
      'Python returns a stable ownership envelope.',
      'Node bridge preserves fallback semantics.',
    ],
  });
  assert.equal(checkTaskAdmission(taskText).admissible, true);
});
