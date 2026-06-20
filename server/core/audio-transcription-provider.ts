/**
 * Audio transcription provider.
 *
 * Provides a `transcribeAudio` function that:
 * 1. If STT_API_URL + STT_API_KEY are configured → delegates to voice-provider's recognizeSpeech
 * 2. If LLM_API_KEY + LLM_BASE_URL are configured → calls Whisper-compatible endpoint
 * 3. Otherwise → returns a descriptive unavailability message
 */

import { getVoiceConfig, recognizeSpeech } from "./voice-provider.js";
import { getAIConfig } from "./ai-config.js";

export interface FakeAudioTranscriptionResult {
  ok: true;
  status: "success";
  transcript: string;
  confidence: number | null;
  media: {
    name: string;
    mimeType: string;
    durationMs: number | null;
    metadata: Record<string, unknown>;
  };
  segments: Array<{
    index: number;
    text: string;
    confidence: number | null;
    startMs: number;
    endMs?: number;
  }>;
  provenance: {
    provider: "fake";
    runtime: "python-contract";
    kind: "audio_recognition";
  };
}

function normalizeConfidence(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeDurationMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

export function buildFakeAudioTranscriptionResult(input: {
  transcript: string;
  mimeType?: string;
  durationMs?: number | null;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
}): FakeAudioTranscriptionResult {
  const transcript = input.transcript.trim() || "Fake audio transcript.";
  const confidence = normalizeConfidence(input.confidence, 0.85);
  const durationMs = normalizeDurationMs(input.durationMs);

  return {
    ok: true,
    status: "success",
    transcript,
    confidence,
    media: {
      name: "fake-audio-input",
      mimeType: input.mimeType?.trim() || "audio/webm",
      durationMs,
      metadata: normalizeMetadata(input.metadata),
    },
    segments: [
      {
        index: 0,
        text: transcript,
        confidence,
        startMs: 0,
        ...(durationMs !== null ? { endMs: durationMs } : {}),
      },
    ],
    provenance: {
      provider: "fake",
      runtime: "python-contract",
      kind: "audio_recognition",
    },
  };
}

/**
 * Attempt transcription via the Whisper-compatible `/v1/audio/transcriptions`
 * endpoint using the LLM provider's base URL and API key.
 */
async function transcribeViaWhisper(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<{ transcript: string }> {
  const aiConfig = getAIConfig();
  const baseUrl = aiConfig.baseUrl.replace(/\/+$/, "");
  const apiKey = aiConfig.apiKey;

  const ext = mimeType.includes("mpeg") || mimeType.includes("mp3")
    ? "mp3"
    : mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";

  const blob = new Blob([audioBuffer], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model", process.env.STT_MODEL || "whisper-1");

  const url = `${baseUrl}/audio/transcriptions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "unknown error");
    throw new Error(`Whisper transcription failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { text?: string };
  const text = typeof json.text === "string" ? json.text.trim() : "";
  if (!text) {
    throw new Error("Whisper transcription returned empty text");
  }

  return { transcript: text };
}

/**
 * Transcribe audio using the best available method.
 *
 * Priority:
 * 1. Dedicated STT service (STT_API_URL + STT_API_KEY)
 * 2. Whisper-compatible endpoint via LLM provider (LLM_API_KEY + LLM_BASE_URL)
 * 3. Unavailable fallback message
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType?: string,
): Promise<{ transcript: string }> {
  const effectiveMime = mimeType || "audio/webm";

  // Priority 1: Dedicated STT service
  const voiceConfig = getVoiceConfig();
  if (voiceConfig.stt.available) {
    return recognizeSpeech(audioBuffer, effectiveMime);
  }

  // Priority 2: Whisper-compatible endpoint via LLM provider
  const aiConfig = getAIConfig();
  if (aiConfig.apiKey && aiConfig.baseUrl) {
    return transcribeViaWhisper(audioBuffer, effectiveMime);
  }

  // Priority 3: Unavailable
  throw new Error(
    "[Audio transcription unavailable] Configure STT_API_URL + STT_API_KEY, or LLM_API_KEY + LLM_BASE_URL for Whisper-compatible transcription.",
  );
}
