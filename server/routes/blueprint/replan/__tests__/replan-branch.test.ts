import * as fc from "fast-check";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../../job-store.js";
import {
  getTransitiveDownstreamStages,
  mapArtifactTypeToStage,
} from "../../staleness/dependency-graph.js";
import {
  blueprintJobArb,
  blueprintStageArb,
} from "../../staleness/__tests__/__fixtures__/arbitraries.js";
import { buildFullChainJob } from "../../staleness/__tests__/__fixtures__/build-fixture-job.js";
import { buildBranchJob } from "../branch-creator.js";
import { handleBranchReplan } from "../handlers/handle-branch.js";
import { createReplanHandler } from "../replan-route.js";

const NOW = "2026-05-23T06:00:00.000Z";

function createCtx() {
  return {
    now: () => new Date(NOW),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createStore(parent: BlueprintGenerationJob): BlueprintJobStore {
  const jobs = new Map([[parent.id, parent]]);
  return {
    list: () => Array.from(jobs.values()),
    get: (jobId) => jobs.get(jobId) ?? null,
    save: (next) => {
      jobs.set(next.id, next);
    },
    latest: () => Array.from(jobs.values()).at(-1) ?? null,
  };
}

async function withServer(
  app: express.Express,
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address() as AddressInfo;
  try {
    await handler(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function downstreamSet(fromStage: BlueprintGenerationStage): Set<BlueprintGenerationStage> {
  return new Set([fromStage, ...getTransitiveDownstreamStages(fromStage)]);
}

function stripStaleMarkers(
  artifact: BlueprintGenerationArtifact,
): BlueprintGenerationArtifact {
  const clone = structuredClone(artifact) as BlueprintGenerationArtifact;
  delete (clone as any).staleSince;
  delete (clone as any).invalidatedBy;
  return clone;
}

describe("replan branch properties", () => {
  it("preserves strict upstream artifacts as deep clones without stale markers", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (parentJob, fromStage) => {
        const result = buildBranchJob({
          parentJob,
          fromStage,
          now: () => NOW,
          newJobId: "branch-property",
        });
        const blockedStages = downstreamSet(fromStage);
        const expectedArtifacts = parentJob.artifacts
          .filter((artifact) => {
            const stage = mapArtifactTypeToStage(artifact.type);
            return stage !== undefined && !blockedStages.has(stage);
          })
          .map(stripStaleMarkers);

        expect(result.job.artifacts).toEqual(expectedArtifacts);
        for (const artifact of result.job.artifacts as any[]) {
          expect(artifact.staleSince).toBeUndefined();
          expect(artifact.invalidatedBy).toBeUndefined();
        }
        if (result.job.artifacts.length > 0) {
          const parentArtifact = parentJob.artifacts.find(
            (artifact) => artifact.id === result.job.artifacts[0].id,
          );
          expect(result.job.artifacts[0]).not.toBe(parentArtifact);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("keeps branch artifacts out of fromStage and all downstream stages", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (parentJob, fromStage) => {
        const result = buildBranchJob({
          parentJob,
          fromStage,
          now: () => NOW,
          newJobId: "branch-property",
        });
        const blockedStages = downstreamSet(fromStage);

        for (const artifact of result.job.artifacts) {
          const stage = mapArtifactTypeToStage(artifact.type);
          expect(stage === undefined || blockedStages.has(stage)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("creates sibling branches from the original parent instead of chaining", () => {
    fc.assert(
      fc.property(blueprintStageArb, (fromStage) => {
        const parentJob = buildFullChainJob();
        const store = createStore(parentJob);
        const first = handleBranchReplan({
          parentJob,
          fromStage,
          jobStore: store,
          ctx: createCtx(),
          newJobId: () => "branch-one",
        });
        const second = handleBranchReplan({
          parentJob,
          fromStage,
          jobStore: store,
          ctx: createCtx(),
          newJobId: () => "branch-two",
        });

        expect(first.job.id).not.toBe(second.job.id);
        expect(first.job.parentJobId).toBe(parentJob.id);
        expect(second.job.parentJobId).toBe(parentJob.id);
      }),
      { numRuns: 100 },
    );
  });

  it("starts branch jobs with an empty staleArtifactIds index", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (parentJob, fromStage) => {
        const result = buildBranchJob({
          parentJob,
          fromStage,
          now: () => NOW,
          newJobId: "branch-property",
        });

        expect(result.job.staleArtifactIds).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("returns 409 without creating a branch when branch replan has running downstream work", async () => {
    const parentJob = buildFullChainJob();
    const runningParent = {
      ...parentJob,
      status: "running" as const,
      stage: "spec_docs" as const,
    };
    const snapshot = structuredClone(runningParent);
    const save = vi.fn();
    const app = express();
    app.use(express.json());
    app.post(
      "/jobs/:jobId/replan",
      createReplanHandler({
        jobStore: {
          list: () => [runningParent],
          get: () => runningParent,
          save,
          latest: () => runningParent,
        },
        ctx: createCtx(),
        newJobId: () => "branch-blocked",
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/${parentJob.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "spec_tree", mode: "branch" }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "downstream_running",
        runningStage: "spec_docs",
      });
    });
    expect(save).not.toHaveBeenCalled();
    expect(runningParent).toEqual(snapshot);
  });
});
