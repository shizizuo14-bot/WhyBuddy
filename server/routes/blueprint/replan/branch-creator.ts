import { randomUUID } from "node:crypto";

import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../shared/blueprint/contracts.js";
import {
  getTransitiveDownstreamStages,
  mapArtifactTypeToStage,
} from "../staleness/dependency-graph.js";

export interface BuildBranchJobInput {
  parentJob: BlueprintGenerationJob;
  fromStage: BlueprintGenerationStage;
  now: () => string;
  newJobId?: string;
}

export interface BuildBranchJobResult {
  job: BlueprintGenerationJob;
  inheritedUpstreamArtifactIds: string[];
}

export function buildBranchJob(input: BuildBranchJobInput): BuildBranchJobResult {
  const branchedAt = input.now();
  const downstreamStages = new Set([
    input.fromStage,
    ...getTransitiveDownstreamStages(input.fromStage),
  ]);
  const inheritedArtifacts = input.parentJob.artifacts
    .filter((artifact) => {
      const stage = mapArtifactTypeToStage(artifact.type);
      return stage !== undefined && !downstreamStages.has(stage);
    })
    .map(cloneForBranch);

  const job: BlueprintGenerationJob = {
    id: input.newJobId ?? randomUUID(),
    request: input.parentJob.request,
    status: "pending",
    stage: input.fromStage,
    projectId: input.parentJob.projectId,
    sourceId: input.parentJob.sourceId,
    version: input.parentJob.version,
    createdAt: branchedAt,
    updatedAt: branchedAt,
    artifacts: inheritedArtifacts,
    events: [],
    staleArtifactIds: [],
    parentJobId: input.parentJob.id,
    branchedAt,
    branchedFromStage: input.fromStage,
  };

  return {
    job,
    inheritedUpstreamArtifactIds: inheritedArtifacts.map((artifact) => artifact.id),
  };
}

function cloneForBranch(
  artifact: BlueprintGenerationArtifact,
): BlueprintGenerationArtifact {
  const cloned = structuredClone(artifact) as BlueprintGenerationArtifact;
  delete (cloned as any).staleSince;
  delete (cloned as any).invalidatedBy;
  return cloned;
}
