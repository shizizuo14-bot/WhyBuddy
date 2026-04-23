import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import http from "node:http";

import { createNLCommandRouter } from "../routes/nl-command.js";

let server: http.Server;
let baseUrl: string;

function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload
            ? { "Content-Length": Buffer.byteLength(payload).toString() }
            : {}),
        },
      },
      res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 500,
              body: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/nl-command", createNLCommandRouter());

  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
});

describe("command_list routes", () => {
  it("POST /api/nl-command/command-list/generate returns a structured command list", async () => {
    const response = await request("POST", "/api/nl-command/command-list/generate", {
      listId: "route-list-1",
      commandText: "推进会员增长方案",
      userId: "user-1",
      locale: "zh-CN",
    });

    expect(response.status).toBe(200);
    const body = response.body as {
      ok: boolean;
      output: {
        commandList: {
          listId: string;
          candidates: Array<{ candidateId: string }>;
        };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.output.commandList.listId).toBe("route-list-1");
    expect(body.output.commandList.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /api/nl-command/command-list/generate returns 400 for missing required fields", async () => {
    const response = await request("POST", "/api/nl-command/command-list/generate", {
      userId: "user-1",
    });

    expect(response.status).toBe(400);
    expect((response.body as Record<string, unknown>).message).toContain("commandText");
  });

  it("POST /api/nl-command/command-list/:listId/select returns selection payload", async () => {
    await request("POST", "/api/nl-command/command-list/generate", {
      listId: "route-list-2",
      commandText: "安排直播活动复盘",
      userId: "user-2",
    });

    const response = await request("POST", "/api/nl-command/command-list/route-list-2/select", {
      candidateId: "candidate-execute",
      submittedBy: "operator-2",
    });

    expect(response.status).toBe(200);
    const body = response.body as {
      ok: boolean;
      selection: {
        optionId: string;
        metadata: {
          nodeType: string;
          branchKey: string;
        };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.selection.optionId).toBe("candidate-execute");
    expect(body.selection.metadata.nodeType).toBe("command_list");
    expect(body.selection.metadata.branchKey).toBe("candidate-execute");
  });

  it("POST /api/nl-command/command-list/:listId/select returns 404 when the list does not exist", async () => {
    const response = await request("POST", "/api/nl-command/command-list/missing/select", {
      candidateId: "candidate-execute",
    });

    expect(response.status).toBe(404);
    expect((response.body as Record<string, unknown>).message).toContain("snapshot not found");
  });
});
