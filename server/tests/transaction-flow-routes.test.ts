import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import {
  createTransactionFlowRouter,
  type TransactionFlowRouterDeps,
} from "../routes/transaction-flow.js";

async function withServer(
  handler: (
    baseUrl: string,
    permissionCheck: ReturnType<typeof vi.fn>,
    auditLog: ReturnType<typeof vi.fn>,
  ) => Promise<void>,
  deps: TransactionFlowRouterDeps = {},
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
      ...deps,
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
              comment: "Rejected by approver",
            },
          },
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.output.status).toBe("denied");
    });
  });

  it("maps Python degraded response to 503 without approving the flow", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/transaction-flow/nodes/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeType: "transaction_flow",
            input: {
              transaction: {
                service: "billing",
                action: "refund_order",
                resource: "orders",
              },
            },
          }),
        });

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.ok).toBe(false);
        expect(body.output.status).toBe("degraded");
        expect(body.output.pythonStatus).toBe("degraded");
        expect(body.output.approval.status).not.toBe("approved");
        expect(body.output.runtime.executedTransaction).toBe(false);
      },
      {
        executePythonRuntime: async () => ({
          ok: false,
          status: "degraded",
          analysis: {
            transactionId: "txn-python-degraded",
            service: "billing",
            action: "refund_order",
            resource: "orders",
            riskLevel: "critical",
            sideEffectCount: 0,
            summary: "Runtime degraded before transaction execution.",
          },
          decision: {
            approved: false,
            reason: "Transaction flow runtime is degraded.",
            decisionId: "decision-python-degraded",
          },
          permission: {
            allowed: true,
            resource: "transaction_flow:billing:refund_order:orders",
          },
          audit: {
            logged: false,
            auditEntryId: "audit-python-degraded",
            operation: "transaction_flow",
            eventKey: "node.failed",
            summary: "Python runtime degraded.",
            timestamp: "2026-06-22T08:00:00.000Z",
            decisionId: "decision-python-degraded",
          },
          warnings: ["Transaction flow runtime is degraded."],
          error: {
            code: "runtime_degraded",
            message: "Transaction flow runtime is degraded.",
          },
          runtime: {
            backend: "python",
            provider: "fake",
            source: "python-transaction-flow-runtime",
            externalCalls: false,
            executedTransaction: false,
            persisted: false,
          },
        }),
      },
    );
  });
});
