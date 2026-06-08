// Feature: autopilot-brainstorm-real-collaboration, Property 3: Deliberation always terminates within configured round bounds

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  executeDeliberation,
  type ExecuteDeliberationInput,
  type StructuredCritiqueCaller,
  type StructuredRebuttalCaller,
} from "./deliberation-protocol";
import type { AdjudicatorFn } from "./adjudicator";
import type { EventEmitterFn } from "./orchestrator";
import type {
  BrainstormRoleId,
  BrainstormSession,
  BrainstormTopology,
  CrewMemberInstance,
  TopologyCritiqueEdge,
} from "../../../../shared/blueprint/brainstorm-contracts";

/**
 * Property 3 — Deliberation always terminates within configured round bounds
 * (Task 6.4).
 *
 * For ANY session, topology, and adjudicator behavior — varying the
 * adjudicator's `consensusReached` sequence across rounds and the topology's
 * `minRounds` / `maxRounds` (including out-of-range, zero, and negative
 * values) — `executeDeliberation` SHALL:
 *
 *   1. execute AT MOST `maxRounds` rounds (`result.rounds.length <= maxRounds`), and
 *   2. end early (before `maxRounds`) ONLY when the round's verdict had
 *      `consensusReached === true` AND the executed round count is at least
 *      `minRounds`.
 *
 * The round count is observed via `result.rounds.length`. The Critique /
 * Rebuttal / Adjudicator callers and `executeMember` are fully injected and
 * deterministic — no real network or LLM is involved. The structured engine
 * runs because all three structured callers are present and the topology is
 * executable (non-empty participants + an edge array).
 *
 * Validates: Requirements 3.3, 3.4
 */

const ROLE_IDS: readonly BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

// ---------------------------------------------------------------------------
// Effective round bounds — mirrors the clamping inside
// `executeStructuredDeliberation` exactly so the test can reason about them.
//   minRounds = Math.max(1, Math.floor(topology.minRounds) || 1)
//   maxRounds = Math.max(minRounds, Math.floor(topology.maxRounds) || minRounds)
// ---------------------------------------------------------------------------
function effectiveBounds(topology: BrainstormTopology): {
  min: number;
  max: number;
} {
  const min = Math.max(1, Math.floor(topology.minRounds) || 1);
  const max = Math.max(min, Math.floor(topology.maxRounds) || min);
  return { min, max };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeMember(roleId: BrainstormRoleId): CrewMemberInstance {
  return {
    roleId,
    state: "idle",
    iterationCount: 0,
    maxIterations: 3,
    tokenUsage: 0,
  };
}

function makeSession(participants: BrainstormRoleId[]): BrainstormSession {
  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>();
  for (const roleId of participants) {
    crewMembers.set(roleId, makeMember(roleId));
  }
  return {
    id: "session-term",
    jobId: "job-term",
    stageId: "stage-term",
    mode: "discussion",
    crewMembers,
    branchNodes: [],
    edges: [],
    status: "active",
    // Large budget so the token guard never causes an early break — the only
    // early-exit path we are testing is the consensus/min-rounds condition.
    tokenBudget: 1_000_000,
    tokenUsed: 0,
    toolCallCount: 0,
    toolCallLimit: 1_000,
    startedAt: new Date(),
  };
}

/** executeMember stub: gives each member a non-empty claim output, never fails. */
const executeMember: ExecuteDeliberationInput["executeMember"] = async (
  member,
) => {
  member.output = {
    content: "First claim about the design. Second claim about the plan.",
    confidence: 0.5,
    toolInvocations: [],
    tokenUsage: 0,
  };
  member.state = "completed";
};

const noopEmit: EventEmitterFn = () => {};

// Structured callers are present (so the structured engine runs) but return
// null — no Critiques/Rebuttals are produced, isolating termination behavior
// to the adjudicator's consensus sequence.
const nullCritiqueCaller: StructuredCritiqueCaller = async () => null;
const nullRebuttalCaller: StructuredRebuttalCaller = async () => null;

/** Adjudicator whose `consensusReached` per round is driven by `consensusOf`. */
function makeAdjudicator(
  consensusOf: (roundNumber: number) => boolean,
  convergenceScore: number,
): AdjudicatorFn {
  return async ({ roundNumber, critiques }) => ({
    consensusReached: consensusOf(roundNumber),
    convergenceScore,
    unresolvedCritiqueIds: critiques.map((c) => c.id),
    rationale: "test",
  });
}

function runDeliberation(
  participants: BrainstormRoleId[],
  topology: BrainstormTopology,
  adjudicator: AdjudicatorFn,
) {
  return executeDeliberation({
    session: makeSession(participants),
    stageContext: "stage context",
    executeMember,
    emitEvent: noopEmit,
    topology,
    critiqueCaller: nullCritiqueCaller,
    rebuttalCaller: nullRebuttalCaller,
    adjudicator,
  });
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const participantsArb = fc.subarray([...ROLE_IDS], {
  minLength: 1,
}) as fc.Arbitrary<BrainstormRoleId[]>;

function topologyArb(): fc.Arbitrary<BrainstormTopology> {
  return participantsArb.chain((participants) => {
    const roleArb = fc.constantFrom(...participants);
    const edgeArb: fc.Arbitrary<TopologyCritiqueEdge> = fc.record({
      challenger: roleArb,
      target: roleArb,
    });
    return fc.record({
      name: fc.constantFrom("default", "named-a", "named-b"),
      participants: fc.constant(participants),
      critiqueEdges: fc.array(edgeArb, { maxLength: 4 }),
      synthesizerRoleId: roleArb,
      // Include out-of-range / zero / negative bounds to exercise clamping.
      minRounds: fc.integer({ min: -2, max: 6 }),
      maxRounds: fc.integer({ min: -2, max: 6 }),
    });
  });
}

// A consensus sequence indexed by round number (1-based). `false` beyond length.
const consensusSeqArb = fc.array(fc.boolean(), { maxLength: 10 });

function consensusFromSeq(seq: boolean[]): (roundNumber: number) => boolean {
  return (roundNumber: number) => seq[roundNumber - 1] ?? false;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
describe("executeDeliberation — Property 3: terminates within round bounds", () => {
  it("runs at most maxRounds and ends early only on consensus at/after minRounds", async () => {
    await fc.assert(
      fc.asyncProperty(
        topologyArb(),
        consensusSeqArb,
        fc.double({ min: -5, max: 5, noNaN: true }),
        async (topology, seq, convergenceScore) => {
          const consensusOf = consensusFromSeq(seq);
          const result = await runDeliberation(
            topology.participants,
            topology,
            makeAdjudicator(consensusOf, convergenceScore),
          );

          const { min, max } = effectiveBounds(topology);
          const n = result.rounds.length;

          // At least one round always runs (active session, budget, live members).
          expect(n).toBeGreaterThanOrEqual(1);
          // (1) Never exceeds the (clamped) maxRounds.
          expect(n).toBeLessThanOrEqual(max);
          // Rounds are numbered sequentially 1..n.
          result.rounds.forEach((round, index) => {
            expect(round.roundNumber).toBe(index + 1);
          });

          // (2) Every round BEFORE the last did NOT satisfy the early-stop
          // condition (otherwise the loop would have stopped there).
          for (let r = 1; r < n; r++) {
            const earlyStopWouldFire = consensusOf(r) && r >= min;
            expect(earlyStopWouldFire).toBe(false);
          }

          // If it ended before maxRounds, the early-stop condition MUST hold at
          // the final round: consensus reached AND round count >= minRounds.
          if (n < max) {
            expect(consensusOf(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(min);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("runs exactly maxRounds when consensus is never reached", async () => {
    await fc.assert(
      fc.asyncProperty(topologyArb(), async (topology) => {
        const result = await runDeliberation(
          topology.participants,
          topology,
          makeAdjudicator(() => false, 0.3),
        );
        const { max } = effectiveBounds(topology);
        expect(result.rounds.length).toBe(max);
        expect(result.consensusAchieved).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("ends at exactly minRounds when consensus is reached every round", async () => {
    await fc.assert(
      fc.asyncProperty(topologyArb(), async (topology) => {
        const result = await runDeliberation(
          topology.participants,
          topology,
          makeAdjudicator(() => true, 0.95),
        );
        const { min } = effectiveBounds(topology);
        // First round r with (consensus && r >= min) is exactly r = min.
        expect(result.rounds.length).toBe(min);
        expect(result.consensusAchieved).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
