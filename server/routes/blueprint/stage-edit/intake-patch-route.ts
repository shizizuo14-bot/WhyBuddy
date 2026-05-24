import type { RequestHandler } from "express";

import type {
  BlueprintGenerationArtifactType,
  BlueprintGenerationJob,
  BlueprintIntake,
  BlueprintStaleEditResultSummary,
} from "../../../../shared/blueprint/contracts.js";
import type {
  BlueprintIntakeStores,
  BlueprintLogger,
} from "../context.js";
import type { BlueprintJobStore } from "../job-store.js";
import { runAutoInvalidationHook } from "./auto-invalidation-hook.js";
import { detectRunningDownstreamForEdit } from "./conflict-detection.js";
import { isIntakePatchNoop } from "./intake-noop-detector.js";
import { validateIntakePatch } from "./intake-patch-validator.js";
import { findJobsByIntakeId } from "./job-locator.js";
import { logStageEditBlocked } from "./stage-edit-logger.js";

export interface CreateIntakePatchHandlerDeps {
  blueprintStores: BlueprintIntakeStores;
  jobStore: BlueprintJobStore;
  ctx: {
    logger: Pick<BlueprintLogger, "debug" | "info" | "warn">;
    now: () => Date;
  };
}

export function createIntakePatchHandler(
  deps: CreateIntakePatchHandlerDeps,
): RequestHandler {
  return (req, res) => {
    const intakeId = req.params.intakeId;
    const intake = deps.blueprintStores.intakes.get(intakeId);
    if (!intake) {
      res.status(404).json({ error: "intake_not_found" });
      return;
    }

    const parsed = validateIntakePatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        error: parsed.error,
        message: parsed.message,
      });
      return;
    }

    const isNoop = isIntakePatchNoop(intake, parsed.value);
    if (isNoop) {
      res.status(200).json({ intake });
      return;
    }

    const linkedJobs = findJobsByIntakeId(deps.jobStore, intakeId);
    for (const job of linkedJobs) {
      const runningStage = detectRunningDownstreamForEdit(job, "input");
      if (runningStage) {
        logStageEditBlocked(deps.ctx, {
          jobId: job.id,
          fromStage: "input",
          triggeringEndpoint: "intake_patch",
          runningStage,
        });
        res.status(409).json({
          error: "downstream_running",
          runningStage,
        });
        return;
      }
    }

    const updatedIntake = {
      ...intake,
      targetText: parsed.value.targetText ?? intake.targetText,
      githubUrls: parsed.value.githubUrls ?? intake.githubUrls,
      updatedAt: deps.ctx.now().toISOString(),
    };
    deps.blueprintStores.intakes.set(intakeId, updatedIntake);

    const staleEdit = invalidateLinkedJobs({
      deps,
      jobs: linkedJobs,
      updatedIntake,
    });

    const body: {
      intake: typeof updatedIntake;
      staleEdit?: BlueprintStaleEditResultSummary;
    } = { intake: updatedIntake };
    if (staleEdit.newlyStaleArtifactCount > 0) {
      body.staleEdit = staleEdit;
    }

    res.status(200).json(body);
  };
}

function invalidateLinkedJobs(input: {
  deps: CreateIntakePatchHandlerDeps;
  jobs: BlueprintGenerationJob[];
  updatedIntake: BlueprintIntake;
}): BlueprintStaleEditResultSummary {
  const newlyStaleArtifactIds = new Set<string>();
  const staleArtifactIdsSnapshot = new Set<string>();

  for (const job of input.jobs) {
    const jobWithUpdatedIntake = replaceIntakeArtifact(
      job,
      input.updatedIntake,
    );
    const triggeringArtifact = findTriggeringIntakeArtifact(jobWithUpdatedIntake);
    const result = runAutoInvalidationHook({
      job: jobWithUpdatedIntake,
      fromStage: "input",
      reason: "upstream_target_changed",
      triggeringEndpoint: "intake_patch",
      triggeringArtifactId: triggeringArtifact.id,
      triggeringArtifactType: triggeringArtifact.type,
      jobStore: input.deps.jobStore,
      ctx: input.deps.ctx,
    });
    if (jobWithUpdatedIntake !== job && result.job === jobWithUpdatedIntake) {
      input.deps.jobStore.save(jobWithUpdatedIntake);
    }

    for (const artifactId of result.newlyStaleArtifactIds) {
      newlyStaleArtifactIds.add(artifactId);
    }
    for (const artifactId of result.job.staleArtifactIds ?? []) {
      staleArtifactIdsSnapshot.add(artifactId);
    }
  }

  return {
    fromStage: "input",
    newlyStaleArtifactIds: [...newlyStaleArtifactIds],
    newlyStaleArtifactCount: newlyStaleArtifactIds.size,
    staleArtifactIdsSnapshot: [...staleArtifactIdsSnapshot],
  };
}

function replaceIntakeArtifact(
  job: BlueprintGenerationJob,
  intake: BlueprintIntake,
): BlueprintGenerationJob {
  let replaced = false;
  const artifacts = job.artifacts.map((artifact) => {
    if (artifact.type !== "intake") {
      return artifact;
    }

    replaced = true;
    return {
      ...artifact,
      summary:
        "Normalized target input and GitHub sources captured before route generation.",
      payload: intake,
    };
  });

  if (!replaced) {
    return job;
  }

  return {
    ...job,
    request: {
      ...job.request,
      targetText: intake.targetText,
      githubUrls: intake.githubUrls,
    },
    updatedAt: intake.updatedAt,
    artifacts,
  };
}

function findTriggeringIntakeArtifact(job: BlueprintGenerationJob): {
  id: string;
  type: BlueprintGenerationArtifactType;
} {
  const intakeArtifact = job.artifacts.find(
    (artifact) => artifact.type === "intake",
  );

  return {
    id: intakeArtifact?.id ?? job.request.intakeId ?? job.id,
    type: "intake",
  };
}
