import { describe, expect, it, vi } from "vitest";

import { executeTransactionFlowNode } from "../routes/node-adapters/transaction-flow-node-adapter.js";

function makeDeps(overrides?: {
  permission?: {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
    governance?: {
      outcome: "allowed" | "blocked" | "approval_required";
      riskLevel: "low" | "medium" | "high" | "critical";
      policyId: string;
      rationale: string;
      requiresAudit: boolean;
      specRefs?: string[];
    };
  };
}) {
  return {
    permissionEngine: {
      checkPermission: vi.fn(() => ({
        allowed: overrides?.permission?.allowed ?? true,
        reason: overrides?.permission?.reason,
        suggestion: overrides?.permission?.suggestion,
        governance: overrides?.permission?.governance,
      })),
    },
    auditLogger: {
      log: vi.fn(),
    },
    now: () => "2026-04-23T08:00:00.000Z",
    createId: vi
      .fn()
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("decision-1")
      .mockReturnValueOnce("audit-1"),
  };
}

describe("executeTransactionFlowNode", () => {
  it("returns approval_required before manual approval is submitted", async () => {
    const deps = makeDeps();

    const result = await executeTransactionFlowNode(
      {
        nodeType: "transaction_flow",
        input: {
          agentId: "agent-transaction",
          token: "token-transaction",
          transaction: {
            service: "billing",
            action: "refund_order",
            resource: "orders",
            targetId: "order-1",
            summary: "Refund order order-1",
          },
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("approval_required");
    expect(result.output.approval).toMatchObject({
      required: true,
      status: "pending",
      source: "manual_gate",
    });
    expect(result.output.audit).toMatchObject({
      eventKey: "node.waiting_input",
      summary: expect.stringContaining("waiting for manual approval"),
    });
    expect(result.output.compensation.steps).toHaveLength(3);
  });

  it("returns denied when approver rejects the transaction", async () => {
    const deps = makeDeps();

    const result = await executeTransactionFlowNode(
      {
        nodeType: "transaction_flow",
        input: {
          agentId: "agent-transaction",
          token: "token-transaction",
          transaction: {
            service: "billing",
            action: "refund_order",
            resource: "orders",
            targetId: "order-1",
          },
          approval: {
            decision: "rejected",
            actorId: "approver-1",
            comment: "Missing review evidence",
            ticketId: "ticket-1",
          },
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("denied");
    expect(result.output.audit.eventKey).toBe("human.rejected");
    expect(result.output.error).toBe("Missing review evidence");
  });

  it("returns completed result after approval", async () => {
    const deps = makeDeps();

    const result = await executeTransactionFlowNode(
      {
        nodeType: "transaction_flow",
        input: {
          agentId: "agent-transaction",
          token: "token-transaction",
          transaction: {
            service: "billing",
            action: "refund_order",
            resource: "orders",
            targetId: "order-1",
            summary: "Refund order order-1",
            parameters: {
              operator: "ops",
            },
          },
          approval: {
            decision: "approved",
            actorId: "approver-1",
            comment: "Approved to proceed",
            ticketId: "ticket-1",
          },
          metadata: {
            batchId: "batch-1",
          },
        },
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.audit.eventKey).toBe("human.approved");
    expect(result.output.result).toMatchObject({
      state: "committed",
      service: "billing",
      action: "refund_order",
      targetId: "order-1",
      metadata: expect.objectContaining({
        batchId: "batch-1",
        approvedBy: "approver-1",
        ticketId: "ticket-1",
      }),
    });
  });

  it("returns denied when permission engine blocks the call", async () => {
    const deps = makeDeps({
      permission: {
        allowed: false,
        reason: "No allow rule found for api:call",
        suggestion: "Request transaction flow permission",
      },
    });

    const result = await executeTransactionFlowNode(
      {
        nodeType: "transaction_flow",
        input: {
          agentId: "agent-transaction",
          token: "token-transaction",
          transaction: {
            service: "billing",
            action: "refund_order",
            resource: "orders",
          },
        },
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("denied");
    expect(result.output.governance.permission).toEqual({
      allowed: false,
      resource: "transaction_flow:billing:refund_order:orders",
      reason: "No allow rule found for api:call",
      suggestion: "Request transaction flow permission",
    });
  });
});
