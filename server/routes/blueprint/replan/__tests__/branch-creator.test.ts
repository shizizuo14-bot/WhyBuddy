import { describe, expect, it } from "vitest";
import { mapArtifactTypeToStage } from "../../staleness/dependency-graph.js";
import {
  buildFixtureStaleSource,
  buildFullChainJob,
} from "../../staleness/__tests__/__fixtures__/build-fixture-job.js";
import { buildBranchJob } from "../branch-creator.js";

describe("buildBranchJob", () => {
  it("copies only strict upstream artifacts, deep clones payloads, clears stale markers, and leaves parent unchanged", () => {
    const parent = buildFullChainJob({ staleStages: ["input", "clarification"] });
    parent.artifacts[0] = {
      ...parent.artifacts[0],
      payload: { nested: { value: "original" } },
      staleSince: "2026-05-23T01:00:00.000Z",
      invalidatedBy: buildFixtureStaleSource(),
    } as any;
    const parentSnapshot = structuredClone(parent);

    const result = buildBranchJob({
      parentJob: parent,
      fromStage: "route_generation",
      now: () => "2026-05-23T02:00:00.000Z",
      newJobId: "branch-job",
    });

    expect(result.job).toMatchObject({
      id: "branch-job",
      parentJobId: parent.id,
      branchedAt: "2026-05-23T02:00:00.000Z",
      branchedFromStage: "route_generation",
      stage: "route_generation",
      status: "pending",
      staleArtifactIds: [],
      events: [],
    });
    expect(result.inheritedUpstreamArtifactIds).toEqual([
      "artifact-input",
      "artifact-clarification",
    ]);
    expect(
      result.job.artifacts.map((artifact) => mapArtifactTypeToStage(artifact.type)),
    ).toEqual(["input", "clarification"]);
    expect((result.job.artifacts[0] as any).staleSince).toBeUndefined();
    expect((result.job.artifacts[0] as any).invalidatedBy).toBeUndefined();
    expect(result.job.artifacts[0].payload).toEqual(parent.artifacts[0].payload);
    expect(result.job.artifacts[0].payload).not.toBe(parent.artifacts[0].payload);

    (result.job.artifacts[0].payload as any).nested.value = "branch mutation";
    expect((parent.artifacts[0].payload as any).nested.value).toBe("original");
    expect(parent).toEqual(parentSnapshot);
  });
});
