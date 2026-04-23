import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { createAudioRecognitionRouter } from "../routes/audio-recognition.js";

async function withServer(
  deps: Parameters<typeof createAudioRecognitionRouter>[0],
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/api/audio-recognition", createAudioRecognitionRouter(deps));

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await handler(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

describe("POST /api/audio-recognition/nodes/execute", () => {
  it("returns 400 when nodeType is invalid", async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/audio-recognition/nodes/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeType: "dialogue" }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("audio_recognition");
    });
  });

  it("returns 200 and the patched context for a valid recognition request", async () => {
    const recognizeAudio = vi.fn(async () => ({
      transcript: "这是今天客户电话的转写结果",
    }));

    await withServer({ recognizeAudio }, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/audio-recognition/nodes/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeType: "audio_recognition",
            input: {
              source: {
                audioBase64: Buffer.from("route-audio").toString("base64"),
                mimeType: "audio/webm",
              },
              context: {
                workflowId: "wf-audio-1",
              },
            },
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.output.transcript).toBe("这是今天客户电话的转写结果");
      expect(body.output.context).toMatchObject({
        workflowId: "wf-audio-1",
        multimodalContext: {
          voiceTranscript: "这是今天客户电话的转写结果",
        },
        audioRecognition: {
          transcript: "这是今天客户电话的转写结果",
        },
      });
    });
  });

  it("returns 503 when the reused voice STT capability fails", async () => {
    const recognizeAudio = vi.fn(async () => {
      throw new Error("provider timeout");
    });

    await withServer({ recognizeAudio }, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/audio-recognition/nodes/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeType: "audio_recognition",
            input: {
              source: {
                audioBase64: Buffer.from("broken-audio").toString("base64"),
              },
            },
          }),
        },
      );

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain("provider timeout");
    });
  });
});
