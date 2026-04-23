import { describe, expect, it, vi } from "vitest";

import { AuditEventType } from "../../shared/audit/contracts.js";
import { executeOrchestrationRecognitionJumpNode } from "../routes/node-adapters/orchestration-recognition-jump-node-adapter.js";

describe("executeOrchestrationRecognitionJumpNode", () => {
  it("recognizes the best candidate, inherits context, and records audit", async () => {
    const auditCollector = {
      record: vi.fn(),
    };

    const result = await executeOrchestrationRecognitionJumpNode(
      {
        nodeType: "orchestration_recognition_jump",
        input: {
          query: "打开订单审核主流程",
          candidates: [
            {
              orchestrationId: "sales-refund",
              entryNodeId: "refund-entry",
              label: "退款处理",
              keywords: ["退款", "售后"],
            },
            {
              orchestrationId: "order-review",
              entryNodeId: "order-review-entry",
              label: "订单审核主流程",
              keywords: ["订单", "审核"],
              aliases: ["主审核"],
              inheritContextKeys: ["sessionId", "requestId"],
            },
          ],
          context: {
            sessionId: "session-1",
            requestId: "req-1",
            ignored: "x",
          },
        },
      },
      {
        auditCollector,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.jumpTargetNodeId).toBe("order-review-entry");
    expect(result.output.jumpValidated).toBe(true);
    expect(result.output.recognizedTarget).toMatchObject({
      orchestrationId: "order-review",
      entryNodeId: "order-review-entry",
      source: "candidate",
    });
    expect(result.output.context).toMatchObject({
      sessionId: "session-1",
      requestId: "req-1",
      inheritedContext: {
        sessionId: "session-1",
        requestId: "req-1",
      },
    });
    expect(auditCollector.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.DECISION_MADE,
        result: "success",
        metadata: expect.objectContaining({
          eventKey: "orchestration.recognized",
        }),
      }),
    );
  });

  it("returns denied when permission check blocks the selected orchestration jump", async () => {
    const permissionEngine = {
      checkPermission: vi.fn(() => ({
        allowed: false,
        reason: "policy denied",
        suggestion: "request approval",
      })),
    };
    const auditCollector = {
      record: vi.fn(),
    };

    const result = await executeOrchestrationRecognitionJumpNode(
      {
        nodeType: "orchestration_recognition_jump",
        input: {
          query: "进入审批流程",
          candidates: [
            {
              orchestrationId: "approval-flow",
              entryNodeId: "approval-entry",
              label: "审批流程",
            },
          ],
          context: {
            workflowId: "wf-1",
          },
          agentId: "agent-1",
          token: "token-1",
        },
      },
      {
        permissionEngine,
        auditCollector,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("denied");
    expect(result.output.jumpValidated).toBe(false);
    expect(result.output.error).toContain("policy denied");
    expect(permissionEngine.checkPermission).toHaveBeenCalledWith(
      "agent-1",
      "api",
      "call",
      "POST /api/orchestration-recognition-jump/nodes/execute:approval-flow:approval-entry",
      "token-1",
    );
    expect(auditCollector.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.DECISION_MADE,
        result: "denied",
      }),
    );
  });

  it("uses fallback target when no candidate matches the query", async () => {
    const result = await executeOrchestrationRecognitionJumpNode({
      nodeType: "orchestration_recognition_jump",
      input: {
        query: "未知流程",
        candidates: [
          {
            orchestrationId: "known-flow",
            entryNodeId: "known-entry",
            label: "已知流程",
          },
        ],
        fallbackTarget: {
          orchestrationId: "fallback-flow",
          entryNodeId: "fallback-entry",
          reason: "default_route",
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output.recognizedTarget).toMatchObject({
      orchestrationId: "fallback-flow",
      entryNodeId: "fallback-entry",
      source: "fallback",
    });
    expect(result.output.jumpTargetNodeId).toBe("fallback-entry");
  });
});
