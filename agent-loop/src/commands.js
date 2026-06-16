export function buildCodexReviewArgs({ uncommitted = true, prompt } = {}) {
  const args = ['review'];
  if (uncommitted) args.push('--uncommitted');
  if (prompt) args.push(prompt);
  return args;
}

export function buildGrokJsonArgs({ promptFile, cwd, maxTurns = 4 } = {}) {
  if (!promptFile) throw new Error('promptFile is required');
  if (!cwd) throw new Error('cwd is required');
  return [
    '--prompt-file',
    promptFile,
    '--output-format',
    'json',
    '--cwd',
    cwd,
    '--max-turns',
    String(maxTurns),
    '--no-plan',
    '--always-approve',
  ];
}
