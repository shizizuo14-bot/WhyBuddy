import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
} from "../../../../../shared/blueprint/contracts.js";
import { invalidateDownstreamWithLog } from "../../staleness/invalidate-downstream.js";
import { runAutoInvalidationHook } from "../auto-invalidation-hook.js";

vi.mock("../../staleness/invalidate-downstream.js", () => ({
  invalidateDownstreamWithLog: vi.fn(),
}));

const mockedInvalidateDownstreamWithLog = vi.mocked(
  invalidateDownstreamWithLog,
);

function buildArtifact(
  id: string,
  type: BlueprintGenerationArtifact["type"],
): BlueprintGenerationArtifact {
  return {
    id,
    type,
    title: id,
    summary: id,
    createdAt: "2026-05-23T00:00:00.000Z",
  };
}

function buildJob(
  overrides: Partial<BlueprintGenerationJob> = {},
): BlueprintGenerationJob {
  return {
    id: "job-stage-edit",
    request: { targetText: "Build a careful stage edit backend." },
    status: "completed",
    stage: "engineering_landing",
    version: "v1",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    artifacts: [buildArtifact("artifact-input", "intake")],
    events: [],
    staleArtifactIds: [],
    ...overrides,
  };
}

function buildInput(job: BlueprintGenerationJob) {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const jobStore = {
    list: vi.fn(() => [job]),
    get: vi.fn(() => job),
    save: vi.fn(),
    latest: vi.fn(() => job),
  };

  return {
    job,
    fromStage: "input" as const,
    reason: "upstream_target_changed" as const,
    triggeringEndpoint: "intake_patch" as const,
    triggeringArtifactId: "artifact-input",
    triggeringArtifactType: "intake" as const,
    jobStore,
    ctx: {
      logger,
      now: () => new Date("2026-05-23T01:00:00.000Z"),
    },
  };
}

describe("runAutoInvalidationHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the staleness engine, saves the invalidated job, and returns the newly stale summary", () => {
    const job = buildJob({ staleArtifactIds: ["already-stale"] });
    const invalidatedJob = buildJob({
      staleArtifactIds: ["already-stale", "newly-stale-a", "newly-stale-b"],
    });
    mockedInvalidateDownstreamWithLog.mockReturnValue(invalidatedJob);

    const input = buildInput(job);
    const result = runAutoInvalidationHook(input);

    expect(mockedInvalidateDownstreamWithLog).toHaveBeenCalledWith(
      { logger: input.ctx.logger },
      job,
      "input",
      {
        reason: "upstream_target_changed",
        triggeringArtifactId: "artifact-input",
        triggeringArtifactType: "intake",
        now: expect.any(Function),
      },
    );
    expect(input.jobStore.save).toHaveBeenCalledWith(invalidatedJob);
    expect(result).toEqual({
      job: invalidatedJob,
      newlyStaleArtifactIds: ["newly-stale-a", "newly-stale-b"],
      newlyStaleArtifactCount: 2,
    });
    expect(input.ctx.logger.info).toHaveBeenCalledWith(
      "stage_edit.invalidated",
      expect.objectContaining({
        jobId: "job-stage-edit",
        fromStage: "input",
        reason: "upstream_target_changed",
        triggeringEndpoint: "intake_patch",
        markedArtifactCount: 2,
      }),
    );
  });

  it("keeps the edit flow alive when the staleness engine throws", () => {
    const job = buildJob({ staleArtifactIds: ["already-stale"] });
    mockedInvalidateDownstreamWithLog.mockImplementation(() => {
      throw new Error("engine unavailable");
    });

    const input = buildInput(job);
    const result = runAutoInvalidationHook(input);

    expect(result).toEqual({
      job,
      newlyStaleArtifactIds: [],
      newlyStaleArtifactCount: 0,
    });
    expect(input.jobStore.save).not.toHaveBeenCalled();
    expect(input.ctx.logger.warn).toHaveBeenCalledWith(
      "stage_edit.invalidation_failed",
      expect.objectContaining({
        jobId: "job-stage-edit",
        fromStage: "input",
        triggeringEndpoint: "intake_patch",
        error: "engine unavailable",
      }),
    );
  });
});
