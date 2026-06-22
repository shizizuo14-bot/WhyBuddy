import { describe, expect, it } from "vitest";

import {
  executeTransactionFlowNode,
  mapPythonTransactionFlowRuntimeResponse,
} from "../routes/node-adapters/transaction-flow-node-adapter.js";
import type {
  TransactionFlowPythonRuntimeResponse,
} from "../../shared/web-aigc-transaction-flow.js";

const pythonRuntime = {
  backend: "python",
  provider: "fake",
  source: "python-transaction-flow-runtime",
  externalCalls: false,
  executedTransaction: false,
  persisted: false,
} as const;

function pythonResponse(
  overrides: Partial<TransactionFlowPythonRuntimeResponse> = {},
): TransactionFlowPythonRuntimeResponse {
  return {
    ok: true,
    status: "approved",
    analysis: {
      transactionId: "txn-runtime-1",
      service: "billing",
      action: "refund_order",
      resource: "orders",
      riskLevel: "critical",
      sideEffectCount: 1,
      summary: "Refund order order-1",
    },
    decision: {
      approved: true,
      reason: "Approved after review",
      decisionId: "decision-runtime-1",
      actorId: "approver-1",
      ticketId: "ticket-1",
    },
    permission: {
      allowed: true,
      resource: "transaction_flow:billing:refund_order:orders",
      reason: "policy allowed",
      governance: {
        outcome: "allowed",
        riskLevel: "critical",
        policyId: "security-governance.transaction-flow-gate",
        rationale: "Manual gate satisfied.",
        requiresAudit: true,
        specRefs: ["web-aigc.transaction-flow.runtime"],
      },
    },
    audit: {
      logged: true,
      auditEntryId: "audit-runtime-1",
      operation: "transaction_flow",
      eventKey: "human.approved",
      timestamp: "2026-06-22T08:00:00.000Z",
      decisionId: "decision-runtime-1",
    },
    warnings: [],
    runtime: pythonRuntime,
    metadata: {
      requestId: "runtime-approved",
    },
    ...overrides,
  };
}

describe("transaction flow Python runtime bridge", () => {
  it("maps Python approved envelope to completed without executing a real transaction", async () => {
    const result = await executeTransactionFlowNode(
      {
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
        },
      },
      {
        executePythonRuntime: async () => pythonResponse(),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.pythonStatus).toBe("approved");
    expect(result.output.runtime).toMatchObject({
      backend: "python",
      externalCalls: false,
      executedTransaction: false,
      persisted: false,
    });
    expect(result.output.result).toBeUndefined();
    expect(result.output.analysis.transactionId).toBe("txn-runtime-1");
    expect(result.output.audit.auditEntryId).toBe("audit-runtime-1");
  });

  it.each([
    ["rejected", "permission_denied", "denied"],
    ["degraded", "runtime_degraded", "degraded"],
    ["error", "runtime_error", "failed"],
  ] as const)(
    "keeps Python %s separate from approved",
    (pythonStatus, errorCode, nodeStatus) => {
      const result = mapPythonTransactionFlowRuntimeResponse(
        pythonResponse({
          ok: false,
          status: pythonStatus,
          decision: {
            approved: false,
            reason: `${errorCode} message`,
            decisionId: "decision-runtime-1",
          },
          error: {
            code: errorCode,
            message: `${errorCode} message`,
          },
          warnings:
            pythonStatus === "degraded"
              ? ["Transaction flow runtime is degraded."]
              : [],
        }),
      );

      expect(result.ok).toBe(false);
      expect(result.output.status).toBe(nodeStatus);
      expect(result.output.pythonStatus).toBe(pythonStatus);
      expect(result.output.pythonStatus).not.toBe("approved");
      expect(result.output.approval.status).not.toBe("approved");
      expect(result.output.error).toBe(`${errorCode} message`);
      expect(result.output.runtime).toMatchObject({
        backend: "python",
        executedTransaction: false,
      });
      expect(result.output.result).toBeUndefined();
    },
  );
});
