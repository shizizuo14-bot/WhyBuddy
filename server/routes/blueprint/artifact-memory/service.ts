import type {
  BlueprintArtifactFeedback,
  BlueprintArtifactFeedbackRequest,
  BlueprintArtifactSourceIds,
  BlueprintArtifactMemoryEntry,
  BlueprintArtifactReplaySnapshot,
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";

import { createId } from "../../../core/ids.js";
import type { BlueprintServiceContext } from "../context.js";

type MaybePromise<T> = T | Promise<T>;
type ArtifactMemoryResource = "all" | "ledger" | "events" | "replays" | "feedback";
type ArtifactMemoryRuntimeAction = "list" | "write";
type ArtifactMemoryRuntimeStatus = "completed" | "failed" | "not_found";
type ArtifactMemoryReadResult<T> = T[] | ArtifactMemoryRuntimeErrorResult;

export interface ArtifactMemoryWriteResult {
  jobId: string;
  action: "write";
  resource: "feedback";
  source: "node-artifact-store" | "python-artifact-memory-runtime";
  persistenceOwner: "node" | "python";
  request: BlueprintArtifactFeedbackRequest;
  writeAccepted: boolean;
  ledger: BlueprintArtifactMemoryEntry[];
  events: BlueprintGenerationEvent[];
  replays: BlueprintArtifactReplaySnapshot[];
  feedback: BlueprintArtifactFeedback[];
  counts: {
    ledger: number;
    events: number;
    replays: number;
    feedback: number;
  };
}

export interface ArtifactMemoryService {
  listLedger(jobId: string): MaybePromise<ArtifactMemoryReadResult<BlueprintArtifactMemoryEntry>>;
  listReplays(jobId: string): MaybePromise<ArtifactMemoryReadResult<BlueprintArtifactReplaySnapshot>>;
  listFeedback(jobId: string): MaybePromise<ArtifactMemoryReadResult<BlueprintArtifactFeedback>>;
  listEvents(jobId: string): MaybePromise<BlueprintGenerationEvent[]>;
  writeFeedback(
    jobId: string,
    request: BlueprintArtifactFeedbackRequest,
  ): MaybePromise<ArtifactMemoryWriteResult | ArtifactMemoryRuntimeErrorResult>;
}

interface ArtifactMemoryProxyResponse {
  jobId: string;
  action: "list" | "read" | "write";
  resource: ArtifactMemoryResource;
  source: "node-artifact-store";
  persistenceOwner?: "node";
  ledger: BlueprintArtifactMemoryEntry[];
  events: BlueprintGenerationEvent[];
  replays: BlueprintArtifactReplaySnapshot[];
  feedback: BlueprintArtifactFeedback[];
  counts?: {
    ledger: number;
    events: number;
    replays: number;
    feedback: number;
  };
  request?: BlueprintArtifactFeedbackRequest;
  writeAccepted?: boolean;
}

interface ArtifactMemoryRuntimeEnvelope {
  ok: true;
  status: "completed";
  statusCode: number;
  action: ArtifactMemoryRuntimeAction;
  resource: ArtifactMemoryResource;
  contractVersion: "blueprint.artifact-memory.runtime.v1";
  runtime: {
    owner: "python";
    mode: "runtime_store";
    storage: "memory";
    externalStorage: false;
    [key: string]: unknown;
  };
  source: "python-artifact-memory-runtime";
  persistenceOwner: "python";
  projectId?: string;
  sessionId?: string;
  jobId: string;
  ledger: BlueprintArtifactMemoryEntry[];
  events: BlueprintGenerationEvent[];
  replays: BlueprintArtifactReplaySnapshot[];
  feedback: BlueprintArtifactFeedback[];
  counts?: {
    ledger: number;
    events: number;
    replays: number;
    feedback: number;
  };
  item?: unknown;
  written?: boolean;
  deleted?: boolean;
}

export interface ArtifactMemoryRuntimeErrorResult {
  ok: false;
  status: Exclude<ArtifactMemoryRuntimeStatus, "completed">;
  statusCode: number;
  action: ArtifactMemoryRuntimeAction;
  resource: ArtifactMemoryResource;
  contractVersion?: "blueprint.artifact-memory.runtime.v1";
  source: "python-artifact-memory-runtime" | "node-artifact-memory-python-runtime";
  persistenceOwner?: "python";
  projectId?: string;
  sessionId?: string;
  jobId?: string;
  error: string;
  reason: string;
  message: string;
  found?: false;
  retryable?: boolean;
}

type ArtifactMemoryRuntimeResponse =
  | ArtifactMemoryRuntimeEnvelope
  | ArtifactMemoryRuntimeErrorResult;

const PYTHON_PROXY_ENABLED = "BLUEPRINT_ARTIFACT_MEMORY_PYTHON_PROXY";
const PYTHON_RUNTIME_ENABLED = "BLUEPRINT_ARTIFACT_MEMORY_PYTHON_RUNTIME";
const PYTHON_PROXY_BASE_URL = "PYTHON_SLIDE_RULE_BASE_URL";
const PYTHON_PROXY_INTERNAL_KEY = "PYTHON_SLIDE_RULE_INTERNAL_KEY";

function readArtifactPayloads<T>(
  job: BlueprintGenerationJob | null,
  type: string,
): T[] {
  if (!job) return [];
  return job.artifacts
    .filter(artifact => artifact.type === type)
    .map(artifact => artifact.payload as T)
    .filter((payload): payload is T => payload !== undefined && payload !== null);
}

function readLocalSnapshot(ctx: BlueprintServiceContext, jobId: string) {
  const job = ctx.jobStore.get(jobId);
  return {
    ledger: readArtifactPayloads<BlueprintArtifactMemoryEntry>(job, "replay"),
    replays: readArtifactPayloads<BlueprintArtifactReplaySnapshot>(job, "replay"),
    feedback: readArtifactPayloads<BlueprintArtifactFeedback>(job, "feedback"),
    events: ctx.replayStore.listEvents(jobId),
  };
}

function makeCounts(snapshot: ReturnType<typeof readLocalSnapshot>) {
  return {
    ledger: snapshot.ledger.length,
    events: snapshot.events.length,
    replays: snapshot.replays.length,
    feedback: snapshot.feedback.length,
  };
}

function createLocalWriteResult(
  ctx: BlueprintServiceContext,
  jobId: string,
  request: BlueprintArtifactFeedbackRequest,
): ArtifactMemoryWriteResult {
  const snapshot = readLocalSnapshot(ctx, jobId);
  return {
    jobId,
    action: "write",
    resource: "feedback",
    source: "node-artifact-store",
    persistenceOwner: "node",
    request,
    writeAccepted: false,
    ...snapshot,
    counts: makeCounts(snapshot),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => (readString(item) ? [readString(item)!] : [])))];
}

function runtimeFeedbackSourceIds(
  sourceIds?: Partial<BlueprintArtifactSourceIds>,
): BlueprintArtifactSourceIds {
  return {
    projectId: readString(sourceIds?.projectId),
    routeSetId: readString(sourceIds?.routeSetId),
    specTreeId: readString(sourceIds?.specTreeId),
    nodeIds: readStringList(sourceIds?.nodeIds),
    specDocumentIds: readStringList(sourceIds?.specDocumentIds),
    effectPreviewIds: readStringList(sourceIds?.effectPreviewIds),
    promptPackageIds: readStringList(sourceIds?.promptPackageIds),
    capabilityInvocationIds: readStringList(sourceIds?.capabilityInvocationIds),
    capabilityEvidenceIds: readStringList(sourceIds?.capabilityEvidenceIds),
    landingPlanIds: readStringList(sourceIds?.landingPlanIds),
    engineeringRunIds: readStringList(sourceIds?.engineeringRunIds),
    capabilityIds: readStringList(sourceIds?.capabilityIds),
    roleIds: readStringList(sourceIds?.roleIds),
    crewIds: readStringList(sourceIds?.crewIds),
  };
}

function runtimeFeedbackItem(
  jobId: string,
  request: BlueprintArtifactFeedbackRequest,
): BlueprintArtifactFeedback {
  const id = createId("blueprint-artifact-feedback");
  const artifactId = readString(request.artifactId) ?? id;
  const entryId = readString(request.entryId) ?? artifactId;
  const message =
    readString(request.message) ??
    readString(request.summary) ??
    "Artifact feedback recorded.";
  return {
    id,
    jobId,
    entryId,
    artifactId,
    artifactType: "feedback",
    kind: request.kind ?? "feedback",
    message,
    summary: readString(request.summary) ?? message,
    createdAt: new Date().toISOString(),
    createdBy: readString(request.createdBy),
    tags: readStringList(request.tags),
    sourceIds: runtimeFeedbackSourceIds(request.sourceIds),
    payloadSummary: request.payloadSummary ?? {},
  };
}

function isPythonArtifactMemoryProxyEnabled(): boolean {
  return process.env[PYTHON_PROXY_ENABLED] === "true";
}

function isPythonArtifactMemoryRuntimeEnabled(): boolean {
  return process.env[PYTHON_RUNTIME_ENABLED] === "true";
}

function resolvePythonArtifactMemoryBaseUrl(): string {
  return (process.env[PYTHON_PROXY_BASE_URL] || "http://localhost:9700").replace(/\/+$/, "");
}

function resolvePythonArtifactMemoryInternalKey(): string {
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

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArtifactMemoryProxyResponse(value: unknown): value is ArtifactMemoryProxyResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.jobId === "string" &&
    (candidate.action === "list" ||
      candidate.action === "read" ||
      candidate.action === "write") &&
    (candidate.resource === "all" ||
      candidate.resource === "ledger" ||
      candidate.resource === "events" ||
      candidate.resource === "replays" ||
      candidate.resource === "feedback") &&
    candidate.source === "node-artifact-store" &&
    isArray(candidate.ledger) &&
    isArray(candidate.events) &&
    isArray(candidate.replays) &&
    isArray(candidate.feedback)
  );
}

function isArtifactMemoryRuntimeEnvelope(value: unknown): value is ArtifactMemoryRuntimeEnvelope {
  if (!isRecord(value)) return false;
  return (
    value.ok === true &&
    value.status === "completed" &&
    typeof value.statusCode === "number" &&
    (value.action === "list" || value.action === "write") &&
    (value.resource === "all" ||
      value.resource === "ledger" ||
      value.resource === "events" ||
      value.resource === "replays" ||
      value.resource === "feedback") &&
    value.contractVersion === "blueprint.artifact-memory.runtime.v1" &&
    value.source === "python-artifact-memory-runtime" &&
    value.persistenceOwner === "python" &&
    typeof value.jobId === "string" &&
    isArray(value.ledger) &&
    isArray(value.events) &&
    isArray(value.replays) &&
    isArray(value.feedback) &&
    isRecord(value.runtime) &&
    value.runtime.owner === "python" &&
    value.runtime.mode === "runtime_store" &&
    value.runtime.externalStorage === false
  );
}

function isArtifactMemoryRuntimeErrorResult(
  value: unknown,
): value is ArtifactMemoryRuntimeErrorResult {
  if (!isRecord(value)) return false;
  return (
    value.ok === false &&
    (value.status === "failed" || value.status === "not_found") &&
    typeof value.statusCode === "number" &&
    (value.action === "list" || value.action === "write") &&
    (value.resource === "all" ||
      value.resource === "ledger" ||
      value.resource === "events" ||
      value.resource === "replays" ||
      value.resource === "feedback") &&
    (value.source === "python-artifact-memory-runtime" ||
      value.source === "node-artifact-memory-python-runtime") &&
    typeof value.error === "string" &&
    typeof value.reason === "string" &&
    typeof value.message === "string"
  );
}

function isArtifactMemoryRuntimeResponse(
  value: unknown,
): value is ArtifactMemoryRuntimeResponse {
  return isArtifactMemoryRuntimeEnvelope(value) || isArtifactMemoryRuntimeErrorResult(value);
}

function projectIdForRuntime(ctx: BlueprintServiceContext, jobId: string): string | undefined {
  const request = ctx.jobStore.get(jobId)?.request;
  if (!request || typeof request !== "object") return undefined;
  const projectId = (request as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId ? projectId : undefined;
}

function runtimePayload(
  ctx: BlueprintServiceContext,
  jobId: string,
  resource: ArtifactMemoryResource,
  action: ArtifactMemoryRuntimeAction,
  request?: BlueprintArtifactFeedbackRequest,
) {
  const item =
    action === "write" && resource === "feedback" && request
      ? runtimeFeedbackItem(jobId, request)
      : undefined;
  return {
    jobId,
    projectId: projectIdForRuntime(ctx, jobId),
    sessionId: jobId,
    action,
    resource,
    ...(item ? { item } : {}),
    nodeControl: {
      routeShellOwner: "node",
      jobStoreOwner: "node",
      eventBusOwner: "node",
      externalStorageOwner: "none",
    },
  };
}

function runtimeUnavailableResult(
  action: ArtifactMemoryRuntimeAction,
  resource: ArtifactMemoryResource,
  jobId: string,
  message: string,
): ArtifactMemoryRuntimeErrorResult {
  return {
    ok: false,
    status: "failed",
    statusCode: 503,
    action,
    resource,
    source: "node-artifact-memory-python-runtime",
    error: "runtime_unavailable",
    reason: "python_runtime_failed",
    message,
    jobId,
    retryable: true,
  };
}

async function callPythonArtifactMemoryProxy(
  ctx: BlueprintServiceContext,
  jobId: string,
  resource: ArtifactMemoryResource,
  action: "list" | "write",
  request?: BlueprintArtifactFeedbackRequest,
): Promise<ArtifactMemoryProxyResponse> {
  const snapshot = readLocalSnapshot(ctx, jobId);
  const response = await fetch(
    `${resolvePythonArtifactMemoryBaseUrl()}/api/blueprint/spec-documents/artifact-memory/contract`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": resolvePythonArtifactMemoryInternalKey(),
      },
      body: JSON.stringify({
        jobId,
        action,
        resource,
        request,
        ...snapshot,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`python artifact-memory proxy failed: ${response.status} ${detail.slice(0, 200)}`);
  }

  const payload = await response.json();
  if (!isArtifactMemoryProxyResponse(payload)) {
    throw new Error("python artifact-memory proxy returned invalid shape");
  }
  return payload;
}

async function callPythonArtifactMemoryRuntime(
  ctx: BlueprintServiceContext,
  jobId: string,
  resource: ArtifactMemoryResource,
  action: ArtifactMemoryRuntimeAction,
  request?: BlueprintArtifactFeedbackRequest,
): Promise<ArtifactMemoryRuntimeResponse> {
  const response = await fetch(
    `${resolvePythonArtifactMemoryBaseUrl()}/api/blueprint/spec-documents/artifact-memory/runtime`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": resolvePythonArtifactMemoryInternalKey(),
      },
      body: JSON.stringify(runtimePayload(ctx, jobId, resource, action, request)),
    },
  );

  const payload = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      status: "failed",
      statusCode: response.status,
      action,
      resource,
      source: "node-artifact-memory-python-runtime",
      error: "runtime_invalid_response",
      reason: "python_runtime_invalid_response",
      message: text.slice(0, 200) || "Python artifact-memory runtime returned invalid JSON.",
      jobId,
    };
  });

  if (!isArtifactMemoryRuntimeResponse(payload)) {
    throw new Error("python artifact-memory runtime returned invalid shape");
  }
  return payload;
}

function withPythonFallback<T>(
  ctx: BlueprintServiceContext,
  jobId: string,
  resource: ArtifactMemoryResource,
  action: "list" | "write",
  select: (payload: ArtifactMemoryProxyResponse) => T,
  fallback: () => T,
  request?: BlueprintArtifactFeedbackRequest,
): MaybePromise<T> {
  if (!isPythonArtifactMemoryProxyEnabled()) {
    return fallback();
  }

  return callPythonArtifactMemoryProxy(ctx, jobId, resource, action, request)
    .then(select)
    .catch(error => {
      ctx.logger.warn("artifact-memory python proxy failed, using node store", {
        jobId,
        resource,
        action,
        error: errorMessage(error),
      });
      return fallback();
    });
}

async function withPythonRuntime<T>(
  ctx: BlueprintServiceContext,
  jobId: string,
  resource: ArtifactMemoryResource,
  action: ArtifactMemoryRuntimeAction,
  select: (payload: ArtifactMemoryRuntimeEnvelope) => T,
  request?: BlueprintArtifactFeedbackRequest,
): Promise<T | ArtifactMemoryRuntimeErrorResult> {
  try {
    const payload = await callPythonArtifactMemoryRuntime(
      ctx,
      jobId,
      resource,
      action,
      request,
    );
    if (!payload.ok) {
      return payload;
    }
    return select(payload);
  } catch (error) {
    const message = errorMessage(error);
    ctx.logger.warn("artifact-memory python runtime failed", {
      jobId,
      resource,
      action,
      error: message,
    });
    return runtimeUnavailableResult(action, resource, jobId, message);
  }
}

export function createArtifactMemoryService(
  ctx: BlueprintServiceContext,
): ArtifactMemoryService {
  return {
    listLedger(jobId) {
      if (isPythonArtifactMemoryRuntimeEnabled()) {
        return withPythonRuntime(
          ctx,
          jobId,
          "ledger",
          "list",
          payload => payload.ledger,
        );
      }
      return withPythonFallback(
        ctx,
        jobId,
        "ledger",
        "list",
        payload => payload.ledger,
        () => readLocalSnapshot(ctx, jobId).ledger,
      );
    },
    listReplays(jobId) {
      if (isPythonArtifactMemoryRuntimeEnabled()) {
        return withPythonRuntime(
          ctx,
          jobId,
          "replays",
          "list",
          payload => payload.replays,
        );
      }
      return withPythonFallback(
        ctx,
        jobId,
        "replays",
        "list",
        payload => payload.replays,
        () => readLocalSnapshot(ctx, jobId).replays,
      );
    },
    listFeedback(jobId) {
      if (isPythonArtifactMemoryRuntimeEnabled()) {
        return withPythonRuntime(
          ctx,
          jobId,
          "feedback",
          "list",
          payload => payload.feedback,
        );
      }
      return withPythonFallback(
        ctx,
        jobId,
        "feedback",
        "list",
        payload => payload.feedback,
        () => readLocalSnapshot(ctx, jobId).feedback,
      );
    },
    listEvents(jobId) {
      return readLocalSnapshot(ctx, jobId).events;
    },
    writeFeedback(jobId, request) {
      if (isPythonArtifactMemoryRuntimeEnabled()) {
        return withPythonRuntime(
          ctx,
          jobId,
          "feedback",
          "write",
          payload => ({
            jobId: payload.jobId,
            action: "write",
            resource: "feedback",
            source: "python-artifact-memory-runtime",
            persistenceOwner: "python",
            request,
            writeAccepted: true,
            ledger: payload.ledger,
            events: payload.events,
            replays: payload.replays,
            feedback: payload.feedback,
            counts: payload.counts ?? {
              ledger: payload.ledger.length,
              events: payload.events.length,
              replays: payload.replays.length,
              feedback: payload.feedback.length,
            },
          }),
          request,
        );
      }
      return withPythonFallback(
        ctx,
        jobId,
        "feedback",
        "write",
        payload => ({
          jobId: payload.jobId,
          action: "write",
          resource: "feedback",
          source: "node-artifact-store",
          persistenceOwner: "node",
          request: payload.request ?? request,
          writeAccepted: payload.writeAccepted === true,
          ledger: payload.ledger,
          events: payload.events,
          replays: payload.replays,
          feedback: payload.feedback,
          counts: payload.counts ?? {
            ledger: payload.ledger.length,
            events: payload.events.length,
            replays: payload.replays.length,
            feedback: payload.feedback.length,
          },
        }),
        () => createLocalWriteResult(ctx, jobId, request),
        request,
      );
    },
  };
}
