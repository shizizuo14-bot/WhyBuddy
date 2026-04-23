import type {
  ChunkRecord,
  IngestionPayload,
  RetrievalResult,
  SourceType,
} from "./rag/contracts.js";

export const WEB_AIGC_FILE_SLICING_API = {
  EXECUTE: "POST /api/file-slicing/nodes/execute",
} as const;

export type FileSlicingNodeType = "file_slicing";
export type FileSlicingFileType = "text" | "markdown" | "json" | "log" | "html";
export type FileSlicingStrategy = "fixed_window" | "paragraph" | "line";

export interface FileSlicingNodeInput {
  sourceType?: SourceType;
  sourceId?: string;
  projectId?: string;
  fileName?: string;
  fileType?: FileSlicingFileType;
  content?: string;
  strategy?: {
    mode?: FileSlicingStrategy;
    maxChars?: number;
    overlapChars?: number;
    preserveParagraphs?: boolean;
  };
  metadata?: Record<string, unknown>;
}

export interface FileSlicingNodeExecutionRequest {
  nodeType: FileSlicingNodeType;
  input?: FileSlicingNodeInput;
}

export interface FileSlicingChunkPreview {
  chunkId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: ChunkRecord["metadata"] & {
    fileType: FileSlicingFileType;
    slicingMode: FileSlicingStrategy;
    fileName?: string;
  };
}

export interface FileSlicingNodeExecutionResult {
  ok: true;
  nodeType: FileSlicingNodeType;
  output: {
    status: "completed";
    sourceType: SourceType;
    sourceId: string;
    projectId: string;
    fileType: FileSlicingFileType;
    strategy: {
      mode: FileSlicingStrategy;
      maxChars: number;
      overlapChars: number;
      preserveParagraphs: boolean;
    };
    chunks: FileSlicingChunkPreview[];
    ingestionPayloads: IngestionPayload[];
    retrievalPreview: RetrievalResult[];
    warnings: string[];
    observability: {
      eventKey: "content.file_slicing";
      nodeType: FileSlicingNodeType;
      chunkCount: number;
      fileType: FileSlicingFileType;
      strategyMode: FileSlicingStrategy;
      totalChars: number;
    };
  };
}
