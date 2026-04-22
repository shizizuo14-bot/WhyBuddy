import type {
  PermissionCheckResult,
  RiskLevel,
} from "../../shared/permission/contracts.js";
import type {
  VectorInsertActionInput,
  VectorInsertActionResult,
} from "../../shared/web-aigc-risk-actions.js";
import type { PermissionCheckEngine } from "../permission/check-engine.js";
import type { AuditLogger } from "../permission/audit-logger.js";
import type { IngestionPipeline } from "../rag/ingestion/ingestion-pipeline.js";
import type { MetadataStore } from "../rag/store/metadata-store.js";

export interface VectorInsertAdapterDeps {
  ingestionPipeline: IngestionPipeline;
  metadataStore: MetadataStore;
  permissionEngine: PermissionCheckEngine;
  auditLogger: AuditLogger;
}

const NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{1,127}$/;
const COLLECTION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/;

function sanitizeNamespace(namespace: string): string {
  const value = namespace.trim();
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new Error(
      "namespace must be 2-128 chars and only contain letters, numbers, colon, underscore, or hyphen",
    );
  }
  return value;
}

function namespaceToCollectionSegment(namespace: string): string {
  return namespace.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function sanitizeCollection(
  collection: string | undefined,
  namespace: string,
  projectId: string,
): string {
  const fallback = `rag_${namespaceToCollectionSegment(namespace)}_${projectId}`;
  const value = (collection ?? fallback).trim();
  if (!COLLECTION_PATTERN.test(value)) {
    throw new Error(
      "collection must be 2-128 chars and only contain letters, numbers, underscore, or hyphen",
    );
  }
  return value;
}

function namespaceResource(namespace: string, collection: string): string {
  return `${namespace}/${collection}`;
}

function namespacedSourceId(namespace: string, sourceId: string): string {
  return `${namespace}:${sourceId}`;
}

function inferRiskLevel(input: VectorInsertActionInput): RiskLevel {
  if (input.requireApproval) return "high";
  return "medium";
}

function buildPermissionReason(result: PermissionCheckResult): {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
} {
  return {
    allowed: result.allowed,
    reason: result.reason,
    suggestion: result.suggestion,
  };
}

export class VectorInsertAdapter {
  constructor(private readonly deps: VectorInsertAdapterDeps) {}

  async execute(input: VectorInsertActionInput): Promise<VectorInsertActionResult> {
    const namespace = sanitizeNamespace(input.namespace);
    const collection = sanitizeCollection(
      input.collection,
      namespace,
      input.payload.projectId,
    );
    const resource = namespaceResource(namespace, collection);
    const riskLevel = inferRiskLevel(input);
    const scopedSourceId = namespacedSourceId(namespace, input.payload.sourceId);

    const permission = this.deps.permissionEngine.checkPermission(
      input.agentId,
      "database",
      "insert",
      resource,
      input.token,
    );

    if (!permission.allowed) {
      this.deps.auditLogger.log({
        agentId: input.agentId,
        operation: "vector_insert",
        resourceType: "database",
        action: "insert",
        resource,
        result: "denied",
        reason: permission.reason ?? "Permission denied",
        metadata: {
          namespace,
          collection,
          sourceId: input.payload.sourceId,
          sourceType: input.payload.sourceType,
          projectId: input.payload.projectId,
          riskLevel,
          governanceHook: "permission-engine",
        },
      });

      return {
        ok: false,
        action: "vector_insert",
        namespace,
        collection,
        sourceId: input.payload.sourceId,
        sourceType: input.payload.sourceType,
        insertedRecords: 0,
        deduplicated: false,
        status: "denied",
        error: permission.reason ?? "Permission denied",
        governance: {
          namespace,
          collection,
          resource,
          riskLevel,
          permission: buildPermissionReason(permission),
          approval: {
            required: false,
            status: "not_required",
          },
        },
      };
    }

    if (input.requireApproval) {
      this.deps.auditLogger.log({
        agentId: input.agentId,
        operation: "vector_insert",
        resourceType: "database",
        action: "insert",
        resource,
        result: "denied",
        reason: "High-risk vector insert requires approval",
        metadata: {
          namespace,
          collection,
          sourceId: input.payload.sourceId,
          sourceType: input.payload.sourceType,
          projectId: input.payload.projectId,
          riskLevel,
          governanceHook: "approval-gate",
        },
      });

      return {
        ok: false,
        action: "vector_insert",
        namespace,
        collection,
        sourceId: input.payload.sourceId,
        sourceType: input.payload.sourceType,
        insertedRecords: 0,
        deduplicated: false,
        status: "approval_required",
        error: "High-risk vector insert requires approval",
        governance: {
          namespace,
          collection,
          resource,
          riskLevel,
          permission: buildPermissionReason(permission),
          approval: {
            required: true,
            status: "pending",
          },
        },
      };
    }

    const existing = this.deps.metadataStore.getBySourceId(scopedSourceId);
    const namespacedPayload = {
      ...input.payload,
      sourceId: scopedSourceId,
      metadata: {
        ...(input.payload.metadata ?? {}),
        namespace,
        originalSourceId: input.payload.sourceId,
        targetCollection: collection,
        riskAction: "vector_insert",
        ...(input.metadata ?? {}),
      },
    };

    try {
      const ingestion = await this.deps.ingestionPipeline.ingest(namespacedPayload);

      this.deps.auditLogger.log({
        agentId: input.agentId,
        operation: "vector_insert",
        resourceType: "database",
        action: "insert",
        resource,
        result: ingestion.success ? "allowed" : "error",
        reason: ingestion.success ? undefined : ingestion.error,
        metadata: {
          namespace,
          collection,
          sourceId: input.payload.sourceId,
          scopedSourceId,
          sourceType: input.payload.sourceType,
          projectId: input.payload.projectId,
          insertedRecords: ingestion.chunkCount,
          deduplicated: ingestion.deduplicated,
          existingRecordCount: existing.length,
          riskLevel,
          governanceHook: "permission-engine",
        },
      });

      return {
        ok: ingestion.success,
        action: "vector_insert",
        namespace,
        collection,
        sourceId: input.payload.sourceId,
        sourceType: input.payload.sourceType,
        insertedRecords: ingestion.chunkCount,
        deduplicated: ingestion.deduplicated,
        status: ingestion.success ? "completed" : "failed",
        error: ingestion.error,
        governance: {
          namespace,
          collection,
          resource,
          riskLevel,
          permission: buildPermissionReason(permission),
          approval: {
            required: false,
            status: "not_required",
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.auditLogger.log({
        agentId: input.agentId,
        operation: "vector_insert",
        resourceType: "database",
        action: "insert",
        resource,
        result: "error",
        reason: message,
        metadata: {
          namespace,
          collection,
          sourceId: input.payload.sourceId,
          scopedSourceId,
          sourceType: input.payload.sourceType,
          projectId: input.payload.projectId,
          riskLevel,
          governanceHook: "ingestion-pipeline",
        },
      });

      return {
        ok: false,
        action: "vector_insert",
        namespace,
        collection,
        sourceId: input.payload.sourceId,
        sourceType: input.payload.sourceType,
        insertedRecords: 0,
        deduplicated: false,
        status: "failed",
        error: message,
        governance: {
          namespace,
          collection,
          resource,
          riskLevel,
          permission: buildPermissionReason(permission),
          approval: {
            required: false,
            status: "not_required",
          },
        },
      };
    }
  }
}
