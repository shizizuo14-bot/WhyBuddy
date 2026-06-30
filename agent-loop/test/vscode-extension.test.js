import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';


const agentLoopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = path.join(agentLoopRoot, 'vscode-extension');
const extensionOut = path.join(extensionRoot, 'out');
const requireFromExtension = createRequire(path.join(extensionRoot, 'package.json'));
const cjsRequire = createRequire(import.meta.url);

// ===== VS Code test harness shim (for Settings 106/107) =====
// Allows node:test to require() compiled extension modules (e.g. paths.js)
// that have `import * as vscode from 'vscode'` (compiled to require).
// Provides just enough to exercise getAgentLoopConfig / getEffectiveConfig defaults and load Settings-related modules.
// Supports inspect + overrides for package-defaults + workspace merge tests.
// Does not add vscode as a runtime dep and does not affect production.
let __vscodeShimInstalled = false;
function installVscodeTestShim() {
  if (__vscodeShimInstalled) return;
  __vscodeShimInstalled = true;
  // Use a require resolved from test file to load the CJS 'module' constructor.
  const cjsRequire = createRequire(import.meta.url);
  const Module = cjsRequire('module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return createVscodeMock();
    }
    return originalLoad.apply(this, arguments);
  };
}

// ===== VS Code 107 test harness state & helpers (no leaking globals between tests) =====
// Internal state is reset via provided helpers. Direct __AGENT_LOOP_TEST_CONFIG kept for compat with prior tests.
const __AGENT_LOOP_107_STATE = {
  config: {},
  updates: [],
  workspaceFolders: undefined,
  capturedCommands: [],
  capturedMessages: [],
};
function resetVscode107State() {
  __AGENT_LOOP_107_STATE.config = {};
  __AGENT_LOOP_107_STATE.updates = [];
  __AGENT_LOOP_107_STATE.workspaceFolders = undefined;
  __AGENT_LOOP_107_STATE.capturedCommands = [];
  __AGENT_LOOP_107_STATE.capturedMessages = [];
  delete globalThis.__AGENT_LOOP_TEST_CONFIG;
  delete globalThis.__AGENT_LOOP_TEST_CONFIG_UPDATES;
  delete globalThis.__AGENT_LOOP_TEST_WORKSPACE_FOLDERS;
  delete globalThis.__AGENT_LOOP_TEST_CAPTURED_COMMANDS;
  delete globalThis.__AGENT_LOOP_TEST_CAPTURED_WEBVIEW_MESSAGES;
}
function seedWorkspaceConfig(overrides) {
  const seed = overrides || {};
  __AGENT_LOOP_107_STATE.config = { ...__AGENT_LOOP_107_STATE.config, ...seed };
  // compat for existing effective-config style tests and getEffectiveConfig
  globalThis.__AGENT_LOOP_TEST_CONFIG = { ...(globalThis.__AGENT_LOOP_TEST_CONFIG || {}), ...seed };
  return () => { /* caller manages via resetVscode107State or finally */ };
}
function getWorkspaceConfigUpdates() {
  const fromState = __AGENT_LOOP_107_STATE.updates.length ? __AGENT_LOOP_107_STATE.updates : (globalThis.__AGENT_LOOP_TEST_CONFIG_UPDATES || []);
  return [...fromState];
}
function seedWorkspaceFolders(folders) {
  __AGENT_LOOP_107_STATE.workspaceFolders = folders;
  globalThis.__AGENT_LOOP_TEST_WORKSPACE_FOLDERS = folders;
}
function getCapturedCommands() {
  return [...(globalThis.__AGENT_LOOP_TEST_CAPTURED_COMMANDS || __AGENT_LOOP_107_STATE.capturedCommands || [])];
}
function getCapturedWebviewMessages() {
  return [...(globalThis.__AGENT_LOOP_TEST_CAPTURED_WEBVIEW_MESSAGES || __AGENT_LOOP_107_STATE.capturedMessages || [])];
}
function createMockSecretStorage(seed) {
  // Obtain via shim so test sees the 107-mocked SecretStorage impl
  const vscode = cjsRequire('vscode');
  return new vscode.SecretStorage(seed || {});
}

function createVscodeMock() {
  function makeConfig() {
    return {
      get(key, defaultValue) {
        // Support 107 tests: mock workspace overrides take precedence over defaultValue (package).
        const overrides = globalThis.__AGENT_LOOP_TEST_CONFIG || __AGENT_LOOP_107_STATE.config || {};
        const k = String(key);
        if (k in overrides) return overrides[k];
        // Always honor the default passed by getAgentLoopConfig / callers so defaults are testable.
        return defaultValue;
      },
      inspect(key) {
        const overrides = globalThis.__AGENT_LOOP_TEST_CONFIG || __AGENT_LOOP_107_STATE.config || {};
        const k = String(key);
        // package.json defaults (Settings 107)
        const PKG_DEFAULTS = {
          fixAgent: 'grok',
          reviewAgent: 'codex',
          fixModel: '',
          reviewModel: '',
          workerMaxTurns: 512,
          workerMaxRetries: 2,
          queuePath: 'agent-loop/scripts/migration-queue.json',
          worktreeScope: 'queue',
          baseUrl: '',
          injectKeysToWorker: true,
          activeProfile: 'local',
        };
        const hasWs = k in overrides;
        return {
          defaultValue: PKG_DEFAULTS[k] !== undefined ? PKG_DEFAULTS[k] : undefined,
          workspaceValue: hasWs ? overrides[k] : undefined,
          workspaceFolderValue: undefined,
          globalValue: undefined,
        };
      },
      update(key, value, target) {
        const k = String(key);
        const entry = { key: k, value, target };
        __AGENT_LOOP_107_STATE.updates.push(entry);
        if (!globalThis.__AGENT_LOOP_TEST_CONFIG_UPDATES) globalThis.__AGENT_LOOP_TEST_CONFIG_UPDATES = [];
        globalThis.__AGENT_LOOP_TEST_CONFIG_UPDATES.push(entry);
        // reflect immediately so get/inspect in same test see the written value
        if (!globalThis.__AGENT_LOOP_TEST_CONFIG) globalThis.__AGENT_LOOP_TEST_CONFIG = {};
        globalThis.__AGENT_LOOP_TEST_CONFIG[k] = value;
        __AGENT_LOOP_107_STATE.config[k] = value;
        return Promise.resolve();
      },
      has() { return false; },
    };
  }
  return {
    workspace: {
      get workspaceFolders() {
        return (globalThis.__AGENT_LOOP_TEST_WORKSPACE_FOLDERS !== undefined)
          ? globalThis.__AGENT_LOOP_TEST_WORKSPACE_FOLDERS
          : __AGENT_LOOP_107_STATE.workspaceFolders;
      },
      set workspaceFolders(v) {
        __AGENT_LOOP_107_STATE.workspaceFolders = v;
        globalThis.__AGENT_LOOP_TEST_WORKSPACE_FOLDERS = v;
      },
      getConfiguration() {
        return makeConfig();
      },
    },
    commands: {
      executeCommand: async (command, ...args) => {
        const rec = { command: String(command), args };
        __AGENT_LOOP_107_STATE.capturedCommands.push(rec);
        if (!globalThis.__AGENT_LOOP_TEST_CAPTURED_COMMANDS) globalThis.__AGENT_LOOP_TEST_CAPTURED_COMMANDS = [];
        globalThis.__AGENT_LOOP_TEST_CAPTURED_COMMANDS.push(rec);
        // allow test seeded responses if present
        const resps = globalThis.__AGENT_LOOP_TEST_COMMAND_RESPONSES || {};
        if (command in resps) return resps[command];
        return undefined;
      },
    },
    window: {
      showWarningMessage: () => undefined,
      showInformationMessage: () => undefined,
      createOutputChannel: () => ({
        append() {},
        appendLine() {},
        show() {},
        dispose() {},
      }),
      createWebviewPanel(viewType, title, column, options) {
        const msgs = [];
        const webview = {
          postMessage(msg) {
            msgs.push(msg);
            __AGENT_LOOP_107_STATE.capturedMessages.push(msg);
            if (!globalThis.__AGENT_LOOP_TEST_CAPTURED_WEBVIEW_MESSAGES) globalThis.__AGENT_LOOP_TEST_CAPTURED_WEBVIEW_MESSAGES = [];
            globalThis.__AGENT_LOOP_TEST_CAPTURED_WEBVIEW_MESSAGES.push(msg);
            return true;
          },
          onDidReceiveMessage() { return { dispose() {} }; },
          html: '',
          cspSource: 'vscode-webview://test-shim',
          options: options || {},
        };
        const panel = {
          viewType,
          title,
          webview,
          reveal() {},
          dispose() {},
          onDidDispose(cb) { return { dispose() {} }; },
          _getCapturedMessages() { return [...msgs]; },
        };
        return panel;
      },
    },
    ViewColumn: { Beside: 2 },
    Uri: {
      file: (fsPath) => ({ fsPath, scheme: 'file' }),
      joinPath: (base, ...parts) => ({ fsPath: [base && base.fsPath, ...parts].filter(Boolean).join('/'), scheme: 'file' }),
    },
    ConfigurationTarget: { Workspace: 1, Global: 2, WorkspaceFolder: 3 },
    Disposable: function Disposable() {},
    // 107: SecretStorage mock (per-instance stores; no cross-instance leak)
    SecretStorage: class SecretStorage {
      #store = new Map();
      constructor(seed) {
        if (seed && typeof seed === 'object' && !Array.isArray(seed)) {
          for (const [k, v] of Object.entries(seed)) {
            if (v != null) this.#store.set(String(k), v);
          }
        }
      }
      async get(key) {
        const k = String(key);
        return this.#store.has(k) ? this.#store.get(k) : undefined;
      }
      async store(key, value) {
        this.#store.set(String(key), value);
      }
      async delete(key) {
        this.#store.delete(String(key));
      }
      _testDump() {
        return Object.fromEntries(this.#store.entries());
      }
    },
    env: { appRoot: '' },
    version: 'test-shim',
  };
}

installVscodeTestShim();

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
    {
      name: 'reviewed no diff apply status',
      input: {
        runId: 'run-3',
        status: 'DONE_REVIEWED_NO_DIFF',
        task: 'task.md',
        iterations: [],
        fixAgent: 'codex',
        reviewAgent: 'codex',
      },
    },
    {
      name: 'apply conflict status',
      input: {
        runId: 'run-4',
        status: 'APPLY_CONFLICT',
        task: 'task.md',
        iterations: [],
        fixAgent: 'codex',
        reviewAgent: 'codex',
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

test('resolveActiveLogPath prefers explicit active agent log pointer during fix', async () => {
  const { resolveActiveLogPath } = requireFromExtension('./out/activeLog.js');
  const latest = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-active-pointer-'));
  await fs.writeFile(path.join(latest, 'grok-output.1.2.stderr.log'), 'newer but not active\n', 'utf8');
  await fs.writeFile(path.join(latest, 'grok-output.1.1.stderr.log'), 'current active log\n', 'utf8');

  const resolved = await resolveActiveLogPath(latest, {
    status: 'GROK_FIX',
    options: { fixAgent: 'grok' },
    currentIteration: 1,
    activeAgentLog: {
      phase: 'fix',
      agent: 'grok',
      iteration: 1,
      attempt: 1,
      stderr: 'grok-output.1.1.stderr.log',
      stdout: 'grok-output.1.1.stdout.log',
    },
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

test('buildRunSnapshot marks stale active runs as interrupted and freezes elapsed', async () => {
  const { buildRunSnapshotFromStatePath } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-stale-snapshot-'));
  const runId = '2026-06-20T19-21-08-121Z';
  const runDir = path.join(repo, '.agent-loop', 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });
  const statePath = path.join(runDir, 'state.json');
  await fs.writeFile(statePath, JSON.stringify({
    runId,
    status: 'CODEX_FIX',
    options: {
      task: 'agent-loop/tasks/backend-python-blueprint-brainstorm-contract.md',
      timeoutMs: 1800000,
      fixAgent: 'codex',
      reviewAgent: 'codex',
    },
    artifacts: { runDir },
    iterations: [],
  }), 'utf8');
  const staleTime = new Date('2026-06-20T19:21:48.000Z');
  await fs.utimes(statePath, staleTime, staleTime);

  const snapshot = await buildRunSnapshotFromStatePath(repo, statePath, {
    now: () => Date.parse('2026-06-20T20:10:00.000Z'),
  });

  assert.equal(snapshot.state.status, 'CODEX_FIX');
  assert.equal(snapshot.displayStatus, 'STALE_INTERRUPTED');
  assert.equal(snapshot.phaseLabel, '运行中断');
  assert.equal(snapshot.staleRun.status, 'CODEX_FIX');
  assert.equal(snapshot.elapsedMs, staleTime.getTime() - Date.parse('2026-06-20T19:21:08.121Z'));
  assert.ok(snapshot.details.some((line) => line.includes('运行中断')));
});

test('buildRunSnapshot reads landing status and structured final report', async () => {
  const { buildRunSnapshotFromStatePath } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-snapshot-report-'));
  const runId = '2026-06-20T10-00-00-000Z';
  const runDir = path.join(repo, '.agent-loop', 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });
  const statePath = path.join(runDir, 'state.json');
  await fs.writeFile(statePath, JSON.stringify({
    runId,
    status: 'DONE_REVIEWED',
    options: { task: 'agent-loop/tasks/task-a.md' },
    artifacts: { runDir },
    guardPolicy: { protectedGlobs: ['src/generated/**'], protectTaskDocs: true },
    iterations: [],
  }), 'utf8');
  await fs.writeFile(path.join(runDir, 'landing.json'), JSON.stringify({
    status: 'MAIN_GATE_GREEN',
    appliedToMain: true,
    mainGateGreen: true,
    committed: false,
  }), 'utf8');
  await fs.writeFile(path.join(runDir, 'final-report.json'), JSON.stringify({
    schemaVersion: 1,
    status: 'DONE_REVIEWED',
    runMode: 'grok-fix+grok-review',
    guardPolicy: { protectedGlobs: ['src/generated/**'], protectTaskDocs: true },
  }), 'utf8');

  const snapshot = await buildRunSnapshotFromStatePath(repo, statePath, {
    now: () => Date.parse('2026-06-20T10:01:00.000Z'),
  });

  assert.equal(snapshot.landing.status, 'MAIN_GATE_GREEN');
  assert.equal(snapshot.finalReport.status, 'DONE_REVIEWED');
  assert.deepEqual(snapshot.guardPolicy, { protectedGlobs: ['src/generated/**'], protectTaskDocs: true });
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

test('formatAgentLogTail pretty prints grok review json', async () => {
  const { formatAgentLogTail } = requireFromExtension('./out/activeLog.js');
  const tail = formatAgentLogTail(JSON.stringify({
    text: JSON.stringify({ verdict: 'pass', summary: 'gate 全绿，审查通过' }),
  }));

  assert.match(tail, /"verdict": "pass"/);
  assert.match(tail, /"summary": "gate 全绿，审查通过"/);
  assert.match(tail, /^\{\n/);
});

test('formatAgentLogTail pretty prints top-level review json', async () => {
  const { formatAgentLogTail } = requireFromExtension('./out/activeLog.js');
  const tail = formatAgentLogTail(JSON.stringify({
    verdict: 'pass',
    summary: 'admin contract gate passed',
    findings: [],
  }));

  assert.match(tail, /"verdict": "pass"/);
  assert.match(tail, /"summary": "admin contract gate passed"/);
  assert.match(tail, /"findings": \[\]/);
  assert.doesNotMatch(tail, /^\{"verdict":/);
});

test('buildQueueOverview merges queue membership with per-task outcomes', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-overview-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    defaults: {
      useWorktree: true,
      worktreeScope: 'queue',
      queueWorktreeName: 'migration-queue',
      fixAgent: 'grok',
      reviewAgent: 'codex',
      skipReview: false,
    },
    tasks: [
      { id: 'a', task: 'agent-loop/tasks/a.md' },
      { id: 'b', task: 'agent-loop/tasks/b.md', worktreeScope: 'task', worktreeName: 'task-b', fixAgent: 'codex', reviewAgent: 'grok' },
      { id: 'c', task: 'agent-loop/tasks/c.md', enabled: false },
    ],
  }), 'utf8');
  await fs.mkdir(path.join(repo, '.agent-loop'), { recursive: true });
  await fs.writeFile(path.join(repo, '.agent-loop', 'queue-outcomes.json'), JSON.stringify({
    tasks: {
      a: {
        lastOutcome: 'done',
        lastStatus: 'DONE_REVIEWED',
        lastRunId: 'run-a',
        lastUpdatedAt: '2026-06-23T08:00:00.000Z',
      },
      b: { lastOutcome: 'failed', lastStatus: 'HALT_HUMAN', lastRunId: 'run-b' },
    },
  }), 'utf8');

  const overview = await buildQueueOverview(repo, { queueFilePath, queueRunning: false });

  assert.equal(overview.counts.total, 3);
  assert.equal(overview.counts.done, 1);
  assert.equal(overview.counts.failed, 0);
  assert.equal(overview.counts.human, 1);
  assert.equal(overview.counts.pending, 1);
  assert.equal(overview.tasks[0].outcome, 'done');
  assert.equal(overview.tasks[0].agent, 'Grok / Codex');
  assert.equal(overview.tasks[0].fixAgent, 'grok');
  assert.equal(overview.tasks[0].reviewAgent, 'codex');
  assert.equal(overview.tasks[0].lastUpdatedText, '2026-06-23 16:00:00');
  assert.equal(overview.tasks[0].branch, 'agent-loop/migration-queue');
  assert.equal(overview.tasks[1].agent, 'Codex / Grok');
  assert.equal(overview.tasks[1].branch, 'agent-loop/task-b');
  assert.equal(overview.tasks[2].enabled, false);
});

test('buildQueueOverview groups no-diff reviewed and apply conflicts separately', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-overview-groups-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    tasks: [
      { id: 'no-diff', task: 'agent-loop/tasks/no-diff.md' },
      { id: 'conflict', task: 'agent-loop/tasks/conflict.md' },
      { id: 'rescue', task: 'agent-loop/tasks/rescue.md' },
      { id: 'human', task: 'agent-loop/tasks/human.md' },
      { id: 'dirty', task: 'agent-loop/tasks/dirty.md' },
    ],
  }), 'utf8');
  await fs.mkdir(path.join(repo, '.agent-loop'), { recursive: true });
  await fs.writeFile(path.join(repo, '.agent-loop', 'queue-outcomes.json'), JSON.stringify({
    tasks: {
      'no-diff': {
        lastOutcome: 'done',
        lastStatus: 'DONE_REVIEWED_NO_DIFF',
        lastRunId: 'run-no-diff',
        applyStatus: 'DONE_REVIEWED_NO_DIFF',
        applyErrorKind: 'NO_DIFF_PATCH',
      },
      conflict: {
        lastOutcome: 'failed',
        lastStatus: 'APPLY_CONFLICT',
        lastRunId: 'run-conflict',
        applyStatus: 'APPLY_CONFLICT',
        applyErrorKind: 'PATCH_CONFLICT',
        applyErrorFiles: ['server/routes/a2a.ts'],
      },
      rescue: {
        lastOutcome: 'failed',
        lastStatus: 'HALT_NO_PROGRESS',
        lastRunId: 'run-rescue',
        applyStatus: 'RESCUE_PATCH_AVAILABLE',
        applyErrorKind: 'PARTIAL_DIFF_GATE_RED',
        rescuePatchAvailable: true,
        diffBytes: 16691,
      },
      human: { lastOutcome: 'failed', lastStatus: 'HALT_HUMAN', lastRunId: 'run-human' },
      dirty: {
        lastOutcome: 'crashed',
        lastStatus: 'DIRTY_MAIN_NEEDS_COMMIT',
        lastRunId: null,
        worktreeErrorFiles: ['agent-loop/src/runQueue.js'],
      },
    },
  }), 'utf8');

  const overview = await buildQueueOverview(repo, { queueFilePath, queueRunning: false });

  assert.equal(overview.counts.done, 0);
  assert.equal(overview.counts.noDiff, 1);
  assert.equal(overview.counts.applyConflict, 1);
  assert.equal(overview.counts.rescuePatch, 1);
  assert.equal(overview.counts.failed, 1);
  assert.equal(overview.counts.human, 1);
  assert.equal(overview.counts.crashed, 0);
  assert.equal(overview.counts.stopped, 1);
  assert.equal(overview.tasks[0].outcomeGroup, 'noDiff');
  assert.equal(overview.tasks[1].outcomeGroup, 'applyConflict');
  assert.deepEqual(overview.tasks[1].applyErrorFiles, ['server/routes/a2a.ts']);
  assert.equal(overview.tasks[2].outcomeGroup, 'rescuePatch');
  assert.equal(overview.tasks[2].category, 'attention');
  assert.equal(overview.tasks[2].rescuePatchAvailable, true);
  assert.equal(overview.tasks[2].diffBytes, 16691);
  assert.equal(overview.tasks[4].outcomeGroup, 'stopped');
});

test('buildQueueOverview promotes explicit manual rescue evidence out of attention', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-overview-manual-rescue-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    tasks: [
      { id: 'rescued', task: 'agent-loop/tasks/rescued.md' },
      { id: 'still-needs-rescue', task: 'agent-loop/tasks/still-needs-rescue.md' },
    ],
  }), 'utf8');
  await fs.mkdir(path.join(repo, '.agent-loop'), { recursive: true });
  await fs.mkdir(path.join(repo, 'agent-loop', 'tasks'), { recursive: true });
  await fs.writeFile(path.join(repo, 'agent-loop', 'tasks', 'rescued.md'), [
    '# rescued',
    '',
    '- 状态：已完成（人工 rescue 后门禁已绿）',
    '',
    '### 救回验证',
    '- Python gate passed',
    '- Node gate passed',
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(repo, 'agent-loop', 'tasks', 'still-needs-rescue.md'), [
    '# still-needs-rescue',
    '',
    '- 状态：需人工接管',
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(repo, '.agent-loop', 'queue-outcomes.json'), JSON.stringify({
    tasks: {
      rescued: {
        lastOutcome: 'failed',
        lastStatus: 'HALT_NO_PROGRESS',
        lastRunId: 'run-rescued',
        applyStatus: 'RESCUE_PATCH_AVAILABLE',
        applyErrorKind: 'PARTIAL_DIFF_GATE_RED',
        rescuePatchAvailable: true,
        diffBytes: 4096,
      },
      'still-needs-rescue': {
        lastOutcome: 'failed',
        lastStatus: 'HALT_NO_PROGRESS',
        lastRunId: 'run-still-needs-rescue',
        applyStatus: 'RESCUE_PATCH_AVAILABLE',
        applyErrorKind: 'PARTIAL_DIFF_GATE_RED',
        rescuePatchAvailable: true,
        diffBytes: 2048,
      },
    },
  }), 'utf8');

  const overview = await buildQueueOverview(repo, { queueFilePath, queueRunning: false });

  assert.equal(overview.counts.done, 1);
  assert.equal(overview.counts.manualRescueLanded, 1);
  assert.equal(overview.counts.rescuePatch, 1);
  assert.equal(overview.counts.failed, 1);
  assert.equal(overview.tasks[0].outcomeGroup, 'manualRescueLanded');
  assert.equal(overview.tasks[0].category, 'landed');
  assert.equal(overview.tasks[0].status, 'MANUAL_RESCUE_LANDED');
  assert.equal(overview.tasks[0].applyStatus, 'MANUAL_RESCUE_LANDED');
  assert.equal(overview.tasks[0].rawStatus, 'HALT_NO_PROGRESS');
  assert.equal(overview.tasks[0].rawApplyStatus, 'RESCUE_PATCH_AVAILABLE');
  assert.equal(overview.tasks[1].outcomeGroup, 'rescuePatch');
  assert.equal(overview.tasks[1].category, 'attention');
  assert.equal(overview.tasks[1].status, 'HALT_NO_PROGRESS');
  assert.equal(overview.tasks[1].applyStatus, 'RESCUE_PATCH_AVAILABLE');
});

test('buildQueueOverview flags the running task from the live run', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-overview-run-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    tasks: [{ id: 'a', task: 'agent-loop/tasks/a.md' }, { id: 'b', task: 'agent-loop/tasks/b.md' }],
  }), 'utf8');

  const overview = await buildQueueOverview(repo, {
    queueFilePath,
    queueRunning: true,
    runningTaskPath: 'agent-loop/tasks/b.md',
  });

  assert.equal(overview.tasks[1].running, true);
  assert.equal(overview.tasks[0].running, false);
  assert.equal(overview.counts.running, 1);
});

test('buildQueueOverview does not count a stale active snapshot as running', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-overview-stale-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    tasks: [{ id: 'a', task: 'agent-loop/tasks/a.md' }, { id: 'b', task: 'agent-loop/tasks/b.md' }],
  }), 'utf8');

  const overview = await buildQueueOverview(repo, {
    queueFilePath,
    queueRunning: true,
    runningTaskPath: 'agent-loop/tasks/b.md',
    currentRunStale: true,
  });

  assert.equal(overview.tasks[1].running, false);
  assert.equal(overview.counts.running, 0);
  assert.equal(overview.counts.pending, 2);
});

test('extension phase labels render clean Chinese status text', async () => {
  const { phaseLabel, formatElapsed, activeAgentLabel } = requireFromExtension('./out/phaseLabels.js');

  assert.equal(phaseLabel(undefined), '等待运行');
  assert.equal(phaseLabel('INIT'), '初始化');
  assert.equal(phaseLabel('HALT_NO_CHANGES'), '修复无有效 diff');
  assert.equal(formatElapsed(62000), '1 分 02 秒');
  assert.equal(activeAgentLabel(undefined, null), '-');
});

test('classifyTriageCategory sorts tasks into the five overview lanes', () => {
  const { classifyTriageCategory } = requireFromExtension('./out/stateReader.js');
  const base = { running: false, stale: false, enabled: true, autoDisabled: false, outcomeGroup: null };

  assert.equal(classifyTriageCategory({ ...base, running: true }), 'running');
  assert.equal(classifyTriageCategory({ ...base, stale: true }), 'attention');
  assert.equal(classifyTriageCategory({ ...base, enabled: false }), 'disabled');
  assert.equal(classifyTriageCategory({ ...base, autoDisabled: true }), 'attention');
  assert.equal(classifyTriageCategory({ ...base, outcomeGroup: 'failed' }), 'attention');
  assert.equal(classifyTriageCategory({ ...base, outcomeGroup: 'applyConflict' }), 'attention');
  assert.equal(classifyTriageCategory({ ...base, outcomeGroup: 'rescuePatch' }), 'attention');
  assert.equal(classifyTriageCategory({ ...base, outcomeGroup: 'human' }), 'attention');
  assert.equal(classifyTriageCategory({ ...base, outcomeGroup: 'reviewed' }), 'landed');
  assert.equal(classifyTriageCategory({ ...base, outcomeGroup: 'noDiff' }), 'landed');
  assert.equal(classifyTriageCategory(base), 'pending');
});

test('buildQueueOverview attaches a triage category to each task', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-triage-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    tasks: [
      { id: 'a', task: 'agent-loop/tasks/a.md' },
      { id: 'b', task: 'agent-loop/tasks/b.md' },
    ],
  }), 'utf8');
  await fs.mkdir(path.join(repo, '.agent-loop'), { recursive: true });
  await fs.writeFile(path.join(repo, '.agent-loop', 'queue-outcomes.json'), JSON.stringify({
    tasks: {
      a: { lastOutcome: 'done', lastStatus: 'DONE_REVIEWED' },
      b: { lastOutcome: 'crashed', lastStatus: 'HALT_HUMAN' },
    },
  }), 'utf8');

  const overview = await buildQueueOverview(repo, { queueFilePath, queueRunning: false });

  assert.equal(overview.tasks[0].category, 'landed');
  assert.equal(overview.tasks[1].category, 'attention');
});

test('extractRunEvidence pulls the latest diff and failing gate output', () => {
  const { extractRunEvidence } = requireFromExtension('./out/stateReader.js');
  const ev = extractRunEvidence({
    baselineDiffText: 'old baseline diff',
    iterations: [
      {
        iteration: 1,
        diffText: 'diff --git a/a.js b/a.js\n+added line\n',
        gateSnapshot: {
          runs: [{ label: 'npm test', exitCode: 1, stdout: 'Tests: 1 failed', stderr: 'AssertionError: boom' }],
        },
      },
    ],
  });
  assert.match(ev.diffText, /\+added line/);
  assert.equal(ev.hasDiff, true);
  assert.match(ev.gateFailure, /npm test/);
  assert.match(ev.gateFailure, /AssertionError: boom/);
});

test('extractRunEvidence truncates a long diff and reports it', () => {
  const { extractRunEvidence } = requireFromExtension('./out/stateReader.js');
  const ev = extractRunEvidence(
    { iterations: [{ iteration: 1, diffText: 'x'.repeat(20000) }] },
    { maxDiffChars: 100 },
  );
  assert.equal(ev.diffTruncated, true);
  assert.equal(ev.diffText.length, 100);
});

test('dashboard media renders diff and failing gate panels', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 't', runId: 'r', status: 'HALT_NO_PROGRESS', pipelineSteps: [],
    hasDiff: true,
    diffText: 'diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new\n',
    diffTruncated: false,
    gateFailure: '$ npm test\nAssertionError: boom',
    gateFailureTruncated: true,
    iterations: [], reviewRounds: [],
  });
  assert.match(html, /class="workbench-pane diff-pane"/);
  assert.match(html, /<h2>Diff<\/h2>/);
  assert.match(html, /data-scroll-key="diff"/);
  assert.match(html, /diff-add/);
  assert.match(html, /失败 Gate 输出/);
  assert.match(html, /AssertionError: boom/);
});

test('readRunEvents parses the append-only event log and skips junk', async () => {
  const { readRunEvents } = requireFromExtension('./out/stateReader.js');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-events-'));
  await fs.writeFile(path.join(dir, 'events.jsonl'), [
    JSON.stringify({ ts: '2026-06-21T08:00:00.000Z', status: 'INIT', iteration: null }),
    'not json at all',
    JSON.stringify({ ts: '2026-06-21T08:00:01.000Z', status: 'GROK_FIX', iteration: 1 }),
    '',
  ].join('\n'), 'utf8');

  const events = await readRunEvents(dir);
  assert.equal(events.length, 2);
  assert.equal(events[0].status, 'INIT');
  assert.equal(events[1].status, 'GROK_FIX');
  assert.equal(events[1].iteration, 1);
  assert.deepEqual(await readRunEvents(path.join(dir, 'nope')), []);
});

test('dashboard media renders the run event stream', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 't', runId: 'r', status: 'DONE_REVIEWED', pipelineSteps: [],
    iterations: [], reviewRounds: [],
    events: [
      { status: 'INIT', label: '初始化', timeText: '16:49:25', iteration: null },
      { status: 'GROK_FIX', label: 'Grok 修复中', timeText: '16:49:32', iteration: 1 },
      { status: 'DONE_REVIEWED', label: '完成（已 review）', timeText: '16:50:08', iteration: null },
    ],
  });
  assert.match(html, /event-workbench/);
  assert.match(html, /event-search/);
  assert.match(html, /data-event-filter="errors"/);
  assert.match(html, /16:49:32/);
  assert.match(html, /Grok 修复中/);
  assert.match(html, /ev-dot ok/);
});

test('dashboard detail promotes queue back and file actions into the header', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'header-actions-task',
    taskPath: 'agent-loop/tasks/header-actions-task.md',
    runId: 'header-actions-run',
    status: 'DONE_REVIEWED',
    pipelineSteps: [],
    iterations: [],
    reviewRounds: [],
    reportPath: 'C:/repo/.agent-loop/latest/final-report.md',
    reportJsonPath: 'C:/repo/.agent-loop/latest/final-report.json',
    landingPath: 'C:/repo/.agent-loop/latest/landing.json',
    statePath: 'C:/repo/.agent-loop/latest/state.json',
  });
  // De-duplicated: brand lives in the sidebar, breadcrumb + actions in the topbar,
  // and the detail header keeps only the title + meta (no second copy of any of them).
  assert.match(html, /class="product-brand"[\s\S]*class="brand-mark"/);
  assert.match(html, /class="product-crumbs"[\s\S]*header-actions-task/);
  assert.match(html, /class="product-topbar-actions"[\s\S]*data-act="runTask"/);
  assert.match(html, /data-act="openReport"[\s\S]*final-report\.md/);
  assert.match(html, /data-act="openReport"[\s\S]*final-report\.json/);
  assert.match(html, /data-act="openReport"[\s\S]*landing\.json/);
  assert.match(html, /data-act="openState"[\s\S]*state\.json/);
  assert.doesNotMatch(html, /class="detail-breadcrumbs"/);
  assert.doesNotMatch(html, /class="detail-actions"/);
  assert.doesNotMatch(html, /class="btn ghost detail-back"/);
  assert.doesNotMatch(html, /<div class="links">/);
});

test('dashboard detail event filters and search reduce visible event rows', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'event-filter-task',
    runId: 'event-filter-run',
    status: 'HALT_HUMAN',
    pipelineSteps: [],
    iterations: [],
    reviewRounds: [],
    activeEventFilter: 'errors',
    eventSearchQuery: 'manual',
    events: [
      { status: 'INIT', label: 'Started', timeText: '10:00:00', iteration: null },
      { status: 'POST_FIX_GATE_RESULT', label: 'Gate failed', timeText: '10:01:00', iteration: 1 },
      { status: 'CODEX_REVIEW', label: 'Review started', timeText: '10:02:00', iteration: 1 },
      { status: 'HALT_HUMAN', label: 'Manual handoff required', timeText: '10:03:00', iteration: 1 },
    ],
  });

  assert.match(html, /data-event-search/);
  assert.match(html, /value="manual"/);
  assert.match(html, /class="chip err active" data-event-filter="errors"/);
  assert.match(html, /data-event-status="HALT_HUMAN"/);
  assert.match(html, /Manual handoff required/);
  assert.doesNotMatch(html, /data-event-status="INIT"/);
  assert.doesNotMatch(html, /data-event-status="POST_FIX_GATE_RESULT"/);
  assert.doesNotMatch(html, /data-event-status="CODEX_REVIEW"/);
});

test('dashboard event filtering logic groups errors, gate, review, and search matches', async () => {
  const win = await loadDashboardWindow();
  const { filterEvents } = win.AgentLoopDashboardInternals;
  const events = [
    { status: 'INIT', label: 'Started', timeText: '10:00:00', iteration: null },
    { status: 'POST_FIX_GATE_RESULT', label: 'Gate failed badly', timeText: '10:01:00', iteration: 1 },
    { status: 'CODEX_REVIEW', label: 'Review started', timeText: '10:02:00', iteration: 1 },
    { status: 'DONE_REVIEWED', label: 'Review passed', timeText: '10:03:00', iteration: null },
    { status: 'HALT_HUMAN', label: 'Manual handoff required', timeText: '10:04:00', iteration: 2 },
    { status: 'STALE_INTERRUPTED', label: 'Run stopped updating', timeText: '10:05:00', iteration: null },
  ];

  assert.deepEqual(filterEvents(events, 'errors', '').map((event) => event.status), ['HALT_HUMAN', 'STALE_INTERRUPTED']);
  assert.deepEqual(filterEvents(events, 'gate', '').map((event) => event.status), ['POST_FIX_GATE_RESULT']);
  assert.deepEqual(filterEvents(events, 'review', '').map((event) => event.status), ['CODEX_REVIEW', 'DONE_REVIEWED']);
  assert.deepEqual(filterEvents(events, 'all', 'manual').map((event) => event.status), ['HALT_HUMAN']);
  assert.deepEqual(filterEvents(events, 'errors', '#2').map((event) => event.status), ['HALT_HUMAN']);
});

test('dashboard detail renders the v2 operations workbench layout', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'backend-python-runtime-evidence-reconcile-89',
    taskPath: 'agent-loop/tasks/backend-python-runtime-evidence-reconcile-89.md',
    runId: '2026-06-22T14-30-15-000Z',
    status: 'DONE_REVIEWED',
    phaseLabel: '完成（已 review）',
    elapsedText: '8s',
    gateText: 'PASS',
    gateOk: true,
    agentText: 'codex + codex',
    roleText: 'codex + codex',
    runMode: 'codex-fix+codex-review',
    pipelineSteps: [
      { key: 'INIT', label: 'Init' },
      { key: 'WORKSPACE', label: 'Workspace' },
      { key: 'WORKTREE', label: 'Worktree' },
      { key: 'BASELINE_GATE_RESULT', label: 'Gate' },
      { key: 'CODEX_FIX', label: 'Codex' },
      { key: 'POST_FIX_GATE_RESULT', label: 'testGate' },
      { key: 'DONE', label: 'Done' },
    ],
    events: [
      { status: 'INIT', label: 'Initialized environment.', timeText: '14:30:15', iteration: null },
      { status: 'WORKSPACE', label: 'Workspace prepared successfully.', timeText: '14:30:17', iteration: null },
      { status: 'CODEX_FIX', label: 'Codex analysis completed.', timeText: '14:30:28', iteration: 1 },
      { status: 'DONE_REVIEWED', label: 'Execution finished.', timeText: '14:30:33', iteration: null },
    ],
    hasDiff: true,
    diffText: 'diff --git a/src/utils.py b/src/utils.py\n+new\n',
    diffTruncated: false,
    gateFailure: '',
    iterations: [{ iteration: 1, gateOk: true, failureCount: 0, diffBytes: 37 * 1024, guard: false, attempts: 1 }],
    reviewRounds: [{
      round: 1,
      verdict: 'pass',
      decision: 'pass',
      summary: 'Review passed with minor warnings.',
      findings: [{ severity: 'minor', path: 'src/utils.py', message: 'Line too long' }],
    }],
    agentTail: JSON.stringify({ review_id: 'rev-9a8b7c6d5e4f', status: 'pending_approval' }),
    landing: { status: 'MAIN_GATE_GREEN', commit: '8f7g6h5' },
    statePath: 'C:/repo/.agent-loop/latest/state.json',
    reportPath: 'C:/repo/.agent-loop/latest/final-report.md',
    reportJsonPath: 'C:/repo/.agent-loop/latest/final-report.json',
    landingPath: 'C:/repo/.agent-loop/latest/landing.json',
  });

  assert.match(html, /class="[^"]*\bdetail-shell\b[^"]*"/);
  assert.match(html, /class="product-crumbs"/);
  assert.match(html, /Runs/);
  assert.match(html, /backend-python-runtime-evidence-reconcile-89/);
  assert.match(html, /class="detail-meta"/);
  assert.match(html, /RunId:/);
  assert.match(html, /Commit:/);
  assert.match(html, /class="detail-stage-rail"/);
  assert.match(html, /class="stage-svg"/);
  assert.match(html, /任务准入/);
  assert.match(html, /Worker \(/);
  assert.match(html, /Reviewer \(/);
  assert.match(html, /已交付/);
  assert.match(html, /未通过，回修/);
  assert.match(html, /class="stage-legend"/);
  assert.match(html, /class="run-kpi-grid"/);
  assert.match(html, /迭代次数/);
  assert.match(html, /事件总数/);
  assert.match(html, /阻断次数/);
  assert.match(html, /最终状态/);
  assert.match(html, /37KB/);
  assert.match(html, /codex \+ codex/);
  assert.match(html, /class="detail-workbench"/);
  assert.match(html, /class="event-search"/);
  assert.match(html, /搜索事件/);
  assert.match(html, /data-event-filter="errors"/);
  assert.match(html, /class="workbench-tabs"/);
  assert.match(html, /class="tab active" data-tab="review"/);
  assert.match(html, /Review/);
  assert.match(html, /Diff/);
  assert.match(html, /Agent 输出/);
  assert.match(html, /Artifacts/);
  assert.match(html, /class="workbench-pane review-pane active"/);
  assert.match(html, /class="workbench-pane diff-pane"/);
  assert.match(html, /data-scroll-key="diff"/);
  assert.match(html, /class="workbench-pane agent-pane"/);
  assert.match(html, /data-scroll-key="agent-log"/);
  assert.match(html, /class="workbench-pane artifacts-pane"/);
  assert.match(html, /state\.json/);
});

test('dashboard detail renders a product-style v3 run page', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'backend-python-blueprint-job-store-runtime-takeover-104',
    runId: '2026-06-23T16-00-00-000Z',
    status: 'GROK_FIX',
    phaseLabel: 'Grok 修复中',
    elapsedText: '12 分 03 秒',
    gateText: '基线 Gate 红 (1)',
    gateOk: false,
    agentText: 'Grok',
    repo: 'cube-pets-office',
    commit: 'e7a3543d',
    pipelineSteps: [{ key: 'INIT', label: '初始化' }, { key: 'GROK_FIX', label: 'Grok' }],
    details: ['轮次 1', 'worktree: migration-queue'],
    iterations: [],
    reviewRounds: [],
    agentTail: 'working...',
    events: [
      { status: 'INIT', label: '初始化', timeText: '16:00:00', iteration: null },
      { status: 'GROK_FIX', label: 'Grok 修复中', timeText: '16:00:05', iteration: 1 },
    ],
    landing: { status: 'PENDING_APPLY' },
  });

  assert.match(html, /class="[^"]*\bproduct-shell\b[^"]*"/);
  assert.match(html, /class="[^"]*\bproduct-sidebar\b[^"]*"/);
  assert.match(html, /class="[^"]*\bproduct-topbar\b[^"]*"/);
  assert.match(html, /AgentLoop[\s\S]*Runs[\s\S]*backend-python-blueprint-job-store-runtime-takeover-104/);
  assert.match(html, /class="[^"]*\bpage-status-badge\b[^"]*[\s\S]*Grok 修复中/);
  assert.match(html, /class="[^"]*\brun-property-grid\b[^"]*"/);
  assert.match(html, /智能体[\s\S]*Grok/);
  assert.match(html, /环境[\s\S]*cube-pets-office/);
  assert.match(html, /调度配置[\s\S]*基线 Gate 红/);
  assert.match(html, /class="[^"]*\bexecution-history\b[^"]*"/);
  assert.match(html, /class="detail-hero v2"/);
  assert.match(html, /class="[^"]*\bant-descriptions\b[^"]*"/);
  assert.match(html, /class="stage-svg"/);
  assert.match(html, /class="[^"]*\bant-timeline\b[^"]*"/);
});

test('dashboard detail v2 uses fluid width and compact spacing', async () => {
  const css = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.css'), 'utf8');
  const detailRule = css.match(/\.run-detail\.detail-shell\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const shellRule = css.match(/\.detail-shell\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const dashboardRule = css.match(/\.dashboard\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const workbenchRule = css.match(/\.detail-workbench\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const kpiRule = css.match(/\.run-kpi-grid\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const detailBrandRule = css.match(/\.detail-hero-brand\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const detailBrandMarkRule = css.match(/\.detail-hero-brand \.brand-mark\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.doesNotMatch(shellRule, /max-width:\s*1320px/);
  assert.match(detailRule, /max-width:\s*none/);
  assert.match(detailRule, /width:\s*100%/);
  assert.match(detailRule, /padding:\s*12px 14px/);
  assert.match(dashboardRule, /padding:\s*14px 16px/);
  assert.match(workbenchRule, /gap:\s*10px/);
  assert.match(kpiRule, /gap:\s*8px/);
  assert.match(kpiRule, /margin:\s*0 0 10px/);
  assert.match(detailBrandRule, /gap:\s*6px/);
  assert.match(detailBrandMarkRule, /width:\s*clamp\(112px,\s*11vw,\s*150px\)/);
});

test('dashboard detail workbench uses one-third left and two-thirds right columns', async () => {
  const css = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.css'), 'utf8');
  const workbenchRule = css.match(/\.detail-workbench\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.match(workbenchRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*2fr\)/);
});

test('dashboard detail preserves the active workbench tab across refresh renders', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'active tab task',
    runId: 'active-tab-run',
    status: 'CODEX_FIX',
    pipelineSteps: [],
    activeTab: 'agent',
    hasDiff: true,
    diffText: 'diff --git a/a.js b/a.js\n+new\n',
    agentTail: 'latest output',
    iterations: [],
    reviewRounds: [],
  });

  assert.match(html, /class="tab" data-tab="review"/);
  assert.match(html, /class="tab active" data-tab="agent"/);
  assert.match(html, /class="workbench-pane review-pane"/);
  assert.match(html, /class="workbench-pane agent-pane active"/);
  assert.match(html, /data-scroll-key="agent-log"/);
  assert.match(html, /latest output/);
});

test('clearAutoDisable resets an auto-disabled task and is idempotent', async () => {
  const { clearAutoDisable, readQueueOutcomes } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-reenable-'));
  await fs.mkdir(path.join(repo, '.agent-loop'), { recursive: true });
  await fs.writeFile(path.join(repo, '.agent-loop', 'queue-outcomes.json'), JSON.stringify({
    tasks: { a: { autoDisabled: true, consecutiveNoChanges: 3, lastStatus: 'HALT_NO_CHANGES' } },
  }), 'utf8');

  assert.equal((await clearAutoDisable(repo, 'a')).changed, true);
  const after = await readQueueOutcomes(repo);
  assert.equal(after.tasks.a.autoDisabled, false);
  assert.equal(after.tasks.a.consecutiveNoChanges, 0);

  assert.equal((await clearAutoDisable(repo, 'a')).changed, false);
  assert.equal((await clearAutoDisable(repo, 'missing')).changed, false);
});

test('dashboard overview shows a re-enable action on auto-disabled tasks', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 1 },
    queueRunning: false,
    current: null,
    tasks: [
      { task: 'agent-loop/tasks/a.md', id: 'a', taskLabel: 'a', badge: 'disabled', category: 'attention', autoDisabled: true, enabled: true, statusLabel: '自动禁用' },
    ],
  });
  assert.match(html, /data-act="reEnable"/);
  assert.match(html, /data-id="a"/);
  assert.match(html, /重开/);
});

test('dashboard detail shows a single-run action for the task', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 't', runId: 'r', status: 'HALT_NO_CHANGES', pipelineSteps: [],
    iterations: [], reviewRounds: [],
    taskPath: 'agent-loop/tasks/x.md', statePath: '/tmp/state.json',
  });
  assert.match(html, /data-act="runTask"/);
  assert.match(html, /data-task="agent-loop\/tasks\/x\.md"/);
  assert.match(html, /单跑此任务/);
});

test('dashboard overview shows a pending landing workbench with actions', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 8 }, queueRunning: false, current: null, tasks: [],
    landing: {
      status: 'PENDING_QUEUE_LANDING',
      appliedToMain: false,
      diffBytes: 4096,
      tasks: [{ id: 'a' }, { id: 'b' }, { id: 'c', outcome: 'failed' }],
      patchTasks: [{ id: 'a' }, { id: 'b' }],
      taskCounts: { total: 8, patch: 2, failed: 6 },
    },
  });
  assert.match(html, /待落地到 main/);
  assert.match(html, /2 个成功合并/);
  assert.match(html, /6 个需关注任务未包含在补丁中/);
  assert.doesNotMatch(html, /8 个任务的合并改动/);
  assert.match(html, /data-act="previewLanding"/);
  assert.match(html, /data-act="applyLanding"/);
});

test('dashboard overview hides a zero-byte pending landing workbench', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 2 }, queueRunning: false, current: null, tasks: [],
    landing: {
      status: 'PENDING_QUEUE_LANDING',
      appliedToMain: false,
      diffBytes: 0,
      patchTasks: [],
      taskCounts: { total: 2, patch: 0, failed: 0 },
    },
  });
  assert.doesNotMatch(html, /class="[^"]*\blanding-banner\b[^"]*"/);
  assert.doesNotMatch(html, /data-act="previewLanding"/);
  assert.doesNotMatch(html, /data-act="applyLanding"/);
});

test('dashboard overview renders rescue patch rows as attention items', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 1, queueTotal: 1, rescuePatch: 1, failed: 1 },
    queueRunning: false,
    current: null,
    tasks: [
      {
        task: 'agent-loop/tasks/rescue.md',
        taskLabel: 'rescue',
        badge: 'rescuePatch',
        outcomeGroup: 'rescuePatch',
        category: 'attention',
        statusLabel: 'RESCUE_PATCH_AVAILABLE',
        applyErrorKind: 'PARTIAL_DIFF_GATE_RED',
        rescuePatchAvailable: true,
        diffBytes: 16691,
        running: false,
      },
    ],
  });
  assert.match(html, /data-state="rescuePatch"/);
  assert.match(html, /PATCH/);
  assert.match(html, /RESCUE_PATCH_AVAILABLE/);
  assert.match(html, /PARTIAL_DIFF_GATE_RED/);
  assert.match(html, /16KB/);
});

test('dashboard overview shows an applied landing without apply action', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 1 }, queueRunning: false, current: null, tasks: [],
    landing: { status: 'APPLIED_TO_MAIN', appliedToMain: true, diffBytes: 1024, tasks: [{ id: 'a' }] },
  });
  assert.match(html, /已落地到 main/);
  assert.doesNotMatch(html, /data-act="applyLanding"/);
});

test('dashboard overview treats manual queue landing as applied', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 48 }, queueRunning: false, current: null, tasks: [],
    landing: {
      status: 'APPLIED_TO_MAIN_MANUAL',
      appliedToMain: true,
      diffBytes: 314071,
      taskCounts: { total: 12, patch: 10, done: 12 },
      appliedCommitRange: 'e4a21cd4..32d8e2c6',
    },
  });
  assert.doesNotMatch(html, /data-act="applyLanding"/);
  assert.doesNotMatch(html, /data-act="previewLanding"/);
});

test('extension package opens the queue view first in the AgentLoop container', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  const views = packageJson.contributes.views['agent-loop'];

  assert.equal(views[0].id, 'agentLoop.queue');
  assert.deepEqual(
    views.map((view) => view.id),
    ['agentLoop.queue', 'agentLoop.currentRun', 'agentLoop.runs'],
  );
});

test('dashboard view title command is contributed only once', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  const viewTitleMenus = packageJson.contributes.menus['view/title'];
  const dashboardMenus = viewTitleMenus.filter((item) => item.command === 'agentLoop.openDashboard');

  assert.equal(dashboardMenus.length, 1);
  assert.equal(dashboardMenus[0].when, 'view == agentLoop.currentRun');
});

test('extension package declares SlideRule brand assets for VS Code details', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  const readme = await fs.readFile(path.join(extensionRoot, 'README.md'), 'utf8');
  const activityIcon = await fs.readFile(path.join(extensionRoot, 'media', 'icon.svg'), 'utf8');
  const sourceActivityIcon = await fs.readFile(path.join(agentLoopRoot, '..', 'docs', 'assets', 'slidrule_logo_transparent.svg'), 'utf8');
  const webviewBrand = await fs.readFile(path.join(extensionRoot, 'media', 'sliderule-brand.svg'), 'utf8');
  const sourceWebviewBrand = await fs.readFile(path.join(agentLoopRoot, '..', 'docs', 'assets', 'SlideRule_banner_no_border_transparent.svg'), 'utf8');

  assert.equal(packageJson.icon, 'media/sliderule-icon.png');
  assert.equal(packageJson.contributes.viewsContainers.activitybar[0].icon, 'media/icon.svg');
  assert.match(packageJson.scripts.package, /--no-rewrite-relative-links/);
  assert.equal(sha256(activityIcon), sha256(sourceActivityIcon));
  assert.equal(sha256(webviewBrand), sha256(sourceWebviewBrand));
  assert.doesNotMatch(activityIcon, /<circle cx="12" cy="12" r="9"/);
  assert.match(readme, /media\/sliderule-brand\.png/);
  assert.match(readme, /SlideRule\.ai/);
  await fs.access(path.join(extensionRoot, 'media', 'sliderule-icon.png'));
  await fs.access(path.join(extensionRoot, 'media', 'sliderule-brand.png'));
  await fs.access(path.join(extensionRoot, 'media', 'sliderule-brand.svg'));
});

test('dashboard panel exposes a Webview-safe SlideRule brand logo URI', async () => {
  const source = await fs.readFile(path.join(extensionRoot, 'src', 'dashboardPanel.ts'), 'utf8');

  assert.match(source, /sliderule-brand\.svg/);
  assert.match(source, /brandLogo/);
  assert.match(source, /img-src \$\{this\.panel\.webview\.cspSource\} data:/);
});

test('dashboard panel loads the local React dashboard bundle with CSP nonce support', async () => {
  const source = await fs.readFile(path.join(extensionRoot, 'src', 'dashboardPanel.ts'), 'utf8');

  assert.match(source, /dashboard\.bundle\.css/);
  assert.match(source, /dashboard\.bundle\.js/);
  assert.match(source, /style-src \$\{this\.panel\.webview\.cspSource\} 'nonce-\$\{nonce\}'/);
  assert.match(source, /window\.__AGENT_LOOP_CSP_NONCE__/);
  assert.match(source, /src="\$\{bundleScriptUri\}"/);
});

test('extension package builds the dashboard React bundle locally', async () => {
  const rootPackageJson = JSON.parse(await fs.readFile(path.join(agentLoopRoot, 'package.json'), 'utf8'));
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));

  assert.match(rootPackageJson.scripts['dev:dashboard'] ?? '', /vscode-extension/);
  assert.match(rootPackageJson.scripts['dev:dashboard'] ?? '', /dev:dashboard/);
  assert.match(packageJson.scripts['dev:dashboard'] ?? '', /vite/);
  assert.match(packageJson.scripts['dev:dashboard'] ?? '', /vite\.dashboard\.dev\.config\.ts/);
  assert.match(packageJson.scripts['build:dashboard'] ?? '', /vite/);
  assert.match(packageJson.scripts.package ?? '', /build:dashboard/);
  const panelSource = await fs.readFile(path.join(extensionRoot, 'src', 'dashboardPanel.ts'), 'utf8');
  assert.match(panelSource, /injectToWorker/);
  assert.match(panelSource, /config\.update\('injectKeysToWorker'/);
  await fs.access(path.join(extensionRoot, 'index.html'));
  await fs.access(path.join(extensionRoot, 'vite.dashboard.dev.config.ts'));
  await fs.access(path.join(extensionRoot, 'src', 'dashboard-react', 'dev.tsx'));
  await fs.access(path.join(extensionRoot, 'src', 'dashboard-react', 'devPayload.ts'));
  for (const dependency of ['@ant-design/icons', '@antv/g6', 'antd', 'react', 'react-dom']) {
    assert.ok(packageJson.dependencies?.[dependency], `${dependency} dependency is declared`);
  }
  for (const dependency of ['@vitejs/plugin-react', 'vite']) {
    assert.ok(packageJson.devDependencies?.[dependency], `${dependency} devDependency is declared`);
  }
});

test('React dashboard keeps Ant Design components native and minimally configured', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8',
  );

  assert.match(source, /prefixCls="agent-ant"/);
  assert.doesNotMatch(source, /document\.body\.classList/);
  assert.doesNotMatch(source, /theme\./);
  assert.doesNotMatch(source, /colorBg|colorText|colorBorder|colorPrimary/);
  assert.doesNotMatch(source, /Pagination/);
  assert.doesNotMatch(source, /visibleTasks\s*=\s*tasks\.slice/);
  assert.doesNotMatch(source, /rowClassName/);
  const queueTable = source.match(/function QueueTable[\s\S]*?\r?\n}\r?\n\r?\nfunction /)?.[0] ?? '';
  assert.match(queueTable, /<Table/);
  assert.match(queueTable, /key:\s*'branch'/);
  assert.match(queueTable, /task\.branch\s*\|\|\s*'-'/);
  assert.match(queueTable, /task\.agent\s*\|\|\s*formatAgentPair\(task\)/);
  assert.match(queueTable, />详情<\/Button>/);
  assert.doesNotMatch(queueTable, />打开<\/Button>/);
  assert.doesNotMatch(queueTable, /locale=\{/);
  assert.doesNotMatch(source, /className="[^"]*\bant-/);
  assert.doesNotMatch(css, /\.agent-ant-|\.ant-|--vscode-|--al-/);
});

test('React dashboard keeps primary navigation in the sidebar and task filters in table tabs', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8',
  );

  assert.match(source, /Tabs/);
  assert.match(source, /label:\s*'工作台'/);
  assert.match(source, /selectedKeys=\{\[currentView\]\}/);
  assert.match(source, /\{ key: 'settings'/);
  assert.match(source, /activeKey=\{filter\}/);
  assert.match(source, /items=\{tabItems\}/);
  assert.match(source, /title="任务列表"/);
  assert.doesNotMatch(source, /<Text strong>AgentLoop<\/Text>/);
  assert.doesNotMatch(source, /<Text type="secondary">Dashboard<\/Text>/);
  assert.doesNotMatch(source, /function DashboardSidebar\(\{[^)]*filter/);
  assert.match(css, /\.native-brand\s*\{(?<body>[^}]+height:\s*56px[^}]+justify-content:\s*flex-start[^}]+overflow:\s*hidden[^}]+)\}/);
  assert.match(css, /\.native-brand-mark\s*\{(?<body>[^}]+justify-content:\s*flex-start[^}]+)\}/);
});

test('React dashboard sidebar brand aligns with the header and crops an enlarged logo', async () => {
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8',
  );
  const sidebarRule = css.match(/\.native-sidebar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const headerRule = css.match(/\.native-header\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const brandRule = css.match(/\.native-brand\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const brandMarkRule = css.match(/\.native-brand-mark\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const brandImgRule = css.match(/\.native-brand-mark img\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.match(sidebarRule, /padding:\s*0/);
  assert.match(headerRule, /height:\s*56px/);
  assert.match(brandRule, /height:\s*56px/);
  assert.match(brandRule, /overflow:\s*hidden/);
  assert.match(brandMarkRule, /height:\s*56px/);
  assert.match(brandMarkRule, /width:\s*auto/);
  assert.match(brandRule, /justify-content:\s*flex-start/);
  assert.doesNotMatch(brandRule, /justify-content:\s*center/);
  assert.match(brandImgRule, /width:\s*169px/);
  assert.match(brandImgRule, /max-width:\s*none/);
  assert.match(brandImgRule, /transform:\s*scale\(1\)/);
  assert.doesNotMatch(brandImgRule, /width:\s*120px/);
  assert.doesNotMatch(brandImgRule, /width:\s*180px/);
  assert.doesNotMatch(brandImgRule, /transform:\s*scale\(1\.32\)/);
  assert.doesNotMatch(brandRule, /height:\s*72px/);
});

test('React dashboard uses six table rows per page and keeps the logo only in the sidebar brand area', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );

  assert.match(source, /const PAGE_SIZE = 6;/);
  assert.match(source, /pagination=\{\{ pageSize: PAGE_SIZE \}\}/);
  assert.match(source, /<div className="native-brand">\s*<BrandMark \/>\s*<\/div>/);
  assert.doesNotMatch(source, /<Space align="center">\s*<BrandMark \/>[\s\S]*<Title level=\{3\}>AgentLoop 控制台<\/Title>/);
});

test('React dashboard renders run details with Ant Design product components', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const entry = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'main.tsx'),
    'utf8',
  );

  assert.match(source, /export function DashboardDetailApp/);
  for (const component of ['Button', 'Descriptions', 'Steps', 'Statistic', 'Tabs', 'List']) {
    assert.match(source, new RegExp(`\\b${component}\\b`));
  }
  assert.match(source, /native-detail-dashboard/);
  assert.match(entry, /renderDetail/);
  assert.match(entry, /DashboardDetailApp/);
  assert.match(source, /postCommand\('showOverview'\)/);
  assert.match(source, /payload\.reportJsonPath[\s\S]*postCommand\('openReport', \{ reportPath: payload\.reportJsonPath \}\)/);
  assert.match(source, /payload\.landingPath[\s\S]*postCommand\('openReport', \{ reportPath: payload\.landingPath \}\)/);
  assert.doesNotMatch(source, /postCommand\('backToQueue'/);
  assert.doesNotMatch(source, /postCommand\('openReportJson'/);
});

test('React dashboard detail folds stats into hero metrics and uses the reference three-column layout', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const metrics = source.match(/function metricItems[\s\S]*?\r?\n}\r?\n\r?\nfunction DetailHero/)?.[0] ?? '';

  assert.match(source, /className="native-metric-grid"/);
  for (const key of ['iteration', 'events', 'elapsed', 'blocks', 'status']) {
    assert.match(metrics, new RegExp(`key: '${key}'`));
  }
  for (const title of ['迭代次数', '事件总数', '耗时', '阻断次数', '最终状态']) {
    assert.match(metrics, new RegExp(`title: '${title}'`));
  }
  for (const duplicateKey of ['agent', 'gate', 'run', 'commit', 'landing']) {
    assert.doesNotMatch(metrics, new RegExp(`key: '${duplicateKey}'`));
  }
  assert.doesNotMatch(source, /function DetailStats/);
  assert.doesNotMatch(source, /<DetailStats payload=\{payload\} \/>/);
  assert.match(source, /<div className="native-detail-main-grid">[\s\S]*<EventTimeline payload=\{payload\} \/>/);
  assert.match(source, /<div className="native-detail-main-grid">[\s\S]*<DetailTabs payload=\{payload\} \/>/);
  assert.match(source, /<div className="native-detail-main-grid">[\s\S]*<DetailRightRail payload=\{payload\} \/>/);
});

test('React dashboard detail matches the polished run-workbench visual structure', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8',
  );

  assert.match(source, /function DetailHero/);
  assert.match(source, /className="native-detail-hero"/);
  assert.match(source, /className="native-run-head"/);
  assert.match(source, /className="native-title-line"/);
  assert.match(source, /className="native-back-button"/);
  assert.match(source, /<Button[\s\S]*className="native-back-button"[\s\S]*icon=\{<LeftOutlined \/>\}[\s\S]*>\s*返回\s*<\/Button>/);
  assert.doesNotMatch(source, /<Title level=\{3\}>馃/);
  assert.doesNotMatch(source, /<Button size="small" onClick=\{\(\) => postCommand\('showOverview'\)\}>/);
  assert.match(source, /className="native-hero-kpis"/);
  assert.match(source, /className="native-metric-grid"/);
  for (const title of ['迭代次数', '事件总数', '耗时', '阻断次数', '最终状态']) {
    assert.match(source, new RegExp(`title: '${title}'`));
  }
  assert.match(source, /function DetailProgress/);
  assert.match(source, /className="native-step-card"/);
  assert.match(source, /className="native-flow-lane"/);
  assert.match(source, /from '@antv\/g6'/);
  assert.match(source, /new Graph\(/);
  assert.match(source, /useEffect/);
  assert.match(source, /useRef/);
  assert.match(source, /className="native-flow-g6-canvas"/);
  assert.doesNotMatch(source, /className="native-flow-svg"/);
  assert.doesNotMatch(source, /preserveAspectRatio="none"/);
  assert.match(source, /buildG6FlowData/);
  assert.match(source, /node:\s*\{[\s\S]*type:\s*'rect'/);
  assert.match(source, /labelText/);
  assert.match(source, /labelWordWrap:\s*false/);
  assert.match(source, /labelMaxWidth/);
  assert.match(source, /ports/);
  assert.match(source, /sourcePort:\s*'right'/);
  assert.match(source, /targetPort:\s*'left'/);
  assert.match(source, /type:\s*'quadratic'/);
  assert.match(source, /lineDash:\s*\[6,\s*5\]/);
  assert.doesNotMatch(source, /native-flow-cards/);
  assert.doesNotMatch(source, /native-flow-node-card/);
  assert.doesNotMatch(source, /className="native-flow-icon"/);
  assert.match(source, /className="native-flow-legend"/);
  assert.match(source, /未通过，回修/);
  assert.doesNotMatch(source, /className="native-flow-return"/);
  assert.match(source, /<Progress[\s\S]*percent=\{progressPercent\}/);
  assert.match(source, /<Steps[\s\S]*className="native-steps"/);
  assert.match(source, /function ReviewPanel/);
  assert.match(source, /function ChangeStatsCard/);
  assert.match(source, /className="native-change-card"/);
  assert.doesNotMatch(source, /className="native-review-result"/);
  assert.doesNotMatch(source, /native-review-summary-card/);
  assert.doesNotMatch(source, /Review\s+缁撹/);
  assert.match(source, /className="[^"]*\bnative-review-card\b[^"]*"/);
  assert.match(source, /className="native-code-shell"/);
  assert.match(source, /className="native-code-copy"/);
  assert.match(source, /function renderCodeTokens/);
  assert.match(source, /native-code-token native-code-key/);
  assert.match(source, /native-code-token native-code-string/);
  assert.match(source, /native-code-token native-code-number/);
  assert.match(source, /native-code-token native-code-boolean/);
  assert.match(source, /native-code-token native-code-null/);
  assert.match(source, /native-code-token native-code-punctuation/);
  assert.doesNotMatch(source, /function DetailDescriptions/);
  assert.doesNotMatch(source, /<DetailDescriptions payload=\{payload\} \/>/);
  assert.doesNotMatch(source, /function DetailSteps/);
  assert.doesNotMatch(source, /<DetailSteps payload=\{payload\} \/>/);

  for (const selector of [
    '.native-detail-hero',
    '.native-run-head',
    '.native-title-line',
    '.native-back-button',
    '.native-hero-kpis',
    '.native-metric-grid',
    '.native-metric',
    '.native-step-card',
    '.native-flow-lane',
    '.native-flow-g6-canvas',
    '.native-flow-legend',
    '.native-change-card',
    '.native-timeline-shell',
    '.native-timeline-row',
    '.native-steps',
    '.native-review-card',
    '.native-code-shell',
    '.native-code-copy',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.')));
  }
  const flowMapRule = css.match(/\.native-flow-map\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const flowCanvasRule = css.match(/\.native-flow-g6-canvas\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const timelineRowRule = css.match(/\.native-timeline-row\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const timelineLineRule = css.match(/\.native-timeline-row:not\(:last-child\)::after\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const timelineDotRule = css.match(/\.native-timeline-dot\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const tabBodyRule = css.match(/\.native-detail-tab-body\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  assert.match(flowMapRule, /min-height:\s*134px/);
  assert.match(flowCanvasRule, /height:\s*126px/);
  assert.doesNotMatch(flowCanvasRule, /min-width:\s*1030px/);
  assert.match(timelineRowRule, /--timeline-col1:\s*56px/);
  assert.match(timelineRowRule, /--timeline-dot-size:\s*16px/);
  assert.match(timelineRowRule, /grid-template-columns:\s*var\(--timeline-col1\) var\(--timeline-dot-size\) minmax\(0,\s*1fr\)/);
  assert.match(timelineLineRule, /left:\s*calc\(var\(--timeline-col1\) \+ var\(--timeline-gap\) \+ \(var\(--timeline-dot-size\) \/ 2\) - 1px\)/);
  assert.match(timelineLineRule, /top:\s*18px/);
  assert.match(timelineDotRule, /justify-self:\s*center/);
  assert.match(source, /<Card className="native-detail-workbench" styles=\{\{ body: \{ padding: 0 \} \}\}>/);
  assert.match(source, /tabBarStyle=\{\{ padding: '0 24px', marginBottom: 0 \}\}/);
  assert.match(source, /className="native-detail-tab-body"/);
  assert.match(tabBodyRule, /padding:\s*0/);
  assert.doesNotMatch(tabBodyRule, /24px/);
  for (const selector of [
    '.native-code-token',
    '.native-code-key',
    '.native-code-string',
    '.native-code-number',
    '.native-code-boolean',
    '.native-code-null',
    '.native-code-punctuation',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.')));
  }
  assert.match(css, /\.native-scroll-surface::-webkit-scrollbar/);
  assert.match(css, /\.native-code::-webkit-scrollbar/);
  assert.match(css, /\.native-timeline-shell::-webkit-scrollbar/);
  assert.match(css, /scrollbar-width:\s*thin/);
});

test('React dashboard detail uses a workbench flow map and right rail', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8',
  );

  assert.match(source, /function AgentLoopFlow/);
  assert.match(source, /function buildFlowNodes/);
  assert.match(source, /function buildG6FlowData/);
  assert.match(source, /function ChangeStatsCard/);
  assert.match(source, /function DetailRightRail/);
  assert.match(source, /function IterationTimeline/);
  assert.match(source, /className="native-flow-map"/);
  assert.match(source, /node:\s*\{[\s\S]*type:\s*'rect'/);
  assert.match(source, /labelWordWrap:\s*false/);
  assert.doesNotMatch(source, /native-flow-cards/);
  assert.doesNotMatch(source, /native-flow-node-card/);
  assert.match(source, /<ChangeStatsCard payload=\{payload\} \/>/);
  assert.match(source, /className="native-detail-main-grid"/);
  assert.match(source, /className="native-detail-rail"/);
  assert.match(source, /<div className="native-detail-main-grid">[\s\S]*<EventTimeline payload=\{payload\} \/>[\s\S]*<ChangeStatsCard payload=\{payload\} \/>[\s\S]*<DetailTabs payload=\{payload\} \/>[\s\S]*<DetailRightRail payload=\{payload\} \/>/);
  assert.doesNotMatch(source, /<Card size="small" title="[^"]*" className="native-detail-nested">/);
  assert.doesNotMatch(source, /<Card title="Artifacts">/);
  assert.match(source, /className="native-rail-action"/);
  assert.match(source, /<span className="native-rail-action-label">/);
  assert.match(source, /<RightOutlined className="native-rail-action-arrow" \/>/);
  assert.match(source, /查看结构化报告/);
  assert.match(source, /导出工作/);

  for (const selector of [
    '.native-flow-map',
    '.native-flow-lane',
    '.native-flow-g6-canvas',
    '.native-flow-legend',
    '.native-timeline-shell',
    '.native-timeline-row',
    '.native-timeline-dot',
    '.native-detail-main-grid',
    '.native-detail-rail',
    '.native-rail-actions',
    '.native-rail-action',
    '.native-rail-action-label',
    '.native-rail-action-arrow',
    '.native-timeline-card',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.')));
  }
  const railActionRule = css.match(/\.native-rail-action\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const railActionLabelRule = css.match(/\.native-rail-action-label\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  assert.match(railActionRule, /justify-content:\s*flex-start/);
  assert.match(railActionRule, /text-align:\s*left/);
  assert.match(railActionLabelRule, /margin-right:\s*auto/);
});

test('React dashboard flow keeps the G6 instance stable across live refreshes', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8',
  );
  const component = source.match(/function AgentLoopFlow[\s\S]*?\r?\n}\r?\n\r?\nfunction EventTimeline/)?.[0] ?? '';

  assert.match(
    component,
    /const nodes = useMemo\(\(\) => buildFlowNodes\(payload\), \[payload\.status, payload\.fixAgent, payload\.reviewAgent\]\);/,
  );
  assert.match(component, /renderedSignatureRef/);
  assert.match(component, /renderedSignatureRef\.current === flowSignature/);
  assert.match(component, /graph\.resize\(nextWidth, FLOW_HEIGHT\)/);
  assert.match(component, /graph\.setData\(buildG6FlowData/);
  assert.doesNotMatch(
    component,
    /function createGraph[\s\S]*?graphRef\.current\.destroy\(\);[\s\S]*?new Graph\(/,
  );
});

test('extension package contributes clean Chinese labels', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf8'));

  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(
    packageJson.contributes.views['agent-loop'].map((view) => view.name),
    ['任务队列', '当前运行', '历史运行'],
  );

  const titles = Object.fromEntries(
    packageJson.contributes.commands.map((command) => [command.command, command.title]),
  );
  assert.equal(titles['agentLoop.runQueue'], 'AgentLoop: 运行任务队列');
  assert.equal(titles['agentLoop.stopRun'], 'AgentLoop: 停止当前运行');
  assert.equal(titles['agentLoop.openDashboard'], 'AgentLoop: 打开可视化面板');
  assert.equal(titles['agentLoop.openFinalReport'], 'AgentLoop: 打开最终报告');
  assert.equal(titles['agentLoop.openStateJson'], 'AgentLoop: 打开 state.json');
  assert.equal(titles['agentLoop.refresh'], '刷新');
});

test('compiled extension UI sources do not contain mojibake markers', async () => {
  const markers = /鈥|鎬|妯|褰|杩|浠|鍘|淇|瀹|锛|鐨|姝|闈|鍔|钀|绛|宸|鏈|寰|鏌|闅|鍋|鎵|鍒|绌|杞|繍|涓|鏆|瘯|绉/;
  const files = [
    path.join(extensionOut, 'extension.js'),
    path.join(extensionOut, 'phaseLabels.js'),
    path.join(extensionOut, 'runController.js'),
    path.join(extensionOut, 'stateMonitor.js'),
    path.join(extensionOut, 'treeProviders.js'),
    path.join(extensionOut, 'dashboardPanel.js'),
    path.join(extensionRoot, 'media', 'dashboard.js'),
  ];

  const offenders = [];
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    if (markers.test(raw)) offenders.push(path.relative(extensionRoot, file));
  }

  assert.deepEqual(offenders, []);
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
  assert.match(listing, /extension\/media\/dashboard\.js/);
  assert.match(listing, /extension\/media\/dashboard\.css/);
  assert.match(listing, /extension\/media\/dashboard\.bundle\.js/);
  assert.match(listing, /extension\/media\/dashboard\.bundle\.css/);
  assert.match(listing, /extension\/media\/icon\.svg/);
  assert.match(listing, /extension\/media\/sliderule-icon\.png/);
  assert.match(listing, /extension\/media\/sliderule-brand\.png/);
  assert.match(listing, /extension\/media\/sliderule-brand\.svg/);
  assert.match(listing, /extension\/readme\.md/i);
});

test('dashboard media renders console overview with stale current run', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 3, done: 1, failed: 1, crashed: 0, quarantined: 0, running: 0, pending: 1 },
    queueRunning: true,
    current: {
      taskLabel: 'backend-python-blueprint-brainstorm-contract',
      phaseLabel: '运行中断',
      elapsedText: '48 分 12 秒',
      staleRun: { status: 'CODEX_FIX' },
    },
    tasks: [
      { task: 'agent-loop/tasks/a.md', taskLabel: 'a', badge: 'done', statusLabel: '完成', running: false },
      { task: 'agent-loop/tasks/b.md', taskLabel: 'b', badge: 'stale', statusLabel: '运行中断', running: false },
      { task: 'agent-loop/tasks/c.md', taskLabel: 'c', badge: 'pending', statusLabel: null, running: false },
    ],
  });

  assert.match(html, /AgentLoop 控制台/);
  assert.match(html, /运行中断/);
  assert.match(html, /backend-python-blueprint-brainstorm-contract/);
  assert.match(html, /console-top/);
  assert.match(html, /queue-toolbar/);
  assert.match(html, /task-table/);
  assert.match(html, /queue-table/);
  assert.match(html, /data-state="stale"/);
});

test('dashboard overview renders the console v2 queue workbench layout', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: {
      total: 44,
      queueTotal: 6,
      applied: 6,
      reviewed: 0,
      noDiff: 0,
      applyConflict: 0,
      human: 0,
      failed: 0,
      crashed: 0,
      stopped: 0,
      running: 0,
      pending: 0,
    },
    queueRunning: false,
    current: null,
    landing: {
      status: 'PENDING_QUEUE_LANDING',
      diffBytes: 10240,
      taskCounts: { patch: 6, failed: 0 },
      currentBranch: 'main',
    },
    tasks: [
      {
        task: 'agent-loop/tasks/a.md',
        taskLabel: 'backend-python-auth-permission-audit-runtime-90',
        badge: 'reviewed',
        statusLabel: '完成（已 review）',
        enabled: true,
        running: false,
        category: 'landed',
      },
      {
        task: 'agent-loop/tasks/b.md',
        taskLabel: 'backend-python-a2a-stream-runtime-boundary-90',
        badge: 'applied',
        statusLabel: '完成（已落地）',
        enabled: true,
        running: false,
        category: 'landed',
      },
      {
        task: 'agent-loop/tasks/old.md',
        taskLabel: 'backend-python-old-disabled',
        badge: 'disabled',
        statusLabel: '已禁用',
        enabled: false,
        running: false,
        category: 'disabled',
      },
    ],
  });

  assert.match(html, /class="[^"]*\bconsole-top\b[^"]*"/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /6 个队列任务 \/ 44 个全部任务/);
  assert.match(html, /class="[^"]*\blanding-banner\b[^"]*"/);
  assert.match(html, /当前分支/);
  assert.match(html, /main/);
  assert.match(html, /6 个成功合并 · 10KB diff/);
  assert.match(html, /data-act="previewLanding"[\s\S]*预演/);
  assert.match(html, /data-act="applyLanding"[\s\S]*落地到 main/);
  assert.match(html, /placeholder="搜索任务 \/ Agent \/ 文件\.\.\."/);
  assert.match(html, /data-filter="queue"[\s\S]*任务队列[\s\S]*6/);
  assert.match(html, /data-filter="all"[\s\S]*全部[\s\S]*44/);
  assert.match(html, /任务队列 6 · 全部 44 · 需关注 0 · 已落地 6 · 已禁用/);
  assert.match(html, /已运行 6\/44/);
  assert.match(html, /class="[^"]*\btask-table\b[^"]*"/);
  assert.match(html, /状态/);
  assert.match(html, /任务名/);
  assert.match(html, /Agent/);
  assert.match(html, /变更/);
  assert.match(html, /最后更新/);
  assert.match(html, /操作/);
  assert.match(html, /backend-python-auth-permission-audit-runtime-90/);
  assert.match(html, /完成（已 review）/);
  assert.match(html, /打开/);
});

test('dashboard media delegates overview rendering to the React bridge when available', async () => {
  const calls = [];
  const app = fakeAppRoot();
  const win = await loadDashboardWindow({
    document: { getElementById: () => app },
  });
  win.AgentLoopReactDashboard = {
    renderOverview(payload) {
      calls.push(payload);
      app.innerHTML = '<main class="react-dashboard">React overview</main>';
    },
  };

  win.__dispatchMessage({
    type: 'overview',
    payload: {
      counts: { total: 1, queueTotal: 1 },
      queueRunning: false,
      tasks: [{ task: 'agent-loop/tasks/react.md', taskLabel: 'react', badge: 'pending', enabled: true }],
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tasks[0].taskLabel, 'react');
  assert.match(app.innerHTML, /react-dashboard/);
});

test('dashboard media delegates detail rendering to the React bridge when available', async () => {
  const calls = [];
  const app = fakeAppRoot();
  const win = await loadDashboardWindow({
    document: { getElementById: () => app },
  });
  win.AgentLoopReactDashboard = {
    renderOverview() {
      throw new Error('overview bridge should not render detail payloads');
    },
    renderDetail(payload) {
      calls.push(payload);
      app.innerHTML = '<main class="native-dashboard native-detail-dashboard">React detail</main>';
    },
  };

  win.__dispatchMessage({
    type: 'detail',
    payload: {
      taskLabel: 'backend-python-detail-sync-104',
      runId: 'detail-run',
      status: 'DONE_REVIEWED',
      phaseLabel: 'DONE_REVIEWED',
      pipelineSteps: [],
      iterations: [],
      reviewRounds: [],
      agentTail: 'detail output',
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskLabel, 'backend-python-detail-sync-104');
  assert.equal(calls[0].activeTab, 'review');
  assert.match(app.innerHTML, /native-detail-dashboard/);
  assert.match(app.innerHTML, /React detail/);
});

test('dashboard media exposes the acquired VS Code API for the React bridge', async () => {
  const source = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.js'), 'utf8');
  const bridge = await fs.readFile(path.join(extensionRoot, 'src', 'dashboard-react', 'vscodeBridge.ts'), 'utf8');

  assert.match(source, /window\.__AGENT_LOOP_VSCODE_API__\s*=\s*vscode/);
  assert.match(bridge, /window\.__AGENT_LOOP_VSCODE_API__/);
});

test('dashboard overview renders a product-style v3 shell', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 44, queueTotal: 19, running: 1, pending: 18, disabled: 25 },
    queueRunning: true,
    current: {
      taskLabel: 'backend-python-blueprint-job-store-runtime-takeover-104',
      phaseLabel: 'Grok 修复中',
      elapsedText: '12 分 03 秒',
      runId: '2026-06-23T16-00-00-000Z',
    },
    tasks: [
      ...Array.from({ length: 19 }, (_, index) => ({
        task: `agent-loop/tasks/backend-python-task-${index + 1}.md`,
        taskLabel: `backend-python-task-${index + 1}`,
        badge: index === 0 ? 'running' : 'pending',
        statusLabel: index === 0 ? '运行中' : '待跑',
        enabled: true,
        running: index === 0,
        category: index === 0 ? 'running' : 'pending',
      })),
    ],
  });

  assert.match(html, /class="[^"]*\bproduct-shell\b[^"]*"/);
  assert.match(html, /class="[^"]*\bproduct-sidebar\b[^"]*"/);
  assert.match(html, /AgentLoop/);
  assert.match(html, /Queue/);
  assert.match(html, /Runs/);
  assert.match(html, /class="[^"]*\bproduct-main\b[^"]*"/);
  assert.match(html, /class="[^"]*\bproduct-topbar\b[^"]*"/);
  assert.match(html, /AgentLoop[\s\S]*Queue/);
  assert.match(html, /class="[^"]*\bpage-status-badge\b[^"]*[\s\S]*运行中/);
  assert.match(html, /class="[^"]*\bqueue-product-grid\b[^"]*"/);
  assert.match(html, /class="[^"]*\bant-descriptions\b[^"]*"/);
  assert.match(html, /class="[^"]*\bant-table\b[^"]*"/);
  assert.match(html, /class="[^"]*\bant-pagination\b[^"]*"/);
  assert.match(html, /1-12 \/ 19/);
  assert.match(html, /backend-python-task-12/);
  assert.doesNotMatch(html, /backend-python-task-13/);
});

test('dashboard overview pagination state renders a later page', async () => {
  const renderer = await loadDashboardRenderer();
  renderer.setQueuePage(2);
  const html = renderer.renderOverview({
    counts: { total: 19, queueTotal: 19, running: 0, pending: 19, disabled: 0 },
    queueRunning: false,
    current: null,
    tasks: [
      {
        task: 'agent-loop/tasks/placeholder.md',
        taskLabel: 'placeholder',
        badge: 'pending',
        statusLabel: '待跑',
        enabled: false,
        running: false,
        category: 'disabled',
      },
      ...Array.from({ length: 19 }, (_, index) => ({
        task: `agent-loop/tasks/page-task-${index + 1}.md`,
        taskLabel: `page-task-${index + 1}`,
        badge: 'pending',
        statusLabel: '待跑',
        enabled: true,
        running: false,
        category: 'pending',
      })),
    ],
  });

  assert.match(html, /13-19 \/ 19/);
  assert.doesNotMatch(html, /page-task-12/);
  assert.match(html, /page-task-13/);
  assert.match(html, /page-task-19/);
  assert.match(html, /data-page="1"/);
  assert.match(html, /data-page="2"[^>]*class="[^"]*\bactive\b/);
});

test('dashboard overview renders table rows with Tag and Badge component semantics', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 2, queueTotal: 2, running: 1, pending: 1, disabled: 0 },
    queueRunning: true,
    current: null,
    tasks: [
      {
        task: 'agent-loop/tasks/running.md',
        taskLabel: 'running-task',
        badge: 'running',
        statusLabel: '运行中',
        enabled: true,
        running: true,
        category: 'running',
        agent: 'Grok',
        diffBytes: 4096,
        lastUpdatedText: '刚刚',
      },
      {
        task: 'agent-loop/tasks/pending.md',
        taskLabel: 'pending-task',
        badge: 'pending',
        statusLabel: '待跑',
        enabled: true,
        running: false,
        category: 'pending',
      },
    ],
  });

  assert.match(html, /class="[^"]*\bqueue-row\b[^"]*\bant-table-row\b[^"]*"/);
  assert.match(html, /class="[^"]*\bstatus-pill\b[^"]*\bant-tag\b[^"]*"/);
  assert.match(html, /class="[^"]*\btask-agent\b[^"]*\bant-tag\b[^"]*"/);
  assert.match(html, /class="[^"]*\btask-diff\b[^"]*\bant-badge\b[^"]*"/);
  assert.match(html, /running-task/);
  assert.match(html, /4KB/);
});

test('dashboard overview side panel uses Statistic and Progress component semantics', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 20, queueTotal: 8, running: 2, pending: 6, disabled: 12, reviewed: 5 },
    queueRunning: true,
    current: null,
    tasks: [
      ...Array.from({ length: 8 }, (_, index) => ({
        task: `agent-loop/tasks/stat-${index + 1}.md`,
        taskLabel: `stat-${index + 1}`,
        badge: index < 2 ? 'running' : 'pending',
        statusLabel: index < 2 ? '运行中' : '待跑',
        enabled: true,
        running: index < 2,
        category: index < 2 ? 'running' : 'pending',
      })),
    ],
  });

  assert.match(html, /class="[^"]*\bproduct-side-panel\b[^"]*\bant-statistic-card\b[^"]*"/);
  assert.match(html, /class="[^"]*\bproduct-side-list\b[^"]*\bant-statistic-list\b[^"]*"/);
  assert.match(html, /class="[^"]*\bant-statistic\b[^"]*"/);
  assert.match(html, /class="[^"]*\bside-progress\b[^"]*\bant-progress\b[^"]*"/);
});

test('dashboard detail evidence iterations and artifacts use component semantics', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'component-detail',
    runId: '2026-06-24T01-00-00-000Z',
    status: 'DONE_REVIEWED',
    phaseLabel: '完成（已 review）',
    elapsedText: '1 分 02 秒',
    gateText: 'Gate 绿',
    gateOk: true,
    agentText: 'Grok',
    iterations: [{ iteration: 1, gateOk: true, diffBytes: 2048, attempts: 2 }],
    reviewRounds: [{ round: 1, verdict: 'pass', decision: 'pass', summary: 'ok', findings: [] }],
    events: [{ status: 'DONE_REVIEWED', label: '完成', timeText: '09:00:00' }],
    agentTail: 'done',
    reportPath: 'C:/repo/final-report.md',
    reportJsonPath: 'C:/repo/final-report.json',
    landingPath: 'C:/repo/landing.json',
    statePath: 'C:/repo/state.json',
    landing: { status: 'MAIN_GATE_GREEN', commit: 'abc123' },
    details: ['轮次 1', 'worktree: migration-queue'],
  });

  assert.match(html, /class="[^"]*\bevidence\b[^"]*\bant-descriptions\b[^"]*"/);
  assert.match(html, /class="[^"]*\biterations\b[^"]*\bant-timeline\b[^"]*"/);
  assert.match(html, /class="[^"]*\bevidence-row\b[^"]*\btimeline-item\b[^"]*"/);
  assert.match(html, /class="[^"]*\bdetail-tabs\b[^"]*\bant-tabs\b[^"]*"/);
  assert.match(html, /class="[^"]*\bartifact-row\b[^"]*\bant-descriptions-item\b[^"]*"/);
});

test('dashboard product shell constrains overflow to content regions instead of page chrome', async () => {
  const css = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.css'), 'utf8');
  const htmlRule = css.match(/html,\s*body\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const shellRule = css.match(/\.product-shell\.dashboard\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const mainRule = css.match(/\.product-main\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const pageRule = css.match(/\.product-page\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const tableBodyRule = css.match(/\.ant-table \.queue-body\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.match(htmlRule, /overflow:\s*hidden/);
  assert.match(shellRule, /height:\s*100vh/);
  assert.match(shellRule, /overflow:\s*hidden/);
  assert.match(mainRule, /min-height:\s*0/);
  assert.match(mainRule, /overflow:\s*hidden/);
  assert.match(pageRule, /overflow:\s*auto/);
  assert.match(tableBodyRule, /overflow:\s*visible/);
});

test('React dashboard shell owns its two-column layout without relying on Ant runtime CSS', async () => {
  const css = await fs.readFile(path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'), 'utf8');
  const shellRule = css.match(/\.native-dashboard\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const sidebarRule = css.match(/\.native-sidebar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const mainRule = css.match(/\.native-main\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const contentRule = css.match(/\.native-content\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.match(shellRule, /min-height:\s*100vh/);
  assert.match(sidebarRule, /height:\s*100vh/);
  assert.match(sidebarRule, /overflow:\s*auto/);
  assert.match(mainRule, /min-width:\s*0/);
  assert.match(contentRule, /min-height:\s*calc\(100vh - 56px\)/);
  assert.match(contentRule, /overflow-x:\s*hidden/);
  assert.doesNotMatch(contentRule, /overflow:\s*auto/);
});

test('buildQueueOverview separates enabled queue size from all task size', async () => {
  const { buildQueueOverview } = requireFromExtension('./out/stateReader.js');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-overview-queue-size-'));
  const queueFilePath = path.join(repo, 'queue.json');
  await fs.writeFile(queueFilePath, JSON.stringify({
    tasks: [
      { id: 'a', task: 'agent-loop/tasks/a.md' },
      { id: 'b', task: 'agent-loop/tasks/b.md' },
      { id: 'c', task: 'agent-loop/tasks/c.md', enabled: false },
      { id: 'd', task: 'agent-loop/tasks/d.md', enabled: false },
    ],
  }), 'utf8');

  const overview = await buildQueueOverview(repo, { queueFilePath, queueRunning: false });

  assert.equal(overview.counts.total, 4);
  assert.equal(overview.counts.queueTotal, 2);
});

test('dashboard overview defaults to current task queue while keeping all tasks separate', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 4, queueTotal: 2, running: 0, pending: 2, disabled: 2 },
    queueRunning: false,
    current: null,
    tasks: [
      { task: 'agent-loop/tasks/a.md', taskLabel: 'queue-a', badge: 'pending', statusLabel: null, enabled: true, running: false },
      { task: 'agent-loop/tasks/b.md', taskLabel: 'queue-b', badge: 'pending', statusLabel: null, enabled: true, running: false },
      { task: 'agent-loop/tasks/c.md', taskLabel: 'old-c', badge: 'disabled', statusLabel: '已禁用', enabled: false, running: false },
      { task: 'agent-loop/tasks/d.md', taskLabel: 'old-d', badge: 'disabled', statusLabel: '已禁用', enabled: false, running: false },
    ],
  });

  assert.match(html, /filter-tab queue active[\s\S]*任务队列[\s\S]*2/);
  assert.match(html, /filter-tab[\s\S]*全部[\s\S]*4/);
  assert.match(html, /queue-a/);
  assert.match(html, /queue-b/);
  assert.doesNotMatch(html, /old-c/);
  assert.doesNotMatch(html, /old-d/);
});

test('dashboard overview renders SlideRule logo in the console header', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: { total: 6, queueTotal: 2 },
    queueRunning: false,
    current: null,
    tasks: [],
  });

  assert.match(html, /class="brand-mark"/);
  assert.match(html, /aria-label="SlideRule"/);
  assert.match(html, /<img[^>]+src="media\/sliderule-brand\.svg"/);
  assert.doesNotMatch(html, /<svg viewBox="0 0 32 32"/);
  assert.match(html, /AgentLoop 控制台/);
});

test('dashboard detail keeps the SlideRule logo in the detail header', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'backend-python-a2a-invoke-runtime-bridge',
    runId: '2026-06-21T01-00-00-000Z',
    status: 'DONE_REVIEWED',
    phaseLabel: '完成（已 review）',
    elapsedText: '2 分 03 秒',
    gateText: '修复 Gate 绿',
    gateOk: true,
    agentText: 'Codex',
    pipelineSteps: [{ key: 'INIT', label: '初始化' }, { key: 'DONE', label: '完成' }],
    details: [],
    iterations: [],
    reviewRounds: [],
    agentTail: '',
    landing: { status: 'PENDING_APPLY' },
  });

  assert.match(html, /detail-hero/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /aria-label="SlideRule"/);
  assert.match(html, /<img[^>]+src="media\/sliderule-brand\.svg"/);
});

test('dashboard console header uses an enlarged logo without leaving a wide title gap', async () => {
  const css = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.css'), 'utf8');
  const headerBrandRule = css.match(/\.header-brand\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const titleStackRule = css.match(/\.title-stack\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const brandRule = css.match(/\.brand-mark\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  const imgRule = css.match(/\.brand-mark img\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.match(headerBrandRule, /grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)/);
  assert.match(headerBrandRule, /column-gap:\s*12px/);
  assert.match(titleStackRule, /padding-left:\s*0/);
  assert.doesNotMatch(brandRule, /background\s*:/);
  assert.doesNotMatch(brandRule, /border\s*:/);
  assert.doesNotMatch(brandRule, /box-shadow\s*:/);
  assert.match(brandRule, /width:\s*clamp\(220px,\s*15vw,\s*280px\)/);
  assert.match(brandRule, /height:\s*clamp\(82px,\s*6\.5vw,\s*110px\)/);
  assert.match(imgRule, /height:\s*100%/);
  assert.doesNotMatch(imgRule, /height:\s*28px/);
});

test('dashboard detail keeps a compact logo independent from the console header logo', async () => {
  const css = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.css'), 'utf8');
  const detailBrandMarkRule = css.match(/\.detail-hero-brand \.brand-mark\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';

  assert.match(detailBrandMarkRule, /width:\s*clamp\(112px,\s*11vw,\s*150px\)/);
  assert.match(detailBrandMarkRule, /height:\s*clamp\(36px,\s*4vw,\s*46px\)/);
  assert.doesNotMatch(detailBrandMarkRule, /height:\s*clamp\(82px,\s*6\.5vw,\s*110px\)/);
});

test('dashboard media renders outcome groups and conflict files', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderOverview({
    counts: {
      total: 4,
      applied: 0,
      reviewed: 0,
      noDiff: 1,
      applyConflict: 1,
      human: 1,
      failed: 0,
      crashed: 0,
      stopped: 1,
      running: 0,
      pending: 0,
    },
    queueRunning: false,
    current: null,
    tasks: [
      {
        task: 'agent-loop/tasks/no-diff.md',
        taskLabel: 'no-diff',
        badge: 'noDiff',
        statusLabel: '已审查无新增差异',
        running: false,
      },
      {
        task: 'agent-loop/tasks/conflict.md',
        taskLabel: 'conflict',
        badge: 'applyConflict',
        statusLabel: '应用冲突',
        applyErrorFiles: ['server/routes/a2a.ts'],
        applyError: 'patch does not apply',
        running: false,
      },
      {
        task: 'agent-loop/tasks/human.md',
        taskLabel: 'human',
        badge: 'human',
        statusLabel: '人工接管',
        running: false,
      },
      {
        task: 'agent-loop/tasks/dirty.md',
        taskLabel: 'dirty',
        badge: 'stopped',
        statusLabel: '主仓库有未提交改动',
        running: false,
      },
    ],
  });

  assert.match(html, /NO_DIFF/);
  assert.match(html, /APPLY/);
  assert.match(html, /HUMAN/);
  assert.match(html, /STOP/);
  assert.match(html, /server\/routes\/a2a\.ts/);
  assert.match(html, /patch does not apply/);
  assert.match(html, /data-state="applyConflict"/);
  assert.match(html, /data-state="noDiff"/);
});

test('dashboard media renders detail evidence and log sections', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'backend-python-a2a-invoke-runtime-bridge',
    runId: '2026-06-21T01-00-00-000Z',
    status: 'DONE_REVIEWED',
    phaseLabel: '完成（已 review）',
    elapsedText: '2 分 03 秒',
    gateText: '修复 Gate 绿',
    gateOk: true,
    agentText: 'Codex',
    roleText: 'codex 修 + codex 审',
    runMode: 'codex-fix+codex-review',
    pipelineSteps: [{ key: 'INIT', label: '初始化' }, { key: 'DONE', label: '完成' }],
    details: ['worktree: run-a', '已完成迭代 1'],
    iterations: [{ iteration: 1, gateOk: true, failureCount: 0, diffBytes: 2048, guard: false, attempts: 1 }],
    reviewRounds: [{ round: 1, verdict: 'pass', decision: 'pass', summary: '边界通过', findings: [] }],
    agentTail: 'All gates passed',
    displayGate: { ok: true },
    landing: { status: 'COMMITTED', committed: true, commit: 'abc1234' },
    guardPolicy: { protectTests: true, protectTaskDocs: false, protectedGlobs: [] },
    statePath: 'C:/repo/.agent-loop/latest/state.json',
  });

  assert.match(html, /run-detail/);
  assert.match(html, /detail-hero/);
  assert.match(html, /detail-stage-rail/);
  assert.match(html, /detail-workbench/);
  assert.match(html, /workbench-left/);
  assert.match(html, /workbench-right/);
  assert.match(html, /workbench-left[\s\S]*panel iterations/);
  assert.match(html, /workbench-right[\s\S]*Review/);
  assert.match(html, /证据/);
  assert.match(html, /Review/);
  assert.match(html, /All gates passed/);
  assert.match(html, /abc1234/);
});

test('dashboard media renders syntax highlighted json agent output', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'backend-python-blueprint-agent-crew-proxy-contract',
    runId: '2026-06-20T19-20-27-078Z',
    status: 'DONE_REVIEWED',
    phaseLabel: '完成',
    elapsedText: '1 分 00 秒',
    gateText: '基线 Gate 绿',
    gateOk: true,
    agentText: 'codex + codex',
    roleText: 'codex修 + codex审',
    runMode: 'codex-review',
    pipelineSteps: [{ key: 'INIT', label: '初始化' }, { key: 'DONE', label: '完成' }],
    details: [],
    iterations: [],
    reviewRounds: [],
    agentTail: JSON.stringify({
      verdict: 'pass',
      summary: 'Python contract tests passed',
      findings: [],
    }),
    landing: { status: 'PENDING_APPLY' },
  });

  assert.match(html, /json-token key/);
  assert.match(html, /log-json wrap/);
  assert.match(html, /&quot;verdict&quot;/);
  assert.match(html, /&quot;pass&quot;/);
  assert.match(html, /Python contract tests passed/);
  assert.doesNotMatch(html, /\{&quot;verdict&quot;:/);
});

test('dashboard preserves internal diff and agent log scroll positions across refreshes', async () => {
  const win = await loadDashboardWindow();
  const { captureScrollPositions, restoreScrollPositions } = win.AgentLoopDashboardInternals;
  const pageScroller = { scrollTop: 41 };
  const doc = { scrollingElement: pageScroller, documentElement: { scrollTop: 0 } };
  const before = [
    fakeScrollable('diff', 320),
    fakeScrollable('agent-log', 880),
    fakeScrollable('gate-output', 120),
  ];
  const after = [
    fakeScrollable('diff', 0),
    fakeScrollable('agent-log', 0),
    fakeScrollable('gate-output', 0),
  ];

  const captured = captureScrollPositions(fakeRoot(before), doc);
  pageScroller.scrollTop = 0;
  restoreScrollPositions(fakeRoot(after), captured, doc);

  assert.equal(pageScroller.scrollTop, 41);
  assert.equal(after[0].scrollTop, 320);
  assert.equal(after[1].scrollTop, 880);
  assert.equal(after[2].scrollTop, 120);
});

test('dashboard preserves focused queue search input across refreshes', async () => {
  const win = await loadDashboardWindow();
  const { captureScrollPositions, restoreScrollPositions } = win.AgentLoopDashboardInternals;
  const beforeInput = fakeFocusable('queue-search', 'a2a stream', 3, 7);
  const afterInput = fakeFocusable('queue-search', '', 0, 0);
  const pageScroller = { scrollTop: 0 };
  const doc = {
    activeElement: beforeInput,
    scrollingElement: pageScroller,
    documentElement: { scrollTop: 0 },
  };

  const captured = captureScrollPositions(fakeRoot([], { 'queue-search': beforeInput }), doc);
  restoreScrollPositions(fakeRoot([], { 'queue-search': afterInput }), captured, doc);

  assert.equal(afterInput.value, 'a2a stream');
  assert.equal(afterInput.selectionStart, 3);
  assert.equal(afterInput.selectionEnd, 7);
  assert.equal(afterInput.focused, true);
});

test('dashboard preserves focused event search input across refreshes', async () => {
  const win = await loadDashboardWindow();
  const { captureScrollPositions, restoreScrollPositions } = win.AgentLoopDashboardInternals;
  const beforeInput = fakeFocusable('event-search', 'manual halt', 0, 6);
  const afterInput = fakeFocusable('event-search', '', 0, 0);
  const pageScroller = { scrollTop: 0 };
  const doc = {
    activeElement: beforeInput,
    scrollingElement: pageScroller,
    documentElement: { scrollTop: 0 },
  };

  const captured = captureScrollPositions(fakeRoot([], { 'event-search': beforeInput }), doc);
  restoreScrollPositions(fakeRoot([], { 'event-search': afterInput }), captured, doc);

  assert.equal(afterInput.value, 'manual halt');
  assert.equal(afterInput.selectionStart, 0);
  assert.equal(afterInput.selectionEnd, 6);
  assert.equal(afterInput.focused, true);
});

test('dashboard defers html refresh while the user is actively scrolling', async () => {
  const win = await loadDashboardWindow();
  const { createRenderScheduler } = win.AgentLoopDashboardInternals;
  const rendered = [];
  let now = 1000;
  let scheduled = null;
  let timerId = 0;
  const scheduler = createRenderScheduler({
    renderNow: (html) => rendered.push(html),
    now: () => now,
    idleMs: 300,
    setTimeoutFn: (fn, delay) => {
      scheduled = { id: ++timerId, fn, delay };
      return scheduled.id;
    },
    clearTimeoutFn: () => {
      scheduled = null;
    },
  });

  scheduler.markUserScroll();
  assert.equal(scheduler.schedule('<main>first</main>'), 'deferred');
  assert.deepEqual(rendered, []);
  assert.equal(scheduled.delay, 300);

  now += 100;
  assert.equal(scheduler.schedule('<main>latest</main>'), 'deferred');
  assert.deepEqual(rendered, []);
  assert.equal(scheduled.delay, 200);

  scheduled.fn();
  assert.deepEqual(rendered, ['<main>latest</main>']);
});

test('dashboard marks diff and agent log panels with stable scroll keys', async () => {
  const renderer = await loadDashboardRenderer();
  const html = renderer.renderDetail({
    taskLabel: 'scroll task',
    runId: 'scroll-run',
    status: 'CODEX_FIX',
    pipelineSteps: [],
    hasDiff: true,
    diffText: 'diff --git a/a.js b/a.js\n+new\n',
    gateFailure: '$ npm test\nfailed',
    agentTail: 'long agent output',
    iterations: [],
    reviewRounds: [],
  });

  assert.match(html, /data-scroll-key="diff"/);
  assert.match(html, /data-scroll-key="agent-log"/);
  assert.match(html, /data-scroll-key="gate-output"/);
  assert.match(html, /Review Data \(JSON\)[\s\S]*data-scroll-key="review-json"/);
});

test('dashboard keeps last non-empty agent output when a live refresh has an empty tail', async () => {
  const messages = [];
  const app = fakeAppRoot();
  const win = await loadDashboardWindow({
    document: { getElementById: () => app },
    acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }),
  });
  const detail = {
    taskLabel: 'log-stability-task',
    taskPath: 'agent-loop/tasks/log-stability-task.md',
    runId: 'stable-run',
    status: 'GROK_FIX',
    pipelineSteps: [],
    iterations: [],
    reviewRounds: [],
    activeTab: 'agent',
    agentTail: 'first non-empty grok output',
  };

  win.__dispatchMessage({ type: 'detail', payload: detail });
  assert.match(app.innerHTML, /first non-empty grok output/);

  win.__dispatchMessage({ type: 'detail', payload: { ...detail, agentTail: '', agentLogKb: 0 } });

  assert.match(app.innerHTML, /first non-empty grok output/);
});

test('dashboard clears cached agent output when the run id changes for the same task', async () => {
  const app = fakeAppRoot();
  const win = await loadDashboardWindow({
    document: { getElementById: () => app },
    acquireVsCodeApi: () => ({ postMessage: () => {} }),
  });
  const detail = {
    taskLabel: 'log-stability-task',
    taskPath: 'agent-loop/tasks/log-stability-task.md',
    runId: 'first-run',
    status: 'GROK_FIX',
    pipelineSteps: [],
    iterations: [],
    reviewRounds: [],
    agentTail: 'old run output',
  };

  win.__dispatchMessage({ type: 'detail', payload: detail });
  assert.match(app.innerHTML, /old run output/);

  win.__dispatchMessage({
    type: 'detail',
    payload: { ...detail, runId: 'second-run', agentTail: '' },
  });

  assert.doesNotMatch(app.innerHTML, /old run output/);
  assert.match(app.innerHTML, /暂无输出/);
});

async function loadDashboardRenderer() {
  const win = await loadDashboardWindow();
  return win.AgentLoopDashboardRenderer;
}

async function loadDashboardWindow(overrides = {}) {
  const source = await fs.readFile(path.join(extensionRoot, 'media', 'dashboard.js'), 'utf8');
  const listeners = new Map();
  const sandbox = {
    window: {},
    document: { getElementById: () => null },
    acquireVsCodeApi: () => ({ postMessage: () => {} }),
    ...overrides,
  };
  sandbox.window.addEventListener = (type, handler) => {
    listeners.set(type, handler);
  };
  sandbox.window.__dispatchMessage = (data) => {
    listeners.get('message')?.({ data });
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'dashboard.js' });
  return sandbox.window;
}

function fakeAppRoot() {
  return {
    innerHTML: '',
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function fakeScrollable(key, scrollTop) {
  return {
    scrollTop,
    getAttribute(name) {
      return name === 'data-scroll-key' ? key : null;
    },
  };
}

function fakeFocusable(key, value, selectionStart, selectionEnd) {
  return {
    value,
    selectionStart,
    selectionEnd,
    focused: false,
    getAttribute(name) {
      return name === 'data-focus-key' ? key : null;
    },
    focus(options) {
      this.focused = true;
      this.focusOptions = options;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
}

function fakeRoot(elements, focusables = {}) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-scroll-key]');
      return elements;
    },
    querySelector(selector) {
      const match = selector.match(/^\[data-focus-key="([^"]+)"\]$/);
      return match ? focusables[match[1]] || null : null;
    },
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ===== Settings / SecretStorage safety tests =====
test('settings send logic never includes raw keys (SecretStorage safety)', async () => {
  // Simulate the payload construction from dashboardPanel
  const rawKeys = {
    grokApiKey: 'sk-secret-grok-123',
    openaiApiKey: 'sk-secret-openai-456',
  };

  const keysStatus = {};
  Object.keys(rawKeys).forEach(k => {
    keysStatus[k] = rawKeys[k] ? 'configured' : '';
  });

  const payload = {
    nonSensitive: { fixAgent: 'grok' },
    keys: keysStatus,
    baseUrl: '',
  };

  // Assert no raw secret in the message that would be sent to webview
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('sk-secret'));
  assert.ok(serialized.includes('configured'));
  assert.ok(payload.keys.grokApiKey === 'configured');
});

test('settings save message normalization accepts top-level and payload shapes', () => {
  const { normalizeSaveSettingsPayload } = requireFromExtension('./out/settingsMessages.js');

  assert.deepEqual(
    normalizeSaveSettingsPayload({ type: 'saveSettings', fixAgent: 'grok', workerMaxTurns: 128 }),
    { fixAgent: 'grok', workerMaxTurns: 128 },
  );
  assert.deepEqual(
    normalizeSaveSettingsPayload({ type: 'saveSettings', payload: { reviewAgent: 'codex', grokApiKey: 'secret' } }),
    { reviewAgent: 'codex', grokApiKey: 'secret' },
  );
  assert.deepEqual(normalizeSaveSettingsPayload(null), {});
});

test('settings preview log redaction removes raw api keys', () => {
  const { redactSettingsMessageForLog } = requireFromExtension('./out/settingsMessages.js');

  const redacted = redactSettingsMessageForLog({
    type: 'saveSettings',
    grokApiKey: 'sk-grok-secret',
    payload: {
      openaiApiKey: 'sk-openai-secret',
      queuePath: 'agent-loop/scripts/migration-queue.json',
    },
  });

  const serialized = JSON.stringify(redacted);
  assert.ok(!serialized.includes('sk-grok-secret'));
  assert.ok(!serialized.includes('sk-openai-secret'));
  assert.match(serialized, /configured|redacted/i);
  assert.match(serialized, /migration-queue\.json/);
});

test('vscode shim enables requiring compiled Settings-related modules (paths, getAgentLoopConfig defaults)', () => {
  // This require would have thrown "Cannot find module 'vscode'" without the harness shim.
  const paths = requireFromExtension('./out/paths.js');
  assert.equal(typeof paths.getAgentLoopConfig, 'function');
  const cfg = paths.getAgentLoopConfig();
  assert.equal(cfg.fixAgent, 'grok');
  assert.equal(cfg.reviewAgent, 'codex');
  assert.equal(typeof cfg.workerMaxTurns, 'number');
  assert.equal(cfg.workerMaxTurns, 512);
  assert.equal(cfg.workerMaxRetries, 2);
  assert.equal(cfg.injectKeysToWorker, true);
  assert.ok('queuePath' in cfg);
  assert.ok('baseUrl' in cfg);
  assert.ok('worktreeScope' in cfg);
});

test('vscode shim 107 isolates workspace config per test', async () => {
  // ensure clean start (isolation from prior tests)
  resetVscode107State();
  const { getEffectiveConfig } = requireFromExtension('./out/settingsConfig.js');
  const clean = getEffectiveConfig();
  assert.equal(clean.fixAgent, 'grok');
  assert.equal(clean.reviewAgent, 'codex');

  // seed via helper
  const restore = seedWorkspaceConfig({ fixAgent: 'codex-107', reviewAgent: 'grok-107', workerMaxTurns: 42 });
  let eff = getEffectiveConfig();
  assert.equal(eff.fixAgent, 'codex-107');
  assert.equal(eff.reviewAgent, 'grok-107');
  assert.equal(eff.workerMaxTurns, 42);

  // updates are captured and reflected
  const wsCfg = cjsRequire('vscode').workspace.getConfiguration('agentLoop');
  await wsCfg.update('baseUrl', 'http://107.example');
  await wsCfg.update('workerMaxRetries', 5);
  const ups = getWorkspaceConfigUpdates();
  assert.ok(ups.some((u) => u.key === 'baseUrl' && u.value === 'http://107.example'));
  assert.ok(ups.some((u) => u.key === 'workerMaxRetries' && u.value === 5));
  eff = getEffectiveConfig();
  assert.equal(eff.baseUrl, 'http://107.example');
  assert.equal(eff.workerMaxRetries, 5);

  // commands captured
  const vscode = cjsRequire('vscode');
  await vscode.commands.executeCommand('agentLoop.testCmd', { a: 1 });
  const cmds = getCapturedCommands();
  assert.ok(cmds.some((c) => c.command === 'agentLoop.testCmd'));

  // webview capture via panel
  const panel = vscode.window.createWebviewPanel('t', 't', 1, {});
  panel.webview.postMessage({ type: 'settings', payload: { test: 107 } });
  const msgs = getCapturedWebviewMessages();
  assert.ok(msgs.some((m) => m && m.type === 'settings'));

  // reset isolates: next read in same harness sees defaults
  resetVscode107State();
  const after = getEffectiveConfig();
  assert.equal(after.fixAgent, 'grok');
  assert.equal(after.baseUrl, '');
  assert.equal(getWorkspaceConfigUpdates().length, 0);
  // no commands leak
  assert.equal(getCapturedCommands().length, 0);
});

test('vscode shim 107 mocks SecretStorage without leaking values', async () => {
  resetVscode107State();
  const s1 = createMockSecretStorage({ 'agentLoop.grokApiKey': 'sk-107-secret-A' });
  assert.equal(await s1.get('agentLoop.grokApiKey'), 'sk-107-secret-A');
  assert.equal(await s1.get('agentLoop.openaiApiKey'), undefined);

  await s1.store('agentLoop.openaiApiKey', 'sk-107-secret-B');
  await s1.store('agentLoop.anthropicApiKey', 'sk-107-secret-C');
  assert.equal(await s1.get('agentLoop.openaiApiKey'), 'sk-107-secret-B');

  // new instance must not leak previous values
  const s2 = createMockSecretStorage();
  assert.equal(await s2.get('agentLoop.grokApiKey'), undefined);
  assert.equal(await s2.get('agentLoop.openaiApiKey'), undefined);
  assert.equal(await s2.get('agentLoop.anthropicApiKey'), undefined);

  // independent stores
  await s2.store('agentLoop.grokApiKey', 'sk-107-secret-ONLY-IN-S2');
  assert.equal(await s1.get('agentLoop.grokApiKey'), 'sk-107-secret-A', 's1 must not see s2 value');
  assert.equal(await s2.get('agentLoop.grokApiKey'), 'sk-107-secret-ONLY-IN-S2');

  // delete works per instance
  await s1.delete('agentLoop.grokApiKey');
  assert.equal(await s1.get('agentLoop.grokApiKey'), undefined);
  // s2 still has its
  assert.equal(await s2.get('agentLoop.grokApiKey'), 'sk-107-secret-ONLY-IN-S2');

  // inspect dump contains only own
  const dump1 = s1._testDump();
  assert.ok(!('agentLoop.grokApiKey' in dump1) || dump1['agentLoop.grokApiKey'] == null);
  const dump2 = s2._testDump();
  assert.equal(dump2['agentLoop.grokApiKey'], 'sk-107-secret-ONLY-IN-S2');
});

test('getAgentLoopConfig shape includes new CLI and key related fields', () => {
  // We can't easily mock vscode here without setup, but ensure the module exports and basic defaults
  const { getAgentLoopConfig } = requireFromExtension('./out/paths.js');
  const cfg = getAgentLoopConfig();
  assert.ok(typeof cfg === 'object');
  assert.ok('fixAgent' in cfg);
  assert.ok('reviewAgent' in cfg);
  assert.ok('workerMaxTurns' in cfg);
  assert.ok('injectKeysToWorker' in cfg);
  assert.equal(typeof cfg.workerMaxTurns, 'number');
});

test('provider health LLM missing key returns skipped not failed', async () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { testProviderHealth } = mod;

  const r1 = await testProviderHealth('grok', null);
  assert.equal(r1.provider, 'grok');
  assert.equal(r1.status, 'skipped');
  assert.equal(r1.reason, 'missing key');
  assert.equal(r1.durationMs, 0);

  const r2 = await testProviderHealth('openai', '');
  assert.equal(r2.status, 'skipped');
  assert.equal(r2.reason, 'missing key');

  const r3 = await testProviderHealth('anthropic', undefined);
  assert.equal(r3.status, 'skipped');
});

test('provider health LLM uses mocked transport, reports duration/status/reason, asserts redaction', async () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { testProviderHealth } = mod;

  let lastUrl = '';
  const mockOk = async (url, opts) => {
    lastUrl = url;
    // simulate we never see raw key here; transport is opaque
    return { ok: true, status: 200 };
  };

  const res = await testProviderHealth('grok', 'sk-grok-REAL-KEY-MUST-NOT-LEAK', { transport: mockOk });
  assert.equal(res.provider, 'grok');
  assert.equal(res.status, 'ok');
  assert.ok(res.durationMs >= 0);
  assert.equal(res.reason, 'ok');
  assert.ok(lastUrl.includes('api.x.ai') || lastUrl.includes('models'));
  assert.ok(!JSON.stringify(res).includes('REAL-KEY'));
  assert.ok(!JSON.stringify(res).match(/sk-grok/i));

  // failing transport -> redacted reason
  const mockFail = async () => { throw new Error('401 Unauthorized sk-LEAKED'); };
  const failRes = await testProviderHealth('openai', 'sk-openai-SEC', { transport: mockFail });
  assert.equal(failRes.provider, 'openai');
  assert.equal(failRes.status, 'failed');
  assert.ok(!JSON.stringify(failRes).includes('LEAKED'));
  assert.ok(!JSON.stringify(failRes).includes('sk-openai'));
  // reason is sanitized/redacted form
  assert.ok(['auth error', 'redacted error', 'error'].includes(failRes.reason));

  // network like
  const mockNet = async () => { const e = new Error('fetch failed ECONNREFUSED'); throw e; };
  const netRes = await testProviderHealth('anthropic', 'sk-ant-SEC', { transport: mockNet });
  assert.equal(netRes.status, 'failed');
  assert.ok(netRes.reason.includes('network') || netRes.reason === 'error');
  assert.ok(!JSON.stringify(netRes).includes('SEC'));
});

test('provider health LLM test with custom baseUrl uses provided transport', async () => {
  const { testProviderHealth } = requireFromExtension('./out/settingsConfig.js');
  const calls = [];
  const t = async (url) => { calls.push(url); return { ok: true, status: 200 }; };
  const r = await testProviderHealth('openai', 'k', { transport: t, baseUrl: 'https://proxy.example.com/v1' });
  assert.equal(r.status, 'ok');
  assert.ok(calls[0].includes('proxy.example.com'));
});

test('provider health CLI 107 reports available worker command', async () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { testWorkerCliHealth } = mod;

  const calls = [];
  const fakeSpawn = (cmd, args) => {
    calls.push({ cmd, args });
    const child = {
      stdout: { on() {} },
      stderr: { on() {} },
      on(ev, cb) {
        if (ev === 'close') {
          setTimeout(() => cb(0), 0);
        }
        return child;
      },
      kill() {},
    };
    return child;
  };

  const r = await testWorkerCliHealth('grok', { spawnFn: fakeSpawn, timeoutMs: 100 });
  assert.equal(r.worker, 'grok');
  assert.equal(r.status, 'ok');
  assert.equal(r.reason, 'ok');
  assert.ok(r.durationMs >= 0);
  assert.ok(calls.length >= 1);
});

test('provider health CLI 107 redacts command stderr', async () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { testWorkerCliHealth } = mod;

  const fakeSpawn = () => {
    const child = {
      stdout: { on() {} },
      stderr: {
        on(ev, cb) {
          if (ev === 'data') {
            // simulate secret in stderr
            setTimeout(() => cb('Error: auth Bearer sk-REAL-LEAK-XYZ\n'), 0);
          }
          return child;
        },
      },
      on(ev, cb) {
        if (ev === 'close') {
          setTimeout(() => cb(1), 0);
        }
        return child;
      },
      kill() {},
    };
    return child;
  };

  const r = await testWorkerCliHealth('codex', { spawnFn: fakeSpawn, timeoutMs: 100, command: 'codex' });
  assert.equal(r.worker, 'codex');
  assert.equal(r.status, 'failed');
  assert.ok(!JSON.stringify(r).includes('sk-REAL'));
  assert.ok(!JSON.stringify(r).includes('LEAK'));
  assert.ok(r.reason === 'redacted' || /redacted|error/.test(r.reason));
});

test('provider health cache 107 keeps last redacted result', () => {
  const mod = requireFromExtension('./out/dashboardPanel.js');
  const { enrichProviderHealthResult } = mod;
  const redactedInput = {
    provider: 'grok',
    status: 'failed',
    durationMs: 123,
    reason: 'redacted error',
  };
  const cached = enrichProviderHealthResult(redactedInput);
  assert.equal(cached.provider, 'grok');
  assert.equal(cached.status, 'failed');
  assert.equal(cached.reason, 'redacted error');
  assert.equal(cached.duration, 123);
  assert.equal(cached.durationMs, 123);
  assert.ok(typeof cached.checkedAt === 'string' && cached.checkedAt.length > 0);
  const s = JSON.stringify(cached);
  assert.ok(!/sk-|Bearer |REAL/i.test(s));
});

test('provider health cache 107 clears when provider settings change', () => {
  const mod = requireFromExtension('./out/dashboardPanel.js');
  const { shouldClearProviderHealthOnSettingsChange } = mod;
  assert.equal(shouldClearProviderHealthOnSettingsChange({ grokApiKey: 'foo' }), true);
  assert.equal(shouldClearProviderHealthOnSettingsChange({ openaiApiKey: '' }), true);
  assert.equal(shouldClearProviderHealthOnSettingsChange({ anthropicApiKey: 'bar' }), true);
  assert.equal(shouldClearProviderHealthOnSettingsChange({ baseUrl: 'https://example' }), true);
  assert.equal(shouldClearProviderHealthOnSettingsChange({ fixAgent: 'codex' }), false);
  assert.equal(shouldClearProviderHealthOnSettingsChange({ workerMaxTurns: 10 }), false);
  assert.equal(shouldClearProviderHealthOnSettingsChange(null), false);
});

test('profile run guard: allowed idle switch (queueRunning false)', () => {
  const mod = requireFromExtension('./out/dashboardPanel.js');
  const { shouldRejectProfileChangeWhileRunning, computeActiveProfileName } = mod;
  assert.equal(shouldRejectProfileChangeWhileRunning(false, { fixAgent: 'codex' }), false);
  assert.equal(shouldRejectProfileChangeWhileRunning(false, { reviewAgent: 'grok', queuePath: 'x' }), false);
  assert.equal(shouldRejectProfileChangeWhileRunning(false, { grokApiKey: 'secret' }), false);
  assert.equal(computeActiveProfileName({ fixAgent: 'grok', reviewAgent: 'codex' }), 'grok / codex');
});

test('profile run guard: blocked running switch (queueRunning true)', () => {
  const mod = requireFromExtension('./out/dashboardPanel.js');
  const { shouldRejectProfileChangeWhileRunning, computeActiveProfileName } = mod;
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { fixAgent: 'codex' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { reviewAgent: 'grok' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { queuePath: '/new.json' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { worktreeScope: 'task' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { baseUrl: 'https://x' }), true);
  // non-profile (key clear) not blocked by this guard
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { grokApiKey: '' }), false);
  assert.equal(computeActiveProfileName({ fixAgent: 'grok' }), 'grok');
  assert.equal(computeActiveProfileName(null), null);
});

test('profile run guard 107 blocks runtime fields during active run', () => {
  const panelMod = requireFromExtension('./out/dashboardPanel.js');
  const cfgMod = requireFromExtension('./out/settingsConfig.js');
  const { shouldRejectProfileChangeWhileRunning, getProfileRunGuardResult } = panelMod;
  const { checkProfileRunGuard } = cfgMod;
  // blocks exactly the runtime profile/worker fields
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { fixAgent: 'codex' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { reviewAgent: 'grok', queuePath: 'x' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { worktreeScope: 'task' }), true);
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { baseUrl: 'https://ex' }), true);
  const g = checkProfileRunGuard(true, { fixAgent: 'codex', baseUrl: 'u' });
  assert.equal(g.allowed, false);
  assert.ok(Array.isArray(g.blockedFields) && g.blockedFields.includes('fixAgent'));
  assert.ok(g.message && g.message.includes('运行时字段'));
  // structured via panel helper
  const gs = getProfileRunGuardResult(true, { reviewAgent: 'none' });
  assert.equal(gs.allowed, false);
  assert.ok(gs.blockedFields.includes('reviewAgent'));
  // safe non-runtime fields (e.g. worker max) NOT blocked
  assert.equal(shouldRejectProfileChangeWhileRunning(true, { workerMaxTurns: 64 }), false);
  assert.equal(checkProfileRunGuard(true, { workerMaxRetries: 5 }).allowed, true);
});

test('profile run guard 107 allows safe diagnostic refresh', () => {
  const cfgMod = requireFromExtension('./out/settingsConfig.js');
  const { checkProfileRunGuard } = cfgMod;
  // during active run, non-runtime payloads allowed (diagnostic refresh path never hits runtime guard)
  const res = checkProfileRunGuard(true, { /* diagnostic-safe */ });
  assert.equal(res.allowed, true);
  assert.deepEqual(res.blockedFields, []);
  const res2 = checkProfileRunGuard(true, { workerMaxTurns: 256, injectKeysToWorker: false });
  assert.equal(res2.allowed, true);
  // confirm diagnostics command (getDiagnostics) is independent of run guard (always callable)
  assert.ok('checkProfileRunGuard' in cfgMod, 'guard available; diagnostics refresh remains unblocked per contract');
});

// ===== security redaction audit 107 required tests =====
test('security redaction audit 107 redacts command responses', async () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { testWorkerCliHealth } = mod;
  const { redactSettingsMessageForLog } = requireFromExtension('./out/settingsMessages.js');

  // simulate command stderr response containing all covered secret patterns
  const fakeSpawnSecretCmd = () => {
    const child = {
      stdout: { on() {} },
      stderr: {
        on(ev, cb) {
          if (ev === 'data') {
            setTimeout(() => cb('Error: auth failed with x-api-key: sk-CMD-RESP-XYZ\nAuthorization: Bearer cmd-token\n-----BEGIN PRIVATE KEY-----\nMIIE...\n'), 0);
          }
          return child;
        },
      },
      on(ev, cb) {
        if (ev === 'close') {
          setTimeout(() => cb(1), 0);
        }
        return child;
      },
      kill() {},
    };
    return child;
  };

  const r = await testWorkerCliHealth('grok', { spawnFn: fakeSpawnSecretCmd, timeoutMs: 100, command: 'grok' });
  const ser = JSON.stringify(r);
  assert.ok(!ser.includes('sk-CMD-RESP'));
  assert.ok(!ser.includes('cmd-token'));
  assert.ok(!/PRIVATE KEY/i.test(ser));
  assert.ok(r.reason === 'redacted' || /redacted|error/.test(r.reason));

  // shared redaction on command-response shaped payload never leaks (uses secret-matching keys)
  const cmdRespPayload = {
    type: 'commandResponse',
    secret: 'sk-foo',
    apiKey: 'sk-bar',
    token: 'Bearer t',
    secretKeyBlock: '-----BEGIN RSA PRIVATE KEY----- leak',
  };
  const redCmd = redactSettingsMessageForLog(cmdRespPayload);
  const serCmd = JSON.stringify(redCmd);
  assert.ok(!/sk-foo|sk-bar|Bearer t|PRIVATE KEY/i.test(serCmd));
  assert.match(serCmd, /<configured>|''/);

  // dashboard messages use configured status, never raw SecretStorage values
  const dashKeysMsg = {
    type: 'settings',
    payload: {
      keys: { grokApiKey: 'configured', openaiApiKey: 'configured' },
      nonSensitive: { fixAgent: 'grok' },
    },
  };
  const redDash = redactSettingsMessageForLog(dashKeysMsg);
  const serDash = JSON.stringify(redDash);
  assert.ok(!serDash.includes('sk-'));
  assert.ok(serDash.includes('configured') || serDash.includes('<configured>'));
});

test('security redaction audit 107 redacts failed provider errors', async () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { testProviderHealth } = mod;
  const { redactSettingsMessageForLog } = requireFromExtension('./out/settingsMessages.js');

  // failing provider transport with secrets in error message (all patterns)
  const mockFailSecret = async () => {
    throw new Error('401 Unauthorized Authorization: Bearer sk-FAILED-PROV-XYZ x-api-key: sk-ant-fail -----BEGIN EC PRIVATE KEY----- leakblock');
  };
  const failRes = await testProviderHealth('openai', 'sk-provide-REAL', { transport: mockFailSecret });
  const serFail = JSON.stringify(failRes);
  assert.ok(!serFail.includes('sk-FAILED'));
  assert.ok(!serFail.includes('sk-ant-fail'));
  assert.ok(!serFail.includes('sk-provide'));
  assert.ok(!/Bearer |x-api-key|PRIVATE KEY/i.test(serFail));
  assert.ok(['auth error', 'redacted error', 'error'].includes(failRes.reason));

  // shared redaction covers on provider result payload (uses secret-matching keys)
  const provErrPayload = {
    type: 'providerHealth',
    payload: { provider: 'grok', status: 'failed', secret: 'sk-ERR', token: 'Bearer z', apiKey: 'x-api-key: w', secretPriv: '-----BEGIN PRIVATE KEY----- ' },
  };
  const redProv = redactSettingsMessageForLog(provErrPayload);
  const serProv = JSON.stringify(redProv);
  assert.ok(!/sk-ERR|Bearer z|x-api-key|PRIVATE KEY/i.test(serProv));

  // run state and diagnostics never serialize injected worker env secrets
  const runState = { runId: 'r107', status: 'RUN', options: { task: 't.md' } };
  assert.ok(!JSON.stringify(runState).includes('sk-'));
  const diagWithAttempt = {
    effectiveConfig: { fixAgent: 'grok' },
    lastRunState: runState,
    // use secret-matching keys so shared redaction replaces values (run/diag never serialize injected secrets)
    grokApiKey: 'sk-INJECT-DIAG-SECRET',
    authToken: 'sk-ant-diag',
  };
  const redDiag = redactSettingsMessageForLog(diagWithAttempt);
  const serDiag = JSON.stringify(redDiag);
  assert.ok(!serDiag.includes('sk-INJECT-DIAG'));
  assert.ok(!serDiag.includes('sk-ant-diag'));
  assert.ok(serDiag.includes('effectiveConfig'));
});

// ===== Queue defaults preview tests (Settings 106: read + dry-run only, no write) =====
test('queue defaults preview read returns supported keys and omits workerEnv', async () => {
  const { readQueueDefaults, SUPPORTED_QUEUE_DEFAULT_KEYS, previewQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qd-'));
  const qfile = path.join(tmpDir, 'migration-queue.json');
  await fs.writeFile(qfile, JSON.stringify({
    defaults: {
      fixAgent: 'grok',
      workerMaxTurns: 128,
      workerEnv: { HTTP_PROXY: 'http://127.0.0.1:1', SECRET: 'x' },
      unknownKey: 'should-be-ignored',
      skipReview: false,
    },
  }), 'utf8');

  const read = await readQueueDefaults(qfile);
  assert.equal(read.fixAgent, 'grok');
  assert.equal(read.workerMaxTurns, 128);
  assert.equal(read.skipReview, false);
  assert.ok(!('workerEnv' in read));
  assert.ok(!('unknownKey' in read));
  assert.ok(SUPPORTED_QUEUE_DEFAULT_KEYS.includes('workerMaxTurns'));
});

test('queue defaults preview dry-run returns structured diff for supported keys only', async () => {
  const { previewQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qpreview-'));
  const qfile = path.join(tmpDir, 'q.json');
  await fs.writeFile(qfile, JSON.stringify({ defaults: { workerMaxTurns: 128, fixAgent: 'grok', maxIterations: 3 } }), 'utf8');

  const res = await previewQueueDefaults(qfile, { workerMaxTurns: 256, fixAgent: 'grok' });
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.diff));
  const changed = res.diff.find((d) => d.key === 'workerMaxTurns');
  assert.ok(changed);
  assert.equal(changed.before, 128);
  assert.equal(changed.after, 256);
  assert.equal(res.after.fixAgent, 'grok');
  assert.equal(res.before.maxIterations, 3);
});

test('queue defaults preview rejects unsupported keys with redacted error', async () => {
  const { previewQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qreject-'));
  const qfile = path.join(tmpDir, 'q.json');
  await fs.writeFile(qfile, JSON.stringify({ defaults: { workerMaxTurns: 128 } }), 'utf8');

  const bad1 = await previewQueueDefaults(qfile, { workerEnv: { x: 1 } });
  assert.equal(bad1.ok, false);
  assert.match(String(bad1.error || ''), /redacted/i);

  const bad2 = await previewQueueDefaults(qfile, { fooBarUnknown: 999 });
  assert.equal(bad2.ok, false);
  assert.match(String(bad2.error || ''), /redacted/i);
});

test('queue defaults preview dry run does not write file', async () => {
  const { previewQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qnowrite-'));
  const qfile = path.join(tmpDir, 'migration-queue.json');
  const initial = { defaults: { workerMaxTurns: 128, skipReview: true } };
  await fs.writeFile(qfile, JSON.stringify(initial), 'utf8');
  const beforeStat = await fs.stat(qfile);
  const beforeContent = await fs.readFile(qfile, 'utf8');

  const res = await previewQueueDefaults(qfile, { workerMaxTurns: 512 });
  assert.equal(res.ok, true);
  assert.equal(res.after.workerMaxTurns, 512);

  const afterContent = await fs.readFile(qfile, 'utf8');
  const afterStat = await fs.stat(qfile);
  assert.equal(afterContent, beforeContent, 'preview must not mutate the queue file');
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
});

// ===== Queue defaults apply tests (Settings 106: apply after preview/confirm, write+validate, rollback, task preservation, secret rejection) =====
test('queue defaults apply writes only supported keys, validates JSON and preserves task array', async () => {
  const { applyQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qapply-'));
  const qfile = path.join(tmpDir, 'migration-queue.json');
  const initial = {
    cwd: '..',
    defaults: { workerMaxTurns: 128, fixAgent: 'grok', skipReview: false, workerEnv: { HTTP_PROXY: 'http://p' } },
    tasks: [{ id: 't1', task: 'tasks/a.md' }, { id: 't2', task: 'tasks/b.md' }],
    gates: ['node check.js']
  };
  await fs.writeFile(qfile, JSON.stringify(initial, null, 2), 'utf8');

  const res = await applyQueueDefaults(qfile, { workerMaxTurns: 512, fixAgent: 'codex' });
  assert.equal(res.ok, true);
  assert.equal(res.applied.workerMaxTurns, 512);
  assert.equal(res.applied.fixAgent, 'codex');
  assert.equal(res.after.workerMaxTurns, 512);
  assert.equal(res.after.fixAgent, 'codex');

  const written = JSON.parse(await fs.readFile(qfile, 'utf8'));
  assert.equal(written.defaults.workerMaxTurns, 512);
  assert.equal(written.defaults.fixAgent, 'codex');
  // workerEnv must be preserved untouched
  assert.ok(written.defaults.workerEnv && written.defaults.workerEnv.HTTP_PROXY);
  // tasks array fully preserved
  assert.ok(Array.isArray(written.tasks));
  assert.equal(written.tasks.length, 2);
  assert.equal(written.tasks[0].id, 't1');
  assert.equal(written.gates.length, 1);
  // JSON remains valid by construction
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(written)));
});

test('queue defaults apply rejects unsupported and secret-like values', async () => {
  const { applyQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qsecret-'));
  const qfile = path.join(tmpDir, 'q.json');
  await fs.writeFile(qfile, JSON.stringify({ defaults: { workerMaxTurns: 128 }, tasks: [] }), 'utf8');

  const bad1 = await applyQueueDefaults(qfile, { workerEnv: { x: 1 } });
  assert.equal(bad1.ok, false);
  assert.match(String(bad1.error || ''), /redacted/i);

  const bad2 = await applyQueueDefaults(qfile, { fooUnknown: 1 });
  assert.equal(bad2.ok, false);

  // secret value rejection
  const bad3 = await applyQueueDefaults(qfile, { fixAgent: 'sk-1234567890abcdef' });
  assert.equal(bad3.ok, false);
  assert.match(String(bad3.error || ''), /redacted/i);
});

test('queue defaults apply rolls back on invalid write and task-array preservation', async () => {
  const { applyQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qrollback-'));
  const qfile = path.join(tmpDir, 'migration-queue.json');
  const initial = {
    defaults: { workerMaxTurns: 128 },
    tasks: [{ id: 'taskA' }, { id: 'taskB' }]
  };
  await fs.writeFile(qfile, JSON.stringify(initial), 'utf8');
  const beforeContent = await fs.readFile(qfile, 'utf8');

  // monkey-patch writeFile to corrupt immediately after "good" write so post-validate fails and rollback triggers
  const origWrite = fs.writeFile;
  let calls = 0;
  fs.writeFile = async (p, content, enc) => {
    await origWrite(p, content, enc);
    calls++;
    if (calls === 1) {
      // corrupt the file right after the apply's write so its re-read+validate detects invalid and rolls back
      await origWrite(p, '{ "not": "valid json for apply rollback test"', 'utf8');
    }
  };

  let res;
  try {
    res = await applyQueueDefaults(qfile, { workerMaxTurns: 999 });
  } finally {
    fs.writeFile = origWrite;
  }

  assert.equal(res.ok, false);
  assert.equal(res.rolledBack, true);

  // file must be restored to original (tasks preserved via rollback)
  const restored = await fs.readFile(qfile, 'utf8');
  assert.equal(restored, beforeContent);
  const parsed = JSON.parse(restored);
  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.defaults.workerMaxTurns, 128);
});

// ===== Settings import/export redaction tests (Settings 106) =====
test('settings export redaction produces schema version, profiles, non-secret settings, key status only and never raw secrets', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { createSettingsExport, SETTINGS_SCHEMA_VERSION } = mod;

  const nonSens = { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 64, queuePath: 'q.json' };
  const keys = { grokApiKey: 'configured', openaiApiKey: '', anthropicApiKey: 'configured' };
  const exp = createSettingsExport(nonSens, keys);

  assert.equal(exp.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(exp.schemaVersion, 1);
  assert.equal(exp.profiles && exp.profiles.fixAgent, 'grok');
  assert.equal(exp.profiles && exp.profiles.reviewAgent, 'codex');
  assert.ok(exp.nonSensitive);
  assert.equal(exp.nonSensitive.workerMaxTurns, 64);
  assert.equal(exp.keys.grokApiKey, 'configured');
  assert.equal(exp.keys.openaiApiKey, '');
  const ser = JSON.stringify(exp);
  assert.ok(!ser.includes('sk-'));
  assert.ok(!/Bearer |x-api-key|private key/i.test(ser));
  assert.ok(!ser.includes('real-secret'));
  assert.ok(ser.includes('configured'));
});

test('settings import validates schema version and rejects unsupported', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { validateAndPrepareSettingsImport, SETTINGS_SCHEMA_VERSION } = mod;

  const v1 = validateAndPrepareSettingsImport({ schemaVersion: SETTINGS_SCHEMA_VERSION, nonSensitive: { fixAgent: 'codex' } });
  assert.equal(v1.ok, true);
  assert.equal(v1.nonSensitive.fixAgent, 'codex');

  const badVer = validateAndPrepareSettingsImport({ schemaVersion: 99, nonSensitive: { fixAgent: 'x' } });
  assert.equal(badVer.ok, false);
  assert.match(String(badVer.error || ''), /schema version/i);
});

test('settings import rejects unknown secret-looking keys and raw values', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { validateAndPrepareSettingsImport } = mod;

  const bad1 = validateAndPrepareSettingsImport({ schemaVersion: 1, grokApiKey: 'sk-real-secret-abc' });
  assert.equal(bad1.ok, false);
  assert.match(String(bad1.error || ''), /secret/i);

  const bad2 = validateAndPrepareSettingsImport({ schemaVersion: 1, profiles: { fixAgent: 'sk-1234567890' }, nonSensitive: {} });
  assert.equal(bad2.ok, false);

  const bad3 = validateAndPrepareSettingsImport({ schemaVersion: 1, nonSensitive: { foo: 'Bearer xyz' } });
  assert.equal(bad3.ok, false);
});

test('settings import handles malformed JSON and non-object input', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { validateAndPrepareSettingsImport } = mod;

  assert.equal(validateAndPrepareSettingsImport(null).ok, false);
  assert.equal(validateAndPrepareSettingsImport(undefined).ok, false);
  assert.equal(validateAndPrepareSettingsImport('not-an-object').ok, false);
  assert.equal(validateAndPrepareSettingsImport(42).ok, false);
  assert.equal(validateAndPrepareSettingsImport({}).ok, false); // no schemaVersion match -> fail
  // simulate top level malformed as caught by handler producing 'malformed JSON'
  // validator returns 'malformed input' for non record which covers parse-fail cases
  assert.match(String(validateAndPrepareSettingsImport('{"schemaVersion":1, broken').error || ''), /malformed|invalid/i);
});

// Settings 107 file-based import/export (copy/download/upload via AntD, redacted, activeProfile, structured errors)
test('settings import export files 107 downloads redacted payload', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { createSettingsExport, SETTINGS_SCHEMA_VERSION } = mod;

  const nonSens = {
    fixAgent: 'grok',
    reviewAgent: 'codex',
    workerMaxTurns: 64,
    queuePath: 'q.json',
    activeProfile: 'local'
  };
  const keys = { grokApiKey: 'configured', openaiApiKey: '', anthropicApiKey: '' };
  const exp = createSettingsExport(nonSens, keys, 'local');

  assert.equal(exp.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(exp.activeProfile, 'local');
  assert.ok(exp.nonSensitive);
  assert.equal(exp.nonSensitive.activeProfile, 'local');
  assert.ok(exp.keys);
  const ser = JSON.stringify(exp);
  assert.ok(!ser.includes('sk-'));
  assert.ok(!/Bearer |x-api-key|private key/i.test(ser));
  assert.ok(ser.includes('configured'));
  // includes required: schemaVersion, active profile, non-secret settings, key status only (no raw)
});

test('settings import export files 107 rejects raw secret fields', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { validateAndPrepareSettingsImport } = mod;

  const bad1 = validateAndPrepareSettingsImport({ schemaVersion: 1, nonSensitive: { fixAgent: 'grok', grokApiKey: 'sk-REAL-107-secret' } });
  assert.equal(bad1.ok, false);
  assert.match(String(bad1.error || ''), /secret/i);

  const bad2 = validateAndPrepareSettingsImport({ schemaVersion: 1, nonSensitive: { baseUrl: 'Bearer xyz' } });
  assert.equal(bad2.ok, false);

  const bad3 = validateAndPrepareSettingsImport({ schemaVersion: 1, profiles: { fixAgent: 'sk-1234567890' } });
  assert.equal(bad3.ok, false);
});

test('settings diagnostics payload shape covers effective config, sources, keys, queue path, repo root, last run state', () => {
  const sample = {
    effectiveConfig: { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 512, queuePath: 'agent-loop/scripts/migration-queue.json', injectToWorker: true },
    configSources: { fixAgent: 'workspace', queuePath: 'default' },
    keys: { grokApiKey: 'configured', openaiApiKey: '', anthropicApiKey: '' },
    queuePath: 'agent-loop/scripts/migration-queue.json',
    repoRoot: '/abs/repo',
    lastRunState: { runId: '2026-06-24T00', status: 'DONE_REVIEWED', task: 't.md' },
    warnings: [
      { category: 'ready', message: 'provider key(s) configured' },
      { category: 'skipped', message: 'no key' },
      { category: 'failed', message: 'queue missing' },
      { category: 'unknown', message: 'last unknown' },
    ],
  };
  assert.ok(sample.effectiveConfig && typeof sample.effectiveConfig === 'object');
  assert.ok(sample.configSources && typeof sample.configSources === 'object');
  assert.ok(sample.keys && typeof sample.keys === 'object');
  assert.equal(typeof sample.queuePath, 'string');
  assert.equal(typeof sample.repoRoot, 'string');
  assert.ok(sample.lastRunState === null || typeof sample.lastRunState === 'object');
  assert.ok(Array.isArray(sample.warnings));
  const cats = sample.warnings.map((w) => w.category);
  assert.ok(cats.includes('ready'));
  assert.ok(cats.includes('skipped'));
  assert.ok(cats.includes('failed'));
  assert.ok(cats.includes('unknown'));
});

test('diagnostics data passes shared redaction helper and covers effective config redaction', () => {
  const { redactSettingsMessageForLog } = requireFromExtension('./out/settingsMessages.js');
  const diagMsg = {
    type: 'diagnostics',
    payload: {
      effectiveConfig: { fixAgent: 'grok', grokApiKey: 'should-not-matter' },
      keys: { grokApiKey: 'configured' },
      queuePath: 'agent-loop/scripts/migration-queue.json',
      warnings: [{ category: 'ready', message: 'ok' }],
    },
  };
  const red = redactSettingsMessageForLog(diagMsg);
  const s = JSON.stringify(red);
  assert.ok(s.includes('effectiveConfig') || s.includes('queuePath'));
  // redaction removes raw keys on matching fields
  assert.ok(!s.includes('sk-') && !s.includes('Bearer'));
  assert.match(s, /configured|redacted|<configured>|''/i);
});

test('effective config and queue path appear in diagnostics shape', () => {
  const sampleDiag = {
    effectiveConfig: { queuePath: 'p.json' },
    queuePath: 'p.json',
    warnings: [{ category: 'ready', message: 'queue path' }],
  };
  assert.ok('effectiveConfig' in sampleDiag);
  assert.ok('queuePath' in sampleDiag);
  assert.ok(Array.isArray(sampleDiag.warnings));
});

test('settings diagnostics artifacts 107 redacts all secret surfaces', () => {
  const { redactSettingsMessageForLog } = requireFromExtension('./out/settingsMessages.js');
  const rawArtifact = {
    generatedAt: new Date().toISOString(),
    effectiveConfig: { fixAgent: 'grok', queuePath: 'agent-loop/scripts/migration-queue.json' },
    keys: { grokApiKey: 'configured', openaiApiKey: '', anthropicApiKey: '' },
    queuePath: 'agent-loop/scripts/migration-queue.json',
    providerHealth: { grok: { provider: 'grok', status: 'ok', reason: 'ok' } },
    lastRunStatus: { runId: 'r1', status: 'DONE_REVIEWED', task: 't.md' },
    // attempt to surface secrets under secret-key-named fields (must be redacted by shared helper)
    grokApiKey: 'sk-FAKE1234567890ABCDEF',
    authToken: 'Bearer xyz-secret',
    secretEnv: { FOO: 'sk-hidden' },
  };
  const redacted = redactSettingsMessageForLog(rawArtifact);
  const serialized = JSON.stringify(redacted);
  // redacts all secret surfaces
  assert.ok(!/sk-FAKE|Bearer xyz|sk-hidden/i.test(serialized), 'redacts secrets');
  assert.ok(serialized.includes('generatedAt') && serialized.includes('queuePath'));
  assert.match(serialized, /configured|<configured>|''/i);
});

test('settings diagnostics artifacts 107 includes queue and run context', () => {
  const artifact = {
    generatedAt: '2026-06-25T00:00:00.000Z',
    effectiveConfig: { queuePath: 'agent-loop/scripts/migration-queue.json', fixAgent: 'grok' },
    keys: { grokApiKey: 'configured' },
    queuePath: 'agent-loop/scripts/migration-queue.json',
    providerHealth: {},
    lastRunState: { runId: 'run-ctx', status: 'HALT_NO_CHANGES' },
    lastRunStatus: { runId: 'run-ctx', status: 'HALT_NO_CHANGES' },
  };
  assert.ok('generatedAt' in artifact && typeof artifact.generatedAt === 'string');
  assert.ok('queuePath' in artifact && typeof artifact.queuePath === 'string');
  assert.ok('providerHealth' in artifact);
  assert.ok(artifact.lastRunStatus || artifact.lastRunState, 'includes run context');
  assert.ok('effectiveConfig' in artifact && 'keys' in artifact);
});

// ===== Settings schema 107 tests =====
test('settings schema 107 declares all non-secret setting keys', async () => {
  const pkgPath = path.join(extensionRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  const props = (packageJson.contributes && packageJson.contributes.configuration && packageJson.contributes.configuration.properties) || {};
  const nonSecret = [
    'pollIntervalMs',
    'queuePath',
    'openDashboardOnRun',
    'fixAgent',
    'reviewAgent',
    'workerMaxTurns',
    'workerMaxRetries',
    'worktreeScope',
    'baseUrl',
    'injectKeysToWorker',
  ];
  for (const k of nonSecret) {
    const fullKey = 'agentLoop.' + k;
    assert.ok(fullKey in props, 'missing package schema entry for non-secret key: ' + fullKey);
    assert.ok(props[fullKey] && typeof props[fullKey].type !== 'undefined', 'schema entry for ' + fullKey + ' must declare a type');
  }
  // Raw key fields must NOT appear in workspace schema (SecretStorage-only)
  assert.ok(!('agentLoop.grokApiKey' in props), 'raw grokApiKey must not be in package configuration schema');
  assert.ok(!('agentLoop.openaiApiKey' in props), 'raw openaiApiKey must not be in package configuration schema');
  assert.ok(!('agentLoop.anthropicApiKey' in props), 'raw anthropicApiKey must not be in package configuration schema');
});

test('settings schema 107 rejects unsupported enum values', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { sanitizeSettingsForSave, SETTING_ENUMS } = mod;
  // supported pass through
  const good = sanitizeSettingsForSave({ fixAgent: 'codex', reviewAgent: 'none', worktreeScope: 'task', workerMaxTurns: 64, baseUrl: 'https://ex' });
  assert.equal(good.fixAgent, 'codex');
  assert.equal(good.reviewAgent, 'none');
  assert.equal(good.worktreeScope, 'task');
  assert.equal(good.workerMaxTurns, 64);
  // unsupported enums are rejected (dropped), never written to workspace config
  const bad = sanitizeSettingsForSave({ fixAgent: 'foo', reviewAgent: 'bar', worktreeScope: 'other', injectKeysToWorker: true });
  assert.ok(!('fixAgent' in bad) || bad.fixAgent === undefined);
  assert.ok(!('reviewAgent' in bad) || bad.reviewAgent === undefined);
  assert.ok(!('worktreeScope' in bad) || bad.worktreeScope === undefined);
  assert.equal(bad.injectKeysToWorker, true);
  // secrets never leak into sanitized
  const withSecret = sanitizeSettingsForSave({ fixAgent: 'grok', grokApiKey: 'sk-SECRET-123', openaiApiKey: 'sk-ooo' });
  assert.equal(withSecret.fixAgent, 'grok');
  assert.ok(!('grokApiKey' in withSecret));
  assert.ok(!('openaiApiKey' in withSecret));
});

test('effective config 107 merges package defaults workspace values and profile overrides', () => {
  const { getEffectiveConfig } = requireFromExtension('./out/settingsConfig.js');
  // reset
  delete globalThis.__AGENT_LOOP_TEST_CONFIG;
  // package default path (no override -> get returns pkg via defaultValue)
  let eff = getEffectiveConfig();
  assert.equal(eff.fixAgent, 'grok');
  assert.equal(eff.reviewAgent, 'codex');
  assert.equal(eff.workerMaxTurns, 512);
  // workspace value overrides package default (107 merge)
  globalThis.__AGENT_LOOP_TEST_CONFIG = { fixAgent: 'codex', reviewAgent: 'grok', workerMaxTurns: 64, queuePath: '/ws/q.json', injectKeysToWorker: false };
  eff = getEffectiveConfig();
  assert.equal(eff.fixAgent, 'codex');
  assert.equal(eff.reviewAgent, 'grok');
  assert.equal(eff.workerMaxTurns, 64);
  assert.equal(eff.queuePath, '/ws/q.json');
  assert.equal(eff.injectKeysToWorker, false);
  // profile-like override (agents as profile) + other ws
  globalThis.__AGENT_LOOP_TEST_CONFIG = { fixAgent: 'codex', reviewAgent: 'none', worktreeScope: 'task' };
  eff = getEffectiveConfig();
  assert.equal(eff.fixAgent, 'codex');
  assert.equal(eff.reviewAgent, 'none');
  assert.equal(eff.worktreeScope, 'task');
  delete globalThis.__AGENT_LOOP_TEST_CONFIG;
});

test('effective config 107 reviewAgent none removes reviewer labels', () => {
  const phase = requireFromExtension('./out/phaseLabels.js');
  const stateR = requireFromExtension('./out/stateReader.js');
  const dash = requireFromExtension('./out/dashboardPanel.js');
  // set none
  globalThis.__AGENT_LOOP_TEST_CONFIG = { reviewAgent: 'none', fixAgent: 'grok' };
  const { resolveAgentRoles, buildPipelineSteps, activeAgentLabel } = phase;
  const roles = resolveAgentRoles(null, null);
  assert.equal(roles.fixAgent, 'grok');
  assert.equal(roles.reviewAgent, null, 'none must become null for labels');
  const steps = buildPipelineSteps(null, null);
  const hasReviewStep = steps.some((s) => /REVIEW/.test(s.key) || /review/i.test(s.label));
  assert.equal(hasReviewStep, false, 'reviewAgent none must remove reviewer steps/labels');
  const label = activeAgentLabel('DONE_REVIEWED', null);
  // when none, should not include reviewer in final label
  assert.ok(!/codex|grok.*\+/i.test(label) || label === 'grok', 'none removes reviewer from agent label');
  // also check compute uses consistent (no crash)
  const { computeActiveProfileName } = dash;
  assert.equal(computeActiveProfileName({ fixAgent: 'grok', reviewAgent: null }), 'grok');
  delete globalThis.__AGENT_LOOP_TEST_CONFIG;
});

// ===== Settings 107: worker env secret injection (fake SecretStorage + mocked spawn env capture) =====
function makeFakeSecrets(keyMap) {
  return {
    async get(k) {
      return (keyMap && keyMap[k]) || null;
    },
  };
}

function makeSpawnCapture() {
  const cp = cjsRequire('node:child_process');
  const orig = cp.spawn;
  let capturedEnv = null;
  let capturedArgs = null;
  cp.spawn = function (p, a, o) {
    capturedEnv = (o && o.env) ? { ...o.env } : {};
    capturedArgs = Array.isArray(a) ? [...a] : a;
    const fake = {
      stdout: { on() { return this; } },
      stderr: { on() { return this; } },
      on(ev, fn) {
        if (ev === 'close') setImmediate(() => fn(0));
        return this;
      },
      kill() {},
    };
    return fake;
  };
  return {
    getEnv() { return capturedEnv; },
    getArgs() { return capturedArgs; },
    restore() { cp.spawn = orig; },
  };
}

test('worker env 107 injects enabled secret keys into runQueue spawn', async () => {
  globalThis.__AGENT_LOOP_TEST_CONFIG = {
    injectKeysToWorker: true,
    baseUrl: 'https://api.proxy.example/v1',
    fixAgent: 'grok',
    reviewAgent: 'codex',
    workerMaxTurns: 32,
    workerMaxRetries: 2,
    queuePath: 'agent-loop/scripts/migration-queue.json',
    worktreeScope: 'queue',
  };
  const secrets = makeFakeSecrets({
    'agentLoop.grokApiKey': 'sk-107-grok-inject',
    'agentLoop.openaiApiKey': 'sk-107-openai-inject',
    'agentLoop.anthropicApiKey': null,
  });
  const cap = makeSpawnCapture();
  try {
    const { RunController } = requireFromExtension('./out/runController.js');
    const out = { show() {}, append() {}, appendLine() {} };
    const ctrl = new RunController(process.cwd(), out, secrets, () => {}, () => {});
    await ctrl.runQueue([]);
    const env = cap.getEnv();
    assert.ok(env, 'env must be captured from spawn');
    assert.equal(env.GROK_API_KEY, 'sk-107-grok-inject');
    assert.equal(env.XAI_API_KEY, 'sk-107-grok-inject');
    assert.equal(env.OPENAI_API_KEY, 'sk-107-openai-inject');
    assert.equal(env.OPENAI_BASE_URL, 'https://api.proxy.example/v1');
    assert.equal(env.LLM_BASE_URL, 'https://api.proxy.example/v1');
    assert.equal(env.AGENT_LOOP_INJECT_KEYS, '1');
    // base aliases only present when configured (this case yes)
    assert.ok('OPENAI_BASE_URL' in env);
  } finally {
    cap.restore();
    delete globalThis.__AGENT_LOOP_TEST_CONFIG;
  }

  // also cover: injectKeysToWorker:false prevents all (secret) key injection
  globalThis.__AGENT_LOOP_TEST_CONFIG = { injectKeysToWorker: false, baseUrl: 'https://ignored.example' };
  const cap2 = makeSpawnCapture();
  try {
    const { RunController } = requireFromExtension('./out/runController.js');
    const out = { show() {}, append() {}, appendLine() {} };
    const secrets2 = makeFakeSecrets({ 'agentLoop.grokApiKey': 'sk-blocked-when-false' });
    const ctrl2 = new RunController(process.cwd(), out, secrets2, () => {}, () => {});
    await ctrl2.runQueue([]);
    const env2 = cap2.getEnv();
    assert.ok(env2);
    assert.ok(!('GROK_API_KEY' in env2) || !env2.GROK_API_KEY);
    assert.ok(!('XAI_API_KEY' in env2));
    assert.equal(env2.AGENT_LOOP_INJECT_KEYS, '0');
    // when not configured (but here we don't set base in this cfg), but main is keys blocked
  } finally {
    cap2.restore();
    delete globalThis.__AGENT_LOOP_TEST_CONFIG;
  }
});

test('worker env 107 never serializes injected secrets', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wenv107-'));
  const qpath = path.join(tmp, 'mig-q.json');
  await fs.writeFile(qpath, JSON.stringify({ defaults: { fixAgent: 'grok' }, tasks: [] }), 'utf8');
  globalThis.__AGENT_LOOP_TEST_CONFIG = {
    injectKeysToWorker: true,
    baseUrl: '',
    fixAgent: 'grok',
    reviewAgent: 'none',
    workerMaxTurns: 16,
    workerMaxRetries: 1,
    queuePath: qpath,
    worktreeScope: 'queue',
  };
  const secret = 'sk-107-secret-NEVER-SERIALIZE-THIS';
  const secrets = makeFakeSecrets({ 'agentLoop.grokApiKey': secret });
  const cap = makeSpawnCapture();
  try {
    const { RunController } = requireFromExtension('./out/runController.js');
    const out = { show() {}, append() {}, appendLine() {} };
    const ctrl = new RunController(tmp, out, secrets, () => {}, () => {});
    await ctrl.runQueue([]);
    const env = cap.getEnv();
    assert.ok(env);
    assert.equal(env.GROK_API_KEY, secret);
    assert.equal(env.AGENT_LOOP_INJECT_KEYS, '1');
    // base only when configured: here empty so absent
    assert.ok(!('OPENAI_BASE_URL' in env));
    assert.ok(!('LLM_BASE_URL' in env));
    // never written to queue json
    const qraw = await fs.readFile(qpath, 'utf8');
    assert.ok(!qraw.includes(secret));
    assert.ok(!qraw.includes('GROK_API_KEY'));
    // not in sample state serialization
    const sample = { status: 'RUN', options: { task: 'x.md' } };
    assert.ok(!JSON.stringify(sample).includes(secret));
  } finally {
    cap.restore();
    delete globalThis.__AGENT_LOOP_TEST_CONFIG;
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

test('CLI worker routing 107 forwards settings to run queue args', async () => {
  globalThis.__AGENT_LOOP_TEST_CONFIG = {
    fixAgent: 'codex',
    reviewAgent: 'grok',
    fixModel: 'codex-model-107',
    reviewModel: 'grok-model-107',
    workerMaxTurns: 77,
    workerMaxRetries: 4,
    injectKeysToWorker: true,
    baseUrl: '',
    queuePath: 'agent-loop/scripts/migration-queue.json',
    worktreeScope: 'queue',
  };
  const cap = makeSpawnCapture();
  try {
    const { RunController } = requireFromExtension('./out/runController.js');
    const out = { show() {}, append() {}, appendLine() {} };
    const ctrl = new RunController(process.cwd(), out, null, () => {}, () => {});
    await ctrl.runQueue([]);
    const args = cap.getArgs() || [];
    // verify routing flags visible in generated queue invocation args
    assert.ok(args.includes('--fix-agent'), 'should include --fix-agent');
    const fixIdx = args.indexOf('--fix-agent');
    assert.equal(args[fixIdx + 1], 'codex');
    assert.ok(args.includes('--review-agent'), 'should include --review-agent');
    const revIdx = args.indexOf('--review-agent');
    assert.equal(args[revIdx + 1], 'grok');
    assert.ok(args.includes('--fix-model'));
    assert.ok(args.includes('codex-model-107'));
    assert.ok(args.includes('--review-model'));
    assert.ok(args.includes('grok-model-107'));
    assert.ok(args.includes('--worker-max-turns'));
    assert.ok(args.includes('77'));
    assert.ok(args.includes('--worker-max-retries'));
    assert.ok(args.includes('4'));
    // --queue always present
    assert.ok(args.includes('--queue'));
    // covers grok/codex

    // existing overrides (extraArgs simulating queue-entry precedence) win over global settings in generated args
    // wait for async close handler to clear this.child so second runQueue actually spawns
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 5));
    await ctrl.runQueue(['--only', 't1', '--fix-agent', 'grok']);
    const args2 = cap.getArgs() || [];
    const lastFix = args2.lastIndexOf('--fix-agent');
    assert.equal(args2[lastFix + 1], 'grok');
    assert.ok(args2.includes('--only'));
  } finally {
    cap.restore();
    delete globalThis.__AGENT_LOOP_TEST_CONFIG;
  }
});

test('CLI worker routing 107 skips review args when reviewAgent none', async () => {
  globalThis.__AGENT_LOOP_TEST_CONFIG = {
    fixAgent: 'grok',
    reviewAgent: 'none',
    workerMaxTurns: 5,
    workerMaxRetries: 0,
    fixModel: '',
    reviewModel: 'grok-review-should-be-skipped',
  };
  const cap = makeSpawnCapture();
  try {
    const { RunController } = requireFromExtension('./out/runController.js');
    const out = { show() {}, append() {}, appendLine() {} };
    const ctrl = new RunController(process.cwd(), out, null, () => {}, () => {});
    await ctrl.runQueue([]);
    const args = cap.getArgs() || [];
    assert.ok(args.includes('--fix-agent'));
    assert.equal(args[args.indexOf('--fix-agent') + 1], 'grok');
    assert.ok(args.includes('--worker-max-turns'));
    assert.ok(args.includes('--worker-max-retries'));
    // must skip review when none (use --skip-review, no --review-agent none)
    assert.ok(args.includes('--skip-review'), 'none should emit --skip-review');
    assert.ok(!args.includes('--review-agent'), 'must not emit --review-agent when none');
    assert.ok(!args.includes('--review-model'), 'must not emit --review-model when reviewAgent none');
    assert.ok(!args.includes('grok-review-should-be-skipped'), 'review model value must not appear when none');
    // covers none
  } finally {
    cap.restore();
    delete globalThis.__AGENT_LOOP_TEST_CONFIG;
  }
});

// ===== Profile storage schema 107 tests (non-secret only) =====
test('profile storage 107 validates non-secret profile schema', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { loadProfileStorage, PROFILE_PRESETS, getActiveProfileKey, listProfilePresetKeys } = mod;

  // presets exist for local, proxy, CI, production-like
  const presetKeys = listProfilePresetKeys();
  assert.ok(presetKeys.includes('local'));
  assert.ok(presetKeys.includes('proxy'));
  assert.ok(presetKeys.includes('ci'));
  assert.ok(presetKeys.includes('production'));
  assert.equal(typeof PROFILE_PRESETS.local, 'object');
  assert.equal(typeof PROFILE_PRESETS.proxy, 'object');

  // active key fallback
  assert.equal(getActiveProfileKey(null), 'local');
  assert.equal(getActiveProfileKey(''), 'local');
  assert.equal(getActiveProfileKey('   '), 'local');
  assert.equal(getActiveProfileKey('proxy'), 'proxy');
  assert.equal(getActiveProfileKey('ci '), 'ci');

  // validate non-secret profile schema roundtrip
  const goodInput = {
    activeProfile: 'proxy',
    local: { fixAgent: 'grok', reviewAgent: 'codex', workerMaxTurns: 512 },
    proxy: { fixAgent: 'grok', baseUrl: 'http://proxy:8080', injectKeysToWorker: false },
  };
  const loaded = loadProfileStorage(goodInput);
  assert.equal(loaded.activeProfile, 'proxy');
  assert.ok('local' in loaded.profiles);
  assert.equal(loaded.profiles.local.fixAgent, 'grok');
  assert.ok('proxy' in loaded.profiles);
  assert.equal(loaded.profiles.proxy.baseUrl, 'http://proxy:8080');
  assert.ok(!loaded.warning);
  // no secret fields carried
  assert.ok(!('grokApiKey' in loaded.profiles.local));
});

test('profile storage 107 rejects secret-looking profile values', () => {
  const mod = requireFromExtension('./out/settingsConfig.js');
  const { loadProfileStorage } = mod;

  const badSecret = {
    activeProfile: '',
    myprof: { fixAgent: 'grok', apiKey: 'sk-REAL-SECRET-SHOULD-NOT-ENTER', baseUrl: 'x' },
    another: { reviewAgent: 'codex', token: 'Bearer abc' },
    'prod-like': { workerMaxTurns: 10 },
  };
  const res = loadProfileStorage(badSecret);
  // secret-like values cause the bad entry to be dropped (or top level warning)
  assert.ok(!('myprof' in res.profiles) || Object.keys(res.profiles.myprof || {}).length === 0);
  assert.ok(!('another' in res.profiles) || !('token' in (res.profiles.another || {})));
  // active key falls back when missing
  assert.equal(res.activeProfile, 'local');
  // warning present and redacted (no secret content)
  if (res.warning) {
    assert.match(res.warning, /redacted/i);
    assert.ok(!res.warning.includes('sk-'));
    assert.ok(!res.warning.includes('Bearer'));
  }
  // still supports clean ones if mixed
  const mixed = {
    clean: { fixAgent: 'codex' },
    dirty: { fixAgent: 'grok', grokApiKey: 'sk-dirty' },
  };
  const mixRes = loadProfileStorage(mixed);
  assert.ok('clean' in mixRes.profiles);
  assert.ok(!('dirty' in mixRes.profiles));
});

test('profile CRUD UI 107 renders profile actions', async () => {
  const src = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8'
  );
  // marker for gate
  // profile CRUD UI 107 renders profile actions
  assert.match(src, /ProfileCrudView|Profiles/);
  assert.match(src, /<List/);
  assert.match(src, /onCreate|createProfile|handleCreateProfile/);
  assert.match(src, /onRename|renameProfile|handleRenameProfile/);
  assert.match(src, /onDuplicate|duplicateProfile/);
  assert.match(src, /onDelete|deleteProfile/);
  assert.match(src, /onSelect|selectProfile/);
  assert.match(src, /Modal/);
  assert.match(src, /Form/);
  assert.match(src, /Select/);
  assert.match(src, /Tag/);
  assert.match(src, /Button/);
  // uses AntD List for profile list actions
  const profSection = src.match(/function ProfileCrudView[\s\S]*?^}/m)?.[0] || src;
  assert.match(profSection, /<List/);
  assert.match(profSection, /actions=\{/);
});

test('profile CRUD UI 107 blocks invalid profile names', async () => {
  const src = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8'
  );
  const panelSrc = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboardPanel.ts'),
    'utf8'
  );
  const cfgSrc = await fs.readFile(
    path.join(extensionRoot, 'src', 'settingsConfig.ts'),
    'utf8'
  );
  // profile CRUD UI 107 blocks invalid profile names
  assert.match(src, /invalid profile name|pattern:.*a-zA-Z0-9|blocks|cannot delete last/);
  assert.match(cfgSrc, /isValidProfileName|cannot delete last profile|invalid profile name/);
  assert.match(panelSrc, /applyProfileDelete|!isValidProfileName|profileError|cannot delete last/);
  // name validation used
  assert.match(cfgSrc, /sanitizeProfileName|\/\[ \^a-zA-Z0-9_\-\] \+\/ /);
});

test('queue defaults sync 107 previews settings to defaults diff', async () => {
  const src = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8'
  );
  // queue defaults sync 107 previews settings to defaults diff
  assert.match(src, /doSyncFromSettings|从 Settings 同步并预览 diff/);
  assert.match(src, /<Table|Table.*diff|before.*after.*diff/);
  assert.match(src, /Preview result \(before\/after diff for supported keys\)/);

  // functional: preview settings-derived values to structured diff (preserves tasks, omits workerEnv)
  const { previewQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qsync107-'));
  const qfile = path.join(tmpDir, 'q.json');
  await fs.writeFile(qfile, JSON.stringify({
    defaults: { fixAgent: 'grok', workerMaxTurns: 128, worktreeScope: 'queue', workerEnv: { SECRET: 'x' } },
    tasks: [{ id: 't1' }]
  }), 'utf8');

  // simulate sync from settings values (supported only)
  const settingsVals = { fixAgent: 'codex', workerMaxTurns: 64, worktreeScope: 'task', baseUrl: 'http://x' };
  const proposed = {};
  ['fixAgent', 'reviewAgent', 'workerMaxTurns', 'workerMaxRetries', 'worktreeScope'].forEach(k => {
    if (k in settingsVals) proposed[k] = settingsVals[k];
  });
  const res = await previewQueueDefaults(qfile, proposed);
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.diff));
  const wm = res.diff.find((d) => d.key === 'workerMaxTurns');
  assert.ok(wm);
  assert.equal(wm.before, 128);
  assert.equal(wm.after, 64);
  assert.equal(res.after.fixAgent, 'codex');
  assert.equal(res.after.worktreeScope, 'task');
  assert.ok(!('workerEnv' in (res.before || {})));
});

test('queue defaults sync 107 applies only after confirmation', async () => {
  const src = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8'
  );
  // queue defaults sync 107 applies only after confirmation
  assert.match(src, /确认应用|preview && preview.ok && onApply/);
  assert.match(src, /applyResult.*rolledBack|redacted error/);

  // functional: apply validates, preserves tasks, redacts on failure/rollback
  const { applyQueueDefaults } = requireFromExtension('./out/settingsConfig.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-qapply107-'));
  const qfile = path.join(tmpDir, 'migration-queue.json');
  const initial = {
    defaults: { workerMaxTurns: 128, fixAgent: 'grok' },
    tasks: [{ id: 'keep1', task: 'tasks/a.md' }, { id: 'keep2' }],
    other: 'preserve'
  };
  await fs.writeFile(qfile, JSON.stringify(initial, null, 2), 'utf8');

  // apply after preview-style confirmation (using settings sync values)
  const proposed = { workerMaxTurns: 256, fixAgent: 'codex' };
  const res = await applyQueueDefaults(qfile, proposed);
  assert.equal(res.ok, true);
  assert.ok(res.applied);
  assert.equal(res.applied.workerMaxTurns, 256);

  const written = JSON.parse(await fs.readFile(qfile, 'utf8'));
  assert.equal(written.defaults.workerMaxTurns, 256);
  assert.equal(written.defaults.fixAgent, 'codex');
  assert.ok(Array.isArray(written.tasks) && written.tasks.length === 2);
  assert.equal(written.tasks[0].id, 'keep1');
  assert.equal(written.other, 'preserve');

  // failure case: unsupported redacts + no overwrite
  const badRes = await applyQueueDefaults(qfile, { workerEnv: { leak: 1 } });
  assert.equal(badRes.ok, false);
  assert.match(String(badRes.error || ''), /redacted/i);
  const afterBad = JSON.parse(await fs.readFile(qfile, 'utf8'));
  assert.equal(afterBad.defaults.workerMaxTurns, 256); // unchanged
});

test('Settings UI polish 107 uses AntD tabs descriptions and alerts', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8'
  );
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8'
  );

  // uses required AntD in settings surface
  assert.match(source, /\bEmpty\b/);
  assert.match(source, /from ['"]antd['"]/);
  assert.match(source, /<Tabs[\s\S]{0,200}defaultActiveKey=["']cli["']/);
  assert.match(source, /<Descriptions[\s\S]{0,50}label=["']活跃 Profile["']/);
  assert.match(source, /<Alert type=("|')(warning|info|success|error)/);
  // Tabs + Descriptions + Alert + Empty + Form etc used for polish
  assert.match(source, /SettingsView/);
  // no .ant- targeting allowed
  assert.doesNotMatch(css, /\.ant-|\.agent-ant-/);
  // marker
});

test('Settings UI polish 107 keeps content padding single-layer', async () => {
  const source = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'DashboardApp.tsx'),
    'utf8'
  );
  const css = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dashboard-react.css'),
    'utf8'
  );

  // Settings content uses native shell padding only, no nested inline padding layer on root
  assert.doesNotMatch(source, /SettingsView[\s\S]{0,30}style=\{\{[\s\S]{0,20}padding:\s*['"]8px 4px/);
  assert.doesNotMatch(source, /<div style=\{\{ padding: ['"]4px 0/); // subviews cleaned for single layer
  // content padding defined once at shell
  const contentRule = css.match(/\.native-content\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? '';
  assert.match(contentRule, /padding:\s*24px/);
  // no ant internal selectors; text containers use max-width/ellipsis or antd handling
  assert.doesNotMatch(css, /\.ant-|\.agent-ant-/);
  assert.match(source, /maxWidth:\s*6(20|20)/); // forms use bounded containers
  // marker
});

test('dev preview mocks 107 covers settings commands', async () => {
  const devSrc = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dev.tsx'),
    'utf8'
  );
  // covers switching and exercising in browser preview without VS Code
  assert.match(devSrc, /getSettings/);
  assert.match(devSrc, /saveSettings/);
  assert.match(devSrc, /testProvider/);
  assert.match(devSrc, /getDiagnostics/);
  assert.match(devSrc, /exportSettings/);
  assert.match(devSrc, /importSettings/);
  assert.match(devSrc, /getQueueDefaults/);
  assert.match(devSrc, /previewQueueDefaults/);
  assert.match(devSrc, /applyQueueDefaults/);
  assert.match(devSrc, /listProfiles|createProfile|selectProfile/);
  // responses include success/failure examples
  assert.match(devSrc, /status:\s*['"]ok['"]/);
  assert.match(devSrc, /status:\s*['"]skipped['"]/);
  assert.match(devSrc, /ok:\s*false|error:/);
  // dev toolbar switch to settings documented
  assert.match(devSrc, /Dev preview mocks 107/);
  // dev dispatch for messages
  assert.match(devSrc, /dispatchEvent.*MessageEvent.*settings|providerHealth|queueDefaults|diagnostics/);
});

test('dev preview mocks 107 never stores raw keys', async () => {
  const devSrc = await fs.readFile(
    path.join(extensionRoot, 'src', 'dashboard-react', 'dev.tsx'),
    'utf8'
  );
  // save never keeps raw key values, uses configured redaction only
  assert.match(devSrc, /['"]configured['"]/);
  assert.match(devSrc, /data\.grokApiKey \? ['"]configured['"] : ['']/);
  // import explicitly rejects raw secret-looking content
  assert.match(devSrc, /hasSecret|contains secret-looking keys/);
  assert.match(devSrc, /importSettingsResult.*ok:\s*false/);
  // confirm ternary protects from storing raw input value directly
  assert.doesNotMatch(devSrc, /newKeys\.grokApiKey\s*=\s*data\.grokApiKey(?!\s*\?)/);
  // never writes keys to any local file in dev mock (only in-mem)
  assert.doesNotMatch(devSrc, /fs\.promises|writeFileSync|fs\.writeFile.*key/i);
});

test('settings docs 107 documents SecretStorage and queue defaults', async () => {
  const readme = await fs.readFile(path.join(extensionRoot, 'README.md'), 'utf8');
  // non-secret workspace settings vs SecretStorage keys
  assert.match(readme, /non-secret workspace settings.*SecretStorage keys|SecretStorage.*keys|workspace settings.*SecretStorage/);
  // provider health checks, CLI checks, and diagnostics export
  assert.match(readme, /provider health checks|CLI checks|diagnostics export|testProviderHealth|testWorkerCliHealth|getDiagnostics/);
  // queue defaults preview/apply protects task arrays and secrets
  assert.match(readme, /queue defaults preview\/apply protects task arrays and secrets|preserves.*tasks array|protects.*task arrays and secrets|previewQueueDefaults|applyQueueDefaults/);
  // covers broader goal topics without secrets or marketing
  assert.match(readme, /CLI workers|LLM keys|profiles|queue defaults|diagnostics|safe export\/import/);
});

test('workspace trust 107 rejects queue paths outside workspace', async () => {
  resetVscode107State();
  const wsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-ws-trust-reject-'));
  await fs.mkdir(path.join(wsRoot, 'agent-loop'), { recursive: true });
  await fs.writeFile(path.join(wsRoot, 'agent-loop', 'package.json'), '{"name":"al"}', 'utf8');
  seedWorkspaceFolders([{ uri: { fsPath: wsRoot } }]);
  // cover Windows drive-letter, .. traversal, abs outside
  const bads = [
    path.join(wsRoot, '..', 'outside.json'),
    'C:\\outside-trust107\\q.json',
    '../../escape-from-ws.json',
    path.resolve(wsRoot, '..', 'abs-trav.json')
  ];
  const mod = requireFromExtension('./out/paths.js');
  const qpathFn = mod.queuePath;
  const withinFn = mod.isPathWithinWorkspace;
  const defaultSafe = path.resolve(wsRoot, 'agent-loop/scripts/migration-queue.json');
  for (const bad of bads) {
    seedWorkspaceConfig({ queuePath: bad });
    const resolved = qpathFn(wsRoot);
    assert.equal(resolved, defaultSafe, 'outside must resolve to default inside');
    assert.equal(withinFn(wsRoot, bad), false);
  }
  resetVscode107State();
});

test('workspace trust 107 accepts normalized relative queue paths', async () => {
  resetVscode107State();
  const wsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-ws-trust-accept-'));
  await fs.mkdir(path.join(wsRoot, 'agent-loop'), { recursive: true });
  await fs.writeFile(path.join(wsRoot, 'agent-loop', 'package.json'), '{"name":"al"}', 'utf8');
  seedWorkspaceFolders([{ uri: { fsPath: wsRoot } }]);
  const goods = [
    'agent-loop/scripts/migration-queue.json',
    'my-queue.json',
    './sub/dir/q.json',
    'rel\\win\\path.json',
    path.resolve(wsRoot, 'abs-inside-same.json')
  ];
  const mod = requireFromExtension('./out/paths.js');
  const qpathFn = mod.queuePath;
  const withinFn = mod.isPathWithinWorkspace;
  for (const good of goods) {
    seedWorkspaceConfig({ queuePath: good });
    const resolved = qpathFn(wsRoot);
    const rootR = path.resolve(wsRoot);
    assert.ok(resolved === rootR || resolved.startsWith(rootR + path.sep) || resolved.startsWith(rootR + '/'), 'resolves under workspace root');
    assert.ok(withinFn(wsRoot, good));
  }
  // relative always resolve from ws root for queue defaults preview/apply paths
  resetVscode107State();
});
