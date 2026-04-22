import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import path from "node:path";

import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRecognizeImagesText = vi.fn();

vi.mock("../core/ocr-provider.js", () => ({
  recognizeImagesText: (...args: unknown[]) => mockRecognizeImagesText(...args),
}));

async function startServer() {
  const { default: visionRouter } = await import("../routes/vision.js");
  const app = express();
  app.use(express.json());
  app.use("/api/vision", visionRouter);

  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const { port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

describe("vision routes", () => {
  let server: ReturnType<express.Express["listen"]> | null = null;
  let baseUrl = "";
  let cleanupTargets: string[] = [];

  beforeEach(async () => {
    mockRecognizeImagesText.mockReset();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
    cleanupTargets = [];
  });

  afterEach(async () => {
    await Promise.all(
      cleanupTargets.map(target =>
        fs.rm(target, { recursive: true, force: true })
      )
    );

    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    server = null;
  });

  it("POST /api/vision/ocr returns OCR results and persists artifacts", async () => {
    const outputId = "vision-route-test";
    cleanupTargets.push(path.join(process.cwd(), "tmp", "vision-outputs", outputId));

    mockRecognizeImagesText.mockResolvedValue(
      new Map([
        [
          "receipt.png",
          {
            text: "Total: $12.00",
            fragments: [{ text: "Total: $12.00", page: 1, region: "middle" }],
            pages: [{ page: 1, text: "Total: $12.00" }],
            rawResponse: '{"text":"Total: $12.00"}',
          },
        ],
      ])
    );

    const response = await fetch(`${baseUrl}/api/vision/ocr`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        images: [
          {
            name: "receipt.png",
            base64DataUrl: "data:image/png;base64,abc123",
          },
        ],
        outputId,
        outputFormats: ["json", "txt"],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].recognition.text).toBe("Total: $12.00");
    expect(body.output.outputId).toBe(outputId);
    expect(body.output.artifacts).toHaveLength(2);

    const txtContent = await fs.readFile(
      path.join(process.cwd(), "tmp", "vision-outputs", outputId, "ocr-results.txt"),
      "utf-8"
    );
    expect(txtContent).toContain("Total: $12.00");
  });

  it("POST /api/vision/ocr validates requested output formats", async () => {
    const response = await fetch(`${baseUrl}/api/vision/ocr`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        images: [
          {
            name: "receipt.png",
            base64DataUrl: "data:image/png;base64,abc123",
          },
        ],
        outputFormats: ["pdf"],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.supported).toEqual(["json", "txt", "md"]);
  });

  it("GET /api/vision/outputs/:outputId/:filename serves generated artifacts", async () => {
    const outputId = "vision-download-test";
    const outputDirectory = path.join(process.cwd(), "tmp", "vision-outputs", outputId);
    cleanupTargets.push(outputDirectory);

    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(
      path.join(outputDirectory, "ocr-results.txt"),
      "recognized text\n",
      "utf-8"
    );

    const response = await fetch(
      `${baseUrl}/api/vision/outputs/${outputId}/ocr-results.txt`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("recognized text\n");
  });

  it("GET /api/vision/outputs returns 404 for missing artifacts", async () => {
    const response = await fetch(
      `${baseUrl}/api/vision/outputs/missing-output/ocr-results.txt`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("not found");
  });
});
