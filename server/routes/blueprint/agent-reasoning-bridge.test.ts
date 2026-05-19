/**
 * `autopilot-agent-reasoning-stream` spec Task 5：Agent 推理流桥接 bridge 单测。
 *
 * 验证 createAgentReasoningBridge 在 env-off / env-on / 脱敏 / 错误降级 /
 * listener 抛错 5 类场景下的行为。全部 example-based，禁 PBT。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentReasoningBridge } from "./agent-reasoning-bridge.js";
import type { AgentProgressEvent } from "../../../shared/blueprint/agent-events.js";

// ─── Mock helpers ────────────────────────────────────────────────────────────

function createMockCallbackReceiver() {
  const listeners: Array<(e: AgentProgressEvent) => void> = [];
  return {
    onProgress: vi.fn((listener: (e: AgentProgressEvent) => void) => {
      listeners.push(listener);
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
      };
    }),
    start: vi.fn(),
    shutdown: vi.fn(),
    getDiagnostics: vi.fn(() => ({
      totalReceived: 0,
      validSignatureCount: 0,
      invalidSignatureCount: 0,
    })),
    actualPort: undefined as number | undefined,
    callbackUrl: undefined as string | undefined,
    __invoke(event: AgentProgressEvent) {
      for (const l of [...listeners]) l(event);
    },
  };
}

function createMockEventBus() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

function createMockDiagnostics() {
  return {
    recordAgentReasoningForwarded: vi.fn(),
    recordAgentReasoningDropped: vi.fn(),
    setAgentReasoningEnabled: vi.fn(),
    recordBridgeInvocation: vi.fn(),
    recordBridgeConfiguration: vi.fn(),
    recordTeardown: vi.fn(),
    noteOrphanContainer: vi.fn(),
    recordDelegation: vi.fn(),
    snapshot: vi.fn(),
  };
}

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeBaseEvent(
  overrides: Partial<AgentProgressEvent> = {}
): AgentProgressEvent {
  return {
    type: "agent.thinking",
    jobId: "job-1",
    roleId: "planner",
    stageId: "route_generation",
    iteration: 1,
    timestamp: "2026-05-13T10:00:00.000Z",
    phase: "thinking",
    tokensUsed: 100,
    budgetRemaining: { iterations: 19, tokens: 99900, timeMs: 290000 },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createAgentReasoningBridge", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("env flag 未设为 'true' 时 start/stop 为 no-op，onProgress 与 emit 都不被调用", () => {
    vi.stubEnv("BLUEPRINT_AGENT_REASONING_STREAM_ENABLED", "false");
    const callbackReceiver = createMockCallbackReceiver();
    const eventBus = createMockEventBus();
    const diag = createMockDiagnostics();
    const bridge = createAgentReasoningBridge({
      eventBus,
      callbackReceiver,
      runtimeDiagnostics: diag as any,
      logger: createMockLogger(),
      now: () => new Date("2026-05-13T10:00:00.000Z"),
    });
    bridge.start();
    bridge.stop();
    expect(callbackReceiver.onProgress).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(diag.setAgentReasoningEnabled).not.toHaveBeenCalled();
    expect(bridge.getDiagnostics()).toEqual({
      enabled: false,
      totalForwarded: 0,
      droppedEntryCount: 0,
    });
  });

  it("callbackReceiver 缺失时 bridge 走 env-off 路径", () => {
    vi.stubEnv("BLUEPRINT_AGENT_REASONING_STREAM_ENABLED", "true");
    vi.stubEnv("BUILD_TARGET", "development");
    const eventBus = createMockEventBus();
    const diag = createMockDiagnostics();
    const bridge = createAgentReasoningBridge({
      eventBus,
      callbackReceiver: undefined,
      runtimeDiagnostics: diag as any,
      logger: createMockLogger(),
      now: () => new Date(),
    });
    bridge.start();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(bridge.getDiagnostics().enabled).toBe(false);
  });

  it("agent.thinking 经脱敏后 emit role.agent.thinking，thought ≤280 字符且凭证被替换", () => {
    vi.stubEnv("BLUEPRINT_AGENT_REASONING_STREAM_ENABLED", "true");
    vi.stubEnv("BUILD_TARGET", "development");
    const callbackReceiver = createMockCallbackReceiver();
    const eventBus = createMockEventBus();
    const diag = createMockDiagnostics();
    const bridge = createAgentReasoningBridge({
      eventBus,
      callbackReceiver,
      runtimeDiagnostics: diag as any,
      logger: createMockLogger(),
      now: () => new Date("2026-05-13T10:00:00.000Z"),
    });
    bridge.start();

    const apiKey = "sk-ABCDEFGHIJKLMNOP1234567890";
    const longThought = `我需要用 ${apiKey} 调用 GitHub API。` + "x".repeat(400);
    callbackReceiver.__invoke(
      makeBaseEvent({ type: "agent.thinking", thought: longThought })
    );

    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = eventBus.emit.mock.calls[0][0];
    expect(emittedEvent.type).toBe("role.agent.thinking");
    expect(emittedEvent.thought).toBeDefined();
    // 280 字符 + 1 个省略号 = 最多 281
    expect(Array.from(emittedEvent.thought as string).length).toBeLessThanOrEqual(281);
    expect(emittedEvent.thought).not.toContain(apiKey);
    expect(bridge.getDiagnostics().totalForwarded).toBe(1);
  });

  it("agent.acting 只透传 actionToolId，不带 params", () => {
    vi.stubEnv("BLUEPRINT_AGENT_REASONING_STREAM_ENABLED", "true");
    vi.stubEnv("BUILD_TARGET", "development");
    const callbackReceiver = createMockCallbackReceiver();
    const eventBus = createMockEventBus();
    const diag = createMockDiagnostics();
    const bridge = createAgentReasoningBridge({
      eventBus,
      callbackReceiver,
      runtimeDiagnostics: diag as any,
      logger: createMockLogger(),
      now: () => new Date("2026-05-13T10:00:00.000Z"),
    });
    bridge.start();

    callbackReceiver.__invoke(
      makeBaseEvent({
        type: "agent.acting",
        phase: "acting",
        action: { toolId: "mcp.github.clone" },
      })
    );

    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = eventBus.emit.mock.calls[0][0];
    expect(emittedEvent.type).toBe("role.agent.acting");
    expect(emittedEvent.actionToolId).toBe("mcp.github.clone");
    // 不应有 params 字段
    expect((emittedEvent as Record<string, unknown>).params).toBeUndefined();
  });

  it("agent.failed 转译成 role.agent.error，degraded 由 delegator tier 推断；agent.aborted 带 reason='用户取消'", () => {
    vi.stubEnv("BLUEPRINT_AGENT_REASONING_STREAM_ENABLED", "true");
    vi.stubEnv("BUILD_TARGET", "development");
    const callbackReceiver = createMockCallbackReceiver();
    const eventBus = createMockEventBus();
    const diag = createMockDiagnostics();
    const delegator = {
      getDiagnostics: () => ({
        lastMode: "lite" as const,
        totalDelegations: 1,
        realDelegations: 0,
        liteDelegations: 1,
        fallbackDelegations: 0,
        averageIterations: 0,
        averageTokensPerDelegation: 0,
        averageDurationMs: 0,
      }),
      delegate: vi.fn(),
      getStatus: vi.fn(),
      cancel: vi.fn(),
    };
    const bridge = createAgentReasoningBridge({
      eventBus,
      callbackReceiver,
      delegator: delegator as any,
      runtimeDiagnostics: diag as any,
      logger: createMockLogger(),
      now: () => new Date("2026-05-13T10:00:00.000Z"),
    });
    bridge.start();

    // agent.failed → degraded:true（因为 delegator.lastMode === "lite"）
    callbackReceiver.__invoke(
      makeBaseEvent({
        type: "agent.failed",
        phase: "failed",
        error: "LLM timeout",
      })
    );
    const failedEvent = eventBus.emit.mock.calls[0][0];
    expect(failedEvent.type).toBe("role.agent.error");
    expect(failedEvent.degraded).toBe(true);

    // agent.aborted → degraded:false + reason:"用户取消"
    callbackReceiver.__invoke(
      makeBaseEvent({
        type: "agent.aborted",
        phase: "failed",
        error: "user cancelled",
      })
    );
    const abortedEvent = eventBus.emit.mock.calls[1][0];
    expect(abortedEvent.type).toBe("role.agent.error");
    expect(abortedEvent.degraded).toBe(false);
    expect(abortedEvent.reason).toBe("用户取消");
  });

  it("emit 抛错时 droppedEntryCount 递增，后续 event 仍正常 forward", () => {
    vi.stubEnv("BLUEPRINT_AGENT_REASONING_STREAM_ENABLED", "true");
    vi.stubEnv("BUILD_TARGET", "development");
    const callbackReceiver = createMockCallbackReceiver();
    const eventBus = createMockEventBus();
    const diag = createMockDiagnostics();
    const bridge = createAgentReasoningBridge({
      eventBus,
      callbackReceiver,
      runtimeDiagnostics: diag as any,
      logger: createMockLogger(),
      now: () => new Date("2026-05-13T10:00:00.000Z"),
    });
    bridge.start();

    // 第一次 emit 抛错
    eventBus.emit.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    callbackReceiver.__invoke(makeBaseEvent({ iteration: 1 }));
    callbackReceiver.__invoke(makeBaseEvent({ iteration: 2 }));

    expect(bridge.getDiagnostics().droppedEntryCount).toBe(1);
    expect(bridge.getDiagnostics().totalForwarded).toBe(1);
    expect(diag.recordAgentReasoningDropped).toHaveBeenCalledTimes(1);
    expect(diag.recordAgentReasoningForwarded).toHaveBeenCalledTimes(1);
  });
});
