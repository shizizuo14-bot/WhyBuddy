import { describe, expect, it, vi } from "vitest";

import type { AIConfig } from "../../../core/ai-config.js";
import type {
  BlueprintClarificationSession,
  BlueprintGenerationRequest,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import type { BlueprintLlmDependencies } from "../context.js";

import {
  createRouteSetLlmGenerator,
  type RouteSetLlmGeneratorInput,
} from "./route-llm-generator.js";

/**
 * `route-llm-generator.ts` 的 co-located 单测。
 *
 * 覆盖 design §4.3 / §4.5 / §4.6 与 tasks.md §7 约定的 7 类场景：
 *  7.1 Happy path：mock `callJson` 返回合法 2 条路线 → 路线来自 LLM +
 *      `provenanceExtras.generationSource === "llm"` + `promptId === "blueprint.routeset.v1"`
 *      + `error` 未定义；
 *  7.2 LLM 抛错：`throw new Error("network unreachable")` → 3 条模板路线 +
 *      `generationSource === "llm_fallback"` + `error` 匹配 `/network unreachable/`；
 *  7.3 LLM 返回 `{}`：schema 校验失败 → 3 条模板路线 + `generationSource === "llm_fallback"` +
 *      `error` 匹配 `/Schema validation failed/`；
 *  7.4 LLM 返回无 primary 路线（全是 alternative）：refine 失败 → 3 条模板路线 +
 *      `generationSource === "llm_fallback"` + `error` 包含 `/primary/i`；
 *  7.5 `apiKey` 缺失：早退 fallback + `generationSource === "llm_fallback"` + `error`
 *      匹配 `/not configured/i`；断言 `callJson` 未被调用；
 *  7.6 `provenanceExtras.model` 反映 `ctx.llm.getConfig().model`（happy path 下配置
 *      `"gpt-4-turbo"` 时返回 `"gpt-4-turbo"`）；
 *  7.7 normalize 把 primary 路线 id 改写为 caller 传入的 `primaryRouteId`（即使 LLM
 *      产出的 id 是 `"llm-primary"`）。
 *
 * Validates: Requirements 2.4, 3.4, 4.1, 4.2, 4.3, 4.4, 6.2, 6.3, 6.4, 8.2, 9.2
 */

const FIXED_TIMESTAMP = "2026-05-07T00:00:00.000Z";
const ROUTE_SET_ID = "blueprint-routeset-test";
const PRIMARY_ROUTE_ID = `${ROUTE_SET_ID}:primary`;

function makeAIConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://example.test",
    model: "gpt-4-turbo",
    modelReasoningEffort: "medium",
    maxContext: 128000,
    providerName: "example.test",
    wireApi: "chat_completions",
    timeoutMs: 30000,
    stream: false,
    ...overrides,
  };
}

function makeRequest(
  overrides: Partial<BlueprintGenerationRequest> = {},
): BlueprintGenerationRequest {
  return {
    projectId: "project-1",
    sourceId: "source-1",
    targetText: "Ship a balanced autopilot planner",
    githubUrls: ["https://github.com/example/repo"],
    ...overrides,
  };
}

function makeSession(): BlueprintClarificationSession {
  return {
    id: "session-1",
    intakeId: "intake-1",
    projectId: "project-1",
    strategyId: "target_first",
    templateId: "template-1",
    questions: [],
    answers: [
      { questionId: "q-1", answer: "balanced delivery", source: "user" },
    ],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 1,
      requiredTotal: 1,
      missingQuestionIds: [],
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function makeInput(
  overrides: Partial<RouteSetLlmGeneratorInput> = {},
): RouteSetLlmGeneratorInput {
  return {
    request: makeRequest(),
    clarificationSession: makeSession(),
    routeSetId: ROUTE_SET_ID,
    primaryRouteId: PRIMARY_ROUTE_ID,
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

/**
 * 构造一份最小 Context：注入可 mock 的 `callJson` / `getConfig`；其余字段由
 * `buildBlueprintServiceContext` 用默认实现兜底。对应需求 6.3 / 6.4。
 */
function makeContext(options: {
  callJson?: BlueprintLlmDependencies["callJson"];
  getConfig?: () => AIConfig;
}) {
  const callJson =
    options.callJson ??
    (vi.fn() as unknown as BlueprintLlmDependencies["callJson"]);
  const getConfig = options.getConfig ?? (() => makeAIConfig());
  return {
    ctx: buildBlueprintServiceContext({
      jobStore: createMemoryBlueprintJobStore(),
      llm: {
        callJson,
        getConfig,
      },
    }),
    callJson,
    getConfig,
  };
}

function makeValidLlmResponse() {
  return {
    routes: [
      {
        id: "llm-primary",
        kind: "primary" as const,
        title: "LLM-derived balanced route",
        summary:
          "Primary route produced by the LLM that balances delivery and exploration.",
        rationale:
          "Chosen because clarifications favour a balanced delivery profile.",
        riskLevel: "medium" as const,
        costLevel: "medium" as const,
        complexity: "balanced" as const,
        estimatedEffort: "2 days",
        capabilities: [
          {
            id: "docker-analysis-sandbox",
            label: "Docker analysis sandbox",
            purpose: "Run sandboxed inspection for the primary path.",
            kind: "docker",
          },
        ],
      },
      {
        id: "llm-alt-1",
        kind: "alternative" as const,
        title: "LLM alternative exploration route",
        summary: "Alternative route that prioritises exploration.",
        rationale: "Useful when the user prefers preview-first discovery.",
        riskLevel: "low" as const,
        costLevel: "low" as const,
        complexity: "light" as const,
        estimatedEffort: "1 day",
        capabilities: [
          {
            id: "aigc-spec-node",
            label: "AIGC SPEC derivation node",
            purpose: "Turn route nodes into SPEC tree candidates.",
            kind: "aigc_node",
          },
        ],
      },
    ],
    summary: "Two candidate routes produced by the LLM.",
  };
}

describe("createRouteSetLlmGenerator", () => {
  it("7.1 happy path：routes 来自 LLM，generationSource 为 'llm'，error 未定义", async () => {
    const callJson = vi.fn().mockResolvedValue(makeValidLlmResponse());
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(makeInput());

    expect(output.routes).toHaveLength(2);
    expect(output.routes[0].kind).toBe("primary");
    expect(output.routes[0].title).toBe("LLM-derived balanced route");
    expect(output.routes[1].kind).toBe("alternative");
    expect(output.provenanceExtras.generationSource).toBe("llm");
    expect(output.provenanceExtras.promptId).toBe("blueprint.routeset.v1");
    expect(output.provenanceExtras.error).toBeUndefined();
    expect(callJson).toHaveBeenCalledTimes(1);
  });

  it("7.2 LLM 抛错 → 回退 3 条模板路线 + error 匹配 /network unreachable/", async () => {
    const callJson = vi
      .fn()
      .mockRejectedValue(new Error("network unreachable"));
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(makeInput());

    expect(output.routes).toHaveLength(3);
    expect(output.routes[0].title).toBe("Primary SPEC asset route");
    expect(output.provenanceExtras.generationSource).toBe("llm_fallback");
    expect(output.provenanceExtras.error).toMatch(/network unreachable/);
  });

  it("7.3 LLM 返回 {} → schema 校验失败 → 回退模板 + error 匹配 /Schema validation failed/", async () => {
    const callJson = vi.fn().mockResolvedValue({});
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(makeInput());

    expect(output.routes).toHaveLength(3);
    expect(output.routes[0].title).toBe("Primary SPEC asset route");
    expect(output.provenanceExtras.generationSource).toBe("llm_fallback");
    expect(output.provenanceExtras.error).toMatch(/Schema validation failed/);
  });

  it("7.4 LLM 返回全是 alternative → refine 失败 → 回退模板 + error 包含 primary", async () => {
    const response = makeValidLlmResponse();
    response.routes[0].kind = "alternative";
    response.routes[0].id = "llm-alt-0";
    const callJson = vi.fn().mockResolvedValue(response);
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(makeInput());

    expect(output.routes).toHaveLength(3);
    expect(output.routes[0].title).toBe("Primary SPEC asset route");
    expect(output.provenanceExtras.generationSource).toBe("llm_fallback");
    expect(output.provenanceExtras.error).toMatch(/primary/i);
  });

  it("7.5 apiKey 缺失 → 早退 fallback + error 匹配 /not configured/i + callJson 未被调用", async () => {
    const callJson = vi.fn();
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      getConfig: () => makeAIConfig({ apiKey: "" }),
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(makeInput());

    expect(output.routes).toHaveLength(3);
    expect(output.provenanceExtras.generationSource).toBe("llm_fallback");
    expect(output.provenanceExtras.error).toMatch(/not configured/i);
    expect(callJson).not.toHaveBeenCalled();
  });

  it("7.6 provenanceExtras.model 反映 ctx.llm.getConfig().model（happy path）", async () => {
    const callJson = vi.fn().mockResolvedValue(makeValidLlmResponse());
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
      getConfig: () => makeAIConfig({ model: "gpt-4-turbo" }),
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(makeInput());

    expect(output.provenanceExtras.generationSource).toBe("llm");
    expect(output.provenanceExtras.model).toBe("gpt-4-turbo");
  });

  it("7.7 normalize 把 primary 路线 id 改写为 caller 传入的 primaryRouteId", async () => {
    const callJson = vi.fn().mockResolvedValue(makeValidLlmResponse());
    const { ctx } = makeContext({
      callJson: callJson as unknown as BlueprintLlmDependencies["callJson"],
    });

    const generator = createRouteSetLlmGenerator(ctx);
    const output = await generator(
      makeInput({ primaryRouteId: "test-routeset:primary" }),
    );

    expect(output.routes[0].kind).toBe("primary");
    expect(output.routes[0].id).toBe("test-routeset:primary");
    // LLM 原始 id "llm-primary" 不得泄漏到最终路线
    expect(output.routes.map((route) => route.id)).not.toContain("llm-primary");
  });
});
