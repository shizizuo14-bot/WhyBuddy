import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BlueprintGenerationStage } from "../../../../../shared/blueprint/contracts.js";
import { mapArtifactTypeToStage } from "../dependency-graph.js";
import { invalidateDownstream } from "../invalidate-downstream.js";
import {
  blueprintJobArb,
  blueprintMaybeInvalidStageArb,
  blueprintStageArb,
} from "./__fixtures__/arbitraries.js";
import {
  buildEmptyJob,
  buildFixtureStaleSource,
  buildFullChainJob,
} from "./__fixtures__/build-fixture-job.js";

const OPTIONS = {
  reason: "upstream_explicit_invalidation" as const,
  triggeringArtifactId: "artifact-input",
  triggeringArtifactType: "intake" as const,
  now: () => "2026-05-23T02:00:00.000Z",
};

function staleMarkers(job: any): Array<[string, string | undefined, unknown]> {
  return job.artifacts.map((artifact: any) => [
    artifact.id,
    artifact.staleSince,
    artifact.invalidatedBy,
  ]);
}

describe("invalidateDownstream", () => {
  it("marks only downstream artifacts and keeps the source stage fresh", () => {
    const job = buildFullChainJob();

    const result = invalidateDownstream(job, "input", OPTIONS);

    expect(result).not.toBe(job);
    expect(result.artifacts).toHaveLength(job.artifacts.length);
    expect((result.artifacts[0] as any).staleSince).toBeUndefined();
    expect(result.artifacts.slice(1).every((artifact) => Boolean((artifact as any).staleSince))).toBe(
      true,
    );
    expect(result.staleArtifactIds).toEqual(
      result.artifacts.slice(1).map((artifact) => artifact.id),
    );
  });

  it("does not mark fromStage artifacts when invalidating from spec_tree", () => {
    const job = buildFullChainJob();

    const result = invalidateDownstream(job, "spec_tree", OPTIONS);

    const specTreeArtifact = result.artifacts.find(
      (artifact) => mapArtifactTypeToStage(artifact.type) === "spec_tree",
    );
    expect((specTreeArtifact as any).staleSince).toBeUndefined();
    expect(
      result.artifacts
        .filter((artifact) => mapArtifactTypeToStage(artifact.type) === "spec_docs")
        .every((artifact) => Boolean((artifact as any).staleSince)),
    ).toBe(true);
  });

  it("preserves payload and existing stale markers while marking fresh downstream artifacts", () => {
    const existingSource = buildFixtureStaleSource({
      artifactId: "first-source",
      triggeredAt: "2026-05-23T01:00:00.000Z",
    });
    const job = buildFullChainJob({ staleStages: ["spec_docs"] });
    const specDocsArtifact = job.artifacts.find(
      (artifact) => mapArtifactTypeToStage(artifact.type) === "spec_docs",
    ) as any;
    specDocsArtifact.invalidatedBy = existingSource;
    const originalPayloads = new Map(
      job.artifacts.map((artifact) => [artifact.id, artifact.payload]),
    );

    const result = invalidateDownstream(job, "spec_tree", OPTIONS);
    const resultSpecDocsArtifact = result.artifacts.find(
      (artifact) => artifact.id === specDocsArtifact.id,
    ) as any;

    expect(resultSpecDocsArtifact.staleSince).toBe("2026-05-23T01:00:00.000Z");
    expect(resultSpecDocsArtifact.invalidatedBy).toBe(existingSource);
    for (const artifact of result.artifacts) {
      expect(artifact.payload).toBe(originalPayloads.get(artifact.id));
    }
  });

  it("returns the original job for no-op invalidations and preserves staleArtifactIds", () => {
    const job = buildEmptyJob();

    const result = invalidateDownstream(job, "input", OPTIONS);

    expect(result).toBe(job);
    expect(result.staleArtifactIds).toEqual(["existing-stale-index"]);
  });

  it("returns the original job for an invalid fromStage", () => {
    const job = buildFullChainJob();

    const result = invalidateDownstream(
      job,
      "__invalid_stage__" as BlueprintGenerationStage,
      OPTIONS,
    );

    expect(result).toBe(job);
  });

  it("orders staleArtifactIds by artifact order", () => {
    const job = buildFullChainJob({ staleStages: ["engineering_landing"] });

    const result = invalidateDownstream(job, "spec_docs", OPTIONS);

    expect(result.staleArtifactIds).toEqual(
      result.artifacts
        .filter((artifact) => Boolean((artifact as any).staleSince))
        .map((artifact) => artifact.id),
    );
  });

  it("is idempotent for marker fields", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintMaybeInvalidStageArb, (job, fromStage) => {
        const first = invalidateDownstream(job, fromStage, OPTIONS);
        const second = invalidateDownstream(first, fromStage, {
          ...OPTIONS,
          now: () => "2026-05-23T03:00:00.000Z",
        });

        expect(staleMarkers(second)).toEqual(staleMarkers(first));
      }),
      { numRuns: 100 },
    );
  });

  it("does not overwrite stale timestamps", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (job, fromStage) => {
        const first = invalidateDownstream(job, fromStage, OPTIONS);
        const second = invalidateDownstream(first, fromStage, {
          ...OPTIONS,
          now: () => "2026-05-23T04:00:00.000Z",
        });

        for (const firstArtifact of first.artifacts as any[]) {
          if (firstArtifact.staleSince) {
            const secondArtifact = (second.artifacts as any[]).find(
              (artifact) => artifact.id === firstArtifact.id,
            );
            expect(secondArtifact.staleSince).toBe(firstArtifact.staleSince);
            expect(secondArtifact.invalidatedBy).toEqual(firstArtifact.invalidatedBy);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("keeps stale state monotonic across repeated invalidations", () => {
    fc.assert(
      fc.property(
        blueprintJobArb,
        fc.array(blueprintMaybeInvalidStageArb, { minLength: 1, maxLength: 8 }),
        (job, stages) => {
          const initiallyStale = new Map(
            (job.artifacts as any[])
              .filter((artifact) => artifact.staleSince)
              .map((artifact) => [artifact.id, artifact.staleSince]),
          );
          const result = stages.reduce(
            (current, stage) => invalidateDownstream(current, stage, OPTIONS),
            job,
          );

          for (const [artifactId, staleSince] of initiallyStale) {
            const artifact = (result.artifacts as any[]).find(
              (item) => item.id === artifactId,
            );
            expect(artifact?.staleSince).toBe(staleSince);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not mutate the input job", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (job, fromStage) => {
        const before = JSON.stringify(job);
        const artifactReferences = job.artifacts.slice();

        invalidateDownstream(job, fromStage, OPTIONS);

        expect(JSON.stringify(job)).toBe(before);
        expect(job.artifacts).toEqual(artifactReferences);
      }),
      { numRuns: 100 },
    );
  });

  it("never marks artifacts from the source stage", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (job, fromStage) => {
        const beforeSourceMarkers = new Map(
          (job.artifacts as any[])
            .filter((artifact) => mapArtifactTypeToStage(artifact.type) === fromStage)
            .map((artifact) => [
              artifact.id,
              {
                staleSince: artifact.staleSince,
                invalidatedBy: artifact.invalidatedBy,
              },
            ]),
        );

        const result = invalidateDownstream(job, fromStage, OPTIONS);

        for (const [artifactId, beforeMarker] of beforeSourceMarkers) {
          const artifact = (result.artifacts as any[]).find(
            (item) => item.id === artifactId,
          );
          expect({
            staleSince: artifact?.staleSince,
            invalidatedBy: artifact?.invalidatedBy,
          }).toEqual(beforeMarker);
        }
      }),
      { numRuns: 100 },
    );
  });
});
