import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../../job-store.js";
import { invalidateDownstreamWithLog } from "../../staleness/invalidate-downstream.js";
import { logReplanTriggered } from "../replan-logger.js";
import { writeReplanTriggeredEvent } from "../replan-event-writer.js";
import type {
  BlueprintInPlaceReplanResponse,
  BlueprintReplanContext,
  BlueprintReplanRequest,
} from "../types.js";

export interface HandleInPlaceReplanInput
  extends Pick<BlueprintReplanRequest, "fromStage" | "reason"> {
  job: BlueprintGenerationJob;
  jobStore: BlueprintJobStore;
  ctx: BlueprintReplanContext;
}

export function handleInPlaceReplan(
  input: HandleInPlaceReplanInput,
): BlueprintInPlaceReplanResponse {
  const triggeredAt = input.ctx.now().toISOString();
  const beforeStaleIds = collectStaleIds(input.job);
  const invalidatedJob = invalidateDownstreamWithLog(
    input.ctx,
    input.job,
    input.fromStage,
    {
      reason: "upstream_explicit_invalidation",
      triggeringArtifactId: input.job.id,
      triggeringArtifactType: "replay",
      now: () => triggeredAt,
    },
  );
  const stagedJob: BlueprintGenerationJob = {
    ...invalidatedJob,
    stage: input.fromStage,
    updatedAt: triggeredAt,
  };
  const afterStaleIds = collectStaleIds(stagedJob);
  const markedStaleArtifactIds = afterStaleIds.filter(
    (artifactId) => !beforeStaleIds.includes(artifactId),
  );
  const eventedJob = writeReplanTriggeredEvent(stagedJob, {
    jobId: stagedJob.id,
    fromStage: input.fromStage,
    mode: "in_place",
    reason: input.reason,
    triggeredAt,
    markedStaleArtifactCount: markedStaleArtifactIds.length,
    markedStaleArtifactIds,
  });

  input.jobStore.save(eventedJob);
  logReplanTriggered(input.ctx, {
    jobId: eventedJob.id,
    fromStage: input.fromStage,
    mode: "in_place",
    markedStaleArtifactCount: markedStaleArtifactIds.length,
    reason: input.reason,
    triggeredAt,
  });

  return {
    mode: "in_place",
    job: eventedJob,
    summary: {
      fromStage: input.fromStage,
      triggeredAt,
      markedStaleArtifactCount: markedStaleArtifactIds.length,
      markedStaleArtifactIds,
    },
  };
}

function collectStaleIds(job: BlueprintGenerationJob): string[] {
  return job.artifacts
    .filter((artifact) => artifact.staleSince !== undefined)
    .map((artifact) => artifact.id);
}
