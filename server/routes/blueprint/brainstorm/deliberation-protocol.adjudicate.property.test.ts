// Feature: autopilot-brainstorm-real-collaboration, Property 4: Convergence score is clamped to [0, 1]

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { createAdjudicator } from "./adjudicator";
import type { LLMCallerFn } from "./orchestrator";
import type {
  BrainstormRoleId,
  Critique,
  Rebuttal,
} from "../../../../shared/blueprint/brainstorm-contracts";

/**
 * Property 4 — Convergence score is clamped to [0, 1] (Task 4.2).
 *
 * For ANY adjudicator / primary-caller output — including NaN, ±Infinity,
 * out-of-range numbers, non-numeric values, completely arbitrary strings, and
 * unparseable JSON — the resulting `AdjudicationResult.convergenceScore` MUST
 * lie within the closed interval [0, 1].
 *
 * Also exercises the never-throw fallback (Requirement 3.6): when the primary
 * caller rejects/throws, the adjudicator resolves to a conservative
 * `consensusReached=false` verdict instead of propagating the error.
 *
 * The primary caller is a fully-injected fake `LLMCallerFn` returning arbitrary
 * strings / JSON (or throwing). No real network is involved.
 *
 * Validates: Requirements 3.2
 */

const ROLE_IDS: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

const roleIdArb = fc.constantFrom(...ROLE_IDS);

const critiqueArb: fc.Arbitrary<Critique> = fc.record({
  id: fc.uuid(),
  challengerRoleId: roleIdArb,
  targetRoleId: roleIdArb,
  targetClaim: fc.string(),
  critique: fc.string(),
  severity: fc.constantFrom("low", "medium", "high") as fc.Arbitrary<
    Critique["severity"]
  >,
  roundNumber: fc.integer({ min: 1, max: 5 }),
  resolved: fc.boolean(),
});

const rebuttalArb: fc.Arbitrary<Rebuttal> = fc.record({
  id: fc.uuid(),
  responderRoleId: roleIdArb,
  challengeId: fc.uuid(),
  rebuttal: fc.string(),
  stance: fc.constantFrom("concede", "defend") as fc.Arbitrary<
    Rebuttal["stance"]
  >,
  roundNumber: fc.integer({ min: 1, max: 5 }),
});

/**
 * Tokens spliced verbatim into the `convergenceScore` JSON position. Covers:
 *  - in-range and out-of-range finite numbers (`0.5`, `2`, `-5`, `1000`)
 *  - literal `1e999` / `-1e999` which JSON.parse resolves to ±Infinity
 *  - literal `NaN` / `Infinity` / `-Infinity` (invalid JSON → parser rejects)
 *  - non-numeric JSON values (`"high"`, `null`, `true`, `[]`, `{}`)
 */
const scoreTokenArb = fc.oneof(
  fc.double().map((n) => String(n)), // includes NaN / ±Infinity / huge / tiny
  fc.integer().map((n) => String(n)),
  fc.constantFrom(
    "NaN",
    "Infinity",
    "-Infinity",
    "1e999",
    "-1e999",
    "2",
    "-5",
    "0.5",
    "1000",
    "-0.0001",
    '"high"',
    "null",
    "true",
    "[]",
    "{}",
  ),
);

/**
 * Arbitrary raw response the fake primary caller will return. Spans
 * well-formed JSON with adversarial score tokens, JSON wrapped in prose /
 * code fences, and completely arbitrary (often unparseable) strings.
 */
const rawResponseArb = fc.oneof(
  // Structured JSON with an adversarial convergenceScore token.
  fc
    .record({
      consensus: fc.boolean(),
      scoreToken: scoreTokenArb,
      rationale: fc.string(),
    })
    .map(
      ({ consensus, scoreToken, rationale }) =>
        `{"consensusReached": ${consensus}, "convergenceScore": ${scoreToken}, "unresolvedCritiqueIds": [], "rationale": ${JSON.stringify(
          rationale,
        )}}`,
    ),
  // JSON buried inside prose / code fences (lenient extraction path).
  scoreTokenArb.map(
    (scoreToken) =>
      "Here is my verdict:\n```json\n" +
      `{"convergenceScore": ${scoreToken}, "consensusReached": true}` +
      "\n```\nDone.",
  ),
  // Completely arbitrary string (frequently unparseable JSON).
  fc.string(),
  fc.constantFrom("", "   ", "not json at all", "{ broken", "null", "[1,2,3]"),
);

describe("createAdjudicator — Property 4: convergence score clamped to [0, 1]", () => {
  it("keeps convergenceScore within [0, 1] for ANY primary-caller output", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(critiqueArb, { maxLength: 6 }),
        fc.array(rebuttalArb, { maxLength: 6 }),
        fc.integer({ min: 1, max: 5 }),
        rawResponseArb,
        async (critiques, rebuttals, roundNumber, raw) => {
          const primaryCaller: LLMCallerFn = async () => raw;
          const adjudicate = createAdjudicator(primaryCaller);

          const result = await adjudicate({ critiques, rebuttals, roundNumber });

          expect(typeof result.convergenceScore).toBe("number");
          expect(Number.isNaN(result.convergenceScore)).toBe(false);
          expect(result.convergenceScore).toBeGreaterThanOrEqual(0);
          expect(result.convergenceScore).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never throws and falls back to consensusReached=false when the caller fails", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(critiqueArb, { maxLength: 6 }),
        fc.array(rebuttalArb, { maxLength: 6 }),
        fc.integer({ min: 1, max: 5 }),
        fc.string(),
        async (critiques, rebuttals, roundNumber, message) => {
          const primaryCaller: LLMCallerFn = async () => {
            throw new Error(message);
          };
          const adjudicate = createAdjudicator(primaryCaller);

          // Must resolve (never reject) ...
          const result = await adjudicate({ critiques, rebuttals, roundNumber });

          // ... with a conservative no-consensus verdict and clamped score.
          expect(result.consensusReached).toBe(false);
          expect(result.convergenceScore).toBe(0);
          expect(result.convergenceScore).toBeGreaterThanOrEqual(0);
          expect(result.convergenceScore).toBeLessThanOrEqual(1);
          // Every critique is retained as unresolved on failure.
          expect(result.unresolvedCritiqueIds).toHaveLength(critiques.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("clamps a synchronous (non-promise-rejection) failure path too", async () => {
    // Primary caller resolves with an unparseable response: parser returns null
    // → conservative verdict, score clamped to the lower boundary.
    const primaryCaller: LLMCallerFn = async () => "<<<garbage>>>";
    const adjudicate = createAdjudicator(primaryCaller);

    const result = await adjudicate({
      critiques: [],
      rebuttals: [],
      roundNumber: 1,
    });

    expect(result.consensusReached).toBe(false);
    expect(result.convergenceScore).toBe(0);
  });
});
