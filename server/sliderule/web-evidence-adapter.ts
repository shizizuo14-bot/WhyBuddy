/**
 * F2 · Web evidence seam for SlideRule evidence.search (全网检索).
 * Reuses server/core/web-search-provider (SerpAPI / Bing CN / DuckDuckGo / graceful mock).
 */

import { readEnvCompat } from "../../shared/env/read-env-compat.js";
import type { V5SessionState } from "../../shared/blueprint/v5-reasoning-state.js";
import { executeRealWebSearch } from "../core/web-search-provider.js";
import type { WebSearchResponse } from "../../shared/web-search.js";
export const EVIDENCE_SOURCE_WEB_SEARCH = "F2_Web_Search 取数" as const;

export type WebEvidenceResult = {
  title: string;
  summary: string;
  content: string;
  provenance: string;
  evidenceSource: typeof EVIDENCE_SOURCE_WEB_SEARCH;
  payload?: Record<string, unknown>;
};

export type WebSearchExecutor = typeof executeRealWebSearch;

let webSearchExecutor: WebSearchExecutor = executeRealWebSearch;

/** Test seam — inject mock search without network. */
export function __setWebSearchExecutorForTests(fn: WebSearchExecutor | undefined): void {
  webSearchExecutor = fn ?? executeRealWebSearch;
}

export function isWebSearchEnabled(): boolean {
  return readEnvCompat("SLIDERULE_WEB_SEARCH_ENABLED") !== "0";
}

const TECH_TOKEN_RE =
  /LLM|GPT|Agent|RPG|API|MCP|RAG|多\s*Agent|游戏引擎|自定义|架构|framework|multi-?agent/gi;

/** Extract technical tokens so Bing/DDG do not match homographs (e.g. 写). */
export function extractTechSearchTerms(text: string): string[] {
  const raw = String(text || "");
  const hits = raw.match(TECH_TOKEN_RE) ?? [];
  const normalized = hits.map((t) => t.replace(/\s+/g, "").trim()).filter(Boolean);
  return [...new Set(normalized)];
}

/** Build a search query biased toward technical evidence (not literal Chinese verbs). */
export function buildEvidenceSearchQuery(
  state: V5SessionState,
  recentTexts: string[] = []
): string {
  const goal = (state.goal?.text || "").trim();
  const userTurns = ((state.conversation || [])
    .slice(-3)
    .filter((c) => c.role === "user")
    .map((c) => String(c.text || "").trim())
    .filter((t) => t && t !== goal)) as string[];

  const techTerms = [
    ...extractTechSearchTerms(goal),
    ...recentTexts.flatMap((t) => extractTechSearchTerms(t)),
    ...userTurns.flatMap((t) => extractTechSearchTerms(t)),
  ];
  const uniqueTech = [...new Set(techTerms)];

  if (uniqueTech.length >= 2) {
    const en = uniqueTech
      .map((t) =>
        t
          .replace(/多Agent/gi, "multi-agent")
          .replace(/游戏引擎/g, "game engine")
          .replace(/自定义/g, "custom")
          .replace(/架构/g, "architecture")
      )
      .join(" ");
    return `${en} software system design`.slice(0, 220);
  }

  const supplement = userTurns[0] || recentTexts.find((t) => t && t !== goal) || "";
  const merged = supplement ? `${goal} ${supplement}` : goal;
  return merged.slice(0, 220) || "SlideRule evidence search";
}

/** True when results are from a real search provider, not the example.test mock fallback. */
export function isRealWebSearchResponse(res: WebSearchResponse): boolean {
  if (res.mode === "mock") return false;
  if (!res.results?.length) return false;
  return !res.results.every(
    (r) => /example\.test/i.test(r.url) || r.source === "mock-search-index"
  );
}

export function formatWebEvidenceLines(res: WebSearchResponse): string {
  return res.results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   摘要: ${String(r.snippet || "").slice(0, 280)}\n   source=${r.source}`
    )
    .join("\n\n");
}

export async function executeWebEvidenceSearch(
  state: V5SessionState,
  recentTexts: string[] = [],
  topK = 5
): Promise<WebEvidenceResult | null> {
  if (!isWebSearchEnabled()) return null;

  const query = buildEvidenceSearchQuery(state, recentTexts);
  try {
    const res = await webSearchExecutor({
      query,
      options: {
        topK,
        timeoutMs: Number.parseInt(process.env.WEB_SEARCH_FIRST_TIMEOUT_MS || "8000", 10) || 8_000,
      },
    });
    if (!isRealWebSearchResponse(res)) return null;

    const lines = formatWebEvidenceLines(res);
    const domains = [
      ...new Set(
        res.results
          .map((r) => {
            try {
              return new URL(r.url).hostname;
            } catch {
              return "";
            }
          })
          .filter(Boolean)
      ),
    ];

    return {
      title: "全网外部证据检索",
      summary: `【来源: ${EVIDENCE_SOURCE_WEB_SEARCH}】检索「${query.slice(0, 80)}」· ${res.results.length} 条`,
      content:
        `【全网检索 · query=${query}】\n` +
        `mode=${res.mode} · latencyMs=${res.latencyMs} · domains=${domains.join(", ")}\n\n` +
        lines,
      provenance: "web:search",
      evidenceSource: EVIDENCE_SOURCE_WEB_SEARCH,
      payload: {
        query,
        resultCount: res.results.length,
        mode: res.mode,
        domains,
      },
    };
  } catch {
    return null;
  }
}