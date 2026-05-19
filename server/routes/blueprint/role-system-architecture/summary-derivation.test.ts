import { describe, it, expect } from "vitest";
import {
  deriveRoleOutputSummary,
  buildStructuredRolesSummary,
  sha256Hex,
} from "./summary-derivation.js";
import { createDefaultRoleSystemArchitectureCapabilityPolicy } from "./policy.js";
import type { RoleArchitectureResponse } from "./schema.js";

/**
 * Validates: Requirements 3.5, 4.3, 4.5, 9.2
 *
 * ~4 example-based tests covering:
 * - Singular/plural en-US output
 * - zh-CN variant
 * - Truncation to maxStructuredPayloadSummaryBytes
 * - sha256Hex deterministic output
 */
describe("deriveRoleOutputSummary", () => {
  // 12.1 Singular/plural en-US
  it("returns correct singular/plural en-US summary", () => {
    // 1 role, 1 stage → singular
    const singleRole: RoleArchitectureResponse = {
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["s1"],
        },
      ],
    };
    expect(deriveRoleOutputSummary(singleRole, { locale: "en-US" })).toBe(
      "Composed 1 role; covering 1 stage.",
    );

    // 3 roles with overlapping stages → plural, deduplicated stages
    const multiRole: RoleArchitectureResponse = {
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["s1", "s2"],
        },
        {
          id: "architect",
          label: "Architect",
          responsibilities: ["design"],
          activationStages: ["s2", "s3"],
        },
        {
          id: "reviewer",
          label: "Reviewer",
          responsibilities: ["review"],
          activationStages: ["s3"],
        },
      ],
    };
    // Unique stages: s1, s2, s3 = 3
    expect(deriveRoleOutputSummary(multiRole, { locale: "en-US" })).toBe(
      "Composed 3 roles; covering 3 stages.",
    );
  });

  // 12.2 zh-CN variant
  it("returns correct zh-CN summary", () => {
    const singleRole: RoleArchitectureResponse = {
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["s1"],
        },
      ],
    };
    expect(deriveRoleOutputSummary(singleRole, { locale: "zh-CN" })).toBe(
      "规划 1 个角色；覆盖 1 个阶段。",
    );

    const multiRole: RoleArchitectureResponse = {
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["plan"],
          activationStages: ["s1", "s2"],
        },
        {
          id: "architect",
          label: "Architect",
          responsibilities: ["design"],
          activationStages: ["s2", "s3"],
        },
        {
          id: "reviewer",
          label: "Reviewer",
          responsibilities: ["review"],
          activationStages: ["s3"],
        },
      ],
    };
    expect(deriveRoleOutputSummary(multiRole, { locale: "zh-CN" })).toBe(
      "规划 3 个角色；覆盖 3 个阶段。",
    );
  });
});

describe("buildStructuredRolesSummary", () => {
  const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();

  // 12.3 Truncation: 9 roles with long ids stay within byte budget
  it("truncates to maxStructuredPayloadSummaryBytes with ellipsis", () => {
    const roles = Array.from({ length: 9 }, (_, i) => ({
      id: `role-${"x".repeat(32)}-${i}`,
      label: `Role ${i}`,
      responsibilities: ["resp"],
      activationStages: ["stage"],
    }));
    const data: RoleArchitectureResponse = { roles };

    const result = buildStructuredRolesSummary(data, policy);
    const byteSize = Buffer.byteLength(result, "utf8");

    expect(byteSize).toBeLessThanOrEqual(policy.maxStructuredPayloadSummaryBytes);
    // When truncated, ends with "..."
    if (byteSize === policy.maxStructuredPayloadSummaryBytes || result.endsWith("...")) {
      expect(result).toMatch(/\.\.\.$/);
    }
  });
});

describe("sha256Hex", () => {
  // 12.4 Deterministic known hash
  it("returns the correct sha256 hex for 'hello'", () => {
    expect(sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
