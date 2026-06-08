import { describe, expect, it, vi } from "vitest";

import type {
  BrainstormRoleId,
  BrainstormSession,
  CrewMemberInstance,
  SynthesisResult,
} from "../../../../shared/blueprint/brainstorm-contracts";

import type { LLMCallerFn } from "./orchestrator";
import { auditSynthesis } from "./synthesis-audit";

/**
 * Unit tests for the primary-model synthesis audit.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 *
 * The primary caller is fully mocked with `vi.fn()` — no real LLM/HTTP. We
 * exercise the three behavioural branches: pass, needs_review, and the
 * never-throw error degradation.
 */

function makeCrewMember(
  roleId: BrainstormRoleId,
  content: string,
): CrewMemberInstance {
  return {
    roleId,
    state: "completed",
    iterationCount: 1,
    maxIterations: 3,
    tokenUsage: 100,
    output: {
      content,
      confidence: 0.8,
      toolInvocations: [],
      tokenUsage: 100,
    },
  };
}

function makeSession(
  overrides: Partial<BrainstormSession> = {},
): BrainstormSession {
  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>();
  crewMembers.set("planner", makeCrewMember("planner", "Adopt approach A."));
  crewMembers.set("architect", makeCrewMember("architect", "Approach A scales."));

  return {
    id: "session-1",
    jobId: "job-1",
    stageId: "stage-1",
    mode: "discussion",
    crewMembers,
    branchNodes: [],
    edges: [],
    status: "synthesizing",
    tokenBudget: 50_000,
    tokenUsed: 1_200,
    toolCallCount: 0,
    toolCallLimit: 20,
    startedAt: new Date(),
    ...overrides,
  };
}

function makeSynthesis(
  overrides: Partial<SynthesisResult> = {},
): SynthesisResult {
  return {
    decision: "Proceed with approach A.",
    confidence: 0.82,
    reasoningPoints: [{ roleId: "planner", point: "A is simpler." }],
    dissentingOpinions: [],
    tokenUsage: 200,
    ...overrides,
  };
}

describe("auditSynthesis", () => {
  it("returns pass when model affirms support and challenges are low", async () => {
    const primaryCaller: LLMCallerFn = vi.fn(async () =>
      JSON.stringify({
        supported: true,
        unsupported: false,
        fabrication: false,
        reasons: ["decision aligns with crew outputs"],
      }),
    );

    const result = await auditSynthesis({
      synthesis: makeSynthesis(),
      session: makeSession({
        deliberationSummary: {
          roundCount: 2,
          finalConvergenceScore: 0.9,
          consensusAchieved: true,
          totalChallenges: 1,
          unresolvedChallengeCount: 0,
        },
      }),
      primaryCaller,
    });

    expect(primaryCaller).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("pass");
    expect(result.unresolvedChallengeCount).toBe(0);
    expect(result.reasons).toContain("decision aligns with crew outputs");
  });

  it("returns needs_review when unresolved challenges exceed the threshold", async () => {
    const primaryCaller: LLMCallerFn = vi.fn(async () =>
      JSON.stringify({
        supported: true,
        unsupported: false,
        fabrication: false,
        reasons: [],
      }),
    );

    const result = await auditSynthesis({
      synthesis: makeSynthesis(),
      session: makeSession({
        deliberationSummary: {
          roundCount: 4,
          finalConvergenceScore: 0.4,
          consensusAchieved: false,
          totalChallenges: 6,
          unresolvedChallengeCount: 5,
        },
      }),
      primaryCaller,
    });

    expect(result.status).toBe("needs_review");
    expect(result.unresolvedChallengeCount).toBe(5);
    expect(result.reasons.some((r) => r.includes("unresolved challenge count"))).toBe(
      true,
    );
  });

  it("returns needs_review when the model flags the decision as unsupported", async () => {
    const primaryCaller: LLMCallerFn = vi.fn(async () =>
      "Here is my review:\n" +
      JSON.stringify({
        supported: false,
        unsupported: true,
        fabrication: false,
        reasons: ["claim X is not in any crew output"],
      }),
    );

    const result = await auditSynthesis({
      synthesis: makeSynthesis(),
      session: makeSession({
        deliberationSummary: {
          roundCount: 1,
          finalConvergenceScore: 0.7,
          consensusAchieved: true,
          totalChallenges: 0,
          unresolvedChallengeCount: 0,
        },
      }),
      primaryCaller,
    });

    expect(result.status).toBe("needs_review");
    expect(
      result.reasons.some((r) => r.includes("unsupported by evidence")),
    ).toBe(true);
  });

  it("never throws and degrades to needs_review when the caller rejects", async () => {
    const primaryCaller: LLMCallerFn = vi.fn(async () => {
      throw new Error("503 service unavailable");
    });

    const result = await auditSynthesis({
      synthesis: makeSynthesis(),
      session: makeSession({
        deliberationSummary: {
          roundCount: 2,
          finalConvergenceScore: 0.6,
          consensusAchieved: true,
          totalChallenges: 2,
          unresolvedChallengeCount: 1,
        },
      }),
      primaryCaller,
    });

    expect(result.status).toBe("needs_review");
    expect(result.unresolvedChallengeCount).toBe(1);
    expect(result.reasons[0]).toMatch(/^audit failed:/);
  });

  it("never throws and degrades to needs_review on an unparseable response", async () => {
    const primaryCaller: LLMCallerFn = vi.fn(async () => "totally not json");

    const result = await auditSynthesis({
      synthesis: makeSynthesis(),
      session: makeSession(),
      primaryCaller,
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasons[0]).toMatch(/^audit failed:/);
  });
});
