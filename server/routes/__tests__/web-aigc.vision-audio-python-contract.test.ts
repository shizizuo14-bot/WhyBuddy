import { describe, expect, it, vi } from "vitest";

import {
  AudioRecognitionNodeError,
  executeAudioRecognitionNode,
} from "../node-adapters/audio-recognition-node-adapter.js";
import {
  OcrRecognitionNodeError,
  executeOcrRecognitionNode,
} from "../node-adapters/ocr-recognition-node-adapter.js";
import {
  analyzeImage,
  buildFakeVisionAnalysisResult,
} from "../../core/vision-provider.js";
import {
  buildFakeVoiceSynthesisResult,
  buildFakeVoiceTranscriptionResult,
} from "../../core/voice-provider.js";
import {
  buildFakeAudioTranscriptionResult,
} from "../../core/audio-transcription-provider.js";

describe("web AIGC vision/audio Python contract adapters", () => {
  it("ocr success preserves confidence, media metadata, and avoids external fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const recognizeImages = vi.fn(async () =>
      new Map([
        [
          "receipt.png",
          {
            text: "Total: 12.00",
            confidence: 0.91,
            fragments: [
              {
                text: "Total: 12.00",
                page: 1,
                region: "middle" as const,
                confidence: 0.91,
              },
            ],
            pages: [{ page: 1, text: "Total: 12.00" }],
            rawResponse: '{"text":"Total: 12.00"}',
            media: {
              name: "receipt.png",
              mimeType: "image/png",
              durationMs: null,
              metadata: { width: 800, height: 600 },
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
              metadata: { width: 800, height: 600 },
            },
          ],
          artifact: { persistOutput: false },
        },
      },
      { recognizeImages, now: () => 1000 },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.confidence).toBe(0.91);
    expect(result.output.results[0].recognition.confidence).toBe(0.91);
    expect(result.output.results[0].recognition.media).toEqual({
      name: "receipt.png",
      mimeType: "image/png",
      durationMs: null,
      metadata: { width: 800, height: 600 },
    });
    expect(result.output.media).toEqual([
      {
        name: "receipt.png",
        mimeType: "image/png",
        durationMs: null,
        metadata: { width: 800, height: 600 },
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ocr provider errors return stable errorCode without persisting artifacts", async () => {
    const persistArtifacts = vi.fn();

    let thrown: unknown;
    try {
      await executeOcrRecognitionNode(
        {
          nodeType: "ocr_recognition",
          input: {
            images: [
              {
                name: "broken.png",
                base64DataUrl: "data:image/png;base64,YnJva2Vu",
                mimeType: "image/png",
              },
            ],
          },
        },
        {
          recognizeImages: vi.fn(async () => {
            throw new Error("fake OCR failure");
          }),
          persistArtifacts,
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OcrRecognitionNodeError);
    expect((thrown as OcrRecognitionNodeError).status).toBe(500);
    expect((thrown as OcrRecognitionNodeError).errorCode).toBe(
      "ocr_recognition_failed",
    );
    expect((thrown as OcrRecognitionNodeError).message).toContain(
      "fake OCR failure",
    );
    expect((thrown as OcrRecognitionNodeError).media).toEqual([
      {
        name: "broken.png",
        mimeType: "image/png",
        durationMs: null,
        metadata: {},
      },
    ]);
    expect(persistArtifacts).not.toHaveBeenCalled();
  });

  it("audio recognition success preserves confidence, mime, duration, and source metadata", async () => {
    const result = await executeAudioRecognitionNode(
      {
        nodeType: "audio_recognition",
        input: {
          source: {
            audioBase64: Buffer.from("fake-webm-audio").toString("base64"),
            mimeType: "audio/webm",
            fileName: "meeting.webm",
            durationMs: 4200,
            metadata: { channels: 1, sampleRateHz: 16000 },
          },
          languageHint: "en-US",
        },
      },
      {
        recognizeAudio: vi.fn(async () => ({
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
        })),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.transcript).toBe("Please summarize the meeting.");
    expect(result.output.confidence).toBe(0.87);
    expect(result.output.source).toMatchObject({
      kind: "inline_base64",
      mimeType: "audio/webm",
      fileName: "meeting.webm",
      durationMs: 4200,
      metadata: { channels: 1, sampleRateHz: 16000 },
    });
    expect(result.output.segments[0]).toMatchObject({
      confidence: 0.87,
      endMs: 4200,
    });
    expect(result.output.observability.durationMs).toBe(4200);
  });

  it("audio recognition errors return stable errorCode and media fields", async () => {
    let thrown: unknown;
    try {
      await executeAudioRecognitionNode(
        {
          nodeType: "audio_recognition",
          input: {
            source: {
              audioBase64: Buffer.from("broken-audio").toString("base64"),
              mimeType: "audio/webm",
              fileName: "broken.webm",
              durationMs: 300,
            },
          },
        },
        {
          recognizeAudio: vi.fn(async () => {
            throw new Error("fake STT failure");
          }),
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AudioRecognitionNodeError);
    expect((thrown as AudioRecognitionNodeError).status).toBe(503);
    expect((thrown as AudioRecognitionNodeError).errorCode).toBe(
      "audio_recognition_failed",
    );
    expect((thrown as AudioRecognitionNodeError).message).toContain(
      "fake STT failure",
    );
    expect((thrown as AudioRecognitionNodeError).source).toMatchObject({
      kind: "inline_base64",
      mimeType: "audio/webm",
      fileName: "broken.webm",
      durationMs: 300,
    });
  });

  it("vision fake contract result carries confidence and does not call a multimodal provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fake = buildFakeVisionAnalysisResult({
      media: {
        name: "dashboard.png",
        mimeType: "image/png",
        metadata: { width: 1200, height: 800 },
      },
      description: "Dashboard with chart and status cards",
      elements: ["dashboard", "chart", "status cards"],
      textContent: "OK",
      confidence: 0.83,
    });

    expect(fake).toMatchObject({
      description: "Dashboard with chart and status cards",
      elements: ["dashboard", "chart", "status cards"],
      textContent: "OK",
      confidence: 0.83,
      media: {
        name: "dashboard.png",
        mimeType: "image/png",
        durationMs: null,
        metadata: { width: 1200, height: 800 },
      },
      provenance: {
        provider: "fake",
        runtime: "python-contract",
        kind: "vision_analysis",
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await expect(
      analyzeImage("data:image/png;base64,ZmFrZQ==", "fake", {
        fakeRuntime: true,
        fakeResult: fake,
      }),
    ).resolves.toMatchObject({
      confidence: 0.83,
      media: {
        mimeType: "image/png",
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("voice fake contract results carry stable success and error shapes", () => {
    const tts = buildFakeVoiceSynthesisResult({
      text: "Hello from fake voice.",
      voice: "alloy",
      mimeType: "audio/mpeg",
      durationMs: 1800,
    });
    const stt = buildFakeVoiceTranscriptionResult({
      transcript: "Hello from fake STT.",
      mimeType: "audio/webm",
      durationMs: 2200,
      confidence: 0.89,
    });
    const transcription = buildFakeAudioTranscriptionResult({
      transcript: "Audio transcription contract.",
      mimeType: "audio/webm",
      durationMs: 2500,
      confidence: 0.86,
    });

    expect(tts).toMatchObject({
      ok: true,
      status: "success",
      confidence: 1,
      audio: {
        mimeType: "audio/mpeg",
        durationMs: 1800,
      },
    });
    expect(stt).toMatchObject({
      ok: true,
      status: "success",
      transcript: "Hello from fake STT.",
      confidence: 0.89,
      media: {
        mimeType: "audio/webm",
        durationMs: 2200,
      },
    });
    expect(transcription).toMatchObject({
      ok: true,
      status: "success",
      transcript: "Audio transcription contract.",
      confidence: 0.86,
      media: {
        mimeType: "audio/webm",
        durationMs: 2500,
      },
    });
  });
});
