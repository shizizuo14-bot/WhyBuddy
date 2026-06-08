/**
 * emit-brainstorm-event.ts — jobId/stageId guard wrapper for brainstorm events.
 *
 * Every `brainstorm.*` event payload MUST carry a non-empty `jobId` AND a
 * non-empty `stageId` (Req 7.1, 7.2). This guard centralizes that invariant: if
 * either field is missing/empty, the event is SKIPPED rather than emitted as a
 * partial event (Req 7.3), and the reason is recorded at debug level via an
 * optional logger.
 *
 * This is the guard that prevents the historical "node.created without jobId
 * silently dropped by the client" regression.
 *
 * Hard guarantee: this helper NEVER throws. A throwing `emitEvent` or logger is
 * caught and swallowed so the brainstorm session / pipeline job is never
 * affected (conservative side-channel doctrine).
 */

import type { EventEmitterFn } from "./decision-gate";

/** Optional debug logger; failures are swallowed regardless of logging. */
export interface EmitBrainstormEventLogger {
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Returns `true` when `value` is a non-empty string after trimming whitespace.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Emit a `brainstorm.*` event only when its payload carries both a non-empty
 * `jobId` and a non-empty `stageId`. Otherwise the event is skipped (not emitted
 * as a partial event) and the reason is logged at debug level.
 *
 * Never throws.
 *
 * @param emitEvent - The underlying brainstorm event emitter.
 * @param type - The `brainstorm.*` event type/name.
 * @param payload - The event payload; must contain non-empty `jobId`/`stageId`.
 * @param logger - Optional debug logger for skip-reason observability.
 */
export function emitBrainstormEvent(
  emitEvent: EventEmitterFn,
  type: string,
  payload: Record<string, unknown>,
  logger?: EmitBrainstormEventLogger,
): void {
  try {
    const hasJobId = isNonEmptyString(payload?.jobId);
    const hasStageId = isNonEmptyString(payload?.stageId);

    if (!hasJobId || !hasStageId) {
      const missing: string[] = [];
      if (!hasJobId) missing.push("jobId");
      if (!hasStageId) missing.push("stageId");

      logger?.debug?.(
        `[brainstorm] skipped event "${type}" — missing non-empty ${missing.join(
          " and ",
        )}`,
        { type },
      );
      return;
    }

    emitEvent(type, payload);
  } catch (error) {
    // Conservative side-channel: never let a faulty emit/logger break the job.
    logger?.debug?.(
      `[brainstorm] emit guard swallowed error for event "${type}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { type },
    );
  }
}
