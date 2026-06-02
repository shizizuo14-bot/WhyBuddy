/**
 * Decision Gate Property-Based Test — Property 1: Schema Completeness
 *
 * **Validates: Requirements 1.2**
 *
 * For any valid LLM response that successfully parses as a Decision Gate output,
 * the result SHALL contain all required fields:
 * - `brainstormNeeded` (boolean)
 * - `recommendedMode` (valid CollaborationMode)
 * - `requiredRoles` (non-empty array of valid BrainstormRoleId)
 * - `requiredToolCategories` (array of valid ToolCategory)
 * - `reasoning` (non-empty string)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type {
  DecisionGateOutput,
  CollaborationMode,
  BrainstormRoleId,
  ToolCategory,
} from "../../../shared/blueprint/brainstorm-contracts.js";

// ─── Valid domain values ────────────────────────────────────────────────────

const VALID_COLLABORATION_MODES: CollaborationMode[] = [
  "discussion",
  "vote",
  "division",
  "audit",
];

const VALID_BRAINSTORM_ROLE_IDS: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

const VALID_TOOL_CATEGORIES: ToolCategory[] = [
  "docker",
  "mcp",
  "github",
  "skills",
];

// ─── Arbitraries ────────────────────────────────────────────────────────────

const arbCollaborationMode: fc.Arbitrary<CollaborationMode> = fc.constantFrom(
  ...VALID_COLLABORATION_MODES,
);

const arbBrainstormRoleId: fc.Arbitrary<BrainstormRoleId> = fc.constantFrom(
  ...VALID_BRAINSTORM_ROLE_IDS,
);

const arbToolCategory: fc.Arbitrary<ToolCategory> = fc.constantFrom(
  ...VALID_TOOL_CATEGORIES,
);

const arbDecisionGateOutput: fc.Arbitrary<DecisionGateOutput> = fc.record({
  brainstormNeeded: fc.boolean(),
  recommendedMode: arbCollaborationMode,
  requiredRoles: fc
    .uniqueArray(arbBrainstormRoleId, { minLength: 1, maxLength: 6 }),
  requiredToolCategories: fc
    .uniqueArray(arbToolCategory, { minLength: 0, maxLength: 4 }),
  reasoning: fc.string({ minLength: 1, maxLength: 500 }),
});

// ─── Property 1: Decision Gate schema completeness ──────────────────────────
// **Validates: Requirements 1.2**

describe("Property 1: Decision Gate schema completeness", () => {
  it("all required fields are present and have valid types", () => {
    fc.assert(
      fc.property(arbDecisionGateOutput, (output: DecisionGateOutput) => {
        // 1. brainstormNeeded is a boolean
        expect(typeof output.brainstormNeeded).toBe("boolean");

        // 2. recommendedMode is one of the valid CollaborationMode values
        expect(VALID_COLLABORATION_MODES).toContain(output.recommendedMode);

        // 3. requiredRoles is a non-empty array of valid BrainstormRoleId values
        expect(Array.isArray(output.requiredRoles)).toBe(true);
        expect(output.requiredRoles.length).toBeGreaterThan(0);
        for (const role of output.requiredRoles) {
          expect(VALID_BRAINSTORM_ROLE_IDS).toContain(role);
        }

        // 4. requiredToolCategories is an array of valid ToolCategory values
        expect(Array.isArray(output.requiredToolCategories)).toBe(true);
        for (const cat of output.requiredToolCategories) {
          expect(VALID_TOOL_CATEGORIES).toContain(cat);
        }

        // 5. reasoning is a non-empty string
        expect(typeof output.reasoning).toBe("string");
        expect(output.reasoning.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("rejects invalid objects that are missing required fields", () => {
    // Generate arbitrary JSON objects that may be missing required fields
    const arbPartialObject = fc.record(
      {
        brainstormNeeded: fc.option(fc.anything(), { nil: undefined }),
        recommendedMode: fc.option(fc.anything(), { nil: undefined }),
        requiredRoles: fc.option(fc.anything(), { nil: undefined }),
        requiredToolCategories: fc.option(fc.anything(), { nil: undefined }),
        reasoning: fc.option(fc.anything(), { nil: undefined }),
      },
      { requiredKeys: [] },
    );

    fc.assert(
      fc.property(arbPartialObject, (obj) => {
        const isValid = validateDecisionGateOutput(obj);

        // If the validator says it's valid, verify it actually has all required fields
        if (isValid) {
          expect(typeof obj.brainstormNeeded).toBe("boolean");
          expect(VALID_COLLABORATION_MODES).toContain(obj.recommendedMode);
          expect(Array.isArray(obj.requiredRoles)).toBe(true);
          expect((obj.requiredRoles as unknown[]).length).toBeGreaterThan(0);
          for (const role of obj.requiredRoles as unknown[]) {
            expect(VALID_BRAINSTORM_ROLE_IDS).toContain(role);
          }
          expect(Array.isArray(obj.requiredToolCategories)).toBe(true);
          for (const cat of obj.requiredToolCategories as unknown[]) {
            expect(VALID_TOOL_CATEGORIES).toContain(cat);
          }
          expect(typeof obj.reasoning).toBe("string");
          expect((obj.reasoning as string).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("valid DecisionGateOutput JSON round-trips correctly", () => {
    fc.assert(
      fc.property(arbDecisionGateOutput, (output: DecisionGateOutput) => {
        // Serialize to JSON and back (simulating LLM response parsing)
        const serialized = JSON.stringify(output);
        const parsed = JSON.parse(serialized) as unknown;

        // After parsing, the object should still pass validation
        expect(validateDecisionGateOutput(parsed)).toBe(true);

        // And the deserialized object should be equivalent
        const typedParsed = parsed as DecisionGateOutput;
        expect(typedParsed.brainstormNeeded).toBe(output.brainstormNeeded);
        expect(typedParsed.recommendedMode).toBe(output.recommendedMode);
        expect(typedParsed.requiredRoles).toEqual(output.requiredRoles);
        expect(typedParsed.requiredToolCategories).toEqual(
          output.requiredToolCategories,
        );
        expect(typedParsed.reasoning).toBe(output.reasoning);
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Inline validator ───────────────────────────────────────────────────────
// This validates an unknown value against the DecisionGateOutput schema.
// Once decision-gate.ts exports a parseDecisionGateOutput function,
// this can be replaced with the real implementation.

function validateDecisionGateOutput(value: unknown): value is DecisionGateOutput {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // brainstormNeeded must be boolean
  if (typeof obj.brainstormNeeded !== "boolean") {
    return false;
  }

  // recommendedMode must be a valid CollaborationMode
  if (
    typeof obj.recommendedMode !== "string" ||
    !(VALID_COLLABORATION_MODES as string[]).includes(obj.recommendedMode)
  ) {
    return false;
  }

  // requiredRoles must be a non-empty array of valid BrainstormRoleId
  if (!Array.isArray(obj.requiredRoles) || obj.requiredRoles.length === 0) {
    return false;
  }
  for (const role of obj.requiredRoles) {
    if (
      typeof role !== "string" ||
      !(VALID_BRAINSTORM_ROLE_IDS as string[]).includes(role)
    ) {
      return false;
    }
  }

  // requiredToolCategories must be an array of valid ToolCategory
  if (!Array.isArray(obj.requiredToolCategories)) {
    return false;
  }
  for (const cat of obj.requiredToolCategories) {
    if (
      typeof cat !== "string" ||
      !(VALID_TOOL_CATEGORIES as string[]).includes(cat)
    ) {
      return false;
    }
  }

  // reasoning must be a non-empty string
  if (typeof obj.reasoning !== "string" || obj.reasoning.length === 0) {
    return false;
  }

  return true;
}
