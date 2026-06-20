import {
  getVoiceConfig,
  recognizeSpeech,
} from "../../core/voice-provider.js";
import type {
  AudioRecognitionNodeExecutionRequest,
  AudioRecognitionNodeExecutionResult,
  AudioRecognitionNodeInput,
  AudioRecognitionNodeType,
  WebAigcAudioRecognitionSegment,
  WebAigcAudioRecognitionSourceKind,
  WebAigcAudioRecognitionSourceSummary,
} from "../../../shared/web-aigc-audio-recognition.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const DEFAULT_MIME_TYPE = "audio/webm";
const DOWNSTREAM_CONSUMERS = [
  "dialogue",
  "document_search",
  "web_qa",
] as const;

export interface LoadedAudioSource {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AudioRecognitionNodeAdapterDeps {
  recognizeAudio?: (
    audioBuffer: Buffer,
    mimeType?: string,
  ) => Promise<{
    transcript: string;
    confidence?: number | null;
    durationMs?: number | null;
    segments?: WebAigcAudioRecognitionSegment[];
  }>;
  loadAudioFromUrl?: (url: string) => Promise<LoadedAudioSource>;
  getNow?: () => number;
}

export class AudioRecognitionNodeError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly source?: WebAigcAudioRecognitionSourceSummary;

  constructor(
    status: number,
    message: string,
    errorCode = "audio_recognition_error",
    source?: WebAigcAudioRecognitionSourceSummary,
  ) {
    super(message);
    this.name = "AudioRecognitionNodeError";
    this.status = status;
    this.errorCode = errorCode;
    this.source = source;
  }
}

interface ResolvedAudioSource {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  audioUrl?: string;
  sourceKind: WebAigcAudioRecognitionSourceKind;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}

interface RecognizedAudioPayload {
  transcript: string;
  confidence: number | null;
  durationMs: number | null;
  segments?: WebAigcAudioRecognitionSegment[];
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

function normalizeMimeType(value: unknown): string {
  return normalizeString(value) || DEFAULT_MIME_TYPE;
}

function normalizeFileName(value: unknown): string | undefined {
  const fileName = normalizeString(value);
  if (!fileName) {
    return undefined;
  }

  return fileName.replace(/[\\/:*?"<>|]/g, "_");
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

function normalizeLanguageHint(value: unknown): string | undefined {
  const languageHint = normalizeString(value);
  if (!languageHint) {
    return undefined;
  }

  try {
    return Intl.getCanonicalLocales(languageHint)[0];
  } catch {
    return languageHint;
  }
}

function normalizeAudioUrl(value: unknown): string | undefined {
  const audioUrl = normalizeString(value);
  if (!audioUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(audioUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function ensureAudioWithinLimit(buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new AudioRecognitionNodeError(400, "Audio data is required.", "audio_data_required");
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new AudioRecognitionNodeError(413, "Audio data exceeds 10 MB limit.", "audio_data_too_large");
  }
}

function decodeBase64Audio(audioBase64: string): Buffer {
  const trimmed = audioBase64.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.slice(trimmed.indexOf(",") + 1)
    : trimmed;
  const buffer = Buffer.from(normalized, "base64");
  ensureAudioWithinLimit(buffer);
  return buffer;
}

async function defaultLoadAudioFromUrl(url: string): Promise<LoadedAudioSource> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new AudioRecognitionNodeError(
      503,
      `Failed to load audio URL (${response.status}).`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  ensureAudioWithinLimit(buffer);

  return {
    buffer,
    mimeType: response.headers.get("content-type") || undefined,
  };
}

async function resolveAudioSource(
  input: AudioRecognitionNodeInput,
  deps: AudioRecognitionNodeAdapterDeps,
): Promise<ResolvedAudioSource> {
  const source = normalizeObject(input.source);
  const audioBase64 = normalizeString(source.audioBase64);
  const audioUrl = normalizeAudioUrl(source.audioUrl);
  const mimeType = normalizeMimeType(source.mimeType);
  const fileName = normalizeFileName(source.fileName);

  if (audioBase64) {
    return {
      buffer: decodeBase64Audio(audioBase64),
      mimeType,
      ...(fileName ? { fileName } : {}),
      sourceKind: "inline_base64",
      durationMs: normalizeDurationMs(source.durationMs),
      metadata: normalizeObject(source.metadata),
    };
  }

  if (audioUrl) {
    const loader = deps.loadAudioFromUrl ?? defaultLoadAudioFromUrl;
    const loaded = await loader(audioUrl);
    ensureAudioWithinLimit(loaded.buffer);

    return {
      buffer: loaded.buffer,
      mimeType: normalizeMimeType(loaded.mimeType ?? mimeType),
      ...(normalizeFileName(loaded.fileName) || fileName
        ? { fileName: normalizeFileName(loaded.fileName) ?? fileName }
        : {}),
      audioUrl,
      sourceKind: "remote_url",
      durationMs: normalizeDurationMs(loaded.durationMs ?? source.durationMs),
      metadata: {
        ...normalizeObject(source.metadata),
        ...normalizeObject(loaded.metadata),
      },
    };
  }

  throw new AudioRecognitionNodeError(
    400,
    "Audio recognition node input requires source.audioBase64 or source.audioUrl.",
    "audio_source_required",
  );
}

async function recognizeWithVoiceStt(
  source: ResolvedAudioSource,
  deps: AudioRecognitionNodeAdapterDeps,
): Promise<RecognizedAudioPayload> {
  try {
    if (deps.recognizeAudio) {
      const result = await deps.recognizeAudio(source.buffer, source.mimeType);
      const transcript = normalizeString(result.transcript);
      if (!transcript) {
        throw new AudioRecognitionNodeError(
          503,
          "STT recognition failed: empty transcript.",
          "audio_recognition_empty_transcript",
          buildSourceSummary(source),
        );
      }
      return {
        transcript,
        confidence: normalizeConfidence(result.confidence),
        durationMs: normalizeDurationMs(result.durationMs ?? source.durationMs),
        segments: Array.isArray(result.segments) ? result.segments : undefined,
      };
    }

    const voiceConfig = getVoiceConfig();
    if (!voiceConfig.stt.available) {
      throw new AudioRecognitionNodeError(
        501,
        "STT service is not configured.",
        "audio_recognition_unconfigured",
        buildSourceSummary(source),
      );
    }

    const result = await recognizeSpeech(source.buffer, source.mimeType);
    const transcript = normalizeString(result.transcript);
    if (!transcript) {
      throw new AudioRecognitionNodeError(
        503,
        "STT recognition failed: empty transcript.",
        "audio_recognition_empty_transcript",
        buildSourceSummary(source),
      );
    }
    return {
      transcript,
      confidence: null,
      durationMs: source.durationMs,
    };
  } catch (error) {
    if (error instanceof AudioRecognitionNodeError) {
      throw error;
    }

    throw new AudioRecognitionNodeError(
      503,
      `STT recognition failed: ${error instanceof Error ? error.message : String(error)}`,
      "audio_recognition_failed",
      buildSourceSummary(source),
    );
  }
}

function buildSegments(
  transcript: string,
  confidence: number | null,
  durationMs: number | null,
  segments?: WebAigcAudioRecognitionSegment[],
): WebAigcAudioRecognitionSegment[] {
  if (Array.isArray(segments) && segments.length > 0) {
    return segments.map((segment, index) => ({
      index:
        typeof segment.index === "number" && Number.isFinite(segment.index)
          ? segment.index
          : index,
      text: normalizeString(segment.text) ?? transcript,
      confidence: normalizeConfidence(segment.confidence),
      ...(typeof segment.startMs === "number" && Number.isFinite(segment.startMs)
        ? { startMs: Math.max(0, Math.floor(segment.startMs)) }
        : { startMs: 0 }),
      ...(typeof segment.endMs === "number" && Number.isFinite(segment.endMs)
        ? { endMs: Math.max(0, Math.floor(segment.endMs)) }
        : durationMs !== null
          ? { endMs: durationMs }
          : {}),
    }));
  }

  return [
    {
      index: 0,
      text: transcript,
      confidence,
      startMs: 0,
      ...(durationMs !== null ? { endMs: durationMs } : {}),
    },
  ];
}

function buildSourceSummary(
  source: ResolvedAudioSource,
): WebAigcAudioRecognitionSourceSummary {
  return {
    kind: source.sourceKind,
    mimeType: source.mimeType,
    byteLength: source.buffer.length,
    durationMs: source.durationMs,
    metadata: source.metadata,
    ...(source.fileName ? { fileName: source.fileName } : {}),
    ...(source.audioUrl ? { audioUrl: source.audioUrl } : {}),
  };
}

function buildWritebackContext(input: AudioRecognitionNodeInput, data: {
  transcript: string;
  confidence: number | null;
  segments: WebAigcAudioRecognitionSegment[];
  source: ResolvedAudioSource;
  languageHint?: string;
}): Record<string, unknown> {
  const baseContext = normalizeObject(input.context);
  const audioRecognition = normalizeObject(baseContext.audioRecognition);
  const multimodalContext = normalizeObject(baseContext.multimodalContext);

  return {
    ...baseContext,
    audioRecognition: {
      ...audioRecognition,
      transcript: data.transcript,
      confidence: data.confidence,
      segments: data.segments,
      sourceKind: data.source.sourceKind,
      mimeType: data.source.mimeType,
      byteLength: data.source.buffer.length,
      durationMs: data.source.durationMs,
      ...(data.source.audioUrl ? { audioUrl: data.source.audioUrl } : {}),
      ...(data.languageHint ? { languageHint: data.languageHint } : {}),
    },
    multimodalContext: {
      ...multimodalContext,
      voiceTranscript: data.transcript,
      ...(data.languageHint ? { voiceLanguage: data.languageHint } : {}),
    },
  };
}

export function isAudioRecognitionNodeType(
  value: unknown,
): value is AudioRecognitionNodeType {
  return value === "audio_recognition";
}

export async function executeAudioRecognitionNode(
  request: AudioRecognitionNodeExecutionRequest,
  deps: AudioRecognitionNodeAdapterDeps = {},
): Promise<AudioRecognitionNodeExecutionResult> {
  if (!isAudioRecognitionNodeType(request.nodeType)) {
    throw new AudioRecognitionNodeError(
      400,
      "Unsupported audio_recognition node type.",
    );
  }

  const input = request.input ?? {};
  const languageHint = normalizeLanguageHint(input.languageHint);
  const getNow = deps.getNow ?? Date.now;
  const startedAt = getNow();
  const source = await resolveAudioSource(input, deps);
  const recognition = await recognizeWithVoiceStt(source, deps);
  const transcript = recognition.transcript;
  const latencyMs = Math.max(0, getNow() - startedAt);
  const durationMs = recognition.durationMs ?? source.durationMs;
  const sourceWithRecognition: ResolvedAudioSource = {
    ...source,
    durationMs,
  };
  const segments = buildSegments(
    transcript,
    recognition.confidence,
    durationMs,
    recognition.segments,
  );
  const writebackEnabled = input.writeback?.enabled !== false;
  const context = writebackEnabled
    ? buildWritebackContext(input, {
        transcript,
        confidence: recognition.confidence,
        segments,
        source: sourceWithRecognition,
        languageHint,
      })
    : normalizeObject(input.context);

  return {
    ok: true,
    nodeType: "audio_recognition",
    output: {
      status: "completed",
      transcript,
      confidence: recognition.confidence,
      ...(languageHint ? { languageHint } : {}),
      segments,
      source: buildSourceSummary(sourceWithRecognition),
      writeback: {
        enabled: writebackEnabled,
        transcriptPath: "multimodalContext.voiceTranscript",
        resultPath: "audioRecognition",
        downstreamConsumers: [...DOWNSTREAM_CONSUMERS],
      },
      context,
      observability: {
        eventKey: "multimodal.audio_recognition",
        nodeType: "audio_recognition",
        sourceKind: sourceWithRecognition.sourceKind,
        mimeType: sourceWithRecognition.mimeType,
        byteLength: sourceWithRecognition.buffer.length,
        durationMs: sourceWithRecognition.durationMs,
        latencyMs,
        transcriptLength: transcript.length,
      },
      warnings: [],
    },
  };
}
