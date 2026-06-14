import { describe, it, expect } from "vitest";
import type { V5SessionState } from "../v5-reasoning-state.js";
import {
  needsReadinessChain,
  pickReadinessChainCapabilities,
  gapsFromGapAskContent,
  gapsFromClarifyQuestions,
  extractBlockingQuestions,
  extractClarifyBlock,
  resolveReadinessGapsByIds,
} from "../sliderule-readiness-chain.js";
import { pickNextCapabilities } from "../sliderule-pick-heuristic.js";

function stub(goalText: string): V5SessionState {
  return {
    goal: { text: goalText, status: "needs_refinement" },
    graph: { id: "g", jobId: "j", stage: "effect_preview", nodes: [], edges: [] },
    artifacts: [],
    conversation: [],
    openQuestions: [],
    evidence: [],
    decisions: [],
    risks: [],
    capabilityRuns: [],
    gates: [],
    dependencyGraph: [],
    staleArtifactIds: [],
    sessionId: "rc-test",
  };
}

describe("sliderule-readiness-chain (P0 / S11)", () => {
  it("needsReadinessChain for vague goal", () => {
    expect(needsReadinessChain(stub("做一个系统"), "做一个系统")).toBe(true);
  });

  it("pickReadinessChainCapabilities orders gap.ask before question.expand", () => {
    const picks = pickReadinessChainCapabilities(stub("做一个系统"));
    expect(picks.map((p) => p.capabilityId)).toEqual(["gap.ask", "question.expand"]);
  });

  it("pickNextCapabilities routes vague cold start to readiness chain", () => {
    const picks = pickNextCapabilities(stub("做一个系统"), "做一个系统");
    expect(picks[0]?.capabilityId).toBe("gap.ask");
    expect(picks.some((p) => p.capabilityId === "question.expand")).toBe(true);
  });

  it("extractBlockingQuestions parses bullet questions", () => {
    const qs = extractBlockingQuestions(
      "【阻塞缺口】\n- 面向谁使用？\n- 成功标准是什么？"
    );
    expect(qs.length).toBeGreaterThanOrEqual(2);
  });

  it("gapsFromGapAskContent creates open_question gaps", () => {
    const gaps = gapsFromGapAskContent(
      "- 面向谁？\n- 范围边界？",
      "t1",
      "art-1"
    );
    expect(gaps.every((g) => g.kind === "open_question")).toBe(true);
    expect(gaps.every((g) => g.status === "open")).toBe(true);
  });

  // ===== 澄清卡片（带选项，V4 风格 schema）=====

  it("extractClarifyBlock parses clarify-json block (V4 vocab) + strips it from content", () => {
    const content =
      "【阻塞缺口】\n- 面向谁使用？\n\n```clarify-json\n" +
      JSON.stringify([
        { prompt: "面向谁使用？", type: "single_choice", options: ["企业内部", "公开用户"], defaultAnswer: "企业内部", context: "决定权限模型" },
        { prompt: "补充说明？", type: "free_text" },
      ]) +
      "\n```";
    const { questions, cleanedContent } = extractClarifyBlock(content);
    expect(questions).toHaveLength(2);
    expect(questions![0]).toMatchObject({
      prompt: "面向谁使用？",
      type: "single_choice",
      options: ["企业内部", "公开用户"],
      defaultAnswer: "企业内部",
      context: "决定权限模型",
    });
    expect(questions![1].type).toBe("free_text");
    expect(cleanedContent).not.toContain("clarify-json");
  });

  it("extractClarifyBlock returns null when no block (text fallback)", () => {
    expect(extractClarifyBlock("- 纯文本问题？").questions).toBeNull();
  });

  it("gapsFromClarifyQuestions materializes gaps carrying options/defaultAnswer/type", () => {
    const gaps = gapsFromClarifyQuestions(
      [{ prompt: "面向谁？", type: "single_choice", options: ["A", "B"], defaultAnswer: "A", context: "ctx" }],
      "t1",
      "art-1"
    );
    expect(gaps[0]).toMatchObject({
      kind: "open_question",
      status: "open",
      label: "面向谁？",
      clarifyType: "single_choice",
      options: ["A", "B"],
      defaultAnswer: "A",
      context: "ctx",
    });
  });

  it("resolveReadinessGapsByIds resolves only the answered gaps (partial answers)", () => {
    const state = {
      coverageGaps: [
        { id: "g1", kind: "open_question", label: "q1", status: "open", createdAt: "x" },
        { id: "g2", kind: "open_question", label: "q2", status: "open", createdAt: "x" },
        { id: "g3", kind: "open_question", label: "q3", status: "open", createdAt: "x" },
      ],
    } as unknown as V5SessionState;
    const next = resolveReadinessGapsByIds(state, ["g1", "g3"]);
    const byId = new Map((next.coverageGaps || []).map((g) => [g.id, g.status]));
    expect(byId.get("g1")).toBe("resolved");
    expect(byId.get("g2")).toBe("open"); // 未答的保持 open
    expect(byId.get("g3")).toBe("resolved");
  });
});