// Feature: autopilot-brainstorm-real-collaboration, Property 13: Unresolved critiques surface as dissent

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  executeDeliberation,
  type ExecuteDeliberationInput,
} from "./deliberation-protocol";
import type { AdjudicatorFn } from "./adjudicator";
import type { EventEmitterFn } from "./orchestrator";
import type {
  BrainstormRoleId,
  BrainstormSession,
  BrainstormTopology,
  CrewMemberInstance,
  Critique,
  Rebuttal,
  TopologyCritiqueEdge,
} from "../../../../shared/blueprint/brainstorm-contracts";

/**
 * Property 13 — Unresolved critiques surface as dissent (Task 6.5).
 *
 * For ANY completed deliberation that ends WITHOUT consensus, every unresolved
 * Critique MUST appear as a dissenting opinion in `result.dissentingOpinions`
 * (matched by `challengeId`).
 *
 * We force the "ends without consensus" + "everything unresolved" regime by
 * injecting deterministic callers:
 *   - `adjudicator` always returns `consensusReached=false` (so the loop runs
 *     to `maxRounds` and `consensusAchieved` is false);
 *   - `rebuttalCaller` always returns a `"defend"` rebuttal (so no critique is
 *     ever resolved — "concede" would resolve it, R2.4);
 *   - `critiqueCaller` always returns a structurally valid Critique for the
 *     edge it is asked about, with a unique id we track.
 *   - `executeMember` is a stub that just writes a claim onto the member output.
 *
 * Every Critique the engine produces therefore stays unresolved, so the set of
 * `dissentingOpinions` challengeIds must equal exactly the set of produced
 * critique ids.
 *
 * Validates: Requirements 3.7
 */

const ROLE_IDS: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

/** A non-empty subset (>= 2) of the role roster, in arbitrary order. */
const rosterArb: fc.Arbitrary<BrainstormRoleId[]> = fc
  .subarray(ROLE_IDS, { minLength: 2 })
  .chain((roles) =>
    fc.shuffledSubarray(roles, { minLength: 2, maxLength: roles.length }),
  );

function buildMember(roleId: BrainstormRoleId): CrewMemberInstance {
  return {
    roleId,
    state: "idle",
    iterationCount: 0,
    maxIterations: 3,
    tokenUsage: 0,
  };
}

function buildSession(
  roles: BrainstormRoleId[],
  mode: BrainstormSession["mode"] = "discussion",
): BrainstormSession {
  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>();
  for (const roleId of roles) {
    crewMembers.set(roleId, buildMember(roleId));
  }
  return {
    id: "session-p13",
    jobId: "job-p13",
    stageId: "stage-p13",
    mode,
    crewMembers,
    branchNodes: [],
    edges: [],
    status: "active",
    tokenBudget: 1_000_000,
    tokenUsed: 0,
    toolCallCount: 0,
    toolCallLimit: 100,
    startedAt: new Date(),
  };
}

/** Build an arbitrary list of critique edges drawn from the roster (no self-loops). */
function edgesArb(
  roles: BrainstormRoleId[],
): fc.Arbitrary<TopologyCritiqueEdge[]> {
  const pairs: TopologyCritiqueEdge[] = [];
  for (const challenger of roles) {
    for (const target of roles) {
      if (challenger !== target) pairs.push({ challenger, target });
    }
  }
  // At least one edge so the dissent path is actually exercised.
  return fc.shuffledSubarray(pairs, { minLength: 1, maxLength: pairs.length });
}

const noopEmit: EventEmitterFn = () => {};

describe("executeDeliberation — Property 13: unresolved critiques surface as dissent", () => {
  it("every unresolved critique appears as a dissenting opinion (matched by challengeId) when deliberation ends without consensus", async () => {
    await fc.assert(
      fc.asyncProperty(
        rosterArb,
        fc.integer({ min: 1, max: 2 }), // minRounds
        fc.integer({ min: 0, max: 2 }), // extra rounds → maxRounds
        async (roles, minRounds, extraRounds) => {
          const maxRounds = minRounds + extraRounds;

          const edges = fc.sample(edgesArb(roles), 1)[0];
          const topology: BrainstormTopology = {
            name: "p13",
            participants: roles,
            critiqueEdges: edges,
            synthesizerRoleId: roles[0],
            minRounds,
            maxRounds,
          };

          const session = buildSession(roles);

          // Track every critique id the engine actually produced.
          const producedCritiqueIds: string[] = [];
          let critiqueSeq = 0;

          const critiqueCaller: ExecuteDeliberationInput["critiqueCaller"] =
            async ({ challengerRoleId, target }) => {
              const id = `crit-${critiqueSeq++}`;
              producedCritiqueIds.push(id);
              const critique: Critique = {
                id,
                challengerRoleId,
                targetRoleId: target.roleId,
                // targetClaim must be non-empty to pass validation; draw from
                // the target's own claims when available.
                targetClaim: target.claims[0]?.trim() || "the target's claim",
                critique: `I challenge ${target.roleId}'s claim`,
                severity: "high",
                roundNumber: 0,
                resolved: false,
              };
              return critique;
            };

          let rebuttalSeq = 0;
          const rebuttalCaller: ExecuteDeliberationInput["rebuttalCaller"] =
            async ({ critique }) => {
              const rebuttal: Rebuttal = {
                id: `reb-${rebuttalSeq++}`,
                responderRoleId: critique.targetRoleId,
                challengeId: critique.id,
                rebuttal: "I stand by my claim",
                // "defend" never resolves the critique (R2.5).
                stance: "defend",
                roundNumber: critique.roundNumber,
              };
              return rebuttal;
            };

          // Adjudicator always reports NO consensus → loop runs to maxRounds.
          const adjudicator: AdjudicatorFn = async ({ critiques }) => ({
            consensusReached: false,
            convergenceScore: 0.25,
            unresolvedCritiqueIds: critiques.map((c) => c.id),
            rationale: "still divergent",
          });

          const executeMember: ExecuteDeliberationInput["executeMember"] =
            async (member) => {
              member.output = {
                content: `Claim from ${member.roleId}. Another point here.`,
                confidence: 0.5,
                toolInvocations: [],
                tokenUsage: 1,
              };
              member.state = "completed";
            };

          const result = await executeDeliberation({
            session,
            stageContext: "p13 stage context",
            executeMember,
            emitEvent: noopEmit,
            topology,
            critiqueCaller,
            rebuttalCaller,
            adjudicator,
          });

          // The deliberation ended WITHOUT consensus (precondition of P13).
          expect(result.consensusAchieved).toBe(false);

          // Some critiques were produced (the path was actually exercised).
          expect(producedCritiqueIds.length).toBeGreaterThan(0);

          const dissentIds = new Set(
            result.dissentingOpinions.map((d) => d.challengeId),
          );

          // Every produced critique is unresolved ("defend" everywhere), so
          // every one MUST surface as a dissenting opinion (matched by id).
          for (const id of producedCritiqueIds) {
            expect(dissentIds.has(id)).toBe(true);
          }

          // And the dissent set references ONLY real produced critiques — no
          // phantom or duplicated ids beyond what was raised.
          const producedSet = new Set(producedCritiqueIds);
          for (const id of dissentIds) {
            expect(producedSet.has(id)).toBe(true);
          }

          // dissentingOpinions and unresolvedChallenges agree by id.
          const unresolvedIds = new Set(
            result.unresolvedChallenges.map((c) => c.id),
          );
          expect(unresolvedIds).toEqual(dissentIds);
        },
      ),
      { numRuns: 150 },
    );
  });
});
