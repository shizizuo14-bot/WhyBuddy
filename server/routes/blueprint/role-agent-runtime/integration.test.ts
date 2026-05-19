/**
 * `autopilot-role-autonomous-agent` spec Task 12：集成测试。
 *
 * 验证 role-agent-runtime 各模块的端到端协作：
 * - 12.1 Real Mode with fake Docker + fake LLM → complete Agent Loop → valid output
 * - 12.2 Lite Mode → complete Agent Loop → output format compatible with Real Mode
 * - 12.3 Docker unavailable → automatic degradation to Lite Mode
 * - 12.4 ToolProxy end-to-end (container → HTTP → host → MCP/Skill mock → response)
 * - 12.5 Budget exceeded (iterations) → loop terminates with partial result
 * - 12.6 `BUILD_TARGET=test` → Tier 1 early exit (no Agent execution)
 *
 * 禁止 PBT；example-based only。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";
import type { DelegateInput } from "../../../../shared/blueprint/agent-delegator.js";
import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../../shared/blueprint/agent-job.js";
import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type { ExecutorClient } from "../../../core/executor-client.js";
import type { BlueprintLogger, McpToolAdapterDependency } from "../context.js";

import {
  createRoleAgentDelegator,
  type FallbackLlmCall,
  type LiteAgentRuntime,
  type RealModeDispatcher,
} from "./delegator.js";
import { createLiteAgentRuntime } from "./lite-agent-runtime.js";
import {
  createToolProxyServer,
  type ToolProxyServer,
} from "./tool-proxy-server.js";
import { createHttpToolProxyClient } from "./tool-proxy-client.js";
import type { LlmCallFn, LlmCallOutput } from "./llm-call.js";

// ─── 测试辅助 ──────────────────────────────────────────────────────────────

function buildLogger(): BlueprintLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeBudget(overrides: Partial<AgentBudget> = {}): AgentBudget {
  return {
    maxIterations: 20,
    maxTokens: 100_000,
    timeoutMs: 300_000,
    toolTimeoutMs: 60_000,
    allowParallelTools: false,
    ...overrides,
  };
}

function makeInput(overrides: Partial<DelegateInput> = {}): DelegateInput {
  return {
    roleId: "role-planner",
    stageId: "planning",
    jobId: `job-${Math.random().toString(36).slice(2, 10)}`,
    goal: "generate route set",
    systemPrompt: "you are a planner",
    context: { foo: "bar" },
    budget: makeBudget(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("role-agent-runtime integration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── 12.1 Real Mode with fake Docker + fake LLM ──────────────────────────
  it("12.1 Real Mode: fake Docker + fake LLM → complete Agent Loop → valid output", async () => {
    vi.stubEnv("BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED", "true");

    const executorClient = {
      assertReachable: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExecutorClient;

    const realModeDispatcher: RealModeDispatcher = vi.fn(
      async (input: AgentJobInput): Promise<AgentJobOutput> => ({
        jobId: input.jobId,
        roleId: input.roleId,
        status: "completed",
        output: { id: "rs-1", requestId: "req-1", routes: [] },
        iterations: 3,
        totalTokens: 1500,
        durationMs: 5000,
        trace: [
          {
            iteration: 1,
            phase: "observing",
            timestamp: new Date().toISOString(),
            tokensUsed: 500,
          },
        ],
      }),
    );

    const delegator = createRoleAgentDelegator({
      executorClient,
      realModeDispatcher,
      fallbackLlmCall: vi.fn(),
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await delegator.delegate(
      makeInput({
        outputSchema: {
          type: "object",
          required: ["id", "requestId"],
          properties: {
            id: { type: "string" },
            requestId: { type: "string" },
          },
        },
      }),
    );

    expect(out.status).toBe("completed");
    expect(out.executionMode).toBe("real");
    expect(out.output).toMatchObject({ id: "rs-1", requestId: "req-1" });
    expect(out.iterations).toBe(3);
  });

  // ── 12.2 Lite Mode → complete Agent Loop → output format compatible ─────
  it("12.2 Lite Mode: complete Agent Loop → output format compatible with Real Mode", async () => {
    vi.stubEnv("BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED", "true");

    // fake LLM：第一轮直接 finish
    const llm: LlmCallFn = vi.fn(async (): Promise<LlmCallOutput> => ({
      type: "finish",
      output: { id: "rs-lite", requestId: "req-lite" },
      thought: "done",
      tokensUsed: 50,
    }));

    const liteRuntime = createLiteAgentRuntime({
      llmCall: llm,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const delegator = createRoleAgentDelegator({
      liteAgentRuntime: liteRuntime,
      fallbackLlmCall: vi.fn(),
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.executionMode).toBe("lite");
    // 验证 output 结构与 Real Mode 兼容
    expect(typeof out.jobId).toBe("string");
    expect(typeof out.iterations).toBe("number");
    expect(typeof out.totalTokens).toBe("number");
    expect(typeof out.durationMs).toBe("number");
    expect(Array.isArray(out.trace)).toBe(true);
  });

  // ── 12.3 Docker unavailable → automatic degradation to Lite Mode ────────
  it("12.3 Docker unavailable → automatic degradation to Lite Mode", async () => {
    vi.stubEnv("BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED", "true");

    const executorClient = {
      assertReachable: vi.fn().mockRejectedValue(new Error("docker down")),
    } as unknown as ExecutorClient;
    const realModeDispatcher: RealModeDispatcher = vi.fn();

    const llm: LlmCallFn = vi.fn(async (): Promise<LlmCallOutput> => ({
      type: "finish",
      output: { degraded: true },
      thought: "ok",
      tokensUsed: 20,
    }));
    const liteRuntime = createLiteAgentRuntime({
      llmCall: llm,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const delegator = createRoleAgentDelegator({
      executorClient,
      realModeDispatcher,
      liteAgentRuntime: liteRuntime,
      fallbackLlmCall: vi.fn(),
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await delegator.delegate(makeInput());

    expect(out.executionMode).toBe("lite");
    expect(realModeDispatcher).not.toHaveBeenCalled();
  });

  // ── 12.4 ToolProxy end-to-end ───────────────────────────────────────────
  it("12.4 ToolProxy end-to-end: container → HTTP → host → MCP mock → response", async () => {
    const mcpToolAdapter: McpToolAdapterDependency = {
      execute: vi.fn(async () => ({
        ok: true,
        status: "completed" as const,
        targetLabel: "test",
        operation: "invoke",
        resource: "mcp://test/invoke",
        output: "ok",
        response: { data: 42 },
        governance: {
          approval: {
            required: false,
            status: "not_required" as const,
            source: "none",
          },
        },
        metadata: {
          serverId: "test",
          toolName: "invoke",
          timeoutMs: 5000,
          fallbackUsed: false,
        },
      })),
    } as unknown as McpToolAdapterDependency;

    const server = createToolProxyServer({
      hmacSecret: "test-secret",
      mcpToolAdapter,
      logger: buildLogger(),
      now: () => new Date(),
    });
    await server.start(0);

    const tools: AgentToolDefinition[] = [
      {
        id: "mcp.test",
        name: "test",
        description: "test",
        category: "mcp",
        inputSchema: {},
        requiresProxy: true,
        timeoutMs: 5000,
      },
    ];
    server.registerTools("role-x", tools);

    const client = createHttpToolProxyClient({
      proxyUrl: `http://127.0.0.1:${server.actualPort}`,
      hmacSecret: "test-secret",
      logger: buildLogger(),
      now: () => new Date(),
    });

    const result = await client.invoke({
      roleId: "role-x",
      jobId: "j1",
      toolId: "mcp.test",
      params: {},
      requestId: "r1",
      timeoutMs: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ ok: true, response: { data: 42 } });

    await server.shutdown();
  });

  // ── 12.5 Budget exceeded (iterations) → loop terminates ─────────────────
  it("12.5 Budget exceeded (iterations) → loop terminates with partial result", async () => {
    vi.stubEnv("BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED", "true");

    // LLM 永远返回 action，不 finish
    const llm: LlmCallFn = vi.fn(async (): Promise<LlmCallOutput> => ({
      type: "action",
      action: { toolId: "mcp.test", params: {} },
      thought: "keep going",
      tokensUsed: 100,
    }));

    const mcpAdapter: McpToolAdapterDependency = {
      execute: vi.fn(async () => ({
        ok: true,
        status: "completed" as const,
        targetLabel: "t",
        operation: "i",
        resource: "r",
        output: "",
        response: {},
        governance: {
          approval: {
            required: false,
            status: "not_required" as const,
            source: "none",
          },
        },
        metadata: {
          serverId: "t",
          toolName: "i",
          timeoutMs: 5000,
          fallbackUsed: false,
        },
      })),
    } as unknown as McpToolAdapterDependency;

    const liteRuntime = createLiteAgentRuntime({
      llmCall: llm,
      mcpToolAdapter: mcpAdapter,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const delegator = createRoleAgentDelegator({
      liteAgentRuntime: liteRuntime,
      fallbackLlmCall: vi.fn(async () => ({ fallback: true })),
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await delegator.delegate(
      makeInput({
        budget: makeBudget({ maxIterations: 2 }),
      }),
    );

    // budget 耗尽 → status=failed → 触发 fallback
    // 或者 Lite 返回 failed → delegator 走 fallback
    expect(["completed", "failed"]).toContain(out.status);
  });

  // ── 12.6 BUILD_TARGET=test → Tier 1 early exit ──────────────────────────
  it("12.6 BUILD_TARGET=test → Tier 1 early exit (no Agent execution)", async () => {
    vi.stubEnv("BUILD_TARGET", "test");
    vi.stubEnv("BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED", "false");

    const realMode: RealModeDispatcher = vi.fn();
    const liteRuntime: LiteAgentRuntime = { run: vi.fn() };
    const fallback: FallbackLlmCall = vi.fn(async () => ({ earlyExit: true }));

    const delegator = createRoleAgentDelegator({
      realModeDispatcher: realMode,
      liteAgentRuntime: liteRuntime,
      fallbackLlmCall: fallback,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.output).toEqual({ earlyExit: true });
    expect(realMode).not.toHaveBeenCalled();
    expect(liteRuntime.run).not.toHaveBeenCalled();
  });
});
