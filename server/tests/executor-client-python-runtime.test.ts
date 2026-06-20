import { describe, expect, it, vi } from "vitest";

import {
  ExecutorClient,
  ExecutorClientError,
} from "../core/executor-client.js";
import type {
  CancelExecutorJobResponse,
  CreateExecutorJobResponse,
  ExecutorApiErrorResponse,
  ExecutorJobDetailResponse,
} from "../../shared/executor/api.js";
import type { ExecutionPlan } from "../../shared/executor/contracts.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createPlan(): ExecutionPlan {
  return {
    version: "2026-03-28",
    missionId: "mission-python-runtime",
    summary: "Run task executor runtime bridge",
    objective: "Validate Python runtime bridge envelopes",
    requestedBy: "brain",
    mode: "managed",
    steps: [
      {
        key: "task.execute",
        label: "Execute task",
        description: "Run a deterministic runtime bridge slice",
      },
    ],
    jobs: [
      {
        id: "job-python-runtime",
        key: "task.execute",
        label: "Execute task",
        description: "Run a deterministic runtime bridge slice",
        kind: "execute",
      },
    ],
  };
}

function createJobDetail(
  status: "completed" | "failed" | "cancelled",
): ExecutorJobDetailResponse {
  return {
    ok: true,
    job: {
      requestId: "request-python-runtime",
      missionId: "mission-python-runtime",
      jobId: `job-${status}`,
      jobKey: "task.execute",
      jobLabel: "Execute task",
      kind: "execute",
      status,
      progress: 100,
      message: `Job ${status}`,
      receivedAt: "2026-06-20T00:00:00.000Z",
      finishedAt: "2026-06-20T00:00:05.000Z",
      errorCode: status === "failed" ? "TASK_EXECUTOR_FAILED" : undefined,
      errorMessage: status === "failed" ? "Task executor failed" : undefined,
      callbackMode: "pending",
      artifactCount: 0,
      artifacts: [],
      events: [
        {
          version: "2026-03-28",
          eventId: `event-${status}`,
          missionId: "mission-python-runtime",
          jobId: `job-${status}`,
          executor: "lobster",
          type: `job.${status}`,
          status,
          occurredAt: "2026-06-20T00:00:05.000Z",
          message: `Job ${status}`,
          errorCode: status === "failed" ? "TASK_EXECUTOR_FAILED" : undefined,
        },
      ],
      dataDirectory: `executor-data/jobs/mission-python-runtime/job-${status}`,
      logFile: `executor-data/jobs/mission-python-runtime/job-${status}/executor.log`,
    },
  };
}

describe("ExecutorClient Python task executor runtime bridge", () => {
  it("consumes Python runtime start/status/cancel envelopes without starting a local worker", async () => {
    const calls: string[] = [];
    const startResponse: CreateExecutorJobResponse = {
      ok: true,
      accepted: true,
      requestId: "request-python-runtime",
      missionId: "mission-python-runtime",
      jobId: "job-completed",
      receivedAt: "2026-06-20T00:00:01.000Z",
    };
    const cancelResponse: CancelExecutorJobResponse = {
      ok: true,
      accepted: true,
      cancelRequested: true,
      alreadyFinal: false,
      missionId: "mission-python-runtime",
      jobId: "job-cancelled",
      status: "cancelled",
      message: "Cancellation requested",
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url.pathname}`);

      if (method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" });
      }
      if (method === "POST" && url.pathname === "/api/executor/jobs") {
        return jsonResponse(startResponse);
      }
      if (method === "GET" && url.pathname === "/api/executor/jobs/job-completed") {
        return jsonResponse(createJobDetail("completed"));
      }
      if (method === "POST" && url.pathname === "/api/executor/jobs/job-cancelled/cancel") {
        return jsonResponse(cancelResponse);
      }

      return jsonResponse({ ok: false, error: "unexpected runtime path" }, 404);
    });
    const client = new ExecutorClient({
      baseUrl: "http://python-runtime.test",
      callbackUrl: "http://node.test/api/executor/events",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
      createId: () => "generated-id",
    });

    const start = await client.dispatchPlan(createPlan(), {
      requestId: "request-python-runtime",
      jobId: "job-completed",
    });
    const completed = await client.getJob("job-completed");
    const cancel = await client.cancelJob("job-cancelled", {
      reason: "operator cancel",
      requestedBy: "runtime-test",
      source: "user",
    });

    expect(start.response).toEqual(startResponse);
    expect(completed.status).toBe("completed");
    expect(cancel.status).toBe("cancelled");
    expect(cancel.status).not.toBe("completed");
    expect(calls).toEqual([
      "GET /health",
      "POST /api/executor/jobs",
      "GET /api/executor/jobs/job-completed",
      "POST /api/executor/jobs/job-cancelled/cancel",
    ]);
  });

  it("maps completed, failed, and cancelled status details without coercion", async () => {
    const client = new ExecutorClient({
      baseUrl: "http://python-runtime.test",
      callbackUrl: "http://node.test/api/executor/events",
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/job-completed")) {
          return jsonResponse(createJobDetail("completed"));
        }
        if (url.pathname.endsWith("/job-failed")) {
          return jsonResponse(createJobDetail("failed"));
        }
        return jsonResponse(createJobDetail("cancelled"));
      },
    });

    await expect(client.getJob("job-completed")).resolves.toMatchObject({
      status: "completed",
      progress: 100,
    });
    await expect(client.getJob("job-failed")).resolves.toMatchObject({
      status: "failed",
      errorCode: "TASK_EXECUTOR_FAILED",
    });
    await expect(client.getJob("job-cancelled")).resolves.toMatchObject({
      status: "cancelled",
      events: [
        expect.objectContaining({
          type: "job.cancelled",
          status: "cancelled",
        }),
      ],
    });
  });

  it("maps Python runtime error envelopes to rejected errors instead of success", async () => {
    const errorResponse: ExecutorApiErrorResponse = {
      ok: false,
      error: "Task executor runtime failed",
      code: "TASK_EXECUTOR_ERROR",
      hint: "Treat this as unavailable/rejected; do not mark the task completed.",
    };
    const client = new ExecutorClient({
      baseUrl: "http://python-runtime.test",
      callbackUrl: "http://node.test/api/executor/events",
      fetchImpl: async () => jsonResponse(errorResponse, 500),
    });

    await expect(client.getJob("job-error")).rejects.toMatchObject({
      name: "ExecutorClientError",
      kind: "rejected",
      statusCode: 500,
      details: {
        code: "TASK_EXECUTOR_ERROR",
        hint: "Treat this as unavailable/rejected; do not mark the task completed.",
      },
    } satisfies Partial<ExecutorClientError>);
  });

  it("does not treat Python runtime timeouts as completed jobs", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const client = new ExecutorClient({
      baseUrl: "http://python-runtime.test",
      callbackUrl: "http://node.test/api/executor/events",
      timeoutMs: 1000,
      fetchImpl: async () => {
        throw abortError;
      },
    });

    await expect(client.getJob("job-timeout")).rejects.toMatchObject({
      name: "ExecutorClientError",
      kind: "unavailable",
    } satisfies Partial<ExecutorClientError>);
  });
});
