import type {
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../shared/blueprint/contracts.js";
import {
  previewIntakePatchContract,
  type BlueprintStageEditPreviewContractResult,
} from "./stage-edit/intake-patch-preview-contract.js";
import { validateIntakePatch } from "./stage-edit/intake-patch-validator.js";

export const BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION =
  "blueprint.stage-edit.runtime.v1" as const;

export type BlueprintStageEditRuntimeOperation = "validate" | "preview" | "apply";
export type BlueprintStageEditRuntimeOwner = "python" | "node";
export type BlueprintStageEditRuntimeMode = "runtime_bridge" | "local_fallback";

export interface BlueprintStageEditRuntimeInput {
  selectedStage: BlueprintGenerationStage;
  selectedStageState?: {
    stage?: BlueprintGenerationStage;
    stale?: boolean;
    staleSince?: string;
  };
  intakeId: string;
  intake: Parameters<typeof previewIntakePatchContract>[0]["intake"];
  patch: unknown;
  jobs: BlueprintGenerationJob[];
  now?: () => string;
}

export interface BlueprintStageEditRuntimeBoundary {
  owner: BlueprintStageEditRuntimeOwner;
  mode: BlueprintStageEditRuntimeMode;
  selectedStage: BlueprintGenerationStage;
  stateAuthority: "node";
  persistenceOwner: "node";
  invalidationOwner: "node";
  jobStoreOwner: "node";
  stateMutation: "none";
}

export type BlueprintStageEditRuntimeValidation =
  | {
      accepted: true;
      patch: Record<string, unknown>;
    }
  | {
      accepted: false;
      error: "invalid_intake_patch" | "validation_error";
      message: string;
    };

export interface BlueprintStageEditRuntimeApplyEnvelope {
  accepted: false;
  reason: "node_state_owner";
  message: string;
  requestedPatch?: Record<string, unknown>;
}

export type BlueprintStageEditRuntimeDecision =
  | BlueprintStageEditPreviewContractResult
  | {
      contractVersion: "blueprint.stage-edit.proxy.v1";
      kind: "blueprint.stage_edit.preview";
      preview: {
        stateAuthority: "node";
        persistenceOwner: "node";
        stateMutation: "none";
        appliesMutation: false;
      };
      ok: false;
      outcome: "stale";
      status: 409;
      error: "selected_stage_stale";
      message: string;
      selectedStage: BlueprintGenerationStage;
      staleSince?: string;
    };

export interface BlueprintStageEditRuntimeSuccess {
  ok: true;
  operation: BlueprintStageEditRuntimeOperation;
  contractVersion: typeof BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION;
  runtime: BlueprintStageEditRuntimeBoundary;
  validation?: BlueprintStageEditRuntimeValidation;
  decision?: BlueprintStageEditRuntimeDecision;
  apply: BlueprintStageEditRuntimeApplyEnvelope;
  statusCode?: 200;
  provenance:
    | "python-blueprint-stage-edit-runtime"
    | "node-blueprint-stage-edit-python-runtime";
}

export interface BlueprintStageEditRuntimeError {
  ok: false;
  operation: BlueprintStageEditRuntimeOperation | "unknown";
  contractVersion: typeof BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION;
  runtime?: BlueprintStageEditRuntimeBoundary;
  validation?: BlueprintStageEditRuntimeValidation;
  decision?: BlueprintStageEditRuntimeDecision;
  apply: BlueprintStageEditRuntimeApplyEnvelope;
  error:
    | "invalid_operation"
    | "unsupported_stage"
    | "invalid_intake_patch"
    | "downstream_running"
    | "selected_stage_stale"
    | "boundary_violation"
    | "runtime_unavailable"
    | "invalid_runtime_response";
  reason: string;
  message: string;
  statusCode: number;
  retryable?: boolean;
  provenance:
    | "python-blueprint-stage-edit-runtime"
    | "node-blueprint-stage-edit-python-runtime";
}

export type BlueprintStageEditRuntimeResult =
  | BlueprintStageEditRuntimeSuccess
  | BlueprintStageEditRuntimeError;

const PYTHON_RUNTIME_ENABLED = "BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME";
const PYTHON_RUNTIME_BASE_URL = "PYTHON_SLIDE_RULE_BASE_URL";
const PYTHON_RUNTIME_INTERNAL_KEY = "PYTHON_SLIDE_RULE_INTERNAL_KEY";
const APPLY_NODE_OWNER_MESSAGE =
  "Blueprint stage edits are evaluated by Python but applied by Node.";
const NODE_CONTROL = {
  stateAuthority: "node",
  persistenceOwner: "node",
  invalidationOwner: "node",
  jobStoreOwner: "node",
} as const;

export async function validateBlueprintStageEditWithPythonRuntime(
  input: BlueprintStageEditRuntimeInput,
): Promise<BlueprintStageEditRuntimeResult> {
  return executeBlueprintStageEditRuntime("validate", input);
}

export async function previewBlueprintStageEditWithPythonRuntime(
  input: BlueprintStageEditRuntimeInput,
): Promise<BlueprintStageEditRuntimeResult> {
  return executeBlueprintStageEditRuntime("preview", input);
}

export async function applyBlueprintStageEditWithPythonRuntime(
  input: BlueprintStageEditRuntimeInput,
): Promise<BlueprintStageEditRuntimeResult> {
  return executeBlueprintStageEditRuntime("apply", input);
}

async function executeBlueprintStageEditRuntime(
  operation: BlueprintStageEditRuntimeOperation,
  input: BlueprintStageEditRuntimeInput,
): Promise<BlueprintStageEditRuntimeResult> {
  const now = input.now?.() ?? new Date().toISOString();

  if (!isPythonRuntimeEnabled()) {
    return localRuntimeResult(operation, input, now);
  }

  try {
    const response = await fetch(
      `${resolvePythonRuntimeBaseUrl()}/api/blueprint/stage-edit/runtime/${operation}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": resolvePythonRuntimeInternalKey(),
        },
        body: JSON.stringify({
          operation,
          selectedStage: input.selectedStage,
          selectedStageState: input.selectedStageState,
          intakeId: input.intakeId,
          intake: input.intake,
          patch: input.patch,
          jobs: input.jobs.map(snapshotJobForPython),
          now,
          nodeControl: NODE_CONTROL,
        }),
      },
    );
    const payload = await response.json().catch(async () => {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        operation,
        contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
        error: "invalid_runtime_response",
        reason: "non_json_python_response",
        message:
          text.slice(0, 200) ||
          "Python Blueprint stage edit runtime returned non-JSON response.",
        statusCode: response.status || 502,
        apply: applyEnvelope(),
        provenance: "node-blueprint-stage-edit-python-runtime",
      };
    });

    if (isBlueprintStageEditRuntimeResult(payload, operation)) {
      return payload;
    }

    return runtimeUnavailableResult(
      operation,
      "Python Blueprint stage edit runtime returned invalid shape.",
      "invalid_runtime_response",
      "invalid_python_runtime_shape",
    );
  } catch (error) {
    return runtimeUnavailableResult(
      operation,
      errorMessage(error),
      "runtime_unavailable",
      "python_runtime_failed",
    );
  }
}

function localRuntimeResult(
  operation: BlueprintStageEditRuntimeOperation,
  input: BlueprintStageEditRuntimeInput,
  now: string,
): BlueprintStageEditRuntimeResult {
  const boundary = runtimeBoundary("node", "local_fallback", input.selectedStage);
  if (input.selectedStage !== "input") {
    return runtimeError(
      operation,
      boundary,
      "unsupported_stage",
      "unsupported_selected_stage",
      "Blueprint stage edit runtime currently supports only the input stage.",
      400,
    );
  }

  const parsed = validateIntakePatch(input.patch);
  const validation = validationEnvelope(parsed);
  if (operation === "validate") {
    if (!parsed.ok) {
      return {
        ...runtimeError(
          operation,
          boundary,
          parsed.error,
          "invalid_stage_edit_patch",
          parsed.message,
          400,
        ),
        validation,
      };
    }

    return {
      ok: true,
      operation,
      contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
      runtime: boundary,
      validation,
      apply: applyEnvelope(),
      provenance: "node-blueprint-stage-edit-python-runtime",
    };
  }

  const staleDecision = selectedStageStaleDecision(input.selectedStageState);
  if (staleDecision) {
    return {
      ok: false,
      operation,
      contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
      runtime: boundary,
      validation,
      decision: staleDecision,
      apply: applyEnvelope(),
      error: "selected_stage_stale",
      reason: "selected_stage_stale",
      message:
        "Selected Blueprint stage is stale and must be refreshed by Node before editing.",
      statusCode: 409,
      provenance: "node-blueprint-stage-edit-python-runtime",
    };
  }

  const decision = previewIntakePatchContract({
    intake: input.intake,
    patchBody: input.patch,
    jobs: input.jobs,
    now,
  });

  const resultBase = {
    operation,
    contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
    runtime: boundary,
    validation,
    decision,
    apply: applyEnvelope(operation === "apply" && parsed.ok ? input.patch : undefined),
    statusCode: decision.status,
    provenance: "node-blueprint-stage-edit-python-runtime" as const,
  };

  if (decision.ok) {
    return {
      ok: true,
      ...resultBase,
      statusCode: 200,
    };
  }

  return {
    ok: false,
    ...resultBase,
    ...decisionError(decision),
  };
}

function runtimeBoundary(
  owner: BlueprintStageEditRuntimeOwner,
  mode: BlueprintStageEditRuntimeMode,
  selectedStage: BlueprintGenerationStage,
): BlueprintStageEditRuntimeBoundary {
  return {
    owner,
    mode,
    selectedStage,
    stateAuthority: "node",
    persistenceOwner: "node",
    invalidationOwner: "node",
    jobStoreOwner: "node",
    stateMutation: "none",
  };
}

function validationEnvelope(
  parsed: ReturnType<typeof validateIntakePatch>,
): BlueprintStageEditRuntimeValidation {
  if (parsed.ok) {
    return {
      accepted: true,
      patch: cloneRecord(asPlainRecord(parsed.value)),
    };
  }

  return {
    accepted: false,
    error: parsed.error,
    message: parsed.message,
  };
}

function applyEnvelope(
  patch?: unknown,
): BlueprintStageEditRuntimeApplyEnvelope {
  const envelope: BlueprintStageEditRuntimeApplyEnvelope = {
    accepted: false,
    reason: "node_state_owner",
    message: APPLY_NODE_OWNER_MESSAGE,
  };
  if (isRecord(patch)) {
    envelope.requestedPatch = cloneRecord(patch);
  }
  return envelope;
}

function selectedStageStaleDecision(
  selectedStageState: BlueprintStageEditRuntimeInput["selectedStageState"],
): BlueprintStageEditRuntimeDecision | null {
  if (!selectedStageState?.stale) return null;
  return {
    contractVersion: "blueprint.stage-edit.proxy.v1",
    kind: "blueprint.stage_edit.preview",
    preview: {
      stateAuthority: "node",
      persistenceOwner: "node",
      stateMutation: "none",
      appliesMutation: false,
    },
    ok: false,
    outcome: "stale",
    status: 409,
    error: "selected_stage_stale",
    message:
      "Selected Blueprint stage is stale and must be refreshed by Node before editing.",
    selectedStage: selectedStageState.stage ?? "input",
    ...(selectedStageState.staleSince
      ? { staleSince: selectedStageState.staleSince }
      : {}),
  };
}

function decisionError(decision: BlueprintStageEditPreviewContractResult): Pick<
  BlueprintStageEditRuntimeError,
  "error" | "reason" | "message"
> {
  if (decision.outcome === "rejected") {
    return {
      error: decision.error ?? "invalid_intake_patch",
      reason: "invalid_stage_edit_patch",
      message: decision.message ?? "Blueprint stage edit patch is invalid.",
    };
  }

  if (decision.outcome === "conflict") {
    return {
      error: decision.error ?? "downstream_running",
      reason: "stage_edit_conflict",
      message: "A downstream Blueprint stage is still running.",
    };
  }

  return {
    error: "invalid_runtime_response",
    reason: "stage_edit_runtime_error",
    message: "Blueprint stage edit runtime returned a non-success decision.",
  };
}

function runtimeError(
  operation: BlueprintStageEditRuntimeOperation | "unknown",
  runtime: BlueprintStageEditRuntimeBoundary | undefined,
  error: BlueprintStageEditRuntimeError["error"],
  reason: string,
  message: string,
  statusCode: number,
): BlueprintStageEditRuntimeError {
  return {
    ok: false,
    operation,
    contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
    ...(runtime ? { runtime } : {}),
    error,
    reason,
    message,
    statusCode,
    apply: applyEnvelope(),
    provenance: "node-blueprint-stage-edit-python-runtime",
  };
}

function runtimeUnavailableResult(
  operation: BlueprintStageEditRuntimeOperation,
  message: string,
  error: "runtime_unavailable" | "invalid_runtime_response",
  reason: string,
): BlueprintStageEditRuntimeError {
  return {
    ok: false,
    operation,
    contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
    error,
    reason,
    message,
    statusCode: error === "runtime_unavailable" ? 503 : 502,
    apply: applyEnvelope(),
    retryable: true,
    provenance: "node-blueprint-stage-edit-python-runtime",
  };
}

function snapshotJobForPython(job: BlueprintGenerationJob): Partial<BlueprintGenerationJob> {
  return {
    id: job.id,
    request: job.request,
    status: job.status,
    stage: job.stage,
    projectId: job.projectId,
    sourceId: job.sourceId,
    version: job.version,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    artifacts: job.artifacts,
    handoffState: job.handoffState,
    error: job.error,
    staleArtifactIds: job.staleArtifactIds,
  };
}

function isBlueprintStageEditRuntimeResult(
  value: unknown,
  expectedOperation: BlueprintStageEditRuntimeOperation,
): value is BlueprintStageEditRuntimeResult {
  const record = asRecord(value);
  if (!record) return false;
  if (record.contractVersion !== BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION) return false;
  if (record.operation !== expectedOperation && record.operation !== "unknown") return false;
  if (
    record.provenance !== "python-blueprint-stage-edit-runtime" &&
    record.provenance !== "node-blueprint-stage-edit-python-runtime"
  ) {
    return false;
  }
  if (!isApplyEnvelope(record.apply)) return false;

  const decision = record.decision;
  if (decision !== undefined && !isRuntimeDecision(decision)) return false;
  if (record.validation !== undefined && !isValidationEnvelope(record.validation)) {
    return false;
  }

  if (record.ok === true) {
    return (
      isRuntimeOperation(record.operation) &&
      isRuntimeBoundary(record.runtime) &&
      successDecisionIsActuallySuccess(decision) &&
      record.error === undefined &&
      record.statusCode !== 409 &&
      record.statusCode !== 400
    );
  }

  return (
    record.ok === false &&
    (record.runtime === undefined || isRuntimeBoundary(record.runtime)) &&
    isRuntimeErrorCode(record.error) &&
    isNonEmptyString(record.reason) &&
    isNonEmptyString(record.message) &&
    typeof record.statusCode === "number" &&
    (record.retryable === undefined || typeof record.retryable === "boolean")
  );
}

function successDecisionIsActuallySuccess(decision: unknown): boolean {
  if (decision === undefined) return true;
  const record = asRecord(decision);
  return Boolean(
    record &&
      record.ok === true &&
      (record.outcome === "accepted" || record.outcome === "noop") &&
      record.status === 200,
  );
}

function isRuntimeBoundary(value: unknown): value is BlueprintStageEditRuntimeBoundary {
  const record = asRecord(value);
  return Boolean(
    record &&
      (record.owner === "python" || record.owner === "node") &&
      (record.mode === "runtime_bridge" || record.mode === "local_fallback") &&
      record.selectedStage === "input" &&
      record.stateAuthority === "node" &&
      record.persistenceOwner === "node" &&
      record.invalidationOwner === "node" &&
      record.jobStoreOwner === "node" &&
      record.stateMutation === "none",
  );
}

function isRuntimeDecision(value: unknown): value is BlueprintStageEditRuntimeDecision {
  const record = asRecord(value);
  if (!record) return false;
  if (record.contractVersion !== "blueprint.stage-edit.proxy.v1") return false;
  if (record.kind !== "blueprint.stage_edit.preview") return false;
  if (!isPreviewBoundary(record.preview)) return false;
  if (record.ok === true) {
    return (
      (record.outcome === "accepted" || record.outcome === "noop") &&
      record.status === 200
    );
  }
  return (
    record.ok === false &&
    (record.outcome === "rejected" ||
      record.outcome === "conflict" ||
      record.outcome === "stale") &&
    (record.status === 400 || record.status === 409) &&
    isNonEmptyString(record.error)
  );
}

function isPreviewBoundary(value: unknown): boolean {
  const record = asRecord(value);
  return Boolean(
    record &&
      record.stateAuthority === "node" &&
      record.persistenceOwner === "node" &&
      record.stateMutation === "none" &&
      record.appliesMutation === false,
  );
}

function isValidationEnvelope(value: unknown): value is BlueprintStageEditRuntimeValidation {
  const record = asRecord(value);
  if (!record) return false;
  if (record.accepted === true) return isRecord(record.patch);
  return (
    record.accepted === false &&
    (record.error === "invalid_intake_patch" || record.error === "validation_error") &&
    isNonEmptyString(record.message)
  );
}

function isApplyEnvelope(value: unknown): value is BlueprintStageEditRuntimeApplyEnvelope {
  const record = asRecord(value);
  return Boolean(
    record &&
      record.accepted === false &&
      record.reason === "node_state_owner" &&
      isNonEmptyString(record.message) &&
      (record.requestedPatch === undefined || isRecord(record.requestedPatch)),
  );
}

function isRuntimeOperation(value: unknown): value is BlueprintStageEditRuntimeOperation {
  return value === "validate" || value === "preview" || value === "apply";
}

function isRuntimeErrorCode(
  value: unknown,
): value is BlueprintStageEditRuntimeError["error"] {
  return (
    value === "invalid_operation" ||
    value === "unsupported_stage" ||
    value === "invalid_intake_patch" ||
    value === "downstream_running" ||
    value === "selected_stage_stale" ||
    value === "boundary_violation" ||
    value === "runtime_unavailable" ||
    value === "invalid_runtime_response"
  );
}

function isPythonRuntimeEnabled(): boolean {
  return process.env[PYTHON_RUNTIME_ENABLED] === "true";
}

function resolvePythonRuntimeBaseUrl(): string {
  return (process.env[PYTHON_RUNTIME_BASE_URL] || "http://localhost:9700").replace(/\/+$/, "");
}

function resolvePythonRuntimeInternalKey(): string {
  return process.env[PYTHON_RUNTIME_INTERNAL_KEY] || "dev-slide-rule-internal";
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

function asPlainRecord(value: object): Record<string, unknown> {
  return { ...value };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return asRecord(value) !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
