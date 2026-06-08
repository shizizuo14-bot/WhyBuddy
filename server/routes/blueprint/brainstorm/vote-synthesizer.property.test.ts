// Feature: autopilot-brainstorm-real-collaboration, Property 6
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  computeVoteResult,
  NARROW_MARGIN_THRESHOLD,
} from "./vote-synthesizer.js";
import type {
  BrainstormRoleId,
  StructuredVote,
} from "../../../../shared/blueprint/brainstorm-contracts.js";

const roleArb: fc.Arbitrary<BrainstormRoleId> = fc.constantFrom(
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
);

// Confidence values include out-of-range, NaN and ±Infinity to stress the
// clamp-to-[0,1] behaviour the weighted score relies on.
const confidenceArb: fc.Arbitrary<number> = fc.oneof(
  fc.float({ min: 0, max: 1, noNaN: true }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.5, 1.5, 2, -1, 0, 1),
);

const optionArb = fc.constantFrom("A", "B", "C", "D", "E");

const validVoteArb: fc.Arbitrary<StructuredVote> = fc.record({
  roleId: roleArb,
  chosenOption: optionArb,
  confidence: confidenceArb,
  reasoning: fc.string({ maxLength: 80 }),
});

// Invalid entries: null / undefined whole votes, empty/whitespace
// chosenOption, and non-string chosenOption. computeVoteResult must ignore
// every one of these.
const invalidVoteArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.record({
    roleId: roleArb,
    chosenOption: fc.constantFrom("", "   ", "\n\t "),
    confidence: confidenceArb,
    reasoning: fc.string({ maxLength: 40 }),
  }),
  fc.record({
    roleId: roleArb,
    chosenOption: fc.oneof(fc.integer(), fc.constant(null), fc.boolean()),
    confidence: confidenceArb,
    reasoning: fc.string({ maxLength: 40 }),
  }),
);

const mixedVotesArb: fc.Arbitrary<readonly StructuredVote[]> = fc
  .array(fc.oneof(validVoteArb, invalidVoteArb), { maxLength: 24 })
  // The production signature is StructuredVote[]; the property deliberately
  // feeds invalid shapes to assert they are filtered out, so we cast.
  .map((entries) => entries as unknown as readonly StructuredVote[]);

// Oracle mirrors the source's clamp + validity rules exactly.
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isValidVote(vote: unknown): vote is StructuredVote {
  return (
    vote != null &&
    typeof (vote as StructuredVote).chosenOption === "string" &&
    (vote as StructuredVote).chosenOption.trim().length > 0
  );
}

describe("Feature: autopilot-brainstorm-real-collaboration, Property 6", () => {
  it("computes confidence-weighted majority, margin/narrowness, ignores invalid votes, never throws", () => {
    fc.assert(
      fc.property(mixedVotesArb, (votes) => {
        const result = computeVoteResult(votes);

        // --- Oracle: replicate the valid-vote filter + weighted tally ---
        const validVotes = (votes as readonly unknown[]).filter(isValidVote);

        const scores = new Map<string, number>();
        for (const vote of validVotes) {
          scores.set(
            vote.chosenOption,
            (scores.get(vote.chosenOption) ?? 0) + clamp01(vote.confidence),
          );
        }
        const sorted = [...scores.entries()].sort((left, right) => {
          const delta = right[1] - left[1];
          return delta !== 0 ? delta : left[0].localeCompare(right[0]);
        });

        const [expectedWinning, expectedWinningScore] = sorted[0] ?? ["", 0];
        const expectedSecond = sorted[1] ?? null;
        const expectedSecondScore = expectedSecond?.[1] ?? 0;
        const expectedMargin = expectedWinningScore - expectedSecondScore;

        // Invalid votes ignored: result only carries valid votes.
        expect(result.votes.length).toBe(validVotes.length);
        for (const vote of result.votes) {
          expect(typeof vote.chosenOption).toBe("string");
          expect(vote.chosenOption.trim().length).toBeGreaterThan(0);
        }

        // Zero valid votes => noValidVotes flag true.
        expect(result.noValidVotes).toBe(validVotes.length === 0);

        // winningOption = max confidence-weighted score over valid votes.
        expect(result.winningOption).toBe(expectedWinning);
        expect(result.winningScore).toBeCloseTo(expectedWinningScore, 10);
        expect(result.secondPlaceOption).toBe(expectedSecond?.[0] ?? null);
        expect(result.secondPlaceScore).toBeCloseTo(expectedSecondScore, 10);

        // margin = winning - second.
        expect(result.margin).toBeCloseTo(expectedMargin, 10);

        // isNarrow = margin < NARROW_MARGIN_THRESHOLD.
        expect(result.isNarrow).toBe(expectedMargin < NARROW_MARGIN_THRESHOLD);
      }),
      { numRuns: 200 },
    );
  });
});
