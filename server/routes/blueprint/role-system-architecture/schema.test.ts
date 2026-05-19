import { describe, it, expect, expectTypeOf } from "vitest";
import {
  AgentRoleSchema,
  RoleArchitectureResponseSchema,
  type RoleArchitectureResponse,
  type AgentRoleEntry,
} from "./schema.js";
import type {
  RoleArchitectureResponse as SharedRoleArchitectureResponse,
  AgentRoleEntry as SharedAgentRoleEntry,
} from "../../../../shared/blueprint/role-architecture.js";

/**
 * Validates: Requirements 3.1, 3.2, 3.3, 3.6, 9.2
 *
 * ~11 example-based tests covering:
 * - Type-level equivalence between server zod infer and shared interfaces
 * - Valid minimal and full payloads
 * - Missing / empty / too many roles
 * - Invalid id formats
 * - Duplicate id superRefine
 * - Invalid label
 * - Invalid responsibilities
 * - Invalid activationStages
 * - Invalid permissions
 * - Unknown fields stripped (zod default strip)
 * - ReDoS sentinel
 */
describe("RoleArchitectureResponseSchema", () => {
  const validRole = {
    id: "planner",
    label: "Planner",
    responsibilities: ["r1"],
    activationStages: ["s1"],
  };

  // 6.1 Type-level equivalence
  it("z.infer types are structurally equivalent to shared interfaces", () => {
    expectTypeOf<RoleArchitectureResponse>().toEqualTypeOf<SharedRoleArchitectureResponse>();
    expectTypeOf<AgentRoleEntry>().toEqualTypeOf<SharedAgentRoleEntry>();
  });

  // 6.2 Valid minimal and full payloads pass
  it("accepts valid minimal payload", () => {
    const result = RoleArchitectureResponseSchema.safeParse({
      roles: [{ id: "planner", label: "Planner", responsibilities: ["r1"], activationStages: ["s1"] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid full payload with 9 roles and permissions", () => {
    const roles = Array.from({ length: 9 }, (_, i) => ({
      id: `role-${String.fromCharCode(97 + i)}`,
      label: `Role ${i + 1}`,
      responsibilities: ["resp1", "resp2"],
      activationStages: ["stage1"],
      permissions: ["perm1", "perm2"],
    }));
    const result = RoleArchitectureResponseSchema.safeParse({ roles });
    expect(result.success).toBe(true);
  });

  // 6.3 Missing roles / empty array / too many roles fail
  it("rejects missing roles, empty array, and too many roles", () => {
    // missing roles
    const missing = RoleArchitectureResponseSchema.safeParse({});
    expect(missing.success).toBe(false);

    // empty array
    const empty = RoleArchitectureResponseSchema.safeParse({ roles: [] });
    expect(empty.success).toBe(false);

    // too many (10 > max 9)
    const tooMany = RoleArchitectureResponseSchema.safeParse({
      roles: Array(10).fill(validRole).map((r, i) => ({ ...r, id: `role-${i}` })),
    });
    expect(tooMany.success).toBe(false);
  });

  // 6.4 Invalid id formats
  it("rejects invalid id formats (uppercase, digit-start, empty, too long)", () => {
    const makePayload = (id: string) => ({
      roles: [{ ...validRole, id }],
    });

    // uppercase
    expect(RoleArchitectureResponseSchema.safeParse(makePayload("X")).success).toBe(false);
    // digit-start
    expect(RoleArchitectureResponseSchema.safeParse(makePayload("1planner")).success).toBe(false);
    // empty
    expect(RoleArchitectureResponseSchema.safeParse(makePayload("")).success).toBe(false);
    // too long (65 chars)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload("a".repeat(65))).success).toBe(false);
  });

  // 6.5 Duplicate id superRefine check
  it("rejects duplicate role ids via superRefine", () => {
    const result = RoleArchitectureResponseSchema.safeParse({
      roles: [
        { id: "dup", label: "First", responsibilities: ["r1"], activationStages: ["s1"] },
        { id: "dup", label: "Second", responsibilities: ["r2"], activationStages: ["s2"] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasUniqueError = result.error.issues.some(
        (i) => /duplicat|unique/i.test(i.message)
      );
      expect(hasUniqueError).toBe(true);
    }
  });

  // 6.6 Invalid label (empty, too long)
  it("rejects invalid labels (empty and too long)", () => {
    const makePayload = (label: string) => ({
      roles: [{ ...validRole, label }],
    });

    expect(RoleArchitectureResponseSchema.safeParse(makePayload("")).success).toBe(false);
    expect(RoleArchitectureResponseSchema.safeParse(makePayload("x".repeat(81))).success).toBe(false);
  });

  // 6.7 Invalid responsibilities (empty array, too many, too long items, empty items)
  it("rejects invalid responsibilities", () => {
    const makePayload = (responsibilities: string[]) => ({
      roles: [{ ...validRole, responsibilities }],
    });

    // empty array
    expect(RoleArchitectureResponseSchema.safeParse(makePayload([])).success).toBe(false);
    // too many (11 > max 10)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload(Array(11).fill("r"))).success).toBe(false);
    // single item too long (>200 chars)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload(["x".repeat(201)])).success).toBe(false);
    // empty item
    expect(RoleArchitectureResponseSchema.safeParse(makePayload([""])).success).toBe(false);
  });

  // 6.8 Invalid activationStages (empty array, too many, too long items)
  it("rejects invalid activationStages", () => {
    const makePayload = (activationStages: string[]) => ({
      roles: [{ ...validRole, activationStages }],
    });

    // empty array
    expect(RoleArchitectureResponseSchema.safeParse(makePayload([])).success).toBe(false);
    // too many (11 > max 10)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload(Array(11).fill("s"))).success).toBe(false);
    // single item too long (>64 chars)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload(["x".repeat(65)])).success).toBe(false);
  });

  // 6.9 Invalid permissions (too many, too long items)
  it("rejects invalid permissions", () => {
    const makePayload = (permissions: string[]) => ({
      roles: [{ ...validRole, permissions }],
    });

    // too many (11 > max 10)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload(Array(11).fill("p"))).success).toBe(false);
    // single item too long (>120 chars)
    expect(RoleArchitectureResponseSchema.safeParse(makePayload(["x".repeat(121)])).success).toBe(false);
  });

  // 6.10 Unknown fields are stripped (zod default strip behavior)
  it("strips unknown fields from parsed output", () => {
    const result = RoleArchitectureResponseSchema.safeParse({
      roles: [
        {
          id: "planner",
          label: "Planner",
          responsibilities: ["r1"],
          activationStages: ["s1"],
          group: "planning",
          collaborationNotes: ["x"],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const role = result.data.roles[0] as Record<string, unknown>;
      expect(role).not.toHaveProperty("group");
      expect(role).not.toHaveProperty("collaborationNotes");
    }
  });

  // 6.11 ReDoS sentinel: parsing completes within 50ms for very long id
  it("parses a very long id within 50ms (ReDoS sentinel)", () => {
    const payload = {
      roles: [
        {
          id: "a".repeat(1000),
          label: "Test",
          responsibilities: ["r1"],
          activationStages: ["s1"],
        },
      ],
    };
    const start = performance.now();
    RoleArchitectureResponseSchema.safeParse(payload);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
