import type { V5SessionState } from "@shared/blueprint/v5-reasoning-state";

export type ConclusionBadgeTone = "idle" | "clear" | "challenged" | "not_recommended";

export type ConclusionBadgeProjection = {
  label: string;
  tone: ConclusionBadgeTone;
  className: string;
};

/**
 * User-facing projection of sessionState.goal.status (Layer 1 badge).
 * - clear → 已收敛·可信
 * - needs_refinement + stale → 已被质疑·重新推演 (C-2 downgrade visible to users)
 * - needs_refinement + no stale → 推演中
 */
export function projectConclusionBadge(state: V5SessionState): ConclusionBadgeProjection {
  const status = state.goal?.status;
  const staleCount = (state.staleArtifactIds || []).length;

  if (status === "clear") {
    return {
      label: "已收敛·可信",
      tone: "clear",
      className: "bg-emerald-950/60 text-emerald-300 ring-emerald-500/30",
    };
  }

  if (status === "not_recommended") {
    return {
      label: "不建议推进",
      tone: "not_recommended",
      className: "bg-rose-950/60 text-rose-300 ring-rose-500/30",
    };
  }

  if (staleCount > 0) {
    return {
      label: "已被质疑·重新推演",
      tone: "challenged",
      className: "bg-amber-950/60 text-amber-300 ring-amber-500/30",
    };
  }

  return {
    label: "推演中",
    tone: "idle",
    className: "bg-zinc-800 text-zinc-300 ring-white/10",
  };
}