import { describe, it, expect } from "vitest";
import type { V5SessionState } from "../../../shared/blueprint/v5-reasoning-state.js";
import { ensureComplexDeliberationPrimers } from "../orchestrate-plan.js";

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
    sessionId: "orch-delib",
  };
}

describe("ensureComplexDeliberationPrimers", () => {
  it("prepends panel chain when complex goal proposal skips deliberation", () => {
    const state = stub("写一个以LLM为核心驱动引擎的多Agent自定义RPG游戏");
    const selected = ensureComplexDeliberationPrimers(state, state.goal!.text!, [
      { capabilityId: "intent.parse", roleId: "产品" },
      { capabilityId: "structure.decompose", roleId: "架构" },
      { capabilityId: "route.generate", roleId: "架构" },
      { capabilityId: "gap.ask", roleId: "产品" },
    ]);
    expect(selected[0]?.capabilityId).toBe("critique.generate");
    expect(selected.some((s) => s.capabilityId === "synthesis.merge")).toBe(true);
    expect(selected.length).toBeLessThanOrEqual(4);
  });

  it("does not prepend when critique.generate already ran", () => {
    const state = {
      ...stub("写一个游戏"),
      capabilityRuns: [
        { id: "r1", capabilityId: "critique.generate", inputs: [], outputs: [], turnId: "t1" },
      ],
    } as V5SessionState;
    const input = [{ capabilityId: "report.write" as const, roleId: "综合" }];
    expect(ensureComplexDeliberationPrimers(state, "继续", input)).toEqual(input);
  });
});