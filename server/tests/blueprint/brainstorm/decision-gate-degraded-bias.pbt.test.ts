/**
 * Property 26: Degraded mode biases toward single-agent
 *
 * When capability bridges report fallback (degradedBridges is non-empty),
 * the Decision Gate outputs brainstormNeeded=false regardless of what the
 * LLM recommends.
 *
 * **Validates: Requirements 10.3**
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  DecisionGate,
  type LLMCaller,
} from "../../../routes/blueprint/brainstorm/decision-gate.js";
import type {
  DecisionGateInput,
  DecisionGateOutput,
  CollaborationMode,
  BrainstormRoleId,
  ToolCategory,
} from "../../../../shared/blueprint/brainstorm-contracts.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Helper: generate an alphanumeric-like string by replacing non-alphanumeric chars */
const arbAlphanumeric = (min: number, max: number) =>
  fc
    .string({ minLength: min, maxLength: max })
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, "x") || "x");

const arbCollaborationMode: fc.Arbitrary<CollaborationMode> = fc.constantFrom(
  "discussion",
  "vote",
  "division",
  "audit",
);

const arbRoleId: fc.Arbitrary<BrainstormRoleId> = fc.constantFrom(
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
);

const arbToolCategory: fc.Arbitrary<ToolCategory> = fc.constantFrom(
  "docker",
  "mcp",
  "github",
  "skills",
);

/** Generate a non-empty degradedBridges array (at least 1 bridge in fallback) */
const arbDegradedBridges: fc.Arbitrary<string[]> = fc.array(
  arbAlphanumeric(1, 30),
  { minLength: 1, maxLength: 5 },
);

/** Generate arbitrary DecisionGateInput with non-empty degradedBridges */
const arbDegradedInput: fc.Arbitrary<DecisionGateInput> = fc.record({
  jobId: arbAlphanumeric(1, 20),
  stageId: arbAlphanumeric(1, 20),
  stageContext: fc.string({ minLength: 1, maxLength: 200 }),
  degradedBridges: arbDegradedBridges,
  previousStageOutputs: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
      minLength: 0,
      maxLength: 3,
    }),
    { nil: undefined },
  ),
});

/**
 * Generate arbitrary LLM output that says brainstormNeeded=true.
 * This simulates the LLM recommending brainstorm — but the degraded mode
 * bias should override this.
 */
const arbLLMOutputTrue: fc.Arbitrary<DecisionGateOutput> = fc.record({
  brainstormNeeded: fc.constant(true as boolean),
  recommendedMode: arbCollaborationMode,
  requiredRoles: fc.array(arbRoleId, { minLength: 1, maxLength: 4 }),
  requiredToolCategories: fc.array(arbToolCategory, {
    minLength: 0,
    maxLength: 3,
  }),
  reasoning: fc.string({ minLength: 1, maxLength: 100 }),
});

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe("Property 26: Degraded mode biases toward single-agent", () => {
  it("when degradedBridges is non-empty, Decision Gate returns brainstormNeeded=false even if LLM says true", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDegradedInput,
        arbLLMOutputTrue,
        async (input, llmResponse) => {
          // Mock LLM caller that always returns brainstormNeeded=true
          const mockLLMCaller: LLMCaller = async () => llmResponse;

          const gate = new DecisionGate({ llmCaller: mockLLMCaller });

          const result = await gate.decide(input);

          // The degradation bias MUST override the LLM recommendation
          expect(result.brainstormNeeded).toBe(false);

          // Reasoning should mention degraded mode
          expect(result.reasoning.toLowerCase()).toContain("degrad");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("degraded mode bias applies regardless of the number of degraded bridges", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Vary the number of degraded bridges from 1 to many
        fc.integer({ min: 1, max: 10 }),
        arbAlphanumeric(1, 20),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (bridgeCount, bridgeName, stageContext) => {
          const degradedBridges = Array.from(
            { length: bridgeCount },
            (_, i) => `${bridgeName}-${i}`,
          );

          const input: DecisionGateInput = {
            jobId: "job-test",
            stageId: "stage-test",
            stageContext,
            degradedBridges,
          };

          // LLM caller that tries to recommend brainstorm
          const mockLLMCaller: LLMCaller = async () => ({
            brainstormNeeded: true,
            recommendedMode: "vote",
            requiredRoles: ["planner", "architect"],
            requiredToolCategories: ["docker", "mcp"],
            reasoning: "Complex task needs brainstorm",
          });

          const gate = new DecisionGate({ llmCaller: mockLLMCaller });
          const result = await gate.decide(input);

          // Must always return false when bridges are degraded
          expect(result.brainstormNeeded).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("LLM caller is never invoked when degradedBridges is non-empty", async () => {
    await fc.assert(
      fc.asyncProperty(arbDegradedInput, async (input) => {
        let llmWasCalled = false;

        const mockLLMCaller: LLMCaller = async () => {
          llmWasCalled = true;
          return {
            brainstormNeeded: true,
            recommendedMode: "discussion" as CollaborationMode,
            requiredRoles: ["executor"] as BrainstormRoleId[],
            requiredToolCategories: [] as ToolCategory[],
            reasoning: "Should not be called",
          };
        };

        const gate = new DecisionGate({ llmCaller: mockLLMCaller });
        await gate.decide(input);

        // The gate should short-circuit before calling the LLM
        expect(llmWasCalled).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
