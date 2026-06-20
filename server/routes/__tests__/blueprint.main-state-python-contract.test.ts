import { describe, expect, it } from "vitest";

import type { BlueprintGenerationJob } from "../../../shared/blueprint/index.js";
import {
  BLUEPRINT_MAIN_STATE_PYTHON_CONTRACT_VERSION,
  isBlueprintMainStatePythonProjection,
  projectBlueprintMainStateFromPython,
} from "../../../shared/blueprint/blueprint-main-state-contract.js";

function makeProjection(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: BLUEPRINT_MAIN_STATE_PYTHON_CONTRACT_VERSION,
    kind: "blueprint.main.state_projection",
    stateAuthority: "node",
    stateMutation: "none",
    jobId: "job-blueprint-main-state",
    stage: "spec_tree",
    status: "running",
    nodeStatus: "running",
    updatedAt: "2026-06-20T00:00:01.000Z",
    stale: true,
    staleArtifactIds: ["artifact-spec-tree"],
    artifacts: [
      {
        id: "artifact-route-set",
        type: "route_set",
        title: "Route set",
        summary: "Candidate Blueprint routes.",
        createdAt: "2026-06-20T00:00:00.000Z",
        stale: false,
      },
      {
        id: "artifact-spec-tree",
        type: "spec_tree",
        title: "SPEC tree",
        summary: "Generated tree awaiting review.",
        createdAt: "2026-06-20T00:00:01.000Z",
        stale: true,
        staleSince: "2026-06-20T00:00:02.000Z",
        invalidatedBy: {
          stage: "route_generation",
          artifactId: "artifact-route-set",
          artifactType: "route_set",
          reason: "upstream_route_selection_changed",
          triggeredAt: "2026-06-20T00:00:02.000Z",
        },
      },
    ],
    ...overrides,
  };
}

describe("Blueprint main state Python contract", () => {
  it("accepts the minimum Python state projection and maps it to shared Blueprint job shape", () => {
    const projection = makeProjection();

    expect(isBlueprintMainStatePythonProjection(projection)).toBe(true);

    const job = projectBlueprintMainStateFromPython(projection);

    expect(job).not.toBeNull();
    expect(job?.id).toBe("job-blueprint-main-state");
    expect(job?.stage).toBe("spec_tree");
    expect(job?.status).toBe("running");
    expect(job?.staleArtifactIds).toEqual(["artifact-spec-tree"]);
    expect(job?.artifacts).toHaveLength(2);
    expect(job?.artifacts[1]).toMatchObject({
      id: "artifact-spec-tree",
      type: "spec_tree",
      staleSince: "2026-06-20T00:00:02.000Z",
    });

    const typedJob: Pick<
      BlueprintGenerationJob,
      "id" | "stage" | "status" | "artifacts" | "staleArtifactIds" | "error"
    > = job!;
    expect(typedJob.status).toBe("running");
  });

  it("keeps Python done compatible with Node completed status", () => {
    const projection = makeProjection({
      status: "done",
      nodeStatus: "completed",
      stale: false,
      staleArtifactIds: [],
      artifacts: [],
    });

    expect(isBlueprintMainStatePythonProjection(projection)).toBe(true);
    expect(projectBlueprintMainStateFromPython(projection)?.status).toBe("completed");
  });

  it("keeps stale as a projection marker instead of pretending it is a Node job status", () => {
    const projection = makeProjection({
      status: "stale",
      nodeStatus: "completed",
      stale: true,
      staleArtifactIds: ["artifact-spec-tree"],
    });

    expect(isBlueprintMainStatePythonProjection(projection)).toBe(true);

    const job = projectBlueprintMainStateFromPython(projection);
    expect(job?.status).toBe("completed");
    expect(job?.staleArtifactIds).toEqual(["artifact-spec-tree"]);
    expect(job?.status).not.toBe("failed");
  });

  it("keeps failed/error projection from masquerading as success", () => {
    const failed = makeProjection({
      status: "failed",
      nodeStatus: "failed",
      stale: false,
      staleArtifactIds: [],
      error: {
        code: "spec_tree_generation_failed",
        message: "SPEC tree generation failed validation.",
        stage: "spec_tree",
      },
    });

    expect(isBlueprintMainStatePythonProjection(failed)).toBe(true);
    expect(projectBlueprintMainStateFromPython(failed)?.status).toBe("failed");

    expect(
      isBlueprintMainStatePythonProjection({
        ...failed,
        status: "done",
      }),
    ).toBe(false);
    expect(
      isBlueprintMainStatePythonProjection({
        ...failed,
        error: undefined,
      }),
    ).toBe(false);
  });

  it("rejects projections that include full Blueprint runtime state", () => {
    const projection = makeProjection({
      request: { targetText: "do not accept full request state" },
      events: [],
      nextAction: { type: "generate", label: "Generate", stage: "spec_docs" },
    });

    expect(isBlueprintMainStatePythonProjection(projection)).toBe(false);
    expect(projectBlueprintMainStateFromPython(projection)).toBeNull();
  });
});
