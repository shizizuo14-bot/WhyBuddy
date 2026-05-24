import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import { getTransitiveDownstreamStages } from "../../staleness/dependency-graph.js";
import { createIntakePatchHandler } from "../intake-patch-route.js";
import { runAutoInvalidationHook } from "../auto-invalidation-hook.js";
import { buildFixtureIntake, buildJobLinkedToIntakeAndSession } from "./__fixtures__/build-fixture-job.js";
import { intakePatchArb, staleFreshStagesArb } from "./__fixtures__/arbitraries.js";

const NUM_RUNS = 100;

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildJobStore(jobs: BlueprintGenerationJob[]) {
  const saved = new Map(jobs.map((job) => [job.id, job]));
  return {
    list: vi.fn(() => [...saved.values()]),
    get: vi.fn((jobId: string) => saved.get(jobId) ?? null),
    save: vi.fn((job: BlueprintGenerationJob) => {
      saved.set(job.id, job);
    }),
    latest: vi.fn(() => [...saved.values()][0] ?? null),
  };
}

function invalidateInput(job: BlueprintGenerationJob) {
  const logger = buildLogger();
  const jobStore = buildJobStore([job]);
  return runAutoInvalidationHook({
    job,
    fromStage: "input",
    reason: "upstream_target_changed",
    triggeringEndpoint: "intake_patch",
    triggeringArtifactId: "artifact-input",
    triggeringArtifactType: "intake",
    jobStore,
    ctx: {
      logger,
      now: () => new Date("2026-05-23T02:00:00.000Z"),
    },
  });
}

describe("intake modify invalidation properties", () => {
  it("marks every fresh downstream artifact stale while preserving already stale markers", () => {
    fc.assert(
      fc.property(staleFreshStagesArb, (staleStages) => {
        const job = buildJobLinkedToIntakeAndSession({ staleStages });
        const result = invalidateInput(job);
        const downstreamStages = new Set(getTransitiveDownstreamStages("input"));

        const staleBefore = new Set(job.staleArtifactIds ?? []);
        const staleAfter = new Set(result.job.staleArtifactIds ?? []);
        for (const artifact of result.job.artifacts) {
          const stage = artifact.id.replace("artifact-", "");
          if (downstreamStages.has(stage as any)) {
            expect(staleAfter.has(artifact.id)).toBe(true);
          } else {
            expect(staleAfter.has(artifact.id)).toBe(
              staleBefore.has(artifact.id),
            );
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("is idempotent when the same intake edit invalidates the same field twice", () => {
    fc.assert(
      fc.property(staleFreshStagesArb, intakePatchArb, (staleStages) => {
        const job = buildJobLinkedToIntakeAndSession({ staleStages });
        const first = invalidateInput(job);
        const second = invalidateInput(first.job);

        expect(second.newlyStaleArtifactIds).toEqual([]);
        expect(second.job.staleArtifactIds).toEqual(first.job.staleArtifactIds);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("does not dirty downstream artifacts for no-op intake patches", async () => {
    const intake = buildFixtureIntake();
    const job = buildJobLinkedToIntakeAndSession();
    const jobStore = buildJobStore([job]);
    const intakes = new Map([[intake.id, intake]]);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();

    const handler = createIntakePatchHandler({
      blueprintStores: {
        intakes,
        clarificationSessions: new Map(),
        projectContexts: new Map(),
      },
      jobStore,
      ctx: {
        logger: buildLogger(),
        now: () => new Date("2026-05-23T03:00:00.000Z"),
      },
    });

    await handler(
      {
        params: { intakeId: intake.id },
        body: {
          targetText: intake.targetText,
          githubUrls: intake.githubUrls,
        },
      } as any,
      { status, json } as any,
      vi.fn(),
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ intake });
    expect(jobStore.save).not.toHaveBeenCalled();
  });

  it("invalidates every linked family job and returns a combined staleEdit summary", async () => {
    const intake = buildFixtureIntake();
    const jobs = [
      buildJobLinkedToIntakeAndSession({ id: "job-a" }),
      buildJobLinkedToIntakeAndSession({ id: "job-b" }),
    ];
    const jobStore = buildJobStore(jobs);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const handler = createIntakePatchHandler({
      blueprintStores: {
        intakes: new Map([[intake.id, intake]]),
        clarificationSessions: new Map(),
        projectContexts: new Map(),
      },
      jobStore,
      ctx: {
        logger: buildLogger(),
        now: () => new Date("2026-05-23T03:00:00.000Z"),
      },
    });

    await handler(
      {
        params: { intakeId: intake.id },
        body: { targetText: "A changed target" },
      } as any,
      { status, json } as any,
      vi.fn(),
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(jobStore.save).toHaveBeenCalledTimes(2);
    expect(json).toHaveBeenCalledWith({
      intake: expect.objectContaining({ targetText: "A changed target" }),
      staleEdit: expect.objectContaining({
        fromStage: "input",
        newlyStaleArtifactCount: 10,
      }),
    });
  });
});
