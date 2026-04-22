import { describe, expect, it, vi } from "vitest";

import type { PermissionCheckEngine } from "../permission/check-engine.js";
import type { AuditLogger } from "../permission/audit-logger.js";
import { VectorInsertAdapter } from "../web-aigc/vector-insert-adapter.js";
import type { IngestionPipeline } from "../rag/ingestion/ingestion-pipeline.js";
import type { MetadataStore } from "../rag/store/metadata-store.js";
import type { IngestionPayload } from "../../shared/rag/contracts.js";

function makePayload(overrides: Partial<IngestionPayload> = {}): IngestionPayload {
  return {
    sourceType: "document",
    sourceId: "source-1",
    projectId: "proj-1",
    content: "hello world",
    metadata: {},
    timestamp: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(overrides?: {
  permissionAllowed?: boolean;
  permissionReason?: string;
  ingestionResult?: {
    success: boolean;
    chunkCount: number;
    sourceId: string;
    deduplicated: boolean;
    error?: string;
  };
}) {
  const ingestionPipeline = {
    ingest: vi.fn(async () => overrides?.ingestionResult ?? {
      success: true,
      chunkCount: 2,
      sourceId: "source-1",
      deduplicated: false,
    }),
  } satisfies Pick<IngestionPipeline, "ingest">;

  const metadataStore = {
    getBySourceId: vi.fn(() => []),
  } satisfies Pick<MetadataStore, "getBySourceId">;

  const permissionEngine = {
    checkPermission: vi.fn(() => ({
      allowed: overrides?.permissionAllowed ?? true,
      reason: overrides?.permissionReason,
    })),
  } satisfies Pick<PermissionCheckEngine, "checkPermission">;

  const auditLogger = {
    log: vi.fn(),
  } satisfies Pick<AuditLogger, "log">;

  return {
    ingestionPipeline,
    metadataStore,
    permissionEngine,
    auditLogger,
  };
}

describe("VectorInsertAdapter", () => {
  it("completes vector insert when permission check passes", async () => {
    const deps = makeDeps();
    const adapter = new VectorInsertAdapter(deps as any);

    const result = await adapter.execute({
      agentId: "agent-1",
      token: "token-1",
      namespace: "tenant_alpha",
      payload: makePayload(),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.insertedRecords).toBe(2);
    expect(result.collection).toBe("rag_tenant_alpha_proj-1");
    expect(deps.permissionEngine.checkPermission).toHaveBeenCalledWith(
      "agent-1",
      "database",
      "insert",
      "tenant_alpha/rag_tenant_alpha_proj-1",
      "token-1",
    );
    expect(deps.metadataStore.getBySourceId).toHaveBeenCalledWith(
      "tenant_alpha:source-1",
    );
    expect(deps.ingestionPipeline.ingest).toHaveBeenCalledTimes(1);
    const payload = (deps.ingestionPipeline.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.sourceId).toBe("tenant_alpha:source-1");
    expect(payload.metadata.namespace).toBe("tenant_alpha");
    expect(payload.metadata.originalSourceId).toBe("source-1");
    expect(payload.metadata.targetCollection).toBe("rag_tenant_alpha_proj-1");
    expect(payload.metadata.riskAction).toBe("vector_insert");
  });

  it("returns denied when permission check fails", async () => {
    const deps = makeDeps({
      permissionAllowed: false,
      permissionReason: "No allow rule found for database:insert",
    });
    const adapter = new VectorInsertAdapter(deps as any);

    const result = await adapter.execute({
      agentId: "agent-1",
      token: "token-1",
      namespace: "tenant_alpha",
      payload: makePayload(),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("denied");
    expect(result.error).toContain("No allow rule found");
    expect(deps.ingestionPipeline.ingest).not.toHaveBeenCalled();
    expect(deps.auditLogger.log).toHaveBeenCalledTimes(1);
  });

  it("returns approval_required for high-risk inserts that request approval", async () => {
    const deps = makeDeps();
    const adapter = new VectorInsertAdapter(deps as any);

    const result = await adapter.execute({
      agentId: "agent-1",
      token: "token-1",
      namespace: "tenant_alpha",
      payload: makePayload(),
      requireApproval: true,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("approval_required");
    expect(result.governance.approval.required).toBe(true);
    expect(result.governance.approval.status).toBe("pending");
    expect(deps.ingestionPipeline.ingest).not.toHaveBeenCalled();
  });

  it("rejects invalid namespaces before executing", async () => {
    const deps = makeDeps();
    const adapter = new VectorInsertAdapter(deps as any);

    await expect(
      adapter.execute({
        agentId: "agent-1",
        token: "token-1",
        namespace: "../bad",
        payload: makePayload(),
      }),
    ).rejects.toThrow("namespace");

    expect(deps.permissionEngine.checkPermission).not.toHaveBeenCalled();
  });
});
