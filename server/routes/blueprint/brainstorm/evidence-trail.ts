import type {
  BrainstormRoleId,
  BrainstormSession,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { ChecksLedgerService } from "../checks-ledger/types.js";

export interface BrainstormEvidence {
  artifactName: "brainstorm_evidence";
  sessionId: string;
  jobId: string;
  stageId: string;
  roundCount: number;
  finalConvergenceScore: number;
  interMemberReferences: Array<{
    fromRoleId: BrainstormRoleId;
    toRoleId: BrainstormRoleId;
  }>;
  status: "pass" | "fail";
  output: string;
}

export interface BuildBrainstormEvidenceInput {
  session: BrainstormSession;
  roundCount: number;
  finalConvergenceScore: number;
}

export interface WriteEvidenceToLedgerInput {
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
  evidence: BrainstormEvidence;
}

function collectInterMemberReferences(
  session: BrainstormSession,
): BrainstormEvidence["interMemberReferences"] {
  const members = Array.from(session.crewMembers.values());
  const roleIds = members.map((member) => member.roleId);
  const references: BrainstormEvidence["interMemberReferences"] = [];

  for (const member of members) {
    const content = member.output?.content.toLowerCase() ?? "";
    for (const roleId of roleIds) {
      if (roleId === member.roleId) continue;
      if (content.includes(roleId.toLowerCase())) {
        references.push({
          fromRoleId: member.roleId,
          toRoleId: roleId,
        });
      }
    }
  }

  return references;
}

export function buildBrainstormEvidence(
  input: BuildBrainstormEvidenceInput,
): BrainstormEvidence {
  const interMemberReferences = collectInterMemberReferences(input.session);
  const status =
    input.roundCount >= 2 && interMemberReferences.length > 0 ? "pass" : "fail";

  return {
    artifactName: "brainstorm_evidence",
    sessionId: input.session.id,
    jobId: input.session.jobId,
    stageId: input.session.stageId,
    roundCount: input.roundCount,
    finalConvergenceScore: input.finalConvergenceScore,
    interMemberReferences,
    status,
    output:
      status === "pass"
        ? `brainstorm evidence passed: ${input.roundCount} rounds, ${interMemberReferences.length} inter-member references`
        : `brainstorm evidence failed: ${input.roundCount} rounds, ${interMemberReferences.length} inter-member references`,
  };
}

export function writeEvidenceToLedger(
  input: WriteEvidenceToLedgerInput,
): void {
  try {
    input.checksLedger?.recordCheck({
      jobId: input.evidence.jobId,
      stage: "spec_docs",
      checkType: "brainstorm_deliberation",
      checkName: `brainstorm:evidence:${input.evidence.sessionId}`,
      status: input.evidence.status,
      validator: "brainstorm/orchestrator.ts",
      output: input.evidence.output,
      metadata: {
        artifactName: input.evidence.artifactName,
        sessionId: input.evidence.sessionId,
        stageId: input.evidence.stageId,
        roundCount: input.evidence.roundCount,
        finalConvergenceScore: input.evidence.finalConvergenceScore,
        interMemberReferences: input.evidence.interMemberReferences,
      },
    });
  } catch {
    // Ledger evidence must never block brainstorm completion.
  }
}

export interface WriteSynthesisAuditToLedgerInput {
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
  jobId: string;
  stageId: string;
  sessionId: string;
  audit: {
    status: "pass" | "needs_review";
    reasons: string[];
    unresolvedChallengeCount: number;
  };
}

/**
 * Write a primary-model synthesis audit result to the checks ledger. Reuses the
 * same ledger channel as `writeEvidenceToLedger`. `needs_review` maps to the
 * ledger `warn` status (the synthesis is surfaced for review without hard
 * failing the stage). Never throws — ledger writes must not block the pipeline.
 */
export function writeSynthesisAuditToLedger(
  input: WriteSynthesisAuditToLedgerInput,
): void {
  try {
    input.checksLedger?.recordCheck({
      jobId: input.jobId,
      stage: "spec_docs",
      checkType: "companion_trace",
      checkName: `brainstorm:synthesis-audit:${input.sessionId}`,
      status: input.audit.status === "pass" ? "pass" : "warn",
      validator: "brainstorm/synthesis-audit.ts",
      output:
        input.audit.reasons.length > 0
          ? input.audit.reasons.join("; ")
          : `synthesis audit ${input.audit.status}`,
      metadata: {
        artifactName: "brainstorm_synthesis_audit",
        sessionId: input.sessionId,
        stageId: input.stageId,
        auditStatus: input.audit.status,
        unresolvedChallengeCount: input.audit.unresolvedChallengeCount,
        reasons: input.audit.reasons,
      },
    });
  } catch {
    // Audit ledger writes must never block brainstorm completion.
  }
}
