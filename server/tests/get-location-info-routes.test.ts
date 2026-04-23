import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createGetLocationInfoRouter } from "../routes/get-location-info.js";

async function withServer(
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/get-location-info", createGetLocationInfoRouter());

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
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

describe("POST /api/get-location-info/nodes/execute", () => {
  it("returns 400 when nodeType is invalid", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/get-location-info/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "llm",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("nodeType");
    });
  });

  it("returns a completed coarse location payload for valid input", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/get-location-info/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "get_location_info",
          input: {
            coarseLocation: {
              countryCode: "JP",
              region: "Tokyo",
              city: "Tokyo",
            },
            timezone: "Asia/Tokyo",
            locale: "ja-jp",
            authorization: {
              status: "granted",
              grantedBy: "user",
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.output.status).toBe("completed");
      expect(body.output.location).toEqual({
        coarseLocation: {
          countryCode: "JP",
          region: "Tokyo",
          city: "Tokyo",
          label: "Tokyo, Tokyo, JP",
        },
        timezone: "Asia/Tokyo",
        locale: "ja-JP",
      });
    });
  });

  it("surfaces privacy downgrade warnings without failing the request", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/get-location-info/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "get_location_info",
          input: {
            requestedPrecision: "precise",
            coarseLocation: {
              countryCode: "GB",
              region: "England",
              city: "London",
            },
            authorization: {
              status: "granted",
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output.privacy.precisionLevel).toBe("precise_blocked");
      expect(body.output.warnings).toContain(
        "Precise location access was blocked and reduced to coarse-only output.",
      );
    });
  });
});
