export function buildLoopReport({
  runId,
  cwd,
  fixCwd,
  task,
  gates,
  baselineGate,
  finalState,
  grokFix,
  codexReview,
  iterations = [],
  maxIterations = 3,
}) {
  const lines = [];
  lines.push('# AgentLoop Loop Report');
  lines.push('');
  lines.push(`Run ID: \`${runId}\``);
  lines.push(`Target cwd: \`${cwd}\``);
  lines.push(`Fix cwd: \`${fixCwd || cwd}\``);
  lines.push(`Task file: \`${task}\``);
  lines.push(`Final state: \`${finalState}\``);
  lines.push(`Max iterations: \`${maxIterations}\``);
  lines.push('');

  lines.push('## Baseline Gate');
  lines.push('');
  if (baselineGate) {
    lines.push(`- Result: \`${baselineGate.ok ? 'green' : 'red'}\``);
    lines.push(`- Failure count: \`${baselineGate.failureCount}\``);
    if (baselineGate.progress) {
      lines.push(`- Effective failure count: \`${baselineGate.progress.effectiveFailureCount}\``);
    }
  } else {
    lines.push('- Not run.');
  }
  lines.push('');

  if (gates?.length) {
    lines.push('### Gate Commands');
    lines.push('');
    for (const [index, gate] of gates.entries()) {
      lines.push(`- ${index + 1}. \`${gate}\``);
    }
    lines.push('');
  }

  lines.push('## Grok Fix Iterations');
  lines.push('');
  if (iterations.length === 0) {
    lines.push('- No fix iteration ran.');
  } else {
    for (const iteration of iterations) {
      lines.push(`### Iteration ${iteration.iteration}`);
      lines.push('');
      if (iteration.grokFix) {
        lines.push(`- Grok exitCode: \`${iteration.grokFix.exitCode}\``);
        lines.push(`- Grok timedOut: \`${iteration.grokFix.timedOut}\``);
      }
      if (iteration.attempts?.length) {
        lines.push(`- Grok attempts: \`${iteration.attempts.length}\``);
        for (const attempt of iteration.attempts) {
          lines.push(`  - Attempt ${attempt.attempt}: exitCode=\`${attempt.grokFix.exitCode}\`, failure=\`${attempt.failure.kind}\`, retryable=\`${attempt.failure.retryable}\`, diffChanged=\`${attempt.diffChanged}\``);
        }
      }
      if (iteration.gate) {
        lines.push(`- Gate result: \`${iteration.gate.ok ? 'green' : 'red'}\``);
        lines.push(`- Gate failure count: \`${iteration.gate.failureCount}\``);
        if (iteration.gateProgress) {
          lines.push(`- Inner failure count: \`${iteration.gateProgress.innerFailureCount ?? 'unknown'}\``);
          lines.push(`- Effective failure count: \`${iteration.gateProgress.effectiveFailureCount}\``);
        }
      } else {
        lines.push('- Gate result: `not-run`');
      }
      if (iteration.diff) {
        lines.push(`- Diff bytes: \`${iteration.diff.bytes}\``);
      }
      if (iteration.diffGuard) {
        lines.push(`- Diff guard findings: \`${iteration.diffGuard.findings.length}\``);
        for (const finding of iteration.diffGuard.findings) {
          lines.push(`  - ${finding.reason}: \`${finding.path}\` (+${finding.addedLines}/-${finding.deletedLines})`);
        }
      }
      lines.push(`- Files: \`grok-request.${iteration.iteration}.md\`, \`grok-output.${iteration.iteration}.*\`, \`diff.${iteration.iteration}.patch\``);
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## Codex Review');
  lines.push('');
  if (codexReview) {
    lines.push(`- Exit code: \`${codexReview.exitCode}\``);
    lines.push(`- Timed out: \`${codexReview.timedOut}\``);
    lines.push('- Raw output: `codex-review.stdout.log`, `codex-review.stderr.log`, `codex-review.exit.json`');
  } else {
    lines.push('- Not run.');
  }
  lines.push('');

  lines.push('## Status Notes');
  lines.push('');
  lines.push('- `DONE_REVIEWED`: gate green, final Codex review succeeded.');
  lines.push('- `DONE_FIXED`: gate green, review skipped.');
  lines.push('- `DONE_GATE_ONLY`: baseline gate was green, review skipped.');
  lines.push('- `PAUSED_BEFORE_FIX`: paused after baseline gate and before the first Grok fix.');
  lines.push('- `PAUSED_AFTER_ITERATION`: paused after a progressing red post-fix gate; resume continues at the next iteration.');
  lines.push('- `HALT_NO_CHANGES`: Grok ran but produced no new diff.');
  lines.push('- `HALT_NO_PROGRESS`: post-fix gate stayed red and effective failure count did not drop.');
  lines.push('- `HALT_BUDGET`: max fix iterations reached.');
  lines.push('- `HALT_HUMAN`: Grok call failed, timed out, retryable auth/rate/network failures were exhausted, or human takeover is required.');
  lines.push('- `POSSIBLE_TEST_TAMPER`: `--guard-tests` detected protected test/config changes in the diff.');
  lines.push('- `HALT_AGENT_NOT_FOUND`: codex or grok executable was not found.');
  lines.push('');
  lines.push('## Next Step');
  lines.push('');
  if (finalState?.startsWith('DONE_')) {
    lines.push('- Review the worktree diff and decide whether to merge.');
  } else {
    lines.push('- Open `.agent-loop/latest/state.json` plus the stdout/stderr logs to inspect the halt reason.');
  }

  return lines.join('\n');
}
