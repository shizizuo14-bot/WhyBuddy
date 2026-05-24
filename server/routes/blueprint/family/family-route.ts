import type { Request, Response } from "express";

import type { BlueprintServiceContext } from "../context.js";
import type { BlueprintJobStore } from "../job-store.js";
import { buildFamilyFromJobStore } from "./family-builder.js";
import {
  logFamilyCycle,
  logFamilyRead,
  logFamilyRejected,
} from "./family-logger.js";

const FAMILY_SIZE_WARN_THRESHOLD = 100;

export interface FamilyHandlerDeps {
  jobStore: Pick<BlueprintJobStore, "get" | "list">;
  ctx: Pick<BlueprintServiceContext, "logger">;
}

export function createFamilyHandler(
  deps: FamilyHandlerDeps,
): (req: Request, res: Response) => void {
  return (req, res) => {
    const jobId = req.params.jobId;
    const job = deps.jobStore.get(jobId);

    if (!job) {
      logFamilyRejected(deps.ctx.logger, {
        requestedJobId: jobId,
        reason: "job_not_found",
      });
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    const result = buildFamilyFromJobStore(deps.jobStore.list(), job.id);
    if (result.kind === "cycle") {
      logFamilyCycle(deps.ctx.logger, {
        requestedJobId: job.id,
        jobId: result.offendingJobId,
        chainSummary: result.chainSummary,
      });
      res.status(500).json({
        error: "family_cycle_detected",
        jobId: result.offendingJobId,
      });
      return;
    }

    const familySize = result.response.jobs.length;
    if (familySize > FAMILY_SIZE_WARN_THRESHOLD) {
      deps.ctx.logger.warn("[blueprint-family] large family", {
        requestedJobId: job.id,
        rootJobId: result.response.rootJobId,
        familySize,
      });
    }

    logFamilyRead(deps.ctx.logger, {
      requestedJobId: job.id,
      rootJobId: result.response.rootJobId,
      familySize,
      replanEventCount: result.response.replanEvents.length,
    });
    res.status(200).json(result.response);
  };
}
