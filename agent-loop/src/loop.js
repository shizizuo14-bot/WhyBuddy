import fs from 'node:fs/promises';
import path from 'node:path';
import { parseLoopArgs } from './loopArgs.js';
import { runLoop } from './loopEngine.js';
import { buildLoopReport } from './loopReport.js';

async function main() {
  const options = parseLoopArgs(process.argv.slice(2));
  const resumeState = options.resume ? JSON.parse(await fs.readFile(options.resume, 'utf8')) : null;
  const activeOptions = resumeState
    ? { ...resumeState.options, resume: options.resume, pauseBeforeFix: false }
    : options;
  const runId = resumeState?.runId || timestamp();
  const runDir = resumeState?.artifacts?.runDir || path.join(activeOptions.cwd, '.agent-loop', 'runs', runId);
  const latestDir = resumeState?.artifacts?.latestDir || path.join(activeOptions.cwd, '.agent-loop', 'latest');
  if (!resumeState) {
    await fs.mkdir(runDir, { recursive: true });
    await fs.rm(latestDir, { recursive: true, force: true });
    await fs.mkdir(latestDir, { recursive: true });
  }

  const writeArtifact = async (fileName, content, kind = 'text') => {
    if (kind === 'json') {
      await writeTextBoth(runDir, latestDir, fileName, `${JSON.stringify(content, null, 2)}\n`);
    } else {
      await writeTextBoth(runDir, latestDir, fileName, String(content ?? ''));
    }
  };

  const result = await runLoop({
    options: activeOptions,
    runId,
    runDir,
    latestDir,
    resumeState,
    deps: {
      writeArtifact,
      onState: async (state) => {
        await writeArtifact('state.json', state, 'json');
      },
    },
  });

  const report = buildLoopReport({
    runId,
    cwd: activeOptions.cwd,
    fixCwd: result.worktree?.fixCwd || activeOptions.fixCwd || activeOptions.cwd,
    task: activeOptions.task,
    gates: activeOptions.gates,
    baselineGate: result.baselineGate,
    finalState: result.status,
    grokFix: result.grokFix,
    codexReview: result.codexReview,
    iterations: result.iterations || [],
    maxIterations: activeOptions.maxIterations,
  });
  await writeArtifact('final-report.md', report, 'text');

  console.log(path.join(latestDir, 'final-report.md'));
  if (result.status.startsWith('HALT_')) {
    process.exitCode = result.status === 'HALT_AGENT_NOT_FOUND' ? 2 : 1;
  }
}

async function writeTextBoth(runDir, latestDir, fileName, content) {
  await fs.writeFile(path.join(runDir, fileName), content, 'utf8');
  await fs.writeFile(path.join(latestDir, fileName), content, 'utf8');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
