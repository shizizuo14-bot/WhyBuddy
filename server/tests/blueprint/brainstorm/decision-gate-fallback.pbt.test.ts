/**
 * Property-Based Test: Decision Gate Failure Fallback (Property 3)
 *
 * **Validates: Requirements 1.6, 10.4**
 *
 * Property 3: Decision Gate failure fallback
 * For any error thrown during Decision Gate LLM invocation (timeout, network error,
 * parse error, or any exception), the orchestrator SHALL fall back to single-agent
 * execution and emit a `brainstorm.degraded` event.
 *
 * This property must hold for ALL types of errors — no error should ever cause
 * the system to hang or throw unhandled.
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

import {
  createDecisionGate,
  FALLBACK_OUTPUT,
  type DecisionGateLlmCaller,
  type DecisionGateEventEmitter,
} from "../../../routes/blueprint/brainstorm/decision-gate.js";
import type { DecisionGateInput } from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { BlueprintGenerationEvent } from "../../../../shared/blueprint/contracts.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate arbitrary DecisionGateInput values. */
const arbDecisionGateInput: fc.Arbitrary<DecisionGateInput> = fc.record({
  jobId: fc.string({ minLength: 1, maxLength: 40 }).map(
    (s) => `job_${s.replace(/[^a-zA-Z0-9_-]/g, "x")}`,
  ),
  stageId: fc.string({ minLength: 1, maxLength: 20 }).map(
    (s) => `stage_${s.replace(/[^a-zA-Z0-9_-]/g, "x")}`,
  ),
  stageContext: fc.string({ minLength: 1, maxLength: 200 }),
  degradedBridges: fc.constant([]), // No degraded bridges for this test — we test LLM errors
  previousStageOutputs: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
    { nil: undefined },
  ),
});

/**
 * Generate arbitrary error types that could occur during LLM invocation.
 * Covers: timeout (AbortError), network errors, parse errors, and generic exceptions.
 */
const arbErrorFactory: fc.Arbitrary<{ name: string; factory: () => Error }> = fc.oneof(
  // Timeout / AbortError
  fc.constant({
    name: "AbortError (timeout)",
    factory: () => {
      const e = new DOMException("The operation was aborted", "AbortError");
      return e;
    },
  }),
  // Network error variants
  fc.string({ minLength: 1, maxLength: 50 }).map((msg) => ({
    name: "NetworkError",
    factory: () => {
      const e = new Error(`Network error: ${msg}`);
      e.name = "NetworkError";
      return e;
    },
  })),
  // TypeError (common for fetch failures)
  fc.string({ minLength: 1, maxLength: 50 }).map((msg) => ({
    name: "TypeError (fetch)",
    factory: () => new TypeError(`fetch failed: ${msg}`),
  })),
  // JSON parse error
  fc.string({ minLength: 1, maxLength: 100 }).map((badJson) => ({
    name: "SyntaxError (parse)",
    factory: () => new SyntaxError(`Unexpected token in JSON at position 0: ${badJson}`),
  })),
  // Validation error (invalid schema from LLM)
  fc.string({ minLength: 1, maxLength: 80 }).map((detail) => ({
    name: "ValidationError",
    factory: () => new Error(`Invalid DecisionGateOutput: ${detail}`),
  })),
  // Generic unknown error
  fc.string({ minLength: 1, maxLength: 60 }).map((msg) => ({
    name: "GenericError",
    factory: () => new Error(msg),
  })),
  // RangeError
  fc.constant({
    name: "RangeError",
    factory: () => new RangeError("Maximum call stack size exceeded"),
  }),
  // EvalError (exotic but possible)
  fc.constant({
    name: "EvalError",
    factory: () => new EvalError("Unexpected eval error"),
  }),
);

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe("Property 3: Decision Gate failure fallback", () => {
  /**
   * **Validates: Requirements 1.6, 10.4**
   *
   * For ANY error thrown during LLM invocation, the Decision Gate:
   * 1. Returns { brainstormNeeded: false } (single-agent fallback)
   * 2. Emits a `brainstorm.degraded` event
   * 3. Never throws an unhandled exception
   * 4. Never hangs (completes in bounded time)
   */
  it("for any error during LLM invocation, returns fallback and emits degraded event", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDecisionGateInput,
        arbErrorFactory,
        async (input, errorDef) => {
          const emittedEvents: BlueprintGenerationEvent[] = [];

          // Mock LLM caller that always throws the generated error
          const llmCaller: DecisionGateLlmCaller = {
            invoke: vi.fn().mockImplementation(async () => {
              throw errorDef.factory();
            }),
          };

          // Mock event emitter that captures emitted events
          const eventEmitter: DecisionGateEventEmitter = {
            emit: vi.fn().mockImplementation((event: BlueprintGenerationEvent) => {
              emittedEvents.push(event);
            }),
          };

          const gate = createDecisionGate({
            llmCaller,
            eventEmitter,
            timeoutMs: 5000,
          });

          // The decide() call must NOT throw — it must always return gracefully
          const result = await gate.decide(input);

          // 1. Must return fallback (brainstormNeeded: false)
          expect(result.brainstormNeeded).toBe(false);
          expect(result).toEqual(FALLBACK_OUTPUT);

          // 2. Must emit a brainstorm.degraded event
          expect(emittedEvents.length).toBe(1);
          const degradedEvent = emittedEvents[0];
          expect(degradedEvent.type).toBe("brainstorm.degraded");
          expect(degradedEvent.family).toBe("brainstorm");
          expect(degradedEvent.jobId).toBe(input.jobId);
          expect(degradedEvent.message).toContain("Decision Gate degraded");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Additional sub-property: LLM returning invalid JSON triggers fallback.
   * This tests the parse-error path specifically with malformed responses.
   */
  it("for any malformed LLM response, returns fallback and emits degraded event", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDecisionGateInput,
        fc.oneof(
          // Completely random strings (unlikely valid JSON)
          fc.string({ minLength: 1, maxLength: 200 }),
          // Valid JSON but wrong schema
          fc.json().map((j) => JSON.stringify(j)),
          // Partial JSON
          fc.constant('{ "brainstormNeeded": true, "recommendedMode":'),
          // Empty string
          fc.constant(""),
          // HTML response (common API error)
          fc.constant("<html><body>503 Service Unavailable</body></html>"),
        ),
        async (input, malformedResponse) => {
          const emittedEvents: BlueprintGenerationEvent[] = [];

          const llmCaller: DecisionGateLlmCaller = {
            invoke: vi.fn().mockResolvedValue(malformedResponse),
          };

          const eventEmitter: DecisionGateEventEmitter = {
            emit: vi.fn().mockImplementation((event: BlueprintGenerationEvent) => {
              emittedEvents.push(event);
            }),
          };

          const gate = createDecisionGate({
            llmCaller,
            eventEmitter,
            timeoutMs: 5000,
          });

          const result = await gate.decide(input);

          // Must return fallback
          expect(result.brainstormNeeded).toBe(false);
          expect(result).toEqual(FALLBACK_OUTPUT);

          // Must emit degraded event
          expect(emittedEvents.length).toBe(1);
          expect(emittedEvents[0].type).toBe("brainstorm.degraded");
          expect(emittedEvents[0].jobId).toBe(input.jobId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
