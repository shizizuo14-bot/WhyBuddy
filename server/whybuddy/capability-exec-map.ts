/**
 * F1: Semantic capability → implementation routing for /execute-capability.
 * Orchestrator schedules repo.inspect / evidence.search; server maps to GitHub adapters.
 */

import type { V5SessionState } from "../../shared/blueprint/v5-reasoning-state.js";
import { findGithubUrlInTexts, extractGithubRepoSlug } from "../../shared/blueprint/whybuddy-github-context.js";
import { executeGithubMcpCapability } from "./github-mcp-adapter.js";
import { executeRepoStaticInspect } from "./repo-static-analyzer.js";
import {
  EVIDENCE_SOURCE_WEB_SEARCH,
  executeWebEvidenceSearch,
  isWebSearchEnabled,
} from "./web-evidence-adapter.js";

/**
 * Closed set of evidence.search source labels (Requirement 5.2 / Property 14).
 * Every evidence.search result is tagged with exactly one of these:
 *   - in-conversation synthesis,
 *   - F1 GitHub fetch (repo-linked external seam — Requirement 5.5),
 *   - F2 Web search (全网检索 — sanctioned web_search provider),
 *   - model-knowledge reasoning.
 */
export const EVIDENCE_SOURCE_IN_SESSION = "会话内综合" as const;
export const EVIDENCE_SOURCE_F1_GITHUB = "F1_Github_Source 取数" as const;
export { EVIDENCE_SOURCE_WEB_SEARCH };
export const EVIDENCE_SOURCE_MODEL_KNOWLEDGE = "模型知识推理" as const;

export type EvidenceSourceLabel =
  | typeof EVIDENCE_SOURCE_IN_SESSION
  | typeof EVIDENCE_SOURCE_F1_GITHUB
  | typeof EVIDENCE_SOURCE_WEB_SEARCH
  | typeof EVIDENCE_SOURCE_MODEL_KNOWLEDGE;

/** The exhaustive, closed set of allowed evidence.search source labels. */
export const EVIDENCE_SOURCE_LABELS: readonly EvidenceSourceLabel[] = [
  EVIDENCE_SOURCE_IN_SESSION,
  EVIDENCE_SOURCE_F1_GITHUB,
  EVIDENCE_SOURCE_WEB_SEARCH,
  EVIDENCE_SOURCE_MODEL_KNOWLEDGE,
];

export type RawExecutorResult = {
  title: string;
  summary: string;
  content: string;
  provenance?: string;
  /**
   * Evidence provenance label for evidence.search (Requirement 5.2). Always one
   * of EVIDENCE_SOURCE_LABELS when set. Optional so repo.inspect paths can omit it.
   */
  evidenceSource?: EvidenceSourceLabel;
  /** S15: explicit degraded marker when repo/evidence path downgrades. */
  payload?: { degraded?: boolean; degradedReason?: string; [key: string]: unknown };
};

type EvidenceFallbackOpts = {
  /** F2 web search was enabled and attempted before this branch. */
  webSearchAttempted?: boolean;
  /** WHYBUDDY_WEB_SEARCH_ENABLED=0 — F2 skipped entirely. */
  webSearchDisabled?: boolean;
};

function ruleEvidenceFallback(
  state: V5SessionState,
  _roleId?: string,
  opts: EvidenceFallbackOpts = {}
): RawExecutorResult {
  const goalText = (state as any)?.goal?.text || "";
  const webDisabled = opts.webSearchDisabled === true;
  const webAttempted = opts.webSearchAttempted === true;

  let summary: string;
  let content: string;
  let degradedReason: string;

  if (webDisabled) {
    summary = `【来源: ${EVIDENCE_SOURCE_IN_SESSION}】全网检索已关闭，使用会话内材料。`;
    content =
      `基于当前目标「${String(goalText).slice(0, 120)}」整理了可引用的会话内要点。` +
      `未发起全网检索（WHYBUDDY_WEB_SEARCH_ENABLED=0）。`;
    degradedReason = "web_search_disabled";
  } else if (webAttempted) {
    summary = `【来源: ${EVIDENCE_SOURCE_IN_SESSION}】已尝试全网检索但未取得可用结果，使用会话内材料。`;
    content =
      `基于当前目标「${String(goalText).slice(0, 120)}」整理了可引用的会话内要点。` +
      `已发起全网检索（F2），但未命中可接地来源（超时、无结果或检索服务不可用）。` +
      `未找到 GitHub 仓库线索，故未走 F1 取数。`;
    degradedReason = "web_search_failed";
  } else {
    summary = `【来源: ${EVIDENCE_SOURCE_IN_SESSION}】未找到可检索的公开仓库线索，使用会话内材料。`;
    content =
      `基于当前目标「${String(goalText).slice(0, 120)}」整理了可引用的会话内要点。` +
      `未发起外部网络检索。`;
    degradedReason = "no_github_clue";
  }

  return {
    title: "外部证据检索（规则推演）",
    summary,
    content,
    provenance: "ai_generated",
    evidenceSource: EVIDENCE_SOURCE_IN_SESSION,
    payload: { degraded: true, degradedReason },
  };
}

function ruleRepoFallback(state: V5SessionState): RawExecutorResult {
  const goalText = (state as any)?.goal?.text || "";
  return {
    title: "代码仓库检查（规则推演）",
    summary: "未找到 GitHub 仓库线索。",
    content: `未能从目标中识别 github.com/owner/repo 链接：「${String(goalText).slice(0, 160)}」。本轮未引入外部仓库数据。`,
    provenance: "ai_generated",
  };
}

export async function executeRepoInspectMapped(
  state: V5SessionState,
  inputArtifactIds: string[] = [],
  recentTexts: string[] = []
): Promise<RawExecutorResult> {
  const goalText = (state as any)?.goal?.text || "";
  const convo = ((state as any)?.conversation || [])
    .slice(-8)
    .map((c: any) => String(c?.text || ""));
  const url = findGithubUrlInTexts(
    goalText,
    ...convo,
    ...recentTexts,
    ...collectArtifactTexts(state, inputArtifactIds)
  );

  if (!url) {
    const fb = ruleRepoFallback(state);
    return {
      ...fb,
      payload: { degraded: true, degradedReason: "no_github_clue" },
    };
  }

  const slug = extractGithubRepoSlug(url);
  const chunks: string[] = [];
  let title = `代码仓库检查: ${slug}`;
  let summary = `检查 ${slug}`;
  let provenance: string = "ai_generated";

  try {
    const staticResult = await executeRepoStaticInspect("repo.static.inspect", state, inputArtifactIds);
    chunks.push(staticResult.content);
    title = staticResult.title;
    summary = staticResult.summary;
    provenance = staticResult.provenance;
  } catch {
    /* static failed — try github metadata only */
  }

  try {
    const gh = await executeGithubMcpCapability("source.github.inspect", state, inputArtifactIds);
    chunks.push(gh.content);
    title = gh.title;
    summary = gh.summary;
    provenance = gh.provenance;
  } catch {
    if (chunks.length === 0) {
      return {
        title: `代码仓库检查失败: ${slug}`,
        summary: "外部仓库检索失败，已降级为规则说明。",
        content: `尝试检查 ${url} 时网络或服务不可用。本轮未引入外部仓库元数据。`,
        provenance: "ai_generated",
        payload: { degraded: true, degradedReason: "repo_fetch_failed", url },
      };
    }
  }

  return {
    title,
    summary,
    content: chunks.join("\n\n"),
    provenance,
  };
}

export async function executeEvidenceSearchMapped(
  state: V5SessionState,
  inputArtifactIds: string[] = [],
  roleId?: string,
  recentTexts: string[] = []
): Promise<RawExecutorResult> {
  const goalText = (state as any)?.goal?.text || "";
  const convo = ((state as any)?.conversation || [])
    .slice(-8)
    .map((c: any) => String(c?.text || ""));

  const webSearchEnabled = isWebSearchEnabled();

  // F2 · 全网检索（优先，无 GitHub 时亦应走此路径）：goal/对话 → web_search → G-GROUND web:search
  const webResult = webSearchEnabled
    ? await executeWebEvidenceSearch(state, recentTexts)
    : null;
  if (webResult) {
    return webResult;
  }

  const url = findGithubUrlInTexts(
    goalText,
    ...convo,
    ...recentTexts,
    ...collectArtifactTexts(state, inputArtifactIds)
  );

  if (!url) {
    return ruleEvidenceFallback(state, roleId, {
      webSearchAttempted: webSearchEnabled,
      webSearchDisabled: !webSearchEnabled,
    });
  }

  // F1 · GitHub 取数（有仓库链接且 F2 未命中时）
  try {
    const gh = await executeGithubMcpCapability("evidence.github.collect", state, inputArtifactIds);
    // Tag the F1 result as F1_Github_Source 取数 (Requirement 5.2) without altering F1's own
    // content or provenance ("mcp:github") — F1 behavior is preserved.
    return {
      ...gh,
      summary: `【来源: ${EVIDENCE_SOURCE_F1_GITHUB}】${gh.summary}`,
      evidenceSource: EVIDENCE_SOURCE_F1_GITHUB,
    };
  } catch {
    // Graceful degradation (Requirement 5.6): F1 fetch failed → fall back to in-conversation
    // synthesis (会话内综合). Never throws; no new external evidence is introduced this round.
    return {
      title: "外部证据检索失败",
      summary: `【来源: ${EVIDENCE_SOURCE_IN_SESSION}】GitHub 证据收集不可用，已降级为会话内综合。`,
      content: `尝试从 ${url} 收集证据时失败。本轮未引入新的外部证据，改用会话内材料综合。`,
      provenance: "ai_generated",
      evidenceSource: EVIDENCE_SOURCE_IN_SESSION,
      payload: { degraded: true, degradedReason: "evidence_fetch_failed", url },
    };
  }
}

function collectArtifactTexts(state: V5SessionState, inputArtifactIds: string[]): string[] {
  const arts: any[] = (state as any)?.artifacts || [];
  return inputArtifactIds
    .map((id) => arts.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => `${a.title || ""} ${a.summary || ""} ${a.content || ""}`);
}