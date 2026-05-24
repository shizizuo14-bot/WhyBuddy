import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationArtifactType,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintLogger } from "../context.js";
import {
  getTransitiveDownstreamStages,
  mapArtifactTypeToStage,
} from "./dependency-graph.js";

export type BlueprintStaleReason =
  | "upstream_target_changed"
  | "upstream_clarification_changed"
  | "upstream_route_changed"
  | "upstream_route_selection_changed"
  | "upstream_explicit_invalidation";

export interface BlueprintStaleSource {
  stage: BlueprintGenerationStage;
  artifactId: string;
  artifactType: BlueprintGenerationArtifactType;
  reason: BlueprintStaleReason;
  triggeredAt: string;
}

type StaleableArtifact = BlueprintGenerationArtifact & {
  staleSince?: string;
  invalidatedBy?: BlueprintStaleSource;
};

type StaleableJob = BlueprintGenerationJob & {
  artifacts: StaleableArtifact[];
  staleArtifactIds?: string[];
};

export interface BlueprintInvalidateDownstreamOptions {
  reason: BlueprintStaleReason;
  triggeringArtifactId: string;
  triggeringArtifactType: BlueprintGenerationArtifactType;
  now?: () => string;
}

export interface BlueprintInvalidateDownstreamLogContext {
  logger: Pick<BlueprintLogger, "debug" | "info">;
}

export function invalidateDownstream(
  job: BlueprintGenerationJob,
  fromStage: BlueprintGenerationStage,
  options: BlueprintInvalidateDownstreamOptions,
): BlueprintGenerationJob {
  const downstreamStages = new Set(getTransitiveDownstreamStages(fromStage));
  if (downstreamStages.size === 0) {
    return job;
  }

  const staleableArtifacts = job.artifacts as StaleableArtifact[];
  const triggeredAt = options.now?.() ?? new Date().toISOString();
  let anyChanged = false;

  const artifacts = staleableArtifacts.map((artifact) => {
    const stage = mapArtifactTypeToStage(artifact.type);
    if (!stage || !downstreamStages.has(stage) || artifact.staleSince !== undefined) {
      return artifact;
    }

    anyChanged = true;
    return markArtifactStale(artifact, fromStage, options, triggeredAt);
  });

  if (!anyChanged) {
    return job;
  }

  return {
    ...job,
    artifacts,
    staleArtifactIds: buildStaleArtifactIds(artifacts),
  } as BlueprintGenerationJob;
}

export function invalidateDownstreamWithLog(
  ctx: BlueprintInvalidateDownstreamLogContext,
  job: BlueprintGenerationJob,
  fromStage: BlueprintGenerationStage,
  options: BlueprintInvalidateDownstreamOptions,
): BlueprintGenerationJob {
  const beforeStaleIds = new Set(
    buildStaleArtifactIds(job.artifacts as StaleableArtifact[]),
  );
  const result = invalidateDownstream(job, fromStage, options);
  const afterStaleIds = new Set(
    buildStaleArtifactIds((result as StaleableJob).artifacts),
  );
  let markedCount = 0;
  for (const artifactId of afterStaleIds) {
    if (!beforeStaleIds.has(artifactId)) {
      markedCount += 1;
    }
  }

  logInvalidation(
    ctx,
    job.id,
    fromStage,
    options,
    markedCount,
    beforeStaleIds.size,
  );
  return result;
}

function markArtifactStale(
  artifact: StaleableArtifact,
  fromStage: BlueprintGenerationStage,
  options: BlueprintInvalidateDownstreamOptions,
  triggeredAt: string,
): StaleableArtifact {
  const invalidatedBy: BlueprintStaleSource = {
    stage: fromStage,
    artifactId: options.triggeringArtifactId,
    artifactType: options.triggeringArtifactType,
    reason: options.reason,
    triggeredAt,
  };

  return {
    ...artifact,
    staleSince: triggeredAt,
    invalidatedBy,
  };
}

function buildStaleArtifactIds(
  artifacts: StaleableArtifact[],
): string[] {
  return artifacts
    .filter((artifact) => artifact.staleSince !== undefined)
    .map((artifact) => artifact.id);
}

function logInvalidation(
  ctx: BlueprintInvalidateDownstreamLogContext,
  jobId: string,
  fromStage: BlueprintGenerationStage,
  options: BlueprintInvalidateDownstreamOptions,
  markedArtifactCount: number,
  alreadyStaleCount: number,
): void {
  const meta = {
    jobId,
    fromStage,
    reason: options.reason,
    triggeringArtifactId: options.triggeringArtifactId,
    triggeringArtifactType: options.triggeringArtifactType,
    markedArtifactCount,
    alreadyStaleCount,
  };

  if (markedArtifactCount > 0) {
    ctx.logger.info("Blueprint downstream artifacts marked stale", meta);
    return;
  }

  ctx.logger.debug("Blueprint downstream invalidation made no changes", meta);
}
