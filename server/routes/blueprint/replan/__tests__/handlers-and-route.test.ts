import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import { createMemoryBlueprintJobStore, type BlueprintJobStore } from "../../job-store.js";
import {
  buildFixtureJob,
  buildFullChainJob,
} from "../../staleness/__tests__/__fixtures__/build-fixture-job.js";
import { handleBranchReplan } from "../handlers/handle-branch.js";
import { handleInPlaceReplan } from "../handlers/handle-in-place.js";
import { createReplanHandler } from "../replan-route.js";

const NOW = "2026-05-23T04:00:00.000Z";

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

describe("handleInPlaceReplan", () => {
  it("invalidates downstream, rewrites stage to fromStage, saves the job, and returns a summary", () => {
    const job = buildFullChainJob();
    const saved: BlueprintGenerationJob[] = [];
    const jobStore: BlueprintJobStore = {
      list: () => [saved[0] ?? job],
      get: () => saved[0] ?? job,
      save: (next) => saved.push(next),
      latest: () => saved[0] ?? job,
    };

    const response = handleInPlaceReplan({
      job,
      fromStage: "spec_tree",
      reason: "Need updated docs",
      jobStore,
      ctx: createCtx() as any,
    });

    expect(saved).toHaveLength(1);
    expect(response.mode).toBe("in_place");
    expect(response.job.id).toBe(job.id);
    expect(response.job.stage).toBe("spec_tree");
    expect(response.summary.markedStaleArtifactIds).toEqual([
      "artifact-spec_docs",
      "artifact-preview",
      "artifact-effect_preview",
      "artifact-prompt_packaging",
      "artifact-runtime_capability",
      "artifact-engineering_handoff",
      "artifact-engineering_landing",
    ]);
    expect(response.summary.markedStaleArtifactCount).toBe(7);
    expect(response.job.events.at(-1)?.type).toBe("replan.triggered");
  });
});

describe("handleBranchReplan", () => {
  it("creates and saves a branch job without saving or mutating the parent", () => {
    const parent = buildFullChainJob({ staleStages: ["input"] });
    const parentSnapshot = structuredClone(parent);
    const save = vi.fn();

    const response = handleBranchReplan({
      parentJob: parent,
      fromStage: "route_generation",
      reason: "Try another route",
      jobStore: {
        list: () => [parent],
        get: (jobId) => (jobId === parent.id ? parent : null),
        save,
        latest: () => parent,
      },
      ctx: createCtx() as any,
      newJobId: () => "branch-job",
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(response.job);
    expect(response.mode).toBe("branch");
    expect(response.parentJobId).toBe(parent.id);
    expect(response.job.id).toBe("branch-job");
    expect(response.job.parentJobId).toBe(parent.id);
    expect(response.summary.inheritedUpstreamArtifactIds).toEqual([
      "artifact-input",
      "artifact-clarification",
    ]);
    expect(response.job.events.at(-1)?.type).toBe("replan.triggered");
    expect(parent).toEqual(parentSnapshot);
  });
});

describe("createReplanHandler", () => {
  it("returns 400 for invalid input and 409 without side effects when downstream is active", async () => {
    const activeJob = buildFullChainJob();
    const save = vi.fn();
    const app = express();
    app.use(express.json());
    app.post(
      "/jobs/:jobId/replan",
      createReplanHandler({
        jobStore: {
          list: () => [activeJob],
          get: (jobId) =>
            jobId === activeJob.id
              ? { ...activeJob, status: "running", stage: "spec_docs" }
              : null,
          save,
          latest: () => activeJob,
        },
        ctx: createCtx() as any,
      }),
    );

    await withServer(app, async (baseUrl) => {
      const bad = await fetch(`${baseUrl}/jobs/${activeJob.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "spec_tree", mode: "replace" }),
      });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: "invalid_mode" });

      const missing = await fetch(`${baseUrl}/jobs/missing-job/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "spec_tree", mode: "in_place" }),
      });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "job_not_found" });

      const blockedBranch = await fetch(`${baseUrl}/jobs/${activeJob.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "spec_tree", mode: "branch" }),
      });
      expect(blockedBranch.status).toBe(409);
      expect(await blockedBranch.json()).toEqual({
        error: "downstream_running",
        runningStage: "spec_docs",
      });

      const blockedInPlace = await fetch(`${baseUrl}/jobs/${activeJob.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "spec_tree", mode: "in_place" }),
      });
      expect(blockedInPlace.status).toBe(409);
      expect(await blockedInPlace.json()).toEqual({
        error: "downstream_running",
        runningStage: "spec_docs",
      });
      expect(save).not.toHaveBeenCalled();
    });
  });

  it("dispatches successful branch requests and saves only the branch job", async () => {
    const parent = buildFixtureJob({
      id: "parent-job",
      artifacts: buildFullChainJob().artifacts,
      events: [],
    });
    const store = createMemoryBlueprintJobStore([parent]);
    const saveSpy = vi.spyOn(store, "save");
    const app = express();
    app.use(express.json());
    app.post(
      "/jobs/:jobId/replan",
      createReplanHandler({
        jobStore: store,
        ctx: createCtx() as any,
        newJobId: () => "branch-from-route",
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/${parent.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromStage: "route_generation", mode: "branch" }),
      });
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(body.mode).toBe("branch");
      expect(body.job.id).toBe("branch-from-route");
      expect(body.parentJobId).toBe(parent.id);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(store.get(parent.id)).toEqual(parent);
      expect(store.get("branch-from-route")?.parentJobId).toBe(parent.id);
    });
  });
});
