/**
 * 子域 1：Intake & Project Context 的服务层壳。
 *
 * 本文件当前是"视图壳"（方案 B）：
 * - 对外暴露 `createIntakeService(ctx)` 接口，供未来子域 Router 使用；
 * - 实现通过从 `../blueprint.js` 引入现有函数、临时 re-wire 到 `BlueprintServiceContext`。
 *
 * 后续任务（在另一轮小型重构里）会把这些函数的实物从 `server/routes/blueprint.ts`
 * 真正迁入本文件并替换 store 注入方式。本轮只搭边界，不搬实现，避免破坏既有 43 条 E2E 用例。
 *
 * 对应 `.kiro/specs/autopilot-blueprint-refactor-split`：
 * - 需求 2.1（子域 1 路由：`/specs`、`/capabilities`、`/intake`、`/intake/:id`、`/projects/:projectId/context`）
 * - 需求 2.2（`createBlueprintRouter(deps)` 保留为唯一装配入口）
 * - 需求 3.2（子域通过 ctx 获取依赖）
 */

import type {
  BlueprintCapabilityRegistryResponse,
  BlueprintIntake,
  BlueprintIntakeRequest,
  BlueprintProjectDomainContext,
  BlueprintSpecsResponse,
} from "../../../../shared/blueprint/index.js";
import { collectBlueprintSpecs } from "../../blueprint.js";

import type { BlueprintServiceContext } from "../context.js";

export interface CreateIntakeResponse {
  intake: BlueprintIntake;
  projectContext?: BlueprintProjectDomainContext;
}

export interface IntakeService {
  listSpecs(): Promise<BlueprintSpecsResponse>;
  listDefaultCapabilities(): BlueprintCapabilityRegistryResponse;
  createIntake(request: BlueprintIntakeRequest): CreateIntakeResponse;
  getIntake(
    intakeId: string
  ): { intake: BlueprintIntake; projectContext?: BlueprintProjectDomainContext } | null;
  getProjectContext(projectId: string): BlueprintProjectDomainContext;
}

/**
 * 当前实现：桥接到 `server/routes/blueprint.ts` 中的现有函数。
 *
 * 迁入路径（当 intake 子域完成物理迁移时）：
 * - `collectBlueprintSpecs` → `server/routes/blueprint/intake/specs-scanner.ts`
 * - `getDefaultRuntimeCapabilities` / `buildAgentCrew` → 需要保留与 agent-crew 子域的接线
 * - `parseIntakeRequest` / `createBlueprintIntake` → `server/routes/blueprint/intake/service.ts`
 * - `createEmptyProjectContext` → `server/routes/blueprint/intake/service.ts`
 *
 * 本轮只提供一个**只读代理**：调用方通过 `ctx.blueprintStores` 直接读取 intake 与 project context。
 * 这等价于把现有逻辑的 "store 读取" 部分用新 context 重写，但 intake 创建 / specs 扫描仍走 blueprint.ts。
 */
export function createIntakeService(ctx: BlueprintServiceContext): IntakeService {
  return {
    async listSpecs() {
      return collectBlueprintSpecs({
        specsRoot: ctx.specsRoot,
        now: ctx.now,
      });
    },
    listDefaultCapabilities() {
      throw new Error(
        "IntakeService.listDefaultCapabilities is not wired yet. " +
          "Current /capabilities route is still served by server/routes/blueprint.ts. " +
          "This will be filled in when the agent-crew subdomain migrates (task 9)."
      );
    },
    createIntake() {
      throw new Error(
        "IntakeService.createIntake is not wired yet. " +
          "Current POST /intake is served by server/routes/blueprint.ts and still uses module-level stores. " +
          "This will be wired to ctx.blueprintStores in a follow-up iteration."
      );
    },
    getIntake(intakeId) {
      const intake = ctx.blueprintStores.intakes.get(intakeId);
      if (!intake) return null;
      const projectContext = intake.projectId
        ? ctx.blueprintStores.projectContexts.get(intake.projectId)
        : undefined;
      return { intake, projectContext };
    },
    getProjectContext(projectId) {
      const existing = ctx.blueprintStores.projectContexts.get(projectId);
      if (existing) return existing;
      const now = ctx.now();
      return {
        projectId,
        updatedAt: now.toISOString(),
        intakeIds: [],
        sourceIds: [],
        assets: [],
        evidence: [],
      };
    },
  };
}
