import type { CrossRuntimeGraph } from "@/lib/skills/orchestrator";
import type { AppBundleRuntimeClosureReport } from "@/lib/skills/appbundle/appBundleSkill";
import type { AppBundleClosureTier } from "@/lib/skills/appbundle/appBundleModel";

export type CrossRuntimeGraphSummary = {
  edgeCount: number;
  allowedCount: number;
  blockedCount: number;
  skillCount: number;
  evidenceCount: number;
  examples: Array<{
    sourceSkill: string;
    targetSkill: string;
    state: string;
    evidenceKey?: string;
  }>;
};

export type PublishClosureSummary = {
  blocked: boolean;
  blockerCount: number;
  evidencePresentCount: number;
  skillCount: number;
  versionPinsChecked: boolean;
  closureId?: string;
  closureHash?: string;
  stableDigest?: string;
  tierCounts: Record<AppBundleClosureTier, number>;
  topBlockers: Array<{
    code: string;
    path: string;
  }>;
};

export function deriveCrossRuntimeGraphSummary(
  graph: CrossRuntimeGraph | null | undefined,
  options: { exampleLimit?: number } = {}
): CrossRuntimeGraphSummary | null {
  const edges = graph?.edges ?? [];
  if (edges.length === 0) return null;

  const exampleLimit = options.exampleLimit ?? 4;
  const allowedCount = edges.filter((edge) => edge.state === "allowed").length;
  const blockedCount = edges.length - allowedCount;
  const skillIds = new Set<string>();
  for (const edge of edges) {
    skillIds.add(edge.sourceSkill);
    skillIds.add(edge.targetSkill);
  }

  const evidenceCount = Object.values(graph?.evidenceBySkill ?? {}).reduce(
    (sum, keys) => sum + keys.length,
    0
  );

  return {
    edgeCount: edges.length,
    allowedCount,
    blockedCount,
    skillCount: skillIds.size,
    evidenceCount,
    examples: edges.slice(0, exampleLimit).map((edge) => ({
      sourceSkill: edge.sourceSkill,
      targetSkill: edge.targetSkill,
      state: edge.state,
      evidenceKey: edge.evidenceKey,
    })),
  };
}

export function derivePublishClosureSummary(
  report: AppBundleRuntimeClosureReport | null | undefined,
  options: { blockerLimit?: number } = {}
): PublishClosureSummary | null {
  if (!report?.runtimeClosure) return null;

  const blockerLimit = options.blockerLimit ?? 3;
  const perSkillEvidence = Object.values(report.perSkillEvidence ?? {});
  const evidencePresentCount = perSkillEvidence.filter((entry) => entry.evidencePresent).length;
  const findingsByTier = report.findingsByTier ?? {
    hard_blocker: [],
    warning: [],
    info: [],
  };

  return {
    blocked: report.blocked,
    blockerCount: report.blockers.length,
    evidencePresentCount,
    skillCount: report.runtimeClosure.skillsChecked.length,
    versionPinsChecked: report.runtimeClosure.versionPinsChecked,
    closureId: report.closureId,
    closureHash: report.closureHash,
    stableDigest: report.stableDigest,
    tierCounts: {
      hard_blocker: findingsByTier.hard_blocker?.length ?? 0,
      warning: findingsByTier.warning?.length ?? 0,
      info: findingsByTier.info?.length ?? 0,
    },
    topBlockers: report.blockers.slice(0, blockerLimit).map((blocker) => ({
      code: blocker.code,
      path: blocker.path,
    })),
  };
}

export function selectPublishClosureSummary(
  pythonClosure: PublishClosureSummary | null | undefined,
  previewClosure: PublishClosureSummary | null | undefined
): PublishClosureSummary | null {
  return pythonClosure ?? previewClosure ?? null;
}
