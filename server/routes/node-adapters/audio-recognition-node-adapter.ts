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
}

export interface AudioRecognitionNodeAdapterDeps {
  recognizeAudio?: (
    audioBuffer: Buffer,
    mimeType?: string,
  ) => Promise<{ transcript: string }>;
  loadAudioFromUrl?: (url: string) => Promise<LoadedAudioSource>;
  getNow?: () => number;
}

export class AudioRecognitionNodeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AudioRecognitionNodeError";
    this.status = status;
  }
}

interface ResolvedAudioSource {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  audioUrl?: string;
  sourceKind: WebAigcAudioRecognitionSourceKind;
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
    throw new AudioRecognitionNodeError(400, "Audio data is required.");
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new AudioRecognitionNodeError(413, "Audio data exceeds 10 MB limit.");
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
    };
  }

  throw new AudioRecognitionNodeError(
    400,
    "Audio recognition node input requires source.audioBase64 or source.audioUrl.",
  );
}

async function recognizeWithVoiceStt(
  source: ResolvedAudioSource,
  deps: AudioRecognitionNodeAdapterDeps,
): Promise<string> {
  try {
    if (deps.recognizeAudio) {
      const result = await deps.recognizeAudio(source.buffer, source.mimeType);
      const transcript = normalizeString(result.transcript);
      if (!transcript) {
        throw new AudioRecognitionNodeError(
          503,
          "STT recognition failed: empty transcript.",
        );
      }
      return transcript;
    }

    const voiceConfig = getVoiceConfig();
    if (!voiceConfig.stt.available) {
      throw new AudioRecognitionNodeError(
        501,
        "STT service is not configured.",
      );
    }

    const result = await recognizeSpeech(source.buffer, source.mimeType);
    const transcript = normalizeString(result.transcript);
    if (!transcript) {
      throw new AudioRecognitionNodeError(
        503,
        "STT recognition failed: empty transcript.",
      );
    }
    return transcript;
  } catch (error) {
    if (error instanceof AudioRecognitionNodeError) {
      throw error;
    }

    throw new AudioRecognitionNodeError(
      503,
      `STT recognition failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildSegments(transcript: string): WebAigcAudioRecognitionSegment[] {
  return [
    {
      index: 0,
      text: transcript,
      confidence: null,
      startMs: 0,
    },
  ];
}

function buildWritebackContext(input: AudioRecognitionNodeInput, data: {
  transcript: string;
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
      confidence: null,
      segments: data.segments,
      sourceKind: data.source.sourceKind,
      mimeType: data.source.mimeType,
      byteLength: data.source.buffer.length,
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
  const transcript = await recognizeWithVoiceStt(source, deps);
  const latencyMs = Math.max(0, getNow() - startedAt);
  const segments = buildSegments(transcript);
  const writebackEnabled = input.writeback?.enabled !== false;
  const context = writebackEnabled
    ? buildWritebackContext(input, {
        transcript,
        segments,
        source,
        languageHint,
      })
    : normalizeObject(input.context);

  return {
    ok: true,
    nodeType: "audio_recognition",
    output: {
      status: "completed",
      transcript,
      confidence: null,
      ...(languageHint ? { languageHint } : {}),
      segments,
      source: {
        kind: source.sourceKind,
        mimeType: source.mimeType,
        byteLength: source.buffer.length,
        ...(source.fileName ? { fileName: source.fileName } : {}),
        ...(source.audioUrl ? { audioUrl: source.audioUrl } : {}),
      },
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
        sourceKind: source.sourceKind,
        mimeType: source.mimeType,
        byteLength: source.buffer.length,
        latencyMs,
        transcriptLength: transcript.length,
      },
      warnings: [],
    },
  };
}
