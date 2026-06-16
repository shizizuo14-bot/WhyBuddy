export function buildGrokFixPrompt({ taskText, gate }) {
  const failureBlocks = gate.runs
    .filter((run) => run.exitCode !== 0 || run.timedOut || run.spawnError)
    .map((run, index) => {
      return [
        `## 失败 Gate ${index + 1}: ${run.label}`,
        '',
        `- exitCode: ${run.exitCode}`,
        `- timedOut: ${run.timedOut}`,
        run.spawnError ? `- spawnError: ${run.spawnError}` : '',
        '',
        '### stdout',
        '```text',
        truncate(run.stdout || '', 6000),
        '```',
        '',
        '### stderr',
        '```text',
        truncate(run.stderr || '', 6000),
        '```',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');

  return [
    '# AgentLoop Grok 修复请求',
    '',
    '你是修复执行者。请根据任务目标和失败 gate 修改当前仓库文件。',
    '',
    '## 任务',
    '',
    taskText,
    '',
    '## Safety Guardrails',
    '',
    '- Do not delete, weaken, skip, or rewrite tests to make the gate pass.',
    '- Do not change gate commands, test scripts, CI config, or test runner config unless the task explicitly asks for that.',
    '- Do not bypass assertions, mark tests skipped/only, lower coverage, or replace checks with placeholders.',
    '',
    '## 失败信息',
    '',
    failureBlocks || '没有捕获到失败详情。',
    '',
    '## 规则',
    '',
    '- 只修复和任务/gate 直接相关的问题。',
    '- 不要提交、不要 git add、不要改写历史。',
    '- 不要做无关重构。',
    '- 如果无法修复，请不要伪造成功。',
    '- 修改完成后，只输出 JSON，不要 markdown fence。',
    '',
    '## 输出格式',
    '',
    '{"verdict":"changed|blocked","summary":"简短说明","files":["相对路径"]}',
  ].join('\n');
}

function truncate(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...<truncated>`;
}
