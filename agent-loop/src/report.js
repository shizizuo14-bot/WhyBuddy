export function buildProbeReport({
  runId,
  agents,
  tmpRepo,
  commandResults,
  parserRecommendation,
}) {
  const lines = [];
  lines.push('# AgentLoop Phase 0 探测报告 / Probe Report');
  lines.push('');
  lines.push(`运行 ID / Run ID: \`${runId}\``);
  lines.push('');
  lines.push('## 代理 / Agents');
  lines.push('');
  lines.push(`- Codex: ${agents.codex ? `\`${agents.codex}\`` : '**NOT FOUND**'}`);
  lines.push(`- Grok: ${agents.grok ? `\`${agents.grok}\`` : '**NOT FOUND**'}`);
  lines.push('');
  lines.push('## 探测仓库 / Probe Repo');
  lines.push('');
  lines.push(`- 路径 / Path: \`${tmpRepo}\``);
  lines.push('- 变更 / Change: one-line README edit after initial commit');
  lines.push('');
  lines.push('## 命令结果 / Command Results');
  lines.push('');

  for (const item of commandResults) {
    appendRun(lines, item.label, item.result, item.parsed);
  }

  const { codexParsed, grokParsed, grokTextParsed } = parserRecommendation;
  lines.push('## 解析器建议 / Parser Recommendation');
  lines.push('');
  lines.push(
    `- Codex review 解析策略 / Codex review parse strategy: ${
      codexParsed
        ? 'stdout contains parseable JSON.'
        : 'treat as markdown or mixed natural language unless prompt experiments produce JSON.'
    }`
  );
  lines.push(
    `- Grok JSON 解析策略 / Grok JSON parse strategy: ${
      grokParsed
        ? 'parse the outer CLI envelope from stdout.'
        : 'inspect raw stdout; no directly parseable envelope was found.'
    }`
  );
  lines.push(
    `- Grok text 解析策略 / Grok text parse strategy: ${
      grokTextParsed
        ? 'parse nested JSON from the envelope text field.'
        : 'treat nested text parse failure as HALT_HUMAN for strict loops.'
    }`
  );
  lines.push('- 解析失败 / Parse failure: HALT_HUMAN, do not infer pass/fail.');
  lines.push('- 原始流 / Raw streams: always persist stdout, stderr, and exit code before parsing.');
  lines.push('');
  lines.push('## 下一步 / Next Step');
  lines.push('');
  lines.push('Use this report to design the parser and prompt templates for the single-loop MVP.');
  return lines.join('\n');
}

function appendRun(lines, label, result, parsed) {
  lines.push(`### ${label}`);
  lines.push('');
  lines.push(`- 退出码 / Exit code: \`${result.exitCode}\``);
  lines.push(`- 已超时 / Timed out: \`${result.timedOut}\``);
  lines.push(`- Stdout bytes: \`${Buffer.byteLength(result.stdout || '', 'utf8')}\``);
  lines.push(`- Stderr bytes: \`${Buffer.byteLength(result.stderr || '', 'utf8')}\``);
  lines.push(`- 已解析 JSON / Parsed JSON: \`${parsed ? 'yes' : 'no'}\``);
  if (result.spawnError) lines.push(`- Spawn error: \`${result.spawnError}\``);
  lines.push('');
}
