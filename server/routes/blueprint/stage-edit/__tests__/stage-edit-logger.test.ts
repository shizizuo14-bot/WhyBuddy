import { describe, expect, it, vi } from "vitest";

import {
  logStageEditBlocked,
  logStageEditInvalidated,
  logStageEditNoop,
} from "../stage-edit-logger.js";

function buildCtx() {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe("stage-edit logger helpers", () => {
  it("logs invalidation with a stage_edit.* key and metadata only", () => {
    const ctx = buildCtx();

    logStageEditInvalidated(ctx, {
      jobId: "job-a",
      fromStage: "input",
      reason: "upstream_target_changed",
      triggeringEndpoint: "intake_patch",
      markedArtifactCount: 3,
    });

    expect(ctx.logger.info).toHaveBeenCalledWith("stage_edit.invalidated", {
      jobId: "job-a",
      fromStage: "input",
      reason: "upstream_target_changed",
      triggeringEndpoint: "intake_patch",
      markedArtifactCount: 3,
    });
  });

  it("logs noop and blocked events at debug and warn levels", () => {
    const ctx = buildCtx();

    logStageEditNoop(ctx, {
      jobId: "job-a",
      fromStage: "clarification",
      triggeringEndpoint: "clarification_answers",
      alreadyStaleCount: 2,
    });
    logStageEditBlocked(ctx, {
      jobId: "job-a",
      fromStage: "route_generation",
      triggeringEndpoint: "route_reselection",
      runningStage: "spec_docs",
    });

    expect(ctx.logger.debug).toHaveBeenCalledWith("stage_edit.noop", {
      jobId: "job-a",
      fromStage: "clarification",
      triggeringEndpoint: "clarification_answers",
      alreadyStaleCount: 2,
    });
    expect(ctx.logger.warn).toHaveBeenCalledWith("stage_edit.blocked", {
      jobId: "job-a",
      fromStage: "route_generation",
      triggeringEndpoint: "route_reselection",
      runningStage: "spec_docs",
    });
  });
});
