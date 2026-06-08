import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import type {
  BrainstormRoleId,
  BrainstormSession,
  CrewMemberInstance,
} from "../../../../../shared/blueprint/brainstorm-contracts.js";
import {
  computeConvergenceScore,
  executeDeliberation,
  type DeliberationMemberOutput,
} from "../deliberation-protocol.js";

const ROLE_IDS: BrainstormRoleId[] = [
  "planner",
  "architect",
  "executor",
  "auditor",
];

function makeMember(roleId: BrainstormRoleId): CrewMemberInstance {
  return {
    roleId,
    state: "idle",
    iterationCount: 0,
    maxIterations: 3,
    tokenUsage: 0,
  };
}

function makeSession(roles: BrainstormRoleId[]): BrainstormSession {
  return {
    id: "session-test",
    jobId: "job-test",
    stageId: "stage-test",
    mode: "discussion",
    crewMembers: new Map(roles.map((roleId) => [roleId, makeMember(roleId)])),
    branchNodes: [],
    edges: [],
    status: "active",
    tokenBudget: 50_000,
    tokenUsed: 0,
    toolCallCount: 0,
    toolCallLimit: 20,
    startedAt: new Date("2026-06-08T00:00:00.000Z"),
  };
}

const arbMemberOutput = fc.record({
  roleId: fc.constantFrom(...ROLE_IDS),
  content: fc.string({ maxLength: 200 }),
  referencedMembers: fc.array(fc.constantFrom(...ROLE_IDS), {
    maxLength: ROLE_IDS.length,
  }),
  agreementPoints: fc.array(fc.string({ maxLength: 40 }), { maxLength: 5 }),
  challenges: fc.array(fc.string({ maxLength: 80 }), { maxLength: 3 }),
}) satisfies fc.Arbitrary<DeliberationMemberOutput>;

describe("Feature: blueprint-v4-full-loop-completion, Property 1", () => {
  it("keeps convergence score within [0,1] and returns 1.0 for a single member", () => {
    fc.assert(
      fc.property(fc.array(arbMemberOutput, { minLength: 1, maxLength: 8 }), (outputs) => {
        const score = computeConvergenceScore(outputs);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );

    expect(
      computeConvergenceScore([
        {
          roleId: "planner",
          content: "solo",
          referencedMembers: [],
          agreementPoints: [],
          challenges: [],
        },
      ]),
    ).toBe(1);
  });
});

describe("Feature: blueprint-v4-full-loop-completion, Property 2", () => {
  it("executes at least minRounds before completing deliberation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        fc.uniqueArray(fc.constantFrom(...ROLE_IDS), { minLength: 2, maxLength: 3 }),
        async (minRounds, roles) => {
          const session = makeSession(roles);
          const executed: Array<{ roleId: BrainstormRoleId; context: string }> = [];
          const emitEvent = vi.fn();

          const result = await executeDeliberation({
            session,
            stageContext: "Discuss the implementation plan.",
            config: {
              minRounds,
              maxRounds: minRounds,
              convergenceThreshold: 0,
            },
            emitEvent,
            executeMember: async (member, context) => {
              executed.push({ roleId: member.roleId, context });
              member.output = {
                content: `${member.roleId} round output ${executed.length}`,
                confidence: 0.8,
                toolInvocations: [],
                tokenUsage: 1,
              };
              member.state = "completed";
            },
          });

          expect(result.rounds).toHaveLength(minRounds);
          expect(executed).toHaveLength(minRounds * roles.length);
          expect(emitEvent).toHaveBeenCalledTimes(minRounds);
          expect(emitEvent).toHaveBeenLastCalledWith(
            "brainstorm.round.completed",
            expect.objectContaining({ roundNumber: minRounds }),
          );
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe("Feature: blueprint-v4-full-loop-completion, Property 3", () => {
  it("links rebuttals to prior challenges and flags unresolved challenges after two rounds", async () => {
    const session = makeSession(["planner", "architect"]);
    const executeMember = vi.fn(async (member) => {
      if (member.roleId === "planner") {
        member.output = {
          content: "challenge architect: auth risk remains unresolved.",
          confidence: 0.6,
          toolInvocations: [],
          tokenUsage: 1,
        };
        member.state = "completed";
        return;
      }
      member.output = {
        content: "I acknowledge the planner concern but have no rebuttal yet.",
        confidence: 0.5,
        toolInvocations: [],
        tokenUsage: 1,
      };
      member.state = "completed";
    });

    const result = await executeDeliberation({
      session,
      stageContext: "Design auth.",
      executeMember,
      emitEvent: vi.fn(),
      config: { minRounds: 2, maxRounds: 2, convergenceThreshold: 1 },
    });

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].challenges.length).toBeGreaterThanOrEqual(1);
    expect(result.rounds[1].rebuttals.length).toBeGreaterThanOrEqual(1);
    expect(
      result.rounds[1].rebuttals.some(
        (rebuttal) => rebuttal.challengeId === result.rounds[0].challenges[0].id,
      ),
    ).toBe(true);
    expect(result.unresolvedChallenges.length).toBeGreaterThanOrEqual(1);
    expect(result.dissentingOpinions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleId: "planner",
          opinion: expect.stringContaining("auth risk"),
        }),
      ]),
    );
  });
});
