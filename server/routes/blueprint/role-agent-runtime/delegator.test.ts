/**
 * `autopilot-role-autonomous-agent` spec Task 5.9：RoleAgentDelegator 单测。
 *
 * 覆盖三级降级链路 + getStatus / cancel / getDiagnostics 的边界：
 *
 * - Tier 1 env gate 早退 → fallback
 * - Tier 2 Docker 不可用 → 直接 Lite
 * - Tier 2 无 executorClient → 直接 Lite
 * - Real Mode 成功路径
 * - Real Mode 失败 → Lite 成功
 * - Real + Lite 都失败 → fallback 成功
 * - 全部失败 → status=failed，error 带 reason
 * - 无 liteAgentRuntime → Real 失败后直接 fallback
 * - 无 realModeDispatcher → Docker 可达但仍走 Lite
 * - Diagnostics counter invariant：total = real + lite + fallback
 * - getStatus 正常阶段
 * - cancel 不存在 jobId → no-op
 * - cancel 已存在 jobId → aborted
 * - outer try/catch：故意抛错的 executorClient 也被吞掉走 fallback
 * - 空 roleCtx → builtin-only tools
 *
 * 禁止 PBT：example-based only。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";
import type { DelegateInput } from "../../../../shared/blueprint/agent-delegator.js";
import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../../shared/blueprint/agent-job.js";
import type { ExecutorClient } from "../../../core/executor-client.js";
import type { BlueprintLogger } from "../context.js";
import type {
  RoleRuntimeContext,
  RoleRuntimeContextStore,
} from "../role-container-loader/loader.js";

import {
  createRoleAgentDelegator,
  type CreateRoleAgentDelegatorOptions,
  type FallbackLlmCall,
  type LiteAgentRuntime,
  type RealModeDispatcher,
} from "./delegator.js";

// ─── 测试辅助 ──────────────────────────────────────────────────────────────

function buildLogger(): BlueprintLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeBudget(): AgentBudget {
  return {
    maxIterations: 20,
    maxTokens: 100_000,
    timeoutMs: 300_000,
    toolTimeoutMs: 60_000,
    allowParallelTools: false,
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

function makeAgentOutput(
  jobId: string,
  overrides: Partial<AgentJobOutput> = {},
): AgentJobOutput {
  return {
    jobId,
    roleId: "role-planner",
    status: "completed",
    output: { route: "demo" },
    iterations: 3,
    totalTokens: 1500,
    durationMs: 100,
    trace: [],
    ...overrides,
  };
}

/** 假 RoleRuntimeContextStore：get() 返回可配置的 ctx。 */
function makeContextStore(
  ctx?: RoleRuntimeContext,
): RoleRuntimeContextStore {
  return {
    get: vi.fn(() => ctx),
    put: vi.fn(),
    delete: vi.fn(() => true),
    snapshot: vi.fn(() => (ctx ? [ctx] : [])),
  };
}

/** 构造一个简单 ctx：声明 1 个 mcp + 1 个 skill + 1 个 aigc。 */
function makeRoleCtx(): RoleRuntimeContext {
  return {
    mcp: { list: () => ["github"] },
    skill: { list: () => ["code-review"] },
    aigcNode: { list: () => ["code-analyzer"] },
  } as unknown as RoleRuntimeContext;
}

function makeExecutorClient(
  behavior: "reachable" | "unreachable" | "throws",
): ExecutorClient {
  const assertReachable = vi.fn(async () => {
    if (behavior === "reachable") return;
    if (behavior === "unreachable") throw new Error("executor unreachable");
    throw new Error("boom");
  });
  return { assertReachable } as unknown as ExecutorClient;
}

function makeOptions(
  over: Partial<CreateRoleAgentDelegatorOptions> = {},
): CreateRoleAgentDelegatorOptions {
  const fallbackLlmCall: FallbackLlmCall =
    over.fallbackLlmCall ?? vi.fn(async () => ({ fallback: "output" }));
  return {
    roleRuntimeContextStore: over.roleRuntimeContextStore,
    executorClient: over.executorClient,
    liteAgentRuntime: over.liteAgentRuntime,
    realModeDispatcher: over.realModeDispatcher,
    fallbackLlmCall,
    logger: over.logger ?? buildLogger(),
    now: over.now ?? (() => new Date("2026-05-13T00:00:00Z")),
  };
}

// ─── 环境变量管理 ──────────────────────────────────────────────────────────

const ENV_KEY = "BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED";

beforeEach(() => {
  // 默认关闭；每个测试显式 stub 打开。
  vi.stubEnv(ENV_KEY, "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("createRoleAgentDelegator - Tier 1 env gate", () => {
  it("env off → 直接走 fallback，不触达 real/lite dispatchers", async () => {
    vi.stubEnv(ENV_KEY, "false");
    const realMode = vi.fn();
    const liteRuntime: LiteAgentRuntime = { run: vi.fn() };
    const fallback = vi.fn(async () => ({ answer: 42 }));
    const delegator = createRoleAgentDelegator(
      makeOptions({
        realModeDispatcher: realMode as unknown as RealModeDispatcher,
        liteAgentRuntime: liteRuntime,
        fallbackLlmCall: fallback,
      }),
    );

    const input = makeInput();
    const out = await delegator.delegate(input);

    expect(out.status).toBe("completed");
    expect(out.output).toEqual({ answer: 42 });
    expect(out.executionMode).toBe("lite"); // fallback 归入 lite 语义
    expect(realMode).not.toHaveBeenCalled();
    expect(liteRuntime.run).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.totalDelegations).toBe(1);
    expect(diag.fallbackDelegations).toBe(1);
    expect(diag.realDelegations).toBe(0);
    expect(diag.liteDelegations).toBe(0);
  });
});

describe("createRoleAgentDelegator - Tier 2 Docker 不可用", () => {
  it("executorClient.assertReachable throws → 直接走 Lite", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("unreachable");
    const realMode = vi.fn();
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput: AgentJobInput) =>
        makeAgentOutput(jobInput.jobId, { status: "completed" }),
      ),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode as unknown as RealModeDispatcher,
        liteAgentRuntime: liteRuntime,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.executionMode).toBe("lite");
    expect(realMode).not.toHaveBeenCalled();
    expect(liteRuntime.run).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.liteDelegations).toBe(1);
    expect(diag.realDelegations).toBe(0);
  });

  it("opts.executorClient undefined → 走 Lite（不尝试 Real）", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const realMode = vi.fn();
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput: AgentJobInput) =>
        makeAgentOutput(jobInput.jobId),
      ),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({
        realModeDispatcher: realMode as unknown as RealModeDispatcher,
        liteAgentRuntime: liteRuntime,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.executionMode).toBe("lite");
    expect(realMode).not.toHaveBeenCalled();
    expect(liteRuntime.run).toHaveBeenCalledTimes(1);
  });
});

describe("createRoleAgentDelegator - Real Mode 成功", () => {
  it("env=true + docker reachable + dispatcher 成功 → executionMode=real", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const realMode: RealModeDispatcher = vi.fn(async (jobInput) =>
      makeAgentOutput(jobInput.jobId, {
        iterations: 5,
        totalTokens: 2500,
        durationMs: 200,
      }),
    );
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode,
        // Lite runtime 也注入；验证不被误触发
        liteAgentRuntime: { run: vi.fn() },
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.executionMode).toBe("real");
    expect(realMode).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.realDelegations).toBe(1);
    expect(diag.averageIterations).toBe(5);
    expect(diag.averageTokensPerDelegation).toBe(2500);
    expect(diag.averageDurationMs).toBe(200);
    expect(diag.lastMode).toBe("real");
  });
});

describe("createRoleAgentDelegator - Real → Lite 降级", () => {
  it("Real throws → Lite 成功 → executionMode=lite", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const realMode: RealModeDispatcher = vi.fn(async () => {
      throw new Error("real dispatch failed");
    });
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput) => makeAgentOutput(jobInput.jobId)),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode,
        liteAgentRuntime: liteRuntime,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.executionMode).toBe("lite");
    expect(realMode).toHaveBeenCalledTimes(1);
    expect(liteRuntime.run).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.liteDelegations).toBe(1);
    expect(diag.realDelegations).toBe(0);
  });
});

describe("createRoleAgentDelegator - Real → Lite → fallback", () => {
  it("Real throws → Lite throws → fallback 成功", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const realMode: RealModeDispatcher = vi.fn(async () => {
      throw new Error("real failed");
    });
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async () => {
        throw new Error("lite failed");
      }),
    };
    const fallback = vi.fn(async () => ({ degraded: true }));
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode,
        liteAgentRuntime: liteRuntime,
        fallbackLlmCall: fallback,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.output).toEqual({ degraded: true });
    expect(out.executionMode).toBe("lite");
    expect(fallback).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.fallbackDelegations).toBe(1);
    expect(diag.realDelegations).toBe(0);
    expect(diag.liteDelegations).toBe(0);
  });
});

describe("createRoleAgentDelegator - 全部失败", () => {
  it("Real + Lite + fallback 都 throw → status=failed，error 带 reason", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const realMode: RealModeDispatcher = vi.fn(async () => {
      throw new Error("real failed");
    });
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async () => {
        throw new Error("lite failed");
      }),
    };
    const fallback = vi.fn(async () => {
      throw new Error("fallback too failed");
    });
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode,
        liteAgentRuntime: liteRuntime,
        fallbackLlmCall: fallback,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("failed");
    expect(out.output).toBeNull();
    expect(out.error).toContain("fallback_failed");
    expect(out.error).toContain("all_tiers_failed");

    const diag = delegator.getDiagnostics();
    expect(diag.fallbackDelegations).toBe(1);
    expect(diag.lastMode).toBe("fallback");
    expect(diag.lastError).toBeDefined();
  });
});

describe("createRoleAgentDelegator - 缺少 liteAgentRuntime", () => {
  it("Real 失败 + 无 liteAgentRuntime → 直接 fallback", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const realMode: RealModeDispatcher = vi.fn(async () => {
      throw new Error("real failed");
    });
    const fallback = vi.fn(async () => ({ ok: true }));
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode,
        // liteAgentRuntime 未注入
        fallbackLlmCall: fallback,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.status).toBe("completed");
    expect(out.output).toEqual({ ok: true });
    expect(fallback).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.fallbackDelegations).toBe(1);
  });
});

describe("createRoleAgentDelegator - 缺少 realModeDispatcher", () => {
  it("Docker 可达但 realModeDispatcher 未注入 → 直接走 Lite", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput) => makeAgentOutput(jobInput.jobId)),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        // realModeDispatcher 未注入
        liteAgentRuntime: liteRuntime,
      }),
    );

    const out = await delegator.delegate(makeInput());

    expect(out.executionMode).toBe("lite");
    expect(liteRuntime.run).toHaveBeenCalledTimes(1);

    const diag = delegator.getDiagnostics();
    expect(diag.liteDelegations).toBe(1);
  });
});

describe("createRoleAgentDelegator - Diagnostics counter invariant", () => {
  it("多次 delegate 后，total === real + lite + fallback", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");

    let realCalls = 0;
    const realMode: RealModeDispatcher = vi.fn(async (jobInput) => {
      realCalls += 1;
      // 第 1 次成功，第 2 次失败。
      if (realCalls === 1) return makeAgentOutput(jobInput.jobId);
      throw new Error("real failed on 2nd call");
    });

    let liteCalls = 0;
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput) => {
        liteCalls += 1;
        // 第 1 次成功（承接 real 的 2nd 失败），第 2 次失败。
        if (liteCalls === 1) return makeAgentOutput(jobInput.jobId);
        throw new Error("lite failed on 2nd call");
      }),
    };

    const fallback = vi.fn(async () => ({ fb: true }));

    const delegator = createRoleAgentDelegator(
      makeOptions({
        executorClient,
        realModeDispatcher: realMode,
        liteAgentRuntime: liteRuntime,
        fallbackLlmCall: fallback,
      }),
    );

    // 1st delegate: Real 成功
    await delegator.delegate(makeInput({ jobId: "j1" }));
    // 2nd delegate: Real 失败 → Lite 成功
    await delegator.delegate(makeInput({ jobId: "j2" }));
    // 3rd delegate: Real 失败 → Lite 失败 → fallback 成功
    await delegator.delegate(makeInput({ jobId: "j3" }));

    const diag = delegator.getDiagnostics();
    expect(diag.totalDelegations).toBe(3);
    expect(diag.realDelegations).toBe(1);
    expect(diag.liteDelegations).toBe(1);
    expect(diag.fallbackDelegations).toBe(1);
    expect(
      diag.realDelegations + diag.liteDelegations + diag.fallbackDelegations,
    ).toBe(diag.totalDelegations);
  });

  it("初始 diagnostics 所有 averages 为 0", () => {
    const delegator = createRoleAgentDelegator(makeOptions());
    const diag = delegator.getDiagnostics();
    expect(diag.totalDelegations).toBe(0);
    expect(diag.averageIterations).toBe(0);
    expect(diag.averageTokensPerDelegation).toBe(0);
    expect(diag.averageDurationMs).toBe(0);
    expect(diag.lastInvocationAt).toBeUndefined();
    expect(diag.lastMode).toBeUndefined();
  });
});

describe("createRoleAgentDelegator - getStatus", () => {
  it("delegate 完成后 getStatus 返回 completed", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput) =>
        makeAgentOutput(jobInput.jobId, {
          status: "completed",
          output: { snapshot: "ok" },
        }),
      ),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({ liteAgentRuntime: liteRuntime }),
    );

    const input = makeInput({ jobId: "job-status-1" });
    await delegator.delegate(input);

    const status = delegator.getStatus("job-status-1");
    expect(status).toBeDefined();
    expect(status?.phase).toBe("completed");
    if (status?.phase === "completed") {
      expect(status.output).toEqual({ snapshot: "ok" });
    }
  });

  it("未知 jobId → undefined", () => {
    const delegator = createRoleAgentDelegator(makeOptions());
    expect(delegator.getStatus("nonexistent")).toBeUndefined();
  });

  it("失败任务 → failed + error", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const fallback = vi.fn(async () => {
      throw new Error("oops");
    });
    const delegator = createRoleAgentDelegator(
      makeOptions({ fallbackLlmCall: fallback }),
    );

    const input = makeInput({ jobId: "job-failed-1" });
    // env off 会直接 fallback；但这里 env on 且 runtime/dispatcher 都缺失，
    // 最终也是走 Tier 3 fallback，fallback throw → failed。
    await delegator.delegate(input);

    const status = delegator.getStatus("job-failed-1");
    expect(status?.phase).toBe("failed");
  });
});

describe("createRoleAgentDelegator - cancel", () => {
  it("cancel 不存在 jobId → 不抛错，不改变状态", async () => {
    const delegator = createRoleAgentDelegator(makeOptions());
    await expect(
      delegator.cancel("nonexistent", "user canceled"),
    ).resolves.toBeUndefined();
    expect(delegator.getStatus("nonexistent")).toBeUndefined();
  });

  it("cancel 已存在 jobId → status 变为 aborted", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput) => makeAgentOutput(jobInput.jobId)),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({ liteAgentRuntime: liteRuntime }),
    );

    await delegator.delegate(makeInput({ jobId: "job-cancel-1" }));
    expect(delegator.getStatus("job-cancel-1")?.phase).toBe("completed");

    await delegator.cancel("job-cancel-1", "user canceled");
    const status = delegator.getStatus("job-cancel-1");
    expect(status?.phase).toBe("aborted");
    if (status?.phase === "aborted") {
      expect(status.reason).toBe("user canceled");
    }
  });
});

describe("createRoleAgentDelegator - outer try/catch 永不抛错", () => {
  it("executorClient.assertReachable 抛出非 promise reject → 仍被吞掉", async () => {
    vi.stubEnv(ENV_KEY, "true");
    // 这个 mock 会被 probeDockerReachable 的 try/catch 吞掉；
    // 走到 Lite → 缺失 → fallback。
    const executorClient = makeExecutorClient("throws");
    const fallback = vi.fn(async () => ({ ok: true }));
    const delegator = createRoleAgentDelegator(
      makeOptions({ executorClient, fallbackLlmCall: fallback }),
    );

    const out = await delegator.delegate(makeInput());
    expect(out.status).toBe("completed");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("roleRuntimeContextStore.get 抛错 → outer catch 接住，走 fallback", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const boomStore: RoleRuntimeContextStore = {
      get: vi.fn(() => {
        throw new Error("store broken");
      }),
      put: vi.fn(),
      delete: vi.fn(() => true),
      snapshot: vi.fn(() => []),
    };
    const fallback = vi.fn(async () => ({ safe: true }));
    const delegator = createRoleAgentDelegator(
      makeOptions({
        roleRuntimeContextStore: boomStore,
        fallbackLlmCall: fallback,
      }),
    );

    const out = await delegator.delegate(makeInput());
    expect(out.status).toBe("completed");
    expect(out.output).toEqual({ safe: true });
    // outer error 归入 fallback 计数
    const diag = delegator.getDiagnostics();
    expect(diag.fallbackDelegations).toBe(1);
  });
});

describe("createRoleAgentDelegator - 空 roleCtx", () => {
  it("roleRuntimeContextStore 返回 undefined → 用 builtin-only tools 继续", async () => {
    vi.stubEnv(ENV_KEY, "true");
    // store.get 返回 undefined；delegator 应继续执行不抛错。
    const store = makeContextStore(undefined);
    let capturedTools: number | undefined;
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput: AgentJobInput) => {
        capturedTools = jobInput.tools.length;
        return makeAgentOutput(jobInput.jobId);
      }),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({
        roleRuntimeContextStore: store,
        liteAgentRuntime: liteRuntime,
      }),
    );

    const out = await delegator.delegate(makeInput());
    expect(out.status).toBe("completed");
    // builtin.finish + builtin.think = 2
    expect(capturedTools).toBe(2);
  });

  it("roleRuntimeContextStore 返回 ctx → tools 包含 mcp/skill/aigc + builtins", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const store = makeContextStore(makeRoleCtx());
    let capturedTools: number | undefined;
    const liteRuntime: LiteAgentRuntime = {
      run: vi.fn(async (jobInput: AgentJobInput) => {
        capturedTools = jobInput.tools.length;
        return makeAgentOutput(jobInput.jobId);
      }),
    };
    const delegator = createRoleAgentDelegator(
      makeOptions({
        roleRuntimeContextStore: store,
        liteAgentRuntime: liteRuntime,
      }),
    );

    await delegator.delegate(makeInput());
    // 1 mcp + 1 skill + 1 aigc + 2 builtins = 5
    expect(capturedTools).toBe(5);
  });
});

describe("createRoleAgentDelegator - error 字段传递", () => {
  it("Real Mode 返回 status=failed + error → wrapped 保留 error", async () => {
    vi.stubEnv(ENV_KEY, "true");
    const executorClient = makeExecutorClient("reachable");
    const realMode: RealModeDispatcher = vi.fn(async (jobInput) =>
      makeAgentOutput(jobInput.jobId, {
        status: "failed",
        error: "budget exceeded",
      }),
    );
    const delegator = createRoleAgentDelegator(
      makeOptions({ executorClient, realModeDispatcher: realMode }),
    );

    const out = await delegator.delegate(makeInput());
    expect(out.status).toBe("failed");
    expect(out.error).toBe("budget exceeded");
    expect(out.executionMode).toBe("real");

    const diag = delegator.getDiagnostics();
    // 即使 status=failed，Real Mode 尝试也算一次 real delegation（invariant 保持）
    expect(diag.realDelegations).toBe(1);
    expect(diag.lastError).toBe("budget exceeded");
  });
});
