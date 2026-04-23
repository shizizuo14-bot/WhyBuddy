import { describe, expect, it, vi } from "vitest";

import { executeAudioRecognitionNode } from "../routes/node-adapters/audio-recognition-node-adapter.js";

describe("executeAudioRecognitionNode", () => {
  it("recognizes inline audio and writes the transcript back into context", async () => {
    const recognizeAudio = vi.fn(async () => ({
      transcript: "请帮我总结今天的会议纪要",
    }));

    const result = await executeAudioRecognitionNode(
      {
        nodeType: "audio_recognition",
        input: {
          source: {
            audioBase64: Buffer.from("fake-webm-audio").toString("base64"),
            mimeType: "audio/webm",
            fileName: "meeting.webm",
          },
          languageHint: "zh-cn",
          context: {
            requestId: "req-audio-1",
            multimodalContext: {
              visionContexts: [
                {
                  imageName: "whiteboard.png",
                },
              ],
            },
          },
        },
      },
      {
        recognizeAudio,
        getNow: vi.fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(118),
      },
    );

    expect(recognizeAudio).toHaveBeenCalledWith(
      expect.any(Buffer),
      "audio/webm",
    );
    expect(result).toMatchObject({
      ok: true,
      nodeType: "audio_recognition",
      output: {
        status: "completed",
        transcript: "请帮我总结今天的会议纪要",
        confidence: null,
        languageHint: "zh-CN",
        source: {
          kind: "inline_base64",
          mimeType: "audio/webm",
          fileName: "meeting.webm",
        },
        writeback: {
          enabled: true,
          transcriptPath: "multimodalContext.voiceTranscript",
          resultPath: "audioRecognition",
          downstreamConsumers: ["dialogue", "document_search", "web_qa"],
        },
        observability: {
          eventKey: "multimodal.audio_recognition",
          nodeType: "audio_recognition",
          sourceKind: "inline_base64",
          latencyMs: 18,
          transcriptLength: "请帮我总结今天的会议纪要".length,
        },
      },
    });
    expect(result.output.segments).toEqual([
      {
        index: 0,
        text: "请帮我总结今天的会议纪要",
        confidence: null,
        startMs: 0,
      },
    ]);
    expect(result.output.context).toMatchObject({
      requestId: "req-audio-1",
      multimodalContext: {
        visionContexts: [
          {
            imageName: "whiteboard.png",
          },
        ],
        voiceTranscript: "请帮我总结今天的会议纪要",
        voiceLanguage: "zh-CN",
      },
      audioRecognition: {
        transcript: "请帮我总结今天的会议纪要",
        sourceKind: "inline_base64",
        mimeType: "audio/webm",
        languageHint: "zh-CN",
      },
    });
  });

  it("supports loading audio from a remote URL before invoking STT", async () => {
    const loadAudioFromUrl = vi.fn(async () => ({
      buffer: Buffer.from("remote-audio"),
      mimeType: "audio/mpeg",
      fileName: "call.mp3",
    }));
    const recognizeAudio = vi.fn(async () => ({
      transcript: "客户确认今天下午回电",
    }));

    const result = await executeAudioRecognitionNode(
      {
        nodeType: "audio_recognition",
        input: {
          source: {
            audioUrl: "https://example.test/audio/call.mp3",
          },
        },
      },
      {
        loadAudioFromUrl,
        recognizeAudio,
      },
    );

    expect(loadAudioFromUrl).toHaveBeenCalledWith(
      "https://example.test/audio/call.mp3",
    );
    expect(recognizeAudio).toHaveBeenCalledWith(
      Buffer.from("remote-audio"),
      "audio/mpeg",
    );
    expect(result.output.source).toMatchObject({
      kind: "remote_url",
      mimeType: "audio/mpeg",
      fileName: "call.mp3",
      audioUrl: "https://example.test/audio/call.mp3",
    });
    expect(result.output.context).toMatchObject({
      multimodalContext: {
        voiceTranscript: "客户确认今天下午回电",
      },
      audioRecognition: {
        sourceKind: "remote_url",
      },
    });
  });

  it("rejects audio larger than the shared 10 MB voice limit", async () => {
    await expect(
      executeAudioRecognitionNode({
        nodeType: "audio_recognition",
        input: {
          source: {
            audioBase64: Buffer.alloc(10 * 1024 * 1024 + 1, 1).toString("base64"),
          },
        },
      }),
    ).rejects.toThrow(/10 MB limit/i);
  });
});
