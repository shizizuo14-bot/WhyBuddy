import { describe, it, expect } from "vitest";
import type { BrainstormRoleId } from "../brainstorm-contracts.js";
import {
  V5_ROLE_IDS,
  V5_BRAINSTORM_COLLISIONS,
  mapV5RoleToBrainstorm,
  mapBrainstormRoleToV5Canonical,
  resolveCritiqueTargetRole,
  assertV5RoleMapTotality,
} from "../whybuddy-role-map.js";

describe("whybuddy-role-map (R2-B1)", () => {
  it("maps every V5 role (totality)", () => {
    assertV5RoleMapTotality();
    for (const id of V5_ROLE_IDS) {
      expect(mapV5RoleToBrainstorm(id)).toBeTruthy();
    }
    expect(V5_ROLE_IDS).toHaveLength(7);
  });

  it("has exactly two explicit collision groups", () => {
    expect(V5_BRAINSTORM_COLLISIONS).toHaveLength(2);
    expect(V5_BRAINSTORM_COLLISIONS).toEqual(
      expect.arrayContaining([
        { brainstormRoleId: "auditor", v5RoleIds: ["挑刺", "安全"] },
        { brainstormRoleId: "executor", v5RoleIds: ["工程", "接地"] },
      ])
    );

    const collisionV5 = new Set(
      V5_BRAINSTORM_COLLISIONS.flatMap((c) => c.v5RoleIds)
    );
    expect(collisionV5.size).toBe(4);
    for (const id of V5_ROLE_IDS) {
      const bs = mapV5RoleToBrainstorm(id);
      const inCollision = V5_BRAINSTORM_COLLISIONS.some((g) =>
        g.v5RoleIds.includes(id)
      );
      if (!inCollision) {
        const roundTrip = mapBrainstormRoleToV5Canonical(bs);
        expect(mapV5RoleToBrainstorm(roundTrip)).toBe(bs);
      }
    }
  });

  it("canonical round-trip is stable for non-collision brainstorm roles", () => {
    const nonCollisionBs: BrainstormRoleId[] = [
      "architect",
      "executor",
      "auditor",
      "decider",
      "planner",
    ];
    for (const bs of nonCollisionBs) {
      const v5 = mapBrainstormRoleToV5Canonical(bs);
      expect(mapV5RoleToBrainstorm(v5)).toBe(bs);
    }
    expect(mapBrainstormRoleToV5Canonical("ui_previewer")).toBe("产品");
    expect(mapV5RoleToBrainstorm("产品")).toBe("planner");
  });

  it("resolveCritiqueTargetRole uses fixed table by default", () => {
    expect(resolveCritiqueTargetRole("auditor")).toBe("architect");
    expect(resolveCritiqueTargetRole("architect")).toBe("auditor");
  });

  it("resolveCritiqueTargetRole honors optional targetRoleId when valid", () => {
    expect(resolveCritiqueTargetRole("auditor", "工程")).toBe("executor");
    expect(resolveCritiqueTargetRole("auditor", "挑刺")).toBe("architect");
    expect(resolveCritiqueTargetRole("auditor", "bogus")).toBe("architect");
  });
});