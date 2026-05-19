/**
 * Agent Crew Stage Activation — State Machine
 *
 * 纯函数 only。本文件禁止 import 任何运行时 / 业务模块（design §2.D1 硬约束）。
 * 仅 `import type` shared 类型。
 */

import type {
  BlueprintGenerationStage,
  BlueprintRolePresenceState,
} from "../../../../shared/blueprint/index.js";

/**
 * RoleArchitectureResponse 的最小类型定义。
 * 来自 role-bridge spec 的 structuredRoles.payload 契约。
 * 使用本地类型别名避免引入尚未落地的 shared 模块。
 */
export interface RoleArchitectureResponse {
  roles: ReadonlyArray<{
    id: string;
    label: string;
    responsibilities: string[];
    activationStages: string[];
    permissions?: string[];
  }>;
}

/**
 * 单个 role 在某个 stage 的状态条目。
 */
export interface StageRoleStateEntry {
  roleId: string;
  stage: BlueprintGenerationStage;
  state: BlueprintRolePresenceState;
}

/**
 * 给定 role 数组 + primary route stages + 当前 stage，派生每个 role 的当前状态。
 * 纯函数：无副作用，可多次调用产出相同结果。
 *
 * 状态机 4 条规则（按顺序判定，先命中者生效）：
 *   1. currentStageId ∈ role.activationStages → "active"
 *   2. 历史有 active 且未来无 active + currentIndex === lastActivation + 1 → "reviewing"
 *   3. 未来有 active → "watching"
 *   4. 其它 → "sleeping"
 *
 * 边界处理：
 *   - currentStageId 不在 primaryRouteStages 中 → 所有 role 映射为 "sleeping"
 *   - role.activationStages 中项不在 primary route 时过滤掉
 *   - role.activationStages === [] 或全部无效 → 该 role 映射为 "sleeping"
 */
export function deriveStageRoleStateMap(input: {
  roles: RoleArchitectureResponse["roles"];
  primaryRouteStages: BlueprintGenerationStage[];
  currentStageId: BlueprintGenerationStage;
}): Map<string, BlueprintRolePresenceState> {
  const { roles, primaryRouteStages, currentStageId } = input;
  const currentIndex = primaryRouteStages.indexOf(currentStageId);
  const result = new Map<string, BlueprintRolePresenceState>();

  // Edge case: currentStageId not in primaryRouteStages → all roles sleeping
  if (currentIndex < 0) {
    for (const role of roles) {
      result.set(role.id, "sleeping");
    }
    return result;
  }

  for (const role of roles) {
    // Filter out activationStages items not present in primary route
    const stageIndices = role.activationStages
      .map((s) => primaryRouteStages.indexOf(s as BlueprintGenerationStage))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);

    // Edge case: no valid activation stages → sleeping
    if (stageIndices.length === 0) {
      result.set(role.id, "sleeping");
      continue;
    }

    // Rule 1: currentStageId ∈ role.activationStages → active
    if (stageIndices.includes(currentIndex)) {
      result.set(role.id, "active");
      continue;
    }

    const pastActivations = stageIndices.filter((i) => i < currentIndex);
    const futureActivations = stageIndices.filter((i) => i > currentIndex);

    // Rule 2: past active exists + no future active + currentIndex === lastActivation + 1 → reviewing
    if (pastActivations.length > 0 && futureActivations.length === 0) {
      const lastActivation = pastActivations[pastActivations.length - 1];
      if (currentIndex === lastActivation + 1) {
        result.set(role.id, "reviewing");
      } else {
        result.set(role.id, "sleeping");
      }
      continue;
    }

    // Rule 3: future active exists → watching
    if (futureActivations.length > 0) {
      result.set(role.id, "watching");
      continue;
    }

    // Rule 4: otherwise → sleeping
    result.set(role.id, "sleeping");
  }

  return result;
}
