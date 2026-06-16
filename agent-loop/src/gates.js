import { runProcess } from './runProcess.js';

export async function evaluateGate({
  cwd,
  commands,
  timeoutMs = 120000,
  run = runProcess,
}) {
  const runs = [];
  for (const commandLine of commands) {
    const result = await run('powershell.exe', ['-NoProfile', '-Command', commandLine], {
      cwd,
      timeoutMs,
    });
    runs.push({
      label: commandLine,
      ...result,
    });
  }

  const failureCount = runs.filter((runResult) => {
    return runResult.exitCode !== 0 || runResult.timedOut || runResult.spawnError;
  }).length;

  return {
    ok: failureCount === 0,
    failureCount,
    runs,
  };
}
