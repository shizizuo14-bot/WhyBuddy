import { describe, it, expect } from "vitest";
import type { V5SessionState } from "../v5-reasoning-state.js";
import {
  resolveRoleMode,
  pickBrainstormChain,
  shouldDegradeBrainstorm,
  isDeliberationCapability,
} from "../sliderule-role-mode.js";

function stub(goal: string): V5SessionState {
  return {
    goal: { text: goal, status: "needs_refinement" },
    graph: { id: "g", jobId: "j", stage: "effect_preview", nodes: [], edges: [] },
    artifacts: [],
    capabilityRuns: [],
    conversation: [],
    openQuestions: [],
    evidence: [],
    decisions: [],
    risks: [],
    gates: [],
    dependencyGraph: [],
    staleArtifactIds: [],
    sessionId: "rm-test",
  };
}

describe("sliderule-role-mode (S16/S17)", () => {
  it("resolveRoleMode complex for brainstorm keywords", () => {
    expect(resolveRoleMode(stub("权限系统"), "来个多角色辩论")).toBe("complex");
  });

  it("resolveRoleMode complex for product-build goals (放宽触发: 主用例默认多角色)", () => {
    // 你截图的目标类型：造一个工具/系统/应用 → 默认走多角色面板
    expect(resolveRoleMode(stub("做一个万年历+倒数日提醒工具"), "")).toBe("complex");
    expect(resolveRoleMode(stub("设计一个权限系统"), "")).toBe("complex");
    // 修复:游戏/引擎/写 + 多Agent 也应判复杂(此前 RPG 游戏目标被判 simple → 多角色为 0)
    expect(resolveRoleMode(stub("写一个以LLM为核心驱动引擎的多Agent自定义RPG游戏"), "")).toBe("complex");
    expect(resolveRoleMode(stub("做一个游戏引擎"), "")).toBe("complex");
  });

  it("resolveRoleMode complex when coverageContract.mode is complex (去掉 ≥4 产物门槛)", () => {
    const s = { ...stub("x"), coverageContract: { mode: "complex" } as any };
    expect(resolveRoleMode(s, "")).toBe("complex");
  });

  it("resolveRoleMode simple for trivial / non-build chatter", () => {
    expect(resolveRoleMode(stub("你好"), "今天天气怎么样")).toBe("simple");
  });

  it("pickBrainstormChain primes panel critique → synthesis (no counter)", () => {
    const picks = pickBrainstormChain(stub("复杂平台"));
    expect(picks[0]?.capabilityId).toBe("critique.generate");
    expect(picks.some((p) => p.capabilityId === "synthesis.merge")).toBe(true);
    expect(picks.some((p) => p.capabilityId === "counter.argue")).toBe(false);
  });

  it("degraded mode when brainstormDegraded flag set", () => {
    const s = { ...stub("x"), brainstormDegraded: true };
    expect(shouldDegradeBrainstorm(s, "辩论")).toBe(true);
    expect(resolveRoleMode(s, "辩论")).toBe("degraded");
  });

  it("isDeliberationCapability recognizes brainstorm caps", () => {
    expect(isDeliberationCapability("critique.generate")).toBe(true);
    expect(isDeliberationCapability("risk.analyze")).toBe(false);
  });
});