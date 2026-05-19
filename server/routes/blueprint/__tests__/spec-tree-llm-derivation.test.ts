/**
 * `createSpecTreeLlmDerivation` 单元测试。
 *
 * 覆盖 tasks.md 8.1-8.5 中描述的 15 个用例：
 * - 旗标与早退路径（#1-#4）
 * - MCP 与 Agent 异常（#5-#7）
 * - 超时与解析失败（#8-#11）
 * - 诊断、脱敏、fingerprint（#12-#15）
 *
 * 使用 `vi.stubEnv` 控制环境变量，`vi.mock` 拦截 `getAIConfig`。
 * 不依赖真实 `agent-reasoning-bridge.ts` 行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { SpecTreeLlmDerivationDeps, SpecTreeLlmDerivationRequest } from "../spec-tree-llm-derivation.js";
import { createSpecTreeLlmDerivation } from "../spec-tree-llm-derivation.js";
import type { BlueprintRouteSet } from "../../../../shared/blueprint/index.js";

// ---------------------------------------------------------------------------
// mock getAIConfig —— 默认返回有效 apiKey
// ---------------------------------------------------------------------------

vi.mock("../../../core/ai-config.js", () => ({
  getAIConfig: vi.fn(() => ({
    apiKey: "sk-fake-key-for-testing-only",
    baseUrl: "https://api.example.com/v1",
    model: "gpt-4o-mini",
    modelReasoningEffort: "medium",
    maxContext: 1_000_000,
    providerName: "example",
    wireApi: "chat_completions" as const,
    timeoutMs: 600_000,
    stream: false,
  })),
}));

// ---------------------------------------------------------------------------
// 共享 fake 数据与工具
// ---------------------------------------------------------------------------

/** 构造一个合法的 LLM 响应 JSON（通过 schema + 树关系校验）。 */
function makeValidLlmResponse() {
  return {
    rootTitle: "Blueprint Root",
    rootSummary: "Top-level spec tree root node for testing.",
    nodes: [
      {
        id: "root-node",
        title: "Root",
        summary: "The root of the spec tree.",
        type: "root" as const,
        priority: 100,
      },
      {
        id: "child-1",
        parentId: "root-node",
        title: "Child Module",
        summary: "A child module under root.",
        type: "module" as const,
        priority: 80,
      },
    ],
  };
}

/** 构造最小合法 routeSet。 */
function makeRouteSet(): BlueprintRouteSet {
  return {
    id: "route-set-1",
    jobId: "job-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    routes: [
      {
        id: "route-main",
        kind: "recommended",
        title: "Main Route",
        summary: "The primary route.",
        rationale: "Best fit.",
        steps: [
          {
            id: "step-1",
            title: "Step 1",
            description: "First step",
            role: "planner",
            capabilities: [],
          },
        ],
        capabilities: [],
        estimatedComplexity: "medium",
      },
      {
        id: "route-alt",
        kind: "conservative",
        title: "Alt Route",
        summary: "Alternative route.",
        rationale: "Safer.",
        steps: [],
        capabilities: [],
        estimatedComplexity: "low",
      },
    ],
  };
}

/** 构造标准请求。 */
function makeRequest(): SpecTreeLlmDerivationRequest {
  return {
    jobId: "test-job-001",
    routeSet: makeRouteSet(),
    selectedRouteId: "route-main",
    githubUrls: ["https://github.com/owner/repo"],
    targetText: "Build a task autopilot system.",
  };
}

/** 创建 fake logger。 */
function makeFakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** 创建 fake diagnostics store。 */
function makeFakeDiagnostics() {
  return {
    recordBridgeInvocation: vi.fn(),
    recordBridgeConfiguration: vi.fn(),
    snapshot: vi.fn(() => []),
  };
}

/** 创建 fake llmCall（默认返回合法 JSON）。 */
function makeFakeLlmCall(response: unknown = makeValidLlmResponse()) {
  return vi.fn(async () => ({
    type: "finish" as const,
    output: response,
  }));
}

/** 创建 fake mcpToolAdapter。 */
function makeFakeMcpAdapter(overrides?: { shouldReject?: boolean; response?: unknown }) {
  return {
    execute: vi.fn(async () => {
      if (overrides?.shouldReject) {
        throw new Error("mcp connection refused");
      }
      return {
        ok: true,
        status: "completed" as const,
        response: overrides?.response ?? { tree: ["src/", "package.json"] },
      };
    }),
  };
}

/** 创建 fake liteAgentRuntime。 */
function makeFakeLiteAgentRuntime(overrides?: {
  shouldReject?: boolean;
  rejectMessage?: string;
  neverResolve?: boolean;
  output?: unknown;
}) {
  return {
    run: vi.fn(async () => {
      if (overrides?.neverResolve) {
        return new Promise<never>(() => {
          /* 永不 resolve */
        });
      }
      if (overrides?.shouldReject) {
        throw new Error(overrides.rejectMessage ?? "agent internal error");
      }
      return {
        status: "completed" as const,
        output: overrides?.output ?? makeValidLlmResponse(),
      };
    }),
  };
}

/** 组装完整 deps。 */
function makeDeps(overrides?: Partial<SpecTreeLlmDerivationDeps>): SpecTreeLlmDerivationDeps {
  return {
    llmCall: makeFakeLlmCall(),
    diagnostics: makeFakeDiagnostics(),
    logger: makeFakeLogger(),
    now: () => new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("createSpecTreeLlmDerivation", () => {
  beforeEach(() => {
    vi.stubEnv("BLUEPRINT_SPEC_TREE_LLM_ENABLED", "true");
    vi.stubEnv("BUILD_TARGET", "");
    vi.stubEnv("BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS", "5000");
    vi.stubEnv("LLM_API_KEY", "sk-fake-key-for-testing-only");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ─── #1 Tier 1 happy path ───────────────────────────────────────────────
  it("#1 Tier1 happy path：MCP 成功 + Agent 成功 → generationSource=llm, contextTier=full", async () => {
    const deps = makeDeps({
      mcpToolAdapter: makeFakeMcpAdapter(),
      liteAgentRuntime: makeFakeLiteAgentRuntime(),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("llm");
    expect(result.contextTier).toBe("full");
    expect(result.tree).toBeDefined();
    expect(result.tree!.nodes.length).toBeGreaterThan(0);
    expect(result.promptFingerprint).toBeDefined();
    expect(result.promptFingerprint!.startsWith("sha256:")).toBe(true);
    expect(result.model).toBe("gpt-4o-mini");
  });

  // ─── #2 旗标关闭 ──────────────────────────────────────────────────────
  it("#2 env 关闭：BLUEPRINT_SPEC_TREE_LLM_ENABLED=false → 早退 template", async () => {
    vi.stubEnv("BLUEPRINT_SPEC_TREE_LLM_ENABLED", "false");
    const liteAgent = makeFakeLiteAgentRuntime();
    const diagnostics = makeFakeDiagnostics();
    const deps = makeDeps({ liteAgentRuntime: liteAgent, diagnostics });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    // 不应调用 agent 或诊断
    expect(liteAgent.run).not.toHaveBeenCalled();
    expect(diagnostics.recordBridgeInvocation).not.toHaveBeenCalled();
  });

  // ─── #3 BUILD_TARGET=test 强锁 ────────────────────────────────────────
  it("#3 BUILD_TARGET=test：强锁为 template，不调 agent", async () => {
    vi.stubEnv("BUILD_TARGET", "test");
    const liteAgent = makeFakeLiteAgentRuntime();
    const deps = makeDeps({ liteAgentRuntime: liteAgent });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(liteAgent.run).not.toHaveBeenCalled();
  });

  // ─── #4 apiKey 缺失 ───────────────────────────────────────────────────
  it("#4 apiKey 为空字符串：早退 template", async () => {
    const { getAIConfig } = await import("../../../core/ai-config.js");
    vi.mocked(getAIConfig).mockReturnValueOnce({
      apiKey: "",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      modelReasoningEffort: "medium",
      maxContext: 1_000_000,
      providerName: "example",
      wireApi: "chat_completions",
      timeoutMs: 600_000,
      stream: false,
    });
    const liteAgent = makeFakeLiteAgentRuntime();
    const deps = makeDeps({ liteAgentRuntime: liteAgent });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(result.fallbackReason).toBe("apiKey missing");
    expect(liteAgent.run).not.toHaveBeenCalled();
  });

  // ─── #5 无 MCP → route-only ───────────────────────────────────────────
  it("#5 mcpToolAdapter 未注入 → Tier 2 route-only，仍 generationSource=llm", async () => {
    const deps = makeDeps({
      // 不注入 mcpToolAdapter
      liteAgentRuntime: makeFakeLiteAgentRuntime(),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("llm");
    expect(result.contextTier).toBe("route-only");
    expect(result.tree).toBeDefined();
  });

  // ─── #6 MCP 抛错 → route-only ─────────────────────────────────────────
  it("#6 adapter.execute reject → 降级 Tier 2 route-only", async () => {
    const deps = makeDeps({
      mcpToolAdapter: makeFakeMcpAdapter({ shouldReject: true }),
      liteAgentRuntime: makeFakeLiteAgentRuntime(),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("llm");
    expect(result.contextTier).toBe("route-only");
    expect(result.tree).toBeDefined();
  });

  // ─── #7 Agent reject → fallback ───────────────────────────────────────
  it('#7 liteAgentRuntime.run reject → Tier 3 fallback，fallbackReason 含 "agent threw"', async () => {
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({
        shouldReject: true,
        rejectMessage: "internal reasoning failure",
      }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(result.fallbackReason).toContain("agent threw");
  });

  // ─── #8 超时 → fallback ────────────────────────────────────────────────
  it('#8 agent 永不 resolve + 短 timeout → fallbackReason 含 "timeout"', async () => {
    vi.stubEnv("BLUEPRINT_SPEC_TREE_LLM_TIMEOUT_MS", "50");
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({ neverResolve: true }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(result.fallbackReason).toContain("timeout");
  });

  // ─── #9 非 JSON 返回 ──────────────────────────────────────────────────
  it('#9 LLM 返回非 JSON 字符串 → fallbackReason 含 "non-json"', async () => {
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({
        output: "This is not valid JSON at all",
      }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(result.fallbackReason).toContain("non-json");
  });

  // ─── #10 schema 不全 ──────────────────────────────────────────────────
  it('#10 LLM 返回缺少 nodes 字段 → fallbackReason 含 "schema validation failed"', async () => {
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({
        output: { rootTitle: "X", rootSummary: "Y" /* 缺 nodes */ },
      }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(result.fallbackReason).toContain("schema validation failed");
  });

  // ─── #11 schema 通过但缺 root ─────────────────────────────────────────
  it('#11 schema 通过但无 root 节点 → fallbackReason 含 "tree construction failed"', async () => {
    const noRootResponse = {
      rootTitle: "Title",
      rootSummary: "Summary",
      nodes: [
        {
          id: "child-a",
          parentId: "missing-parent",
          title: "Child A",
          summary: "A child without valid parent.",
          type: "module" as const,
          priority: 50,
        },
      ],
    };
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({ output: noRootResponse }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.contextTier).toBe("fallback");
    expect(result.fallbackReason).toContain("tree construction failed");
  });

  // ─── #12 诊断调用 ─────────────────────────────────────────────────────
  it("#12 Tier 1 成功时 recordBridgeInvocation 被调用 1 次，mode=real", async () => {
    const diagnostics = makeFakeDiagnostics();
    const deps = makeDeps({
      diagnostics,
      mcpToolAdapter: makeFakeMcpAdapter(),
      liteAgentRuntime: makeFakeLiteAgentRuntime(),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    await derivation.derive(makeRequest());

    expect(diagnostics.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(diagnostics.recordBridgeInvocation).toHaveBeenCalledWith(
      "specTreeLlm",
      expect.objectContaining({ mode: "real" }),
    );
  });

  // ─── #13 脱敏 ─────────────────────────────────────────────────────────
  it("#13 错误脱敏：LLM 错误含 sk-test-1234... → fallbackReason 不含原始 key", async () => {
    const sensitiveKey = "sk-testSecretKeyAbcdefghijklmnop1234567890";
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({
        shouldReject: true,
        rejectMessage: `auth failed with key ${sensitiveKey}`,
      }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.fallbackReason).not.toContain(sensitiveKey);
    expect(result.fallbackReason).toContain("[redacted-api-key]");
  });

  // ─── #14 截断 ≤ 400 ──────────────────────────────────────────────────
  it("#14 错误截断：1000 字错误 → fallbackReason.length ≤ 400", async () => {
    const longMessage = "x".repeat(1000);
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime({
        shouldReject: true,
        rejectMessage: longMessage,
      }),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const result = await derivation.derive(makeRequest());

    expect(result.generationSource).toBe("template");
    expect(result.fallbackReason).toBeDefined();
    expect(result.fallbackReason!.length).toBeLessThanOrEqual(400);
  });

  // ─── #15 fingerprint 稳定 ─────────────────────────────────────────────
  it("#15 promptFingerprint 稳定：同输入连调两次，fingerprint 相等", async () => {
    const deps = makeDeps({
      liteAgentRuntime: makeFakeLiteAgentRuntime(),
    });
    const derivation = createSpecTreeLlmDerivation(deps);
    const request = makeRequest();

    const result1 = await derivation.derive(request);
    const result2 = await derivation.derive(request);

    expect(result1.promptFingerprint).toBeDefined();
    expect(result2.promptFingerprint).toBeDefined();
    expect(result1.promptFingerprint).toBe(result2.promptFingerprint);
  });
});
