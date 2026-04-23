import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { createTransactionFlowRouter } from "../routes/transaction-flow.js";

async function withServer(
  handler: (
    baseUrl: string,
    permissionCheck: ReturnType<typeof vi.fn>,
    auditLog: ReturnType<typeof vi.fn>,
  ) => Promise<void>,
): Promise<void> {
  const permissionCheck = vi.fn(() => ({
    allowed: true,
  }));
  const auditLog = vi.fn();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/transaction-flow",
    createTransactionFlowRouter({
      permissionEngine: {
        checkPermission: permissionCheck,
      },
      auditLogger: {
        log: auditLog,
      },
      now: () => "2026-04-23T08:00:00.000Z",
      createId: () => "route-fixed-id",
    }),
  );

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await handler(baseUrl, permissionCheck, auditLog);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("POST /api/transaction-flow/nodes/execute", () => {
  it("returns 400 when nodeType is invalid", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/transaction-flow/nodes/execute`, {
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

  it("returns 409 when approval is required", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/transaction-flow/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "transaction_flow",
          input: {
            agentId: "agent-1",
            token: "token-1",
            transaction: {
              service: "billing",
              action: "refund_order",
              resource: "orders",
            },
          },
        }),
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.output.status).toBe("approval_required");
      expect(body.output.approval.required).toBe(true);
    });
  });

  it("returns 200 when transaction is approved and completed", async () => {
    await withServer(async (baseUrl, permissionCheck) => {
      permissionCheck.mockReturnValue({
        allowed: true,
      });

      const response = await fetch(`${baseUrl}/api/transaction-flow/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "transaction_flow",
          input: {
            agentId: "agent-1",
            token: "token-1",
            transaction: {
              service: "billing",
              action: "refund_order",
              resource: "orders",
              targetId: "order-1",
            },
            approval: {
              decision: "approved",
              actorId: "approver-1",
              ticketId: "ticket-1",
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output.status).toBe("completed");
      expect(body.output.result.transactionId).toBeTruthy();
    });
  });

  it("returns 403 when transaction is rejected", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/transaction-flow/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "transaction_flow",
          input: {
            agentId: "agent-1",
            token: "token-1",
            transaction: {
              service: "billing",
              action: "refund_order",
              resource: "orders",
            },
            approval: {
              decision: "rejected",
              actorId: "approver-1",
              comment: "审批驳回",
            },
          },
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.output.status).toBe("denied");
    });
  });
});
