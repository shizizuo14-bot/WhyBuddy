import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';


const agentLoopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = path.join(agentLoopRoot, 'vscode-extension');
const extensionOut = path.join(extensionRoot, 'out');
const requireFromExtension = createRequire(path.join(extensionRoot, 'package.json'));

test('extension runSummary matches core runSummary for agent-neutral cases', async () => {
  const core = await import(pathToFileURL(path.join(agentLoopRoot, 'src', 'runSummary.js')).href);
  const ext = requireFromExtension('./out/runSummary.js');

  const cases = [
    {
      name: 'grok fix + grok review',
      input: {
        runId: '2026-06-16T18-00-00-000Z',
        status: 'DONE_REVIEWED',
        task: 'tasks/a.md',
        iterations: [{ iteration: 1, grokFix: { exitCode: 0, timedOut: false } }],
        grokFix: { exitCode: 0, timedOut: false },
        grokReview: { exitCode: 0, timedOut: false },
        fixAgent: 'grok',
        reviewAgent: 'grok',
      },
    },
    {
      name: 'codex fix does not mark grokRan',
      input: {
        runId: 'run-1',
        status: 'DONE_FIXED',
        task: 'task.md',
        iterations: [{ iteration: 1, agentFix: { exitCode: 0, timedOut: false } }],
        agentFix: { exitCode: 0, timedOut: false },
        fixAgent: 'codex',
        reviewAgent: 'grok',
      },
    },
    {
      name: 'gate only',
      input: {
        runId: '2026-06-16T17-00-02-496Z',
        status: 'DONE_GATE_ONLY',
        task: 'tasks/gate.md',
        iterations: [],
      },
    },
    {
      name: 'review halt after successful fix',
      input: {
        runId: 'run-2',
        status: 'HALT_HUMAN',
        task: 'task.md',
        iterations: [{ iteration: 1, agentFix: { exitCode: 0, timedOut: false } }],
        agentFix: { exitCode: 0, timedOut: false },
        agentReview: { exitCode: 1, timedOut: false },
        fixAgent: 'codex',
        reviewAgent: 'grok',
      },
    },
  ];

  for (const { name, input } of cases) {
    const coreSummary = core.summarizeRunRecord(input);
    const extSummary = ext.summarizeRunRecord(input);
    assert.deepEqual(
      {
        runMode: extSummary.runMode,
        grokRan: extSummary.grokRan,
        codexRan: extSummary.codexRan,
        reviewAgentRan: extSummary.reviewAgentRan,
        iterations: extSummary.iterations,
      },
      {
        runMode: coreSummary.runMode,
        grokRan: coreSummary.grokRan,
        codexRan: coreSummary.codexRan,
        reviewAgentRan: coreSummary.reviewAgentRan,
        iterations: coreSummary.iterations,
      },
      name,
    );
  }
});

test('extension runSummary loads from a simulated VS Code install directory', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-ext-install-'));
  const fakeOutDir = path.join(installRoot, 'out');
  await fs.mkdir(fakeOutDir, { recursive: true });
  await fs.copyFile(
    path.join(extensionOut, 'runSummary.js'),
    path.join(fakeOutDir, 'runSummary.js'),
  );

  const requireFromInstall = createRequire(path.join(installRoot, 'package.json'));
  await fs.writeFile(path.join(installRoot, 'package.json'), '{"name":"fake-ext","version":"0.0.0"}\n', 'utf8');

  const mod = requireFromInstall('./out/runSummary.js');
  const summary = mod.summarizeRunRecord({
    runId: 'run-1',
    status: 'DONE_REVIEWED',
    task: 'task.md',
    iterations: [{ iteration: 1, grokFix: { exitCode: 0 } }],
    grokFix: { exitCode: 0 },
    grokReview: { exitCode: 0 },
    fixAgent: 'grok',
    reviewAgent: 'grok',
  });

  assert.equal(summary.runMode, 'grok-fix+grok-review');
  assert.equal(summary.grokRan, true);
});

test('findNewestFixLog prefers attempt stderr over iteration alias during fix', async () => {
  const { findNewestFixLog } = requireFromExtension('./out/activeLog.js');
  const latest = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-latest-log-'));
  await fs.writeFile(path.join(latest, 'grok-output.1.stderr.log'), 'alias-old\n', 'utf8');
  await fs.writeFile(path.join(latest, 'grok-output.1.2.stderr.log'), 'attempt-2-live\n', 'utf8');

  const resolved = await findNewestFixLog(latest, 'grok-output', 1);

  assert.equal(path.basename(resolved), 'grok-output.1.2.stderr.log');
});

test('resolveActiveLogPath prefers grok review stdout after DONE_REVIEWED', async () => {
  const { resolveActiveLogPath } = requireFromExtension('./out/activeLog.js');
  const latest = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-latest-log-'));
  await fs.writeFile(path.join(latest, 'review-output.grok.stderr.log'), '', 'utf8');
  await fs.writeFile(
    path.join(latest, 'review-output.grok.stdout.log'),
    JSON.stringify({
      text: JSON.stringify({ verdict: 'pass', summary: 'pool parity 已完成' }),
    }),
    'utf8',
  );

  const resolved = await resolveActiveLogPath(latest, {
    status: 'DONE_REVIEWED',
    options: { reviewAgent: 'grok', skipReview: false },
    grokReview: { exitCode: 0 },
    iterations: [],
  });

  assert.equal(path.basename(resolved), 'review-output.grok.stdout.log');
});

test('resolveActiveLogPath shows fix stderr after HALT_NO_CHANGES', async () => {
  const { resolveActiveLogPath } = requireFromExtension('./out/activeLog.js');
  const latest = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-latest-log-'));
  await fs.writeFile(path.join(latest, 'grok-output.1.1.stderr.log'), 'Error: max turns reached\n', 'utf8');
  await fs.writeFile(
    path.join(latest, 'grok-output.1.1.stdout.log'),
    JSON.stringify({ text: '正在读取相关文件\n' }),
    'utf8',
  );

  const resolved = await resolveActiveLogPath(latest, {
    status: 'HALT_NO_CHANGES',
    options: { fixAgent: 'grok', skipReview: false, reviewAgent: 'grok' },
    currentIteration: 1,
    iterations: [{ iteration: 1, grokFix: { exitCode: 1 } }],
    grokFix: { exitCode: 1 },
  });

  assert.equal(path.basename(resolved), 'grok-output.1.1.stderr.log');
});

test('resolveLogRoot prefers run artifacts directory over latest', async () => {
  const { resolveLogRoot } = requireFromExtension('./out/activeLog.js');
  const repoRoot = 'C:\\repo';
  const runDir = 'C:\\repo\\.agent-loop\\runs\\2026-06-17T14-07-19-291Z';

  assert.equal(
    resolveLogRoot({ artifacts: { runDir } }, repoRoot),
    runDir,
  );
  assert.equal(
    resolveLogRoot(null, repoRoot),
    path.join(repoRoot, '.agent-loop', 'latest'),
  );
});

test('resolveDisplayGate prefers post-fix gate over baseline gate', async () => {
  const { resolveDisplayGate } = requireFromExtension('./out/gateSummary.js');

  const gate = resolveDisplayGate({
    baselineGate: { ok: false, failureCount: 2 },
    iterations: [
      { iteration: 1, gate: { ok: true, failureCount: 0 } },
    ],
  });

  assert.deepEqual(gate, {
    ok: true,
    text: '修复 Gate 绿',
    source: 'post-fix',
    failureCount: 0,
  });
});

test('buildRunSnapshot can read a historical run and freeze terminal elapsed', async () => {
  const { buildRunSnapshotFromStatePath } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-snapshot-repo-'));
  const runId = '2026-06-17T15-34-38-183Z';
  const runDir = path.join(repo, '.agent-loop', 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });
  const statePath = path.join(runDir, 'state.json');
  await fs.writeFile(statePath, JSON.stringify({
    runId,
    status: 'HALT_NO_CHANGES',
    options: { task: 'agent-loop/tasks/migrate-sliderule-critique-generate.md' },
    baselineGate: { ok: false, failureCount: 2 },
    iterations: [
      {
        iteration: 1,
        agentFix: {
          startedAt: '2026-06-17T15:34:46.734Z',
          endedAt: '2026-06-17T15:36:00.631Z',
        },
        gate: null,
      },
    ],
    artifacts: { runDir },
  }), 'utf8');

  const snapshot = await buildRunSnapshotFromStatePath(repo, statePath, {
    now: () => Date.parse('2026-06-17T15:40:00.000Z'),
  });

  assert.equal(snapshot.state.runId, runId);
  assert.equal(snapshot.taskLabel, 'migrate-sliderule-critique-generate');
  assert.equal(snapshot.elapsedMs, 82448);
});

test('findLatestRunForTask maps a queue task to its newest run', async () => {
  const { findLatestRunForTask } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-task-run-'));
  const runs = path.join(repo, '.agent-loop', 'runs');
  await fs.mkdir(path.join(runs, 'older'), { recursive: true });
  await fs.mkdir(path.join(runs, 'newer'), { recursive: true });
  await fs.writeFile(path.join(runs, 'older', 'state.json'), JSON.stringify({
    status: 'DONE_GATE_ONLY',
    options: { task: 'agent-loop/tasks/migrate-sliderule-report-write.md' },
  }), 'utf8');
  await fs.writeFile(path.join(runs, 'newer', 'state.json'), JSON.stringify({
    status: 'HALT_HUMAN',
    options: { task: 'agent-loop/tasks/migrate-sliderule-report-write.md' },
  }), 'utf8');
  const olderTime = new Date('2026-06-17T15:00:00.000Z');
  const newerTime = new Date('2026-06-17T15:00:01.000Z');
  await fs.utimes(path.join(runs, 'older', 'state.json'), olderTime, olderTime);
  await fs.utimes(path.join(runs, 'newer', 'state.json'), newerTime, newerTime);

  const match = await findLatestRunForTask(repo, 'agent-loop/tasks/migrate-sliderule-report-write.md');

  assert.equal(match.runId, 'newer');
  assert.equal(path.basename(path.dirname(match.statePath)), 'newer');
});

test('formatAgentLogTail formats grok review json into readable lines', async () => {
  const { formatAgentLogTail } = requireFromExtension('./out/activeLog.js');
  const tail = formatAgentLogTail(JSON.stringify({
    text: JSON.stringify({ verdict: 'pass', summary: 'gate 全绿，审查通过' }),
  }));

  assert.match(tail, /verdict: pass/);
  assert.match(tail, /gate 全绿，审查通过/);
});

test('dashboard view title command is contributed only once', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  const viewTitleMenus = packageJson.contributes.menus['view/title'];
  const dashboardMenus = viewTitleMenus.filter((item) => item.command === 'agentLoop.openDashboard');

  assert.equal(dashboardMenus.length, 1);
  assert.equal(dashboardMenus[0].when, 'view == agentLoop.currentRun');
});

test('packaged extension sources do not require external agent-loop runSummary.js', async () => {
  const offenders = [];
  const files = await fs.readdir(extensionOut);
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const raw = await fs.readFile(path.join(extensionOut, file), 'utf8');
    if (raw.includes('src/runSummary.js') || raw.includes('createRequire')) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test('VSIX contents are self-contained for run summary', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  const vsixPath = path.join(extensionRoot, `agent-loop-dashboard-${packageJson.version}.vsix`);
  try {
    await fs.access(vsixPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const raw = await fs.readFile(vsixPath);
  const listing = raw.toString('latin1');
  assert.doesNotMatch(listing, /agent-loop\/src\/runSummary\.js/);
  assert.match(listing, /extension\/out\/runSummary\.js/);
  assert.match(listing, /extension\/out\/activeLog\.js/);
  assert.match(listing, /extension\/out\/gateSummary\.js/);
});
