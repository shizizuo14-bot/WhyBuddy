import { describe, expect, it, vi } from "vitest";

import type {
  BrainstormRoleId,
  BrainstormSession,
  CrewMemberInstance,
} from "../../../../shared/blueprint/brainstorm-contracts";
import type { BrainstormReasoningGraph } from "../../../../shared/blueprint/brainstorm-reasoning-graph";
import type { EventEmitterFn } from "./decision-gate";

import {
  BRAINSTORM_REASONING_GRAPH_EVENT,
  emitReasoningGraphArtifact,
} from "./reasoning-graph-emitter";

/**
 * Tests for the reasoning-graph emitter (Task 5).
 *
 * (a) Given a session, the emitter produces a `brainstorm_reasoning_graph`
 *     payload whose `graph` passes the projection's renderability invariant,
 *     and publishes it on the existing brainstorm event channel.
 * (b) When projection throws, the emitter swallows the error and does not throw
 *     (Req 6.1) — it returns null and emits nothing.
 *
 * Requirements: 3.3, 6.1
 */

// ---------------------------------------------------------------------------
// Renderability invariant — mirrors client `isGraphRenderable`
// ---------------------------------------------------------------------------

function isGraphRenderable(graph: BrainstormReasoningGraph): boolean {
  if (!graph.id || !graph.jobId) return false;
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (nodeIds.size === 0) return false;
  return graph.edges.every(
    (edge) => Boolean(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function crewMember(roleId: BrainstormRoleId): CrewMemberInstance {
  return {
    roleId,
    state: "completed",
    iterationCount: 1,
    maxIterations: 3,
    tokenUsage: 50,
  };
}

function makeSession(): BrainstormSession {
  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>([
    ["planner", crewMember("planner")],
    ["architect", crewMember("architect")],
  ]);
  return {
    id: "session-emit-1",
    jobId: "job-emit-1",
    stageId: "spec_docs",
    mode: "discussion",
    crewMembers,
    branchNodes: [
      {
        id: "node-plan",
        sessionId: "session-emit-1",
        parentNodeId: null,
        roleId: "planner",
        type: "thinking",
        status: "completed",
        title: "Plan the approach",
        content: "We should break the work into phases.",
        confidence: 0.8,
        createdAt: new Date(1_000).toISOString(),
        updatedAt: new Date(2_000).toISOString(),
        sequenceNumber: 1,
      },
      {
        id: "node-arch",
        sessionId: "session-emit-1",
        parentNodeId: null,
        roleId: "architect",
        type: "synthesis",
        status: "completed",
        title: "Converge on a design",
        content: "Layered runtime with env-gated companion.",
        confidence: 0.9,
        createdAt: new Date(3_000).toISOString(),
        updatedAt: new Date(4_000).toISOString(),
        sequenceNumber: 2,
      },
    ],
    edges: [],
    status: "completed",
    tokenBudget: 100_000,
    tokenUsed: 1_200,
    toolCallCount: 0,
    toolCallLimit: 20,
    startedAt: new Date(1_000),
    completedAt: new Date(5_000),
    deliberationSummary: {
      roundCount: 1,
      finalConvergenceScore: 0.8,
      consensusAchieved: true,
      totalChallenges: 1,
      unresolvedChallengeCount: 0,
      challenges: [
        {
          challengerRoleId: "architect",
          targetRoleId: "planner",
          summary: "Phasing may delay delivery",
          roundNumber: 1,
        },
      ],
      rebuttals: [],
    },
  };
}

// ---------------------------------------------------------------------------
// (a) Happy path
// ---------------------------------------------------------------------------

describe("emitReasoningGraphArtifact", () => {
  it("produces a brainstorm_reasoning_graph payload whose graph is renderable and emits it", () => {
    const emitEvent: EventEmitterFn & ReturnType<typeof vi.fn> = vi.fn();
    const session = makeSession();

    const payload = emitReasoningGraphArtifact({
      session,
      centralQuestionTitle: "How should we wire the companion runtime?",
      emitEvent,
    });

    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("brainstorm_reasoning_graph");
    expect(payload!.stage).toBe("spec_docs");
    expect(isGraphRenderable(payload!.graph)).toBe(true);
    // Central question is projected as a real node + carried on the payload graph.
    expect(payload!.graph.jobId).toBe("job-emit-1");
    expect(payload!.graph.centralQuestion?.title).toBe(
      "How should we wire the companion runtime?",
    );

    // Published on the existing brainstorm event channel with the artifact payload.
    expect(emitEvent).toHaveBeenCalledTimes(1);
    const [eventType, eventPayload] = emitEvent.mock.calls[0];
    expect(eventType).toBe(BRAINSTORM_REASONING_GRAPH_EVENT);
    expect(eventPayload).toMatchObject({
      jobId: "job-emit-1",
      sessionId: "session-emit-1",
      artifactType: "brainstorm_reasoning_graph",
    });
    expect((eventPayload as { payload: unknown }).payload).toBe(payload);
  });

  // -------------------------------------------------------------------------
  // (a2) Persist sink receives the payload (feed-the-wall durable channel)
  // -------------------------------------------------------------------------

  it("hands the projected payload to the persist sink so it can become a job artifact", () => {
    const emitEvent: EventEmitterFn & ReturnType<typeof vi.fn> = vi.fn();
    const persist = vi.fn();

    const payload = emitReasoningGraphArtifact({
      session: makeSession(),
      centralQuestionTitle: "How should we wire the companion runtime?",
      emitEvent,
      persist,
    });

    expect(payload).not.toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    // Same payload object is emitted as the event AND handed to the sink.
    expect(persist.mock.calls[0][0]).toBe(payload);
    expect(persist.mock.calls[0][0].type).toBe("brainstorm_reasoning_graph");
  });

  it("swallows persist-sink errors and never throws (Req 6.1)", () => {
    const emitEvent: EventEmitterFn & ReturnType<typeof vi.fn> = vi.fn();
    const persist = () => {
      throw new Error("job store write failed");
    };

    expect(() =>
      emitReasoningGraphArtifact({
        session: makeSession(),
        centralQuestionTitle: "anything",
        emitEvent,
        persist,
      }),
    ).not.toThrow();
    // Event still went out before the persist failure.
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // (b) Projection throws → swallowed, never throws, emits nothing
  // -------------------------------------------------------------------------

  it("swallows projection errors, returns null, and does not emit (Req 6.1)", () => {
    const emitEvent: EventEmitterFn & ReturnType<typeof vi.fn> = vi.fn();
    const debug = vi.fn();
    const throwingProjector = () => {
      throw new Error("projection blew up");
    };

    let result: unknown;
    expect(() => {
      result = emitReasoningGraphArtifact({
        session: makeSession(),
        centralQuestionTitle: "anything",
        emitEvent,
        projector: throwingProjector,
        logger: { debug },
      });
    }).not.toThrow();

    expect(result).toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });

  it("swallows emit errors too and never throws", () => {
    const emitEvent: EventEmitterFn = () => {
      throw new Error("event bus down");
    };

    expect(() =>
      emitReasoningGraphArtifact({
        session: makeSession(),
        centralQuestionTitle: "anything",
        emitEvent,
      }),
    ).not.toThrow();
  });
});
