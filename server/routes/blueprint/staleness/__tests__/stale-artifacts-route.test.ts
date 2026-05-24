import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlueprintRouter, createMemoryBlueprintJobStore } from "../../../blueprint.js";
import { createStaleArtifactsHandler } from "../stale-artifacts-route.js";
import {
  buildFixtureJob,
  buildFixtureStaleSource,
  buildFullChainJob,
} from "./__fixtures__/build-fixture-job.js";

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

describe("createStaleArtifactsHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns stale artifact projections in original artifact order without saving", async () => {
    const save = vi.fn();
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };
    const staleSource = buildFixtureStaleSource();
    const job = buildFixtureJob({
      id: "job-stale",
      artifacts: [
        { ...buildFullChainJob().artifacts[0], id: "fresh-0" },
        {
          ...buildFullChainJob().artifacts[3],
          id: "stale-3",
          staleSince: "2026-05-23T03:00:00.000Z",
          invalidatedBy: staleSource,
        } as any,
        { ...buildFullChainJob().artifacts[4], id: "fresh-4" },
        {
          ...buildFullChainJob().artifacts[7],
          id: "stale-7",
          staleSince: "2026-05-23T04:00:00.000Z",
          invalidatedBy: staleSource,
        } as any,
      ],
    });
    const get = vi.fn((jobId: string) => (jobId === job.id ? job : null));
    const app = express();
    app.get(
      "/jobs/:jobId/stale-artifacts",
      createStaleArtifactsHandler({
        jobStore: {
          list: () => [job],
          get,
          save,
          latest: () => job,
        },
        ctx: { logger } as any,
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/job-stale/stale-artifacts`);
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(body.jobId).toBe("job-stale");
      expect(body.generatedAt).toEqual(expect.any(String));
      expect(body.staleArtifacts).toEqual([
        {
          artifactId: "stale-3",
          artifactType: "spec_tree",
          stage: "spec_tree",
          staleSince: "2026-05-23T03:00:00.000Z",
          invalidatedBy: staleSource,
        },
        {
          artifactId: "stale-7",
          artifactType: "prompt_pack",
          stage: "prompt_packaging",
          staleSince: "2026-05-23T04:00:00.000Z",
          invalidatedBy: staleSource,
        },
      ]);
      expect(get).toHaveBeenCalledOnce();
      expect(get).toHaveBeenCalledWith("job-stale");
      expect(save).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  it("returns 404 job_not_found for missing jobs", async () => {
    const app = express();
    app.get(
      "/jobs/:jobId/stale-artifacts",
      createStaleArtifactsHandler({
        jobStore: {
          list: () => [],
          get: () => null,
          save: vi.fn(),
          latest: () => null,
        },
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/missing/stale-artifacts`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "job_not_found" });
    });
  });

  it("returns an empty staleArtifacts array for fresh jobs", async () => {
    const job = buildFullChainJob();
    const app = express();
    app.get(
      "/jobs/:jobId/stale-artifacts",
      createStaleArtifactsHandler({
        jobStore: createMemoryBlueprintJobStore([job]),
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/jobs/${job.id}/stale-artifacts`,
      );
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(body.staleArtifacts).toEqual([]);
    });
  });

  it("does not call injected LLM, executor, event bus, or write-side effects", async () => {
    const job = buildFullChainJob({ staleStages: ["spec_docs"] });
    const sideEffects = {
      llmClient: {
        complete: vi.fn(),
        stream: vi.fn(),
      },
      executor: {
        dispatchPlan: vi.fn(),
        cancel: vi.fn(),
      },
      eventBus: {
        emit: vi.fn(),
        publish: vi.fn(),
      },
    };
    const get = vi.fn((jobId: string) => (jobId === job.id ? job : null));
    const save = vi.fn();
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };
    const deps = {
      jobStore: {
        list: vi.fn(() => [job]),
        get,
        save,
        latest: vi.fn(() => job),
      },
      ctx: { logger },
      ...sideEffects,
    };
    const app = express();
    app.get(
      "/jobs/:jobId/stale-artifacts",
      createStaleArtifactsHandler(deps),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/jobs/${job.id}/stale-artifacts`,
      );

      expect(response.status).toBe(200);
      expect(get).toHaveBeenCalledOnce();
      expect(deps.jobStore.list).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(deps.jobStore.latest).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(sideEffects.llmClient.complete).not.toHaveBeenCalled();
      expect(sideEffects.llmClient.stream).not.toHaveBeenCalled();
      expect(sideEffects.executor.dispatchPlan).not.toHaveBeenCalled();
      expect(sideEffects.executor.cancel).not.toHaveBeenCalled();
      expect(sideEffects.eventBus.emit).not.toHaveBeenCalled();
      expect(sideEffects.eventBus.publish).not.toHaveBeenCalled();
    });
  });
});

describe("GET /api/blueprint/jobs/:jobId/stale-artifacts registration", () => {
  it("is registered on the blueprint router and does not expose write methods", async () => {
    const job = buildFullChainJob({ staleStages: ["spec_docs"] });
    const app = express();
    app.use(express.json());
    app.use(
      "/api/blueprint",
      createBlueprintRouter({
        jobStore: createMemoryBlueprintJobStore([job]),
        now: () => new Date("2026-05-23T05:00:00.000Z"),
      }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/blueprint/jobs/${job.id}/stale-artifacts`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.staleArtifacts).toHaveLength(1);
      expect(body.staleArtifacts[0]).toMatchObject({
        artifactId: "artifact-spec_docs",
        stage: "spec_docs",
      });

      for (const method of ["POST", "PATCH", "DELETE"] as const) {
        const writeResponse = await fetch(
          `${baseUrl}/api/blueprint/jobs/${job.id}/stale-artifacts`,
          { method },
        );
        expect([404, 405]).toContain(writeResponse.status);
      }
    });
  });
});
