/**
 * html-parser.ts — Robust regex-based HTML parsing utility
 *
 * Provides structured HTML content extraction without external dependencies.
 * Handles:
 * - Removal of non-content elements (script, style, noscript, iframe, nav, footer, header, aside)
 * - Content area prioritization (article > main > body)
 * - Paragraph structure preservation (block tags → newlines)
 * - Metadata extraction (title, description, og:image)
 * - Link extraction with text and href
 */

export interface ParsedHtmlMetadata {
  title: string;
  description: string;
  ogImage: string;
}

export interface ParsedHtmlLink {
  href: string;
  text: string;
}

export interface ParsedHtmlResult {
  /** Cleaned text content with paragraph structure preserved */
  content: string;
  /** Page metadata */
  metadata: ParsedHtmlMetadata;
  /** Extracted links (up to maxLinks) */
  links: ParsedHtmlLink[];
}

export interface ParseHtmlOptions {
  /** Maximum number of links to extract (default: 30) */
  maxLinks?: number;
}

// ---------------------------------------------------------------------------
// Non-content element removal patterns
// ---------------------------------------------------------------------------

const NON_CONTENT_TAGS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "template",
] as const;

const LAYOUT_NOISE_TAGS = [
  "nav",
  "footer",
  "header",
  "aside",
] as const;

function buildTagRemovalRegex(tag: string): RegExp {
  return new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
}

// ---------------------------------------------------------------------------
// Content area extraction
// ---------------------------------------------------------------------------

function extractContentArea(html: string): string {
  // Priority: <article> > <main> > <body> > full html
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]?.trim()) {
    return articleMatch[1];
  }

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch?.[1]?.trim()) {
    return mainMatch[1];
  }

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]?.trim()) {
    return bodyMatch[1];
  }

  return html;
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

function extractTitle(html: string): string {
  // Try <title> tag first
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    return decodeEntities(titleMatch[1].trim());
  }

  // Fallback to first <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]?.trim()) {
    return decodeEntities(stripAllTags(h1Match[1]).trim());
  }

  return "";
}

function extractMetaDescription(html: string): string {
  // Standard meta description
  const descMatch = html.match(
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*\/?>/i,
  );
  if (descMatch?.[1]?.trim()) {
    return decodeEntities(descMatch[1].trim());
  }

  // Reversed attribute order
  const descMatch2 = html.match(
    /<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*\/?>/i,
  );
  if (descMatch2?.[1]?.trim()) {
    return decodeEntities(descMatch2[1].trim());
  }

  // og:description fallback
  const ogDescMatch = html.match(
    /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*\/?>/i,
  );
  if (ogDescMatch?.[1]?.trim()) {
    return decodeEntities(ogDescMatch[1].trim());
  }

  return "";
}

function extractOgImage(html: string): string {
  const ogImageMatch = html.match(
    /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*\/?>/i,
  );
  if (ogImageMatch?.[1]?.trim()) {
    return ogImageMatch[1].trim();
  }

  // Reversed attribute order
  const ogImageMatch2 = html.match(
    /<meta\b[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*\/?>/i,
  );
  if (ogImageMatch2?.[1]?.trim()) {
    return ogImageMatch2[1].trim();
  }

  return "";
}

// ---------------------------------------------------------------------------
// Link extraction
// ---------------------------------------------------------------------------

function extractLinks(html: string, maxLinks: number): ParsedHtmlLink[] {
  const links: ParsedHtmlLink[] = [];
  const seen = new Set<string>();
  const matcher = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null = matcher.exec(html);
  while (match && links.length < maxLinks) {
    const href = match[1]?.trim();
    const text = decodeEntities(stripAllTags(match[2] ?? "")).trim();

    if (href && !seen.has(href)) {
      seen.add(href);
      links.push({
        href,
        text: text || href,
      });
    }

    match = matcher.exec(html);
  }

  return links;
}

// ---------------------------------------------------------------------------
// Text cleaning utilities
// ---------------------------------------------------------------------------

function stripAllTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCharCode(Number(code)),
    );
}

function convertBlockTagsToNewlines(html: string): string {
  // Convert block-level closing tags to newlines for paragraph structure
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|tr|blockquote|figcaption)>/gi, "\n")
    .replace(/<\/(h[1-6])>/gi, "\n\n")
    .replace(/<(hr)\b[^>]*\/?>/gi, "\n---\n");
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * parseHtml — Robust regex-based HTML parser
 *
 * Extracts structured content, metadata, and links from raw HTML
 * without requiring external dependencies like cheerio.
 */
export function parseHtml(html: string, options?: ParseHtmlOptions): ParsedHtmlResult {
  const maxLinks = options?.maxLinks ?? 30;

  // 1. Extract metadata from full HTML (before stripping)
  const metadata: ParsedHtmlMetadata = {
    title: extractTitle(html),
    description: extractMetaDescription(html),
    ogImage: extractOgImage(html),
  };

  // 2. Extract links from content area (before stripping tags)
  const contentArea = extractContentArea(html);
  const links = extractLinks(contentArea, maxLinks);

  // 3. Remove non-content elements from content area
  let cleaned = contentArea;

  for (const tag of NON_CONTENT_TAGS) {
    cleaned = cleaned.replace(buildTagRemovalRegex(tag), " ");
  }

  for (const tag of LAYOUT_NOISE_TAGS) {
    cleaned = cleaned.replace(buildTagRemovalRegex(tag), " ");
  }

  // 4. Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // 5. Convert block tags to newlines (preserve paragraph structure)
  cleaned = convertBlockTagsToNewlines(cleaned);

  // 6. Strip remaining tags
  cleaned = stripAllTags(cleaned);

  // 7. Decode HTML entities
  cleaned = decodeEntities(cleaned);

  // 8. Normalize whitespace
  const content = normalizeWhitespace(cleaned);

  return {
    content,
    metadata,
    links,
  };
}
