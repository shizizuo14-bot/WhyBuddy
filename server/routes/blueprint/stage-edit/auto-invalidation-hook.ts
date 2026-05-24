import type {
  BlueprintGenerationArtifactType,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
  BlueprintStaleReason,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintLogger } from "../context.js";
import type { BlueprintJobStore } from "../job-store.js";
import { invalidateDownstreamWithLog } from "../staleness/invalidate-downstream.js";
import {
  logStageEditInvalidated,
  logStageEditNoop,
  type StageEditTriggeringEndpoint,
} from "./stage-edit-logger.js";

export interface AutoInvalidationHookContext {
  logger: Pick<BlueprintLogger, "debug" | "info" | "warn">;
  now?: () => Date;
}

export interface AutoInvalidationHookInput {
  job: BlueprintGenerationJob;
  fromStage: BlueprintGenerationStage;
  reason: BlueprintStaleReason;
  triggeringEndpoint: StageEditTriggeringEndpoint;
  triggeringArtifactId: string;
  triggeringArtifactType: BlueprintGenerationArtifactType;
  jobStore: BlueprintJobStore;
  ctx: AutoInvalidationHookContext;
}

export interface AutoInvalidationHookResult {
  job: BlueprintGenerationJob;
  newlyStaleArtifactIds: string[];
  newlyStaleArtifactCount: number;
}

export function runAutoInvalidationHook(
  input: AutoInvalidationHookInput,
): AutoInvalidationHookResult {
  const beforeStaleIds = new Set(input.job.staleArtifactIds ?? []);

  let invalidatedJob: BlueprintGenerationJob;
  try {
    invalidatedJob = invalidateDownstreamWithLog(
      { logger: input.ctx.logger },
      input.job,
      input.fromStage,
      {
        reason: input.reason,
        triggeringArtifactId: input.triggeringArtifactId,
        triggeringArtifactType: input.triggeringArtifactType,
        now: input.ctx.now
          ? () => input.ctx.now?.().toISOString() ?? new Date().toISOString()
          : undefined,
      },
    );
  } catch (error) {
    input.ctx.logger.warn("stage_edit.invalidation_failed", {
      jobId: input.job.id,
      fromStage: input.fromStage,
      triggeringEndpoint: input.triggeringEndpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      job: input.job,
      newlyStaleArtifactIds: [],
      newlyStaleArtifactCount: 0,
    };
  }

  const afterStaleIds = new Set(invalidatedJob.staleArtifactIds ?? []);
  const newlyStaleArtifactIds = [...afterStaleIds].filter(
    (artifactId) => !beforeStaleIds.has(artifactId),
  );
  const newlyStaleArtifactCount = newlyStaleArtifactIds.length;

  if (invalidatedJob !== input.job) {
    input.jobStore.save(invalidatedJob);
  }

  if (newlyStaleArtifactCount > 0) {
    logStageEditInvalidated(input.ctx, {
      jobId: input.job.id,
      fromStage: input.fromStage,
      reason: input.reason,
      triggeringEndpoint: input.triggeringEndpoint,
      markedArtifactCount: newlyStaleArtifactCount,
    });
  } else {
    logStageEditNoop(input.ctx, {
      jobId: input.job.id,
      fromStage: input.fromStage,
      triggeringEndpoint: input.triggeringEndpoint,
      alreadyStaleCount: beforeStaleIds.size,
    });
  }

  return {
    job: invalidatedJob,
    newlyStaleArtifactIds,
    newlyStaleArtifactCount,
  };
}
