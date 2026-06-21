import { describe, expect, it, vi } from "vitest";

import { buildFakeAudioTranscriptionResult } from "../../core/audio-transcription-provider.js";
import {
  analyzeImage,
  buildFakeVisionAnalysisResult,
} from "../../core/vision-provider.js";
import {
  buildFakeVoiceSynthesisResult,
  buildFakeVoiceTranscriptionResult,
} from "../../core/voice-provider.js";
import { executeAudioRecognitionNode } from "../node-adapters/audio-recognition-node-adapter.js";
import { executeOcrRecognitionNode } from "../node-adapters/ocr-recognition-node-adapter.js";

const pythonRuntime = {
  backend: "python",
  provider: "fake",
  externalCalls: false,
} as const;

describe("web AIGC vision/audio Python runtime bridge", () => {
  it("OCR accepts Python runtime recognition metadata without external fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const recognizeImages = vi.fn(async () =>
      new Map([
        [
          "receipt.png",
          {
            text: "Total: 12.00",
            confidence: 0.91,
            fragments: [{ text: "Total: 12.00", page: 1, confidence: 0.91 }],
            pages: [{ page: 1, text: "Total: 12.00" }],
            rawResponse: '{"text":"Total: 12.00"}',
            media: {
              name: "receipt.png",
              mimeType: "image/png",
              durationMs: null,
              metadata: {
                width: 800,
                height: 600,
                runtime: {
                  ...pythonRuntime,
                  source: "python-ocr-recognition-runtime",
                },
                provenance: {
                  provider: "fake",
                  runtime: "python-contract",
                  kind: "ocr_recognition",
                },
              },
            },
          },
        ],
      ]),
    );

    const result = await executeOcrRecognitionNode(
      {
        nodeType: "ocr_recognition",
        input: {
          images: [
            {
              name: "receipt.png",
              base64DataUrl: "data:image/png;base64,ZmFrZQ==",
              mimeType: "image/png",
            },
          ],
          artifact: { persistOutput: false },
        },
      },
      { recognizeImages, now: () => 1000 },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.results[0].recognition.media?.metadata.runtime).toMatchObject({
      backend: "python",
      source: "python-ocr-recognition-runtime",
    });
    expect(result.output.results[0].recognition.media?.metadata.provenance).toMatchObject({
      provider: "fake",
      kind: "ocr_recognition",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("audio recognition carries Python runtime context through local STT fake", async () => {
    const recognizeAudio = vi.fn(async () => ({
      transcript: "Please summarize the meeting.",
      confidence: 0.87,
      durationMs: 4200,
      segments: [
        {
          index: 0,
          text: "Please summarize the meeting.",
          confidence: 0.87,
          startMs: 0,
          endMs: 4200,
        },
      ],
    }));

    const result = await executeAudioRecognitionNode(
      {
        nodeType: "audio_recognition",
        input: {
          source: {
            audioBase64: Buffer.from("fake-webm-audio").toString("base64"),
            mimeType: "audio/webm",
            fileName: "meeting.webm",
            durationMs: 4200,
          },
          context: {
            runtime: {
              ...pythonRuntime,
              source: "python-audio-recognition-runtime",
            },
            provenance: {
              provider: "fake",
              runtime: "python-contract",
              kind: "audio_recognition",
            },
          },
        },
      },
      { recognizeAudio, getNow: () => 1000 },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.context.runtime).toMatchObject({
      backend: "python",
      source: "python-audio-recognition-runtime",
    });
    expect(result.output.context.provenance).toMatchObject({
      provider: "fake",
      kind: "audio_recognition",
    });
    expect(recognizeAudio).toHaveBeenCalledOnce();
  });

  it("vision fake runtime carries provenance and does not call multimodal provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fake = buildFakeVisionAnalysisResult({
      description: "Dashboard with chart and status cards",
      confidence: 0.83,
      media: {
        name: "dashboard.png",
        mimeType: "image/png",
        metadata: {
          runtime: {
            ...pythonRuntime,
            source: "python-vision-analysis-runtime",
          },
        },
      },
    });

    const result = await analyzeImage("data:image/png;base64,ZmFrZQ==", "fake", {
      fakeRuntime: true,
      fakeResult: fake,
    });

    expect(result).toMatchObject({
      confidence: 0.83,
      provenance: {
        provider: "fake",
        runtime: "python-contract",
        kind: "vision_analysis",
      },
      media: {
        metadata: {
          runtime: {
            backend: "python",
            source: "python-vision-analysis-runtime",
          },
        },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("voice and audio fake runtime results keep Python provenance and stable safe success", () => {
    const tts = buildFakeVoiceSynthesisResult({
      text: "Hello from fake voice.",
      voice: "alloy",
      durationMs: 1800,
      metadata: {
        runtime: {
          ...pythonRuntime,
          source: "python-voice-synthesis-runtime",
        },
      },
    });
    const stt = buildFakeVoiceTranscriptionResult({
      transcript: "Hello from fake STT.",
      mimeType: "audio/webm",
      durationMs: 2200,
      confidence: 0.89,
      metadata: {
        runtime: {
          ...pythonRuntime,
          source: "python-audio-recognition-runtime",
        },
      },
    });
    const transcription = buildFakeAudioTranscriptionResult({
      transcript: "Audio transcription contract.",
      mimeType: "audio/webm",
      durationMs: 2500,
      confidence: 0.86,
      metadata: {
        runtime: {
          ...pythonRuntime,
          source: "python-audio-recognition-runtime",
        },
      },
    });

    expect(tts).toMatchObject({
      ok: true,
      status: "success",
      provenance: {
        provider: "fake",
        runtime: "python-contract",
        kind: "voice_synthesis",
      },
      media: {
        metadata: {
          generated: true,
          runtime: {
            backend: "python",
            source: "python-voice-synthesis-runtime",
          },
        },
      },
    });
    expect(stt).toMatchObject({
      ok: true,
      status: "success",
      provenance: {
        provider: "fake",
        runtime: "python-contract",
        kind: "audio_recognition",
      },
      media: {
        metadata: {
          runtime: {
            backend: "python",
            source: "python-audio-recognition-runtime",
          },
        },
      },
    });
    expect(transcription).toMatchObject({
      ok: true,
      status: "success",
      provenance: {
        provider: "fake",
        runtime: "python-contract",
        kind: "audio_recognition",
      },
    });
  });
});
