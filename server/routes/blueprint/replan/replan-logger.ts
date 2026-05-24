import type { BlueprintGenerationStage } from "../../../../shared/blueprint/contracts.js";
import type {
  BlueprintReplanContext,
  BlueprintReplanErrorCode,
  BlueprintReplanMode,
} from "./types.js";

export interface ReplanTriggeredLogInput {
  jobId: string;
  parentJobId?: string;
  fromStage: BlueprintGenerationStage;
  mode: BlueprintReplanMode;
  markedStaleArtifactCount?: number;
  inheritedUpstreamArtifactCount?: number;
  reason?: string;
  triggeredAt: string;
}

export function logReplanTriggered(
  ctx: BlueprintReplanContext,
  input: ReplanTriggeredLogInput,
): void {
  ctx.logger.info("replan.triggered", stripUndefined({
    jobId: input.jobId,
    parentJobId: input.parentJobId,
    fromStage: input.fromStage,
    mode: input.mode,
    markedStaleArtifactCount: input.markedStaleArtifactCount,
    inheritedUpstreamArtifactCount: input.inheritedUpstreamArtifactCount,
    reasonPresent: input.reason !== undefined && input.reason.length > 0,
    reasonLength: input.reason?.length ?? 0,
    triggeredAt: input.triggeredAt,
  }));
}

export function logReplanRejected(
  ctx: BlueprintReplanContext,
  input: {
    jobId: string | null;
    reason: Extract<
      BlueprintReplanErrorCode,
      "job_not_found" | "invalid_from_stage" | "invalid_mode" | "invalid_reason"
    >;
    fromStage: BlueprintGenerationStage | null;
    mode: BlueprintReplanMode | null;
  },
): void {
  ctx.logger.debug("replan.rejected", input);
}

export function logReplanBlocked(
  ctx: BlueprintReplanContext,
  input: {
    jobId: string;
    fromStage: BlueprintGenerationStage;
    mode: BlueprintReplanMode;
    runningStage: BlueprintGenerationStage;
  },
): void {
  ctx.logger.warn("replan.blocked", input);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
