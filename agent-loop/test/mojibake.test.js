import test from 'node:test';
import assert from 'node:assert/strict';
import { findMojibakeInText } from '../src/mojibake.js';

test('findMojibakeInText flags common UTF-8 mojibake sequences', () => {
  const findings = findMojibakeInText({
    file: 'test.py',
    text: 'goal = "鍒嗘瀽鏉冮檺绯荤粺"\nsummary = "正常中文"',
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
  assert.match(findings[0].excerpt, /鍒嗘瀽/);
});

test('findMojibakeInText ignores normal Chinese and ASCII', () => {
  const findings = findMojibakeInText({
    file: 'test.py',
    text: 'goal = "分析权限系统风险"\nsummary = "normal ascii"',
  });

  assert.deepEqual(findings, []);
});
