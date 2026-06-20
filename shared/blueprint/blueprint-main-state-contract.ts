import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationArtifactType,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
  BlueprintGenerationStatus,
  BlueprintStaleReason,
  BlueprintStaleSource,
} from "./contracts.js";

export const BLUEPRINT_MAIN_STATE_PYTHON_CONTRACT_VERSION =
  "blueprint.main.state.v1" as const;

export type BlueprintMainStatePythonStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "stale";

export type BlueprintMainStatePythonNodeStatus = BlueprintGenerationStatus;

export interface BlueprintMainStatePythonError {
  code: string;
  message: string;
  stage: BlueprintGenerationStage;
  retryable?: boolean;
}

export interface BlueprintMainStatePythonArtifact {
  id: string;
  type: BlueprintGenerationArtifactType;
  title: string;
  summary: string;
  createdAt: string;
  payload?: unknown;
  stale?: boolean;
  staleSince?: string;
  invalidatedBy?: BlueprintStaleSource;
}

export interface BlueprintMainStatePythonProjection {
  contractVersion: typeof BLUEPRINT_MAIN_STATE_PYTHON_CONTRACT_VERSION;
  kind: "blueprint.main.state_projection";
  stateAuthority: "node";
  stateMutation: "none";
  jobId: string;
  projectId?: string;
  sourceId?: string;
  version?: string;
  stage: BlueprintGenerationStage;
  status: BlueprintMainStatePythonStatus;
  nodeStatus: BlueprintMainStatePythonNodeStatus;
  createdAt?: string;
  updatedAt: string;
  completedAt?: string;
  artifacts: BlueprintMainStatePythonArtifact[];
  stale: boolean;
  staleArtifactIds: string[];
  error?: BlueprintMainStatePythonError;
  errors?: BlueprintMainStatePythonError[];
}

export type BlueprintMainStateProjectedJob = Pick<
  BlueprintGenerationJob,
  | "id"
  | "projectId"
  | "sourceId"
  | "version"
  | "createdAt"
  | "updatedAt"
  | "completedAt"
  | "stage"
  | "status"
  | "artifacts"
  | "staleArtifactIds"
  | "error"
>;

const VALID_STAGES: readonly BlueprintGenerationStage[] = [
  "input",
  "clarification",
  "route_generation",
  "spec_tree",
  "spec_docs",
  "preview",
  "effect_preview",
  "prompt_packaging",
  "runtime_capability",
  "engineering_handoff",
  "engineering_landing",
];

const VALID_NODE_STATUSES: readonly BlueprintGenerationStatus[] = [
  "pending",
  "running",
  "waiting",
  "reviewing",
  "completed",
  "failed",
];

const VALID_PROJECTION_STATUSES: readonly BlueprintMainStatePythonStatus[] = [
  "pending",
  "running",
  "done",
  "failed",
  "stale",
];

const VALID_ARTIFACT_TYPES: readonly BlueprintGenerationArtifactType[] = [
  "intake",
  "github_source",
  "clarification_session",
  "project_context",
  "route_set",
  "route_selection",
  "spec_tree",
  "spec_tree_version",
  "requirements",
  "design",
  "tasks",
  "spec_document_version",
  "brainstorm_reasoning_graph",
  "preview",
  "effect_preview",
  "prompt_pack",
  "capability_registry",
  "agent_crew",
  "role_timeline",
  "capability_invocation",
  "capability_evidence",
  "sandbox_derivation_job",
  "engineering_plan",
  "engineering_run",
  "replay",
  "feedback",
];

const VALID_STALE_REASONS: readonly BlueprintStaleReason[] = [
  "upstream_target_changed",
  "upstream_clarification_changed",
  "upstream_route_changed",
  "upstream_route_selection_changed",
  "upstream_explicit_invalidation",
];

const FORBIDDEN_FULL_STATE_KEYS = [
  "request",
  "events",
  "nextAction",
  "stageState",
  "checksLedger",
  "companionFindings",
] as const;

export function isBlueprintMainStatePythonProjection(
  value: unknown,
): value is BlueprintMainStatePythonProjection {
  const record = asRecord(value);
  if (!record) return false;
  if (record.contractVersion !== BLUEPRINT_MAIN_STATE_PYTHON_CONTRACT_VERSION) return false;
  if (record.kind !== "blueprint.main.state_projection") return false;
  if (record.stateAuthority !== "node" || record.stateMutation !== "none") return false;
  if (FORBIDDEN_FULL_STATE_KEYS.some((key) => key in record)) return false;
  if (!isNonEmptyString(record.jobId)) return false;
  if (record.projectId !== undefined && !isNonEmptyString(record.projectId)) return false;
  if (record.sourceId !== undefined && !isNonEmptyString(record.sourceId)) return false;
  if (record.version !== undefined && !isNonEmptyString(record.version)) return false;
  if (!oneOf(record.stage, VALID_STAGES)) return false;
  if (!oneOf(record.status, VALID_PROJECTION_STATUSES)) return false;
  if (!oneOf(record.nodeStatus, VALID_NODE_STATUSES)) return false;
  if (record.createdAt !== undefined && !isNonEmptyString(record.createdAt)) return false;
  if (!isNonEmptyString(record.updatedAt)) return false;
  if (record.completedAt !== undefined && !isNonEmptyString(record.completedAt)) return false;
  if (typeof record.stale !== "boolean") return false;
  if (!isStringArray(record.staleArtifactIds)) return false;
  if (!Array.isArray(record.artifacts)) return false;
  if (!record.artifacts.every(isBlueprintMainStatePythonArtifact)) return false;

  const artifactIds = new Set(
    (record.artifacts as BlueprintMainStatePythonArtifact[]).map((artifact) => artifact.id),
  );
  if (!(record.staleArtifactIds as string[]).every((artifactId) => artifactIds.has(artifactId))) {
    return false;
  }

  const errors = collectProjectionErrors(record);
  if (!errors) return false;

  if (record.status === "failed") {
    return record.nodeStatus === "failed" && errors.length > 0;
  }

  if (record.nodeStatus === "failed" || errors.length > 0) return false;

  if (record.status === "done") {
    return record.nodeStatus === "completed";
  }

  if (record.status === "stale") {
    return (
      record.stale === true &&
      (record.staleArtifactIds as string[]).length > 0
    );
  }

  if (record.status === "pending") return record.nodeStatus === "pending";

  return ["running", "waiting", "reviewing"].includes(record.nodeStatus as string);
}

export function projectBlueprintMainStateFromPython(
  value: unknown,
): BlueprintMainStateProjectedJob | null {
  if (!isBlueprintMainStatePythonProjection(value)) {
    return null;
  }

  const errors = collectProjectionErrors(value) ?? [];
  return {
    id: value.jobId,
    projectId: value.projectId,
    sourceId: value.sourceId,
    version: value.version ?? value.contractVersion,
    createdAt: value.createdAt ?? value.updatedAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt,
    stage: value.stage,
    status: mapPythonProjectionStatusToNodeStatus(value),
    artifacts: value.artifacts.map(projectArtifact),
    staleArtifactIds: value.staleArtifactIds,
    error: errors[0]
      ? {
          code: errors[0].code,
          message: errors[0].message,
          stage: errors[0].stage,
        }
      : undefined,
  };
}

export function mapPythonProjectionStatusToNodeStatus(
  projection: Pick<BlueprintMainStatePythonProjection, "status" | "nodeStatus">,
): BlueprintGenerationStatus {
  if (projection.status === "done") return "completed";
  if (projection.status === "stale") return projection.nodeStatus;
  return projection.nodeStatus;
}

function isBlueprintMainStatePythonArtifact(
  value: unknown,
): value is BlueprintMainStatePythonArtifact {
  const artifact = asRecord(value);
  if (!artifact) return false;
  if (!isNonEmptyString(artifact.id)) return false;
  if (!oneOf(artifact.type, VALID_ARTIFACT_TYPES)) return false;
  if (!isNonEmptyString(artifact.title)) return false;
  if (!isNonEmptyString(artifact.summary)) return false;
  if (!isNonEmptyString(artifact.createdAt)) return false;
  if (artifact.stale !== undefined && typeof artifact.stale !== "boolean") return false;
  if (artifact.staleSince !== undefined && !isNonEmptyString(artifact.staleSince)) return false;
  if (artifact.stale === true && artifact.staleSince === undefined) return false;
  if (artifact.stale !== true && artifact.staleSince !== undefined) return false;
  if (artifact.invalidatedBy !== undefined && !isBlueprintStaleSource(artifact.invalidatedBy)) {
    return false;
  }
  return true;
}

function isBlueprintStaleSource(value: unknown): value is BlueprintStaleSource {
  const source = asRecord(value);
  if (!source) return false;
  return (
    oneOf(source.stage, VALID_STAGES) &&
    isNonEmptyString(source.artifactId) &&
    oneOf(source.artifactType, VALID_ARTIFACT_TYPES) &&
    oneOf(source.reason, VALID_STALE_REASONS) &&
    isNonEmptyString(source.triggeredAt)
  );
}

function isBlueprintMainStatePythonError(
  value: unknown,
): value is BlueprintMainStatePythonError {
  const error = asRecord(value);
  if (!error) return false;
  return (
    isNonEmptyString(error.code) &&
    isNonEmptyString(error.message) &&
    oneOf(error.stage, VALID_STAGES) &&
    (error.retryable === undefined || typeof error.retryable === "boolean")
  );
}

function collectProjectionErrors(projection: {
  error?: unknown;
  errors?: unknown;
}): BlueprintMainStatePythonError[] | null {
  const errors: BlueprintMainStatePythonError[] = [];
  if (projection.error !== undefined) {
    if (!isBlueprintMainStatePythonError(projection.error)) return null;
    errors.push(projection.error);
  }
  if (projection.errors !== undefined) {
    if (!Array.isArray(projection.errors)) return null;
    for (const error of projection.errors) {
      if (!isBlueprintMainStatePythonError(error)) return null;
      errors.push(error);
    }
  }
  return errors;
}

function projectArtifact(artifact: BlueprintMainStatePythonArtifact): BlueprintGenerationArtifact {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    summary: artifact.summary,
    createdAt: artifact.createdAt,
    payload: artifact.payload,
    staleSince: artifact.staleSince,
    invalidatedBy: artifact.invalidatedBy,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}
