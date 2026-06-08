// Feature: autopilot-brainstorm-real-collaboration, Property 1
// Feature: autopilot-brainstorm-real-collaboration, Property 11
//
// Property-based tests for the structured Critique / Rebuttal parsers in
// `deliberation-protocol.ts`.
//
// P1  (Structured parse validation enforces closed value sets):
//     For ANY raw LLM string + arbitrary severity/stance values, the parsers
//     return either `null` OR a structurally valid object whose `severity`
//     ∈ {low,medium,high} (Critique) / `stance` ∈ {concede,defend} (Rebuttal)
//     — never an out-of-set value.
//     Validates: Requirements 1.2, 2.3
//
// P11 (Critique targets the target role's claim):
//     For any generated member outputs + critique context, the produced
//     Critique's `targetClaim` is drawn from the context (the TARGET role's own
//     round output), never invented by the parser / never the challenger text.
//     Validates: Requirements 1.3

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type {
  BrainstormRoleId,
  CritiqueSeverity,
  RebuttalStance,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import {
  parseCritique,
  parseRebuttal,
  type ParseCritiqueContext,
  type ParseRebuttalContext,
} from "./deliberation-protocol.js";

const ROLE_IDS: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

// The closed value sets the parsers must enforce. Inlined here (the parser's
// internal constants are module-private) so the test independently pins them.
const VALID_SEVERITIES: readonly CritiqueSeverity[] = ["low", "medium", "high"];
const VALID_STANCES: readonly RebuttalStance[] = ["concede", "defend"];

/** Maps any string into a guaranteed non-blank string (for claim/body text). */
function ensureNonBlank(s: string, fallbackSeed: number): string {
  return s.trim() === "" ? `claim-${fallbackSeed}-${s.length}` : s;
}

// --- shared raw-string arbitraries ----------------------------------------

/** Candidate `severity` values: in-set, out-of-set strings, and non-strings. */
const arbSeverityCandidate = fc.oneof(
  fc.constantFrom("low", "medium", "high"),
  fc.constantFrom("critical", "severe", "minor", "LOW", "High", "none", ""),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

/** Candidate `stance` values: in-set, out-of-set strings, and non-strings. */
const arbStanceCandidate = fc.oneof(
  fc.constantFrom("concede", "defend"),
  fc.constantFrom("agree", "reject", "CONCEDE", "Defend", "neutral", ""),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

/** Wrap a JSON string in plain / code-fence / prose envelopes (as models do). */
function arbWrapped(jsonArb: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(jsonArb, fc.constantFrom("plain", "fence", "prose"))
    .map(([json, mode]) => {
      if (mode === "fence") return "```json\n" + json + "\n```";
      if (mode === "prose") return "Here is my response:\n" + json + "\nThanks.";
      return json;
    });
}

const arbCritiqueJson = fc
  .record(
    {
      critique: fc.option(fc.string({ maxLength: 120 }), { nil: undefined }),
      severity: fc.option(arbSeverityCandidate, { nil: undefined }),
    },
    { requiredKeys: [] },
  )
  .map((obj) => JSON.stringify(obj));

const arbCritiqueRaw = fc.oneof(
  arbWrapped(arbCritiqueJson),
  fc.string(),
  fc.constant("this is not json at all"),
  fc.constant("{ broken json"),
);

const arbRebuttalJson = fc
  .record(
    {
      rebuttal: fc.option(fc.string({ maxLength: 120 }), { nil: undefined }),
      stance: fc.option(arbStanceCandidate, { nil: undefined }),
    },
    { requiredKeys: [] },
  )
  .map((obj) => JSON.stringify(obj));

const arbRebuttalRaw = fc.oneof(
  arbWrapped(arbRebuttalJson),
  fc.string(),
  fc.constant("no structured payload here"),
  fc.constant("{ also broken"),
);

const arbCritiqueContext: fc.Arbitrary<ParseCritiqueContext> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 24 }),
  challengerRoleId: fc.constantFrom(...ROLE_IDS),
  targetRoleId: fc.constantFrom(...ROLE_IDS),
  // Arbitrary (incl. blank) so the null branch is also exercised.
  targetClaim: fc.string({ maxLength: 80 }),
  roundNumber: fc.integer({ min: 0, max: 20 }),
});

const arbRebuttalContext: fc.Arbitrary<ParseRebuttalContext> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 24 }),
  responderRoleId: fc.constantFrom(...ROLE_IDS),
  challengeId: fc.string({ minLength: 1, maxLength: 24 }),
  roundNumber: fc.integer({ min: 0, max: 20 }),
});

// Feature: autopilot-brainstorm-real-collaboration, Property 1
describe("Feature: autopilot-brainstorm-real-collaboration, Property 1", () => {
  it("parseCritique returns null or a valid object with severity in {low,medium,high}", () => {
    fc.assert(
      fc.property(arbCritiqueRaw, arbCritiqueContext, (raw, context) => {
        const result = parseCritique(raw, context);
        if (result === null) return; // allowed outcome

        // Closed value set: severity is never out-of-set.
        expect(VALID_SEVERITIES).toContain(result.severity);

        // Structural validity of the produced object.
        expect(typeof result.id).toBe("string");
        expect(result.id.length).toBeGreaterThan(0);
        expect(ROLE_IDS).toContain(result.challengerRoleId);
        expect(ROLE_IDS).toContain(result.targetRoleId);
        expect(typeof result.targetClaim).toBe("string");
        expect(result.targetClaim.length).toBeGreaterThan(0);
        expect(typeof result.critique).toBe("string");
        expect(result.critique.length).toBeGreaterThan(0);
        expect(typeof result.roundNumber).toBe("number");
        expect(result.resolved).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("parseRebuttal returns null or a valid object with stance in {concede,defend}", () => {
    fc.assert(
      fc.property(arbRebuttalRaw, arbRebuttalContext, (raw, context) => {
        const result = parseRebuttal(raw, context);
        if (result === null) return; // allowed outcome

        // Closed value set: stance is never out-of-set.
        expect(VALID_STANCES).toContain(result.stance);

        // Structural validity of the produced object.
        expect(typeof result.id).toBe("string");
        expect(result.id.length).toBeGreaterThan(0);
        expect(ROLE_IDS).toContain(result.responderRoleId);
        expect(result.challengeId).toBe(context.challengeId);
        expect(typeof result.rebuttal).toBe("string");
        expect(result.rebuttal.length).toBeGreaterThan(0);
        expect(typeof result.roundNumber).toBe("number");
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: autopilot-brainstorm-real-collaboration, Property 11
describe("Feature: autopilot-brainstorm-real-collaboration, Property 11", () => {
  it("produced Critique.targetClaim is drawn from the target role's claim, never the challenger text", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLE_IDS), // challenger role
        fc.constantFrom(...ROLE_IDS), // target role
        // The target role's OWN round output text (source of truth).
        fc.string({ maxLength: 80 }),
        fc.integer({ min: 0, max: 9999 }),
        // The challenger's text, adversarially injected into the raw response.
        fc.string({ maxLength: 80 }),
        fc.constantFrom<CritiqueSeverity>("low", "medium", "high"),
        fc.string({ minLength: 1, maxLength: 80 }),
        fc.integer({ min: 0, max: 9999 }),
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.integer({ min: 0, max: 20 }),
        (
          challenger,
          target,
          targetOutputText,
          targetSeed,
          challengerText,
          severity,
          critiqueSeed,
          critiqueBodySeed,
          id,
          roundNumber,
        ) => {
          // targetClaim is sourced from the target role's own round output.
          const targetClaim = ensureNonBlank(targetOutputText, targetSeed);
          const critiqueBody = ensureNonBlank(`${critiqueSeed}`, critiqueBodySeed);

          // Adversarial raw: the model tries to dictate the target claim using
          // the challenger's own text. The parser must IGNORE these fields and
          // use the engine-supplied context instead.
          const raw = JSON.stringify({
            critique: critiqueBody,
            severity,
            targetClaim: challengerText,
            targetRoleId: challenger,
            challengerRoleId: target,
          });

          const context: ParseCritiqueContext = {
            id,
            challengerRoleId: challenger,
            targetRoleId: target,
            targetClaim,
            roundNumber,
          };

          const result = parseCritique(raw, context);
          if (result === null) return; // allowed outcome

          // targetClaim comes from the context (the target's own output text).
          expect(result.targetClaim).toBe(targetClaim.trim());
          // identity fields come from context, not the raw response.
          expect(result.targetRoleId).toBe(target);
          expect(result.challengerRoleId).toBe(challenger);

          // It is never the challenger-injected text (when they differ).
          if (challengerText.trim() !== targetClaim.trim()) {
            expect(result.targetClaim).not.toBe(challengerText);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
