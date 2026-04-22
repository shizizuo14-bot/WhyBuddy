import type {
  Action,
  ResourceType,
  RiskLevel,
} from "./permission/contracts.js";

export const WEB_AIGC_APPROVAL_MODES = [
  "none",
  "embedded_hitl",
  "manual_gate",
] as const;

export type WebAigcApprovalMode =
  (typeof WEB_AIGC_APPROVAL_MODES)[number];

export interface WebAigcPermissionBinding {
  resourceType: ResourceType;
  action: Action;
  resource: string;
}

export interface WebAigcPlatformPermissionMatrixEntry {
  operationId: string;
  title: string;
  description: string;
  permission: WebAigcPermissionBinding;
  riskLevel: RiskLevel;
  requiresAudit: boolean;
  approvalMode: WebAigcApprovalMode;
  specRefs: string[];
}

export interface WebAigcNodeRiskLevelEntry {
  nodeType: string;
  category:
    | "control_plane"
    | "human_in_the_loop"
    | "generation"
    | "retrieval"
    | "external_call"
    | "data_write";
  riskLevel: RiskLevel;
  requiresAudit: boolean;
  approvalMode: WebAigcApprovalMode;
  permission?: WebAigcPermissionBinding;
  notes: string;
  specRefs: string[];
}

export const WEB_AIGC_PLATFORM_PERMISSION_MATRIX: WebAigcPlatformPermissionMatrixEntry[] = [
  {
    operationId: "definition.manage",
    title: "Manage workflow definitions",
    description:
      "Create or update workflow definitions, node schemas, and orchestration metadata.",
    permission: {
      resourceType: "filesystem",
      action: "write",
      resource: "workflow_definition",
    },
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "none",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-1",
    ],
  },
  {
    operationId: "runtime.execute",
    title: "Execute workflow runtime",
    description:
      "Start a workflow instance or resume runtime execution through the operator surface.",
    permission: {
      resourceType: "api",
      action: "call",
      resource: "workflow_runtime",
    },
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "none",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-1",
    ],
  },
  {
    operationId: "runtime.terminate",
    title: "Terminate workflow instance",
    description:
      "Force terminate a running workflow instance from monitoring or operator APIs.",
    permission: {
      resourceType: "api",
      action: "call",
      resource: "workflow_terminate",
    },
    riskLevel: "high",
    requiresAudit: true,
    approvalMode: "embedded_hitl",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-1",
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    operationId: "version.publish",
    title: "Publish workflow version",
    description:
      "Publish a workflow version or rollout a migration slice into the active catalog.",
    permission: {
      resourceType: "api",
      action: "call",
      resource: "workflow_publish",
    },
    riskLevel: "high",
    requiresAudit: true,
    approvalMode: "embedded_hitl",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-1",
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    operationId: "runtime.resume",
    title: "Resume waiting workflow",
    description:
      "Resume an instance that is waiting for input, approval, or manual intervention.",
    permission: {
      resourceType: "api",
      action: "call",
      resource: "workflow_resume",
    },
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "embedded_hitl",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-1",
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    operationId: "session.review",
    title: "Review session evidence",
    description:
      "Read workflow session traces, human decisions, and replay-linked conversation evidence.",
    permission: {
      resourceType: "database",
      action: "select",
      resource: "session_trace",
    },
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "none",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-3",
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
];

export const WEB_AIGC_NODE_RISK_LEVELS: WebAigcNodeRiskLevelEntry[] = [
  {
    nodeType: "llm",
    category: "generation",
    riskLevel: "low",
    requiresAudit: false,
    approvalMode: "none",
    notes: "Default generation node with standard replay evidence.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-2",
    ],
  },
  {
    nodeType: "dialogue",
    category: "generation",
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "none",
    notes: "Conversation output should retain session and replay evidence.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-3",
    ],
  },
  {
    nodeType: "knowledge_qa",
    category: "retrieval",
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "none",
    notes: "Retrieval nodes should keep citation and source tracing evidence.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-3",
    ],
  },
  {
    nodeType: "user_input",
    category: "human_in_the_loop",
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "embedded_hitl",
    notes: "Human input nodes require wait/resume evidence and submission audit.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    nodeType: "selection",
    category: "human_in_the_loop",
    riskLevel: "medium",
    requiresAudit: true,
    approvalMode: "embedded_hitl",
    notes: "Selection nodes act as operator checkpoints inside the runtime graph.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    nodeType: "confirm_judge",
    category: "human_in_the_loop",
    riskLevel: "high",
    requiresAudit: true,
    approvalMode: "embedded_hitl",
    notes: "Approval and rejection branches must remain attributable to a human actor.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    nodeType: "mcp",
    category: "external_call",
    riskLevel: "critical",
    requiresAudit: true,
    approvalMode: "manual_gate",
    permission: {
      resourceType: "mcp_tool",
      action: "call",
      resource: "mcp",
    },
    notes: "MCP tool calls must pass a manual approval gate before execution.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-2",
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    nodeType: "transaction_flow",
    category: "external_call",
    riskLevel: "critical",
    requiresAudit: true,
    approvalMode: "manual_gate",
    permission: {
      resourceType: "api",
      action: "call",
      resource: "transaction_flow",
    },
    notes: "Transaction flows can mutate external systems and require approval plus audit.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-2",
      "web-aigc-platform-security-governance#requirement-4",
    ],
  },
  {
    nodeType: "vector_insert",
    category: "data_write",
    riskLevel: "critical",
    requiresAudit: true,
    approvalMode: "manual_gate",
    permission: {
      resourceType: "database",
      action: "insert",
      resource: "vector_insert",
    },
    notes: "Vector writes require namespace isolation, audit, and a manual gate.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-2",
      "web-aigc-platform-security-governance#requirement-3",
    ],
  },
  {
    nodeType: "vector_update",
    category: "data_write",
    riskLevel: "critical",
    requiresAudit: true,
    approvalMode: "manual_gate",
    permission: {
      resourceType: "database",
      action: "update",
      resource: "vector_update",
    },
    notes: "Vector updates require the same governance as vector inserts.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-2",
      "web-aigc-platform-security-governance#requirement-3",
    ],
  },
  {
    nodeType: "vector_delete",
    category: "data_write",
    riskLevel: "critical",
    requiresAudit: true,
    approvalMode: "manual_gate",
    permission: {
      resourceType: "database",
      action: "delete",
      resource: "vector_delete",
    },
    notes: "Vector deletes must leave a strong audit and recovery trail.",
    specRefs: [
      "web-aigc-platform-security-governance#requirement-2",
      "web-aigc-platform-security-governance#requirement-3",
    ],
  },
];

export function getWebAigcNodeRiskEntry(
  nodeType: string,
): WebAigcNodeRiskLevelEntry | undefined {
  return WEB_AIGC_NODE_RISK_LEVELS.find(entry => entry.nodeType === nodeType);
}
