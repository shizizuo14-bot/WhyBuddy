import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRIDGE_IDS,
  type BridgeId,
  createBlueprintRuntimeDiagnosticsStore,
} from "./diagnostics-store.js";

/**
 * Co-located unit tests for the runtime-enablement diagnostics store.
 *
 * Design anchor: `.kiro/specs/autopilot-capability-runtime-enablement/design.md`
 * §4.4 — data shape, deep-copy snapshot semantics, redaction.
 *
 * Requirements: 5.3, 5.5, 5.7, 8.5 (example-based only — no PBT).
 *
 * Test strategy:
 * - A fixed clock (`fixedNow`) is injected so that `lastInvocationAt` and
 *   `generatedAt` are deterministic and can be asserted exactly.
 * - `vi.stubEnv` is used to exercise `masterSwitch` / `buildTarget`
 *   propagation through the only `process.env` read in the store.
 * - No real HTTP / clock / audit: the store is pure in-memory per
 *   requirement 5.8.
 */

const FIXED_ISO = "2026-05-12T03:45:00.000Z";
const fixedNow = (): Date => new Date(FIXED_ISO);

describe("BlueprintRuntimeDiagnosticsStore", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("empty store snapshot returns all 5 bridges with mode='unknown' and zero counters", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

    const snapshot = store.snapshot(fixedNow);

    // All 5 bridge keys present, per requirement 5.3.
    const bridgeKeys = Object.keys(snapshot.bridges).sort();
    expect(bridgeKeys).toEqual([...BRIDGE_IDS].sort());

    for (const bridgeId of BRIDGE_IDS) {
      const entry = snapshot.bridges[bridgeId];
      expect(entry.bridgeId).toBe(bridgeId);
      expect(entry.mode).toBe("unknown");
      expect(entry.enabledByConfig).toBe(false);
      expect(entry.dependencyReady).toBe(false);
      expect(entry.lastInvocationAt).toBeUndefined();
      expect(entry.lastMode).toBeUndefined();
      expect(entry.lastError).toBeUndefined();
      expect(entry.totalInvocations).toBe(0);
      expect(entry.realInvocations).toBe(0);
      expect(entry.fallbackInvocations).toBe(0);
    }

    expect(snapshot.generatedAt).toBe(FIXED_ISO);
  });

  it("recordBridgeConfiguration with enabledByConfig=true → mode transitions to 'enabled'", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

    store.recordBridgeConfiguration("docker", {
      enabledByConfig: true,
      dependencyReady: true,
    });

    const snapshot = store.snapshot(fixedNow);
    const docker = snapshot.bridges.docker;
    expect(docker.mode).toBe("enabled");
    expect(docker.enabledByConfig).toBe(true);
    expect(docker.dependencyReady).toBe(true);
    // No invocations yet → counters remain 0.
    expect(docker.totalInvocations).toBe(0);
    expect(docker.realInvocations).toBe(0);
    expect(docker.fallbackInvocations).toBe(0);
    expect(docker.lastInvocationAt).toBeUndefined();
    expect(docker.lastMode).toBeUndefined();
  });

  it("recordBridgeConfiguration with enabledByConfig=false → mode transitions to 'disabled'", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

    store.recordBridgeConfiguration("mcpGithub", {
      enabledByConfig: false,
      dependencyReady: false,
    });

    const snapshot = store.snapshot(fixedNow);
    const mcp = snapshot.bridges.mcpGithub;
    expect(mcp.mode).toBe("disabled");
    expect(mcp.enabledByConfig).toBe(false);
    expect(mcp.dependencyReady).toBe(false);
  });

  it("recordBridgeInvocation(docker, {mode:'real'}) updates counters, lastMode, mode, and timestamp", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

    store.recordBridgeInvocation("docker", { mode: "real" });

    const snapshot = store.snapshot(fixedNow);
    const docker = snapshot.bridges.docker;
    expect(docker.totalInvocations).toBe(1);
    expect(docker.realInvocations).toBe(1);
    expect(docker.fallbackInvocations).toBe(0);
    expect(docker.lastMode).toBe("real");
    expect(docker.mode).toBe("real");
    expect(docker.lastInvocationAt).toBe(FIXED_ISO);
    expect(docker.lastError).toBeUndefined();
  });

  it("two consecutive invocations (real then simulated_fallback) accumulate counters correctly", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

    store.recordBridgeInvocation("docker", { mode: "real" });
    store.recordBridgeInvocation("docker", {
      mode: "simulated_fallback",
      error: "something broke",
    });

    const snapshot = store.snapshot(fixedNow);
    const docker = snapshot.bridges.docker;
    expect(docker.totalInvocations).toBe(2);
    expect(docker.realInvocations).toBe(1);
    expect(docker.fallbackInvocations).toBe(1);
    expect(docker.lastMode).toBe("simulated_fallback");
    expect(docker.mode).toBe("fallback");
    // Short error does not trigger truncation or key-based redaction.
    expect(docker.lastError).toBe("something broke");
  });

  it("lastError over 400 chars is truncated and API-key-like substrings are redacted", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

    const apiKey = "sk-ABCDEFGHIJKLMNOP1234567890";
    const longError = `fatal: key=${apiKey} ` + "x".repeat(600);

    store.recordBridgeInvocation("docker", {
      mode: "simulated_fallback",
      error: longError,
    });

    const snapshot = store.snapshot(fixedNow);
    const docker = snapshot.bridges.docker;
    expect(docker.lastError).toBeDefined();
    const lastError = docker.lastError as string;

    // Redaction: the raw API key substring MUST NOT appear in lastError.
    expect(lastError).not.toContain(apiKey);
    // Truncation: lastError is at most 400 characters (requirement 5.7).
    expect(lastError.length).toBeLessThanOrEqual(400);
    // Sanity check: the redaction token replaced the API key before
    // truncation, so it should appear near the start of the string.
    expect(lastError).toContain("[redacted-api-key]");
  });

  it("custom `now` propagates: store clock drives lastInvocationAt, snapshot clock drives generatedAt", () => {
    const storeClock = (): Date => new Date("2026-05-12T03:45:00.000Z");
    const snapshotClock = (): Date => new Date("2026-06-01T12:00:00.000Z");

    const store = createBlueprintRuntimeDiagnosticsStore({ now: storeClock });
    store.recordBridgeInvocation("docker", { mode: "real" });

    const snapshot = store.snapshot(snapshotClock);
    expect(snapshot.bridges.docker.lastInvocationAt).toBe(
      "2026-05-12T03:45:00.000Z",
    );
    expect(snapshot.generatedAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("masterSwitch / buildTarget reflect process.env when set", () => {
    vi.stubEnv("AUTOPILOT_REAL_RUNTIME", "true");
    vi.stubEnv("BUILD_TARGET", "test");

    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });
    const snapshot = store.snapshot(fixedNow);

    expect(snapshot.masterSwitch).toBe("true");
    expect(snapshot.buildTarget).toBe("test");
  });

  it("masterSwitch normalises empty string to null (distinguishes 'unset' from 'set to value')", () => {
    vi.stubEnv("AUTOPILOT_REAL_RUNTIME", "");

    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });
    const snapshot = store.snapshot(fixedNow);

    expect(snapshot.masterSwitch).toBeNull();
  });

  it("snapshot returns a deep copy: mutating the returned object does not affect subsequent snapshots", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });
    store.recordBridgeInvocation("docker", { mode: "real" });

    const first = store.snapshot(fixedNow);
    // Mutate the returned snapshot.
    first.bridges.docker.totalInvocations = 999;
    first.bridges.docker.mode = "unknown";

    const second = store.snapshot(fixedNow);
    // Internal state must be unaffected by external mutation.
    expect(second.bridges.docker.totalInvocations).toBe(1);
    expect(second.bridges.docker.mode).toBe("real");
  });

  it.each<BridgeId>([
    "docker",
    "mcpGithub",
    "role",
    "aigcNode",
    "agentCrewStageActivation",
  ])(
    "recording invocations for bridge '%s' isolates state from other bridges",
    (bridgeId) => {
      const store = createBlueprintRuntimeDiagnosticsStore({ now: fixedNow });

      store.recordBridgeInvocation(bridgeId, { mode: "real" });

      const snapshot = store.snapshot(fixedNow);
      expect(snapshot.bridges[bridgeId].totalInvocations).toBe(1);
      expect(snapshot.bridges[bridgeId].mode).toBe("real");

      for (const otherBridgeId of BRIDGE_IDS) {
        if (otherBridgeId === bridgeId) continue;
        expect(snapshot.bridges[otherBridgeId].totalInvocations).toBe(0);
        expect(snapshot.bridges[otherBridgeId].mode).toBe("unknown");
      }
    },
  );
});

/**
 * `autopilot-role-container-loader` spec Task 13.6：loader 专属诊断扩展。
 *
 * 验证 `roleContainerLoader` bridgeId 的 provisions / teardown / orphan
 * 计数与 `lite` 模式字面量。前 5 条 bridge 的行为不能被扩展影响。
 */
describe("BlueprintRuntimeDiagnosticsStore — roleContainerLoader extension", () => {
  const fixedNow = new Date("2026-05-20T10:00:00.000Z");

  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("(a) snapshot returns unknown loader entry with zeroed counters when no events recorded", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: () => fixedNow });
    const snap = store.snapshot(() => fixedNow);
    expect(Object.keys(snap.bridges)).toContain("roleContainerLoader");
    const entry = snap.bridges.roleContainerLoader;
    expect(entry.mode).toBe("unknown");
    expect(entry.totalInvocations).toBe(0);
    // loader 专属计数字段默认为 undefined（未 touch）
    expect(entry.totalProvisions).toBeUndefined();
    expect(entry.realProvisions).toBeUndefined();
    expect(entry.liteProvisions).toBeUndefined();
    expect(entry.teardownCount).toBeUndefined();
    expect(entry.orphanContainerWarning).toBeUndefined();
  });

  it("(b) recordBridgeInvocation + recordTeardown populate loader counters and lite mode literal", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: () => fixedNow });
    // real provision
    store.recordBridgeInvocation("roleContainerLoader", { mode: "real" });
    store.recordTeardown("roleContainerLoader", {
      key: { jobId: "j1", stageId: "spec_tree", roleId: "r1" },
      mode: "real",
    });
    const snap = store.snapshot(() => fixedNow);
    const entry = snap.bridges.roleContainerLoader;
    expect(entry.mode).toBe("real");
    expect(entry.lastMode).toBe("real");
    expect(entry.totalInvocations).toBe(1);
    expect(entry.realInvocations).toBe(1);
    expect(entry.totalProvisions).toBe(1);
    expect(entry.realProvisions).toBe(1);
    expect(entry.liteProvisions).toBeUndefined();
    expect(entry.teardownCount).toBe(1);

    // 追加一次 lite provision，验证 mode 迁移到 "lite" + 计数累加
    store.recordBridgeInvocation("roleContainerLoader", {
      mode: "simulated_fallback",
      error: "executor unreachable: down",
    });
    const snap2 = store.snapshot(() => fixedNow);
    const entry2 = snap2.bridges.roleContainerLoader;
    expect(entry2.mode).toBe("lite");
    expect(entry2.lastMode).toBe("simulated_fallback");
    expect(entry2.totalProvisions).toBe(2);
    expect(entry2.liteProvisions).toBe(1);
    expect(entry2.realProvisions).toBe(1);
    expect(entry2.lastError).toContain("executor unreachable");
  });

  it("(c) noteOrphanContainer increments orphanContainerWarning and updates lastError", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: () => fixedNow });
    store.noteOrphanContainer("roleContainerLoader", {
      key: { jobId: "j2", stageId: "spec_docs", roleId: "r2" },
      err: "cancelJob threw: EPIPE",
    });
    const snap = store.snapshot(() => fixedNow);
    const entry = snap.bridges.roleContainerLoader;
    expect(entry.orphanContainerWarning).toBe(1);
    expect(entry.lastError).toContain("cancelJob threw");
  });

  it("(d) recordTeardown on a non-loader bridge id is a no-op (defensive)", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({ now: () => fixedNow });
    store.recordTeardown("docker" as const as BridgeId, {
      key: { jobId: "j3", stageId: "input", roleId: "r3" },
      mode: "real",
    });
    const snap = store.snapshot(() => fixedNow);
    const dockerEntry = snap.bridges.docker;
    expect(dockerEntry.teardownCount).toBeUndefined();
    expect(dockerEntry.mode).toBe("unknown");
  });
});

/**
 * `autopilot-role-autonomous-agent` spec Task 8.6：roleAutonomousAgent 专属
 * 诊断扩展。
 *
 * 验证 `recordDelegation` 累加 counters、通过 `snapshot()` 计算 averages、
 * 维护 counter 不变式 `total === real + lite + fallback`（Property 9），
 * 以及 lastError 脱敏 + 截断。前 6 条 bridge 的行为不应被本扩展影响。
 */
describe("BlueprintRuntimeDiagnosticsStore — roleAutonomousAgent extension", () => {
  const agentFixedNow = new Date("2026-06-01T08:30:00.000Z");

  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records delegation with real mode and exposes counters + averages", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    store.recordDelegation("roleAutonomousAgent", {
      mode: "real",
      iterations: 5,
      tokens: 2000,
      durationMs: 15_000,
    });

    const snap = store.snapshot(() => agentFixedNow);
    const entry = snap.bridges.roleAutonomousAgent;
    expect(entry.bridgeId).toBe("roleAutonomousAgent");
    expect(entry.mode).toBe("real");
    expect(entry.lastMode).toBe("real");
    expect(entry.totalDelegations).toBe(1);
    expect(entry.realDelegations).toBe(1);
    expect(entry.liteDelegations).toBeUndefined();
    expect(entry.fallbackDelegations).toBeUndefined();
    expect(entry.averageIterations).toBe(5);
    expect(entry.averageTokens).toBe(2000);
    expect(entry.averageDurationMs).toBe(15_000);
    expect(entry.lastInvocationAt).toBe(agentFixedNow.toISOString());
  });

  it("records delegation with lite mode and migrates entry.mode to 'lite'", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    store.recordDelegation("roleAutonomousAgent", {
      mode: "lite",
      iterations: 3,
      tokens: 800,
      durationMs: 4_000,
    });

    const snap = store.snapshot(() => agentFixedNow);
    const entry = snap.bridges.roleAutonomousAgent;
    expect(entry.mode).toBe("lite");
    expect(entry.lastMode).toBe("lite");
    expect(entry.totalDelegations).toBe(1);
    expect(entry.liteDelegations).toBe(1);
    expect(entry.realDelegations).toBeUndefined();
    expect(entry.fallbackDelegations).toBeUndefined();
  });

  it("records delegation with fallback mode and maps lastMode to 'simulated_fallback'", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    store.recordDelegation("roleAutonomousAgent", {
      mode: "fallback",
      iterations: 0,
      tokens: 500,
      durationMs: 1_200,
      error: "all tiers failed",
    });

    const snap = store.snapshot(() => agentFixedNow);
    const entry = snap.bridges.roleAutonomousAgent;
    expect(entry.mode).toBe("fallback");
    expect(entry.lastMode).toBe("simulated_fallback");
    expect(entry.totalDelegations).toBe(1);
    expect(entry.fallbackDelegations).toBe(1);
    expect(entry.realDelegations).toBeUndefined();
    expect(entry.liteDelegations).toBeUndefined();
    expect(entry.lastError).toBe("all tiers failed");
  });

  it("computes averages as sum / total across mixed-mode delegations", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    store.recordDelegation("roleAutonomousAgent", {
      mode: "real",
      iterations: 10,
      tokens: 5_000,
      durationMs: 20_000,
    });
    store.recordDelegation("roleAutonomousAgent", {
      mode: "lite",
      iterations: 4,
      tokens: 1_000,
      durationMs: 6_000,
    });
    store.recordDelegation("roleAutonomousAgent", {
      mode: "fallback",
      iterations: 1,
      tokens: 300,
      durationMs: 1_000,
    });

    const snap = store.snapshot(() => agentFixedNow);
    const entry = snap.bridges.roleAutonomousAgent;
    expect(entry.totalDelegations).toBe(3);
    expect(entry.averageIterations).toBeCloseTo(15 / 3, 10);
    expect(entry.averageTokens).toBeCloseTo(6_300 / 3, 10);
    expect(entry.averageDurationMs).toBeCloseTo(27_000 / 3, 10);
  });

  it("maintains counter invariant: total === real + lite + fallback across many records (Property 9)", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    const sequence: Array<"real" | "lite" | "fallback"> = [
      "real",
      "real",
      "lite",
      "fallback",
      "real",
      "lite",
      "fallback",
      "fallback",
      "real",
      "lite",
    ];

    for (const mode of sequence) {
      store.recordDelegation("roleAutonomousAgent", {
        mode,
        iterations: 1,
        tokens: 100,
        durationMs: 100,
      });
    }

    const snap = store.snapshot(() => agentFixedNow);
    const entry = snap.bridges.roleAutonomousAgent;
    const real = entry.realDelegations ?? 0;
    const lite = entry.liteDelegations ?? 0;
    const fallback = entry.fallbackDelegations ?? 0;
    expect(entry.totalDelegations).toBe(sequence.length);
    expect(real + lite + fallback).toBe(entry.totalDelegations);
    expect(real).toBe(4);
    expect(lite).toBe(3);
    expect(fallback).toBe(3);
  });

  it("snapshot includes roleAutonomousAgent key even before any delegation", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    const snap = store.snapshot(() => agentFixedNow);
    expect(Object.keys(snap.bridges)).toContain("roleAutonomousAgent");
    const entry = snap.bridges.roleAutonomousAgent;
    expect(entry.mode).toBe("unknown");
    expect(entry.totalDelegations).toBeUndefined();
    expect(entry.averageIterations).toBeUndefined();
    expect(entry.averageTokens).toBeUndefined();
    expect(entry.averageDurationMs).toBeUndefined();
  });

  it("recordDelegation on a non-roleAutonomousAgent bridge id is a no-op", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    // 调用一次对 docker bridge：不应写入 delegation counters，也不应
    // 污染 docker 既有的 invocation counters。
    store.recordDelegation("docker", {
      mode: "real",
      iterations: 42,
      tokens: 999,
      durationMs: 9_999,
    });

    const snap = store.snapshot(() => agentFixedNow);
    const docker = snap.bridges.docker;
    expect(docker.totalInvocations).toBe(0);
    expect(docker.realInvocations).toBe(0);
    expect(docker.totalDelegations).toBeUndefined();
    expect(docker.realDelegations).toBeUndefined();
    expect(docker.mode).toBe("unknown");
  });

  it("lastError is redacted (API keys) and truncated to 400 chars", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    const apiKey = "sk-AAAABBBBCCCCDDDDEEEEFFFF1234567890";
    const longError = `agent loop blew up: key=${apiKey} ` + "x".repeat(600);

    store.recordDelegation("roleAutonomousAgent", {
      mode: "fallback",
      iterations: 0,
      tokens: 0,
      durationMs: 0,
      error: longError,
    });

    const snap = store.snapshot(() => agentFixedNow);
    const entry = snap.bridges.roleAutonomousAgent;
    expect(entry.lastError).toBeDefined();
    const lastError = entry.lastError as string;
    expect(lastError).not.toContain(apiKey);
    expect(lastError.length).toBeLessThanOrEqual(400);
    expect(lastError).toContain("[redacted-api-key]");
  });

  it("does not regress the 6 existing bridges' invocation counters when agent delegation is recorded", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => agentFixedNow,
    });

    // 先在前 6 条 bridge 里各记录一次 invocation。
    store.recordBridgeInvocation("docker", { mode: "real" });
    store.recordBridgeInvocation("mcpGithub", { mode: "simulated_fallback" });
    store.recordBridgeConfiguration("role", {
      enabledByConfig: true,
      dependencyReady: true,
    });
    store.recordBridgeInvocation("roleContainerLoader", { mode: "real" });

    // 再针对 agent bridge 做多次 delegation。
    store.recordDelegation("roleAutonomousAgent", {
      mode: "real",
      iterations: 2,
      tokens: 100,
      durationMs: 300,
    });
    store.recordDelegation("roleAutonomousAgent", {
      mode: "lite",
      iterations: 1,
      tokens: 50,
      durationMs: 100,
    });

    const snap = store.snapshot(() => agentFixedNow);
    expect(snap.bridges.docker.totalInvocations).toBe(1);
    expect(snap.bridges.docker.realInvocations).toBe(1);
    expect(snap.bridges.docker.mode).toBe("real");
    expect(snap.bridges.mcpGithub.totalInvocations).toBe(1);
    expect(snap.bridges.mcpGithub.fallbackInvocations).toBe(1);
    expect(snap.bridges.role.mode).toBe("enabled");
    expect(snap.bridges.roleContainerLoader.mode).toBe("real");
    expect(snap.bridges.roleContainerLoader.realProvisions).toBe(1);
    // agent bridge 自己累积正确。
    expect(snap.bridges.roleAutonomousAgent.totalDelegations).toBe(2);
  });
});

/**
 * `autopilot-agent-reasoning-stream` spec Task 3.5：agentReasoningBridge 专属
 * 诊断扩展。
 *
 * 验证 `agentReasoningBridge` bridgeId 在以下三种典型路径下的字段语义：
 * 1. 默认（未调用任何方法）→ env off 默认 shape；
 * 2. 多次成功 forward → totalForwarded / lastEventAt / lastEventType 正确累加 / 更新；
 * 3. forward 与 dropped 计数互不污染。
 *
 * 前 7 条 bridge 的行为不能被本扩展影响。
 */
describe("BlueprintRuntimeDiagnosticsStore — agentReasoningBridge extension", () => {
  const reasoningFixedNow = new Date("2026-05-13T09:00:00.000Z");

  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("默认 snapshot 返回 enabled=false 与 0 计数（env off 默认）", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => reasoningFixedNow,
    });

    const snap = store.snapshot(() => reasoningFixedNow);
    const entry = snap.bridges.agentReasoningBridge;
    expect(entry).toBeDefined();
    expect(entry.bridgeId).toBe("agentReasoningBridge");
    // env off 默认：enabled=false、totalForwarded=0、droppedEntryCount=0；
    // last* 字段保持 undefined。
    expect(entry.enabled).toBe(false);
    expect(entry.totalForwarded).toBe(0);
    expect(entry.droppedEntryCount).toBe(0);
    expect(entry.lastEventAt).toBeUndefined();
    expect(entry.lastEventType).toBeUndefined();
    // agentReasoningBridge 不复用 invocation / delegation 语义：mode 仍为
    // "unknown"，相关计数器保持 0。
    expect(entry.mode).toBe("unknown");
    expect(entry.totalInvocations).toBe(0);
    expect(entry.totalDelegations).toBeUndefined();
  });

  it("setAgentReasoningEnabled(true) + 三次 recordAgentReasoningForwarded → totalForwarded=3，lastEventType / lastEventAt 取最后一次", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => reasoningFixedNow,
    });

    store.setAgentReasoningEnabled(true);

    const t1 = new Date("2026-05-13T10:00:00.000Z");
    const t2 = new Date("2026-05-13T10:00:01.000Z");
    const t3 = new Date("2026-05-13T10:00:02.000Z");
    store.recordAgentReasoningForwarded("role.agent.thinking", t1);
    store.recordAgentReasoningForwarded("role.agent.acting", t2);
    store.recordAgentReasoningForwarded("role.agent.observing", t3);

    const snap = store.snapshot(() => reasoningFixedNow);
    const entry = snap.bridges.agentReasoningBridge;
    expect(entry.enabled).toBe(true);
    expect(entry.totalForwarded).toBe(3);
    // last* 取第三次调用的元信息。
    expect(entry.lastEventType).toBe("role.agent.observing");
    expect(entry.lastEventAt).toBe(t3.toISOString());
    // forward 路径不影响 dropped 计数。
    expect(entry.droppedEntryCount).toBe(0);
  });

  it("recordAgentReasoningDropped 与 recordAgentReasoningForwarded 互不污染", () => {
    const store = createBlueprintRuntimeDiagnosticsStore({
      now: () => reasoningFixedNow,
    });

    // 先 dropped 两次：仅 droppedEntryCount 累加，forward 计数保持为 0。
    store.recordAgentReasoningDropped();
    store.recordAgentReasoningDropped();

    // 再成功 forward 一次：totalForwarded=1，dropped 仍为 2。
    const t = new Date("2026-05-13T11:00:00.000Z");
    store.recordAgentReasoningForwarded("role.agent.error", t);

    const snap = store.snapshot(() => reasoningFixedNow);
    const entry = snap.bridges.agentReasoningBridge;
    expect(entry.totalForwarded).toBe(1);
    expect(entry.droppedEntryCount).toBe(2);
    expect(entry.lastEventType).toBe("role.agent.error");
    expect(entry.lastEventAt).toBe(t.toISOString());
  });
});
