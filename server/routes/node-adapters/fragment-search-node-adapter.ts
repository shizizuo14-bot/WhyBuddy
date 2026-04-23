import type { RetrievalOptions } from "../../../shared/rag/api.js";
import type { RetrievalResult } from "../../../shared/rag/contracts.js";
import type {
  WebAigcFragmentSearchResponse,
  WebAigcSearchMode,
  WebAigcSearchOptions,
  WebAigcSearchRequest,
  WebAigcSearchScope,
} from "../../../shared/rag/web-aigc-search.js";
import {
  normalizeWebAigcSearchRequest,
  projectFragmentSearchResponse,
  validateWebAigcSearchRequest,
} from "../../rag/web-aigc-search-adapter.js";

export type FragmentSearchNodeType = "fragment_search";

export interface FragmentSearchNodeInput {
  query?: string;
  scope?: Partial<WebAigcSearchScope>;
  options?: Partial<WebAigcSearchOptions>;
}

export interface FragmentSearchNodeExecutionRequest {
  nodeType: FragmentSearchNodeType;
  input?: FragmentSearchNodeInput;
}

export interface FragmentSearchNodeExecutionResult {
  ok: true;
  nodeType: FragmentSearchNodeType;
  output: WebAigcFragmentSearchResponse & {
    result: WebAigcFragmentSearchResponse;
    observability: {
      eventKey: "external.knowledge_retrieval";
      nodeType: FragmentSearchNodeType;
      projectId: string;
      queryMode: WebAigcSearchMode;
      latencyMs: number;
      structuredEntityCount: number;
      semanticHitCount: number;
      totalCandidates: number;
    };
  };
}

export interface FragmentSearchNodeAdapterDeps {
  searchFragments?: (
    query: string,
    options: RetrievalOptions,
  ) => Promise<RetrievalResult[]>;
  now?: () => number;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeMode(value: unknown): WebAigcSearchMode | undefined {
  if (value === "semantic" || value === "keyword" || value === "hybrid") {
    return value;
  }

  return undefined;
}

function buildSearchRequest(
  input: FragmentSearchNodeInput | undefined,
): WebAigcSearchRequest {
  const query = normalizeString(input?.query);
  const projectId = normalizeString(input?.scope?.projectId);
  const sourceTypes = normalizeStringArray(
    input?.scope?.sourceTypes,
  ) as WebAigcSearchScope["sourceTypes"] | undefined;
  const documentIds = normalizeStringArray(input?.scope?.documentIds);
  const agentId = normalizeString(input?.scope?.agentId);
  const codeLanguage = normalizeString(input?.scope?.codeLanguage);

  const request: Partial<WebAigcSearchRequest> = {
    query,
    scope: {
      projectId: projectId || "",
      ...(sourceTypes ? { sourceTypes } : {}),
      ...(documentIds ? { documentIds } : {}),
      ...(agentId ? { agentId } : {}),
      ...(codeLanguage ? { codeLanguage } : {}),
    },
    options: {
      ...(typeof input?.options?.topK === "number" ? { topK: input.options.topK } : {}),
      ...(typeof input?.options?.minScore === "number"
        ? { minScore: input.options.minScore }
        : {}),
      ...(normalizeMode(input?.options?.mode)
        ? { mode: normalizeMode(input?.options?.mode) }
        : {}),
      ...(typeof input?.options?.expandContext === "boolean"
        ? { expandContext: input.options.expandContext }
        : {}),
      ...(typeof input?.options?.contextWindowChunks === "number"
        ? { contextWindowChunks: input.options.contextWindowChunks }
        : {}),
    },
  };

  if (Object.keys(request.options ?? {}).length === 0) {
    delete request.options;
  }

  const validationError = validateWebAigcSearchRequest(request);
  if (validationError) {
    throw new Error(validationError);
  }

  return request as WebAigcSearchRequest;
}

export function isFragmentSearchNodeType(
  value: unknown,
): value is FragmentSearchNodeType {
  return value === "fragment_search";
}

export async function executeFragmentSearchNode(
  request: FragmentSearchNodeExecutionRequest,
  deps: FragmentSearchNodeAdapterDeps = {},
): Promise<FragmentSearchNodeExecutionResult> {
  if (!isFragmentSearchNodeType(request.nodeType)) {
    throw new Error("Unsupported fragment search node type.");
  }

  if (!deps.searchFragments) {
    throw new Error(
      "Fragment search node execution requires fragment search retriever wiring.",
    );
  }

  const normalizedRequest = buildSearchRequest(request.input);
  const query = normalizedRequest.query;
  const normalizedOptions = normalizeWebAigcSearchRequest(normalizedRequest);
  const mode = (normalizedOptions.mode ?? "hybrid") as WebAigcSearchMode;
  const now = deps.now ?? Date.now;
  const start = now();

  let results: RetrievalResult[];
  try {
    results = await deps.searchFragments(query, normalizedOptions);
  } catch (error) {
    throw new Error(
      `Fragment search node failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const result = projectFragmentSearchResponse({
    query,
    results,
    documentIds: normalizedRequest.scope?.documentIds,
    latencyMs: Math.max(0, now() - start),
    mode,
  });

  return {
    ok: true,
    nodeType: "fragment_search",
    output: {
      ...result,
      result,
      observability: {
        eventKey: "external.knowledge_retrieval",
        nodeType: "fragment_search",
        projectId: normalizedRequest.scope.projectId,
        queryMode: mode,
        latencyMs: result.latencyMs,
        structuredEntityCount: 0,
        semanticHitCount: result.totalCandidates,
        totalCandidates: result.totalCandidates,
      },
    },
  };
}
