import { randomUUID } from "node:crypto";

import type { PermissionCheckResult } from "../../../shared/permission/contracts.js";
import { getWebAigcNodeRiskEntry } from "../../../shared/web-aigc-governance.js";
import type {
  TransactionFlowAction,
  TransactionFlowApprovalInput,
  TransactionFlowCompensationPlan,
  TransactionFlowExecutionInput,
  TransactionFlowExecutionSummary,
  TransactionFlowNodeExecutionRequest,
  TransactionFlowNodeExecutionResult,
  TransactionFlowNodeType,
  TransactionFlowStatus,
} from "../../../shared/web-aigc-transaction-flow.js";

export interface TransactionFlowPermissionEngine {
  checkPermission(
    agentId: string,
    resourceType: "api",
    action: "call",
    resource: string,
    token: string,
  ): PermissionCheckResult;
}

export interface TransactionFlowAuditLogger {
  log(entry: {
    agentId: string;
    operation: string;
    resourceType: "api";
    action: "call";
    resource: string;
    result: "allowed" | "denied" | "error";
    reason?: string;
    governance?: PermissionCheckResult["governance"];
    metadata?: Record<string, unknown>;
  }): void;
}

export interface TransactionFlowNodeAdapterDeps {
  permissionEngine?: TransactionFlowPermissionEngine;
  auditLogger?: TransactionFlowAuditLogger;
  now?: () => string;
  createId?: () => string;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function ensureString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`Transaction flow input requires ${field}.`);
  }
  return normalized;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...value };
}

function normalizeApproval(
  value: TransactionFlowApprovalInput | undefined,
): TransactionFlowApprovalInput {
  return {
    decision:
      value?.decision === "approved" || value?.decision === "rejected"
        ? value.decision
        : undefined,
    actorId: normalizeString(value?.actorId),
    comment: normalizeString(value?.comment),
    ticketId: normalizeString(value?.ticketId),
    decisionId: normalizeString(value?.decisionId),
    submittedAt: normalizeString(value?.submittedAt),
  };
}

function buildDefaultCompensationPlan(
  transaction: TransactionFlowAction & { transactionId: string; service: string },
  input: TransactionFlowExecutionInput | undefined,
): TransactionFlowCompensationPlan {
  const compensation = input?.compensation;
  const strategy =
    compensation?.strategy === "manual_rollback" ||
    compensation?.strategy === "none"
      ? compensation.strategy
      : "manual_compensation";
  const summary =
    normalizeString(compensation?.summary) ||
    `若 ${transaction.service}.${transaction.action} 执行后出现异常，需要人工核对并执行补偿。`;
  const rollbackHint =
    normalizeString(compensation?.rollbackHint) ||
    `人工检查 ${transaction.resource} 的最新状态，并依据审计记录回退 ${transaction.transactionId}。`;
  const steps = normalizeStringArray(compensation?.steps);

  return {
    strategy,
    summary,
    steps:
      steps.length > 0
        ? steps
        : [
            "核对事务执行后的目标资源状态与业务流水。",
            "通知人工值守根据审计记录执行补偿或回退。",
            "补充处理结果并关闭审批单据。",
          ],
    rollbackHint,
  };
}

function buildResource(transaction: TransactionFlowAction & { service: string }): string {
  return `transaction_flow:${transaction.service}:${transaction.action}:${transaction.resource}`;
}

function buildPrompt(transaction: TransactionFlowAction): string {
  const summary =
    normalizeString(transaction.summary) ||
    `${transaction.action} -> ${transaction.resource}`;
  return `请确认是否执行高风险事务：${summary}`;
}

function buildExecutionSummary(
  transaction: TransactionFlowAction & { transactionId: string; service: string },
  timestamp: string,
  metadata: Record<string, unknown>,
): TransactionFlowExecutionSummary {
  return {
    transactionId: transaction.transactionId,
    mutationKey: `${transaction.service}:${transaction.action}:${transaction.targetId || transaction.resource}`,
    executedAt: timestamp,
    state: "committed",
    service: transaction.service,
    action: transaction.action,
    resource: transaction.resource,
    ...(transaction.targetId ? { targetId: transaction.targetId } : {}),
    summary:
      normalizeString(transaction.summary) ||
      `已执行 ${transaction.service}.${transaction.action} 对 ${transaction.resource} 的事务动作`,
    metadata,
  };
}

function buildPermissionSummary(
  permission: PermissionCheckResult | undefined,
  resource: string,
) {
  return {
    allowed: permission?.allowed ?? true,
    resource,
    reason: permission?.reason,
    suggestion: permission?.suggestion,
  };
}

export function isTransactionFlowNodeType(
  value: unknown,
): value is TransactionFlowNodeType {
  return value === "transaction_flow";
}

export async function executeTransactionFlowNode(
  request: TransactionFlowNodeExecutionRequest,
  deps: TransactionFlowNodeAdapterDeps = {},
): Promise<TransactionFlowNodeExecutionResult> {
  if (!isTransactionFlowNodeType(request.nodeType)) {
    throw new Error("Unsupported transaction_flow node type.");
  }

  const now = deps.now ?? (() => new Date().toISOString());
  const createId = deps.createId ?? (() => randomUUID());
  const riskEntry = getWebAigcNodeRiskEntry("transaction_flow");
  if (!riskEntry) {
    throw new Error("Transaction flow governance metadata is missing.");
  }

  const input = request.input ?? {};
  const baseTransaction: Partial<TransactionFlowAction> = input.transaction ?? {};
  const transaction = {
    ...baseTransaction,
    transactionId:
      normalizeString(baseTransaction.transactionId) || `txn_${createId()}`,
    service: ensureString(baseTransaction.service, "transaction.service"),
    action: ensureString(baseTransaction.action, "transaction.action"),
    resource: ensureString(baseTransaction.resource, "transaction.resource"),
    ...(normalizeString(baseTransaction.targetId)
      ? { targetId: normalizeString(baseTransaction.targetId) }
      : {}),
    ...(normalizeString(baseTransaction.summary)
      ? { summary: normalizeString(baseTransaction.summary) }
      : {}),
    ...(typeof baseTransaction.amount === "number"
      ? { amount: baseTransaction.amount }
      : {}),
    ...(normalizeString(baseTransaction.currency)
      ? { currency: normalizeString(baseTransaction.currency) }
      : {}),
    parameters: normalizeObject(baseTransaction.parameters),
    sideEffects: normalizeStringArray(baseTransaction.sideEffects),
  };

  const resource = buildResource(transaction);
  let permission: PermissionCheckResult | undefined;
  if (deps.permissionEngine) {
    permission = deps.permissionEngine.checkPermission(
      ensureString(input.agentId, "agentId"),
      "api",
      "call",
      resource,
      ensureString(input.token, "token"),
    );
  }

  const approval = normalizeApproval(input.approval);
  const decisionId = approval.decisionId || `decision_${createId()}`;
  const prompt = buildPrompt(transaction);
  const compensation = buildDefaultCompensationPlan(transaction, input);
  const auditEntryId = `audit_${createId()}`;
  const timestamp = approval.submittedAt || now();
  const permissionSummary = buildPermissionSummary(permission, resource);
  const governance = {
    nodeType: "transaction_flow" as const,
    riskLevel: riskEntry.riskLevel,
    requiresAudit: riskEntry.requiresAudit,
    approvalMode: riskEntry.approvalMode,
    permissionBinding: riskEntry.permission,
    permission: permissionSummary,
    specRefs: riskEntry.specRefs,
  };

  const buildResult = (
    status: TransactionFlowStatus,
    overrides: Partial<TransactionFlowNodeExecutionResult["output"]> = {},
  ): TransactionFlowNodeExecutionResult => ({
    ok: status === "completed",
    nodeType: "transaction_flow",
    output: {
      status,
      transaction,
      governance,
      approval: {
        required: true,
        status:
          status === "approval_required"
            ? "pending"
            : status === "denied"
              ? "rejected"
              : "approved",
        source: riskEntry.approvalMode,
        prompt,
        decisionId,
        ...(approval.actorId ? { actorId: approval.actorId } : {}),
        ...(approval.comment ? { comment: approval.comment } : {}),
        ...(approval.ticketId ? { ticketId: approval.ticketId } : {}),
        ...(approval.submittedAt ? { submittedAt: approval.submittedAt } : {}),
      },
      audit: {
        logged: Boolean(deps.auditLogger),
        auditEntryId,
        operation: "transaction_flow",
        eventKey:
          status === "approval_required"
            ? "node.waiting_input"
            : status === "denied"
              ? "human.rejected"
              : status === "failed"
                ? "node.failed"
                : "human.approved",
        summary:
          status === "approval_required"
            ? `事务 ${transaction.transactionId} 进入人工审批闸门`
            : status === "denied"
              ? `事务 ${transaction.transactionId} 已被人工拒绝`
              : status === "failed"
                ? `事务 ${transaction.transactionId} 执行失败`
                : `事务 ${transaction.transactionId} 已通过审批并执行`,
        timestamp,
        decisionId,
      },
      compensation,
      ...overrides,
    },
  });

  if (permission && !permission.allowed && permission.governance?.outcome !== "approval_required") {
    deps.auditLogger?.log({
      agentId: ensureString(input.agentId, "agentId"),
      operation: "transaction_flow",
      resourceType: "api",
      action: "call",
      resource,
      result: "denied",
      reason: permission.reason ?? "Permission denied",
      governance: permission.governance,
      metadata: {
        transactionId: transaction.transactionId,
        decisionId,
        status: "denied",
      },
    });

    return buildResult("denied", {
      error: permission.reason ?? "Permission denied",
    });
  }

  const requiresApproval =
    input.requireApproval === true ||
    riskEntry.approvalMode === "manual_gate" ||
    permission?.governance?.outcome === "approval_required";

  if (requiresApproval && approval.decision !== "approved" && approval.decision !== "rejected") {
    deps.auditLogger?.log({
      agentId: ensureString(input.agentId, "agentId"),
      operation: "transaction_flow",
      resourceType: "api",
      action: "call",
      resource,
      result: "denied",
      reason: "Transaction flow requires manual approval",
      governance: permission?.governance,
      metadata: {
        transactionId: transaction.transactionId,
        decisionId,
        status: "approval_required",
        prompt,
        compensation,
      },
    });

    return buildResult("approval_required");
  }

  if (approval.decision === "rejected") {
    deps.auditLogger?.log({
      agentId: ensureString(input.agentId, "agentId"),
      operation: "transaction_flow",
      resourceType: "api",
      action: "call",
      resource,
      result: "denied",
      reason: approval.comment ?? "Rejected by approver",
      governance: permission?.governance,
      metadata: {
        transactionId: transaction.transactionId,
        decisionId,
        status: "denied",
        actorId: approval.actorId,
        ticketId: approval.ticketId,
      },
    });

    return buildResult("denied", {
      error: approval.comment ?? "Rejected by approver",
    });
  }

  try {
    const executionMetadata = {
      ...normalizeObject(input.metadata),
      ...normalizeObject(input.context),
      decisionId,
      approvedBy: approval.actorId,
      ticketId: approval.ticketId,
    };
    const result = buildExecutionSummary(transaction, now(), executionMetadata);

    deps.auditLogger?.log({
      agentId: ensureString(input.agentId, "agentId"),
      operation: "transaction_flow",
      resourceType: "api",
      action: "call",
      resource,
      result: "allowed",
      governance: permission?.governance,
      metadata: {
        transactionId: transaction.transactionId,
        decisionId,
        status: "completed",
        actorId: approval.actorId,
        ticketId: approval.ticketId,
        compensation,
        result,
      },
    });

    return buildResult("completed", {
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.auditLogger?.log({
      agentId: ensureString(input.agentId, "agentId"),
      operation: "transaction_flow",
      resourceType: "api",
      action: "call",
      resource,
      result: "error",
      reason: message,
      governance: permission?.governance,
      metadata: {
        transactionId: transaction.transactionId,
        decisionId,
        status: "failed",
        compensation,
      },
    });

    return buildResult("failed", {
      error: message,
    });
  }
}
