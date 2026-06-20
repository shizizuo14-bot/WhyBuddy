import { createHash } from "node:crypto";

import type { AgentTraceEntry } from "../../../../shared/blueprint/agent-state.js";
import type { DelegateInput } from "../../../../shared/blueprint/agent-delegator.js";
import {
  ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
  type RoleRuntimeProxyAction,
  type RoleRuntimeCallbackProxySuccess,
  type RoleRuntimeInvokeProxySuccess,
  type RoleRuntimeProgressProxySuccess,
  type RoleRuntimeProxyFailure,
  type RoleRuntimeProxyResult,
} from "../../../../shared/blueprint/role-container/types.js";

import { sanitizeTraceEntries } from "./trace-sanitizer.js";

const PYTHON_PROXY_BASE_URL = "PYTHON_SLIDE_RULE_BASE_URL";
const PYTHON_PROXY_INTERNAL_KEY = "PYTHON_SLIDE_RULE_INTERNAL_KEY";

type JsonRecord = Record<string, unknown>;

export interface RoleRuntimeInvokeProxyPayload {
  action: "invoke";
  contractVersion: typeof ROLE_RUNTIME_PROXY_CONTRACT_VERSION;
  input: {
    jobId: string;
    roleId: string;
    stageId: string;
    goalDigest: string;
    goalLength: number;
    systemPromptDigest: string;
    systemPromptLength: number;
    contextKeys: string[];
    budget: DelegateInput["budget"];
    outputSchemaProvided: boolean;
  };
  callback: {
    callbackUrlProvided: boolean;
    callbackSecretProvided: boolean;
  };
  nodeControl: {
    registryOwner: "node";
    toolExecutionOwner: "node";
    realAgentExecution: "disabled";
  };
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function resolvePythonRoleRuntimeBaseUrl(): string {
  return (process.env[PYTHON_PROXY_BASE_URL] || "http://localhost:9700").replace(/\/+$/, "");
}

function resolvePythonRoleRuntimeInternalKey(): string {
  return process.env[PYTHON_PROXY_INTERNAL_KEY] || "dev-slide-rule-internal";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAction(value: unknown): value is RoleRuntimeProxyAction {
  return value === "invoke" || value === "progress" || value === "callback";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isTraceEntry(value: unknown): value is AgentTraceEntry {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeNumber(value.iteration) &&
    typeof value.phase === "string" &&
    typeof value.timestamp === "string" &&
    isNonNegativeNumber(value.tokensUsed)
  );
}

function isInvokeSuccess(value: unknown): value is RoleRuntimeInvokeProxySuccess {
  if (!isRecord(value)) return false;
  return (
    value.ok === true &&
    value.action === "invoke" &&
    isRecord(value.runtime) &&
    value.runtime.owner === "python" &&
    value.runtime.mode === "proxy_contract" &&
    value.runtime.agentExecution === "none" &&
    value.runtime.toolsExecuted === false &&
    value.runtime.promptEchoed === false &&
    typeof value.jobId === "string" &&
    typeof value.roleId === "string" &&
    typeof value.stageId === "string" &&
    (value.status === "completed" ||
      value.status === "failed" ||
      value.status === "aborted") &&
    value.executionMode === "lite" &&
    isNonNegativeNumber(value.iterations) &&
    isNonNegativeNumber(value.totalTokens) &&
    isNonNegativeNumber(value.durationMs) &&
    Array.isArray(value.trace) &&
    value.trace.every(isTraceEntry)
  );
}

function isProgressSuccess(
  value: unknown,
): value is RoleRuntimeProgressProxySuccess {
  if (!isRecord(value)) return false;
  return (
    value.ok === true &&
    value.action === "progress" &&
    isRecord(value.event) &&
    typeof value.event.jobId === "string" &&
    typeof value.event.phase === "string" &&
    isNonNegativeNumber(value.event.iteration) &&
    isNonNegativeNumber(value.event.tokensUsed) &&
    typeof value.event.messageProvided === "boolean"
  );
}

function isCallbackSuccess(
  value: unknown,
): value is RoleRuntimeCallbackProxySuccess {
  if (!isRecord(value)) return false;
  return (
    value.ok === true &&
    value.action === "callback" &&
    isRecord(value.callback) &&
    typeof value.callback.jobId === "string" &&
    value.callback.delivery === "declared" &&
    typeof value.callback.callbackUrlProvided === "boolean" &&
    typeof value.callback.callbackSecretProvided === "boolean" &&
    value.callback.secretEchoed === false
  );
}

function isFailure(value: unknown): value is RoleRuntimeProxyFailure {
  if (!isRecord(value)) return false;
  return (
    value.ok === false &&
    isAction(value.action) &&
    (value.error === "runtime_error" ||
      value.error === "schema_invalid" ||
      value.error === "timeout") &&
    typeof value.message === "string"
  );
}

function normalizePythonRoleRuntimeResult(
  action: RoleRuntimeProxyAction,
  value: unknown,
): RoleRuntimeProxyResult {
  if (!isRecord(value)) {
    return schemaInvalidResult(action, "python role-runtime proxy returned a non-object response");
  }
  if (value.contractVersion !== ROLE_RUNTIME_PROXY_CONTRACT_VERSION) {
    return schemaInvalidResult(action, "python role-runtime proxy returned an unknown contract version");
  }
  if (isInvokeSuccess(value)) {
    return {
      ...value,
      trace: sanitizeTraceEntries(value.trace),
    } as RoleRuntimeProxyResult;
  }
  if (isProgressSuccess(value) || isCallbackSuccess(value) || isFailure(value)) {
    return value;
  }
  return schemaInvalidResult(action, "python role-runtime proxy returned invalid shape");
}

function runtimeErrorResult(
  action: RoleRuntimeProxyAction,
  message: string,
): RoleRuntimeProxyResult {
  return {
    ok: false,
    action,
    contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
    error: /abort|timeout/i.test(message) ? "timeout" : "runtime_error",
    message,
    retryable: true,
  };
}

function schemaInvalidResult(
  action: RoleRuntimeProxyAction,
  message: string,
): RoleRuntimeProxyResult {
  return {
    ok: false,
    action,
    contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
    error: "schema_invalid",
    message,
  };
}

export function buildRoleRuntimeInvokeProxyPayload(
  input: DelegateInput,
  callback?: { callbackUrl?: string; callbackSecret?: string },
): RoleRuntimeInvokeProxyPayload {
  return {
    action: "invoke",
    contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
    input: {
      jobId: input.jobId,
      roleId: input.roleId,
      stageId: input.stageId,
      goalDigest: digest(input.goal),
      goalLength: input.goal.length,
      systemPromptDigest: digest(input.systemPrompt),
      systemPromptLength: input.systemPrompt.length,
      contextKeys: Object.keys(input.context).sort(),
      budget: input.budget,
      outputSchemaProvided: input.outputSchema !== undefined,
    },
    callback: {
      callbackUrlProvided: typeof callback?.callbackUrl === "string" && callback.callbackUrl.length > 0,
      callbackSecretProvided:
        typeof callback?.callbackSecret === "string" && callback.callbackSecret.length > 0,
    },
    nodeControl: {
      registryOwner: "node",
      toolExecutionOwner: "node",
      realAgentExecution: "disabled",
    },
  };
}

export async function callPythonRoleRuntimeProxy(
  action: RoleRuntimeProxyAction,
  payload: JsonRecord | RoleRuntimeInvokeProxyPayload,
): Promise<RoleRuntimeProxyResult> {
  try {
    const response = await fetch(
      `${resolvePythonRoleRuntimeBaseUrl()}/api/blueprint/role-runtime/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": resolvePythonRoleRuntimeInternalKey(),
        },
        body: JSON.stringify({
          ...payload,
          action,
          contractVersion: ROLE_RUNTIME_PROXY_CONTRACT_VERSION,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`python role-runtime proxy failed: ${response.status}`);
    }
    const result = await response.json();
    return normalizePythonRoleRuntimeResult(action, result);
  } catch (error) {
    return runtimeErrorResult(action, errorMessage(error));
  }
}
