import type {
  Action,
  GovernanceDecision,
  ResourceType,
} from "../../shared/permission/contracts.js";

const VECTOR_WRITE_PATTERN = /\bvector_(insert|update|delete)\b/i;
const TRANSACTION_FLOW_PATTERN = /\btransaction_flow\b/i;

export function evaluateGovernanceDecision(
  resourceType: ResourceType,
  action: Action,
  resource: string,
): GovernanceDecision | undefined {
  if (resourceType === "mcp_tool" && action === "call") {
    return {
      outcome: "approval_required",
      riskLevel: "critical",
      policyId: "security-governance.mcp-approval-gate",
      rationale: "MCP tool calls require manual approval and audit evidence before execution.",
      requiresAudit: true,
      specRefs: [
        "web-aigc-platform-security-governance#requirement-2",
        "web-aigc-platform-security-governance#requirement-4",
      ],
    };
  }

  if (
    resourceType === "database" &&
    (action === "insert" || action === "update" || action === "delete") &&
    VECTOR_WRITE_PATTERN.test(resource)
  ) {
    return {
      outcome: "approval_required",
      riskLevel: "critical",
      policyId: "security-governance.vector-write-gate",
      rationale: "Vector store write operations require manual approval before they can be executed.",
      requiresAudit: true,
      specRefs: [
        "web-aigc-platform-security-governance#requirement-2",
        "web-aigc-platform-security-governance#requirement-3",
      ],
    };
  }

  if (
    (resourceType === "api" || resourceType === "network" || resourceType === "database") &&
    TRANSACTION_FLOW_PATTERN.test(resource)
  ) {
    return {
      outcome: "approval_required",
      riskLevel: "critical",
      policyId: "security-governance.transaction-flow-gate",
      rationale: "Transaction flow operations require manual approval before they can be executed.",
      requiresAudit: true,
      specRefs: [
        "web-aigc-platform-security-governance#requirement-2",
        "web-aigc-platform-security-governance#requirement-4",
      ],
    };
  }

  return undefined;
}

export function isGovernanceBlockingDecision(
  decision: GovernanceDecision | undefined,
): boolean {
  return decision?.outcome === "approval_required" || decision?.outcome === "blocked";
}
