import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { createOpenReportRouter } from "../routes/open-report.js";

async function withServer(
  deps: Parameters<typeof createOpenReportRouter>[0],
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/workflows/open-report", createOpenReportRouter(deps));

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await handler(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function makeDeps(overrides?: {
  deny?: boolean;
  finalReportMissing?: boolean;
  withPermissionEngine?: boolean;
}) {
  return {
    getWorkflow: vi.fn((workflowId: string) => ({ id: workflowId })),
    readFinalWorkflowReport: vi.fn((workflowId: string) =>
      overrides?.finalReportMissing ? null : { workflowId },
    ),
    getFinalWorkflowReportFilePath: vi.fn((workflowId: string, format: "json" | "md") =>
      `data/reports/${workflowId}.${format}`,
    ),
    getDepartmentReportFilePath: vi.fn(
      (managerId: string, workflowId: string, format: "json" | "md") =>
        `data/reports/${workflowId}-${managerId}.${format}`,
    ),
    getReplayTimeline: vi.fn(async (replayId: string) => ({
      missionId: replayId,
      eventCount: 2,
    })),
    ...(overrides?.withPermissionEngine
      ? {
          permissionEngine: {
            checkPermission: vi.fn(() => ({
              allowed: !overrides?.deny,
              reason: overrides?.deny ? "Permission denied" : undefined,
            })),
          },
        }
      : {}),
  };
}

describe("POST /api/workflows/open-report/nodes/execute", () => {
  it("returns 400 when nodeType is invalid", async () => {
    await withServer(makeDeps(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workflows/open-report/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "llm",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("nodeType");
    });
  });

  it("returns completed target for final report view", async () => {
    await withServer(makeDeps(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workflows/open-report/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "open_report",
          input: {
            reportType: "final_report",
            workflowId: "wf-open-report",
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.output.target.href).toBe("/api/workflows/wf-open-report/report");
    });
  });

  it("maps denied access to 403", async () => {
    await withServer(makeDeps({ deny: true, withPermissionEngine: true }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workflows/open-report/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "open_report",
          input: {
            reportType: "final_report",
            workflowId: "wf-open-report",
            agentId: "agent-1",
            token: "token-1",
          },
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.output.status).toBe("denied");
    });
  });

  it("maps missing report to 404", async () => {
    await withServer(makeDeps({ finalReportMissing: true }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workflows/open-report/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "open_report",
          input: {
            reportType: "final_report",
            workflowId: "wf-open-report",
          },
        }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.output.status).toBe("not_found");
    });
  });
});
