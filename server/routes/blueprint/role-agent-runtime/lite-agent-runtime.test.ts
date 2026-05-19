/**
 * `autopilot-role-autonomous-agent` spec Task 6.4：LiteAgentRuntime 集成测试。
 *
 * 覆盖：
 * - 6.1 in-process Agent Loop 的最小闭环（LLM 两轮 → finish）
 * - 6.2 workspace 创建 + 注入 + 清理
 * - 6.3 AgentJobOutput schema 与 Real Mode 兼容
 * - 6.4 Lite Mode 产出 BlueprintRouteSet-like 结构化 output
 * - Tool 路由：mcp / skill / aigc / builtin 防御分支 / 未知前缀 / 缺失 adapter
 * - LLM 连续两次抛错 → state machine 以 `failed` 收尾，run() 不抛
 * - 预算耗尽（maxIterations=1）→ status=failed
 *
 * 禁止 PBT：example-based only。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../../shared/blueprint/agent-job.js";
import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";
import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type {
  BlueprintLogger,
  McpToolAdapterDependency,
} from "../context.js";
import type {
  McpToolExecutionRequest,
  McpToolExecutionResult,
} from "../../../tool/api/mcp-tool-adapter.js";
import type { SkillRegistryDependency } from "../role-container-loader/skills-binder.js";

import { createLiteAgentRuntime } from "./lite-agent-runtime.js";
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

function buildBudget(overrides: Partial<AgentBudget> = {}): AgentBudget {
  return {
    maxIterations: 10,
    maxTokens: 50_000,
    timeoutMs: 60_000,
    toolTimeoutMs: 5_000,
    allowParallelTools: false,
    ...overrides,
  };
}

function buildTools(): AgentToolDefinition[] {
  return [
    {
      id: "mcp.github",
      name: "github",
      description: "GitHub MCP server",
      category: "mcp",
      inputSchema: { type: "object" },
      requiresProxy: true,
      timeoutMs: 5_000,
    },
    {
      id: "skill.code-review",
      name: "code-review",
      description: "Skill code review",
      category: "skill",
      inputSchema: { type: "object" },
      requiresProxy: true,
      timeoutMs: 5_000,
    },
    {
      id: "aigc.analyzer",
      name: "analyzer",
      description: "AIGC analyzer",
      category: "aigc_node",
      inputSchema: { type: "object" },
      requiresProxy: true,
      timeoutMs: 5_000,
    },
  ];
}

function buildInput(overrides: Partial<AgentJobInput> = {}): AgentJobInput {
  return {
    jobId: overrides.jobId ?? `job-${Math.random().toString(36).slice(2, 10)}`,
    roleId: overrides.roleId ?? "role-planner",
    stageId: overrides.stageId ?? "planning",
    goal: overrides.goal ?? "produce route set",
    systemPrompt: overrides.systemPrompt ?? "you are a planner",
    tools: overrides.tools ?? buildTools(),
    budget: overrides.budget ?? buildBudget(),
    context: overrides.context ?? { topic: "demo" },
    callbackUrl: overrides.callbackUrl ?? "",
    callbackSecret: overrides.callbackSecret ?? "",
  };
}

function makeFinishOutput(output: unknown): LlmCallOutput {
  return { type: "finish", output, thought: "done", tokensUsed: 20 };
}

function makeActionOutput(
  toolId: string,
  params: Record<string, unknown> = {},
): LlmCallOutput {
  return {
    type: "action",
    action: { toolId, params },
    thought: "decide",
    tokensUsed: 30,
  };
}

function scriptedLlm(steps: LlmCallOutput[]): LlmCallFn {
  let idx = 0;
  const mock = vi.fn(async () => {
    const step = steps[Math.min(idx, steps.length - 1)];
    idx += 1;
    return step;
  });
  return mock as unknown as LlmCallFn;
}

/** 构造 ok=true 的 MCP 结果；测试断言 result.response 即可。 */
function makeMcpOk(response: unknown): McpToolExecutionResult {
  return {
    ok: true,
    status: "completed",
    targetLabel: "github",
    operation: "invoke",
    resource: "mcp://github/invoke",
    output: "ok",
    response,
    governance: {
      approval: { required: false, status: "not_required", source: "none" },
    },
    metadata: {
      serverId: "github",
      toolName: "invoke",
      timeoutMs: 5_000,
      fallbackUsed: false,
    },
  };
}

function makeMcpFail(error: string): McpToolExecutionResult {
  return {
    ok: false,
    status: "failed",
    targetLabel: "github",
    operation: "invoke",
    resource: "mcp://github/invoke",
    output: "",
    response: null,
    error,
    governance: {
      approval: { required: false, status: "not_required", source: "none" },
    },
    metadata: {
      serverId: "github",
      toolName: "invoke",
      timeoutMs: 5_000,
      fallbackUsed: false,
    },
  };
}

// ─── 共享资源隔离：每个测试使用独立 workspace 根 ─────────────────────────

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = pathJoin(
    tmpdir(),
    `lite-agent-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("createLiteAgentRuntime - 单轮 finish", () => {
  it("LLM 第一轮直接 finish → status=completed 且 output 透传", async () => {
    const finishPayload = {
      id: "route-set-1",
      name: "demo route set",
      routes: [],
    };
    const llm = scriptedLlm([makeFinishOutput(finishPayload)]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-finish-1" }));

    expect(out.status).toBe("completed");
    expect(out.output).toEqual(finishPayload);
    expect(out.iterations).toBe(1);
    expect(out.jobId).toBe("job-finish-1");
    expect(Array.isArray(out.trace)).toBe(true);
    expect(out.trace.length).toBeGreaterThanOrEqual(1);
    // workspace 清理后目录不存在
    expect(existsSync(pathJoin(workspaceRoot, "job-finish-1"))).toBe(false);
  });
});

describe("createLiteAgentRuntime - 两轮循环（action → finish）", () => {
  it("第一轮 mcp.github 调用成功 → 第二轮 finish → adapter 被调用一次", async () => {
    const execute = vi.fn(async (_req: McpToolExecutionRequest) =>
      makeMcpOk({ cloned: true }),
    );
    const adapter: McpToolAdapterDependency = { execute };
    const llm = scriptedLlm([
      makeActionOutput("mcp.github", { toolName: "clone", arguments: { repo: "x" } }),
      makeFinishOutput({ ok: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      mcpToolAdapter: adapter,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-two-rounds" }));

    expect(out.status).toBe("completed");
    expect(out.iterations).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
    // trace 至少包含 thinking（finish 轮）+ observing（action 轮）
    const observingEntries = out.trace.filter((t) => t.phase === "observing");
    expect(observingEntries.length).toBe(1);
    expect(observingEntries[0]?.action?.toolId).toBe("mcp.github");
  });
});

describe("createLiteAgentRuntime - MCP 调用失败继续循环", () => {
  it("mcp 返回 ok=false → observation 带 error，下一轮 finish 仍完成", async () => {
    const execute = vi.fn(async () => makeMcpFail("timeout_in_adapter"));
    const adapter: McpToolAdapterDependency = { execute };
    const llm = scriptedLlm([
      makeActionOutput("mcp.github", {}),
      makeFinishOutput({ retriedAndGaveUp: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      mcpToolAdapter: adapter,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-mcp-fail" }));

    expect(out.status).toBe("completed");
    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.error).toBe("timeout_in_adapter");
  });
});

describe("createLiteAgentRuntime - Tool 路由：缺失 adapter / 未知前缀 / builtin", () => {
  it("skill.* 缺失 registry → error=skill_registry_not_available", async () => {
    const llm = scriptedLlm([
      makeActionOutput("skill.code-review"),
      makeFinishOutput({ ok: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-no-skill" }));

    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.error).toBe("skill_registry_not_available");
  });

  it("aigc.* 缺失 invoker → error=aigc_invoker_not_available", async () => {
    const llm = scriptedLlm([
      makeActionOutput("aigc.analyzer"),
      makeFinishOutput({ ok: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-no-aigc" }));

    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.error).toBe("aigc_invoker_not_available");
  });

  it("未知前缀 → error=unknown_tool_category", async () => {
    const llm = scriptedLlm([
      makeActionOutput("weird.unknown", {}),
      makeFinishOutput({ ok: true }),
    ]);
    const tools: AgentToolDefinition[] = [
      {
        id: "weird.unknown",
        name: "weird",
        description: "something strange",
        category: "builtin", // 强行声明为 builtin，但前缀 weird. 仍会被拦截
        inputSchema: { type: "object" },
        requiresProxy: false,
        timeoutMs: 1_000,
      },
    ];
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(
      buildInput({ jobId: "job-unknown", tools }),
    );

    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.error).toBe("unknown_tool_category");
  });

  it("builtin.* 意外走到 invoker → 防御性 error", async () => {
    // 构造一个 `builtin.unusual` 非 finish/think 的 ID：state-machine 的
    // parse 逻辑允许任何 availableTools 里的 toolId 作为 action；此处将
    // 一个 builtin.* 的伪工具塞进 tools 列表，触发防御性分支。
    const builtinTool: AgentToolDefinition = {
      id: "builtin.unusual",
      name: "unusual",
      description: "defensive fallback",
      category: "builtin",
      inputSchema: { type: "object" },
      requiresProxy: false,
      timeoutMs: 1_000,
    };
    const llm = scriptedLlm([
      makeActionOutput("builtin.unusual"),
      makeFinishOutput({ ok: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(
      buildInput({ jobId: "job-builtin", tools: [builtinTool] }),
    );

    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.error).toBe(
      "builtin_tools_must_not_go_through_invoker",
    );
  });
});

describe("createLiteAgentRuntime - Workspace 创建与清理", () => {
  it("run 过程中 workspaceDir 作为 context 传递；run 完成后目录被清理", async () => {
    let capturedWorkspaceDir: unknown;
    // 在 LLM 调用中窥探 context.workspaceDir；此时 workspace 一定存在。
    const llm: LlmCallFn = vi.fn(async (input) => {
      capturedWorkspaceDir = input.context.workspaceDir;
      // 同时断言目录确实存在于文件系统中
      if (typeof capturedWorkspaceDir === "string") {
        expect(existsSync(capturedWorkspaceDir)).toBe(true);
        expect(statSync(capturedWorkspaceDir).isDirectory()).toBe(true);
      }
      return makeFinishOutput({ ok: true });
    });

    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const jobId = "job-workspace";
    const out = await runtime.run(buildInput({ jobId }));

    expect(out.status).toBe("completed");
    expect(typeof capturedWorkspaceDir).toBe("string");
    expect(capturedWorkspaceDir).toBe(pathJoin(workspaceRoot, jobId));
    // run 后清理
    expect(existsSync(pathJoin(workspaceRoot, jobId))).toBe(false);
  });

  it("未显式提供 workspaceRoot → 默认使用 os.tmpdir()/role-agent-lite", async () => {
    let capturedWorkspaceDir: unknown;
    const llm: LlmCallFn = vi.fn(async (input) => {
      capturedWorkspaceDir = input.context.workspaceDir;
      return makeFinishOutput({ ok: true });
    });

    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      logger: buildLogger(),
      now: () => new Date(),
    });

    await runtime.run(buildInput({ jobId: "job-default-root" }));

    expect(typeof capturedWorkspaceDir).toBe("string");
    // 默认根路径前缀应包含 tmpdir + role-agent-lite
    const expectedPrefix = pathJoin(tmpdir(), "role-agent-lite");
    expect((capturedWorkspaceDir as string).startsWith(expectedPrefix)).toBe(
      true,
    );
  });
});

describe("createLiteAgentRuntime - AgentJobOutput schema 兼容", () => {
  it("返回对象的字段类型与 Real Mode 严格同构", async () => {
    const llm = scriptedLlm([makeFinishOutput({ route: "x" })]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-schema" }));

    // 必填字段 typeof 校验
    expect(typeof out.jobId).toBe("string");
    expect(typeof out.roleId).toBe("string");
    expect(["completed", "failed", "aborted"]).toContain(out.status);
    expect(typeof out.iterations).toBe("number");
    expect(typeof out.totalTokens).toBe("number");
    expect(typeof out.durationMs).toBe("number");
    expect(Array.isArray(out.trace)).toBe(true);
    // output 类型由任务决定；此处只断言不是 undefined
    expect(out.output).toBeDefined();
    // error 仅在 failed/aborted 时出现
    if (out.status === "completed") {
      expect(out.error).toBeUndefined();
    }
  });
});

describe("createLiteAgentRuntime - LLM 抛错被 state machine 吞掉", () => {
  it("LLM 连续两次抛错 → run 返回 status=failed 而不是 throw", async () => {
    const llm: LlmCallFn = vi.fn(async () => {
      throw new Error("boom");
    });
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-llm-throw" }));

    expect(out.status).toBe("failed");
    expect(typeof out.error).toBe("string");
    expect(out.error).toContain("llm_throw");
  });
});

describe("createLiteAgentRuntime - 预算耗尽", () => {
  it("maxIterations=1 且 LLM 一直走 action → status=failed（budget_iterations_exceeded）", async () => {
    // LLM 永远发出 action，不 finish；第二轮 thinking 前预算检查会阻断。
    const adapter: McpToolAdapterDependency = {
      execute: vi.fn(async () => makeMcpOk({ ok: true })),
    };
    const llm: LlmCallFn = vi.fn(async () =>
      makeActionOutput("mcp.github"),
    );
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      mcpToolAdapter: adapter,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(
      buildInput({
        jobId: "job-budget",
        budget: buildBudget({ maxIterations: 1 }),
      }),
    );

    expect(out.status).toBe("failed");
    expect(out.error).toBe("budget_iterations_exceeded");
  });
});

describe("createLiteAgentRuntime - BlueprintRouteSet-like output", () => {
  it("fake LLM 返回包含 id/name/routes 的 output → 透传到 AgentJobOutput.output", async () => {
    const routeSet = {
      id: "rs-42",
      name: "demo route set",
      routes: [
        { id: "r1", name: "primary", stages: [] },
        { id: "r2", name: "conservative", stages: [] },
      ],
      primaryRouteId: "r1",
    };
    const llm = scriptedLlm([makeFinishOutput(routeSet)]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-routeset" }));

    expect(out.status).toBe("completed");
    expect(out.output).toBeDefined();
    const output = out.output as typeof routeSet;
    expect(typeof output.id).toBe("string");
    expect(typeof output.name).toBe("string");
    expect(Array.isArray(output.routes)).toBe(true);
    expect(output.routes.length).toBe(2);
  });
});

describe("createLiteAgentRuntime - Skill adapter 注入", () => {
  it("注入 skillRegistry → skill.* 调用成功", async () => {
    const handleInvoke = vi.fn(async (params: unknown) => ({
      handled: true,
      params,
    }));
    const skillRegistry: SkillRegistryDependency = {
      loadForRole: vi.fn(async () => ({
        skillId: "code-review",
        roleId: "role-planner",
        loadedAt: new Date().toISOString(),
        invoke: handleInvoke,
      })),
    };
    const llm = scriptedLlm([
      makeActionOutput("skill.code-review", { x: 1 }),
      makeFinishOutput({ ok: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      skillRegistry,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-skill-ok" }));

    expect(out.status).toBe("completed");
    expect(handleInvoke).toHaveBeenCalledTimes(1);
    // 第一轮 observation 应记录成功结果
    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.observation?.result).toMatchObject({ handled: true });
  });
});

describe("createLiteAgentRuntime - AIGC adapter 注入", () => {
  it("注入 aigcNodeInvoker → aigc.* 调用成功", async () => {
    const invoker = vi.fn(async (_nodeId: string, _params: unknown) => ({
      success: true,
      result: { nodeRanOk: true },
    }));
    const llm = scriptedLlm([
      makeActionOutput("aigc.analyzer", { target: "y" }),
      makeFinishOutput({ ok: true }),
    ]);
    const runtime = createLiteAgentRuntime({
      llmCall: llm,
      aigcNodeInvoker: invoker,
      workspaceRoot,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const out = await runtime.run(buildInput({ jobId: "job-aigc-ok" }));

    expect(out.status).toBe("completed");
    expect(invoker).toHaveBeenCalledTimes(1);
    const observing = out.trace.find((t) => t.phase === "observing");
    expect(observing?.observation?.result).toMatchObject({ nodeRanOk: true });
  });
});
