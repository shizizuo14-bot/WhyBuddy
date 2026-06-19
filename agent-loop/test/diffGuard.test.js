import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDiffGuard } from '../src/diffGuard.js';

test('analyzeDiffGuard flags protected test file edits and net deletions', () => {
  const result = analyzeDiffGuard(`diff --git a/src/example.test.js b/src/example.test.js
index 1111111..2222222 100644
--- a/src/example.test.js
+++ b/src/example.test.js
@@ -1,5 +1,3 @@
-test('keeps strict behavior', () => {
-  assert.equal(value, 2);
-});
+test('keeps strict behavior', () => {});
`);

  assert.equal(result.hasFindings, true);
  assert.deepEqual(result.files.map((file) => file.path), ['src/example.test.js']);
  assert.equal(result.files[0].protected, true);
  assert.equal(result.files[0].netDeletedLines, 2);
  assert.equal(result.findings.some((finding) => finding.reason === 'protected_path_changed'), true);
  assert.equal(result.findings.some((finding) => finding.reason === 'protected_file_net_deletion'), true);
});

test('analyzeDiffGuard flags package test script and test config edits', () => {
  const result = analyzeDiffGuard(`diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,5 +1,5 @@
 {
   "scripts": {
-    "test": "vitest run"
+    "test": "echo skipped"
   }
 }
diff --git a/vitest.config.ts b/vitest.config.ts
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -1 +1 @@
-export default {};
+export default { test: { passWithNoTests: true } };
`);

  assert.equal(result.hasFindings, true);
  assert.deepEqual(result.files.map((file) => file.path), ['package.json', 'vitest.config.ts']);
  assert.equal(result.findings.filter((finding) => finding.reason === 'protected_path_changed').length, 2);
});

test('analyzeDiffGuard ignores ordinary source edits', () => {
  const result = analyzeDiffGuard(`diff --git a/src/example.js b/src/example.js
--- a/src/example.js
+++ b/src/example.js
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`);

  assert.equal(result.hasFindings, false);
  assert.deepEqual(result.files, [
    {
      path: 'src/example.js',
      protected: false,
      addedLines: 1,
      deletedLines: 1,
      netDeletedLines: 0,
      reasons: [],
    },
  ]);
});

test('analyzeDiffGuard supports policy protected globs', () => {
  const result = analyzeDiffGuard(`diff --git a/docs/contract.md b/docs/contract.md
--- a/docs/contract.md
+++ b/docs/contract.md
@@ -1 +1,2 @@
 contract
+changed
`, {
    policy: {
      protectedGlobs: ['docs/*.md'],
    },
  });

  assert.equal(result.hasFindings, true);
  assert.equal(result.findings[0].reason, 'protected_path_changed');
  assert.equal(result.findings[0].path, 'docs/contract.md');
});

test('analyzeDiffGuard can protect or allow task markdown edits by policy', () => {
  const diff = `diff --git a/agent-loop/tasks/task-a.md b/agent-loop/tasks/task-a.md
--- a/agent-loop/tasks/task-a.md
+++ b/agent-loop/tasks/task-a.md
@@ -1 +1,2 @@
 task
+status
`;

  const protectedResult = analyzeDiffGuard(diff, {
    policy: { protectTaskDocs: true },
  });
  assert.equal(protectedResult.hasFindings, true);
  assert.equal(protectedResult.findings[0].reason, 'protected_task_doc_changed');

  const allowedResult = analyzeDiffGuard(diff, {
    policy: { protectTaskDocs: false },
  });
  assert.equal(allowedResult.hasFindings, false);
});
