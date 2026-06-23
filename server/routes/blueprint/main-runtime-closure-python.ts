import type {
  BlueprintGenerationJob,
} from "../../../shared/blueprint/index.js";

/**
 * Blueprint Main Runtime Closure 100 - Node thin bridge for Python-owned bounded runtime.
 *
 * Python provides the closure summary for the combined main runtime slice.
 * Node retains ownership of:
 * - route shell
 * - durable job store / persistence
 * - event bus transport
 * - ledger, diagnostics global
 * - full prompt exec, preview image, external LLM
 *
 * This file only maps and proxies the closure summary envelope.
 * Never promote diagnostic-only to production takeover.
 */

export const BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION =
  "blueprint.main-runtime-closure.v1" as const;

export type BlueprintMainRuntimeClosureStatus =
  | "success"
  | "partial"
  | "degraded"
  | "failed"
  | "diagnostic-only";

export interface BlueprintMainRuntimeClosureBoundary {
  owner: "python" | "node";
  mode: "bounded_closure" | "local_fallback";
  jobStoreOwner: "node";
  eventBusOwner: "node";
  ledgerOwner: "node";
  previewOwner: "node";
  promptPackageOwner: "node";
}

export interface BlueprintMainRuntimeClosureSummary {
  jobId: string;
  projectId?: string;
  stageId: string;
  status: BlueprintMainRuntimeClosureStatus;
  components: Record<string, boolean>;
  metadata: {
    actor?: Record<string, unknown>;
    causation?: Record<string, unknown>;
    diagnostic?: Record<string, unknown>;
  };
}

export interface BlueprintMainRuntimeClosureResult {
  status: BlueprintMainRuntimeClosureStatus;
  contractVersion: typeof BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION;
  provenance: "python-blueprint-main-runtime-closure" | "node-blueprint-main-runtime-closure";
  runtime: BlueprintMainRuntimeClosureBoundary;
  jobId: string;
  projectId?: string;
  stageId: string;
  closureSummary: BlueprintMainRuntimeClosureSummary;
  diagnostics: {
    componentsCovered: string[];
    nodePersistencePreserved: boolean;
    nodeEventBusPreserved: boolean;
    nodeLedgerPreserved: boolean;
  };
  diagnosticOnly?: boolean;
  productionTakeover?: boolean;
  subEnvelopes?: Record<string, unknown>;
  error?: string;
}

const PYTHON_CLOSURE_ENABLED_ENV = "BLUEPRINT_MAIN_RUNTIME_CLOSURE_PYTHON";
const PYTHON_BASE_URL_ENV = "PYTHON_SLIDE_RULE_BASE_URL";
const PYTHON_KEY_ENV = "PYTHON_SLIDE_RULE_INTERNAL_KEY";

const NODE_BOUNDARIES: BlueprintMainRuntimeClosureBoundary = {
  owner: "node",
  mode: "local_fallback",
  jobStoreOwner: "node",
  eventBusOwner: "node",
  ledgerOwner: "node",
  previewOwner: "node",
  promptPackageOwner: "node",
};

export async function executeBlueprintMainRuntimeClosure(
  input: {
    job?: BlueprintGenerationJob | null;
    jobId?: string;
    projectId?: string;
    stageId?: string;
    actor?: Record<string, unknown>;
    causation?: Record<string, unknown>;
    diagnostics?: Record<string, unknown>;
    simulate?: Record<string, unknown>;
    diagnosticOnly?: boolean;
    now?: string;
  },
): Promise<BlueprintMainRuntimeClosureResult> {
  const now = input.now ?? new Date().toISOString();
  const jobId = input.jobId ?? input.job?.id ?? "unknown";
  const projectId = input.projectId ?? input.job?.projectId;
  const stageId = input.stageId ?? input.job?.stage ?? "input";

  if (!isPythonMainRuntimeClosureEnabled()) {
    return buildLocalClosureResult(input, jobId, projectId, stageId, now);
  }

  try {
    const base = resolvePythonBase();
    const resp = await fetch(`${base}/api/blueprint/main-runtime/closure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": resolvePythonKey(),
      },
      body: JSON.stringify({
        jobId,
        job: input.job ? snapshotJobForPython(input.job) : undefined,
        projectId,
        stageId,
        actor: input.actor,
        causation: input.causation,
        diagnostics: input.diagnostics,
        simulate: input.simulate,
        diagnosticOnly: input.diagnosticOnly,
        now,
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (isValidClosureResult(json)) {
      return mapBlueprintMainRuntimeClosurePython(json);
    }
    // fallthrough to local on bad shape (preserve node control)
    return buildLocalClosureResult(input, jobId, projectId, stageId, now, "invalid_python_shape");
  } catch (err) {
    return buildLocalClosureResult(input, jobId, projectId, stageId, now, "python_unavailable");
  }
}

function buildLocalClosureResult(
  input: any,
  jobId: string,
  projectId: string | undefined,
  stageId: string,
  now: string,
  errHint?: string,
): BlueprintMainRuntimeClosureResult {
  let status: BlueprintMainRuntimeClosureStatus = "success";
  if (input?.diagnosticOnly) {
    status = "diagnostic-only";
  } else if (input?.simulate?.forceFailed || input?.simulate?.failed) {
    status = "failed";
  } else if (input?.simulate?.degraded) {
    status = "degraded";
  } else if (input?.simulate?.partial) {
    status = "partial";
  }

  const closureSummary: BlueprintMainRuntimeClosureSummary = {
    jobId,
    projectId,
    stageId,
    status,
    components: {
      mainState: true,
      jobLifecycle: true,
      eventStream: true,
      promptPreview: status !== "failed",
      reviewExport: status !== "failed",
      artifactMemory: true,
    },
    metadata: {
      actor: input?.actor,
      causation: input?.causation,
      diagnostic: input?.diagnostics ?? { local: true },
    },
  };

  const res: BlueprintMainRuntimeClosureResult = {
    status,
    contractVersion: BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION,
    provenance: "node-blueprint-main-runtime-closure",
    runtime: {
      ...NODE_BOUNDARIES,
      ...(status === "diagnostic-only" ? { mode: "local_fallback" } : {}),
    },
    jobId,
    projectId,
    stageId,
    closureSummary,
    diagnostics: {
      componentsCovered: [
        "mainState",
        "jobLifecycle",
        "eventStream",
        "promptPreview",
        "reviewExport",
        "artifactMemory",
      ],
      nodePersistencePreserved: true,
      nodeEventBusPreserved: true,
      nodeLedgerPreserved: true,
    },
  };

  if (status === "diagnostic-only") {
    res.diagnosticOnly = true;
    res.productionTakeover = false;
  }

  if (errHint) {
    res.error = errHint;
  }

  return res;
}

function snapshotJobForPython(job: BlueprintGenerationJob): Record<string, unknown> {
  return {
    id: job.id,
    projectId: job.projectId,
    stage: job.stage,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    artifacts: job.artifacts ?? [],
    events: job.events ?? [],
  };
}

function isPythonMainRuntimeClosureEnabled(): boolean {
  return process.env[PYTHON_CLOSURE_ENABLED_ENV] === "true";
}

function resolvePythonBase(): string {
  return (process.env[PYTHON_BASE_URL_ENV] || "http://localhost:9700").replace(/\/$/, "");
}

function resolvePythonKey(): string {
  return process.env[PYTHON_KEY_ENV] || "dev-slide-rule-internal";
}

function isValidClosureResult(v: unknown): v is BlueprintMainRuntimeClosureResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, any>;
  if (r.contractVersion !== BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION) return false;
  if (typeof r.status !== "string") return false;
  if (typeof r.jobId !== "string") return false;
  if (!r.closureSummary || typeof r.closureSummary !== "object") return false;
  if (!r.diagnostics || typeof r.diagnostics !== "object") return false;
  return true;
}

export function mapBlueprintMainRuntimeClosurePython(
  envelope: any,
): BlueprintMainRuntimeClosureResult {
  // Ensure stable shape even if raw python or mixed
  if (isValidClosureResult(envelope)) {
    // Guard: never let diagnostic-only be treated as takeover
    if (envelope.status === "diagnostic-only") {
      return {
        ...envelope,
        productionTakeover: false,
        diagnosticOnly: true,
      };
    }
    return envelope;
  }
  // fallback mapper
  return {
    status: "degraded",
    contractVersion: BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION,
    provenance: "node-blueprint-main-runtime-closure",
    runtime: NODE_BOUNDARIES,
    jobId: envelope?.jobId || "unknown",
    stageId: envelope?.stageId || "input",
    closureSummary: {
      jobId: envelope?.jobId || "unknown",
      stageId: envelope?.stageId || "input",
      status: "degraded",
      components: {},
      metadata: {},
    },
    diagnostics: {
      componentsCovered: [],
      nodePersistencePreserved: true,
      nodeEventBusPreserved: true,
      nodeLedgerPreserved: true,
    },
    error: "invalid_envelope_shape",
  };
}
