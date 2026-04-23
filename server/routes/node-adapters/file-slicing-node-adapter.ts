import type {
  ChunkMetadata,
  ChunkRecord,
  IngestionPayload,
  RetrievalResult,
  SourceType,
} from "../../../shared/rag/contracts.js";
import type {
  FileSlicingFileType,
  FileSlicingNodeExecutionRequest,
  FileSlicingNodeExecutionResult,
  FileSlicingNodeInput,
  FileSlicingStrategy,
} from "../../../shared/web-aigc-file-slicing.js";

export type FileSlicingNodeType = "file_slicing";

const SUPPORTED_FILE_TYPES: FileSlicingFileType[] = [
  "text",
  "markdown",
  "json",
  "log",
  "html",
];
const SUPPORTED_SOURCE_TYPES: SourceType[] = [
  "document",
  "task_result",
  "mission_log",
  "bug_report",
  "architecture_decision",
];

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.trim().length / 4));
}

function buildContentHash(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  }
  return `fs-${hash.toString(16)}`;
}

function normalizeFileType(value: unknown): FileSlicingFileType {
  return SUPPORTED_FILE_TYPES.includes(value as FileSlicingFileType)
    ? (value as FileSlicingFileType)
    : "text";
}

function normalizeSourceType(value: unknown): SourceType {
  return SUPPORTED_SOURCE_TYPES.includes(value as SourceType)
    ? (value as SourceType)
    : "document";
}

function normalizeMode(value: unknown): FileSlicingStrategy {
  return value === "paragraph" || value === "line" || value === "fixed_window"
    ? value
    : "fixed_window";
}

function normalizePositiveNumber(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(value)));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stripHtml(content: string): string {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeContentByFileType(
  content: string,
  fileType: FileSlicingFileType,
): string {
  if (fileType === "html") {
    return stripHtml(content);
  }

  if (fileType === "json") {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content.trim();
    }
  }

  return content.replace(/\r/g, "").trim();
}

function splitByParagraph(content: string): string[] {
  return content
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitByLine(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitFixedWindow(
  content: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  if (content.length <= maxChars) {
    return [content];
  }

  const parts: string[] = [];
  const step = Math.max(1, maxChars - overlapChars);

  for (let start = 0; start < content.length; start += step) {
    const end = Math.min(content.length, start + maxChars);
    const slice = content.slice(start, end).trim();
    if (slice) {
      parts.push(slice);
    }
    if (end >= content.length) {
      break;
    }
  }

  return parts;
}

function mergeSegments(
  segments: string[],
  maxChars: number,
  overlapChars: number,
  preserveParagraphs: boolean,
): string[] {
  if (segments.length === 0) {
    return [];
  }

  const result: string[] = [];
  let current = "";

  for (const segment of segments) {
    const candidate = current ? `${current}\n\n${segment}` : segment;
    if (candidate.length <= maxChars) {
      if (
        preserveParagraphs &&
        current &&
        current.length >= Math.floor(maxChars * 0.5)
      ) {
        result.push(current.trim());
        current = segment;
        continue;
      }
      current = candidate;
      continue;
    }

    if (current) {
      result.push(current.trim());
    }

    if (segment.length > maxChars && !preserveParagraphs) {
      result.push(...splitFixedWindow(segment, maxChars, overlapChars));
      current = "";
      continue;
    }

    current = segment;
  }

  if (current) {
    result.push(current.trim());
  }

  return result;
}

function createChunks(input: {
  sourceType: SourceType;
  sourceId: string;
  projectId: string;
  fileType: FileSlicingFileType;
  fileName?: string;
  content: string;
  mode: FileSlicingStrategy;
  maxChars: number;
  overlapChars: number;
  preserveParagraphs: boolean;
  metadata: Record<string, unknown>;
}): ChunkRecord[] {
  const normalizedContent = normalizeContentByFileType(input.content, input.fileType);
  let parts: string[] = [];

  if (input.mode === "paragraph") {
    const paragraphs = splitByParagraph(normalizedContent);
    if (input.preserveParagraphs) {
      parts = paragraphs.flatMap((paragraph) =>
        paragraph.length > input.maxChars
          ? splitFixedWindow(paragraph, input.maxChars, input.overlapChars)
          : [paragraph],
      );
    } else {
      parts = mergeSegments(
        paragraphs,
        input.maxChars,
        input.overlapChars,
        false,
      );
    }
  } else if (input.mode === "line") {
    parts = mergeSegments(
      splitByLine(normalizedContent),
      input.maxChars,
      input.overlapChars,
      false,
    );
  } else {
    parts = splitFixedWindow(normalizedContent, input.maxChars, input.overlapChars);
  }

  if (parts.length === 0 && normalizedContent) {
    parts = [normalizedContent];
  }

  const now = new Date().toISOString();

  return parts.map((part, index) => {
    const metadata: ChunkMetadata & {
      fileType: FileSlicingFileType;
      slicingMode: FileSlicingStrategy;
      fileName?: string;
      originalLength: number;
      chunkCharLength: number;
    } = {
      ingestedAt: now,
      lastAccessedAt: now,
      contentHash: buildContentHash(part),
      fileType: input.fileType,
      slicingMode: input.mode,
      originalLength: normalizedContent.length,
      chunkCharLength: part.length,
      ...(input.fileName ? { fileName: input.fileName } : {}),
    };

    return {
      chunkId: `${input.sourceType}:${input.sourceId}:${index}`,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      projectId: input.projectId,
      chunkIndex: index,
      content: part,
      tokenCount: estimateTokenCount(part),
      metadata: {
        ...metadata,
        ...input.metadata,
      },
    };
  });
}

function buildIngestionPayloads(
  chunks: ChunkRecord[],
  baseInput: {
    sourceType: SourceType;
    sourceId: string;
    projectId: string;
    metadata: Record<string, unknown>;
  },
): IngestionPayload[] {
  const now = new Date().toISOString();

  return chunks.map((chunk) => ({
    sourceType: baseInput.sourceType,
    sourceId: `${baseInput.sourceId}#chunk-${chunk.chunkIndex}`,
    projectId: baseInput.projectId,
    content: chunk.content,
    metadata: {
      ...baseInput.metadata,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      parentSourceId: baseInput.sourceId,
      ...chunk.metadata,
    },
    timestamp: now,
  }));
}

function buildRetrievalPreview(chunks: ChunkRecord[]): RetrievalResult[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    score: 1,
    content: chunk.content,
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId,
    metadata: chunk.metadata,
    highlight: chunk.content.slice(0, 160),
    totalCandidates: chunks.length,
  }));
}

function normalizeInput(input: FileSlicingNodeInput | undefined): {
  sourceType: SourceType;
  sourceId: string;
  projectId: string;
  fileName?: string;
  fileType: FileSlicingFileType;
  content: string;
  mode: FileSlicingStrategy;
  maxChars: number;
  overlapChars: number;
  preserveParagraphs: boolean;
  metadata: Record<string, unknown>;
} {
  const sourceType = normalizeSourceType(input?.sourceType);
  const sourceId = normalizeString(input?.sourceId);
  const projectId = normalizeString(input?.projectId);
  const content = normalizeString(input?.content);

  if (!sourceId) {
    throw new Error("File slicing node input requires sourceId.");
  }
  if (!projectId) {
    throw new Error("File slicing node input requires projectId.");
  }
  if (!content) {
    throw new Error("File slicing node input requires content.");
  }

  const mode = normalizeMode(input?.strategy?.mode);
  const maxChars = normalizePositiveNumber(input?.strategy?.maxChars, 1200, 12000);
  const overlapChars = Math.min(
    normalizePositiveNumber(input?.strategy?.overlapChars, 120, 2000),
    Math.max(0, maxChars - 1),
  );
  const preserveParagraphs = normalizeBoolean(
    input?.strategy?.preserveParagraphs,
    mode === "paragraph",
  );

  return {
    sourceType,
    sourceId,
    projectId,
    fileName: normalizeString(input?.fileName),
    fileType: normalizeFileType(input?.fileType),
    content,
    mode,
    maxChars,
    overlapChars,
    preserveParagraphs,
    metadata: normalizeObject(input?.metadata),
  };
}

export function isFileSlicingNodeType(value: unknown): value is FileSlicingNodeType {
  return value === "file_slicing";
}

export async function executeFileSlicingNode(
  request: FileSlicingNodeExecutionRequest,
): Promise<FileSlicingNodeExecutionResult> {
  if (!isFileSlicingNodeType(request.nodeType)) {
    throw new Error("Unsupported file_slicing node type.");
  }

  const normalized = normalizeInput(request.input);
  const warnings: string[] = [];

  if (normalized.fileType === "json" && normalized.mode === "paragraph") {
    warnings.push("JSON 内容在段落切片模式下会先格式化，再按段落聚合。");
  }
  if (normalized.fileType === "html") {
    warnings.push("HTML 内容已执行轻量标签清洗，仅保留正文文本。");
  }

  const chunks = createChunks(normalized);
  const ingestionPayloads = buildIngestionPayloads(chunks, normalized);
  const retrievalPreview = buildRetrievalPreview(chunks);

  return {
    ok: true,
    nodeType: "file_slicing",
    output: {
      status: "completed",
      sourceType: normalized.sourceType,
      sourceId: normalized.sourceId,
      projectId: normalized.projectId,
      fileType: normalized.fileType,
      strategy: {
        mode: normalized.mode,
        maxChars: normalized.maxChars,
        overlapChars: normalized.overlapChars,
        preserveParagraphs: normalized.preserveParagraphs,
      },
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: chunk.metadata as FileSlicingNodeExecutionResult["output"]["chunks"][number]["metadata"],
      })),
      ingestionPayloads,
      retrievalPreview,
      warnings,
      observability: {
        eventKey: "content.file_slicing",
        nodeType: "file_slicing",
        chunkCount: chunks.length,
        fileType: normalized.fileType,
        strategyMode: normalized.mode,
        totalChars: normalized.content.length,
      },
    },
  };
}
