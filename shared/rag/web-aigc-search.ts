import type { ChunkMetadata, SourceType } from "./contracts.js";

export const WEB_AIGC_SEARCH_API = {
  DOCUMENT_SEARCH: "POST /api/rag/web-aigc/document-search",
  FRAGMENT_SEARCH: "POST /api/rag/web-aigc/fragment-search",
} as const;

export type WebAigcSearchMode = "semantic" | "keyword" | "hybrid";

export interface WebAigcSearchScope {
  projectId: string;
  sourceTypes?: SourceType[];
  documentIds?: string[];
  agentId?: string;
  codeLanguage?: string;
}

export interface WebAigcSearchOptions {
  topK?: number;
  minScore?: number;
  mode?: WebAigcSearchMode;
  expandContext?: boolean;
  contextWindowChunks?: number;
}

export interface WebAigcSearchRequest {
  query: string;
  scope: WebAigcSearchScope;
  options?: WebAigcSearchOptions;
}

export interface WebAigcPositionHint {
  start: number;
  end: number;
}

export interface WebAigcFragmentSearchHit {
  chunkId: string;
  documentId: string;
  sourceType: SourceType;
  score: number;
  snippet: string;
  summary: string;
  highlight?: string;
  positionHint?: WebAigcPositionHint;
  metadata: ChunkMetadata;
}

export interface WebAigcDocumentSearchHit {
  documentId: string;
  sourceType: SourceType;
  score: number;
  summary: string;
  highlights: string[];
  fragments: WebAigcFragmentSearchHit[];
}

export interface WebAigcDocumentSearchResponse {
  query: string;
  results: WebAigcDocumentSearchHit[];
  totalCandidates: number;
  latencyMs: number;
  mode: WebAigcSearchMode;
}

export interface WebAigcFragmentSearchResponse {
  query: string;
  results: WebAigcFragmentSearchHit[];
  totalCandidates: number;
  latencyMs: number;
  mode: WebAigcSearchMode;
}

export interface WebAigcSearchErrorResponse {
  error: string;
}
