import express from "express";
import * as fc from "fast-check";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
  BlueprintGenerationStatus,
} from "../../../../../shared/blueprint/index.js";
import { BlueprintEventName } from "../../../../../shared/blueprint/index.js";
import { buildFamilyFromJobStore } from "../family-builder.js";
import {
  logFamilyCycle,
  logFamilyRead,
  logFamilyRejected,
} from "../family-logger.js";
import { createFamilyHandler } from "../family-route.js";
import { familyCaseArbitrary } from "./__fixtures__/arbitraries.js";
import {
  buildCyclicFamily,
  buildDeepTree,
  buildFamilyOfOne,
  buildParentPlusN,
  buildParentPlusOne,
} from "./__fixtures__/build-fixture-family.js";

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

function buildJob(
  overrides: Partial<BlueprintGenerationJob> & { id: string },
): BlueprintGenerationJob {
  const createdAt = overrides.createdAt ?? "2026-05-23T00:00:00.000Z";
  return {
    id: overrides.id,
    request: {
      intakeId: `intake-${overrides.id}`,
      clarificationSessionId: `clarification-${overrides.id}`,
      mode: "autopilot_route",
    },
    status: (overrides.status ?? "completed") as BlueprintGenerationStatus,
    stage: (overrides.stage ?? "spec_docs") as BlueprintGenerationStage,
    version: overrides.version ?? "v1",
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    artifacts: overrides.artifacts ?? [],
    events: overrides.events ?? [],
    parentJobId: overrides.parentJobId,
    branchedAt: overrides.branchedAt,
    branchedFromStage: overrides.branchedFromStage,
  };
}

function buildEvent(
  overrides: Partial<BlueprintGenerationEvent> & {
    id: string;
    jobId: string;
    type?: BlueprintGenerationEvent["type"];
    occurredAt: string;
  },
): BlueprintGenerationEvent {
  return {
    id: overrides.id,
    jobId: overrides.jobId,
    type: overrides.type ?? BlueprintEventName.ReplanTriggered,
    family: "job",
    stage: (overrides.stage ?? "spec_docs") as BlueprintGenerationStage,
    status: (overrides.status ?? "completed") as BlueprintGenerationStatus,
    message: overrides.message ?? "event",
    occurredAt: overrides.occurredAt,
  };
}

function createStore(jobs: BlueprintGenerationJob[]) {
  const save = vi.fn();
  return {
    list: vi.fn(() => jobs),
    get: vi.fn((jobId: string) => jobs.find((job) => job.id === jobId) ?? null),
    save,
    latest: vi.fn(() => jobs[0] ?? null),
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("buildFamilyFromJobStore", () => {
  it("property: keeps every returned family connected to the requested job and root", () => {
    fc.assert(
      fc.property(familyCaseArbitrary, ({ jobs, startJobId, rootJobId }) => {
        const result = buildFamilyFromJobStore(jobs, startJobId);
        expect(result).toMatchObject({ kind: "ok" });
        if (result.kind !== "ok") throw new Error("expected ok family result");

        const responseIds = new Set(result.response.jobs.map((job) => job.id));
        expect(responseIds.has(startJobId)).toBe(true);
        expect(responseIds.has(rootJobId)).toBe(true);
        expect(result.response.rootJobId).toBe(rootJobId);

        const byId = new Map(result.response.jobs.map((job) => [job.id, job]));
        for (const job of result.response.jobs) {
          let cursor = job;
          const visited = new Set<string>();
          while (cursor.parentJobId) {
            expect(visited.has(cursor.id)).toBe(false);
            visited.add(cursor.id);
            const parent = byId.get(cursor.parentJobId);
            expect(parent).toBeDefined();
            cursor = parent!;
          }
          expect(cursor.id).toBe(rootJobId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property: never returns a self-referential parent chain for generated families", () => {
    fc.assert(
      fc.property(familyCaseArbitrary, ({ jobs, startJobId }) => {
        const result = buildFamilyFromJobStore(jobs, startJobId);
        expect(result).toMatchObject({ kind: "ok" });
        if (result.kind !== "ok") throw new Error("expected ok family result");

        const byId = new Map(result.response.jobs.map((job) => [job.id, job]));
        for (const job of result.response.jobs) {
          const visited = new Set<string>();
          let cursor: BlueprintGenerationJob | undefined = job;
          while (cursor) {
            expect(visited.has(cursor.id)).toBe(false);
            visited.add(cursor.id);
            cursor = cursor.parentJobId ? byId.get(cursor.parentJobId) : undefined;
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property: returns only replan.triggered events", () => {
    fc.assert(
      fc.property(familyCaseArbitrary, ({ jobs, startJobId }) => {
        const result = buildFamilyFromJobStore(jobs, startJobId);
        expect(result).toMatchObject({ kind: "ok" });
        if (result.kind !== "ok") throw new Error("expected ok family result");
        expect(
          result.response.replanEvents.every(
            (event) => event.type === BlueprintEventName.ReplanTriggered,
          ),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("property: exposes exactly one root matching rootJobId", () => {
    fc.assert(
      fc.property(familyCaseArbitrary, ({ jobs, startJobId }) => {
        const result = buildFamilyFromJobStore(jobs, startJobId);
        expect(result).toMatchObject({ kind: "ok" });
        if (result.kind !== "ok") throw new Error("expected ok family result");

        const roots = result.response.jobs.filter((job) => !job.parentJobId);
        expect(roots).toHaveLength(1);
        expect(roots[0].id).toBe(result.response.rootJobId);
      }),
      { numRuns: 100 },
    );
  });

  it("property: repeated reads are deeply stable and do not mutate jobs", () => {
    fc.assert(
      fc.property(familyCaseArbitrary, ({ jobs, startJobId }) => {
        const before = structuredClone(jobs);
        const first = buildFamilyFromJobStore(jobs, startJobId);
        const second = buildFamilyFromJobStore(jobs, startJobId);

        expect(first).toEqual(second);
        expect(jobs).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it("finds the root upward, gathers descendants with BFS, and orders root before branches by branchedAt fallback", () => {
    const root = buildJob({
      id: "job-root",
      createdAt: "2026-05-23T00:00:00.000Z",
    });
    const lateSibling = buildJob({
      id: "job-late-sibling",
      parentJobId: root.id,
      createdAt: "2026-05-23T00:03:00.000Z",
      branchedAt: "2026-05-23T00:03:00.000Z",
    });
    const earlyChild = buildJob({
      id: "job-early-child",
      parentJobId: root.id,
      createdAt: "2026-05-23T00:01:00.000Z",
      branchedAt: "2026-05-23T00:01:00.000Z",
    });
    const fallbackGrandchild = buildJob({
      id: "job-fallback-grandchild",
      parentJobId: earlyChild.id,
      createdAt: "2026-05-23T00:02:00.000Z",
    });
    const unrelated = buildJob({
      id: "job-unrelated",
      createdAt: "2026-05-23T00:04:00.000Z",
    });

    const result = buildFamilyFromJobStore(
      [lateSibling, unrelated, fallbackGrandchild, root, earlyChild],
      fallbackGrandchild.id,
    );

    expect(result).toMatchObject({ kind: "ok" });
    if (result.kind !== "ok") throw new Error("expected ok family result");
    expect(result.response.rootJobId).toBe(root.id);
    expect(result.response.jobs.map((job) => job.id)).toEqual([
      root.id,
      earlyChild.id,
      fallbackGrandchild.id,
      lateSibling.id,
    ]);
  });

  it("returns a stable cycle result for parent loops and missing parents", () => {
    const jobA = buildJob({ id: "job-cycle-a", parentJobId: "job-cycle-b" });
    const jobB = buildJob({ id: "job-cycle-b", parentJobId: "job-cycle-a" });
    const missingParent = buildJob({
      id: "job-missing-parent",
      parentJobId: "job-deleted-parent",
    });

    expect(buildFamilyFromJobStore([jobA, jobB], jobA.id)).toEqual({
      kind: "cycle",
      offendingJobId: "job-cycle-b",
      chainSummary: "job-cycle-a->job-cycle-b->job-cycle-a->job-cycle-b",
    });
    expect(buildFamilyFromJobStore([missingParent], missingParent.id)).toEqual({
      kind: "cycle",
      offendingJobId: "job-missing-parent",
      chainSummary: "job-missing-parent->(missing-parent:job-deleted-parent)",
    });
  });

  it("collects only replan.triggered events ordered by occurredAt then jobId", () => {
    const root = buildJob({
      id: "job-root",
      events: [
        buildEvent({
          id: "event-root-late",
          jobId: "job-root",
          occurredAt: "2026-05-23T00:03:00.000Z",
        }),
        buildEvent({
          id: "event-ignore",
          jobId: "job-root",
          type: BlueprintEventName.JobCreated,
          occurredAt: "2026-05-23T00:01:00.000Z",
        }),
      ],
    });
    const childB = buildJob({
      id: "job-b",
      parentJobId: root.id,
      branchedAt: "2026-05-23T00:01:00.000Z",
      events: [
        buildEvent({
          id: "event-b-tie",
          jobId: "job-b",
          occurredAt: "2026-05-23T00:02:00.000Z",
        }),
      ],
    });
    const childA = buildJob({
      id: "job-a",
      parentJobId: root.id,
      branchedAt: "2026-05-23T00:02:00.000Z",
      events: [
        buildEvent({
          id: "event-a-tie",
          jobId: "job-a",
          occurredAt: "2026-05-23T00:02:00.000Z",
        }),
      ],
    });

    const result = buildFamilyFromJobStore([root, childB, childA], root.id);

    expect(result).toMatchObject({ kind: "ok" });
    if (result.kind !== "ok") throw new Error("expected ok family result");
    expect(result.response.replanEvents.map((event) => event.id)).toEqual([
      "event-a-tie",
      "event-b-tie",
      "event-root-late",
    ]);
    expect(
      result.response.replanEvents.every(
        (event) => event.type === BlueprintEventName.ReplanTriggered,
      ),
    ).toBe(true);
  });

  it("covers the required fixture family shapes", () => {
    expect(buildFamilyFromJobStore(buildFamilyOfOne(), "job-root")).toMatchObject({
      kind: "ok",
      response: { rootJobId: "job-root", jobs: [{ id: "job-root" }] },
    });
    expect(
      buildFamilyFromJobStore(buildFamilyOfOne({ withInPlaceReplan: true }), "job-root"),
    ).toMatchObject({
      kind: "ok",
      response: { replanEvents: [{ id: "event-in-place" }] },
    });
    expect(buildFamilyFromJobStore(buildParentPlusOne(), "job-branch-1")).toMatchObject({
      kind: "ok",
      response: { jobs: [{ id: "job-root" }, { id: "job-branch-1" }] },
    });
    expect(buildFamilyFromJobStore(buildParentPlusN(3), "job-branch-3")).toMatchObject({
      kind: "ok",
      response: {
        jobs: [
          { id: "job-root" },
          { id: "job-branch-1" },
          { id: "job-branch-2" },
          { id: "job-branch-3" },
        ],
      },
    });
    expect(buildFamilyFromJobStore(buildDeepTree(2), "job-depth-2")).toMatchObject({
      kind: "ok",
      response: {
        jobs: [{ id: "job-root" }, { id: "job-depth-1" }, { id: "job-depth-2" }],
      },
    });
    expect(buildFamilyFromJobStore(buildCyclicFamily(), "job-cycle-a")).toMatchObject({
      kind: "cycle",
    });
  });
});

describe("createFamilyHandler", () => {
  it("returns 404 for unknown jobs and logs a structured rejection", async () => {
    const logger = createLogger();
    const store = createStore([]);
    const app = express();
    app.get(
      "/jobs/:jobId/family",
      createFamilyHandler({ jobStore: store, ctx: { logger } }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/missing/family`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "job_not_found" });
      expect(logger.debug).toHaveBeenCalledWith(
        "[blueprint-family] family.rejected",
        {
          event: "family.rejected",
          requestedJobId: "missing",
          reason: "job_not_found",
        },
      );
      expect(store.save).not.toHaveBeenCalled();
    });
  });

  it("returns 500 for cycle results without saving", async () => {
    const logger = createLogger();
    const store = createStore([
      buildJob({ id: "job-a", parentJobId: "job-b" }),
      buildJob({ id: "job-b", parentJobId: "job-a" }),
    ]);
    const app = express();
    app.get(
      "/jobs/:jobId/family",
      createFamilyHandler({ jobStore: store, ctx: { logger } }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/job-a/family`);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "family_cycle_detected",
        jobId: "job-b",
      });
      expect(logger.error).toHaveBeenCalledWith(
        "[blueprint-family] family.cycle_detected",
          expect.objectContaining({
            event: "family.cycle_detected",
            requestedJobId: "job-a",
            jobId: "job-b",
          }),
      );
      expect(store.save).not.toHaveBeenCalled();
    });
  });

  it("returns the family response and never writes to the job store", async () => {
    const logger = createLogger();
    const root = buildJob({ id: "job-root" });
    const child = buildJob({
      id: "job-child",
      parentJobId: root.id,
      branchedAt: "2026-05-23T00:01:00.000Z",
      events: [
        buildEvent({
          id: "event-branch",
          jobId: "job-child",
          occurredAt: "2026-05-23T00:01:00.000Z",
        }),
      ],
    });
    const store = createStore([child, root]);
    const app = express();
    app.get(
      "/jobs/:jobId/family",
      createFamilyHandler({ jobStore: store, ctx: { logger } }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/job-child/family`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        rootJobId: root.id,
        jobs: [{ id: root.id }, { id: child.id }],
        replanEvents: [{ id: "event-branch" }],
      });
      expect(logger.info).toHaveBeenCalledWith(
        "[blueprint-family] family.read",
        {
          event: "family.read",
          requestedJobId: "job-child",
          rootJobId: "job-root",
          familySize: 2,
          replanEventCount: 1,
        },
      );
      expect(store.save).not.toHaveBeenCalled();
    });
  });

  it("warns on large families without minting an extra family event key", async () => {
    const logger = createLogger();
    const jobs = buildParentPlusN(101);
    const store = createStore(jobs);
    const app = express();
    app.get(
      "/jobs/:jobId/family",
      createFamilyHandler({ jobStore: store, ctx: { logger } }),
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/job-root/family`);

      expect(response.status).toBe(200);
      expect(logger.warn).toHaveBeenCalledWith(
        "[blueprint-family] large family",
        expect.not.objectContaining({ event: expect.any(String) }),
      );
    });
  });
});

describe("family logger helpers", () => {
  it("emit minimal structured metadata without job payloads or request contents", () => {
    const logger = createLogger();

    logFamilyRead(logger, {
      requestedJobId: "job-child",
      rootJobId: "job-root",
      familySize: 2,
      replanEventCount: 1,
    });
    logFamilyRejected(logger, {
      requestedJobId: "missing-job",
      reason: "job_not_found",
    });
    logFamilyCycle(logger, {
      requestedJobId: "job-a",
      jobId: "job-b",
      chainSummary: "job-a->job-b->job-a->job-b",
    });

    const metas = [
      logger.info.mock.calls[0][1],
      logger.debug.mock.calls[0][1],
      logger.error.mock.calls[0][1],
    ];
    expect(metas).toEqual([
      {
        event: "family.read",
        requestedJobId: "job-child",
        rootJobId: "job-root",
        familySize: 2,
        replanEventCount: 1,
      },
      {
        event: "family.rejected",
        requestedJobId: "missing-job",
        reason: "job_not_found",
      },
      {
        event: "family.cycle_detected",
        requestedJobId: "job-a",
        jobId: "job-b",
        chainSummary: "job-a->job-b->job-a->job-b",
      },
    ]);
    for (const meta of metas) {
      expect(Object.keys(meta)).not.toContain("job");
      expect(Object.keys(meta)).not.toContain("request");
      expect(Object.keys(meta)).not.toContain("events");
      expect(Object.keys(meta)).not.toContain("artifacts");
    }
  });
});
