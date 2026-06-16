import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProbeReport } from '../src/report.js';

test('builds a Chinese-first probe report with English labels', () => {
  const report = buildProbeReport({
    runId: '2026-06-16T08-24-33-531Z',
    agents: {
      codex: 'C:\\tools\\codex.exe',
      grok: 'C:\\tools\\grok.exe',
    },
    tmpRepo: 'C:\\repo\\tmp\\probe-repo',
    commandResults: [
      {
        label: 'codex review --help',
        result: {
          exitCode: 0,
          timedOut: false,
          stdout: 'help',
          stderr: '',
        },
        parsed: null,
      },
      {
        label: 'grok --prompt-file ... --output-format json',
        result: {
          exitCode: 0,
          timedOut: false,
          stdout: '{"ok":true}',
          stderr: 'warning',
        },
        parsed: { ok: true },
      },
    ],
    parserRecommendation: {
      codexParsed: null,
      grokParsed: { text: '{"ok":true}' },
      grokTextParsed: { ok: true },
    },
  });

  assert.match(report, /^# AgentLoop Phase 0 探测报告 \/ Probe Report/m);
  assert.match(report, /^运行 ID \/ Run ID: `2026-06-16T08-24-33-531Z`$/m);
  assert.match(report, /^## 代理 \/ Agents$/m);
  assert.match(report, /^## 探测仓库 \/ Probe Repo$/m);
  assert.match(report, /^## 命令结果 \/ Command Results$/m);
  assert.match(report, /^- 退出码 \/ Exit code: `0`$/m);
  assert.match(report, /^- 已超时 \/ Timed out: `false`$/m);
  assert.match(report, /^- 已解析 JSON \/ Parsed JSON: `yes`$/m);
  assert.match(report, /^## 解析器建议 \/ Parser Recommendation$/m);
  assert.match(report, /Codex review 解析策略 \/ Codex review parse strategy/);
  assert.match(report, /^## 下一步 \/ Next Step$/m);
});
