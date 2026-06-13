/**
 * V5 SlideRule roleId ↔ Brainstorm crew role mapping (R2 PR-R2a).
 *
 * Strict bijection does not exist (7 V5 roles vs 6 BS roles). This module
 * defines a total V5→BS function, a canonical BS→V5 inverse, and explicit
 * collision pairs for test guards.
 */

import type { BrainstormRoleId } from "./brainstorm-contracts.js";

export const V5_ROLE_IDS = [
  "产品",
  "架构",
  "安全",
  "工程",
  "挑刺",
  "综合",
  "接地",
] as const;

export type V5RoleId = (typeof V5_ROLE_IDS)[number];

const V5_TO_BRAINSTORM: Record<V5RoleId, BrainstormRoleId> = {
  架构: "architect",
  工程: "executor",
  挑刺: "auditor",
  安全: "auditor",
  综合: "decider",
  产品: "planner",
  接地: "executor",
};

/** Canonical inverse (collision roles pick the V5 id listed first in each pair). */
const BRAINSTORM_TO_V5_CANONICAL: Record<BrainstormRoleId, V5RoleId> = {
  architect: "架构",
  executor: "工程",
  auditor: "挑刺",
  decider: "综合",
  planner: "产品",
  ui_previewer: "产品",
};

/**
 * Explicit V5 roles that share a brainstorm role (R2-B1: exactly two groups).
 */
export const V5_BRAINSTORM_COLLISIONS: ReadonlyArray<{
  brainstormRoleId: BrainstormRoleId;
  v5RoleIds: readonly V5RoleId[];
}> = [
  { brainstormRoleId: "auditor", v5RoleIds: ["挑刺", "安全"] },
  { brainstormRoleId: "executor", v5RoleIds: ["工程", "接地"] },
];

/** Fixed opposition targets for counter.argue mini-sessions (R2). */
const CRITIQUE_TARGET_BY_CHALLENGER: Record<BrainstormRoleId, BrainstormRoleId> = {
  auditor: "architect",
  architect: "auditor",
  executor: "architect",
  planner: "architect",
  decider: "auditor",
  ui_previewer: "architect",
};

export function mapV5RoleToBrainstorm(roleId: string): BrainstormRoleId {
  if ((V5_ROLE_IDS as readonly string[]).includes(roleId)) {
    return V5_TO_BRAINSTORM[roleId as V5RoleId];
  }
  return "planner";
}

export function mapBrainstormRoleToV5Canonical(roleId: BrainstormRoleId): V5RoleId {
  return BRAINSTORM_TO_V5_CANONICAL[roleId];
}

/**
 * Resolve critique target for counter.argue.
 * Optional `targetRoleId` (V5) overrides the fixed table when it maps to a
 * valid BS role distinct from the challenger (R1 hook).
 */
export function resolveCritiqueTargetRole(
  challengerBrainstormRole: BrainstormRoleId,
  targetRoleId?: string
): BrainstormRoleId {
  if (targetRoleId && (V5_ROLE_IDS as readonly string[]).includes(targetRoleId)) {
    const mapped = mapV5RoleToBrainstorm(targetRoleId);
    if (mapped !== challengerBrainstormRole) {
      return mapped;
    }
  }
  return CRITIQUE_TARGET_BY_CHALLENGER[challengerBrainstormRole] ?? "architect";
}

/** Guard: every V5 pool role has a mapping (R2-B1 totality). */
export function assertV5RoleMapTotality(): void {
  for (const id of V5_ROLE_IDS) {
    if (!V5_TO_BRAINSTORM[id]) {
      throw new Error(`Missing V5→Brainstorm mapping for ${id}`);
    }
  }
}