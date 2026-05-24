import type { RequestHandler } from "express";

import { detectRunningDownstream } from "./guards/running-stage-guard.js";
import { validateReplanInput } from "./guards/validate-input.js";
import { handleBranchReplan } from "./handlers/handle-branch.js";
import { handleInPlaceReplan } from "./handlers/handle-in-place.js";
import { logReplanBlocked, logReplanRejected } from "./replan-logger.js";
import type { BlueprintReplanDeps, BlueprintReplanMode } from "./types.js";

export function createReplanHandler(deps: BlueprintReplanDeps): RequestHandler {
  return (req, res) => {
    const validation = validateReplanInput(req.body);
    if (!validation.ok) {
      logReplanRejected(deps.ctx, {
        jobId: req.params.jobId ?? null,
        reason: validation.error,
        fromStage: null,
        mode: extractMode(req.body),
      });
      res.status(validation.status).json({ error: validation.error });
      return;
    }

    const jobId = req.params.jobId;
    const job = deps.jobStore.get(jobId);
    if (!job) {
      logReplanRejected(deps.ctx, {
        jobId,
        reason: "job_not_found",
        fromStage: validation.value.fromStage,
        mode: validation.value.mode,
      });
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    const running = detectRunningDownstream(job, validation.value.fromStage);
    if (running) {
      logReplanBlocked(deps.ctx, {
        jobId,
        fromStage: validation.value.fromStage,
        mode: validation.value.mode,
        runningStage: running.runningStage,
      });
      res.status(409).json({
        error: "downstream_running",
        runningStage: running.runningStage,
      });
      return;
    }

    try {
      const response =
        validation.value.mode === "in_place"
          ? handleInPlaceReplan({
              job,
              fromStage: validation.value.fromStage,
              reason: validation.value.reason,
              jobStore: deps.jobStore,
              ctx: deps.ctx,
            })
          : handleBranchReplan({
              parentJob: job,
              fromStage: validation.value.fromStage,
              reason: validation.value.reason,
              jobStore: deps.jobStore,
              ctx: deps.ctx,
              newJobId: deps.newJobId,
            });

      res.status(200).json(response);
    } catch (err) {
      deps.ctx.logger.error("replan.internal_error", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "internal_error" });
    }
  };
}

function extractMode(body: unknown): BlueprintReplanMode | null {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    ((body as Record<string, unknown>).mode === "in_place" ||
      (body as Record<string, unknown>).mode === "branch")
  ) {
    return (body as Record<string, BlueprintReplanMode>).mode;
  }
  return null;
}
