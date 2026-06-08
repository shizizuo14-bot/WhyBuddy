import type {
  BrainstormSession,
  CrewMemberInstance,
  MajorityVote,
  StructuredVote,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { DeliberationRound } from "./deliberation-protocol.js";

/**
 * @deprecated Use {@link StructuredVote}. Retained as a structural alias for
 * backward compatibility with existing imports (orchestrator, tests).
 */
export type VoteInput = StructuredVote;

/**
 * Configurable narrow-margin threshold (R4.3): when the winning option's margin
 * over the second place is below this value the result is flagged `isNarrow`.
 */
export const NARROW_MARGIN_THRESHOLD = 0.15;

/**
 * Structured majority-vote result. Extends the shared {@link MajorityVote}
 * contract (so it is directly usable as one) with the additional fields the
 * orchestrator already consumes plus a degradation flag.
 */
export interface VoteResult extends MajorityVote {
  /** Confidence-weighted score of the second-place option (0 when none). */
  secondPlaceScore: number;
  /**
   * True when no valid structured votes were parsed. The orchestrator uses this
   * to degrade to synthesis annotated "no valid votes" (R4.5) instead of
   * throwing.
   */
  noValidVotes: boolean;
}

export interface CollectVotesInput {
  session: BrainstormSession;
  stageContext: string;
  executeMember(
    member: CrewMemberInstance,
    context: string,
  ): Promise<void>;
  discussionHistory?: DeliberationRound[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** A vote is valid only when it carries a non-empty `chosenOption` string. */
function isValidVote(
  vote: StructuredVote | null | undefined,
): vote is StructuredVote {
  return (
    vote != null &&
    typeof vote.chosenOption === "string" &&
    vote.chosenOption.trim().length > 0
  );
}

/**
 * Compute the confidence-weighted majority vote over a set of structured votes.
 *
 * Invalid votes (missing/empty `chosenOption`) are ignored rather than throwing
 * (R4.4). The winning option is the one with the maximum confidence-weighted
 * score; `margin` is the winning score minus the second place; `isNarrow` is
 * true exactly when `margin` is below {@link NARROW_MARGIN_THRESHOLD} (R4.2,
 * R4.3). When no valid votes remain, `noValidVotes` is true so the caller can
 * degrade gracefully (R4.5).
 */
export function computeVoteResult(
  votes: readonly StructuredVote[],
): VoteResult {
  const validVotes = votes.filter(isValidVote);

  const optionScores = new Map<string, number>();
  for (const vote of validVotes) {
    optionScores.set(
      vote.chosenOption,
      (optionScores.get(vote.chosenOption) ?? 0) + clamp01(vote.confidence),
    );
  }

  const sorted = [...optionScores.entries()].sort((left, right) => {
    const scoreDelta = right[1] - left[1];
    return scoreDelta !== 0 ? scoreDelta : left[0].localeCompare(right[0]);
  });

  const [winningOption, winningScore] = sorted[0] ?? ["", 0];
  const second = sorted[1] ?? null;
  const secondPlaceOption = second?.[0] ?? null;
  const secondPlaceScore = second?.[1] ?? 0;
  const margin = winningScore - secondPlaceScore;
  const isNarrow = margin < NARROW_MARGIN_THRESHOLD;

  return {
    winningOption,
    winningScore,
    secondPlaceOption,
    secondPlaceScore,
    margin,
    isNarrow,
    votes: [...validVotes],
    minorityReasoning: validVotes
      .filter((vote) => vote.chosenOption !== winningOption)
      .map((vote) => vote.reasoning)
      .filter(Boolean),
    noValidVotes: validVotes.length === 0,
  };
}

/**
 * Project a {@link VoteResult} down to the pure shared {@link MajorityVote}
 * contract (dropping the orchestrator-only `secondPlaceScore`/`noValidVotes`).
 */
export function toMajorityVote(result: VoteResult): MajorityVote {
  return {
    winningOption: result.winningOption,
    winningScore: result.winningScore,
    secondPlaceOption: result.secondPlaceOption,
    margin: result.margin,
    isNarrow: result.isNarrow,
    votes: result.votes,
    minorityReasoning: result.minorityReasoning,
  };
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to brace extraction.
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore — treated as an invalid vote below.
    }
  }

  return null;
}

/**
 * Parse a crew member's output into a structured vote. Returns `null` for votes
 * that cannot be parsed into a valid structured vote (R4.4) so the caller can
 * ignore them.
 */
function parseVote(member: CrewMemberInstance): StructuredVote | null {
  const raw = member.output?.content;
  if (!raw || raw.trim().length === 0) return null;

  const parsed = tryParseJsonObject(raw);
  if (parsed) {
    const fromChosen =
      typeof parsed.chosenOption === "string" &&
      parsed.chosenOption.trim().length > 0
        ? parsed.chosenOption
        : null;
    const fromOption =
      typeof parsed.option === "string" && parsed.option.trim().length > 0
        ? parsed.option
        : null;
    const chosenOption = fromChosen ?? fromOption;
    if (!chosenOption) return null;

    return {
      roleId: member.roleId,
      chosenOption,
      confidence:
        typeof parsed.confidence === "number"
          ? clamp01(parsed.confidence)
          : clamp01(member.output?.confidence ?? 0.5),
      reasoning:
        typeof parsed.reasoning === "string" ? parsed.reasoning : raw,
    };
  }

  // Lenient fallback: a non-JSON plain-text response naming an option.
  const trimmed = raw.trim();
  return {
    roleId: member.roleId,
    chosenOption: trimmed,
    confidence: clamp01(member.output?.confidence ?? 0.5),
    reasoning: raw,
  };
}

function buildVoteContext(
  stageContext: string,
  discussionHistory?: readonly DeliberationRound[],
): string {
  if (!discussionHistory || discussionHistory.length === 0) {
    return stageContext;
  }

  const history = discussionHistory
    .flatMap((round) =>
      round.memberOutputs.map(
        (output) =>
          `Round ${round.roundNumber} [${output.roleId}]: ${output.content}`,
      ),
    )
    .join("\n---\n");

  return `${stageContext}\n\nDiscussion history before voting:\n${history}`;
}

/**
 * Collect structured votes from every crew member and compute the majority
 * vote. Member execution failures are swallowed by `Promise.allSettled`, and
 * unparseable votes are ignored — this function never throws (R4.4, R4.5).
 */
export async function collectVotes(
  input: CollectVotesInput,
): Promise<VoteResult> {
  const members = Array.from(input.session.crewMembers.values());
  const context = buildVoteContext(input.stageContext, input.discussionHistory);

  await Promise.allSettled(
    members.map((member) => input.executeMember(member, context)),
  );

  const votes = members
    .map((member) => parseVote(member))
    .filter((vote): vote is StructuredVote => vote !== null);

  return computeVoteResult(votes);
}
