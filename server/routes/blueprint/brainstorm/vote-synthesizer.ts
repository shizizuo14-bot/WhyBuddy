import type {
  BrainstormRoleId,
  BrainstormSession,
  CrewMemberInstance,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import type { DeliberationRound } from "./deliberation-protocol.js";

export interface VoteInput {
  roleId: BrainstormRoleId;
  chosenOption: string;
  confidence: number;
  reasoning: string;
}

export interface VoteResult {
  winningOption: string;
  winningScore: number;
  secondPlaceOption: string | null;
  secondPlaceScore: number;
  margin: number;
  isNarrow: boolean;
  votes: VoteInput[];
  minorityReasoning: string[];
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

export function computeVoteResult(votes: readonly VoteInput[]): VoteResult {
  const optionScores = new Map<string, number>();
  for (const vote of votes) {
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
  const isNarrow = margin < 0.15;

  return {
    winningOption,
    winningScore,
    secondPlaceOption,
    secondPlaceScore,
    margin,
    isNarrow,
    votes: [...votes],
    minorityReasoning: votes
      .filter((vote) => vote.chosenOption !== winningOption)
      .map((vote) => vote.reasoning)
      .filter(Boolean),
  };
}

function parseVote(member: CrewMemberInstance): VoteInput | null {
  const raw = member.output?.content;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const chosenOption =
      typeof parsed.chosenOption === "string"
        ? parsed.chosenOption
        : typeof parsed.option === "string"
          ? parsed.option
          : null;
    if (!chosenOption) return null;
    return {
      roleId: member.roleId,
      chosenOption,
      confidence:
        typeof parsed.confidence === "number"
          ? clamp01(parsed.confidence)
          : (member.output?.confidence ?? 0.5),
      reasoning:
        typeof parsed.reasoning === "string" ? parsed.reasoning : raw,
    };
  } catch {
    return {
      roleId: member.roleId,
      chosenOption: raw.trim(),
      confidence: member.output?.confidence ?? 0.5,
      reasoning: raw,
    };
  }
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
    .filter((vote): vote is VoteInput => vote !== null);

  return computeVoteResult(votes);
}
