import type { RetrievalResult } from "../../shared/rag/contracts.js";
import type { RetrievalOptions } from "../../shared/rag/api.js";
import type {
  WebAigcDocumentSearchHit,
  WebAigcDocumentSearchResponse,
  WebAigcFragmentSearchHit,
  WebAigcFragmentSearchResponse,
  WebAigcSearchMode,
  WebAigcSearchRequest,
} from "../../shared/rag/web-aigc-search.js";

function normalizeMode(mode: WebAigcSearchMode | undefined): WebAigcSearchMode {
  return mode ?? "hybrid";
}

function buildSummary(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function buildHighlight(content: string, query: string): string | undefined {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean);

  const lowered = compact.toLowerCase();
  const firstMatch = queryTerms
    .map(term => lowered.indexOf(term))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
  }

  const start = Math.max(0, firstMatch - 40);
  const end = Math.min(compact.length, firstMatch + 80);
  const excerpt = compact.slice(start, end);
  return start > 0 || end < compact.length ? `...${excerpt}...` : excerpt;
}

function buildPositionHint(content: string, query: string) {
  const loweredContent = content.toLowerCase();
  const loweredQuery = query.toLowerCase().trim();
  if (!loweredQuery) return undefined;

  const start = loweredContent.indexOf(loweredQuery);
  if (start < 0) return undefined;

  return {
    start,
    end: start + loweredQuery.length,
  };
}

function toFragmentHit(
  result: RetrievalResult,
  query: string,
): WebAigcFragmentSearchHit {
  const highlight = buildHighlight(result.content, query);
  return {
    chunkId: result.chunkId,
    documentId: result.sourceId,
    sourceType: result.sourceType,
    score: result.score,
    snippet: result.content,
    summary: buildSummary(result.content),
    highlight,
    positionHint: buildPositionHint(result.content, query),
    metadata: result.metadata,
  };
}

export function normalizeWebAigcSearchRequest(
  request: WebAigcSearchRequest,
): RetrievalOptions {
  return {
    projectId: request.scope.projectId,
    topK: request.options?.topK,
    sourceTypes: request.scope.sourceTypes,
    sourceIds: request.scope.documentIds,
    agentId: request.scope.agentId,
    codeLanguage: request.scope.codeLanguage,
    minScore: request.options?.minScore,
    mode: normalizeMode(request.options?.mode),
    expandContext: request.options?.expandContext,
    contextWindowChunks: request.options?.contextWindowChunks,
  };
}

function filterResultsByDocumentIds(
  results: RetrievalResult[],
  documentIds: string[] | undefined,
): RetrievalResult[] {
  if (!documentIds || documentIds.length === 0) return results;
  const allowed = new Set(documentIds);
  return results.filter(result => allowed.has(result.sourceId));
}

export function projectFragmentSearchResponse(args: {
  query: string;
  results: RetrievalResult[];
  documentIds?: string[];
  latencyMs: number;
  mode: WebAigcSearchMode;
}): WebAigcFragmentSearchResponse {
  const filtered = filterResultsByDocumentIds(args.results, args.documentIds);
  return {
    query: args.query,
    results: filtered.map(result => toFragmentHit(result, args.query)),
    totalCandidates: filtered.length,
    latencyMs: args.latencyMs,
    mode: args.mode,
  };
}

export function projectDocumentSearchResponse(args: {
  query: string;
  results: RetrievalResult[];
  documentIds?: string[];
  latencyMs: number;
  mode: WebAigcSearchMode;
}): WebAigcDocumentSearchResponse {
  const filtered = filterResultsByDocumentIds(args.results, args.documentIds);
  const groups = new Map<string, WebAigcDocumentSearchHit>();

  for (const result of filtered) {
    const fragment = toFragmentHit(result, args.query);
    const existing = groups.get(result.sourceId);
    if (existing) {
      existing.score = Math.max(existing.score, result.score);
      existing.highlights = Array.from(
        new Set([...existing.highlights, fragment.highlight].filter(Boolean) as string[]),
      ).slice(0, 3);
      existing.fragments.push(fragment);
      continue;
    }

    groups.set(result.sourceId, {
      documentId: result.sourceId,
      sourceType: result.sourceType,
      score: result.score,
      summary: fragment.summary,
      highlights: fragment.highlight ? [fragment.highlight] : [],
      fragments: [fragment],
    });
  }

  const results = Array.from(groups.values())
    .map(group => ({
      ...group,
      fragments: group.fragments.sort((left, right) => right.score - left.score),
    }))
    .sort((left, right) => right.score - left.score);

  return {
    query: args.query,
    results,
    totalCandidates: filtered.length,
    latencyMs: args.latencyMs,
    mode: args.mode,
  };
}

export function validateWebAigcSearchRequest(
  body: Partial<WebAigcSearchRequest> | undefined,
): string | null {
  if (!body?.query || !body.query.trim()) {
    return "query is required";
  }

  if (!body.scope?.projectId || !body.scope.projectId.trim()) {
    return "scope.projectId is required";
  }

  return null;
}
