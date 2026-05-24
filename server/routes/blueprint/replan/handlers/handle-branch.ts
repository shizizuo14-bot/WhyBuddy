import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../../job-store.js";
import { buildBranchJob } from "../branch-creator.js";
import { logReplanTriggered } from "../replan-logger.js";
import { writeReplanTriggeredEvent } from "../replan-event-writer.js";
import type {
  BlueprintBranchReplanResponse,
  BlueprintReplanContext,
  BlueprintReplanRequest,
} from "../types.js";

export interface HandleBranchReplanInput
  extends Pick<BlueprintReplanRequest, "fromStage" | "reason"> {
  parentJob: BlueprintGenerationJob;
  jobStore: BlueprintJobStore;
  ctx: BlueprintReplanContext;
  newJobId?: () => string;
}

export function handleBranchReplan(
  input: HandleBranchReplanInput,
): BlueprintBranchReplanResponse {
  const triggeredAt = input.ctx.now().toISOString();
  const branch = buildBranchJob({
    parentJob: input.parentJob,
    fromStage: input.fromStage,
    now: () => triggeredAt,
    newJobId: input.newJobId?.(),
  });
  const eventedBranch = writeReplanTriggeredEvent(branch.job, {
    jobId: branch.job.id,
    parentJobId: input.parentJob.id,
    fromStage: input.fromStage,
    mode: "branch",
    reason: input.reason,
    triggeredAt,
    inheritedUpstreamArtifactCount: branch.inheritedUpstreamArtifactIds.length,
    inheritedUpstreamArtifactIds: branch.inheritedUpstreamArtifactIds,
  });

  input.jobStore.save(eventedBranch);
  logReplanTriggered(input.ctx, {
    jobId: eventedBranch.id,
    parentJobId: input.parentJob.id,
    fromStage: input.fromStage,
    mode: "branch",
    inheritedUpstreamArtifactCount: branch.inheritedUpstreamArtifactIds.length,
    reason: input.reason,
    triggeredAt,
  });

  return {
    mode: "branch",
    job: eventedBranch,
    parentJobId: input.parentJob.id,
    summary: {
      fromStage: input.fromStage,
      triggeredAt,
      branchedAt: eventedBranch.branchedAt ?? triggeredAt,
      inheritedUpstreamArtifactCount: branch.inheritedUpstreamArtifactIds.length,
      inheritedUpstreamArtifactIds: branch.inheritedUpstreamArtifactIds,
    },
  };
}
