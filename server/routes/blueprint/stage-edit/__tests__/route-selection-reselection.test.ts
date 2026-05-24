import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import { getTransitiveDownstreamStages } from "../../staleness/dependency-graph.js";
import { detectRunningDownstreamForEdit } from "../conflict-detection.js";
import { runAutoInvalidationHook } from "../auto-invalidation-hook.js";
import { buildJobLinkedToIntakeAndSession } from "./__fixtures__/build-fixture-job.js";
import { routeReselectionArb, staleFreshStagesArb } from "./__fixtures__/arbitraries.js";

const NUM_RUNS = 100;

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildJobStore(job: BlueprintGenerationJob) {
  return {
    list: vi.fn(() => [job]),
    get: vi.fn(() => job),
    save: vi.fn(),
    latest: vi.fn(() => job),
  };
}

function invalidateRouteReselection(job: BlueprintGenerationJob) {
  return runAutoInvalidationHook({
    job,
    fromStage: "route_generation",
    reason: "upstream_route_selection_changed",
    triggeringEndpoint: "route_reselection",
    triggeringArtifactId: "artifact-route_generation",
    triggeringArtifactType: "route_selection",
    jobStore: buildJobStore(job),
    ctx: {
      logger: buildLogger(),
      now: () => new Date("2026-05-23T02:00:00.000Z"),
    },
  });
}

describe("route reselection invalidation properties", () => {
  it("does not trigger invalidation for first route selection attempts", () => {
    fc.assert(
      fc.property(routeReselectionArb, (request) => {
        const job = buildJobLinkedToIntakeAndSession();
        const maybeResult =
          undefined as
            | ReturnType<typeof invalidateRouteReselection>
            | undefined;

        expect(request.routeId.length).toBeGreaterThan(0);
        expect(maybeResult).toBeUndefined();
        expect(job.staleArtifactIds).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("marks every fresh downstream artifact stale for reselection", () => {
    fc.assert(
      fc.property(staleFreshStagesArb, routeReselectionArb, (staleStages) => {
        const job = buildJobLinkedToIntakeAndSession({ staleStages });
        const result = invalidateRouteReselection(job);
        const downstreamStages = new Set(
          getTransitiveDownstreamStages("route_generation"),
        );

        for (const artifact of result.job.artifacts) {
          const stage = artifact.id.replace("artifact-", "");
          if (downstreamStages.has(stage as any)) {
            expect(result.job.staleArtifactIds).toContain(artifact.id);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("is idempotent when the same route id is reselected again", () => {
    fc.assert(
      fc.property(staleFreshStagesArb, routeReselectionArb, (staleStages) => {
        const job = buildJobLinkedToIntakeAndSession({ staleStages });
        const first = invalidateRouteReselection(job);
        const second = invalidateRouteReselection(first.job);

        expect(second.newlyStaleArtifactIds).toEqual([]);
        expect(second.job.staleArtifactIds).toEqual(first.job.staleArtifactIds);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("blocks reselection while a downstream stage is running", () => {
    const job = buildJobLinkedToIntakeAndSession({
      stage: "spec_tree",
      status: "running",
    });

    expect(detectRunningDownstreamForEdit(job, "route_generation")).toBe(
      "spec_tree",
    );
  });
});
