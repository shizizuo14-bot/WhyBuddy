import type {
  StaticWebpageReadLink,
  StaticWebpageReadNodeExecutionRequest,
  StaticWebpageReadNodeExecutionResult,
  StaticWebpageReadNodeInput,
  StaticWebpageReadNodeType,
} from "../../../shared/static-webpage-read.js";
import { parseHtml } from "./html-parser.js";

export interface StaticWebpageReadNodeAdapterDeps {
  fetchHtml?: (url: string) => Promise<string>;
}

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
    context: normalizeContext(input?.context),
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
}): StaticWebpageReadNodeExecutionResult {
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
}): StaticWebpageReadNodeExecutionResult {
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

export function isStaticWebpageReadNodeType(
  value: unknown,
): value is StaticWebpageReadNodeType {
  return value === "static_webpage_read";
}

export async function executeStaticWebpageReadNode(
  request: StaticWebpageReadNodeExecutionRequest,
  deps: StaticWebpageReadNodeAdapterDeps = {},
): Promise<StaticWebpageReadNodeExecutionResult> {
  if (!isStaticWebpageReadNodeType(request.nodeType)) {
    throw new Error("Unsupported static_webpage_read node type.");
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
  });
}
