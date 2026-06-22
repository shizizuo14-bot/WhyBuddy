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
  TransactionFlowPythonRuntimeResponse,
  TransactionFlowRuntimeAnalysis,
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
  executePythonRuntime?: (
    input: TransactionFlowExecutionInput,
  ) => Promise<TransactionFlowPythonRuntimeResponse>;
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
    `If ${transaction.service}.${transaction.action} changes state unexpectedly, operators must review audit evidence and apply manual compensation.`;
  const rollbackHint =
    normalizeString(compensation?.rollbackHint) ||
    `Manually inspect the latest ${transaction.resource} state and reconcile ${transaction.transactionId} from the audit trail.`;
  const steps = normalizeStringArray(compensation?.steps);

  return {
    strategy,
    summary,
    steps:
      steps.length > 0
        ? steps
        : [
            "Compare the target resource state with the expected business ledger.",
            "Ask the human operator to compensate or roll back from audit evidence.",
            "Record the handling result and close the approval ticket.",
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
  return `Confirm whether to approve this high-risk transaction: ${summary}`;
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
      `Executed ${transaction.service}.${transaction.action} for ${transaction.resource}.`,
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

function buildFallbackTransaction(
  response: TransactionFlowPythonRuntimeResponse,
  input: TransactionFlowExecutionInput,
): TransactionFlowAction & { transactionId: string; service: string } {
  const source: Partial<TransactionFlowAction> = input.transaction ?? {};
  const analysis = response.analysis;
  return {
    ...source,
    transactionId:
      normalizeString(source.transactionId) ||
      normalizeString(analysis?.transactionId) ||
      "txn_python_runtime",
    service:
      normalizeString(source.service) ||
      normalizeString(analysis?.service) ||
      "python_runtime",
    action:
      normalizeString(source.action) ||
      normalizeString(analysis?.action) ||
      "decision_boundary",
    resource:
      normalizeString(source.resource) ||
      normalizeString(analysis?.resource) ||
      "transaction_flow",
    ...(normalizeString(source.targetId) || normalizeString(analysis?.targetId)
      ? { targetId: normalizeString(source.targetId) || normalizeString(analysis?.targetId) }
      : {}),
    ...(normalizeString(source.summary) || normalizeString(analysis?.summary)
      ? { summary: normalizeString(source.summary) || normalizeString(analysis?.summary) }
      : {}),
    ...(typeof source.amount === "number" ? { amount: source.amount } : {}),
    ...(normalizeString(source.currency)
      ? { currency: normalizeString(source.currency) }
      : {}),
    parameters: normalizeObject(source.parameters),
    sideEffects: normalizeStringArray(source.sideEffects),
  };
}

function buildPythonGovernanceSnapshot(response: TransactionFlowPythonRuntimeResponse) {
  const riskEntry = getWebAigcNodeRiskEntry("transaction_flow");
  if (!riskEntry) {
    throw new Error("Transaction flow governance metadata is missing.");
  }

  const permission = response.permission;
  return {
    nodeType: "transaction_flow" as const,
    riskLevel: response.analysis?.riskLevel ?? riskEntry.riskLevel,
    requiresAudit: riskEntry.requiresAudit,
    approvalMode: riskEntry.approvalMode,
    permissionBinding: riskEntry.permission,
    permission: {
      allowed: permission?.allowed ?? false,
      resource: permission?.resource ?? riskEntry.permission?.resource ?? "transaction_flow",
      reason: permission?.reason,
      suggestion: permission?.suggestion,
    },
    specRefs: permission?.governance?.specRefs ?? riskEntry.specRefs,
  };
}

function buildPythonApprovalSnapshot(
  response: TransactionFlowPythonRuntimeResponse,
  status: TransactionFlowStatus,
  prompt: string,
) {
  const decision = response.decision;
  return {
    required: true,
    status:
      status === "completed"
        ? "approved" as const
        : status === "approval_required"
          ? "pending" as const
          : "rejected" as const,
    source: "manual_gate" as const,
    prompt,
    decisionId: decision?.decisionId ?? response.audit?.decisionId ?? "decision_python_runtime",
    ...(decision?.actorId ? { actorId: decision.actorId } : {}),
    ...(decision?.reason ? { comment: decision.reason } : {}),
    ...(decision?.ticketId ? { ticketId: decision.ticketId } : {}),
  };
}

function buildPythonAuditSnapshot(
  response: TransactionFlowPythonRuntimeResponse,
  status: TransactionFlowStatus,
  decisionId: string,
) {
  if (response.audit) {
    return response.audit;
  }

  return {
    logged: false,
    auditEntryId: "audit_python_runtime",
    operation: "transaction_flow" as const,
    eventKey:
      status === "completed"
        ? "human.approved" as const
        : status === "failed"
          ? "node.failed" as const
          : "human.rejected" as const,
    summary: "Python transaction-flow runtime returned a decision envelope.",
    timestamp: new Date(0).toISOString(),
    decisionId,
  };
}

function pythonStatusToNodeStatus(
  response: TransactionFlowPythonRuntimeResponse,
): TransactionFlowStatus {
  if (response.ok === true && response.status === "approved") {
    return "completed";
  }
  if (response.status === "rejected") {
    return "denied";
  }
  if (response.status === "degraded") {
    return "degraded";
  }
  return "failed";
}

function buildPythonErrorMessage(
  response: TransactionFlowPythonRuntimeResponse,
): string | undefined {
  if (response.status === "approved" && response.ok === true) {
    return undefined;
  }
  return (
    response.error?.message ||
    response.decision?.reason ||
    "Python transaction-flow runtime did not approve the decision envelope."
  );
}

function normalizeRuntimeAnalysis(
  response: TransactionFlowPythonRuntimeResponse,
  transaction: TransactionFlowAction & { transactionId: string; service: string },
): TransactionFlowRuntimeAnalysis {
  return response.analysis ?? {
    transactionId: transaction.transactionId,
    service: transaction.service,
    action: transaction.action,
    resource: transaction.resource,
    ...(transaction.targetId ? { targetId: transaction.targetId } : {}),
    riskLevel: "critical",
    sideEffectCount: transaction.sideEffects?.length ?? 0,
    summary:
      normalizeString(transaction.summary) ||
      `${transaction.service}.${transaction.action} on ${transaction.resource}`,
  };
}

export function mapPythonTransactionFlowRuntimeResponse(
  response: TransactionFlowPythonRuntimeResponse,
  input: TransactionFlowExecutionInput = {},
): TransactionFlowNodeExecutionResult {
  const transaction = buildFallbackTransaction(response, input);
  const status = pythonStatusToNodeStatus(response);
  const governance = buildPythonGovernanceSnapshot(response);
  const prompt = buildPrompt(transaction);
  const approval = buildPythonApprovalSnapshot(response, status, prompt);
  const audit = buildPythonAuditSnapshot(response, status, approval.decisionId);
  const compensation = buildDefaultCompensationPlan(transaction, input);
  const warnings = Array.isArray(response.warnings) ? response.warnings : [];
  const metadata = normalizeObject(response.metadata);
  const error = buildPythonErrorMessage(response);

  return {
    ok: status === "completed",
    nodeType: "transaction_flow",
    output: {
      status,
      pythonStatus: response.status,
      transaction,
      governance,
      approval,
      audit,
      compensation,
      analysis: normalizeRuntimeAnalysis(response, transaction),
      ...(response.runtime ? { runtime: response.runtime } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(error ? { error } : {}),
    },
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

  const input = request.input ?? {};
  if (deps.executePythonRuntime) {
    const response = await deps.executePythonRuntime(input);
    return mapPythonTransactionFlowRuntimeResponse(response, input);
  }

  const now = deps.now ?? (() => new Date().toISOString());
  const createId = deps.createId ?? (() => randomUUID());
  const riskEntry = getWebAigcNodeRiskEntry("transaction_flow");
  if (!riskEntry) {
    throw new Error("Transaction flow governance metadata is missing.");
  }

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
            : status === "completed"
              ? "approved"
              : "rejected",
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
            ? `Transaction ${transaction.transactionId} is waiting for manual approval.`
            : status === "denied"
              ? `Transaction ${transaction.transactionId} was rejected.`
              : status === "failed"
                ? `Transaction ${transaction.transactionId} failed.`
                : `Transaction ${transaction.transactionId} was approved and executed.`,
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
