/**
 * SlideRule V5.1 — session replay log (JOB→REPLAY→STORE, per sessionId).
 * Append-only events derived from authoritative STATE deltas on each durable save.
 */

import type { V5SessionState } from "./v5-reasoning-state.js";

export type SlideRuleReplayEventKind = "capability_run" | "conversation" | "decision";

export interface SlideRuleReplayEvent {
  id: string;
  sessionId: string;
  at: string;
  kind: SlideRuleReplayEventKind;
  turnId?: string;
  capabilityId?: string;
  capabilityRunId?: string;
  conversationId?: string;
  decisionId?: string;
}

function resolveSessionId(state: V5SessionState): string {
  return state.sessionId || "sliderule-local-proto";
}

/** Collect new replay events by diffing previous persisted STATE against the next save. */
export function collectReplayDelta(
  previous: V5SessionState | undefined,
  next: V5SessionState
): SlideRuleReplayEvent[] {
  const sessionId = resolveSessionId(next);
  const at = new Date().toISOString();

  const prevRunIds = new Set((previous?.capabilityRuns || []).map((r) => r.id));
  const prevConvIds = new Set((previous?.conversation || []).map((c) => c.id));
  const prevDecisionIds = new Set((previous?.decisionLedger || []).map((d) => d.id));

  const events: SlideRuleReplayEvent[] = [];

  for (const run of next.capabilityRuns || []) {
    if (prevRunIds.has(run.id)) continue;
    events.push({
      id: `replay-run-${run.id}`,
      sessionId,
      at,
      kind: "capability_run",
      turnId: run.turnId,
      capabilityId: run.capabilityId,
      capabilityRunId: run.id,
    });
  }

  for (const conv of next.conversation || []) {
    if (prevConvIds.has(conv.id)) continue;
    events.push({
      id: `replay-conv-${conv.id}`,
      sessionId,
      at,
      kind: "conversation",
      conversationId: conv.id,
    });
  }

  for (const dec of next.decisionLedger || []) {
    if (prevDecisionIds.has(dec.id)) continue;
    events.push({
      id: `replay-dec-${dec.id}`,
      sessionId,
      at,
      kind: "decision",
      turnId: dec.turnId,
      decisionId: dec.id,
    });
  }

  return events;
}

/** Merge replay delta into durable STATE before JOB persist (REPLAY→STORE). */
export function applyReplayOnSave(
  previous: V5SessionState | undefined,
  next: V5SessionState
): V5SessionState {
  const priorLog = previous?.sessionReplayLog ?? [];
  const delta = collectReplayDelta(previous, next);
  return {
    ...next,
    sessionReplayLog: [...priorLog, ...delta],
  };
}

/** JOB→REPLAY: list events scoped to the session's own sessionId. */
export function replaySessionEvents(state: V5SessionState): SlideRuleReplayEvent[] {
  const sid = resolveSessionId(state);
  return (state.sessionReplayLog || []).filter((e) => e.sessionId === sid);
}

/** True when every event belongs to the requested session (isolation guard). */
export function replayEventsBelongToSession(
  events: SlideRuleReplayEvent[],
  sessionId: string
): boolean {
  return events.every((e) => e.sessionId === sessionId);
}