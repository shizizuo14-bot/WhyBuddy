import { randomUUID } from "node:crypto";

import {
  BlueprintEventName,
  resolveBlueprintEventFamily,
  type BlueprintGenerationEvent,
  type BlueprintGenerationJob,
  type BlueprintGenerationStage,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintReplanMode } from "./types.js";

export interface WriteReplanTriggeredEventInput {
  eventId?: string;
  jobId: string;
  parentJobId?: string;
  fromStage: BlueprintGenerationStage;
  mode: BlueprintReplanMode;
  reason?: string;
  triggeredAt: string;
  markedStaleArtifactCount?: number;
  markedStaleArtifactIds?: string[];
  inheritedUpstreamArtifactCount?: number;
  inheritedUpstreamArtifactIds?: string[];
}

export function writeReplanTriggeredEvent(
  job: BlueprintGenerationJob,
  input: WriteReplanTriggeredEventInput,
): BlueprintGenerationJob {
  const payload = stripUndefined({
    jobId: input.jobId,
    parentJobId: input.parentJobId,
    fromStage: input.fromStage,
    mode: input.mode,
    reason:
      input.reason !== undefined ? input.reason.slice(0, 500) : undefined,
    triggeredAt: input.triggeredAt,
    markedStaleArtifactCount: input.markedStaleArtifactCount,
    markedStaleArtifactIds: input.markedStaleArtifactIds,
    inheritedUpstreamArtifactCount: input.inheritedUpstreamArtifactCount,
    inheritedUpstreamArtifactIds: input.inheritedUpstreamArtifactIds,
  });

  const event: BlueprintGenerationEvent = {
    id: input.eventId ?? randomUUID(),
    jobId: input.jobId,
    projectId: job.projectId,
    type: BlueprintEventName.ReplanTriggered,
    family: resolveBlueprintEventFamily(BlueprintEventName.ReplanTriggered),
    stage: input.fromStage,
    status: "running",
    message:
      input.mode === "branch"
        ? `Created branch from ${input.fromStage}`
        : `Triggered in-place replan from ${input.fromStage}`,
    occurredAt: input.triggeredAt,
    payload,
  };

  return {
    ...job,
    events: [...job.events, event],
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}
