// Unit tests for structured brainstorm event field completeness (Task 10.2).
//
// Drives the REAL structured deliberation path of `executeDeliberation` with
// injected deterministic callers + an executable topology + a stub
// `executeMember` + a capturing `emitEvent`, then asserts the emitted payloads
// carry every field the wall feed depends on:
//   - brainstorm.challenge.issued: sessionId, jobId, stageId, challengerRoleId,
//     targetRoleId, targetClaim, severity, roundNumber
//   - brainstorm.rebuttal.issued:  sessionId, jobId, stageId, responderRoleId,
//     challengeId, stance, roundNumber
//   - brainstorm.round.completed:  sessionId, jobId, stageId, roundNumber,
//     convergenceScore, consensusReached, unresolvedCritiqueCount
//
// A separate small test drives the orchestrator's vote mode to assert
// brainstorm.vote.completed field completeness.
//
// Requirements: 6.1, 6.2, 6.3, 6.4
// @see .kiro/specs/autopilot-brainstorm-real-collaboration/design.md §6

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BrainstormRoleId,
  BrainstormSession,
  BrainstormTopology,
  CrewMemberInstance,
  SessionConfig,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { AdjudicatorFn } from "./adjudicator.js";
import {
  executeDeliberation,
  type StructuredCritiqueCaller,
  type StructuredRebuttalCaller,
} from "./deliberation-protocol.js";
import {
  BrainstormOrchestrator,
  type EventEmitterFn,
  type LLMCallerFn,
} from "./orchestrator.js";

interface CapturedEvent {
  type: string;
  payload: Record<string, unknown>;
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

/** Build a minimal active BrainstormSession for the given roles. */
function buildSession(roleIds: BrainstormRoleId[]): BrainstormSession {
  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>();
  for (const roleId of roleIds) {
    crewMembers.set(roleId, buildMember(roleId));
  }
  return {
    id: "sess-events",
    jobId: "job-events",
    stageId: "stage-events",
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

/**
 * Drive `executeDeliberation` through its structured path for a single
 * challenger -> target edge, producing exactly one critique + one rebuttal so
 * all three deliberation event types are emitted.
 */
async function runDeliberation(
  stance: "concede" | "defend",
): Promise<CapturedEvent[]> {
  const roleIds: BrainstormRoleId[] = ["planner", "architect"];
  const session = buildSession(roleIds);

  const topology: BrainstormTopology = {
    name: "test-events",
    participants: [...roleIds],
    critiqueEdges: [{ challenger: "planner", target: "architect" }],
    synthesizerRoleId: "decider",
    minRounds: 1,
    maxRounds: 1,
  };

  const critiqueCaller: StructuredCritiqueCaller = async ({
    challengerRoleId,
    target,
  }) => ({
    id: "crit-0",
    challengerRoleId,
    targetRoleId: target.roleId,
    targetClaim: target.claims[0] ?? "fallback claim",
    critique: "The proposed approach ignores the rollback path.",
    severity: "high",
    roundNumber: 1,
    resolved: false,
  });

  const rebuttalCaller: StructuredRebuttalCaller = async ({ critique }) => ({
    id: "reb-0",
    responderRoleId: critique.targetRoleId,
    challengeId: critique.id,
    rebuttal: "Rollback is handled by the migration guard.",
    stance,
    roundNumber: 1,
  });

  const adjudicator: AdjudicatorFn = async () => ({
    consensusReached: stance === "concede",
    convergenceScore: 0.82,
    unresolvedCritiqueIds: [],
    rationale: "test adjudication",
  });

  const events: CapturedEvent[] = [];
  const emitEvent: EventEmitterFn = (type, payload) => {
    events.push({ type, payload });
  };

  const executeMember = async (
    member: CrewMemberInstance,
    _context: string,
  ): Promise<void> => {
    member.output = {
      content: `Claim from ${member.roleId}. Another supporting sentence.`,
      confidence: 0.8,
      toolInvocations: [],
      tokenUsage: 1,
    };
    member.state = "completed";
  };

  await executeDeliberation({
    session,
    stageContext: "structured events unit test",
    executeMember,
    emitEvent,
    topology,
    critiqueCaller,
    rebuttalCaller,
    adjudicator,
  });

  return events;
}

function firstOfType(events: CapturedEvent[], type: string): CapturedEvent {
  const found = events.find((event) => event.type === type);
  expect(found, `expected an emitted ${type} event`).toBeDefined();
  return found as CapturedEvent;
}

/** Assert a payload field is a present, non-empty string. */
function expectNonEmptyString(payload: Record<string, unknown>, key: string): void {
  expect(typeof payload[key], `${key} should be a string`).toBe("string");
  expect((payload[key] as string).length, `${key} should be non-empty`).toBeGreaterThan(0);
}

describe("structured brainstorm events - field completeness (Task 10.2)", () => {
  it("brainstorm.challenge.issued carries every required field", async () => {
    const events = await runDeliberation("defend");
    const { payload } = firstOfType(events, "brainstorm.challenge.issued");

    expectNonEmptyString(payload, "sessionId");
    expectNonEmptyString(payload, "jobId");
    expectNonEmptyString(payload, "stageId");
    expectNonEmptyString(payload, "challengerRoleId");
    expectNonEmptyString(payload, "targetRoleId");
    expectNonEmptyString(payload, "targetClaim");

    expect(payload.challengerRoleId).toBe("planner");
    expect(payload.targetRoleId).toBe("architect");
    expect(["low", "medium", "high"]).toContain(payload.severity);
    expect(payload.severity).toBe("high");
    expect(payload.roundNumber).toBe(1);
  });

  it("brainstorm.rebuttal.issued carries every required field", async () => {
    const events = await runDeliberation("defend");
    const { payload } = firstOfType(events, "brainstorm.rebuttal.issued");

    expectNonEmptyString(payload, "sessionId");
    expectNonEmptyString(payload, "jobId");
    expectNonEmptyString(payload, "stageId");
    expectNonEmptyString(payload, "responderRoleId");
    expectNonEmptyString(payload, "challengeId");

    expect(payload.responderRoleId).toBe("architect");
    // The rebuttal references its originating critique (R2.2).
    expect(payload.challengeId).toBe("crit-0");
    expect(["concede", "defend"]).toContain(payload.stance);
    expect(payload.stance).toBe("defend");
    expect(payload.roundNumber).toBe(1);
  });

  it("brainstorm.round.completed carries every required field", async () => {
    const events = await runDeliberation("defend");
    const { payload } = firstOfType(events, "brainstorm.round.completed");

    expectNonEmptyString(payload, "sessionId");
    expectNonEmptyString(payload, "jobId");
    expectNonEmptyString(payload, "stageId");

    expect(payload.roundNumber).toBe(1);
    expect(typeof payload.convergenceScore).toBe("number");
    expect(payload.convergenceScore as number).toBeGreaterThanOrEqual(0);
    expect(payload.convergenceScore as number).toBeLessThanOrEqual(1);
    expect(typeof payload.consensusReached).toBe("boolean");
    expect(typeof payload.unresolvedCritiqueCount).toBe("number");
    // A "defend" rebuttal leaves the single critique unresolved (R2.5).
    expect(payload.unresolvedCritiqueCount).toBe(1);
  });

  it("a 'concede' rebuttal resolves the critique → zero unresolved critiques in round.completed", async () => {
    const events = await runDeliberation("concede");
    const { payload } = firstOfType(events, "brainstorm.round.completed");

    expect(payload.unresolvedCritiqueCount).toBe(0);
    expect(payload.consensusReached).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// brainstorm.vote.completed (small orchestrator-driven test)
// ---------------------------------------------------------------------------

/** Spin the microtask queue until the session leaves the "active" state. */
async function runToCompletion(session: BrainstormSession): Promise<void> {
  for (let i = 0; i < 5_000 && session.status === "active"; i++) {
    await Promise.resolve();
  }
}

describe("brainstorm.vote.completed - field completeness (Task 10.2)", () => {
  let orchestrator: BrainstormOrchestrator | null = null;

  afterEach(() => {
    orchestrator?.dispose();
    orchestrator = null;
    vi.clearAllMocks();
  });

  it("emits a vote.completed event with the full majority-vote payload", async () => {
    const events: CapturedEvent[] = [];
    const emitEvent: EventEmitterFn = (type, payload) => {
      events.push({ type, payload });
    };

    // Aux caller: every crew member returns a parseable claim naming an option.
    const llmCaller: LLMCallerFn = vi.fn(async () =>
      JSON.stringify({
        content: "option-a",
        confidence: 0.9,
        needsToolCall: false,
      }),
    );

    orchestrator = new BrainstormOrchestrator(llmCaller, emitEvent);

    const config: SessionConfig = {
      jobId: "job-vote",
      stageId: "stage-vote",
      mode: "vote",
      roles: ["planner", "architect"],
      toolCategories: ["mcp"],
      stageContext: "Pick a deployment strategy.",
      tokenBudget: 50_000,
      toolCallLimit: 20,
    };

    const session = await orchestrator.startSession(config);
    await runToCompletion(session);

    const { payload } = (() => {
      const found = events.find((e) => e.type === "brainstorm.vote.completed");
      expect(found, "expected a brainstorm.vote.completed event").toBeDefined();
      return found as CapturedEvent;
    })();

    expectNonEmptyString(payload, "sessionId");
    expectNonEmptyString(payload, "jobId");
    expectNonEmptyString(payload, "stageId");
    expectNonEmptyString(payload, "winningOption");
    expect(typeof payload.margin).toBe("number");
    expect(typeof payload.isNarrow).toBe("boolean");
    expect(typeof payload.voteCount).toBe("number");
    expect(payload.voteCount as number).toBeGreaterThan(0);
  });
});
