import { describe, expect, it } from "vitest";

import {
  executeAiPptNode,
  mapPythonAiPptRuntimeResponse,
} from "../routes/node-adapters/ai-ppt-node-adapter.js";

const pythonRuntime = {
  backend: "python",
  provider: "fake",
  source: "python-ai-ppt-outline-runtime",
  externalCalls: false,
} as const;

describe("ai ppt python runtime node mapping", () => {
  it("maps python success outline to completed with generated deck and retains provenance/permission", async () => {
    const result = await executeAiPptNode(
      {
        nodeType: "ai_ppt",
        input: {
          topic: "季度经营复盘",
          brief: "输出给管理层的季度汇报材料",
          slideCount: 4,
          context: { requestId: "ppt-py-ctx" },
        },
      },
      {
        executePythonRuntime: async () => ({
          ok: true,
          status: "success",
          plan: {
            title: "季度经营复盘",
            summary: "聚焦经营表现、问题分析与下阶段动作。",
            slides: [
              {
                slideNumber: 1,
                title: "经营表现总览",
                bullets: ["收入增长 18%", "续费率稳定在 92%"],
                speakerNotes: "先讲整体。",
              },
              {
                slideNumber: 2,
                title: "下一步动作",
                bullets: ["聚焦高潜客户"],
              },
            ],
          },
          warnings: [],
          runtime: pythonRuntime,
          metadata: { req: "meta-ppt" },
          provenance: { provider: "py-fake", source: "ai-ppt-bridge" },
          permission: { allowed: true, auditId: "a-ppt-99" },
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.pythonStatus).toBe("success");
    expect(result.output.degraded).toBe(false);
    expect(result.output.deck.generationMode).toBe("generated");
    expect(result.output.deck.title).toBe("季度经营复盘");
    expect(result.output.runtime).toMatchObject(pythonRuntime);
    expect(result.output.context.metadata).toMatchObject({ req: "meta-ppt" });
    expect(result.output.provenance).toMatchObject({ provider: "py-fake" });
    expect(result.output.permission).toMatchObject({ allowed: true });
    expect(result.output.status).not.toBe("error");
    expect(result.output.deck.slides.length).toBe(2);
  });

  it.each([
    ["degraded", "provider_degraded", "degraded"],
    ["provider_missing", "provider_missing", "degraded"],
    ["error", "runtime_error", "error"],
  ] as const)("maps python %s without masquerading as generated", async (pyStatus, errCode, nodeStatus) => {
    const result = mapPythonAiPptRuntimeResponse({
      ok: false,
      status: pyStatus,
      error: { code: errCode, message: "py issue" },
      warnings: ["warn"],
      runtime: pythonRuntime,
      metadata: {},
      provenance: { src: "py" },
    });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe(nodeStatus);
    expect(result.output.pythonStatus).toBe(pyStatus);
    expect(result.output.pythonStatus).not.toBe("success");
    expect(result.output.degraded).toBe(true);
    expect(result.output.error?.code).toBe(errCode);
    expect(result.output.runtime).toMatchObject(pythonRuntime);
    expect(result.output.provenance).toMatchObject({ src: "py" });
    expect(result.output.deck.generationMode).toBe("fallback");
    expect(result.output.deck.generationMode).not.toBe("generated");
  });

  it("maps slide_plan and export_intent success preserving metadata", () => {
    const result = mapPythonAiPptRuntimeResponse({
      ok: true,
      status: "success",
      plan: {
        title: "产品发布计划",
        summary: "新功能介绍",
        slides: [{ slideNumber: 1, title: "引言", bullets: ["A"] }],
      },
      runtime: { backend: "python", provider: "fake", source: "python-ai-ppt-slide-plan-runtime", externalCalls: false },
      metadata: { intent: "slide_plan" },
    }, { topic: "产品发布" });

    expect(result.output.status).toBe("completed");
    expect(result.output.pythonStatus).toBe("success");
    expect(result.output.deck.generationMode).toBe("generated");
    expect(result.output.context.metadata).toMatchObject({ intent: "slide_plan" });
    expect(result.output.runtime?.source).toContain("slide-plan");
  });
});
