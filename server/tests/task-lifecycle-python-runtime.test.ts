import type { AddressInfo } from "node:net";

import express, { type RequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskRouter } from "../routes/tasks.js";
import { MissionRuntime } from "../tasks/mission-runtime.js";
import { MissionStore } from "../tasks/mission-store.js";
import type { CurrentUser } from "../../shared/auth.js";
import type { ProjectRecord } from "../persistence/repositories.js";

const routeUser: CurrentUser = {
  id: "user-1",
  email: "user@example.com",
  role: "user",
  status: "active",
  emailVerified: true,
  createdAt: "2026-06-22T00:00:00.000Z",
};

function makeProject(id = "project-python-lifecycle"): ProjectRecord {
  const now = new Date("2026-06-22T00:00:00.000Z");
  return {
    id,
    ownerUserId: routeUser.id,
    name: "Python lifecycle project",
    description: null,
    status: "active",
    source: "user",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function startServer(
  runtime: MissionRuntime,
  fetchImpl: typeof fetch,
  projectGuard?: {
    findByIdForOwner: (
      projectId: string,
      ownerUserId: string,
    ) => Promise<ProjectRecord | null>;
    createProjectResource?: (input: {
      projectId: string;
      resourceType: "mission";
      payload: Record<string, unknown>;
    }) => Promise<unknown>;
  },
) {
  const app = express();
  app.use(express.json());
  const requireAuth: RequestHandler = (request, _response, next) => {
    (request as typeof request & { user: CurrentUser }).user = routeUser;
    next();
  };
  app.use(
    "/api/tasks",
    createTaskRouter(runtime, {
      fetchImpl,
      executorBaseUrl: "http://python-runtime.test",
      taskLifecycleRuntimeBaseUrl: "http://python-runtime.test",
      ...(projectGuard
        ? {
            requireAuth,
            projects: {
              findByIdForOwner: projectGuard.findByIdForOwner,
            },
            ...(projectGuard.createProjectResource
              ? {
                  projectResources: {
                    create: projectGuard.createProjectResource,
                  },
                }
              : {}),
          }
        : {}),
    }),
  );

  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const { port } = server.address() as AddressInfo;

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

describe("task lifecycle route with Python runtime boundary envelopes", () => {
  let runtime: MissionRuntime;
  let server: ReturnType<express.Express["listen"]> | null = null;
  let baseUrl = "";

  beforeEach(() => {
    runtime = new MissionRuntime({
      store: new MissionStore(),
      autoRecover: false,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = null;
  });

  it("delegates create/status/event replay to Python lifecycle runtime while preserving project metadata", async () => {
    const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
    const findByIdForOwner = vi.fn(async (projectId: string, ownerUserId: string) =>
      projectId === "project-python-lifecycle" && ownerUserId === routeUser.id
        ? makeProject(projectId)
        : null,
    );
    const createProjectResource = vi.fn(async input => input);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body =
        typeof init?.body === "string"
          ? JSON.parse(init.body) as Record<string, unknown>
          : undefined;
      calls.push({ method: init?.method ?? "GET", path: url.pathname, body });

      if (url.pathname === "/api/tasks/runtime/create") {
        return jsonResponse({
          ok: true,
          action: "create",
          contractVersion: "task-lifecycle.runtime-boundary.v1",
          runtime: {
            owner: "python",
            mode: "runtime_boundary",
            persistenceOwner: "node",
            missionStoreOwner: "node",
            routeOwner: "node",
            authOwner: "node",
            eventStoreOwner: "node",
          },
          metadata: body?.metadata,
          task: {
            id: (body?.task as { id: string }).id,
            status: "started",
            nodeStatus: "running",
            progress: 4,
            stageKey: "receive",
            message: "Task lifecycle started.",
            updatedAt: "2026-06-22T00:00:00.000Z",
          },
        });
      }
      if (url.pathname === "/api/tasks/runtime/status") {
        return jsonResponse({
          ok: true,
          action: "status",
          contractVersion: "task-lifecycle.runtime-boundary.v1",
          runtime: {
            owner: "python",
            mode: "runtime_boundary",
            persistenceOwner: "node",
            missionStoreOwner: "node",
            routeOwner: "node",
            authOwner: "node",
            eventStoreOwner: "node",
          },
          metadata: body?.metadata,
          task: {
            id: (body?.task as { id: string }).id,
            status: "completed",
            nodeStatus: "done",
            progress: 100,
            stageKey: "finalize",
            message: "Python lifecycle completed.",
            updatedAt: "2026-06-22T00:01:00.000Z",
            summary: "Python completed projection.",
          },
        });
      }
      if (url.pathname === "/api/tasks/runtime/replay") {
        const events = Array.isArray(body?.events) ? body.events : [];
        return jsonResponse({
          ok: true,
          action: "replay",
          contractVersion: "task-lifecycle.runtime-boundary.v1",
          runtime: {
            owner: "python",
            mode: "runtime_boundary",
            persistenceOwner: "node",
            missionStoreOwner: "node",
            routeOwner: "node",
            authOwner: "node",
            eventStoreOwner: "node",
          },
          metadata: body?.metadata,
          task: {
            id: (body?.task as { id: string }).id,
            status: "completed",
            nodeStatus: "done",
            progress: 100,
            stageKey: "finalize",
            message: "Python lifecycle completed.",
            updatedAt: "2026-06-22T00:01:00.000Z",
          },
          replay: {
            missionId: (body?.task as { id: string }).id,
            eventCount: events.length,
            limit: body?.limit,
            owner: "node",
            events,
          },
        });
      }

      return jsonResponse({ ok: false, error: "unexpected path" }, 404);
    });
    const started = await startServer(
      runtime,
      fetchImpl as unknown as typeof fetch,
      {
        findByIdForOwner,
        createProjectResource,
      },
    );
    server = started.server;
    baseUrl = started.baseUrl;

    const createResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "nl-command",
        title: "Python lifecycle start",
        sourceText: "Run tests with Python lifecycle runtime.",
        projectId: "project-python-lifecycle",
        autoDispatch: false,
      }),
    });
    const createBody = await createResponse.json();
    const taskId = createBody.task.id as string;
    runtime.finishMission(taskId, "Node-owned mission completed.");
    const statusResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`);
    const statusBody = await statusResponse.json();
    const eventsResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/events?limit=10`);
    const eventsBody = await eventsResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createBody).toMatchObject({
      ok: true,
      task: {
        id: taskId,
        status: "queued",
        projection: {
          projectId: "project-python-lifecycle",
        },
      },
      lifecycle: {
        action: "create",
        task: {
          status: "started",
        },
        metadata: {
          project: {
            projectId: "project-python-lifecycle",
            validatedBy: "node",
          },
          auth: {
            owner: "node",
            checked: true,
          },
        },
      },
    });
    expect(statusResponse.status).toBe(200);
    expect(statusBody).toMatchObject({
      ok: true,
      task: {
        id: taskId,
        status: "done",
        progress: 100,
        summary: "Python completed projection.",
      },
      lifecycle: {
        action: "status",
        task: {
          status: "completed",
          nodeStatus: "done",
        },
      },
    });
    expect(eventsResponse.status).toBe(200);
    expect(eventsBody).toMatchObject({
      ok: true,
      missionId: taskId,
      lifecycle: {
        action: "replay",
        replay: {
          missionId: taskId,
          owner: "node",
        },
      },
    });
    expect(findByIdForOwner).toHaveBeenCalledWith(
      "project-python-lifecycle",
      routeUser.id,
    );
    expect(createProjectResource).toHaveBeenCalledWith({
      projectId: "project-python-lifecycle",
      resourceType: "mission",
      payload: expect.objectContaining({
        projectId: "project-python-lifecycle",
        missionId: taskId,
      }),
    });
    expect(runtime.getTask(taskId)?.projection?.projectId).toBe(
      "project-python-lifecycle",
    );
    expect(
      runtime.getTask(taskId)?.events.filter(
        (event: { type: string }) => event.type === "done",
      ),
    ).toHaveLength(1);
    expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
      "POST /api/tasks/runtime/create",
      "POST /api/tasks/runtime/status",
      "POST /api/tasks/runtime/replay",
    ]);
    expect(calls[0].body).toMatchObject({
      action: "create",
      metadata: {
        project: {
          projectId: "project-python-lifecycle",
          validatedBy: "node",
        },
        resource: {
          resourceType: "mission",
          owner: "node",
        },
        auth: {
          owner: "node",
          checked: true,
        },
      },
    });
  });

  it("maps Python cancel envelope to cancelled, not completed success", async () => {
    const mission = runtime.createChatTask("Python lifecycle cancel");
    runtime.patchMissionExecution(mission.id, {
      executor: {
        name: "lobster",
        jobId: "job-python-cancel",
        status: "running",
        baseUrl: "http://python-runtime.test",
      },
    });
    runtime.markMissionRunning(mission.id, "execute", "Python runtime running", 50);

    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/api/tasks/runtime/cancel") {
        const body =
          typeof init?.body === "string"
            ? JSON.parse(init.body) as Record<string, unknown>
            : {};
        return jsonResponse({
          ok: true,
          action: "cancel",
          contractVersion: "task-lifecycle.runtime-boundary.v1",
          runtime: {
            owner: "python",
            mode: "runtime_boundary",
            persistenceOwner: "node",
            missionStoreOwner: "node",
            routeOwner: "node",
            authOwner: "node",
            eventStoreOwner: "node",
          },
          metadata: body.metadata,
          task: {
            id: mission.id,
            status: "cancelled",
            nodeStatus: "cancelled",
            progress: 50,
            stageKey: "execute",
            message: "operator cancelled",
            updatedAt: "2026-06-22T00:02:00.000Z",
            cancelRequested: true,
          },
        });
      }
      expect(url.pathname).toBe("/api/executor/jobs/job-python-cancel/cancel");
      return jsonResponse({
        ok: true,
        accepted: true,
        cancelRequested: true,
        alreadyFinal: false,
        missionId: mission.id,
        jobId: "job-python-cancel",
        status: "cancelled",
        message: "Cancellation requested",
        runtime: {
          owner: "python",
          persistenceOwner: "node",
          missionStoreOwner: "node",
        },
      });
    });
    const started = await startServer(runtime, fetchImpl as unknown as typeof fetch);
    server = started.server;
    baseUrl = started.baseUrl;

    const response = await fetch(`${baseUrl}/api/tasks/${mission.id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "operator cancelled",
        requestedBy: "runtime-test",
        source: "user",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      alreadyFinal: false,
      executorForwarded: true,
      lifecycle: {
        action: "cancel",
        task: {
          status: "cancelled",
          nodeStatus: "cancelled",
        },
      },
      task: {
        id: mission.id,
        status: "cancelled",
        cancelReason: "operator cancelled",
        cancelledBy: "runtime-test",
      },
    });
    expect(body.task.status).not.toBe("done");
    expect(body.task.status).not.toBe("completed");
    expect(calls).toEqual([
      "POST /api/tasks/runtime/cancel",
      "POST /api/executor/jobs/job-python-cancel/cancel",
    ]);
  });

  it("maps Python lifecycle runtime error envelope to failed task dispatch instead of success", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/api/tasks/runtime/create") {
        return jsonResponse({
          ok: false,
          action: "create",
          contractVersion: "task-lifecycle.runtime-boundary.v1",
          error: "runtime_error",
          code: "TASK_LIFECYCLE_RUNTIME_ERROR",
          message: "Python lifecycle runtime failed.",
          retryable: true,
          runtime: {
            owner: "python",
            mode: "runtime_boundary",
            persistenceOwner: "node",
            missionStoreOwner: "node",
            routeOwner: "node",
            authOwner: "node",
            eventStoreOwner: "node",
          },
        });
      }
      return jsonResponse({ ok: false, error: "unexpected path" }, 404);
    });
    const started = await startServer(runtime, fetchImpl as unknown as typeof fetch);
    server = started.server;
    baseUrl = started.baseUrl;

    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "nl-command",
        title: "Python lifecycle error",
        sourceText: "Run tests and surface Python lifecycle error.",
        autoDispatch: false,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      lifecycleError: "TASK_LIFECYCLE_RUNTIME_ERROR: Python lifecycle runtime failed.",
      task: {
        status: "failed",
      },
    });
    expect(body.task.status).not.toBe("done");
    expect(body.task.status).not.toBe("completed");
    expect(calls).toEqual(["POST /api/tasks/runtime/create"]);
  });
});
