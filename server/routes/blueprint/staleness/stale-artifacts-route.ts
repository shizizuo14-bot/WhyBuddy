import type { Request, Response } from "express";
import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintServiceContext } from "../context.js";
import type { BlueprintJobStore } from "../job-store.js";
import { mapArtifactTypeToStage } from "./dependency-graph.js";
import type { BlueprintStaleSource } from "./invalidate-downstream.js";

export interface StaleArtifactsHandlerDeps {
  jobStore: Pick<BlueprintJobStore, "get">;
  ctx?: Pick<BlueprintServiceContext, "logger">;
}

export function createStaleArtifactsHandler(
  deps: StaleArtifactsHandlerDeps,
): (req: Request, res: Response) => void {
  return (req, res) => {
    const jobId = req.params.jobId;
    const job = deps.jobStore.get(jobId);
    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    res.status(200).json({
      jobId,
      generatedAt: new Date().toISOString(),
      staleArtifacts: (job as StaleableJob).artifacts
        .filter(isStaleArtifact)
        .map((artifact) => ({
          artifactId: artifact.id,
          artifactType: artifact.type,
          stage: mapArtifactTypeToStage(artifact.type),
          staleSince: artifact.staleSince,
          invalidatedBy: artifact.invalidatedBy,
        })),
    });
  };
}

function isStaleArtifact(
  artifact: StaleableArtifact,
): artifact is StaleableArtifact &
  Required<Pick<StaleableArtifact, "staleSince" | "invalidatedBy">> {
  return artifact.staleSince !== undefined && artifact.invalidatedBy !== undefined;
}

type StaleableArtifact = BlueprintGenerationArtifact & {
  staleSince?: string;
  invalidatedBy?: BlueprintStaleSource;
};

type StaleableJob = BlueprintGenerationJob & {
  artifacts: StaleableArtifact[];
};
