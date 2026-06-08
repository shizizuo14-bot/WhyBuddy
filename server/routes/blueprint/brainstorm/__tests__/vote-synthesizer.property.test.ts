import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { computeVoteResult, type VoteInput } from "../vote-synthesizer.js";

const optionArb = fc.constantFrom("A", "B", "C", "D");

const voteArb: fc.Arbitrary<VoteInput> = fc.record({
  roleId: fc.constantFrom("planner", "architect", "executor", "auditor"),
  chosenOption: optionArb,
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  reasoning: fc.string({ maxLength: 120 }),
});

describe("Feature: blueprint-v4-full-loop-completion, Property 3", () => {
  it("selects highest weighted score and computes margin/narrowness", () => {
    fc.assert(
      fc.property(fc.array(voteArb, { minLength: 1, maxLength: 20 }), (votes) => {
        const result = computeVoteResult(votes);
        const scores = new Map<string, number>();

        for (const vote of votes) {
          scores.set(
            vote.chosenOption,
            (scores.get(vote.chosenOption) ?? 0) + vote.confidence,
          );
        }

        const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        const winner = sorted[0];
        const second = sorted[1] ?? null;
        const expectedMargin = winner[1] - (second?.[1] ?? 0);

        expect(result.winningOption).toBe(winner[0]);
        expect(result.winningScore).toBeCloseTo(winner[1], 8);
        expect(result.secondPlaceOption).toBe(second?.[0] ?? null);
        expect(result.secondPlaceScore).toBeCloseTo(second?.[1] ?? 0, 8);
        expect(result.margin).toBeCloseTo(expectedMargin, 8);
        expect(result.isNarrow).toBe(expectedMargin < 0.15);
      }),
      { numRuns: 100 },
    );
  });
});
