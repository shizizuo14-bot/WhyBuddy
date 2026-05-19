import { describe, expect, it } from "vitest";

import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import { createJobService } from "./service.js";

function makeJob(id: string): BlueprintGenerationJob {
  return {
    id,
    request: {},
    status: "pending",
    stage: "input",
    version: "v1",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    artifacts: [],
    events: [],
  };
}

function makeEvent(id: string, jobId: string): BlueprintGenerationEvent {
  return {
    id,
    jobId,
    type: BlueprintEventName.JobStage,
    family: "job",
    stage: "input",
    status: "running",
    message: "test",
    occurredAt: "2026-05-07T01:00:00.000Z",
  };
}

describe("createJobService (shell)", () => {
  it("list / get / latest 对接 ctx.jobStore", () => {
    const jobStore = createMemoryBlueprintJobStore([
      makeJob("job-1"),
      makeJob("job-2"),
    ]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createJobService(ctx);
    expect(service.listJobs()).toHaveLength(2);
    expect(service.getJob("job-1")?.id).toBe("job-1");
    expect(service.getJob("unknown")).toBeNull();
    expect(service.getLatestJob()?.id).toBeDefined();
  });

  it("emitJobEvent 通过 ctx.eventBus 走同一条管线", () => {
    const jobStore = createMemoryBlueprintJobStore([makeJob("job-1")]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createJobService(ctx);

    const received: string[] = [];
    ctx.eventBus.subscribe(event => received.push(event.id));

    service.emitJobEvent(makeEvent("evt-1", "job-1"));

    expect(received).toEqual(["evt-1"]);
    expect(ctx.jobStore.get("job-1")?.events).toHaveLength(1);
  });
});
