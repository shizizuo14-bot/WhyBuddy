import { describe, expect, it } from "vitest";

import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import { detectRunningDownstreamForEdit } from "../conflict-detection.js";

function buildJob(
  overrides: Partial<BlueprintGenerationJob> = {},
): BlueprintGenerationJob {
  return {
    id: "job-conflict",
    request: { targetText: "Check running downstream work." },
    status: "completed",
    stage: "input",
    version: "v1",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    artifacts: [],
    events: [],
    ...overrides,
  };
}

describe("detectRunningDownstreamForEdit", () => {
  it("returns the running downstream stage when a job is actively generating below the edit stage", () => {
    const job = buildJob({
      stage: "spec_tree",
      status: "running",
    });

    expect(detectRunningDownstreamForEdit(job, "input")).toBe("spec_tree");
  });

  it("ignores running work that is not downstream of the edited stage", () => {
    const job = buildJob({
      stage: "input",
      status: "running",
    });

    expect(detectRunningDownstreamForEdit(job, "route_generation")).toBeNull();
  });

  it("treats non-terminal downstream handoff state as a conflict", () => {
    const job = buildJob({
      stage: "spec_docs",
      handoffState: "reviewing",
    });

    expect(detectRunningDownstreamForEdit(job, "spec_tree")).toBe("spec_docs");
  });

  it("treats downstream non-review next actions as conflicts and ignores review actions", () => {
    const blockingJob = buildJob({
      nextAction: {
        type: "select_route",
        label: "Select route",
        stage: "route_generation",
        required: true,
      },
    });
    const reviewJob = buildJob({
      nextAction: {
        type: "review_spec_documents",
        label: "Review spec documents",
        stage: "spec_docs",
        required: true,
      },
    });

    expect(detectRunningDownstreamForEdit(blockingJob, "input")).toBe(
      "route_generation",
    );
    expect(detectRunningDownstreamForEdit(reviewJob, "spec_tree")).toBeNull();
  });
});
