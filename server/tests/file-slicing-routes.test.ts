import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createFileSlicingRouter } from "../routes/file-slicing.js";

async function withServer(
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/file-slicing", createFileSlicingRouter());
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
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("POST /api/file-slicing/nodes/execute", () => {
  it("returns 400 when nodeType is invalid", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/file-slicing/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "dialogue",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("nodeType must be file_slicing");
    });
  });

  it("returns completed slicing output for valid requests", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/file-slicing/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "file_slicing",
          input: {
            sourceType: "document",
            sourceId: "doc-route-1",
            projectId: "proj-1",
            fileType: "text",
            content: "第一段内容。\n\n第二段内容。",
            strategy: {
              mode: "paragraph",
              maxChars: 20,
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.output.status).toBe("completed");
      expect(body.output.chunks.length).toBe(2);
      expect(body.output.ingestionPayloads[0].metadata.parentSourceId).toBe("doc-route-1");
    });
  });

  it("returns 400 when required input is missing", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/file-slicing/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "file_slicing",
          input: {
            projectId: "proj-1",
            content: "hello",
          },
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("sourceId");
    });
  });
});
