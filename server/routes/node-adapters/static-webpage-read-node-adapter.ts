import type {
  StaticWebpageReadLink,
  StaticWebpageReadNodeExecutionRequest,
  StaticWebpageReadNodeExecutionResult,
  StaticWebpageReadNodeInput,
  StaticWebpageReadNodeType,
  StaticWebpageReadPagePayload,
  WebAigcStaticWebpagePythonRuntimeResponse,
} from "../../../shared/static-webpage-read.js";
import { parseHtml } from "./html-parser.js";

export interface StaticWebpageReadNodeAdapterDeps {
  fetchHtml?: (url: string) => Promise<string>;
  executePythonRuntime?: (
    input: StaticWebpageReadNodeInput,
  ) => Promise<WebAigcStaticWebpagePythonRuntimeResponse>;
}

interface SearchAdapterProvenance extends Record<string, unknown> {
  provider: string;
  source: string;
  query: string;
  auditId?: string;
  permission?: Record<string, unknown>;
}

type StaticWebpageReadContractResult = StaticWebpageReadNodeExecutionResult & {
  output: StaticWebpageReadNodeExecutionResult["output"] & {
    query?: string;
    provenance?: SearchAdapterProvenance;
  };
};

const DEFAULT_TITLE = "Static Webpage Read Result";
const DEFAULT_FALLBACK_CONTENT =
  "网页抓取暂不可用，请稍后重试，或改用搜索摘要/知识兜底链路。";

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMaxChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1600;
  }

  return Math.max(120, Math.min(6000, Math.floor(value)));
}

/**
 * Legacy stripHtml — kept as internal fallback for edge cases.
 * The main path now uses parseHtml() from html-parser.ts.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars - 1).trimEnd()}...`;
}

function extractTitle(html: string, titleHint?: string): string {
  const parsed = parseHtml(html, { maxLinks: 0 });
  return (
    normalizeString(parsed.metadata.title) ||
    normalizeString(titleHint) ||
    DEFAULT_TITLE
  );
}

function extractLinks(html: string, includeLinks: boolean): StaticWebpageReadLink[] {
  if (!includeLinks) {
    return [];
  }

  const parsed = parseHtml(html, { maxLinks: 20 });
  return parsed.links.map(link => ({
    href: link.href,
    label: link.text,
  }));
}

function buildSnippet(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= 220 ? compact : `${compact.slice(0, 219).trimEnd()}...`;
}

function normalizeContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function normalizeProvenance(
  value: unknown,
  query: string | undefined,
): SearchAdapterProvenance | undefined {
  const record = normalizeContext(value);
  const provider = normalizeString(record.provider);
  const source = normalizeString(record.source);
  const provenanceQuery = normalizeString(record.query) || query;

  if (!provider || !source || !provenanceQuery) {
    return undefined;
  }

  const auditId = normalizeString(record.auditId);
  const permission = normalizeContext(record.permission);

  return {
    provider,
    source,
    query: provenanceQuery,
    ...(auditId ? { auditId } : {}),
    ...(Object.keys(permission).length > 0 ? { permission } : {}),
  };
}

function ensureInput(input: StaticWebpageReadNodeInput | undefined): {
  url?: string;
  html?: string;
  titleHint?: string;
  includeLinks: boolean;
  maxChars: number;
  fallbackEnabled: boolean;
  fallbackTitle?: string;
  fallbackContent?: string;
  fallbackSnippet?: string;
  context: Record<string, unknown>;
  query?: string;
  provenance?: SearchAdapterProvenance;
} {
  const url = normalizeString(input?.url);
  const html = normalizeString(input?.html);
  const titleHint = normalizeString(input?.titleHint);
  const includeLinks = normalizeBoolean(input?.extraction?.includeLinks, true);
  const maxChars = normalizeMaxChars(input?.extraction?.maxChars);
  const fallbackEnabled = normalizeBoolean(input?.fallback?.enabled, true);
  const fallbackTitle = normalizeString(input?.fallback?.title);
  const fallbackContent = normalizeString(input?.fallback?.content);
  const fallbackSnippet = normalizeString(input?.fallback?.snippet);
  const context = normalizeContext(input?.context);
  const query = url || titleHint;

  if (!url && !html) {
    throw new Error("Static webpage read requires url or html.");
  }

  return {
    url,
    html,
    titleHint,
    includeLinks,
    maxChars,
    fallbackEnabled,
    fallbackTitle,
    fallbackContent,
    fallbackSnippet,
    context,
    query,
    provenance: normalizeProvenance(context.provenance, query),
  };
}

function buildCompletedResult(input: {
  title: string;
  url?: string;
  content: string;
  links: StaticWebpageReadLink[];
  contentSource: "inline_html" | "fetched_html";
  context: Record<string, unknown>;
  warnings: string[];
  query?: string;
  provenance?: SearchAdapterProvenance;
}): StaticWebpageReadContractResult {
  const snippet = buildSnippet(input.content);
  return {
    ok: true,
    nodeType: "static_webpage_read",
    output: {
      status: "completed",
      page: {
        title: input.title,
        ...(input.url ? { url: input.url } : {}),
        content: input.content,
        snippet,
        links: input.links,
        contentSource: input.contentSource,
        fetched: input.contentSource === "fetched_html",
      },
      handoff: {
        webQaPage: {
          ...(input.url ? { href: input.url } : {}),
          title: input.title,
          content: input.content,
          summary: snippet,
          snippet,
        },
        webSearchResult: {
          title: input.title,
          url: input.url ?? "about:static-webpage-read",
          snippet,
          source: "static_webpage_read",
        },
      },
      context: input.context,
      warnings: input.warnings,
      ...(input.query ? { query: input.query } : {}),
      ...(input.provenance ? { provenance: input.provenance } : {}),
      observability: {
        eventKey: "external.static_webpage_read",
        nodeType: "static_webpage_read",
        contentSource: input.contentSource,
        fetched: input.contentSource === "fetched_html",
        linkCount: input.links.length,
        contentLength: input.content.length,
        fallbackUsed: false,
      },
    },
  };
}

function buildFallbackResult(input: {
  title: string;
  url?: string;
  content: string;
  snippet?: string;
  context: Record<string, unknown>;
  warnings: string[];
  query?: string;
  provenance?: SearchAdapterProvenance;
}): StaticWebpageReadContractResult {
  const snippet = normalizeString(input.snippet) ?? buildSnippet(input.content);
  return {
    ok: true,
    nodeType: "static_webpage_read",
    output: {
      status: "fallback",
      page: {
        title: input.title,
        ...(input.url ? { url: input.url } : {}),
        content: input.content,
        snippet,
        links: [],
        contentSource: "fallback",
        fetched: false,
      },
      handoff: {
        webQaPage: {
          ...(input.url ? { href: input.url } : {}),
          title: input.title,
          content: input.content,
          summary: snippet,
          snippet,
        },
        webSearchResult: {
          title: input.title,
          url: input.url ?? "about:static-webpage-read-fallback",
          snippet,
          source: "static_webpage_read",
        },
      },
      context: input.context,
      warnings: input.warnings,
      ...(input.query ? { query: input.query } : {}),
      ...(input.provenance ? { provenance: input.provenance } : {}),
      observability: {
        eventKey: "external.static_webpage_read",
        nodeType: "static_webpage_read",
        contentSource: "fallback",
        fetched: false,
        linkCount: 0,
        contentLength: input.content.length,
        fallbackUsed: true,
      },
    },
  };
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

export function mapPythonStaticWebpageRuntimeResponse(
  response: WebAigcStaticWebpagePythonRuntimeResponse,
  input: StaticWebpageReadNodeInput = {},
): StaticWebpageReadNodeExecutionResult {
  const warnings = Array.isArray(response.warnings) ? [...response.warnings] : [];
  const runtime = response.runtime;
  const meta = normalizeObject(response.metadata);
  const provenance = normalizeObject(response.provenance);
  const permission = normalizeObject(response.permission);
  const audit = normalizeObject(response.audit);
  const baseContext = normalizeContext(input.context);

  if (response.ok && response.status === "success") {
    const pageData = response.page ?? {
      title: DEFAULT_TITLE,
      content: DEFAULT_FALLBACK_CONTENT,
      snippet: "",
    };
    const content = pageData.content || DEFAULT_FALLBACK_CONTENT;
    const snippet = normalizeString(pageData.snippet) ?? buildSnippet(content);
    const page = {
      title: normalizeString(pageData.title) || DEFAULT_TITLE,
      ...(pageData.url ? { url: pageData.url } : {}),
      content,
      snippet,
      links: Array.isArray(pageData.links) ? pageData.links : [],
      contentSource: (pageData.contentSource === "fake_static_page" ? "inline_html" : pageData.contentSource) || "inline_html",
      fetched: pageData.fetched === true,
    } as StaticWebpageReadPagePayload & { fetched: boolean };

    const handoff = {
      webQaPage: {
        ...(page.url ? { href: page.url } : {}),
        title: page.title,
        content: page.content,
        summary: snippet,
        snippet,
      },
      webSearchResult: {
        title: page.title,
        url: page.url ?? "about:static-webpage-read",
        snippet,
        source: "static_webpage_read",
      },
    };

    const out: any = {
      status: "completed",
      pythonStatus: "success" as const,
      page,
      handoff,
      context: {
        ...baseContext,
        ...(Object.keys(meta).length ? { metadata: meta } : {}),
        ...(Object.keys(provenance).length ? { provenance } : {}),
        ...(Object.keys(permission).length ? { permission } : {}),
        ...(Object.keys(audit).length ? { audit } : {}),
      },
      warnings,
      ...(runtime ? { runtime } : {}),
      ...(Object.keys(provenance).length ? { provenance } : {}),
      ...(Object.keys(permission).length ? { permission } : {}),
      ...(Object.keys(audit).length ? { audit } : {}),
      observability: {
        eventKey: "external.static_webpage_read" as const,
        nodeType: "static_webpage_read" as const,
        contentSource: page.contentSource,
        fetched: page.fetched,
        linkCount: page.links.length,
        contentLength: page.content.length,
        fallbackUsed: false,
      },
    };
    return {
      ok: true,
      nodeType: "static_webpage_read",
      output: out,
    };
  }

  // non-success: do not masquerade
  const err = response.error ?? {
    code: response.status === "provider_missing" ? "provider_missing" : response.status === "degraded" ? "provider_degraded" : "runtime_error",
    message: "Python static webpage runtime did not return success.",
  };
  const status = response.status === "degraded" ? "degraded" : "error";
  return {
    ok: false,
    nodeType: "static_webpage_read",
    output: {
      status,
      pythonStatus: response.status,
      context: {
        ...baseContext,
        ...(Object.keys(meta).length ? { metadata: meta } : {}),
        ...(Object.keys(provenance).length ? { provenance } : {}),
        ...(Object.keys(permission).length ? { permission } : {}),
        ...(Object.keys(audit).length ? { audit } : {}),
      },
      warnings: [...warnings, `python static status=${response.status}`],
      error: err,
      ...(runtime ? { runtime } : {}),
      ...(Object.keys(provenance).length ? { provenance } : {}),
      ...(Object.keys(permission).length ? { permission } : {}),
      ...(Object.keys(audit).length ? { audit } : {}),
    },
  };
}

export function isStaticWebpageReadNodeType(
  value: unknown,
): value is StaticWebpageReadNodeType {
  return value === "static_webpage_read";
}

export async function executeStaticWebpageReadNode(
  request: StaticWebpageReadNodeExecutionRequest,
  deps: StaticWebpageReadNodeAdapterDeps = {},
): Promise<StaticWebpageReadContractResult> {
  if (!isStaticWebpageReadNodeType(request.nodeType)) {
    throw new Error("Unsupported static_webpage_read node type.");
  }

  if (deps.executePythonRuntime) {
    const pyResponse = await deps.executePythonRuntime(request.input ?? {});
    return mapPythonStaticWebpageRuntimeResponse(pyResponse, request.input ?? {}) as StaticWebpageReadContractResult;
  }

  const normalized = ensureInput(request.input);
  const warnings: string[] = [];

  let html = normalized.html;
  let contentSource: "inline_html" | "fetched_html" = "inline_html";

  if (!html && normalized.url) {
    if (!deps.fetchHtml) {
      throw new Error("Static webpage read requires fetchHtml when html is not provided.");
    }

    try {
      html = await deps.fetchHtml(normalized.url);
      contentSource = "fetched_html";
    } catch (error) {
      if (!normalized.fallbackEnabled) {
        throw new Error(
          `Static webpage read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      warnings.push(
        `网页抓取失败，已回退到静态摘要输出：${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return buildFallbackResult({
        title: normalized.fallbackTitle || normalized.titleHint || DEFAULT_TITLE,
        url: normalized.url,
        content: normalized.fallbackContent || DEFAULT_FALLBACK_CONTENT,
        snippet: normalized.fallbackSnippet,
        context: normalized.context,
        warnings,
        query: normalized.query,
        provenance: normalized.provenance,
      });
    }
  }

  if (!html) {
    throw new Error("Static webpage read could not resolve html content.");
  }

  const title = extractTitle(html, normalized.titleHint);
  const links = extractLinks(html, normalized.includeLinks);
  const parsed = parseHtml(html);
  const content = truncateText(parsed.content, normalized.maxChars);

  if (!content) {
    warnings.push("网页正文提取结果为空，已输出最小摘要占位内容。");
  }

  return buildCompletedResult({
    title,
    url: normalized.url,
    content: content || DEFAULT_FALLBACK_CONTENT,
    links,
    contentSource,
    context: normalized.context,
    warnings,
    query: normalized.query,
    provenance: normalized.provenance,
  });
}
