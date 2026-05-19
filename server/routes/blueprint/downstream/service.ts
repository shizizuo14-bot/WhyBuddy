/**
 * 子域 7：Downstream（Effect Preview / Prompt Package / Engineering Handoff）服务层壳。
 *
 * 当前只读：从 ctx.jobStore 拉出 effect_preview / prompt_pack / engineering_plan / engineering_run artifact。
 * 真正的生成逻辑（`buildEffectPreview` / `buildPromptPackage` / `planEngineeringLanding` / `recordEngineeringRun`）
 * 仍在 `server/routes/blueprint.ts`；后续物理迁移时把它们搬到本目录。
 *
 * `mission.handoff` 事件的 emit 点目前在 engineering-landing 成功路径里（`blueprint.ts`），
 * 事件名替换（裸字符串 → `BlueprintEventName.MissionHandoff`）放到任务 15 做。
 *
 * 对应需求 2.1 子域 7、3.2、5.1、7.3。
 */

import type {
  BlueprintEffectPreview,
  BlueprintEngineeringLandingPlan,
  BlueprintEngineeringRun,
  BlueprintGenerationJob,
  BlueprintImplementationPromptPackage,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";

export interface DownstreamService {
  listEffectPreviews(jobId: string): BlueprintEffectPreview[];
  listPromptPackages(jobId: string): BlueprintImplementationPromptPackage[];
  listLandingPlans(jobId: string): BlueprintEngineeringLandingPlan[];
  listEngineeringRuns(jobId: string): BlueprintEngineeringRun[];
}

function readArtifactPayloads<T>(
  job: BlueprintGenerationJob | null,
  type: string
): T[] {
  if (!job) return [];
  return job.artifacts
    .filter(artifact => artifact.type === type)
    .map(artifact => artifact.payload as T)
    .filter((payload): payload is T => payload !== undefined && payload !== null);
}

export function createDownstreamService(
  ctx: BlueprintServiceContext
): DownstreamService {
  return {
    listEffectPreviews(jobId) {
      return readArtifactPayloads<BlueprintEffectPreview>(
        ctx.jobStore.get(jobId),
        "effect_preview"
      );
    },
    listPromptPackages(jobId) {
      return readArtifactPayloads<BlueprintImplementationPromptPackage>(
        ctx.jobStore.get(jobId),
        "prompt_pack"
      );
    },
    listLandingPlans(jobId) {
      return readArtifactPayloads<BlueprintEngineeringLandingPlan>(
        ctx.jobStore.get(jobId),
        "engineering_plan"
      );
    },
    listEngineeringRuns(jobId) {
      return readArtifactPayloads<BlueprintEngineeringRun>(
        ctx.jobStore.get(jobId),
        "engineering_run"
      );
    },
  };
}
