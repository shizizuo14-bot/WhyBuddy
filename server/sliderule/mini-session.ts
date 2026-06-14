/**
 * R2: Construct minimal BrainstormSession inputs for SlideRule deliberation executors.
 */

import crypto from "node:crypto";

import type {
  BrainstormRoleId,
  BrainstormSession,
  CrewMemberInstance,
  CrewMemberState,
} from "../../shared/blueprint/brainstorm-contracts.js";
import type { V5SessionState } from "../../shared/blueprint/v5-reasoning-state.js";
import { getBrainstormRole } from "../routes/blueprint/brainstorm/role-registry.js";

export const UPSTREAM_CLAIM_KINDS = new Set([
  "route_options",
  "synthesis",
  "report",
  "decision",
]);

export type MiniSessionInput = {
  turnId: string;
  challengerRole: BrainstormRoleId;
  targetRole: BrainstormRoleId;
  stageContext: string;
  /** R2.5 多角色面板：显式 N 个参与者（提供时优先于 challenger/target 两角色）。 */
  participants?: BrainstormRoleId[];
};

const NOOP_EMIT: (eventType: string, payload: Record<string, unknown>) => void = () => {};

export function noopEmitEvent(): (eventType: string, payload: Record<string, unknown>) => void {
  return NOOP_EMIT;
}

function createCrewMember(roleId: BrainstormRoleId): CrewMemberInstance {
  const roleDef = getBrainstormRole(roleId);
  return {
    roleId,
    state: "idle" as CrewMemberState,
    iterationCount: 0,
    maxIterations: roleDef?.maxIterations ?? 3,
    tokenUsage: 0,
  };
}

export function buildMiniSession(input: MiniSessionInput): BrainstormSession {
  const rawParticipants =
    input.participants && input.participants.length > 0
      ? input.participants
      : [input.challengerRole, input.targetRole];
  const participants = rawParticipants.filter((role, idx, arr) => arr.indexOf(role) === idx);

  const crewMembers = new Map<BrainstormRoleId, CrewMemberInstance>();
  for (const roleId of participants) {
    crewMembers.set(roleId, createCrewMember(roleId));
  }

  return {
    id: `sliderule-mini-${input.turnId}`,
    jobId: `sliderule-${input.turnId}`,
    stageId: "sliderule.deliberation",
    mode: "discussion",
    crewMembers,
    branchNodes: [],
    edges: [],
    status: "active",
    tokenBudget: Number(process.env.BRAINSTORM_MAX_TOKENS || 120_000),
    tokenUsed: 0,
    toolCallCount: 0,
    toolCallLimit: Number(process.env.BRAINSTORM_MAX_TOOL_CALLS || 40),
    startedAt: new Date(),
  };
}

function isTrustedArtifact(art: { trustLevel?: string }): boolean {
  return art.trustLevel === "gated_pass" || art.trustLevel === "audited";
}

function artifactClaimText(art: {
  content?: string;
  summary?: string;
  title?: string;
}): string {
  const text = String(art.content || art.summary || art.title || "").trim();
  return text;
}

/**
 * Prefer trusted upstream artifacts (kinds route_options/synthesis/report/decision).
 * Returns null when none found — callers may fall back to goal.text (counter.argue).
 */
export function extractUpstreamClaim(
  state: V5SessionState,
  inputArtifactIds: string[] = []
): string | null {
  const arts: any[] = (state as any)?.artifacts || [];
  const byId = new Map(arts.map((a) => [a.id, a]));

  const orderedIds =
    inputArtifactIds.length > 0
      ? inputArtifactIds
      : arts.map((a) => a.id).reverse();

  const candidates = orderedIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((a) => UPSTREAM_CLAIM_KINDS.has(a.kind));

  const trusted = candidates.filter(isTrustedArtifact);
  const pool = trusted.length > 0 ? trusted : candidates;

  for (const art of pool) {
    const text = artifactClaimText(art);
    if (text.length > 0) return text.slice(0, 4000);
  }
  return null;
}

export function buildStageContext(goalText: string, claimText: string, extra?: string): string {
  const parts = [
    `Goal: ${goalText}`,
    `Primary claim under review:\n${claimText}`,
  ];
  if (extra?.trim()) parts.push(extra.trim());
  return parts.join("\n\n");
}

export function seedTargetMemberOutput(
  session: BrainstormSession,
  targetRole: BrainstormRoleId,
  claimText: string
): void {
  const member = session.crewMembers.get(targetRole);
  if (!member) return;
  member.state = "completed";
  member.output = {
    content: claimText,
    confidence: 0.85,
    toolInvocations: [],
    tokenUsage: 0,
  };
}

export function newCritiqueId(): string {
  return crypto.randomUUID();
}