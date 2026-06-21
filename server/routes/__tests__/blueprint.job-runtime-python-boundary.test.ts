import { afterEach, describe, expect, it, vi } from "vitest";

import type { BlueprintGenerationJob } from "../../../shared/blueprint/index.js";
import type { BlueprintJobRuntimeResult } from "../../../shared/blueprint/jobs/types.js";
import { createMemoryBlueprintJobStore } from "../blueprint.js";
import { buildBlueprintServiceContext } from "../blueprint/context.js";
import { createJobService } from "../blueprint/jobs/service.js";

const FIXED_TIMESTAMP = "2026-06-20T00:00:00.000Z";
const NEXT_TIMESTAMP = "2026-06-20T00:02:00.000Z";

function makeJob(
  id = "job-1",
  overrides: Partial<BlueprintGenerationJob> = {},
): BlueprintGenerationJob {
  return {
    id,
    request: {
      projectId: "project-1",
      targetText: "Build a job runtime boundary",
    },
    status: "running",
    stage: "spec_tree",
    version: "v1",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    artifacts: [
      {
        id: "artifact-node",
        type: "spec_tree",
        title: "Node-owned artifact",
        summary: "Must remain in Node job store.",
        createdAt: FIXED_TIMESTAMP,
        payload: {},
      },
    ],
    events: [],
    ...overrides,
  };
}

function makeRuntimeJob(
  overrides: Partial<NonNullable<BlueprintJobRuntimeResult["job"]>> = {},
): NonNullable<BlueprintJobRuntimeResult["job"]> {
  return {
    id: "job-1",
    request: {
      projectId: "project-1",
      targetText: "Build a job runtime boundary",
    },
    status: "running",
    stage: "spec_tree",
    version: "v1",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: NEXT_TIMESTAMP,
    artifacts: [],
    events: [],
    ...overrides,
  };
}

function successResponse(
  action: BlueprintJobRuntimeResult["action"],
  job: NonNullable<BlueprintJobRuntimeResult["job"]>,
): BlueprintJobRuntimeResult {
  return {
    ok: true,
    action,
    contractVersion: "blueprint.job-runtime.proxy.v1",
    runtime: {
      owner: "python",
      persistenceOwner: "node",
      mode: "proxy_contract",
    },
    job,
  };
}

function makeService(initialJobs: BlueprintGenerationJob[] = [makeJob()]) {
  const jobStore = createMemoryBlueprintJobStore(initialJobs);
  const ctx = buildBlueprintServiceContext({
    jobStore,
    now: () => new Date(FIXED_TIMESTAMP),
  });
  return { service: createJobService(ctx), jobStore };
}

describe("Blueprint job runtime Python boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts completed Python envelopes while preserving Node-owned artifacts and events", async () => {
    vi.stubEnv("BLUEPRINT_JOB_RUNTIME_PYTHON_PROXY", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          successResponse(
            "complete",
            makeRuntimeJob({
              status: "completed",
              completedAt: NEXT_TIMESTAMP,
            }),
          ),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { service, jobStore } = makeService([makeJob()]);

    const result = await service.completeJob("job-1", { now: NEXT_TIMESTAMP });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.action : null).toBe("complete");
    expect(result.ok ? result.job.status : null).toBe("completed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://python.test/api/blueprint/jobs/runtime/complete",
      expect.objectContaining({ method: "POST" }),
    );
    const persisted = jobStore.get("job-1");
    expect(persisted?.status).toBe("completed");
    expect(persisted?.completedAt).toBe(NEXT_TIMESTAMP);
    expect(persisted?.artifacts).toHaveLength(1);
    expect(persisted?.events).toEqual([]);
  });

  it("accepts failed Python envelopes without converting them to completed", async () => {
    vi.stubEnv("BLUEPRINT_JOB_RUNTIME_PYTHON_PROXY", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          successResponse(
            "fail",
            makeRuntimeJob({
              status: "failed",
              completedAt: NEXT_TIMESTAMP,
              error: {
                code: "runtime_failed",
                message: "worker failed",
                stage: "spec_tree",
              },
            }),
          ),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { service, jobStore } = makeService([makeJob()]);

    const result = await service.failJob("job-1", {
      error: {
        code: "runtime_failed",
        message: "worker failed",
        stage: "spec_tree",
      },
      now: NEXT_TIMESTAMP,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.job.status : null).toBe("failed");
    expect(result.ok ? result.job.status : null).not.toBe("completed");
    expect(jobStore.get("job-1")?.status).toBe("failed");
    expect(jobStore.get("job-1")?.error?.code).toBe("runtime_failed");
  });

  it("does not write Python not_found envelopes into the Node job store", async () => {
    vi.stubEnv("BLUEPRINT_JOB_RUNTIME_PYTHON_PROXY", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          action: "complete",
          contractVersion: "blueprint.job-runtime.proxy.v1",
          error: "not_found",
          message: "Blueprint job missing was not found in the Node job store.",
          jobId: "missing",
        } satisfies BlueprintJobRuntimeResult),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { service, jobStore } = makeService([]);

    const result = await service.completeJob("missing", { now: NEXT_TIMESTAMP });

    expect(result).toMatchObject({
      ok: false,
      action: "complete",
      error: "not_found",
      jobId: "missing",
    });
    expect(jobStore.get("missing")).toBeNull();
  });
});
