// Feature: autopilot-brainstorm-real-collaboration, Property 5: Degradation never throws
//
// For ANY combination of failures across the Critique caller, Rebuttal caller,
// Adjudicator, Topology resolution, and the per-member claim producer
// (`executeMember`) — each independently throwing, timing out (a rejected
// promise), or returning garbage / null — `executeDeliberation` SHALL resolve
// with a structurally valid `DeliberationResult` and SHALL NOT throw. Unaffected
// roles / critiques continue to make progress, and when the structured
// collaboration components are entirely absent the engine degrades to the
// retained legacy heuristic deliberation path (R9.4) — also without throwing.
//
// Validates: Requirements 1.4, 1.6, 2.6, 3.6, 8.5, 9.1, 9.4, 12.4

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import type {
  AdjudicationResult,
  BrainstormRoleId,
  BrainstormSession,
  BrainstormTopology,
  CrewMemberInstance,
  Critique,
  Rebuttal,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { AdjudicatorFn } from "./adjudicator.js";
import {
  executeDeliberation,
  type DeliberationResult,
  type ExecuteDeliberationInput,
  type StructuredCritiqueCaller,
  type StructuredRebuttalCaller,
} from "./deliberation-protocol.js";

// ---------------------------------------------------------------------------
// Roster + session builders
// ---------------------------------------------------------------------------

const ROLE_IDS: BrainstormRoleId[] = [
  "decider",
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
    id: "session-degrade",
    jobId: "job-degrade",
    stageId: "spec_docs",
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

// ---------------------------------------------------------------------------
// Failure-mode bitmask: each structured component can independently behave
// "ok", throw synchronously, reject (timeout), return null, or return garbage.
// ---------------------------------------------------------------------------

type MemberMode = "ok" | "throw" | "reject" | "garbage" | "noop";
type CallerMode = "ok" | "throw" | "reject" | "null" | "garbage";
type AdjMode =
  | "ok"
  | "throw"
  | "reject"
  | "null"
  | "nonObject"
  | "nan"
  | "infinity"
  | "outOfRange";
type TopoMode = "valid" | "absent" | "unexecutable" | "garbageEdges";

/** Per-member claim producer (the aux-pool member call) under each failure mode. */
function makeExecuteMember(
  mode: MemberMode,
): (member: CrewMemberInstance, context: string) => Promise<void> {
  return async (member) => {
    switch (mode) {
      case "throw":
        throw new Error("executeMember boom");
      case "reject":
        return Promise.reject(new Error("executeMember timeout"));
      case "noop":
        // Produces no output at all (member never reaches "completed").
        return;
      case "garbage":
        member.output = {
          content: "",
          confidence: Number.NaN,
          toolInvocations: [],
          tokenUsage: 0,
        };
        member.state = "completed";
        return;
      case "ok":
      default:
        member.output = {
          content: `${member.roleId} claims point one is sound. Point two is also defensible.`,
          confidence: 0.7,
          toolInvocations: [],
          tokenUsage: 1,
        };
        member.state = "completed";
        return;
    }
  };
}

function makeCritiqueCaller(mode: CallerMode): StructuredCritiqueCaller {
  return async ({ challengerRoleId, target }) => {
    switch (mode) {
      case "throw":
        throw new Error("critique boom");
      case "reject":
        return Promise.reject(new Error("critique timeout"));
      case "null":
        return null;
      case "garbage":
        // Out-of-set severity + blank fields → engine rejects via validation.
        return {
          id: `crit-${challengerRoleId}-${target.roleId}`,
          challengerRoleId,
          targetRoleId: target.roleId,
          targetClaim: "",
          critique: "",
          severity: "extreme" as Critique["severity"],
          roundNumber: 0,
          resolved: false,
        };
      case "ok":
      default:
        return {
          id: `crit-${challengerRoleId}-${target.roleId}`,
          challengerRoleId,
          targetRoleId: target.roleId,
          targetClaim: target.claims[0] ?? "an unstated claim",
          critique: "this claim is risky and unsupported",
          severity: "high",
          roundNumber: 0,
          resolved: false,
        };
    }
  };
}

function makeRebuttalCaller(
  mode: CallerMode,
  stance: Rebuttal["stance"],
): StructuredRebuttalCaller {
  return async ({ critique }) => {
    switch (mode) {
      case "throw":
        throw new Error("rebuttal boom");
      case "reject":
        return Promise.reject(new Error("rebuttal timeout"));
      case "null":
        return null;
      case "garbage":
        // Out-of-set stance + blank text → engine rejects via validation.
        return {
          id: `reb-${critique.id}`,
          responderRoleId: critique.targetRoleId,
          challengeId: "mismatched-id",
          rebuttal: "",
          stance: "maybe" as Rebuttal["stance"],
          roundNumber: 0,
        };
      case "ok":
      default:
        return {
          id: `reb-${critique.id}`,
          responderRoleId: critique.targetRoleId,
          challengeId: critique.id,
          rebuttal: "I respond to the critique directly",
          stance,
          roundNumber: 0,
        };
    }
  };
}

function makeAdjudicator(mode: AdjMode, consensus: boolean): AdjudicatorFn {
  return async ({ critiques }) => {
    const unresolvedCritiqueIds = critiques
      .filter((critique) => !critique.resolved)
      .map((critique) => critique.id);
    switch (mode) {
      case "throw":
        throw new Error("adjudicator boom");
      case "reject":
        return Promise.reject(new Error("adjudicator timeout"));
      case "null":
        return null as unknown as AdjudicationResult;
      case "nonObject":
        return "not an object" as unknown as AdjudicationResult;
      case "nan":
        return {
          consensusReached: consensus,
          convergenceScore: Number.NaN,
          unresolvedCritiqueIds,
          rationale: "nan score",
        };
      case "infinity":
        return {
          consensusReached: consensus,
          convergenceScore: Number.POSITIVE_INFINITY,
          unresolvedCritiqueIds,
          rationale: "infinite score",
        };
      case "outOfRange":
        return {
          consensusReached: consensus,
          convergenceScore: 42,
          unresolvedCritiqueIds,
          rationale: "out of range score",
        };
      case "ok":
      default:
        return {
          consensusReached: consensus,
          convergenceScore: 0.8,
          unresolvedCritiqueIds,
          rationale: "adjudicated",
        };
    }
  };
}

function makeTopology(
  mode: TopoMode,
  roles: BrainstormRoleId[],
): BrainstormTopology | undefined {
  switch (mode) {
    case "absent":
      return undefined;
    case "unexecutable":
      // Empty participants → not executable → dispatcher falls back to legacy.
      return {
        name: "unexecutable",
        participants: [],
        critiqueEdges: [],
        synthesizerRoleId: roles[0] ?? "decider",
        minRounds: 2,
        maxRounds: 3,
      };
    case "garbageEdges":
      // Edges referencing roles not present in the session → skipped per-edge.
      return {
        name: "garbage-edges",
        participants: roles,
        critiqueEdges: [
          { challenger: "ghost" as BrainstormRoleId, target: roles[0] ?? "decider" },
          { challenger: roles[0] ?? "decider", target: "phantom" as BrainstormRoleId },
        ],
        synthesizerRoleId: roles[0] ?? "decider",
        minRounds: 1,
        maxRounds: 3,
      };
    case "valid":
    default: {
      const edges =
        roles.length > 1
          ? roles.map((role, index) => ({
              challenger: role,
              target: roles[(index + 1) % roles.length],
            }))
          : [];
      return {
        name: "ring",
        participants: roles,
        critiqueEdges: edges,
        synthesizerRoleId: roles[0] ?? "decider",
        minRounds: 1,
        maxRounds: 3,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Shared structural-validity assertion for a DeliberationResult.
// ---------------------------------------------------------------------------

function assertValidDeliberationResult(result: DeliberationResult): void {
  expect(result).toBeDefined();
  expect(Array.isArray(result.rounds)).toBe(true);
  expect(typeof result.finalConvergenceScore).toBe("number");
  expect(Number.isFinite(result.finalConvergenceScore)).toBe(true);
  expect(result.finalConvergenceScore).toBeGreaterThanOrEqual(0);
  expect(result.finalConvergenceScore).toBeLessThanOrEqual(1);
  expect(typeof result.consensusAchieved).toBe("boolean");
  expect(typeof result.totalChallenges).toBe("number");
  expect(Array.isArray(result.unresolvedChallenges)).toBe(true);
  expect(Array.isArray(result.dissentingOpinions)).toBe(true);

  for (const round of result.rounds) {
    expect(typeof round.roundNumber).toBe("number");
    expect(Number.isFinite(round.convergenceScore)).toBe(true);
    expect(round.convergenceScore).toBeGreaterThanOrEqual(0);
    expect(round.convergenceScore).toBeLessThanOrEqual(1);
    expect(Array.isArray(round.memberOutputs)).toBe(true);
    expect(Array.isArray(round.challenges)).toBe(true);
    expect(Array.isArray(round.rebuttals)).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Property 5
// ---------------------------------------------------------------------------

describe("Feature: autopilot-brainstorm-real-collaboration, Property 5: Degradation never throws", () => {
  it("executeDeliberation always resolves with a valid DeliberationResult under any failure bitmask (Validates: Requirements 1.4, 1.6, 2.6, 3.6, 8.5, 9.1, 9.4, 12.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roles: fc.uniqueArray(fc.constantFrom(...ROLE_IDS), {
            minLength: 1,
            maxLength: ROLE_IDS.length,
          }),
          // The bitmask: an independent failure mode for every component.
          member: fc.constantFrom<MemberMode>(
            "ok",
            "throw",
            "reject",
            "garbage",
            "noop",
          ),
          critique: fc.constantFrom<CallerMode>(
            "ok",
            "throw",
            "reject",
            "null",
            "garbage",
          ),
          rebuttal: fc.constantFrom<CallerMode>(
            "ok",
            "throw",
            "reject",
            "null",
            "garbage",
          ),
          rebuttalStance: fc.constantFrom<Rebuttal["stance"]>(
            "concede",
            "defend",
          ),
          adjudicator: fc.constantFrom<AdjMode>(
            "ok",
            "throw",
            "reject",
            "null",
            "nonObject",
            "nan",
            "infinity",
            "outOfRange",
          ),
          adjConsensus: fc.boolean(),
          topology: fc.constantFrom<TopoMode>(
            "valid",
            "absent",
            "unexecutable",
            "garbageEdges",
          ),
          // Whether the structured collaboration components are wired at all.
          // When false the engine MUST degrade to the legacy heuristic path.
          provideStructured: fc.boolean(),
          minRounds: fc.integer({ min: 1, max: 3 }),
          maxRounds: fc.integer({ min: 1, max: 4 }),
        }),
        async (cfg) => {
          const session = makeSession(cfg.roles);
          const input: ExecuteDeliberationInput = {
            session,
            stageContext: "Design the authentication subsystem.",
            emitEvent: vi.fn(),
            executeMember: makeExecuteMember(cfg.member),
            config: {
              minRounds: cfg.minRounds,
              maxRounds: cfg.maxRounds,
              convergenceThreshold: 0.7,
            },
          };

          if (cfg.provideStructured) {
            input.topology = makeTopology(cfg.topology, cfg.roles);
            input.critiqueCaller = makeCritiqueCaller(cfg.critique);
            input.rebuttalCaller = makeRebuttalCaller(
              cfg.rebuttal,
              cfg.rebuttalStance,
            );
            input.adjudicator = makeAdjudicator(cfg.adjudicator, cfg.adjConsensus);
          }

          // The core guarantee: this await must never reject, regardless of the
          // failure bitmask, and must yield a structurally valid result.
          const result = await executeDeliberation(input);
          assertValidDeliberationResult(result);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("degrades to the legacy heuristic path without throwing when structured callers are entirely absent (Validates: Requirements 9.4, 12.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          roles: fc.uniqueArray(fc.constantFrom(...ROLE_IDS), {
            minLength: 1,
            maxLength: ROLE_IDS.length,
          }),
          // Non-throwing member behaviors so this property isolates the
          // "structured absent → legacy path" degradation claim itself.
          member: fc.constantFrom<MemberMode>("ok", "garbage", "noop"),
          minRounds: fc.integer({ min: 1, max: 3 }),
          maxRounds: fc.integer({ min: 1, max: 4 }),
        }),
        async (cfg) => {
          const session = makeSession(cfg.roles);

          // No topology / critiqueCaller / rebuttalCaller / adjudicator at all:
          // the dispatcher must route to the retained legacy heuristic engine.
          const result = await executeDeliberation({
            session,
            stageContext: "Design the authentication subsystem.",
            emitEvent: vi.fn(),
            executeMember: makeExecuteMember(cfg.member),
            config: {
              minRounds: cfg.minRounds,
              maxRounds: cfg.maxRounds,
              convergenceThreshold: 0.7,
            },
          });

          assertValidDeliberationResult(result);
        },
      ),
      { numRuns: 100 },
    );
  });
});
