import type { Artifact, V5SessionState } from "./v5-reasoning-state.js";

export interface CoverageReplayRequirementLine {
  capabilityId: string;
  /** report.write is the convergence ACTION, not a pre-req gap. */
  isConvergenceAction: boolean;
  /** A trusted (gated_pass|audited), non-stale artifact produced by this capability exists. */
  satisfied: boolean;
  satisfiedByArtifactId?: string;
}

export interface CoverageReplayGapLine {
  id: string;
  kind: string;
  status: "open" | "resolved" | "waived";
  requiredCapabilityId?: string;
  resolvedByArtifactId?: string;
  waivedReason?: string;
}

export interface CoverageReplay {
  hasContract: boolean;
  mode?: "simple" | "complex";
  /** Item-by-item, in the SAME order as contract.requiredCapabilities. */
  required: CoverageReplayRequirementLine[];
  conditional: string[];
  gaps: CoverageReplayGapLine[];
  resolvedGapIds: string[];
  waivedGapIds: string[];
  openGapIds: string[];
  /** The last computed coverageGate.passed, or null if GCOV never ran. */
  gatePassed: boolean | null;
}

/** A trusted (gated_pass|audited), non-stale artifact produced by `capId`, if any. */
function trustedArtifactForCap(state: V5SessionState, capId: string): Artifact | undefined {
  const stales = new Set(state.staleArtifactIds || []);
  return (state.artifacts || []).find(
    (a) =>
      a.producedBy?.capabilityId === capId &&
      (a.trustLevel === "gated_pass" || a.trustLevel === "audited") &&
      !stales.has(a.id)
  );
}

/**
 * S2 (P1 acceptance): replay the session's coverage from STATE + ledger. Pure read-only.
 */
export function replayCoverage(state: V5SessionState): CoverageReplay {
  const contract = state.coverageContract;
  const gaps = (state.coverageGaps || []) as Array<CoverageReplayGapLine & { status: string }>;
  const gatePassed =
    state.coverageGate && typeof state.coverageGate.passed === "boolean"
      ? state.coverageGate.passed
      : null;

  if (!contract) {
    return {
      hasContract: false,
      required: [],
      conditional: [],
      gaps: gaps.map((g) => ({
        id: g.id,
        kind: g.kind,
        status: g.status as CoverageReplayGapLine["status"],
        requiredCapabilityId: g.requiredCapabilityId,
        resolvedByArtifactId: g.resolvedByArtifactId,
        waivedReason: g.waivedReason,
      })),
      resolvedGapIds: gaps.filter((g) => g.status === "resolved").map((g) => g.id),
      waivedGapIds: gaps.filter((g) => g.status === "waived").map((g) => g.id),
      openGapIds: gaps.filter((g) => g.status === "open").map((g) => g.id),
      gatePassed,
    };
  }

  const required: CoverageReplayRequirementLine[] = contract.requiredCapabilities.map((cap) => {
    const isConvergenceAction = cap === "report.write";
    const art = trustedArtifactForCap(state, cap);
    return {
      capabilityId: cap,
      isConvergenceAction,
      satisfied: !!art,
      satisfiedByArtifactId: art?.id,
    };
  });

  return {
    hasContract: true,
    mode: contract.mode,
    required,
    conditional: [...(contract.conditionalCapabilities || [])],
    gaps: gaps.map((g) => ({
      id: g.id,
      kind: g.kind,
      status: g.status as CoverageReplayGapLine["status"],
      requiredCapabilityId: g.requiredCapabilityId,
      resolvedByArtifactId: g.resolvedByArtifactId,
      waivedReason: g.waivedReason,
    })),
    resolvedGapIds: gaps.filter((g) => g.status === "resolved").map((g) => g.id),
    waivedGapIds: gaps.filter((g) => g.status === "waived").map((g) => g.id),
    openGapIds: gaps.filter((g) => g.status === "open").map((g) => g.id),
    gatePassed,
  };
}