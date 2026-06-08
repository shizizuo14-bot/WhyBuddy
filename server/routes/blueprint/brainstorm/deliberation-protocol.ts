import type {
  BrainstormRoleId,
  BrainstormSession,
  CrewMemberInstance,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { EventEmitterFn } from "./orchestrator.js";

export interface ChallengeRecord {
  id: string;
  challengerRoleId: BrainstormRoleId;
  targetRoleId: BrainstormRoleId;
  summary: string;
  roundNumber: number;
  unresolvedRounds: number;
}

export interface RebuttalRecord {
  id: string;
  challengeId: string;
  responderRoleId: BrainstormRoleId;
  summary: string;
  confidenceAdjustment: number;
}

export interface DeliberationMemberOutput {
  roleId: BrainstormRoleId;
  content: string;
  referencedMembers: BrainstormRoleId[];
  agreementPoints: string[];
  challenges: string[];
}

export interface DeliberationRound {
  roundNumber: number;
  memberOutputs: DeliberationMemberOutput[];
  convergenceScore: number;
  challenges: ChallengeRecord[];
  rebuttals: RebuttalRecord[];
}

export interface DeliberationConfig {
  minRounds: number;
  maxRounds: number;
  convergenceThreshold: number;
}

export interface DeliberationResult {
  rounds: DeliberationRound[];
  finalConvergenceScore: number;
  consensusAchieved: boolean;
  totalChallenges: number;
  unresolvedChallenges: ChallengeRecord[];
  dissentingOpinions: Array<{
    roleId: BrainstormRoleId;
    opinion: string;
    challengeId: string;
  }>;
}

export interface ExecuteDeliberationInput {
  session: BrainstormSession;
  stageContext: string;
  executeMember(
    member: CrewMemberInstance,
    context: string,
  ): Promise<void>;
  emitEvent: EventEmitterFn;
  config?: Partial<DeliberationConfig>;
}

const DEFAULT_CONFIG: DeliberationConfig = {
  minRounds: 2,
  maxRounds: 5,
  convergenceThreshold: 0.7,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function uniqueRoleIds(values: BrainstormRoleId[]): BrainstormRoleId[] {
  return [...new Set(values)];
}

export function computeConvergenceScore(
  memberOutputs: readonly DeliberationMemberOutput[],
): number {
  if (memberOutputs.length < 2) return 1;

  let totalPairs = 0;
  let scoreSum = 0;

  for (let i = 0; i < memberOutputs.length; i++) {
    for (let j = i + 1; j < memberOutputs.length; j++) {
      totalPairs++;
      const left = memberOutputs[i];
      const right = memberOutputs[j];
      const leftReferencesRight = left.referencedMembers.includes(right.roleId);
      const rightReferencesLeft = right.referencedMembers.includes(left.roleId);
      const crossReference = leftReferencesRight || rightReferencesLeft;
      const sharedAgreements = left.agreementPoints.filter((point) =>
        right.agreementPoints.includes(point),
      ).length;
      const maxAgreementCount = Math.max(
        left.agreementPoints.length,
        right.agreementPoints.length,
        1,
      );
      const hasChallenge =
        left.challenges.length > 0 || right.challenges.length > 0;

      scoreSum += clamp01(
        sharedAgreements / maxAgreementCount +
          (crossReference ? 0.3 : 0) -
          (hasChallenge ? 0.2 : 0),
      );
    }
  }

  return totalPairs === 0 ? 1 : clamp01(scoreSum / totalPairs);
}

function extractAgreementPoints(content: string): string[] {
  const matches = content.match(/\bagree(?:ment)?[:\s-]+([^.;\n]+)/gi) ?? [];
  return matches.map((match) => match.trim().toLowerCase()).slice(0, 5);
}

function outputFromMember(
  member: CrewMemberInstance,
  allRoleIds: BrainstormRoleId[],
): DeliberationMemberOutput {
  const content = member.output?.content ?? "";
  const lower = content.toLowerCase();
  const referencedMembers = allRoleIds.filter(
    (roleId) => roleId !== member.roleId && lower.includes(roleId),
  );
  const challenges =
    content.match(/\b(?:challenge|disagree|risk|concern)[:\s-]+([^.;\n]+)/gi) ??
    [];

  return {
    roleId: member.roleId,
    content,
    referencedMembers: uniqueRoleIds(referencedMembers),
    agreementPoints: extractAgreementPoints(content),
    challenges: challenges.map((challenge) => challenge.trim()).slice(0, 5),
  };
}

function buildRoundContext(
  stageContext: string,
  priorRounds: readonly DeliberationRound[],
): string {
  if (priorRounds.length === 0) {
    return stageContext;
  }

  const prior = priorRounds
    .flatMap((round) =>
      round.memberOutputs.map(
        (output) =>
          `Round ${round.roundNumber} [${output.roleId}]: ${output.content}`,
      ),
    )
    .join("\n---\n");

  return `${stageContext}\n\nPrior deliberation outputs:\n${prior}\n\nReference, agree with, or challenge specific prior points.`;
}

function challengesFromOutputs(
  outputs: readonly DeliberationMemberOutput[],
  roundNumber: number,
): ChallengeRecord[] {
  const records: ChallengeRecord[] = [];
  for (const output of outputs) {
    for (const [index, summary] of output.challenges.entries()) {
      const targetRoleId =
        output.referencedMembers[0] ??
        outputs.find((candidate) => candidate.roleId !== output.roleId)?.roleId;
      if (!targetRoleId) continue;
      records.push({
        id: `challenge:${roundNumber}:${output.roleId}:${index}`,
        challengerRoleId: output.roleId,
        targetRoleId,
        summary,
        roundNumber,
        unresolvedRounds: 1,
      });
    }
  }
  return records;
}

function normalizeChallengeSummary(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/\b(?:challenge|disagree|risk|concern)[:\s-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function areSameChallenge(left: ChallengeRecord, right: ChallengeRecord): boolean {
  return (
    left.challengerRoleId === right.challengerRoleId &&
    left.targetRoleId === right.targetRoleId &&
    normalizeChallengeSummary(left.summary) === normalizeChallengeSummary(right.summary)
  );
}

function findPriorChallenge(
  challenge: ChallengeRecord,
  priorChallenges: readonly ChallengeRecord[],
): ChallengeRecord | undefined {
  return priorChallenges.find((prior) => areSameChallenge(prior, challenge));
}

function findRebuttalsForPriorChallenges(
  outputs: readonly DeliberationMemberOutput[],
  priorChallenges: readonly ChallengeRecord[],
): RebuttalRecord[] {
  const rebuttals: RebuttalRecord[] = [];
  for (const challenge of priorChallenges) {
    const responder = outputs.find(
      (output) =>
        output.roleId === challenge.targetRoleId &&
        output.referencedMembers.includes(challenge.challengerRoleId),
    );
    if (!responder) continue;
    const content = responder.content.trim();
    if (!content) continue;
    rebuttals.push({
      id: `rebuttal:${challenge.id}:${rebuttals.length}`,
      challengeId: challenge.id,
      responderRoleId: responder.roleId,
      summary: content.slice(0, 500),
      confidenceAdjustment: content.match(/\b(?:resolved|mitigated|addressed)\b/i)
        ? 0.2
        : 0,
    });
  }
  return rebuttals;
}

export async function executeDeliberation(
  input: ExecuteDeliberationInput,
): Promise<DeliberationResult> {
  const config = { ...DEFAULT_CONFIG, ...input.config };
  const rounds: DeliberationRound[] = [];
  const members = Array.from(input.session.crewMembers.values());
  const roleIds = members.map((member) => member.roleId);
  const activeChallenges: ChallengeRecord[] = [];

  const maxRounds = Math.max(config.minRounds, config.maxRounds);

  for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber++) {
    if (input.session.status !== "active") break;
    if (input.session.tokenUsed >= input.session.tokenBudget) break;

    const context = buildRoundContext(input.stageContext, rounds);
    let executedMemberCount = 0;
    for (const member of members) {
      if (input.session.status !== "active") break;
      if (input.session.tokenUsed >= input.session.tokenBudget) break;
      if (member.state === "failed") continue;
      await input.executeMember(member, context);
      executedMemberCount++;
    }
    if (executedMemberCount === 0) break;

    const memberOutputs = members.map((member) =>
      outputFromMember(member, roleIds),
    );
    const convergenceScore = computeConvergenceScore(memberOutputs);
    const rawChallenges = challengesFromOutputs(memberOutputs, roundNumber);
    const rebuttals = findRebuttalsForPriorChallenges(
      memberOutputs,
      activeChallenges,
    );
    const resolvedChallengeIds = new Set(
      rebuttals
        .filter((rebuttal) => rebuttal.confidenceAdjustment > 0)
        .map((rebuttal) => rebuttal.challengeId),
    );
    const challenges: ChallengeRecord[] = [];
    for (const rawChallenge of rawChallenges) {
      const prior = findPriorChallenge(rawChallenge, activeChallenges);
      if (prior) {
        prior.unresolvedRounds += 1;
        prior.roundNumber = Math.min(prior.roundNumber, rawChallenge.roundNumber);
        challenges.push({ ...prior });
      } else {
        activeChallenges.push(rawChallenge);
        challenges.push(rawChallenge);
      }
    }
    for (let i = activeChallenges.length - 1; i >= 0; i--) {
      if (resolvedChallengeIds.has(activeChallenges[i].id)) {
        activeChallenges.splice(i, 1);
      }
    }
    const round: DeliberationRound = {
      roundNumber,
      memberOutputs,
      convergenceScore,
      challenges,
      rebuttals,
    };
    rounds.push(round);

    input.emitEvent("brainstorm.round.completed", {
      sessionId: input.session.id,
      jobId: input.session.jobId,
      stageId: input.session.stageId,
      roundNumber,
      participatingRoleIds: roleIds,
      convergenceScore,
      challengesThisRound: challenges.length,
    });

    for (const challenge of challenges) {
      input.emitEvent("brainstorm.challenge.issued", {
        sessionId: input.session.id,
        jobId: input.session.jobId,
        stageId: input.session.stageId,
        challengerRoleId: challenge.challengerRoleId,
        targetRoleId: challenge.targetRoleId,
        challengeSummary: challenge.summary,
        roundNumber,
      });
    }

    if (
      roundNumber >= config.minRounds &&
      convergenceScore > config.convergenceThreshold
    ) {
      break;
    }
  }

  const finalRound = rounds[rounds.length - 1];
  const finalConvergenceScore = finalRound?.convergenceScore ?? 0;
  const allChallenges = rounds.flatMap((round) => round.challenges);
  const unresolvedChallenges = activeChallenges.filter(
    (challenge) => challenge.unresolvedRounds >= 2,
  );

  return {
    rounds,
    finalConvergenceScore,
    consensusAchieved: finalConvergenceScore > config.convergenceThreshold,
    totalChallenges: allChallenges.length,
    unresolvedChallenges,
    dissentingOpinions: unresolvedChallenges.map((challenge) => ({
      roleId: challenge.challengerRoleId,
      opinion: challenge.summary,
      challengeId: challenge.id,
    })),
  };
}
