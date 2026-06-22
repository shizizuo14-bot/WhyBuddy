import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BlueprintArtifactFeedback,
  BlueprintArtifactMemoryEntry,
  BlueprintArtifactReplaySnapshot,
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../shared/blueprint/index.js";
import { BlueprintEventName } from "../../../shared/blueprint/events.js";
import { createMemoryBlueprintJobStore } from "../blueprint.js";
import { buildBlueprintServiceContext } from "../blueprint/context.js";
import { createArtifactMemoryService } from "../blueprint/artifact-memory/service.js";

const FIXED_TIMESTAMP = "2026-06-20T00:00:00.000Z";

function makeLedgerEntry(id = "entry-runtime"): BlueprintArtifactMemoryEntry {
  return {
    id,
    jobId: "job-1",
    artifactId: "artifact-runtime",
    artifactType: "requirements",
    stage: "spec_docs",
    title: "Runtime ledger",
    summary: "Python runtime ledger entry",
    createdAt: FIXED_TIMESTAMP,
    sourceIds: {
      routeIds: [],
      specTreeNodeIds: ["node-1"],
      specDocumentIds: ["doc-1"],
      effectPreviewIds: [],
      promptPackageIds: [],
      capabilityIds: [],
      roleIds: [],
      crewIds: [],
    },
    version: 1,
    tags: ["requirements"],
    payloadSummary: { status: "draft" },
  };
}

function makeEvent(id = "event-runtime"): BlueprintGenerationEvent {
  return {
    id,
    jobId: "job-1",
    type: BlueprintEventName.EvidenceRecorded,
    family: "evidence",
    stage: "engineering_handoff",
    status: "completed",
    message: "evidence recorded",
    occurredAt: FIXED_TIMESTAMP,
  };
}

function makeReplay(id = "replay-runtime"): BlueprintArtifactReplaySnapshot {
  return {
    id,
    jobId: "job-1",
    createdAt: FIXED_TIMESTAMP,
    timelineEntries: [],
    stageCounts: {
      input: 0,
      clarification: 0,
      route_generation: 0,
      spec_tree: 0,
      spec_docs: 1,
      preview: 0,
      effect_preview: 0,
      prompt_packaging: 0,
      runtime_capability: 0,
      engineering_handoff: 0,
      engineering_landing: 0,
    },
    lineageEdges: [],
  };
}

function makeFeedback(id = "feedback-runtime"): BlueprintArtifactFeedback {
  return {
    id,
    jobId: "job-1",
    entryId: "entry-runtime",
    artifactId: "artifact-runtime",
    artifactType: "requirements",
    kind: "feedback",
    message: "Looks good",
    summary: "Feedback recorded",
    createdAt: FIXED_TIMESTAMP,
    tags: ["review"],
    sourceIds: {
      routeIds: [],
      specTreeNodeIds: [],
      specDocumentIds: ["doc-1"],
      effectPreviewIds: [],
      promptPackageIds: [],
      capabilityIds: [],
      roleIds: [],
      crewIds: [],
    },
    payloadSummary: { review: "accepted" },
  };
}

function makeJob(): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: { projectId: "project-node" },
    status: "pending",
    stage: "input",
    version: "v1",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    artifacts: [
      {
        id: "artifact-node",
        type: "replay",
        title: "Node replay",
        summary: "Node-owned replay payload",
        createdAt: FIXED_TIMESTAMP,
        payload: makeLedgerEntry("entry-node"),
      },
    ],
    events: [makeEvent("event-node")],
  };
}

function runtimeEnvelope(
  status: "completed" | "failed" | "not_found",
  overrides: Record<string, unknown> = {},
) {
  const ok = status === "completed";
  return {
    ok,
    status,
    statusCode: ok ? 200 : status === "not_found" ? 404 : 409,
    action: "list",
    resource: "ledger",
    contractVersion: "blueprint.artifact-memory.runtime.v1",
    runtime: {
      owner: "python",
      mode: "runtime_store",
      storage: "memory",
      externalStorage: false,
    },
    source: "python-artifact-memory-runtime",
    persistenceOwner: "python",
    projectId: "project-runtime",
    sessionId: "session-runtime",
    jobId: "job-1",
    ledger: ok ? [makeLedgerEntry()] : [],
    events: ok ? [makeEvent()] : [],
    replays: ok ? [makeReplay()] : [],
    feedback: ok ? [makeFeedback()] : [],
    counts: ok ? { ledger: 1, events: 1, replays: 1, feedback: 1 } : undefined,
    ...overrides,
  };
}

function makeService() {
  const jobStore = createMemoryBlueprintJobStore([makeJob()]);
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const ctx = buildBlueprintServiceContext({ jobStore, logger });
  return { service: createArtifactMemoryService(ctx), logger };
}

describe("Blueprint artifact memory Python runtime store bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delegates list and write calls to Python runtime when runtime switch is enabled", async () => {
    vi.stubEnv("BLUEPRINT_ARTIFACT_MEMORY_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-runtime.test/");
    vi.stubEnv("PYTHON_SLIDE_RULE_INTERNAL_KEY", "internal-test");

    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        calls.push({ url: String(input), body });
        if (body.action === "write" && !body.item) {
          return new Response(
            JSON.stringify(
              runtimeEnvelope("failed", {
                ok: false,
                action: body.action,
                resource: body.resource,
                error: "item_required",
                reason: "missing_item",
                message: "Artifact memory write requires item.",
              }),
            ),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify(
            runtimeEnvelope("completed", {
              action: body.action,
              resource: body.resource,
            }),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const { service } = makeService();

    await expect(Promise.resolve(service.listLedger("job-1"))).resolves.toEqual([
      makeLedgerEntry(),
    ]);
    await expect(
      Promise.resolve(
        service.writeFeedback("job-1", { message: "Persist in Python" }),
      ),
    ).resolves.toMatchObject({
      action: "write",
      resource: "feedback",
      source: "python-artifact-memory-runtime",
      persistenceOwner: "python",
      writeAccepted: true,
      feedback: [makeFeedback()],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(calls.map(call => call.url)).toEqual([
      "http://python-runtime.test/api/blueprint/spec-documents/artifact-memory/runtime",
      "http://python-runtime.test/api/blueprint/spec-documents/artifact-memory/runtime",
    ]);
    expect(calls[0].body).toMatchObject({
      action: "list",
      resource: "ledger",
      jobId: "job-1",
      projectId: "project-node",
      nodeControl: {
        routeShellOwner: "node",
        jobStoreOwner: "node",
        eventBusOwner: "node",
        externalStorageOwner: "none",
      },
    });
    expect(calls[1].body).toMatchObject({
      action: "write",
      resource: "feedback",
      item: {
        jobId: "job-1",
        kind: "feedback",
        message: "Persist in Python",
      },
    });
    expect(calls[1].body.item).toHaveProperty("id");
    expect(calls[1].body).not.toHaveProperty("request");
  });

  it("preserves Python failed runtime envelopes instead of falling back to Node success", async () => {
    vi.stubEnv("BLUEPRINT_ARTIFACT_MEMORY_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-runtime.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          runtimeEnvelope("failed", {
            ok: false,
            action: "list",
            resource: "ledger",
            error: "stale_scope",
            reason: "artifact_memory_scope_stale",
            message: "Artifact memory scope is stale.",
          }),
        ),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { service } = makeService();

    await expect(Promise.resolve(service.listLedger("job-1"))).resolves.toMatchObject({
      ok: false,
      status: "failed",
      statusCode: 409,
      error: "stale_scope",
      source: "python-artifact-memory-runtime",
    });
  });

  it("preserves Python not_found runtime envelopes instead of returning empty local arrays", async () => {
    vi.stubEnv("BLUEPRINT_ARTIFACT_MEMORY_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-runtime.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          runtimeEnvelope("not_found", {
            ok: false,
            action: "list",
            resource: "ledger",
            error: "not_found",
            reason: "artifact_memory_item_not_found",
            message: "Artifact memory item missing was not found.",
            found: false,
          }),
        ),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { service } = makeService();

    await expect(Promise.resolve(service.listLedger("missing"))).resolves.toMatchObject({
      ok: false,
      status: "not_found",
      statusCode: 404,
      error: "not_found",
      found: false,
      source: "python-artifact-memory-runtime",
    });
  });

  it("returns runtime_unavailable when Python runtime cannot be reached", async () => {
    vi.stubEnv("BLUEPRINT_ARTIFACT_MEMORY_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-runtime.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { service, logger } = makeService();

    await expect(Promise.resolve(service.listFeedback("job-1"))).resolves.toMatchObject({
      ok: false,
      status: "failed",
      statusCode: 503,
      error: "runtime_unavailable",
      reason: "python_runtime_failed",
      source: "node-artifact-memory-python-runtime",
      resource: "feedback",
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});
