/**
 * `autopilot-role-container-loader` spec Task 6：Skill 绑定器。
 *
 * 职责：
 * - 对每个 `skillId` 调 `skillRegistry.loadForRole({ roleId, skillId })`；
 * - null / throw 均计入 `bindingReport.skippedSkills`；
 * - 函数永不抛错（需求 5.3 / 5.4 / 11.6）。
 *
 * 设计锚点：design §4.8 `ALGORITHM bindRoleSkills`。
 *
 * 说明：本 spec 不直接依赖 L12 `plugin-skill-system` 的实现，因此在此定义一个
 * 最小 {@link SkillRegistryDependency} 接口。真实装配侧（server/index）传入
 * 符合该 duck-typed 形状的实例即可，未装配时 loader 走"全部跳过"路径。
 */

import type { BlueprintLogger } from "../context.js";

import type {
  BindingReport,
  BindingSkipRecord,
} from "./mcp-binder.js";

/**
 * Skill 句柄最小形态。保留 `invoke()` 以便 loader 的 Skill facade 直接委派调用；
 * L12 实际返回的 handle 可以承载更多字段（descriptor / resources / revision
 * 等），这里只约束消费侧真正依赖的字段。
 */
export interface SkillHandle {
  skillId: string;
  roleId: string;
  loadedAt: string;
  invoke: (input: unknown) => Promise<unknown>;
}

/**
 * 最小 SkillRegistry 契约。真实实现可能还有 `listForRole`、`unload` 等方法，
 * 但 loader 在本阶段只需要 `loadForRole`。
 */
export interface SkillRegistryDependency {
  loadForRole(input: {
    roleId: string;
    skillId: string;
  }): Promise<SkillHandle | null>;
}

/**
 * 截断错误原因到 400 字符以内。
 */
function truncateReason(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw ?? "");
  return message.length <= 400 ? message : message.slice(0, 400);
}

/**
 * 绑定一组 skill id。
 *
 * - `skillRegistry === undefined` → 全部 skip，不抛错。
 * - 串行调用保持顺序稳定；单项失败不影响后续。
 */
export async function bindRoleSkills(
  skillIds: readonly string[],
  skillRegistry: SkillRegistryDependency | undefined,
  roleId: string,
  bindingReport: BindingReport,
  logger: BlueprintLogger,
): Promise<Map<string, SkillHandle>> {
  const result = new Map<string, SkillHandle>();

  if (!skillRegistry) {
    for (const id of skillIds) {
      if (typeof id !== "string" || id.length === 0) continue;
      const record: BindingSkipRecord = {
        id,
        reason: "skillRegistry missing",
      };
      bindingReport.skippedSkills.push(record);
    }
    return result;
  }

  for (const skillId of skillIds) {
    if (typeof skillId !== "string" || skillId.length === 0) continue;
    try {
      const handle = await skillRegistry.loadForRole({ roleId, skillId });
      if (!handle) {
        bindingReport.skippedSkills.push({
          id: skillId,
          reason: "skill not registered",
        });
        logger.warn("role container loader: skill binding skipped", {
          skillId,
          roleId,
          reason: "skill not registered",
        });
        continue;
      }
      result.set(skillId, handle);
      bindingReport.boundSkills.push(skillId);
    } catch (err) {
      const reason = truncateReason(err);
      bindingReport.skippedSkills.push({ id: skillId, reason });
      logger.warn("role container loader: skill binding failed", {
        skillId,
        roleId,
        reason,
      });
    }
  }

  return result;
}
