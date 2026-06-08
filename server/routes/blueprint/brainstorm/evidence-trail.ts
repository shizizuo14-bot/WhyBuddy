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
