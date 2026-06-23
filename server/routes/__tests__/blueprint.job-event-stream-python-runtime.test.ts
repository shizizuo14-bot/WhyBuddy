import { describe, expect, it, vi, afterEach } from "vitest";

import { BlueprintEventName } from "../../../shared/blueprint/events.js";
import type { BlueprintGenerationEvent } from "../../../shared/blueprint/index.js";
import {
  createMemoryBlueprintJobStore,
} from "../blueprint.js";
import { buildBlueprintServiceContext } from "../blueprint/context.js";
import { createJobService } from "../blueprint/jobs/service.js";
import {
  createBlueprintEventBus,
  mapPythonJobEventToNodeEvent,
} from "../blueprint/event-bus.js";

const FIXED_NOW = "2026-06-23T12:00:00.000Z";

function makeJob(id: string, overrides: any = {}) {
  return {
    id,
    request: { projectId: "proj-1" },
    status: "running",
    stage: "input",
    version: "v1",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    artifacts: [],
    events: [],
    ...overrides,
  };
}

describe("Blueprint job event stream Python runtime mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("maps python created/running event envelope preserving metadata", () => {
    const pyEnv = {
      id: "py-evt-1",
      jobId: "job-py-1",
      type: BlueprintEventName.JobStage,
      family: "job",
      status: "running",
      stageId: "spec_tree",
      projectId: "proj-py",
      actor: { id: "actor-py" },
      causation: { traceId: "trace-py" },
      occurredAt: FIXED_NOW,
      message: "job running from python",
    };

    const mapped = mapPythonJobEventToNodeEvent(pyEnv);
    expect(mapped).not.toBeNull();
    expect(mapped!.jobId).toBe("job-py-1");
    expect(mapped!.stage).toBe("spec_tree");
    expect((mapped as any).projectId).toBe("proj-py");
    expect((mapped as any).actor).toEqual({ id: "actor-py" });
    expect((mapped as any).causation).toEqual({ traceId: "trace-py" });
    expect(mapped!.status).toBe("running");
  });

  it("maps failed python event and does not masquerade as completed", () => {
    const pyFail = {
      id: "py-fail-1",
      jobId: "job-f-1",
      status: "failed",
      stageId: "build",
      error: { code: "runtime_failed", message: "python failed", stage: "build" },
      occurredAt: FIXED_NOW,
    };
    const mapped = mapPythonJobEventToNodeEvent(pyFail);
    expect(mapped!.status).toBe("failed");
    expect(mapped!.status).not.toBe("completed");
    expect((mapped as any).error).toBeDefined();
    expect((mapped as any).error.code).toBe("runtime_failed");
  });

  it("maps cancelled python event without rewriting to completed", () => {
    const pyCancel = {
      id: "py-c-1",
      jobId: "job-c-1",
      status: "cancelled",
      stageId: "input",
      occurredAt: FIXED_NOW,
    };
    const mapped = mapPythonJobEventToNodeEvent(pyCancel);
    expect(mapped!.status).toBe("failed"); // per alignment in mapper for node store compat in this slice
    expect(mapped!.status).not.toBe("completed");
  });

  it("maps error envelope distinctly", () => {
    const pyErr = { jobId: "job-err", status: "error", stageId: "validate" };
    const mapped = mapPythonJobEventToNodeEvent(pyErr);
    expect(mapped).not.toBeNull();
    expect(mapped!.status).toBe("error");
  });

  it("job service + event bus can consume mapped python event", () => {
    const jobStore = createMemoryBlueprintJobStore([makeJob("job-stream")]);
    const ctx = buildBlueprintServiceContext({ jobStore, now: () => new Date(FIXED_NOW) });
    const service = createJobService(ctx);
    const bus = createBlueprintEventBus(jobStore);

    const pyEvent = {
      id: "py-stream-1",
      jobId: "job-stream",
      status: "running",
      stageId: "review",
      projectId: "p-s",
      actor: { id: "sys" },
      causation: { parent: "root" },
      occurredAt: FIXED_NOW,
    };
    const mapped = mapPythonJobEventToNodeEvent(pyEvent);
    expect(mapped).not.toBeNull();

    // use existing emit path to prove integration without rewriting full bus
    if (mapped) {
      service.emitJobEvent(mapped);
    }

    const storedJob = jobStore.get("job-stream");
    expect(storedJob?.events.length).toBeGreaterThan(0);
    const last = storedJob?.events[storedJob.events.length - 1];
    expect(last?.jobId).toBe("job-stream");
    expect(last?.stage).toBe("review");
    // metadata carried
    expect((last as any)?.actor).toEqual({ id: "sys" });
  });

  it("python event stream contract shape roundtrips through node mapping without completed forgery", () => {
    const pyCompleted = { jobId: "j-c", status: "completed", stageId: "done" };
    const pyFailed = { jobId: "j-f", status: "failed", stageId: "done" };

    const m1 = mapPythonJobEventToNodeEvent(pyCompleted)!;
    const m2 = mapPythonJobEventToNodeEvent(pyFailed)!;

    expect(m1.status).toBe("completed");
    expect(m2.status).toBe("failed");
    expect(m2.status).not.toBe("completed");
  });
});
