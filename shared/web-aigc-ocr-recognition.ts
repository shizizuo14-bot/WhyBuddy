export const WEB_AIGC_OCR_RECOGNITION_API = {
  EXECUTE: "POST /api/ocr-recognition/nodes/execute",
} as const;

export const WEB_AIGC_OCR_RECOGNITION_NODE_TYPES = [
  "ocr_recognition",
] as const;

export type OcrRecognitionNodeType =
  (typeof WEB_AIGC_OCR_RECOGNITION_NODE_TYPES)[number];

export const WEB_AIGC_OCR_OUTPUT_FORMATS = ["json", "txt", "md"] as const;

export type WebAigcOcrOutputFormat =
  (typeof WEB_AIGC_OCR_OUTPUT_FORMATS)[number];

export type WebAigcOcrRegion =
  | "top-left"
  | "top"
  | "top-right"
  | "middle-left"
  | "middle"
  | "middle-right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface WebAigcOcrTextFragment {
  text: string;
  page: number;
  region?: WebAigcOcrRegion;
  confidence?: number | null;
}

export interface WebAigcOcrPageResult {
  page: number;
  text: string;
}

export interface WebAigcOcrRecognitionResult {
  text: string;
  fragments: WebAigcOcrTextFragment[];
  pages: WebAigcOcrPageResult[];
  rawResponse: string;
  confidence?: number | null;
  media?: WebAigcOcrRecognitionMediaSummary;
}

export interface WebAigcVisionOutputArtifact {
  kind: "file";
  name: string;
  path: string;
  mimeType: string;
  downloadUrl: string;
  description: string;
}

export interface WebAigcOcrRecognitionImageInput {
  name: string;
  base64DataUrl: string;
  mimeType?: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export interface WebAigcOcrRecognitionArtifactInput {
  persistOutput?: boolean;
  outputId?: string;
  outputFormats?: WebAigcOcrOutputFormat[];
}

export interface OcrRecognitionNodeInput {
  images?: WebAigcOcrRecognitionImageInput[];
  prompt?: string;
  artifact?: WebAigcOcrRecognitionArtifactInput;
  context?: Record<string, unknown>;
}

export interface OcrRecognitionNodeExecutionRequest {
  nodeType: OcrRecognitionNodeType;
  input?: OcrRecognitionNodeInput;
}

export interface WebAigcOcrRecognitionItem {
  name: string;
  recognition: WebAigcOcrRecognitionResult;
  pageCount: number;
  fragmentCount: number;
}

export interface WebAigcOcrRecognitionMediaSummary {
  name: string;
  mimeType: string;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}

export interface OcrRecognitionNodeExecutionResult {
  ok: boolean;
  nodeType: OcrRecognitionNodeType;
  output: {
    status: "completed" | "degraded" | "error";
    pythonStatus?: "success" | "degraded" | "provider_missing" | "error";
    text?: string;
    confidence?: number | null;
    media?: WebAigcOcrRecognitionMediaSummary[];
    results?: WebAigcOcrRecognitionItem[];
    pages?: WebAigcOcrPageResult[];
    fragments?: WebAigcOcrTextFragment[];
    artifact?: {
      outputId: string;
      artifacts: WebAigcVisionOutputArtifact[];
      requestedFormats: WebAigcOcrOutputFormat[];
    };
    context: Record<string, unknown>;
    observability?: {
      eventKey: "multimodal.ocr_recognition";
      nodeType: OcrRecognitionNodeType;
      imageCount: number;
      totalPageCount: number;
      totalFragmentCount: number;
      artifactPersisted: boolean;
      latencyMs: number;
    };
    warnings: string[];
    error?: { code: string; message: string };
    runtime?: {
      backend: "python";
      provider: "fake";
      source: string;
      externalCalls: false;
    };
    provenance?: Record<string, unknown>;
    permission?: Record<string, unknown>;
    audit?: Record<string, unknown>;
  };
}

export interface WebAigcOcrPythonRuntimeResponse {
  ok: boolean;
  status: "success" | "degraded" | "provider_missing" | "error";
  text?: string;
  confidence?: number | null;
  fragments?: WebAigcOcrTextFragment[];
  pages?: WebAigcOcrPageResult[];
  rawResponse?: string;
  warnings?: string[];
  error?: { code: string; message: string };
  runtime?: {
    backend: "python";
    provider: "fake";
    source: string;
    externalCalls: false;
  };
  metadata?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  permission?: Record<string, unknown>;
  audit?: Record<string, unknown>;
}
