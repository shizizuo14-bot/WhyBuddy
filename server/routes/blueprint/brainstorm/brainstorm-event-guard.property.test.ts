// Feature: autopilot-brainstorm-real-collaboration, Property 9
//
// Property 9: Brainstorm event completeness (jobId + stageId)
//
// For any `brainstorm.*` event the subsystem attempts to emit, the emitted
// payload SHALL contain a non-empty `jobId` AND a non-empty `stageId`; if either
// is missing/empty the event SHALL be skipped (not emitted as a partial event).
//
// This test also asserts the guard's hard guarantee: it NEVER throws, even when
// the underlying `emitEvent` throws (conservative side-channel doctrine).
//
// Validates: Requirements 7.1, 7.2, 7.3
//
// Library: fast-check + Vitest (server config). Minimum 100 iterations.

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import { emitBrainstormEvent } from "./emit-brainstorm-event.js";
import type { EventEmitterFn } from "./decision-gate.js";

/**
 * Mirror of the guard's own non-empty-string predicate. The event is emitted
 * IFF both jobId and stageId satisfy this (string + trimmed length > 0).
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Smart generator for a single jobId/stageId field value. Spans the full
 * documented input space:
 *  - absent (`undefined`)
 *  - `null`
 *  - empty string
 *  - whitespace-only strings (`" "`, `"\t"`, `"\n"`, mixed)
 *  - non-string types (number, boolean, object)
 *  - genuinely non-empty strings (may have surrounding whitespace)
 */
/** Whitespace-only string fragments used to build padding and blank values. */
const whitespaceArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"), { maxLength: 4 })
  .map((parts) => parts.join(""));

const fieldValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(""),
  // Whitespace-only strings (non-empty length, but trim() === "").
  whitespaceArb.filter((s) => s.length > 0),
  fc.integer(),
  fc.boolean(),
  fc.object(),
  // Non-empty strings, optionally padded with whitespace.
  fc
    .tuple(
      whitespaceArb,
      fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
      whitespaceArb,
    )
    .map(([pre, core, post]) => `${pre}${core}${post}`),
);

/** Generator for arbitrary extra payload fields alongside jobId/stageId. */
const extraPayloadArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }).filter((k) => k !== "jobId" && k !== "stageId"),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  { maxKeys: 4 },
);

/** Generator for the `brainstorm.*` event type/name string. */
const eventTypeArb: fc.Arbitrary<string> = fc.constantFrom(
  "brainstorm.challenge.issued",
  "brainstorm.rebuttal.issued",
  "brainstorm.round.completed",
  "brainstorm.vote.completed",
  "brainstorm.node.created",
  "brainstorm.degraded",
);

/**
 * Build a payload from a jobId field value, a stageId field value, and extra
 * fields. The presence vs. absence of jobId/stageId keys is also varied: when a
 * field value is `undefined`, omit the key entirely (true "missing" case);
 * otherwise set the key to the generated value.
 */
function buildPayload(
  jobId: unknown,
  stageId: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...extra };
  if (jobId !== undefined) payload.jobId = jobId;
  if (stageId !== undefined) payload.stageId = stageId;
  return payload;
}

describe("emitBrainstormEvent — Property 9: event completeness (jobId + stageId)", () => {
  it("emits IFF both jobId and stageId are non-empty strings, otherwise skips", () => {
    fc.assert(
      fc.property(
        eventTypeArb,
        fieldValueArb,
        fieldValueArb,
        extraPayloadArb,
        (type, jobId, stageId, extra) => {
          const payload = buildPayload(jobId, stageId, extra);
          const emitEvent = vi.fn<EventEmitterFn>();

          emitBrainstormEvent(emitEvent, type, payload);

          const shouldEmit =
            isNonEmptyString(payload.jobId) && isNonEmptyString(payload.stageId);

          if (shouldEmit) {
            // Emitted exactly once, with the original type and payload intact.
            expect(emitEvent).toHaveBeenCalledTimes(1);
            expect(emitEvent).toHaveBeenCalledWith(type, payload);
          } else {
            // Partial/incomplete payloads are skipped — never emitted.
            expect(emitEvent).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never throws even when the underlying emitEvent throws", () => {
    fc.assert(
      fc.property(
        eventTypeArb,
        fieldValueArb,
        fieldValueArb,
        extraPayloadArb,
        (type, jobId, stageId, extra) => {
          const payload = buildPayload(jobId, stageId, extra);
          const throwingEmit: EventEmitterFn = () => {
            throw new Error("emit boom");
          };

          // The guard must swallow any error from emitEvent.
          expect(() =>
            emitBrainstormEvent(throwingEmit, type, payload),
          ).not.toThrow();
        },
      ),
      { numRuns: 300 },
    );
  });
});
