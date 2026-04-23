import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { createOrchestrationRecognitionJumpRouter } from "../routes/orchestration-recognition-jump.js";

async function withServer(
  deps: Parameters<typeof createOrchestrationRecognitionJumpRouter>[0] = {},
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/orchestration-recognition-jump",
    createOrchestrationRecognitionJumpRouter(deps),
  );
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
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

describe("POST /api/orchestration-recognition-jump/nodes/execute", () => {
  it("rejects unsupported node types", async () => {
    await withServer({}, async baseUrl => {
      const response = await fetch(
        `${baseUrl}/api/orchestration-recognition-jump/nodes/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nodeType: "dialogue",
          }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("orchestration_recognition_jump");
    });
  });

  it("returns recognized jump payload on success", async () => {
    await withServer({}, async baseUrl => {
      const response = await fetch(
        `${baseUrl}/api/orchestration-recognition-jump/nodes/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nodeType: "orchestration_recognition_jump",
            input: {
              query: "进入客户回访编排",
              candidates: [
                {
                  orchestrationId: "customer-follow-up",
                  entryNodeId: "follow-up-entry",
                  label: "客户回访编排",
                  keywords: ["客户", "回访"],
                },
              ],
            },
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.output.jumpTargetNodeId).toBe("follow-up-entry");
      expect(body.output.recognizedTarget.orchestrationId).toBe(
        "customer-follow-up",
      );
    });
  });

  it("returns 403 when permission enforcement denies the jump", async () => {
    await withServer(
      {
        permissionEngine: {
          checkPermission: vi.fn(() => ({
            allowed: false,
            reason: "approval required",
          })),
        },
      },
      async baseUrl => {
        const response = await fetch(
          `${baseUrl}/api/orchestration-recognition-jump/nodes/execute`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              nodeType: "orchestration_recognition_jump",
              input: {
                query: "跳转审批",
                candidates: [
                  {
                    orchestrationId: "approval",
                    entryNodeId: "approval-entry",
                    label: "审批",
                  },
                ],
                agentId: "agent-1",
                token: "token-1",
              },
            }),
          },
        );

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.output.status).toBe("denied");
      },
    );
  });

  it("returns 400 when query and candidates are both missing", async () => {
    await withServer({}, async baseUrl => {
      const response = await fetch(
        `${baseUrl}/api/orchestration-recognition-jump/nodes/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nodeType: "orchestration_recognition_jump",
            input: {},
          }),
        },
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("requires query or candidates");
    });
  });
});
