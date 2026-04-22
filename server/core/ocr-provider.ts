import { runVisionPrompt } from "./vision-provider.js";

export const OCR_REGIONS = [
  "top-left",
  "top",
  "top-right",
  "middle-left",
  "middle",
  "middle-right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

export type OCRRegion = (typeof OCR_REGIONS)[number];

export interface OCRTextFragment {
  text: string;
  page: number;
  region?: OCRRegion;
}

export interface OCRPageResult {
  page: number;
  text: string;
}

export interface OCRRecognitionResult {
  text: string;
  fragments: OCRTextFragment[];
  pages: OCRPageResult[];
  rawResponse: string;
}

const DEFAULT_OCR_PROMPT =
  "Extract all visible text from this image in reading order.\n" +
  "Return strict JSON with this exact shape:\n" +
  "{\n" +
  '  "text": "full recognized text",\n' +
  '  "fragments": [\n' +
  '    { "text": "fragment text", "page": 1, "region": "top-left" }\n' +
  "  ],\n" +
  '  "pages": [{ "page": 1, "text": "page text" }]\n' +
  "}\n" +
  "Rules:\n" +
  '- "region" must be one of: top-left, top, top-right, middle-left, middle, middle-right, bottom-left, bottom, bottom-right.\n' +
  '- Use page = 1 for a single image.\n' +
  '- If no text is visible, return {"text":"","fragments":[],"pages":[{"page":1,"text":""}]}\n' +
  "- Do not include markdown fences or commentary.";

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function normalizeTextValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 1;
}

function normalizeRegion(value: unknown): OCRRegion | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as OCRRegion;
  return OCR_REGIONS.includes(normalized) ? normalized : undefined;
}

function extractJsonCandidate(raw: string): string | null {
  const unfenced = stripMarkdownFences(raw);

  if (unfenced.startsWith("{") && unfenced.endsWith("}")) {
    return unfenced;
  }

  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return unfenced.slice(firstBrace, lastBrace + 1).trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildLineFragments(text: string): OCRTextFragment[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({ text: line, page: 1 }));
}

function normalizeFragments(
  value: unknown,
  fallbackText: string,
): OCRTextFragment[] {
  if (!Array.isArray(value)) {
    return buildLineFragments(fallbackText);
  }

  const fragments = value.flatMap(fragment => {
    if (!fragment || typeof fragment !== "object" || Array.isArray(fragment)) {
      return [];
    }

    const record = fragment as Record<string, unknown>;
    const text = normalizeTextValue(record.text);
    if (!text) {
      return [];
    }

    return [
      {
        text,
        page: normalizePageNumber(record.page),
        region: normalizeRegion(record.region),
      },
    ];
  });

  return fragments.length > 0 ? fragments : buildLineFragments(fallbackText);
}

function normalizePages(
  value: unknown,
  fallbackText: string,
  fragments: OCRTextFragment[],
): OCRPageResult[] {
  if (Array.isArray(value)) {
    const pages = value.flatMap(page => {
      if (!page || typeof page !== "object" || Array.isArray(page)) {
        return [];
      }

      const record = page as Record<string, unknown>;
      return [
        {
          page: normalizePageNumber(record.page),
          text: normalizeTextValue(record.text),
        },
      ];
    });

    if (pages.length > 0) {
      return pages;
    }
  }

  const byPage = new Map<number, string[]>();
  for (const fragment of fragments) {
    const lines = byPage.get(fragment.page) ?? [];
    lines.push(fragment.text);
    byPage.set(fragment.page, lines);
  }

  if (byPage.size > 0) {
    return [...byPage.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, lines]) => ({
        page,
        text: lines.join("\n"),
      }));
  }

  return [{ page: 1, text: fallbackText }];
}

export function parseOCRResponse(raw: string): OCRRecognitionResult {
  const trimmed = raw.trim();
  const parsed = parseJsonObject(trimmed);

  if (parsed) {
    const parsedText = normalizeTextValue(parsed.text);
    const fragments = normalizeFragments(parsed.fragments, parsedText);
    const text =
      parsedText || fragments.map(fragment => fragment.text).join("\n").trim();
    const pages = normalizePages(parsed.pages, text, fragments);

    return {
      text,
      fragments,
      pages,
      rawResponse: trimmed,
    };
  }

  const fallbackText = stripMarkdownFences(trimmed);
  const fragments = normalizeFragments(undefined, fallbackText);

  return {
    text: fallbackText,
    fragments,
    pages: normalizePages(undefined, fallbackText, fragments),
    rawResponse: trimmed,
  };
}

export async function recognizeImageText(
  base64DataUrl: string,
  prompt?: string,
): Promise<OCRRecognitionResult> {
  const rawResponse = await runVisionPrompt(
    base64DataUrl,
    prompt || DEFAULT_OCR_PROMPT,
  );

  return parseOCRResponse(rawResponse);
}

export async function recognizeImagesText(
  images: Array<{ base64DataUrl: string; name: string }>,
  prompt?: string,
): Promise<Map<string, OCRRecognitionResult>> {
  const results = await Promise.allSettled(
    images.map(image => recognizeImageText(image.base64DataUrl, prompt)),
  );

  const map = new Map<string, OCRRecognitionResult>();
  for (let index = 0; index < images.length; index++) {
    const result = results[index];
    if (result.status === "fulfilled") {
      map.set(images[index].name, result.value);
    } else {
      console.error(
        `[OCR] Failed to recognize text for "${images[index].name}":`,
        result.reason,
      );
    }
  }

  return map;
}
