import type {
  AdjudicationResult,
  BrainstormRoleId,
  BrainstormSession,
  BrainstormTopology,
  CrewMemberInstance,
  Critique,
  CritiqueSeverity,
  Rebuttal,
  RebuttalStance,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type {
  BrainstormDecisionMarker,
  BrainstormRuntimeGraphEvent,
} from "../../../../shared/blueprint/brainstorm-runtime-graph.js";
import type { AdjudicatorFn } from "./adjudicator.js";
import type { EventEmitterFn } from "./orchestrator.js";

export interface ChallengeRecord {
  id: string;
  challengerRoleId: BrainstormRoleId;
  targetRoleId: BrainstormRoleId;
  summary: string;
  roundNumber: number;
  unresolvedRounds: number;
  /**
   * Severity carried from the structured {@link Critique} that produced this
   * record (autopilot-brainstorm-real-collaboration, Task 6.1). Additive and
   * optional — left `undefined` by the legacy heuristic path so the wall
   * projection (Task 9.1) can read it when present without breaking back-compat.
   */
  severity?: CritiqueSeverity;
  /**
   * The specific target-role claim the structured critique referenced. Additive
   * and optional; only populated on the structured collaboration path.
   */
  targetClaim?: string;
}

export interface RebuttalRecord {
  id: string;
  challengeId: string;
  responderRoleId: BrainstormRoleId;
  summary: string;
  confidenceAdjustment: number;
  /**
   * Stance carried from the structured {@link Rebuttal} that produced this
   * record (autopilot-brainstorm-real-collaboration, Task 6.1). Additive and
   * optional — left `undefined` by the legacy heuristic path so the wall
   * projection (Task 9.1) can distinguish "concede" vs "defend" when present.
   */
  stance?: RebuttalStance;
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
  // ─── Real structured collaboration inputs (Task 6.1) ───────────────────
  // All OPTIONAL and backward compatible. When the structured callers /
  // adjudicator are ABSENT, or the topology is missing / unexecutable, the
  // engine runs the retained LEGACY heuristic path so behavior degrades to
  // exactly the current implementation (R9.4).
  /** Resolved interaction topology (who critiques whom, who synthesizes). */
  topology?: BrainstormTopology;
  /** Aux-pool caller producing a structured Critique per challenger→target edge. */
  critiqueCaller?: StructuredCritiqueCaller;
  /** Aux-pool caller producing a structured Rebuttal from the target role. */
  rebuttalCaller?: StructuredRebuttalCaller;
  /** Primary-model (gpt-5.5) adjudicator deciding round consensus/convergence. */
  adjudicator?: AdjudicatorFn;
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

/**
 * FALLBACK-ONLY (Task 6.1): legacy text-similarity convergence heuristic.
 * Retained solely for the degraded deliberation path used when the structured
 * collaboration callers / adjudicator are unavailable (R9.4). The real
 * convergence verdict comes from the primary-model {@link AdjudicatorFn}.
 */
export function legacyComputeConvergenceScore(
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

/**
 * Back-compat alias for {@link legacyComputeConvergenceScore}. Preserved so the
 * existing deliberation property test keeps importing `computeConvergenceScore`.
 * @deprecated Use {@link legacyComputeConvergenceScore} (fallback-only) or the
 * primary-model adjudicator for real convergence verdicts.
 */
export const computeConvergenceScore = legacyComputeConvergenceScore;

function extractAgreementPoints(content: string): string[] {
  const matches = content.match(/\bagree(?:ment)?[:\s-]+([^.;\n]+)/gi) ?? [];
  return matches.map((match) => match.trim().toLowerCase()).slice(0, 5);
}

/**
 * FALLBACK-ONLY (Task 6.1): legacy keyword-regex derivation of a member's
 * self-reported challenges / references. Retained only for the degraded path
 * (R9.4). The structured path NEVER uses this — it issues real Critiques per
 * topology edge instead of scraping the agent's own text (R1.5).
 */
function legacyOutputFromMember(
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

/**
 * FALLBACK-ONLY (Task 6.1): legacy conversion of regex-derived self-challenges
 * into {@link ChallengeRecord}s. Retained only for the degraded path (R9.4).
 */
function legacyChallengesFromOutputs(
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

/**
 * FALLBACK-ONLY (Task 6.1): legacy heuristic that infers rebuttals when a
 * target role's text mentions the challenger plus a resolution keyword.
 * Retained only for the degraded path (R9.4). The structured path issues a real
 * Rebuttal LLM call per Critique instead.
 */
function legacyFindRebuttalsForPriorChallenges(
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

function emitRuntimeGraphEvent(
  emitEvent: EventEmitterFn,
  event: BrainstormRuntimeGraphEvent,
): void {
  emitEvent(event.type, { ...event });
}

function emitDeliberationMarker(input: {
  emitEvent: EventEmitterFn;
  session: BrainstormSession;
  marker: BrainstormDecisionMarker;
  roleId: BrainstormRoleId;
  targetRoleId: BrainstormRoleId;
  nodeId: string;
  roundNumber: number;
  summary: string;
}): void {
  emitRuntimeGraphEvent(input.emitEvent, {
    id: `${input.marker.toLowerCase()}:${input.session.id}:${input.nodeId}`,
    type: "decision.marker.emitted",
    jobId: input.session.jobId,
    sessionId: input.session.id,
    stage: input.session.stageId,
    occurredAt: new Date().toISOString(),
    roleId: input.roleId,
    nodeId: input.nodeId,
    roundNumber: input.roundNumber,
    marker: input.marker,
    targetRoleId: input.targetRoleId,
    rationale: input.summary,
    summary: input.summary,
  });
}

function emitDeliberationEdge(input: {
  emitEvent: EventEmitterFn;
  session: BrainstormSession;
  edgeId: string;
  sourceRoleId: BrainstormRoleId;
  targetRoleId: BrainstormRoleId;
  roundNumber: number;
  reason: string;
}): void {
  emitRuntimeGraphEvent(input.emitEvent, {
    id: `${input.edgeId}:${input.session.id}`,
    type: "edge.triggered",
    jobId: input.session.jobId,
    sessionId: input.session.id,
    stage: input.session.stageId,
    occurredAt: new Date().toISOString(),
    roleId: input.sourceRoleId,
    roundNumber: input.roundNumber,
    edgeId: input.edgeId,
    sourceNodeId: `role:${input.sourceRoleId}`,
    targetNodeId: `role:${input.targetRoleId}`,
    reason: input.reason,
  });
}

/**
 * FALLBACK-ONLY (Task 6.1): the legacy heuristic deliberation loop. This is the
 * exact pre-upgrade `executeDeliberation` behavior, retained verbatim so that
 * when the structured collaboration callers / adjudicator are unavailable or
 * the topology is unexecutable, deliberation degrades to byte-equivalent
 * current behavior (R9.4). The dispatcher {@link executeDeliberation} selects
 * this path when no structured inputs are provided.
 */
async function executeLegacyDeliberation(
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
      // T1 (R9.1 / R9.4): a throwing / rejecting executeMember marks only that
      // member as failed and the round continues with the others — it never
      // aborts the round or rejects executeDeliberation.
      try {
        await input.executeMember(member, context);
        executedMemberCount++;
      } catch (error) {
        member.state = "failed";
        member.failureReason =
          error instanceof Error ? error.message : String(error);
      }
    }
    if (executedMemberCount === 0) break;

    const memberOutputs = members.map((member) =>
      legacyOutputFromMember(member, roleIds),
    );
    const convergenceScore = legacyComputeConvergenceScore(memberOutputs);
    const rawChallenges = legacyChallengesFromOutputs(memberOutputs, roundNumber);
    const rebuttals = legacyFindRebuttalsForPriorChallenges(
      memberOutputs,
      activeChallenges,
    );
    const challengesBeforeResolution = [...activeChallenges];
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
      emitDeliberationMarker({
        emitEvent: input.emitEvent,
        session: input.session,
        marker: "CHALLENGE",
        roleId: challenge.challengerRoleId,
        targetRoleId: challenge.targetRoleId,
        nodeId: challenge.id,
        roundNumber,
        summary: challenge.summary,
      });
      emitDeliberationEdge({
        emitEvent: input.emitEvent,
        session: input.session,
        edgeId: challenge.id,
        sourceRoleId: challenge.challengerRoleId,
        targetRoleId: challenge.targetRoleId,
        roundNumber,
        reason: challenge.summary,
      });
    }

    for (const rebuttal of rebuttals) {
      const challenge = challengesBeforeResolution.find(
        (candidate) => candidate.id === rebuttal.challengeId,
      );
      if (!challenge) continue;
      input.emitEvent("brainstorm.rebuttal.issued", {
        sessionId: input.session.id,
        jobId: input.session.jobId,
        stageId: input.session.stageId,
        rebuttalId: rebuttal.id,
        challengeId: rebuttal.challengeId,
        responderRoleId: rebuttal.responderRoleId,
        challengerRoleId: challenge.challengerRoleId,
        rebuttalSummary: rebuttal.summary,
        roundNumber,
      });
      emitDeliberationMarker({
        emitEvent: input.emitEvent,
        session: input.session,
        marker: "SUPPORT",
        roleId: rebuttal.responderRoleId,
        targetRoleId: challenge.challengerRoleId,
        nodeId: rebuttal.id,
        roundNumber,
        summary: rebuttal.summary,
      });
      emitDeliberationEdge({
        emitEvent: input.emitEvent,
        session: input.session,
        edgeId: rebuttal.id,
        sourceRoleId: rebuttal.responderRoleId,
        targetRoleId: challenge.challengerRoleId,
        roundNumber,
        reason: rebuttal.summary,
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

// ---------------------------------------------------------------------------
// Structured deliberation dispatcher + engine (Task 6.1)
// ---------------------------------------------------------------------------
// `executeDeliberation` is now a thin dispatcher: it runs the real structured
// collaboration loop when the structured callers + adjudicator + an executable
// topology are all present, and otherwise (or on any unexpected engine throw)
// falls back to the retained legacy heuristic path (R9.4 / degradation tier T2).
// The whole function NEVER throws — it always resolves with a valid
// DeliberationResult.
//
// @see .kiro/specs/autopilot-brainstorm-real-collaboration/design.md §2
// Requirements: 1.4, 1.5, 1.6, 2.4, 2.5, 2.6, 3.3, 3.4, 3.5, 3.7, 9.4

/**
 * Whether a topology is structurally usable for the structured engine: it must
 * exist and declare at least one participant plus a (possibly empty) edge list.
 * Edges referencing roles not present in the session are simply skipped during
 * execution, so they do not make the topology unexecutable on their own.
 */
function isTopologyExecutable(
  topology: BrainstormTopology | undefined,
): topology is BrainstormTopology {
  return Boolean(
    topology &&
      Array.isArray(topology.participants) &&
      topology.participants.length > 0 &&
      Array.isArray(topology.critiqueEdges),
  );
}

/**
 * Execute a single round of multi-agent deliberation. Selects the real
 * structured collaboration loop when all structured inputs are present and the
 * topology is executable; otherwise degrades to the legacy heuristic path
 * (R9.4). Never throws: an unexpected throw inside the structured engine
 * degrades to the legacy path (tier T2).
 */
export async function executeDeliberation(
  input: ExecuteDeliberationInput,
): Promise<DeliberationResult> {
  const canRunStructured =
    Boolean(input.critiqueCaller) &&
    Boolean(input.rebuttalCaller) &&
    Boolean(input.adjudicator) &&
    isTopologyExecutable(input.topology);

  if (canRunStructured) {
    try {
      return await executeStructuredDeliberation(input);
    } catch {
      // T2: any unexpected engine throw degrades to the legacy heuristic path.
    }
  }

  // Final safety net (R9.1 / R9.4): even the legacy heuristic path is guarded so
  // executeDeliberation NEVER rejects. If the legacy path itself throws, return
  // a minimal structurally valid empty DeliberationResult.
  try {
    return await executeLegacyDeliberation(input);
  } catch {
    return {
      rounds: [],
      finalConvergenceScore: 0,
      consensusAchieved: false,
      totalChallenges: 0,
      unresolvedChallenges: [],
      dissentingOpinions: [],
    };
  }
}

/** Split a member's own output text into candidate claim sentences (R1.3). */
function extractClaimSentences(content: string | undefined): string[] {
  if (typeof content !== "string") return [];
  return content
    .split(/[.!?;\n。！？；]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Order members for a round: topology participant order first (so critiques can
 * reference fresh claims), then any session members not listed by the topology.
 */
function orderMembersByTopology(
  session: BrainstormSession,
  topology: BrainstormTopology,
): CrewMemberInstance[] {
  const seen = new Set<BrainstormRoleId>();
  const ordered: CrewMemberInstance[] = [];
  for (const roleId of topology.participants) {
    const member = session.crewMembers.get(roleId);
    if (member && !seen.has(roleId)) {
      ordered.push(member);
      seen.add(roleId);
    }
  }
  for (const member of session.crewMembers.values()) {
    if (!seen.has(member.roleId)) {
      ordered.push(member);
      seen.add(member.roleId);
    }
  }
  return ordered;
}

/** Defensive validation of a structured Critique (closed severity set, R1.2). */
function isValidStructuredCritique(critique: Critique): boolean {
  return (
    isCritiqueSeverity(critique.severity) &&
    typeof critique.targetClaim === "string" &&
    critique.targetClaim.trim().length > 0 &&
    typeof critique.critique === "string" &&
    critique.critique.trim().length > 0
  );
}

/** Defensive validation of a structured Rebuttal (closed stance set, R2.3). */
function isValidStructuredRebuttal(rebuttal: Rebuttal): boolean {
  return (
    isRebuttalStance(rebuttal.stance) &&
    typeof rebuttal.rebuttal === "string" &&
    rebuttal.rebuttal.trim().length > 0
  );
}

/** Never-throwing wrapper around the injected critique caller (R1.4). */
async function safeCritique(
  caller: StructuredCritiqueCaller,
  args: Parameters<StructuredCritiqueCaller>[0],
): Promise<Critique | null> {
  try {
    return await caller(args);
  } catch {
    return null;
  }
}

/** Never-throwing wrapper around the injected rebuttal caller (R2.6). */
async function safeRebuttal(
  caller: StructuredRebuttalCaller,
  args: Parameters<StructuredRebuttalCaller>[0],
): Promise<Rebuttal | null> {
  try {
    return await caller(args);
  } catch {
    return null;
  }
}

/** Conservative "no consensus" verdict used when adjudication fails (R3.6). */
function conservativeAdjudication(critiques: Critique[]): AdjudicationResult {
  return {
    consensusReached: false,
    convergenceScore: 0,
    unresolvedCritiqueIds: critiques.map((critique) => critique.id),
    rationale: "adjudication failed",
  };
}

/** Never-throwing wrapper around the injected adjudicator (R3.6). */
async function safeAdjudicate(
  adjudicator: AdjudicatorFn,
  args: Parameters<AdjudicatorFn>[0],
): Promise<AdjudicationResult> {
  try {
    const verdict = await adjudicator(args);
    if (!verdict || typeof verdict !== "object") {
      return conservativeAdjudication(args.critiques);
    }
    return verdict;
  } catch {
    return conservativeAdjudication(args.critiques);
  }
}

/** Map a structured Critique to the back-compat {@link ChallengeRecord} shape. */
function critiqueToChallengeRecord(critique: Critique): ChallengeRecord {
  return {
    id: critique.id,
    challengerRoleId: critique.challengerRoleId,
    targetRoleId: critique.targetRoleId,
    summary: critique.critique,
    roundNumber: critique.roundNumber,
    unresolvedRounds: critique.resolved ? 0 : 1,
    severity: critique.severity,
    targetClaim: critique.targetClaim,
  };
}

/** Map a structured Rebuttal to the back-compat {@link RebuttalRecord} shape. */
function rebuttalToRebuttalRecord(rebuttal: Rebuttal): RebuttalRecord {
  return {
    id: rebuttal.id,
    challengeId: rebuttal.challengeId,
    responderRoleId: rebuttal.responderRoleId,
    summary: rebuttal.rebuttal,
    confidenceAdjustment: rebuttal.stance === "concede" ? 0.2 : 0,
    stance: rebuttal.stance,
  };
}

/**
 * The real structured collaboration loop (R1/R2/R3). Each round:
 *   (1) each role produces a claim via executeMember + buildRoundContext (aux);
 *   (2) candidate claim sentences are extracted from each TARGET role's OWN
 *       round output;
 *   (3) for each topology critique edge a structured Critique is requested from
 *       the aux caller (invalid / null → skipped, R1.4; the legacy self-text
 *       regex is NEVER used, R1.5);
 *   (4) for each valid Critique a Rebuttal is requested — "concede" resolves the
 *       Critique (R2.4); "defend" / null / failure leaves it unresolved (R2.5,
 *       R2.6);
 *   (5) the primary-model adjudicator decides convergence (clamped to [0,1]);
 *   (6) the loop ends when consensusReached && round>=minRounds (R3.3) or at
 *       maxRounds (R3.4);
 *   (7) unresolved Critiques surface as dissenting opinions (R3.7);
 *   (8) a round with zero Critiques is recorded and continues (R1.6).
 *
 * Callers / adjudicator are wrapped so individual sub-failures degrade per tier
 * T1 without aborting the round.
 */
async function executeStructuredDeliberation(
  input: ExecuteDeliberationInput,
): Promise<DeliberationResult> {
  const session = input.session;
  const topology = input.topology as BrainstormTopology;
  const critiqueCaller = input.critiqueCaller as StructuredCritiqueCaller;
  const rebuttalCaller = input.rebuttalCaller as StructuredRebuttalCaller;
  const adjudicator = input.adjudicator as AdjudicatorFn;

  const minRounds = Math.max(1, Math.floor(topology.minRounds) || 1);
  const maxRounds = Math.max(minRounds, Math.floor(topology.maxRounds) || minRounds);

  const orderedMembers = orderMembersByTopology(session, topology);
  const participatingRoleIds = orderedMembers.map((member) => member.roleId);

  const rounds: DeliberationRound[] = [];
  const allCritiques: Critique[] = [];
  let lastVerdict: AdjudicationResult | null = null;

  for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber++) {
    if (session.status !== "active") break;
    if (session.tokenUsed >= session.tokenBudget) break;

    const context = buildRoundContext(input.stageContext, rounds);

    // (1) each role produces a claim (aux pool, via executeMember).
    let executedMemberCount = 0;
    for (const member of orderedMembers) {
      if (session.status !== "active") break;
      if (session.tokenUsed >= session.tokenBudget) break;
      if (member.state === "failed") continue;
      // T1 (R9.1 / R9.4): a throwing / rejecting executeMember marks only that
      // member as failed and the round continues with the others — it never
      // aborts the round or rejects executeDeliberation.
      try {
        await input.executeMember(member, context);
        executedMemberCount++;
      } catch (error) {
        member.state = "failed";
        member.failureReason =
          error instanceof Error ? error.message : String(error);
      }
    }
    if (executedMemberCount === 0) break;

    // (2) extract candidate claims from each role's OWN output (R1.3).
    const claimsByRole = new Map<BrainstormRoleId, string[]>();
    for (const member of orderedMembers) {
      claimsByRole.set(
        member.roleId,
        extractClaimSentences(member.output?.content),
      );
    }

    const roundCritiques: Critique[] = [];
    const roundRebuttals: Rebuttal[] = [];

    // (3) issue critiques per topology edge (NOT via legacy self-text regex, R1.5).
    for (const edge of topology.critiqueEdges) {
      const challenger = session.crewMembers.get(edge.challenger);
      const target = session.crewMembers.get(edge.target);
      if (!challenger || !target) continue;
      if (challenger.state === "failed") continue;

      const targetClaims = claimsByRole.get(edge.target) ?? [];
      const critique = await safeCritique(critiqueCaller, {
        challengerRoleId: edge.challenger,
        target: { roleId: edge.target, claims: targetClaims },
        stageContext: context,
      });
      if (!critique || !isValidStructuredCritique(critique)) continue; // R1.4

      critique.resolved = false;
      roundCritiques.push(critique);

      emitStructuredChallengeEvents(input, session, critique, roundNumber);

      // (4) rebuttal — only when the target role is available (R2.1).
      if (target.state !== "failed") {
        const rebuttal = await safeRebuttal(rebuttalCaller, {
          critique,
          responderClaim: critique.targetClaim,
        });
        if (rebuttal && isValidStructuredRebuttal(rebuttal)) {
          // Ensure the rebuttal references its originating critique (R2.2).
          const linkedRebuttal: Rebuttal = {
            ...rebuttal,
            challengeId: critique.id,
          };
          roundRebuttals.push(linkedRebuttal);
          // "concede" resolves the critique (R2.4); "defend" leaves it
          // unresolved (R2.5).
          critique.resolved = linkedRebuttal.stance === "concede";
          emitStructuredRebuttalEvents(
            input,
            session,
            critique,
            linkedRebuttal,
            roundNumber,
          );
        }
        // null / unparseable / failed rebuttal → critique stays unresolved (R2.6).
      }
    }

    allCritiques.push(...roundCritiques);

    // (5) primary-model adjudication; convergence score clamped to [0,1] (R3.2).
    const verdict = await safeAdjudicate(adjudicator, {
      critiques: roundCritiques,
      rebuttals: roundRebuttals,
      roundNumber,
    });
    const convergenceScore = clamp01(verdict.convergenceScore);
    lastVerdict = { ...verdict, convergenceScore };

    const unresolvedThisRound = roundCritiques.filter(
      (critique) => !critique.resolved,
    ).length;

    const round: DeliberationRound = {
      roundNumber,
      memberOutputs: orderedMembers.map((member) => ({
        roleId: member.roleId,
        content: member.output?.content ?? "",
        referencedMembers: [],
        agreementPoints: [],
        challenges: [],
      })),
      convergenceScore,
      challenges: roundCritiques.map(critiqueToChallengeRecord),
      rebuttals: roundRebuttals.map(rebuttalToRebuttalRecord),
    };
    rounds.push(round);

    // (8) zero-critique rounds are recorded and the loop continues (R1.6).
    input.emitEvent("brainstorm.round.completed", {
      sessionId: session.id,
      jobId: session.jobId,
      stageId: session.stageId,
      roundNumber,
      participatingRoleIds,
      convergenceScore,
      consensusReached: lastVerdict.consensusReached,
      unresolvedCritiqueCount: unresolvedThisRound,
    });

    // (6) termination conditions (R3.3 / R3.4).
    if (lastVerdict.consensusReached && roundNumber >= minRounds) break;
  }

  // (7) unresolved critiques become dissenting opinions for synthesis (R3.7).
  const unresolvedCritiques = allCritiques.filter(
    (critique) => !critique.resolved,
  );
  const unresolvedChallenges = unresolvedCritiques.map(critiqueToChallengeRecord);
  const finalConvergenceScore = lastVerdict
    ? clamp01(lastVerdict.convergenceScore)
    : 0;

  return {
    rounds,
    finalConvergenceScore,
    consensusAchieved: lastVerdict?.consensusReached ?? false,
    totalChallenges: allCritiques.length,
    unresolvedChallenges,
    dissentingOpinions: unresolvedCritiques.map((critique) => ({
      roleId: critique.challengerRoleId,
      opinion: critique.critique,
      challengeId: critique.id,
    })),
  };
}

/** Emit the challenge.issued event + runtime-graph marker/edge for a Critique. */
function emitStructuredChallengeEvents(
  input: ExecuteDeliberationInput,
  session: BrainstormSession,
  critique: Critique,
  roundNumber: number,
): void {
  input.emitEvent("brainstorm.challenge.issued", {
    sessionId: session.id,
    jobId: session.jobId,
    stageId: session.stageId,
    challengerRoleId: critique.challengerRoleId,
    targetRoleId: critique.targetRoleId,
    targetClaim: critique.targetClaim,
    critiqueSummary: critique.critique,
    severity: critique.severity,
    roundNumber,
  });
  emitDeliberationMarker({
    emitEvent: input.emitEvent,
    session,
    marker: "CHALLENGE",
    roleId: critique.challengerRoleId,
    targetRoleId: critique.targetRoleId,
    nodeId: critique.id,
    roundNumber,
    summary: critique.critique,
  });
  emitDeliberationEdge({
    emitEvent: input.emitEvent,
    session,
    edgeId: critique.id,
    sourceRoleId: critique.challengerRoleId,
    targetRoleId: critique.targetRoleId,
    roundNumber,
    reason: critique.critique,
  });
}

/** Emit the rebuttal.issued event + runtime-graph marker/edge for a Rebuttal. */
function emitStructuredRebuttalEvents(
  input: ExecuteDeliberationInput,
  session: BrainstormSession,
  critique: Critique,
  rebuttal: Rebuttal,
  roundNumber: number,
): void {
  input.emitEvent("brainstorm.rebuttal.issued", {
    sessionId: session.id,
    jobId: session.jobId,
    stageId: session.stageId,
    responderRoleId: rebuttal.responderRoleId,
    challengeId: rebuttal.challengeId,
    rebuttalSummary: rebuttal.rebuttal,
    stance: rebuttal.stance,
    roundNumber,
  });
  emitDeliberationMarker({
    emitEvent: input.emitEvent,
    session,
    marker: "SUPPORT",
    roleId: rebuttal.responderRoleId,
    targetRoleId: critique.challengerRoleId,
    nodeId: rebuttal.id,
    roundNumber,
    summary: rebuttal.rebuttal,
  });
  emitDeliberationEdge({
    emitEvent: input.emitEvent,
    session,
    edgeId: rebuttal.id,
    sourceRoleId: rebuttal.responderRoleId,
    targetRoleId: critique.challengerRoleId,
    roundNumber,
    reason: rebuttal.rebuttal,
  });
}

// ---------------------------------------------------------------------------
// Real structured collaboration (autopilot-brainstorm-real-collaboration)
// ---------------------------------------------------------------------------
// ADDITIVE (Task 3.1): structured Critique / Rebuttal caller type aliases plus
// lenient, never-throwing parsers that turn a raw aux-model (`Aux_Model`) LLM
// string into a structurally valid `Critique` / `Rebuttal` object — or `null`
// when the response cannot be confidently validated.
//
// These do NOT change `executeDeliberation` (that upgrade is Task 6.1). They
// are wired in later; for now they exist so the property tests (Tasks 3.2 /
// 3.3) can import `parseCritique` / `parseRebuttal`.
//
// Doctrine (mirrors `synthesis-audit.ts` `auditSynthesis`): never throw, lenient
// JSON extraction (`JSON.parse` → first `{...}` block → conservative `null`),
// and reject out-of-set enum values (`severity ∉ {low,medium,high}` → `null`;
// `stance ∉ {concede,defend}` → `null`).
//
// Critically (R1.3): `targetClaim` is NOT read from the challenger's LLM text —
// it is carried in via context, sourced from the TARGET role's own round
// output. The parser only extracts the free-form `critique`/`rebuttal` text and
// the closed-set `severity`/`stance` from the model response.
//
// @see .kiro/specs/autopilot-brainstorm-real-collaboration/design.md
// Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3

/**
 * Aux-pool caller that produces a structured {@link Critique} for a single
 * challenger → target edge, or `null` when the call fails / is unparseable
 * (R1.1, R1.4). `target.claims` is sourced from the target role's own round
 * output so the resulting `targetClaim` references target text, not challenger
 * text (R1.3).
 */
export type StructuredCritiqueCaller = (input: {
  challengerRoleId: BrainstormRoleId;
  target: { roleId: BrainstormRoleId; claims: string[] };
  stageContext: string;
}) => Promise<Critique | null>;

/**
 * Aux-pool caller that produces a structured {@link Rebuttal} from the target
 * role responding to a specific {@link Critique}, or `null` when the call fails
 * / is unparseable (R2.1, R2.6).
 */
export type StructuredRebuttalCaller = (input: {
  critique: Critique;
  responderClaim: string;
}) => Promise<Rebuttal | null>;

/** Allowed critique severities (R1.2). */
const CRITIQUE_SEVERITIES: readonly CritiqueSeverity[] = ["low", "medium", "high"];

/** Allowed rebuttal stances (R2.3). */
const REBUTTAL_STANCES: readonly RebuttalStance[] = ["concede", "defend"];

function isCritiqueSeverity(value: unknown): value is CritiqueSeverity {
  return (
    typeof value === "string" &&
    (CRITIQUE_SEVERITIES as readonly string[]).includes(value)
  );
}

function isRebuttalStance(value: unknown): value is RebuttalStance {
  return (
    typeof value === "string" &&
    (REBUTTAL_STANCES as readonly string[]).includes(value)
  );
}

/**
 * Lenient JSON extraction shared by the structured parsers. Tries a direct
 * `JSON.parse` first, then falls back to the first `{...}` block in the string
 * (models often wrap JSON in prose / code fences). Returns `null` when nothing
 * usable is found. Never throws.
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Context carried from the engine (not the LLM) for assembling a Critique. */
export interface ParseCritiqueContext {
  id: string;
  challengerRoleId: BrainstormRoleId;
  targetRoleId: BrainstormRoleId;
  /**
   * The specific claim text drawn from the TARGET role's own round output. This
   * is the source of truth for `targetClaim` — it is NEVER derived from the
   * challenger's text or from the LLM critique response (R1.3).
   */
  targetClaim: string;
  roundNumber: number;
}

/**
 * Parse a raw aux-model critique response into a structured {@link Critique},
 * or `null` when it cannot be confidently validated (R1.1, R1.2, R1.4).
 *
 * The model response is expected to carry `critique` (free-form text) and
 * `severity` (one of `{low,medium,high}`). All identity / targeting fields —
 * including `targetClaim` — come from `context`, never from the response, so
 * the critique always references the target role's own claim (R1.3).
 *
 * Returns `null` (rejected) when:
 * - the response is not lenient-parseable JSON,
 * - `severity` is missing or outside `{low,medium,high}`,
 * - the `critique` text is missing / blank,
 * - the carried `targetClaim` is missing / blank.
 *
 * Never throws.
 */
export function parseCritique(
  raw: string,
  context: ParseCritiqueContext,
): Critique | null {
  try {
    const targetClaim =
      typeof context.targetClaim === "string" ? context.targetClaim.trim() : "";
    if (!targetClaim) return null;

    const obj = extractJsonObject(raw);
    if (!obj) return null;

    if (!isCritiqueSeverity(obj.severity)) return null;

    const critique = typeof obj.critique === "string" ? obj.critique.trim() : "";
    if (!critique) return null;

    return {
      id: context.id,
      challengerRoleId: context.challengerRoleId,
      targetRoleId: context.targetRoleId,
      targetClaim,
      critique,
      severity: obj.severity,
      roundNumber: context.roundNumber,
      resolved: false,
    };
  } catch {
    return null;
  }
}

/** Context carried from the engine (not the LLM) for assembling a Rebuttal. */
export interface ParseRebuttalContext {
  id: string;
  responderRoleId: BrainstormRoleId;
  /** === the id of the Critique this rebuttal responds to (R2.2). */
  challengeId: string;
  roundNumber: number;
}

/**
 * Parse a raw aux-model rebuttal response into a structured {@link Rebuttal},
 * or `null` when it cannot be confidently validated (R2.1, R2.3, R2.6).
 *
 * The model response is expected to carry `rebuttal` (free-form text) and
 * `stance` (one of `{concede,defend}`). The `challengeId` always comes from
 * `context`, so a produced rebuttal references its originating critique (R2.2).
 *
 * Returns `null` (rejected) when:
 * - the response is not lenient-parseable JSON,
 * - `stance` is missing or outside `{concede,defend}`,
 * - the `rebuttal` text is missing / blank.
 *
 * Never throws.
 */
export function parseRebuttal(
  raw: string,
  context: ParseRebuttalContext,
): Rebuttal | null {
  try {
    const obj = extractJsonObject(raw);
    if (!obj) return null;

    if (!isRebuttalStance(obj.stance)) return null;

    const rebuttal = typeof obj.rebuttal === "string" ? obj.rebuttal.trim() : "";
    if (!rebuttal) return null;

    return {
      id: context.id,
      responderRoleId: context.responderRoleId,
      challengeId: context.challengeId,
      rebuttal,
      stance: obj.stance,
      roundNumber: context.roundNumber,
    };
  } catch {
    return null;
  }
}
