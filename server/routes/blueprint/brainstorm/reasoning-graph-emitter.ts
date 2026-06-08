/**
 * @description Reasoning-graph emitter — projects a runtime `BrainstormSession`
 * into the shared `BrainstormReasoningGraph` contract and publishes it on the
 * EXISTING `brainstorm_reasoning_graph` artifact channel so the 3D blueprint
 * wall (`BlueprintWallTexture` structured-graph path) can consume it.
 *
 * Channel reuse (no new artifact type):
 *  - The emitted payload is the SAME `BrainstormReasoningGraphArtifactPayload`
 *    (`{ type: "brainstorm_reasoning_graph", stage, subStage?, graph }`) already
 *    parsed by `brainstorm-reasoning-graph-payload.ts` and read on the client by
 *    `extractBrainstormReasoningGraphs` / `readBrainstormReasoningGraphPayload`.
 *  - It is published through the brainstorm subsystem's existing
 *    `EventEmitterFn` (family `brainstorm` once adapted), not a bespoke channel.
 *
 * Hard guarantee (Req 6.1): this helper NEVER throws. Projection and emit are
 * wrapped in a single try/catch — any failure is logged at debug level and
 * swallowed so the brainstorm session / pipeline job is never affected. The wall
 * simply keeps its previous frame when a projection is skipped.
 *
 * @see .kiro/specs/autopilot-brainstorm-companion-runtime/design.md §3
 * Requirements: 3.3, 6.1
 */

import type { BrainstormSession } from "../../../../shared/blueprint/brainstorm-contracts";
import type {
  BrainstormReasoningGraph,
  BrainstormReasoningGraphArtifactPayload,
  BrainstormReasoningGraphStage,
} from "../../../../shared/blueprint/brainstorm-reasoning-graph";

import type { EventEmitterFn } from "./decision-gate";
import { projectSessionToReasoningGraph } from "./reasoning-graph-projection";

/**
 * Event type used to push a freshly projected reasoning graph onto the wall.
 * Stays inside the existing `brainstorm` event family (the event-emitter
 * adapter tags `family: "brainstorm"` for every brainstorm event).
 */
export const BRAINSTORM_REASONING_GRAPH_EVENT = "brainstorm.reasoning_graph.projected";

/** Injectable projector signature (mirrors `projectSessionToReasoningGraph`). */
export type ReasoningGraphProjector = (
  session: BrainstormSession,
  centralQuestionTitle: string,
) => BrainstormReasoningGraph;

export interface EmitReasoningGraphInput {
  /** The runtime brainstorm session to project. */
  session: BrainstormSession;
  /** Central question = the stage description / question for this session. */
  centralQuestionTitle: string;
  /** Existing brainstorm event channel. */
  emitEvent: EventEmitterFn;
  /**
   * Override the artifact `stage`. Defaults to the projected graph's stage
   * (`spec_documents`).
   */
  stage?: BrainstormReasoningGraphStage;
  /** Injectable projector — defaults to {@link projectSessionToReasoningGraph}. */
  projector?: ReasoningGraphProjector;
  /**
   * Optional persistence sink. When provided, the freshly projected payload is
   * handed to it AFTER the event is emitted, so the caller can durably append a
   * `brainstorm_reasoning_graph` artifact onto the job (the channel the client
   * `readBrainstormReasoningGraphs(job)` actually reads). The call is wrapped in
   * the same never-throw guard (Req 6.1) — a persist failure is swallowed and
   * must not affect the session / job.
   */
  persist?: (payload: BrainstormReasoningGraphArtifactPayload) => void;
  /** Optional debug logger; failures are swallowed regardless. */
  logger?: { debug?: (msg: string, meta?: Record<string, unknown>) => void };
}

/**
 * Project the session and publish a `brainstorm_reasoning_graph` artifact
 * payload on the existing event channel.
 *
 * @returns the emitted artifact payload, or `null` when projection/emit failed
 *          (failure is swallowed — callers must not depend on a non-null result).
 */
export function emitReasoningGraphArtifact(
  input: EmitReasoningGraphInput,
): BrainstormReasoningGraphArtifactPayload | null {
  try {
    const project = input.projector ?? projectSessionToReasoningGraph;
    const graph = project(input.session, input.centralQuestionTitle);

    const payload: BrainstormReasoningGraphArtifactPayload = {
      type: "brainstorm_reasoning_graph",
      stage: input.stage ?? graph.stage,
      subStage: graph.subStage,
      graph,
    };

    input.emitEvent(BRAINSTORM_REASONING_GRAPH_EVENT, {
      jobId: graph.jobId,
      stageId: input.session.stageId,
      sessionId: input.session.id,
      artifactType: "brainstorm_reasoning_graph",
      payload,
    });

    // Durable sink (close the "feed-the-wall" gap): the event above is
    // ephemeral, but the client reads persisted job artifacts. When a persist
    // sink is wired, append the SAME payload as a `brainstorm_reasoning_graph`
    // artifact so `readBrainstormReasoningGraphs(job)` can render it on the 3D
    // wall. Inside the never-throw guard (Req 6.1).
    input.persist?.(payload);

    return payload;
  } catch (err) {
    // Req 6.1: never affect the job — log at debug level and continue.
    input.logger?.debug?.(
      `[brainstorm] reasoning-graph projection/emit skipped: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { sessionId: safeSessionId(input.session) },
    );
    return null;
  }
}

function safeSessionId(session: BrainstormSession): string | undefined {
  try {
    return typeof session?.id === "string" ? session.id : undefined;
  } catch {
    return undefined;
  }
}
