import { runProcess } from './runProcess.js';

export async function captureDiff({ cwd, timeoutMs = 60000, run = runProcess }) {
  const result = await run('git', ['diff', '--binary'], { cwd, timeoutMs });
  return {
    text: result.stdout || '',
    run: result,
  };
}

export function hasDiffChanged(before, after) {
  return normalizeDiff(before) !== normalizeDiff(after) && normalizeDiff(after).length > 0;
}

function normalizeDiff(value) {
  return String(value || '').trim();
}
