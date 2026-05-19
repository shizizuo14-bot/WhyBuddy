import { describe, expect, it } from "vitest";

import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import { createArtifactMemoryService } from "./service.js";

function makeEvent(id: string): BlueprintGenerationEvent {
  return {
    id,
    jobId: "job-1",
    type: BlueprintEventName.EvidenceRecorded,
    family: "evidence",
    stage: "engineering_handoff",
    status: "completed",
    message: "evidence recorded",
    occurredAt: "2026-05-07T01:00:00.000Z",
  };
}

function makeJob(events: BlueprintGenerationEvent[] = []): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: {},
    status: "pending",
    stage: "input",
    version: "v1",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    artifacts: [],
    events,
  };
}

describe("createArtifactMemoryService (shell)", () => {
  it("listEvents 仅通过 ctx.replayStore（需求 5.3）", () => {
    const job = makeJob([makeEvent("evt-1"), makeEvent("evt-2")]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createArtifactMemoryService(ctx);
    expect(service.listEvents("job-1").map(e => e.id)).toEqual(["evt-1", "evt-2"]);
    expect(service.listEvents("missing")).toEqual([]);
  });

  it("未知 jobId 返回空数组", () => {
    const jobStore = createMemoryBlueprintJobStore();
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createArtifactMemoryService(ctx);
    expect(service.listLedger("missing")).toEqual([]);
    expect(service.listReplays("missing")).toEqual([]);
    expect(service.listFeedback("missing")).toEqual([]);
    expect(service.listEvents("missing")).toEqual([]);
  });

  it("事件源唯一：向 jobStore 添加的事件必须通过 replayStore 读出来，两者必须同一条", () => {
    const jobStore = createMemoryBlueprintJobStore([makeJob([makeEvent("evt-1")])]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createArtifactMemoryService(ctx);
    const fromReplayStore = service.listEvents("job-1");
    const fromJobStore = ctx.jobStore.get("job-1")?.events ?? [];
    expect(fromReplayStore).toEqual(fromJobStore);
  });
});
