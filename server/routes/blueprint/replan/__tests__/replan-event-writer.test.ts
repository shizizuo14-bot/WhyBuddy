import { describe, expect, it } from "vitest";
import { BlueprintEventName, resolveBlueprintEventFamily } from "../../../../../shared/blueprint/events.js";
import { buildFullChainJob } from "../../staleness/__tests__/__fixtures__/build-fixture-job.js";
import { writeReplanTriggeredEvent } from "../replan-event-writer.js";

describe("writeReplanTriggeredEvent", () => {
  it("appends a replan.triggered event using the shared event family resolver", () => {
    const job = buildFullChainJob();
    const evented = writeReplanTriggeredEvent(job, {
      eventId: "event-replan",
      jobId: job.id,
      fromStage: "spec_tree",
      mode: "in_place",
      reason: "x".repeat(600),
      triggeredAt: "2026-05-23T03:00:00.000Z",
      markedStaleArtifactCount: 4,
      markedStaleArtifactIds: ["artifact-spec_docs"],
    });

    expect(job.events).toEqual([]);
    expect(evented.events).toHaveLength(1);
    expect(evented.events[0]).toMatchObject({
      id: "event-replan",
      jobId: job.id,
      type: BlueprintEventName.ReplanTriggered,
      family: "job",
      stage: "spec_tree",
      status: "running",
      occurredAt: "2026-05-23T03:00:00.000Z",
      payload: {
        jobId: job.id,
        fromStage: "spec_tree",
        mode: "in_place",
        reason: "x".repeat(500),
        triggeredAt: "2026-05-23T03:00:00.000Z",
        markedStaleArtifactCount: 4,
        markedStaleArtifactIds: ["artifact-spec_docs"],
      },
    });
    expect(resolveBlueprintEventFamily(BlueprintEventName.ReplanTriggered)).toBe(
      "job",
    );
  });
});
