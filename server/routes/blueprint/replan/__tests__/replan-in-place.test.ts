import * as fc from "fast-check";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../../job-store.js";
import { invalidateDownstream } from "../../staleness/invalidate-downstream.js";
import {
  blueprintJobArb,
  blueprintStageArb,
} from "../../staleness/__tests__/__fixtures__/arbitraries.js";
import {
  buildEmptyJob,
  buildFullChainJob,
} from "../../staleness/__tests__/__fixtures__/build-fixture-job.js";
import { handleInPlaceReplan } from "../handlers/handle-in-place.js";
import { createReplanHandler } from "../replan-route.js";

const NOW = "2026-05-23T05:00:00.000Z";

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

function createStore(initial: BlueprintGenerationJob): BlueprintJobStore {
  let current = initial;
  return {
    list: () => [current],
    get: () => current,
    save: (next) => {
      current = next;
    },
    latest: () => current,
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

function staleIdSet(job: BlueprintGenerationJob): Set<string> {
  return new Set(
    job.artifacts
      .filter((artifact) => artifact.staleSince !== undefined)
      .map((artifact) => artifact.id),
  );
}

describe("replan in_place properties", () => {
  it("matches direct downstream invalidation at the stale artifact set level", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (job, fromStage) => {
        const expected = invalidateDownstream(job, fromStage, {
          reason: "upstream_explicit_invalidation",
          triggeringArtifactId: job.id,
          triggeringArtifactType: "replay",
          now: () => NOW,
        });

        const response = handleInPlaceReplan({
          job: structuredClone(job),
          fromStage,
          reason: "property check",
          jobStore: createStore(structuredClone(job)),
          ctx: createCtx(),
        });

        expect(staleIdSet(response.job)).toEqual(staleIdSet(expected));
        expect(response.job.stage).toBe(fromStage);
        expect(response.job.events.at(-1)?.type).toBe("replan.triggered");
      }),
      { numRuns: 100 },
    );
  });

  it("is idempotent for repeated in-place replans from the same stage", () => {
    fc.assert(
      fc.property(blueprintJobArb, blueprintStageArb, (job, fromStage) => {
        const first = handleInPlaceReplan({
          job: structuredClone(job),
          fromStage,
          jobStore: createStore(structuredClone(job)),
          ctx: createCtx(),
        });
        const second = handleInPlaceReplan({
          job: first.job,
          fromStage,
          jobStore: createStore(first.job),
          ctx: createCtx(),
        });

        expect(staleIdSet(second.job)).toEqual(staleIdSet(first.job));
      }),
      { numRuns: 100 },
    );
  });

  it("still records a replan.triggered event for a no-op downstream invalidation", () => {
    const job = buildEmptyJob();
    const response = handleInPlaceReplan({
      job,
      fromStage: "engineering_landing",
      jobStore: createStore(job),
      ctx: createCtx(),
    });

    expect(response.summary.markedStaleArtifactCount).toBe(0);
    expect(response.job.events.at(-1)?.type).toBe("replan.triggered");
  });

  it("returns 409 without mutating the job when in-place replan has running downstream work", async () => {
    const job = buildFullChainJob();
    const runningJob = { ...job, status: "running" as const, stage: "spec_docs" as const };
    const snapshot = structuredClone(runningJob);
    const save = vi.fn();
    const app = express();
    app.use(express.json());
    app.post(
      "/jobs/:jobId/replan",
      createReplanHandler({
        jobStore: {
          list: () => [runningJob],
          get: () => runningJob,
          save,
          latest: () => runningJob,
        },
        ctx: createCtx(),
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/${job.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "spec_tree", mode: "in_place" }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "downstream_running",
        runningStage: "spec_docs",
      });
    });
    expect(save).not.toHaveBeenCalled();
    expect(runningJob).toEqual(snapshot);
  });
});
