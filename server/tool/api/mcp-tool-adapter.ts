import type {
  Action,
  GovernanceDecision,
  PermissionCheckResult,
  ResourceType,
} from "../../../shared/permission/contracts.js";
import type { AuditLogger as PermissionAuditLogger } from "../../permission/check-engine.js";
import {
  buildMcpResource,
  parseMcpResource,
} from "../../permission/checkers/mcp-checker.js";

export interface McpToolExecutionRequest {
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  input: string;
  context?: string[];
  workflowId?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
  agentId?: string;
  token?: string;
  timeoutMs?: number;
  requireApproval?: boolean;
  approverList?: string[];
}

export interface McpToolExecutionResult {
  ok: boolean;
  status: "completed" | "denied" | "approval_required" | "failed";
  targetLabel: string;
  operation: string;
  resource: string;
  output: string;
  response: unknown;
  error?: string;
  escalationId?: string;
  governance: {
    permission?: {
      allowed: boolean;
      reason?: string;
      suggestion?: string;
    };
    decision?: GovernanceDecision;
    approval: {
      required: boolean;
      status: "not_required" | "pending";
      source: "none" | "manual_gate" | "governance_policy";
      escalationId?: string;
    };
  };
  metadata: {
    serverId: string;
    toolName: string;
    workflowId?: string;
    stage?: string;
    timeoutMs: number;
    fallbackUsed: boolean;
  };
}

export interface McpToolInvokeRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  input: string;
  context: string[];
  agentId?: string;
  workflowId?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
  resource: string;
}

export interface McpToolInvoker {
  invoke(request: McpToolInvokeRequest): Promise<unknown>;
}

export interface McpToolPermissionEngine {
  checkPermission(
    agentId: string,
    resourceType: ResourceType,
    action: Action,
    resource: string,
    token: string,
  ): PermissionCheckResult;
}

export interface McpToolEscalationManager {
  escalatePermission(
    agentId: string,
    reason: string,
    approverList: string[],
  ): string;
}

export interface McpToolAdapterDeps {
  invoker: McpToolInvoker;
  permissionEngine?: McpToolPermissionEngine;
  auditLogger?: PermissionAuditLogger;
  escalationManager?: McpToolEscalationManager;
  defaultTimeoutMs?: number;
}

interface NormalizedMcpToolRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  input: string;
  context: string[];
  workflowId?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
  agentId?: string;
  token?: string;
  timeoutMs: number;
  requireApproval: boolean;
  approverList: string[];
  targetLabel: string;
  resource: string;
}

interface McpFallbackConfig {
  mode: "empty_result" | "static_response";
  targetLabel?: string;
  operation?: string;
  output?: string;
  response?: unknown;
  recoverableErrors?: string[];
}

interface McpToolAccessContext {
  agentId: string;
  permission?: PermissionCheckResult;
  approvalSource: "none" | "manual_gate" | "governance_policy";
}

const MCP_TOOL_RESOURCE_TYPE: ResourceType = "mcp_tool";
const MCP_TOOL_ACTION: Action = "call";
const DEFAULT_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureText(value: string | undefined, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${field}`);
  }

  return value.trim();
}

function normalizeContext(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeTimeoutMs(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(120_000, Math.floor(value)));
}

function normalizeApproverList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeArgumentValue(value: unknown): string | number | boolean | null | undefined {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(value);
}

function normalizeArguments(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return { ...value };
}

function buildResourceArguments(argumentsRecord: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(argumentsRecord).map(([key, value]) => [
      key,
      normalizeArgumentValue(value),
    ]),
  );
}

function summarizeInput(input: string): string {
  const normalized = input.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  return normalized.length > 160
    ? `${normalized.slice(0, 160).trimEnd()}...`
    : normalized;
}

function serializeOutput(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (isRecord(payload) && typeof payload.output === "string") {
    return payload.output;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function buildPermissionSummary(
  permission: PermissionCheckResult | undefined,
): McpToolExecutionResult["governance"]["permission"] | undefined {
  if (!permission) {
    return undefined;
  }

  return {
    allowed: permission.allowed,
    reason: permission.reason,
    suggestion: permission.suggestion,
  };
}

function resolveGovernanceOutcome(
  permission: PermissionCheckResult | undefined,
): "approval_required" | "blocked" | undefined {
  const outcome = permission?.governance?.outcome;
  if (outcome === "approval_required" || outcome === "blocked") {
    return outcome;
  }

  return undefined;
}

function readFallbackConfig(
  metadata: Record<string, unknown> | undefined,
): McpFallbackConfig | null {
  if (!metadata) {
    return null;
  }

  const rawFallback =
    (isRecord(metadata.fallback) && metadata.fallback) ||
    (isRecord(metadata.errorFallback) && metadata.errorFallback);

  if (!rawFallback) {
    return null;
  }

  const mode =
    typeof rawFallback.mode === "string" && rawFallback.mode === "static_response"
      ? "static_response"
      : "empty_result";
  const recoverableErrors = Array.isArray(rawFallback.recoverableErrors)
    ? rawFallback.recoverableErrors.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : undefined;

  return {
    mode,
    targetLabel:
      typeof rawFallback.targetLabel === "string" && rawFallback.targetLabel.trim()
        ? rawFallback.targetLabel.trim()
        : undefined,
    operation:
      typeof rawFallback.operation === "string" && rawFallback.operation.trim()
        ? rawFallback.operation.trim()
        : undefined,
    output:
      typeof rawFallback.output === "string" && rawFallback.output.trim()
        ? rawFallback.output
        : undefined,
    response: rawFallback.response,
    recoverableErrors: recoverableErrors?.length ? recoverableErrors : undefined,
  };
}

function matchesRecoverableError(
  reason: string,
  fallback: McpFallbackConfig,
): boolean {
  if (!fallback.recoverableErrors || fallback.recoverableErrors.length === 0) {
    return true;
  }

  return fallback.recoverableErrors.some((keyword) => reason.includes(keyword));
}

function buildFallbackResponse(
  request: NormalizedMcpToolRequest,
  fallback: McpFallbackConfig,
  reason: string,
): unknown {
  const common = {
    ok: false,
    fallbackUsed: true,
    fallbackStrategy: fallback.mode,
    serverId: request.serverId,
    toolName: request.toolName,
    workflowId: request.workflowId ?? null,
    error: reason,
  };

  if (fallback.mode === "static_response") {
    if (isRecord(fallback.response)) {
      return {
        ...fallback.response,
        ...common,
      };
    }

    return {
      ...common,
      data: fallback.response ?? null,
    };
  }

  return {
    ...common,
    data: [],
  };
}

function normalizeRequest(
  request: McpToolExecutionRequest,
  defaultTimeoutMs: number,
): NormalizedMcpToolRequest {
  const serverId = ensureText(request.serverId, "serverId");
  const toolName = ensureText(request.toolName, "toolName");
  const input = ensureText(request.input, "input");
  const argumentsRecord = normalizeArguments(request.arguments);
  const resource = buildMcpResource({
    serverId,
    toolName,
    parameters: buildResourceArguments(argumentsRecord),
  });

  // Ensure the generated resource remains parseable by the MCP checker contract.
  parseMcpResource(resource);

  return {
    serverId,
    toolName,
    arguments: argumentsRecord,
    input,
    context: normalizeContext(request.context),
    workflowId: typeof request.workflowId === "string" && request.workflowId.trim()
      ? request.workflowId.trim()
      : undefined,
    stage: typeof request.stage === "string" && request.stage.trim()
      ? request.stage.trim()
      : undefined,
    metadata: isRecord(request.metadata) ? request.metadata : undefined,
    agentId: typeof request.agentId === "string" && request.agentId.trim()
      ? request.agentId.trim()
      : undefined,
    token: typeof request.token === "string" && request.token.trim()
      ? request.token.trim()
      : undefined,
    timeoutMs: normalizeTimeoutMs(request.timeoutMs, defaultTimeoutMs),
    requireApproval: request.requireApproval === true,
    approverList: normalizeApproverList(request.approverList),
    targetLabel: `${serverId}/${toolName}`,
    resource,
  };
}

class McpToolTimeoutError extends Error {
  constructor(
    serverId: string,
    toolName: string,
    timeoutMs: number,
  ) {
    super(`MCP tool call timed out after ${timeoutMs}ms for ${serverId}/${toolName}`);
    this.name = "McpToolTimeoutError";
  }
}

export class McpToolAdapter {
  private readonly invoker: McpToolInvoker;
  private readonly permissionEngine?: McpToolPermissionEngine;
  private readonly auditLogger?: PermissionAuditLogger;
  private readonly escalationManager?: McpToolEscalationManager;
  private readonly defaultTimeoutMs: number;

  constructor(deps: McpToolAdapterDeps) {
    this.invoker = deps.invoker;
    this.permissionEngine = deps.permissionEngine;
    this.auditLogger = deps.auditLogger;
    this.escalationManager = deps.escalationManager;
    this.defaultTimeoutMs = normalizeTimeoutMs(
      deps.defaultTimeoutMs,
      DEFAULT_TIMEOUT_MS,
    );
  }

  async execute(request: McpToolExecutionRequest): Promise<McpToolExecutionResult> {
    const normalized = normalizeRequest(request, this.defaultTimeoutMs);
    const access = this.enforceAccessControl(normalized);
    const permission = access.permission;
    const governanceOutcome = resolveGovernanceOutcome(permission);

    if (governanceOutcome === "approval_required") {
      return this.buildApprovalRequiredResult(
        normalized,
        access,
        permission?.reason ?? "MCP tool call requires manual approval",
        "governance_policy",
      );
    }

    if (governanceOutcome === "blocked") {
      return this.buildDeniedResult(
        normalized,
        access,
        access.permission?.reason ?? "Permission denied",
      );
    }

    if (access.permission && access.permission.allowed === false) {
      return this.buildDeniedResult(
        normalized,
        access,
        access.permission.reason ?? "Permission denied",
      );
    }

    if (normalized.requireApproval) {
      return this.buildApprovalRequiredResult(
        normalized,
        access,
        "MCP tool call requires manual approval",
        "manual_gate",
      );
    }

    try {
      const response = await this.invokeWithTimeout(normalized);
      const result: McpToolExecutionResult = {
        ok: true,
        status: "completed",
        targetLabel: normalized.targetLabel,
        operation: "mcp_tool",
        resource: normalized.resource,
        output: serializeOutput(response),
        response,
        governance: {
          permission: buildPermissionSummary(access.permission),
          decision: access.permission?.governance,
          approval: {
            required: false,
            status: "not_required",
            source: "none",
          },
        },
        metadata: {
          serverId: normalized.serverId,
          toolName: normalized.toolName,
          workflowId: normalized.workflowId,
          stage: normalized.stage,
          timeoutMs: normalized.timeoutMs,
          fallbackUsed: false,
        },
      };
      this.auditExecution(normalized, access, "allowed", undefined, {
        timeoutMs: normalized.timeoutMs,
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const fallback = readFallbackConfig(normalized.metadata);
      if (fallback && matchesRecoverableError(reason, fallback)) {
        const response = buildFallbackResponse(normalized, fallback, reason);
        const result: McpToolExecutionResult = {
          ok: true,
          status: "completed",
          targetLabel: fallback.targetLabel ?? normalized.targetLabel,
          operation: fallback.operation ?? "mcp_tool",
          resource: normalized.resource,
          output: fallback.output ?? serializeOutput(response),
          response,
          governance: {
            permission: buildPermissionSummary(access.permission),
            decision: access.permission?.governance,
            approval: {
              required: false,
              status: "not_required",
              source: "none",
            },
          },
          metadata: {
            serverId: normalized.serverId,
            toolName: normalized.toolName,
            workflowId: normalized.workflowId,
            stage: normalized.stage,
            timeoutMs: normalized.timeoutMs,
            fallbackUsed: true,
          },
        };
        this.auditExecution(normalized, access, "allowed", undefined, {
          timeoutMs: normalized.timeoutMs,
          fallbackUsed: true,
          fallbackStrategy: fallback.mode,
          fallbackReason: reason,
        });
        return result;
      }

      this.auditExecution(normalized, access, "error", reason, {
        timeoutMs: normalized.timeoutMs,
      });
      return {
        ok: false,
        status: "failed",
        targetLabel: normalized.targetLabel,
        operation: "mcp_tool",
        resource: normalized.resource,
        output: reason,
        response: null,
        error: reason,
        governance: {
          permission: buildPermissionSummary(access.permission),
          decision: access.permission?.governance,
          approval: {
            required: false,
            status: "not_required",
            source: "none",
          },
        },
        metadata: {
          serverId: normalized.serverId,
          toolName: normalized.toolName,
          workflowId: normalized.workflowId,
          stage: normalized.stage,
          timeoutMs: normalized.timeoutMs,
          fallbackUsed: false,
        },
      };
    }
  }

  private enforceAccessControl(
    request: NormalizedMcpToolRequest,
  ): McpToolAccessContext {
    const access: McpToolAccessContext = {
      agentId: request.agentId ?? "mcp_tool_executor",
      approvalSource: "none",
    };

    if (!this.permissionEngine) {
      return access;
    }

    const agentId = ensureText(request.agentId, "agentId");
    const token = ensureText(request.token, "token");
    const permission = this.permissionEngine.checkPermission(
      agentId,
      MCP_TOOL_RESOURCE_TYPE,
      MCP_TOOL_ACTION,
      request.resource,
      token,
    );

    access.agentId = agentId;
    access.permission = permission;
    access.approvalSource =
      permission.governance?.outcome === "approval_required"
        ? "governance_policy"
        : "none";
    return access;
  }

  private async invokeWithTimeout(
    request: NormalizedMcpToolRequest,
  ): Promise<unknown> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.invoker.invoke({
          serverId: request.serverId,
          toolName: request.toolName,
          arguments: request.arguments,
          input: request.input,
          context: request.context,
          agentId: request.agentId,
          workflowId: request.workflowId,
          stage: request.stage,
          metadata: request.metadata,
          resource: request.resource,
        }),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new McpToolTimeoutError(
                request.serverId,
                request.toolName,
                request.timeoutMs,
              ),
            );
          }, request.timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private buildDeniedResult(
    request: NormalizedMcpToolRequest,
    access: McpToolAccessContext,
    reason: string,
  ): McpToolExecutionResult {
    this.auditExecution(request, access, "denied", reason, {
      governanceHook: "permission-engine",
    });
    return {
      ok: false,
      status: "denied",
      targetLabel: request.targetLabel,
      operation: "mcp_tool",
      resource: request.resource,
      output: reason,
      response: null,
      error: reason,
      governance: {
        permission: buildPermissionSummary(access.permission),
        decision: access.permission?.governance,
        approval: {
          required: false,
          status: "not_required",
          source: "none",
        },
      },
      metadata: {
        serverId: request.serverId,
        toolName: request.toolName,
        workflowId: request.workflowId,
        stage: request.stage,
        timeoutMs: request.timeoutMs,
        fallbackUsed: false,
      },
    };
  }

  private buildApprovalRequiredResult(
    request: NormalizedMcpToolRequest,
    access: McpToolAccessContext,
    reason: string,
    source: "manual_gate" | "governance_policy",
  ): McpToolExecutionResult {
    let escalationId: string | undefined;
    if (
      this.escalationManager &&
      request.approverList.length > 0 &&
      request.agentId
    ) {
      escalationId = this.escalationManager.escalatePermission(
        request.agentId,
        reason,
        request.approverList,
      );
    }

    this.auditExecution(request, access, "denied", reason, {
      governanceHook: source === "manual_gate" ? "manual-gate" : "permission-engine",
      approvalRequired: true,
      escalationId,
    });

    return {
      ok: false,
      status: "approval_required",
      targetLabel: request.targetLabel,
      operation: "mcp_tool",
      resource: request.resource,
      output: reason,
      response: null,
      error: reason,
      escalationId,
      governance: {
        permission: buildPermissionSummary(access.permission),
        decision: access.permission?.governance,
        approval: {
          required: true,
          status: "pending",
          source,
          escalationId,
        },
      },
      metadata: {
        serverId: request.serverId,
        toolName: request.toolName,
        workflowId: request.workflowId,
        stage: request.stage,
        timeoutMs: request.timeoutMs,
        fallbackUsed: false,
      },
    };
  }

  private auditExecution(
    request: NormalizedMcpToolRequest,
    access: McpToolAccessContext,
    result: "allowed" | "denied" | "error",
    reason?: string,
    metadata: Record<string, unknown> = {},
  ): void {
    if (!this.auditLogger) {
      return;
    }

    this.auditLogger.log({
      agentId: access.agentId,
      operation: "mcp_tool",
      resourceType: MCP_TOOL_RESOURCE_TYPE,
      action: MCP_TOOL_ACTION,
      resource: request.resource,
      result,
      reason,
      governance: access.permission?.governance,
      metadata: {
        serverId: request.serverId,
        toolName: request.toolName,
        workflowId: request.workflowId,
        stage: request.stage,
        timeoutMs: request.timeoutMs,
        approverCount: request.approverList.length,
        requireApproval: request.requireApproval,
        inputPreview: summarizeInput(request.input),
        contextCount: request.context.length,
        approvalSource: access.approvalSource,
        ...metadata,
      },
    });
  }
}
