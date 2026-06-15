/**
 * Real web search provider for the web_search AIGC node.
 *
 * Strategy:
 * 1. If WEB_SEARCH_API_KEY env var exists → use SerpAPI-compatible endpoint
 * 2. Otherwise → Bing China HTML (cn.bing.com) when WEB_SEARCH_CN_ENABLED !== "0"
 * 3. Then → DuckDuckGo HTML search as international fallback
 * 4. On any failure → return mock fallback results
 */
import type {
  WebSearchRequest,
  WebSearchResponse,
  WebSearchResultItem,
} from "../../shared/web-search.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const FIRST_PASS_TIMEOUT_MS = Math.max(
  3_000,
  Number.parseInt(process.env.WEB_SEARCH_FIRST_TIMEOUT_MS || "8000", 10) || 8_000
);
const CACHE_TTL_MS = Math.max(
  30_000,
  Number.parseInt(process.env.WEB_SEARCH_CACHE_TTL_MS || "300000", 10) || 300_000
);
const HTML_SEARCH_RETRY_DELAY_MS = 400;

type CacheEntry = { expiresAt: number; response: WebSearchResponse };
const searchCache = new Map<string, CacheEntry>();

/** Test seam — clear in-memory search cache. */
export function __clearWebSearchCacheForTests(): void {
  searchCache.clear();
}

function cacheKey(query: string, topK: number, apiKey?: string): string {
  return `${apiKey ? "api" : "html"}\0${topK}\0${query.trim().toLowerCase()}`;
}

function readCached(key: string): WebSearchResponse | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return hit.response;
}

function writeCache(key: string, response: WebSearchResponse): void {
  searchCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, response });
}
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB for search HTML
const USER_AGENT =
  "Mozilla/5.0 (compatible; SlideRule/1.0; +https://github.com/nicepkg/sliderule)";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Bing China HTML scrape (default on). Set WEB_SEARCH_CN_ENABLED=0 to skip. */
export function isBingCnSearchEnabled(): boolean {
  return process.env.WEB_SEARCH_CN_ENABLED !== "0";
}

const FALLBACK_RESULTS: WebSearchResultItem[] = [
  {
    title: "SlideRule Web Search Mock Overview",
    url: "https://example.test/web-search/cube-overview",
    snippet:
      "Cube Web Search mock result describing how search output can feed web QA and static webpage reading nodes.",
    source: "mock-search-index",
  },
  {
    title: "Web QA Integration Notes",
    url: "https://example.test/web-search/web-qa-integration",
    snippet:
      "Guidance for linking web_search output into downstream QA, summary, and page reading workflows.",
    source: "mock-search-index",
  },
  {
    title: "Static Webpage Read Companion",
    url: "https://example.test/web-search/static-webpage-read",
    snippet:
      "A mock page showing the expected handoff from search results to webpage content extraction.",
    source: "mock-search-index",
  },
];

function buildFallbackResponse(
  query: string,
  latencyMs: number,
): WebSearchResponse {
  return {
    query,
    results: FALLBACK_RESULTS,
    totalCandidates: FALLBACK_RESULTS.length,
    latencyMs,
    mode: "mock",
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Error(
      `Response too large: ${contentLength} bytes exceeds ${maxBytes} limit`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new Error(
        `Response too large: exceeded ${maxBytes} byte limit during streaming`,
      );
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") +
    decoder.decode();
}

// ── SerpAPI-compatible search ──

async function searchWithApi(
  query: string,
  apiKey: string,
  topK: number,
): Promise<WebSearchResultItem[]> {
  const baseUrl =
    process.env.WEB_SEARCH_API_URL || "https://serpapi.com/search.json";
  const url = new URL(baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(topK));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Search API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    organic_results?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
    }>;
  };

  const results: WebSearchResultItem[] = (data.organic_results ?? [])
    .filter((item) => item.title && item.link)
    .slice(0, topK)
    .map((item) => ({
      title: item.title!,
      url: item.link!,
      snippet: item.snippet ?? "",
      source: "serpapi",
    }));

  return results;
}

function stripHtmlText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&ensp;/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

// ── Bing China HTML scraping ──

export function parseBingCnHtml(html: string, topK: number): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  const titleRegex =
    /<h2[^>]*><a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/gi;
  const captionRegex =
    /<div class="b_caption"[^>]*><p[^>]*>([\s\S]*?)<\/p>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = titleRegex.exec(html)) !== null) {
    const url = match[1].trim();
    const title = stripHtmlText(match[2]);
    if (url && title && !url.includes("bing.com/search")) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = captionRegex.exec(html)) !== null) {
    snippets.push(stripHtmlText(match[1]));
  }

  for (let i = 0; i < Math.min(links.length, topK); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
      source: "bing-cn",
    });
  }

  return results;
}

async function searchWithBingCnOnce(
  query: string,
  topK: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WebSearchResultItem[]> {
  const url = new URL("https://cn.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("setlang", "zh-Hans");
  url.searchParams.set("cc", "CN");

  const response = await fetchWithTimeout(url.toString(), {
    timeoutMs,
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`Bing CN returned ${response.status}`);
  }

  const html = await readResponseText(response, MAX_RESPONSE_BYTES);
  if (/captcha|安全验证|unusual traffic/i.test(html) && !html.includes('class="b_algo"')) {
    throw new Error("Bing CN returned anti-bot page");
  }

  return parseBingCnHtml(html, topK);
}

async function searchWithBingCn(
  query: string,
  topK: number,
): Promise<WebSearchResultItem[]> {
  try {
    return await searchWithBingCnOnce(query, topK);
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, HTML_SEARCH_RETRY_DELAY_MS));
    try {
      return await searchWithBingCnOnce(query, topK);
    } catch {
      throw firstError;
    }
  }
}

// ── DuckDuckGo HTML scraping ──

function parseDuckDuckGoHtml(html: string, topK: number): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];

  // DuckDuckGo HTML search returns results in <a class="result__a"> with
  // snippets in <a class="result__snippet">
  const resultBlockRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = resultBlockRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const rawTitle = match[2].replace(/<[^>]+>/g, "").trim();
    if (rawUrl && rawTitle) {
      // DuckDuckGo wraps URLs through a redirect; extract the actual URL
      const normalizedUrl = rawUrl.replace(/&amp;/gi, "&");
      const decodedUrl = decodeURIComponent(
        normalizedUrl.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0],
      );
      links.push({
        url: decodedUrl.startsWith("http") ? decodedUrl : rawUrl,
        title: rawTitle,
      });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < Math.min(links.length, topK); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
      source: "duckduckgo",
    });
  }

  return results;
}

async function searchWithDuckDuckGoOnce(
  query: string,
  topK: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WebSearchResultItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetchWithTimeout(url, {
    timeoutMs,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned ${response.status}`);
  }

  const html = await readResponseText(response, MAX_RESPONSE_BYTES);
  return parseDuckDuckGoHtml(html, topK);
}

async function searchWithDuckDuckGo(
  query: string,
  topK: number,
): Promise<WebSearchResultItem[]> {
  try {
    return await searchWithDuckDuckGoOnce(query, topK);
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, HTML_SEARCH_RETRY_DELAY_MS));
    try {
      return await searchWithDuckDuckGoOnce(query, topK);
    } catch {
      throw firstError;
    }
  }
}

async function searchWithHtmlProviders(
  query: string,
  topK: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WebSearchResultItem[]> {
  const firstTimeout = Math.min(timeoutMs, FIRST_PASS_TIMEOUT_MS);
  const secondTimeout = timeoutMs;

  if (isBingCnSearchEnabled()) {
    try {
      const bingResults = await searchWithBingCnOnce(query, topK, firstTimeout);
      if (bingResults.length > 0) return bingResults;
    } catch {
      try {
        const bingRetry = await searchWithBingCnOnce(query, topK, secondTimeout);
        if (bingRetry.length > 0) return bingRetry;
      } catch {
        /* fall through */
      }
    }
  }

  try {
    const ddgResults = await searchWithDuckDuckGoOnce(query, topK, firstTimeout);
    if (ddgResults.length > 0) return ddgResults;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, HTML_SEARCH_RETRY_DELAY_MS));
    const ddgRetry = await searchWithDuckDuckGoOnce(query, topK, secondTimeout);
    if (ddgRetry.length > 0) return ddgRetry;
  }

  return [];
}

// ── Public API ──

export async function executeRealWebSearch(
  request: WebSearchRequest,
): Promise<WebSearchResponse> {
  const startedAt = Date.now();
  const topK = request.options?.topK ?? 3;
  const timeoutMs = request.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const apiKey = process.env.WEB_SEARCH_API_KEY?.trim();
  const key = cacheKey(request.query, topK, apiKey);

  if (!request.options?.skipCache) {
    const cached = readCached(key);
    if (cached) {
      return { ...cached, latencyMs: Math.max(0, Date.now() - startedAt) };
    }
  }

  try {
    let results: WebSearchResultItem[];

    if (apiKey) {
      results = await searchWithApi(request.query, apiKey, topK);
    } else {
      results = await searchWithHtmlProviders(request.query, topK, timeoutMs);
    }

    if (results.length === 0) {
      // If real search returned nothing, fall back to mock
      const latencyMs = Math.max(0, Date.now() - startedAt);
      return buildFallbackResponse(request.query, latencyMs);
    }

    const latencyMs = Math.max(0, Date.now() - startedAt);
    const response: WebSearchResponse = {
      query: request.query,
      results,
      totalCandidates: results.length,
      latencyMs,
      mode: "hybrid",
    };
    if (!request.options?.skipCache) {
      writeCache(key, response);
    }
    return response;
  } catch {
    // Graceful fallback: return mock results on any failure
    const latencyMs = Math.max(0, Date.now() - startedAt);
    return buildFallbackResponse(request.query, latencyMs);
  }
}
