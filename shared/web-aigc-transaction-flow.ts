import type { RiskLevel } from "./permission/contracts.js";
import type {
  WebAigcApprovalMode,
  WebAigcPermissionBinding,
} from "./web-aigc-governance.js";

export const WEB_AIGC_TRANSACTION_FLOW_API = {
  EXECUTE: "POST /api/transaction-flow/nodes/execute",
} as const;

export type TransactionFlowNodeType = "transaction_flow";
export type TransactionFlowDecision = "approved" | "rejected";
export type TransactionFlowStatus =
  | "completed"
  | "degraded"
  | "denied"
  | "approval_required"
  | "failed";
export type TransactionFlowPythonStatus =
  | "approved"
  | "rejected"
  | "degraded"
  | "error";

export interface TransactionFlowAction {
  transactionId?: string;
  service?: string;
  action: string;
  resource: string;
  targetId?: string;
  summary?: string;
  amount?: number;
  currency?: string;
  parameters?: Record<string, unknown>;
  sideEffects?: string[];
}

export interface TransactionFlowApprovalInput {
  decision?: TransactionFlowDecision;
  actorId?: string;
  comment?: string;
  ticketId?: string;
  decisionId?: string;
  submittedAt?: string;
}

export interface TransactionFlowCompensationInput {
  strategy?: "manual_compensation" | "manual_rollback" | "none";
  summary?: string;
  steps?: string[];
  rollbackHint?: string;
}

export interface TransactionFlowExecutionInput {
  agentId?: string;
  token?: string;
  transaction?: TransactionFlowAction;
  context?: Record<string, unknown>;
  requireApproval?: boolean;
  approval?: TransactionFlowApprovalInput;
  compensation?: TransactionFlowCompensationInput;
  metadata?: Record<string, unknown>;
}

export interface TransactionFlowApprovalSnapshot {
  required: boolean;
  status: "pending" | "approved" | "rejected";
  source: WebAigcApprovalMode;
  prompt: string;
  decisionId: string;
  actorId?: string;
  comment?: string;
  ticketId?: string;
  submittedAt?: string;
}

export interface TransactionFlowGovernanceSnapshot {
  nodeType: TransactionFlowNodeType;
  riskLevel: RiskLevel;
  requiresAudit: boolean;
  approvalMode: WebAigcApprovalMode;
  permissionBinding?: WebAigcPermissionBinding;
  permission: {
    allowed: boolean;
    resource: string;
    reason?: string;
    suggestion?: string;
  };
  specRefs: string[];
}

export interface TransactionFlowAuditSnapshot {
  logged: boolean;
  auditEntryId: string;
  operation: "transaction_flow";
  eventKey:
    | "node.waiting_input"
    | "human.approved"
    | "human.rejected"
    | "node.failed";
  summary: string;
  timestamp: string;
  decisionId: string;
}

export interface TransactionFlowRuntimeMetadata {
  backend: "python" | string;
  provider: "fake" | string;
  source: string;
  externalCalls: boolean;
  executedTransaction: boolean;
  persisted: boolean;
}

export interface TransactionFlowRuntimeError {
  code: string;
  message: string;
}

export interface TransactionFlowRuntimeAnalysis {
  transactionId: string;
  service: string;
  action: string;
  resource: string;
  targetId?: string;
  riskLevel: RiskLevel;
  sideEffectCount: number;
  summary: string;
}

export interface TransactionFlowRuntimeDecision {
  approved: boolean;
  reason: string;
  decisionId: string;
  actorId?: string;
  ticketId?: string;
}

export interface TransactionFlowRuntimePermission {
  allowed: boolean;
  resource: string;
  reason?: string;
  suggestion?: string;
  governance?: {
    outcome: "allowed" | "blocked" | "approval_required";
    riskLevel: RiskLevel;
    policyId: string;
    rationale: string;
    requiresAudit: boolean;
    specRefs?: string[];
  };
}

export interface TransactionFlowPythonRuntimeResponse {
  contractVersion?: string;
  ok: boolean;
  status: TransactionFlowPythonStatus;
  analysis?: TransactionFlowRuntimeAnalysis;
  decision?: TransactionFlowRuntimeDecision;
  permission?: TransactionFlowRuntimePermission;
  audit?: TransactionFlowAuditSnapshot;
  warnings?: string[];
  error?: TransactionFlowRuntimeError;
  runtime?: TransactionFlowRuntimeMetadata;
  metadata?: Record<string, unknown>;
}

export interface TransactionFlowCompensationPlan {
  strategy: "manual_compensation" | "manual_rollback" | "none";
  summary: string;
  steps: string[];
  rollbackHint: string;
}

export interface TransactionFlowExecutionSummary {
  transactionId: string;
  mutationKey: string;
  executedAt: string;
  state: "committed";
  service: string;
  action: string;
  resource: string;
  targetId?: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface TransactionFlowNodeOutput {
  status: TransactionFlowStatus;
  pythonStatus?: TransactionFlowPythonStatus;
  transaction: TransactionFlowAction & { transactionId: string; service: string };
  governance: TransactionFlowGovernanceSnapshot;
  approval: TransactionFlowApprovalSnapshot;
  audit: TransactionFlowAuditSnapshot;
  compensation: TransactionFlowCompensationPlan;
  analysis?: TransactionFlowRuntimeAnalysis;
  runtime?: TransactionFlowRuntimeMetadata;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  result?: TransactionFlowExecutionSummary;
  error?: string;
}

export interface TransactionFlowNodeExecutionRequest {
  nodeType: TransactionFlowNodeType;
  input?: TransactionFlowExecutionInput;
}

export interface TransactionFlowNodeExecutionResult {
  ok: boolean;
  nodeType: TransactionFlowNodeType;
  output: TransactionFlowNodeOutput;
}
