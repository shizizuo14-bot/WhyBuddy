import type { IngestionPayload, SourceType } from "./rag/contracts.js";
import type { RiskLevel } from "./permission/contracts.js";

export const WEB_AIGC_RISK_ACTION_API = {
  VECTOR_INSERT: "POST /api/rag/risk-actions/vector-insert",
} as const;

export interface VectorInsertActionInput {
  agentId: string;
  token: string;
  namespace: string;
  collection?: string;
  payload: IngestionPayload;
  requireApproval?: boolean;
  metadata?: Record<string, unknown>;
}

export interface VectorInsertGovernanceSnapshot {
  namespace: string;
  collection: string;
  resource: string;
  riskLevel: RiskLevel;
  permission: {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
  };
  approval: {
    required: boolean;
    status: "not_required" | "pending" | "approved";
  };
}

export interface VectorInsertActionResult {
  ok: boolean;
  action: "vector_insert";
  namespace: string;
  collection: string;
  sourceId: string;
  sourceType: SourceType;
  insertedRecords: number;
  deduplicated: boolean;
  status: "completed" | "denied" | "approval_required" | "unavailable" | "failed";
  governance: VectorInsertGovernanceSnapshot;
  error?: string;
}
