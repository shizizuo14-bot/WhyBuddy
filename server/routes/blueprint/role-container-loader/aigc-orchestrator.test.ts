import { describe, expect, it, vi } from "vitest";

import {
  buildMergedSummary,
  orchestrateAigcInvocation,
  registerOnDemandAigcNodes,
  type AigcNodeInvoker,
} from "./aigc-orchestrator.js";

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function fixedClock() {
  let ticks = 0;
  return () => new Date(Date.UTC(2026, 4, 12, 0, 0, 0) + (ticks++ * 10));
}

describe("registerOnDemandAigcNodes", () => {
  it("仅登记闭包，不调用 invoker", () => {
    const invoker = vi.fn<Parameters<AigcNodeInvoker>, ReturnType<AigcNodeInvoker>>();
    const handles = registerOnDemandAigcNodes(
      ["node-a", "node-b"],
      invoker,
      buildLogger(),
      () => new Date(),
    );
    expect(handles.size).toBe(2);
    expect(invoker).not.toHaveBeenCalled();
  });
});

describe("orchestrateAigcInvocation", () => {
  it("(a) serial 三节点全成功 → success: true, partialFailures=0", async () => {
    const invoker: AigcNodeInvoker = async (nodeId) => ({
      success: true,
      executionMode: "real",
      output: `out-${nodeId}`,
    });
    const logger = buildLogger();
    const handles = registerOnDemandAigcNodes(
      ["n1", "n2", "n3"],
      invoker,
      logger,
      fixedClock(),
    );
    const result = await orchestrateAigcInvocation(
      { nodeIds: ["n1", "n2", "n3"], input: { q: 1 }, handles, mode: "serial" },
      { logger, now: fixedClock() },
    );
    expect(result.success).toBe(true);
    expect(result.partialFailures).toBe(0);
    expect(result.nodeResults.map((r) => r.nodeId)).toEqual(["n1", "n2", "n3"]);
    expect(result.mergedOutputSummary).toContain("out-n1");
  });

  it("(b) serial 中间节点失败 → partialFailures=1 后续继续", async () => {
    const invoker: AigcNodeInvoker = async (nodeId) => {
      if (nodeId === "n2") {
        return { success: false, executionMode: "simulated_fallback", error: "boom" };
      }
      return { success: true, executionMode: "real", output: `out-${nodeId}` };
    };
    const logger = buildLogger();
    const handles = registerOnDemandAigcNodes(
      ["n1", "n2", "n3"],
      invoker,
      logger,
      fixedClock(),
    );
    const result = await orchestrateAigcInvocation(
      { nodeIds: ["n1", "n2", "n3"], input: null, handles, mode: "serial" },
      { logger, now: fixedClock() },
    );
    expect(result.success).toBe(false);
    expect(result.partialFailures).toBe(1);
    expect(result.nodeResults[1].success).toBe(false);
    expect(result.nodeResults[2].success).toBe(true);
    expect(result.mergedOutputSummary).toMatch(/FAILED/);
  });

  it("(c) parallel 全失败 → success=false", async () => {
    const invoker: AigcNodeInvoker = async () => ({
      success: false,
      executionMode: "simulated_fallback",
      error: "always down",
    });
    const logger = buildLogger();
    const handles = registerOnDemandAigcNodes(
      ["a", "b", "c"],
      invoker,
      logger,
      fixedClock(),
    );
    const result = await orchestrateAigcInvocation(
      { nodeIds: ["a", "b", "c"], input: {}, handles, mode: "parallel" },
      { logger, now: fixedClock() },
    );
    expect(result.success).toBe(false);
    expect(result.partialFailures).toBe(3);
    expect(result.nodeResults).toHaveLength(3);
  });

  it("(d) 空 nodeIds 返回 success:true, nodeResults:[]", async () => {
    const logger = buildLogger();
    const handles = registerOnDemandAigcNodes([], undefined, logger, () => new Date());
    const result = await orchestrateAigcInvocation(
      { nodeIds: [], input: {}, handles, mode: "serial" },
      { logger, now: () => new Date() },
    );
    expect(result.success).toBe(true);
    expect(result.nodeResults).toEqual([]);
    expect(result.mergedOutputSummary).toBe("");
  });

  it("(e) invoker 抛错被吞，返回 success: false", async () => {
    const invoker: AigcNodeInvoker = async () => {
      throw new Error("invoker crashed");
    };
    const logger = buildLogger();
    const handles = registerOnDemandAigcNodes(
      ["x"],
      invoker,
      logger,
      fixedClock(),
    );
    const result = await orchestrateAigcInvocation(
      { nodeIds: ["x"], input: {}, handles, mode: "serial" },
      { logger, now: fixedClock() },
    );
    expect(result.success).toBe(false);
    expect(result.nodeResults[0].success).toBe(false);
    expect(result.nodeResults[0].error).toContain("invoker crashed");
    expect(logger.warn).toHaveBeenCalled();
  });

  it("未登记 nodeId 被显式跳过且 warn", async () => {
    const invoker: AigcNodeInvoker = async () => ({
      success: true,
      executionMode: "real",
    });
    const logger = buildLogger();
    const handles = registerOnDemandAigcNodes(["known"], invoker, logger, fixedClock());
    const result = await orchestrateAigcInvocation(
      { nodeIds: ["known", "unknown"], input: {}, handles, mode: "serial" },
      { logger, now: fixedClock() },
    );
    expect(result.partialFailures).toBe(1);
    expect(result.nodeResults[1].error).toBe("node not registered");
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("buildMergedSummary", () => {
  it("合并成功 / 失败段并截断到 800 字符", () => {
    const big = "x".repeat(1000);
    const summary = buildMergedSummary([
      {
        nodeId: "n1",
        success: true,
        executionMode: "real",
        durationMs: 1,
        output: big,
      },
      {
        nodeId: "n2",
        success: false,
        executionMode: "simulated_fallback",
        durationMs: 1,
        error: "boom",
      },
    ]);
    expect(summary.length).toBeLessThanOrEqual(800);
    expect(summary).toContain("[n1]");
  });

  it("对 API key 类字符串做脱敏", () => {
    const summary = buildMergedSummary([
      {
        nodeId: "n1",
        success: true,
        executionMode: "real",
        durationMs: 1,
        output: "leaked token sk-ABCDEFGHIJKLMNOP1234567890 inline",
      },
    ]);
    expect(summary).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
    expect(summary).toContain("[redacted-api-key]");
  });
});
