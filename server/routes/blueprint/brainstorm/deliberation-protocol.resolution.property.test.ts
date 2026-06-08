// Feature: autopilot-brainstorm-real-collaboration, Property 2
// Feature: autopilot-brainstorm-real-collaboration, Property 12
//
// Property-based tests for the structured deliberation loop in
// `deliberation-protocol.ts` (the structured path of `executeDeliberation`).
//
// These tests drive `executeDeliberation` through its REAL structured
// collaboration path by injecting deterministic `critiqueCaller` /
// `rebuttalCaller` / `adjudicator` callers plus an executable topology and a
// fake in-memory `BrainstormSession` + `executeMember` stub. No network / no
// LLM is involved — the structured branch runs deterministically.
//
// P2  (Rebuttal resolution correctness):
//     For ANY Critique paired with a Rebuttal, the matched Critique is marked
//     `resolved` IF AND ONLY IF the Rebuttal's `stance` is "concede". A
//     "defend" stance, an unparseable rebuttal, or a failed rebuttal call
//     leaves the Critique UNRESOLVED and retained (surfaced as dissent).
//     Validates: Requirements 2.4, 2.5, 2.6
//
// P12 (Rebuttal references its originating critique):
//     For ANY produced Rebuttal, its `challengeId` equals the `id` of the
//     Critique it responds to — even when the rebuttal caller returns a wrong
//     `challengeId`, the engine overrides it to the originating critique id.
//     Validates: Requirements 2.2

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type {
  BrainstormRoleId,
  BrainstormSession,
  BrainstormTopology,
  CrewMemberInstance,
  Rebuttal,
  RebuttalStance,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { AdjudicatorFn } from "./adjudicator.js";
import type { EventEmitterFn } from "./orchestrator.js";
import {
  executeDeliberation,
  type StructuredCritiqueCaller,
  type StructuredRebuttalCaller,
} from "./deliberation-protocol.js";

const ROLE_IDS: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

/**
 * The possible outcomes of a single rebuttal call, exercising every branch of
 * the resolution rule (R2.4 concede→resolved; R2.5 defend→unresolved; R2.6
 * null/throw/invalid→unresolved).
 */
type RebuttalKind = "concede" | "defend" | "null" | "throw" | "invalid";

interface ScenarioCase {
  challengerIdx: number;
  targetIdx: number;
  kind: RebuttalKind;
}

interface ScenarioOutcome {
  result: Awaited<ReturnType<typeof executeDeliberation>>;
  events: Array<{ type: string; payload: Record<string, unknown> }>;
  /** Intended rebuttal kind per produced critique id (`crit-${i}` → kind). */
  kindByCritiqueId: Map<string, RebuttalKind>;
}

/** Build a minimal in-memory crew member (never in the "failed" state). */
function buildMember(roleId: BrainstormRoleId): CrewMemberInstance {
  return {
    roleId,
    state: "idle",
    iterationCount: 0,
    maxIterations: 3,
    tokenUsage: 0,
  };
}

/** Build a minimal active BrainstormSession containing all six roles. */
function buildSession(): BrainstormSession {
  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>();
  for (const roleId of ROLE_IDS) {
    crewMembers.set(roleId, buildMember(roleId));
  }
  return {
    id: "sess-resolution",
    jobId: "job-resolution",
    stageId: "stage-resolution",
    mode: "discussion",
    crewMembers,
    branchNodes: [],
    edges: [],
    status: "active",
    tokenBudget: 1_000_000,
    tokenUsed: 0,
    toolCallCount: 0,
    toolCallLimit: 1_000,
    startedAt: new Date(),
  };
}

/** Resolve a target role index distinct from the challenger (no self-loop). */
function distinctTarget(challengerIdx: number, targetIdx: number): number {
  return targetIdx === challengerIdx
    ? (targetIdx + 1) % ROLE_IDS.length
    : targetIdx;
}

/**
 * Drive `executeDeliberation` through its structured path for the given cases.
 * One round only (minRounds=maxRounds=1) so each topology edge yields exactly
 * one critique + one rebuttal attempt, keeping the case↔critique mapping
 * deterministic via a sequential call counter.
 */
async function runScenario(cases: ScenarioCase[]): Promise<ScenarioOutcome> {
  const session = buildSession();

  const critiqueEdges = cases.map((c) => {
    const challenger = ROLE_IDS[c.challengerIdx];
    const target = ROLE_IDS[distinctTarget(c.challengerIdx, c.targetIdx)];
    return { challenger, target };
  });

  const topology: BrainstormTopology = {
    name: "test-resolution",
    participants: [...ROLE_IDS],
    critiqueEdges,
    synthesizerRoleId: "decider",
    minRounds: 1,
    maxRounds: 1,
  };

  const kindByCritiqueId = new Map<string, RebuttalKind>();
  let critiqueCallIndex = 0;

  // Each edge yields a structurally valid Critique with a unique id `crit-${i}`.
  const critiqueCaller: StructuredCritiqueCaller = async ({
    challengerRoleId,
    target,
  }) => {
    const i = critiqueCallIndex++;
    const id = `crit-${i}`;
    kindByCritiqueId.set(id, cases[i]?.kind ?? "defend");
    return {
      id,
      challengerRoleId,
      targetRoleId: target.roleId,
      targetClaim: `claim-${i}`,
      critique: `critique-${i}`,
      severity: "medium",
      roundNumber: 1,
      resolved: false,
    };
  };

  // The rebuttal caller decides the outcome based on the originating critique
  // id, and deliberately returns a WRONG challengeId to prove the engine
  // overrides it with the originating critique id (P12).
  const rebuttalCaller: StructuredRebuttalCaller = async ({ critique }) => {
    const i = Number.parseInt(critique.id.slice("crit-".length), 10);
    const kind = cases[i]?.kind ?? "defend";
    const rebuttalId = `reb-${i}`;
    if (kind === "throw") {
      throw new Error("simulated rebuttal failure");
    }
    if (kind === "null") {
      return null;
    }
    const stance: string = kind === "invalid" ? "maybe" : kind;
    const rebuttal: Rebuttal = {
      id: rebuttalId,
      responderRoleId: critique.targetRoleId,
      challengeId: "WRONG-CHALLENGE-ID",
      rebuttal: `rebuttal-${i}`,
      // `invalid` deliberately violates the closed stance set so the engine
      // treats it as no valid rebuttal (unresolved, R2.6).
      stance: stance as RebuttalStance,
      roundNumber: 1,
    };
    return rebuttal;
  };

  const adjudicator: AdjudicatorFn = async () => ({
    consensusReached: false,
    convergenceScore: 0.5,
    unresolvedCritiqueIds: [],
    rationale: "test adjudication",
  });

  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const emitEvent: EventEmitterFn = (type, payload) => {
    events.push({ type, payload });
  };

  const executeMember = async (
    member: CrewMemberInstance,
    _context: string,
  ): Promise<void> => {
    member.output = {
      content: `claim-output for ${member.roleId}. Another sentence here.`,
      confidence: 0.8,
      toolInvocations: [],
      tokenUsage: 1,
    };
    member.state = "completed";
  };

  const result = await executeDeliberation({
    session,
    stageContext: "resolution property test",
    executeMember,
    emitEvent,
    topology,
    critiqueCaller,
    rebuttalCaller,
    adjudicator,
  });

  return { result, events, kindByCritiqueId };
}

const arbCase: fc.Arbitrary<ScenarioCase> = fc.record({
  challengerIdx: fc.integer({ min: 0, max: ROLE_IDS.length - 1 }),
  targetIdx: fc.integer({ min: 0, max: ROLE_IDS.length - 1 }),
  kind: fc.constantFrom<RebuttalKind>(
    "concede",
    "defend",
    "null",
    "throw",
    "invalid",
  ),
});

const arbCases = fc.array(arbCase, { minLength: 1, maxLength: 8 });

// Feature: autopilot-brainstorm-real-collaboration, Property 2
describe("Feature: autopilot-brainstorm-real-collaboration, Property 2", () => {
  it("a critique is resolved IFF its rebuttal stance is 'concede'; defend/null/failed/invalid stay unresolved and retained", async () => {
    await fc.assert(
      fc.asyncProperty(arbCases, async (cases) => {
        const { result, kindByCritiqueId } = await runScenario(cases);

        // Every edge produced exactly one critique.
        expect(kindByCritiqueId.size).toBe(cases.length);

        // Unresolved critiques surface as dissent, keyed by their critique id.
        const dissentIds = new Set(
          result.dissentingOpinions.map((d) => d.challengeId),
        );

        // The challenge records returned per round carry resolution status via
        // `unresolvedRounds` (0 == resolved, >=1 == unresolved).
        const challengeRecordsById = new Map(
          result.rounds
            .flatMap((round) => round.challenges)
            .map((challenge) => [challenge.id, challenge]),
        );

        for (const [critiqueId, kind] of kindByCritiqueId) {
          const shouldResolve = kind === "concede";

          // IFF: resolved exactly when stance is "concede".
          // resolved  <=> NOT in dissent.
          expect(dissentIds.has(critiqueId)).toBe(!shouldResolve);

          const record = challengeRecordsById.get(critiqueId);
          expect(record).toBeDefined();
          if (record) {
            if (shouldResolve) {
              expect(record.unresolvedRounds).toBe(0);
            } else {
              expect(record.unresolvedRounds).toBeGreaterThanOrEqual(1);
            }
          }
        }

        // Retention: every unresolved (non-concede) critique appears as dissent.
        const expectedDissent = [...kindByCritiqueId.entries()].filter(
          ([, kind]) => kind !== "concede",
        ).length;
        expect(dissentIds.size).toBe(expectedDissent);
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: autopilot-brainstorm-real-collaboration, Property 12
describe("Feature: autopilot-brainstorm-real-collaboration, Property 12", () => {
  it("every produced rebuttal's challengeId equals the id of the critique it responds to", async () => {
    await fc.assert(
      fc.asyncProperty(arbCases, async (cases) => {
        const { result, events } = await runScenario(cases);

        const rebuttalRecords = result.rounds.flatMap((round) => round.rebuttals);

        for (const rebuttal of rebuttalRecords) {
          const i = Number.parseInt(rebuttal.id.slice("reb-".length), 10);
          // The engine overrides the caller's wrong challengeId with the
          // originating critique id (R2.2).
          expect(rebuttal.challengeId).toBe(`crit-${i}`);
          expect(rebuttal.challengeId).not.toBe("WRONG-CHALLENGE-ID");
        }

        // Only valid stances (concede/defend) produce a rebuttal record.
        const expectedRebuttals = cases.filter(
          (c) => c.kind === "concede" || c.kind === "defend",
        ).length;
        expect(rebuttalRecords.length).toBe(expectedRebuttals);

        // The emitted rebuttal events carry the same originating critique id.
        const rebuttalEvents = events.filter(
          (e) => e.type === "brainstorm.rebuttal.issued",
        );
        for (const event of rebuttalEvents) {
          expect(event.payload.challengeId).toMatch(/^crit-\d+$/);
          expect(event.payload.challengeId).not.toBe("WRONG-CHALLENGE-ID");
        }
      }),
      { numRuns: 200 },
    );
  });
});
