import type {
  OCRPageResult,
  OCRRecognitionResult,
  OCRTextFragment,
} from "../../core/ocr-provider.js";
import { recognizeImagesText } from "../../core/ocr-provider.js";
import {
  OCR_OUTPUT_FORMATS,
  type OCROutputFormat,
  type PersistedVisionOutput,
  writeOCRArtifacts,
} from "../../core/vision-output.js";
import type {
  OcrRecognitionNodeExecutionRequest,
  OcrRecognitionNodeExecutionResult,
  OcrRecognitionNodeInput,
  OcrRecognitionNodeType,
  WebAigcOcrPythonRuntimeResponse,
  WebAigcOcrRecognitionImageInput,
  WebAigcOcrRecognitionMediaSummary,
} from "../../../shared/web-aigc-ocr-recognition.js";

type ContractOCRTextFragment = OCRTextFragment & {
  confidence?: number | null;
};

type ContractOCRRecognitionResult = Omit<OCRRecognitionResult, "fragments"> & {
  fragments: ContractOCRTextFragment[];
  confidence?: number | null;
  media?: WebAigcOcrRecognitionMediaSummary;
};

export class OcrRecognitionNodeError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly media?: WebAigcOcrRecognitionMediaSummary[];

  constructor(
    status: number,
    message: string,
    errorCode = "ocr_recognition_error",
    media?: WebAigcOcrRecognitionMediaSummary[],
  ) {
    super(message);
    this.name = "OcrRecognitionNodeError";
    this.status = status;
    this.errorCode = errorCode;
    this.media = media;
  }
}

export interface OcrRecognitionNodeAdapterDeps {
  recognizeImages?: (
    images: Array<{ base64DataUrl: string; name: string }>,
    prompt?: string,
  ) => Promise<Map<string, ContractOCRRecognitionResult>>;
  persistArtifacts?: (
    results: Array<{ name: string; recognition: ContractOCRRecognitionResult }>,
    options?: {
      outputId?: string;
      formats?: OCROutputFormat[];
    },
  ) => Promise<PersistedVisionOutput>;
  now?: () => number;
  executePythonRuntime?: (
    input: OcrRecognitionNodeInput,
  ) => Promise<WebAigcOcrPythonRuntimeResponse>;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function normalizeImages(value: unknown): WebAigcOcrRecognitionImageInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OcrRecognitionNodeError(
      400,
      "OCR recognition node input requires a non-empty images array.",
    );
  }

  return value.map((item, index) => {
    const record = normalizeObject(item);
    const name = normalizeString(record.name);
    const base64DataUrl = normalizeString(record.base64DataUrl);
    const mimeType = normalizeString(record.mimeType) ?? "image/png";
    const durationMs = normalizeDurationMs(record.durationMs);
    const metadata = normalizeObject(record.metadata);

    if (!name) {
      throw new OcrRecognitionNodeError(
        400,
        `images[${index}].name is required and must be a non-empty string.`,
      );
    }

    if (!base64DataUrl) {
      throw new OcrRecognitionNodeError(
        400,
        `images[${index}].base64DataUrl is required and must be a non-empty string.`,
      );
    }

    return {
      name,
      base64DataUrl,
      mimeType,
      durationMs,
      metadata,
    };
  });
}

function normalizeDurationMs(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeOutputFormats(value: unknown): OCROutputFormat[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new OcrRecognitionNodeError(
      400,
      "'artifact.outputFormats' must be a non-empty array of supported formats.",
    );
  }

  const formats = value.map(entry => normalizeString(entry)) as Array<
    OCROutputFormat | undefined
  >;

  if (
    formats.some(
      format =>
        !format || !OCR_OUTPUT_FORMATS.includes(format as OCROutputFormat),
    )
  ) {
    throw new OcrRecognitionNodeError(
      400,
      `'artifact.outputFormats' must only contain supported formats: ${OCR_OUTPUT_FORMATS.join(", ")}.`,
    );
  }

  return [...new Set(formats as OCROutputFormat[])];
}

function buildImageMedia(
  image: WebAigcOcrRecognitionImageInput,
): WebAigcOcrRecognitionMediaSummary {
  return {
    name: image.name,
    mimeType: normalizeString(image.mimeType) ?? "image/png",
    durationMs: normalizeDurationMs(image.durationMs),
    metadata: normalizeObject(image.metadata),
  };
}

function buildFallbackRecognition(
  image: WebAigcOcrRecognitionImageInput,
): ContractOCRRecognitionResult {
  return {
    text: "",
    fragments: [],
    pages: [{ page: 1, text: "" }],
    rawResponse: `fallback:${image.name}`,
  };
}

function flattenPages(
  results: Array<{ recognition: ContractOCRRecognitionResult }>,
): OCRPageResult[] {
  return results.flatMap(result => result.recognition.pages);
}

function flattenFragments(
  results: Array<{ recognition: ContractOCRRecognitionResult }>,
): ContractOCRTextFragment[] {
  return results.flatMap(result => result.recognition.fragments);
}

function buildCombinedText(
  results: Array<{ recognition: ContractOCRRecognitionResult }>,
): string {
  return results
    .map(result => result.recognition.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function buildRecognitionWithStableMedia(
  recognition: ContractOCRRecognitionResult,
): ContractOCRRecognitionResult {
  return {
    ...recognition,
    ...(recognition.confidence !== undefined
      ? { confidence: normalizeConfidence(recognition.confidence) }
      : {}),
    ...(recognition.media
      ? {
          media: {
            name: recognition.media.name,
            mimeType: normalizeString(recognition.media.mimeType) ?? "image/png",
            durationMs: normalizeDurationMs(recognition.media.durationMs),
            metadata: normalizeObject(recognition.media.metadata),
          },
        }
      : {}),
    fragments: recognition.fragments.map(fragment => ({
      ...fragment,
      ...(fragment.confidence === undefined
        ? {}
        : { confidence: normalizeConfidence(fragment.confidence) }),
    })),
  };
}

function buildAggregateConfidence(
  results: Array<{ recognition: ContractOCRRecognitionResult }>,
): number | null {
  const values = results
    .map(result => normalizeConfidence(result.recognition.confidence))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(average.toFixed(4));
}

function buildContext(
  input: OcrRecognitionNodeInput,
  results: Array<{ name: string; recognition: ContractOCRRecognitionResult }>,
  artifact:
    | {
        outputId: string;
        artifacts: PersistedVisionOutput["artifacts"];
      }
    | undefined,
): Record<string, unknown> {
  const baseContext = normalizeObject(input.context);

  return {
    ...baseContext,
    ocrRecognition: {
      text: buildCombinedText(results),
      results: results.map(result => ({
        name: result.name,
        text: result.recognition.text,
        fragments: result.recognition.fragments,
        pages: result.recognition.pages,
      })),
      ...(artifact
        ? {
            artifact: {
              outputId: artifact.outputId,
              artifacts: artifact.artifacts,
            },
          }
        : {}),
    },
  };
}

export function mapPythonOcrRecognitionRuntimeResponse(
  response: WebAigcOcrPythonRuntimeResponse,
  input: OcrRecognitionNodeInput = {},
): OcrRecognitionNodeExecutionResult {
  const warnings = Array.isArray(response.warnings) ? [...response.warnings] : [];
  const runtime = response.runtime;
  const meta = normalizeObject(response.metadata);
  const provenance = normalizeObject(response.provenance);
  const permission = normalizeObject(response.permission);
  const audit = normalizeObject(response.audit);
  const baseContext = normalizeObject(input.context);

  if (response.ok && response.status === "success") {
    const text = response.text ?? "";
    const pages = response.pages ?? (text ? [{ page: 1, text }] : []);
    const fragments = response.fragments ?? (text ? [{ text, page: 1 }] : []);
    const confidence = response.confidence ?? null;
    const media: WebAigcOcrRecognitionMediaSummary[] = (input.images ?? []).map(img => ({
      name: img.name,
      mimeType: normalizeString(img.mimeType) ?? "image/png",
      durationMs: normalizeDurationMs(img.durationMs),
      metadata: normalizeObject(img.metadata),
    }));
    return {
      ok: true,
      nodeType: "ocr_recognition",
      output: {
        status: "completed",
        pythonStatus: "success",
        text,
        confidence,
        media,
        results: (input.images ?? []).map(img => ({
          name: img.name,
          recognition: {
            text,
            fragments: fragments as any,
            pages: pages as any,
            rawResponse: response.rawResponse ?? `python:${img.name}`,
            confidence,
          },
          pageCount: pages.length,
          fragmentCount: fragments.length,
        })),
        pages: pages as any,
        fragments: fragments as any,
        context: {
          ...baseContext,
          ocrRecognition: { text, results: [] },
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
          eventKey: "multimodal.ocr_recognition",
          nodeType: "ocr_recognition",
          imageCount: (input.images ?? []).length,
          totalPageCount: pages.length,
          totalFragmentCount: fragments.length,
          artifactPersisted: false,
          latencyMs: 0,
        },
      },
    };
  }

  // non-success: do not masquerade as success
  const err = response.error ?? {
    code: response.status === "provider_missing" ? "provider_missing" : response.status === "degraded" ? "provider_degraded" : "runtime_error",
    message: "Python ocr runtime did not return success.",
  };
  const status = response.status === "degraded" ? "degraded" : "error";
  return {
    ok: false,
    nodeType: "ocr_recognition",
    output: {
      status,
      pythonStatus: response.status,
      text: "",
      confidence: null,
      media: (input.images ?? []).map(img => ({
        name: img.name,
        mimeType: normalizeString(img.mimeType) ?? "image/png",
        durationMs: normalizeDurationMs(img.durationMs),
        metadata: normalizeObject(img.metadata),
      })),
      results: [],
      pages: [],
      fragments: [],
      context: {
        ...baseContext,
        ...(Object.keys(meta).length ? { metadata: meta } : {}),
        ...(Object.keys(provenance).length ? { provenance } : {}),
        ...(Object.keys(permission).length ? { permission } : {}),
        ...(Object.keys(audit).length ? { audit } : {}),
      },
      warnings: [...warnings, `python ocr status=${response.status}`],
      error: err,
      ...(runtime ? { runtime } : {}),
      ...(Object.keys(provenance).length ? { provenance } : {}),
      ...(Object.keys(permission).length ? { permission } : {}),
      ...(Object.keys(audit).length ? { audit } : {}),
    },
  };
}

export function isOcrRecognitionNodeType(
  value: unknown,
): value is OcrRecognitionNodeType {
  return value === "ocr_recognition";
}

export async function executeOcrRecognitionNode(
  request: OcrRecognitionNodeExecutionRequest,
  deps: OcrRecognitionNodeAdapterDeps = {},
): Promise<OcrRecognitionNodeExecutionResult> {
  if (!isOcrRecognitionNodeType(request.nodeType)) {
    throw new OcrRecognitionNodeError(
      400,
      "Unsupported ocr_recognition node type.",
      "unsupported_ocr_recognition_node_type",
    );
  }

  const input = request.input ?? {};

  if (deps.executePythonRuntime) {
    const pyResponse = await deps.executePythonRuntime(input);
    return mapPythonOcrRecognitionRuntimeResponse(pyResponse, input);
  }

  const images = normalizeImages(input.images);
  const prompt = normalizeString(input.prompt);
  const artifactInput = normalizeObject(input.artifact);
  const persistOutput =
    artifactInput.persistOutput === undefined
      ? true
      : Boolean(artifactInput.persistOutput);
  const outputId = normalizeString(artifactInput.outputId);
  const outputFormats = normalizeOutputFormats(artifactInput.outputFormats);
  const now = deps.now ?? Date.now;
  const startedAt = now();

  const recognizeImages = deps.recognizeImages ?? recognizeImagesText;

  let resultMap: Map<string, ContractOCRRecognitionResult>;
  try {
    resultMap = await recognizeImages(images, prompt);
  } catch (error) {
    throw new OcrRecognitionNodeError(
      500,
      `OCR recognition failed: ${error instanceof Error ? error.message : String(error)}`,
      "ocr_recognition_failed",
      images.map(buildImageMedia),
    );
  }

  const results = images.map(image => {
    const media = buildImageMedia(image);
    return {
      name: image.name,
      media,
      recognition: buildRecognitionWithStableMedia(
        resultMap.get(image.name) ?? buildFallbackRecognition(image),
      ),
    };
  });
  const warnings = images
    .filter(image => !resultMap.has(image.name))
    .map(image => `OCR provider returned no result for ${image.name}; fallback payload was used.`);

  let artifact:
    | {
        outputId: string;
        artifacts: PersistedVisionOutput["artifacts"];
      }
    | undefined;

  if (persistOutput) {
    try {
      const persistArtifacts = deps.persistArtifacts ?? writeOCRArtifacts;
      const persisted = await persistArtifacts(results, {
        ...(outputId ? { outputId } : {}),
        ...(outputFormats ? { formats: outputFormats } : {}),
      });
      artifact = {
        outputId: persisted.outputId,
        artifacts: persisted.artifacts,
      };
    } catch (error) {
      throw new OcrRecognitionNodeError(
        500,
        `OCR artifact persistence failed: ${error instanceof Error ? error.message : String(error)}`,
        "ocr_artifact_persistence_failed",
        images.map(buildImageMedia),
      );
    }
  }

  const latencyMs = Math.max(0, now() - startedAt);
  const pages = flattenPages(results);
  const fragments = flattenFragments(results);
  const confidence = buildAggregateConfidence(results);
  const media = results.map(result => result.recognition.media ?? result.media);

  return {
    ok: true,
    nodeType: "ocr_recognition",
    output: {
      status: "completed",
      text: buildCombinedText(results),
      confidence,
      media,
      results: results.map(result => ({
        name: result.name,
        recognition: result.recognition,
        pageCount: result.recognition.pages.length,
        fragmentCount: result.recognition.fragments.length,
      })),
      pages,
      fragments,
      ...(artifact
        ? {
            artifact: {
              outputId: artifact.outputId,
              artifacts: artifact.artifacts,
              requestedFormats: outputFormats ?? ["json", "txt"],
            },
          }
        : {}),
      context: buildContext(input, results, artifact),
      observability: {
        eventKey: "multimodal.ocr_recognition",
        nodeType: "ocr_recognition",
        imageCount: images.length,
        totalPageCount: pages.length,
        totalFragmentCount: fragments.length,
        artifactPersisted: Boolean(artifact),
        latencyMs,
      },
      warnings,
    },
  };
}
