import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createChatRouter } from "../routes/chat.js";

async function withServer(
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/chat",
    createChatRouter({
      getConfig: () => ({
        apiKey: "",
        baseUrl: "https://example.test/v1",
        model: "mock-model",
        modelReasoningEffort: "medium",
        maxContext: 128000,
        providerName: "example.test",
        wireApi: "chat_completions",
        timeoutMs: 1000,
        stream: false,
      }),
      executeLLM: async (messages, _options) => ({
        content: `mock:${messages[messages.length - 1]?.content ?? ""}`,
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
        },
      }),
      now: (() => {
        let current = 100;
        return () => {
          current += 25;
          return current;
        };
      })(),
    }),
  );

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

describe("POST /api/chat", () => {
  it("keeps legacy chat route working", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.content).toBe("mock:hello");
      expect(body.model).toBe("mock-model");
    });
  });
});

describe("POST /api/chat/nodes/execute", () => {
  it("executes llm nodes with normalized output", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/chat/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "llm",
          input: {
            systemPrompt: "You are helpful.",
            prompt: "Summarize this",
            context: {
              source: "knowledge",
              snippets: ["A", "B"],
            },
            variables: {
              projectId: "proj-1",
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.nodeType).toBe("llm");
      expect(body.output.content).toBe("mock:Summarize this");
      expect(body.output.reply.content).toBe("mock:Summarize this");
      expect(body.output.model).toBe("mock-model");
      expect(body.output.messages).toHaveLength(2);
      expect(body.output.messages[0].role).toBe("system");
      expect(body.output.messages[1].role).toBe("user");
      expect(body.output.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  it("rejects node execution when prompt and messages are missing", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/chat/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "dialogue",
          input: {},
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("prompt or messages");
    });
  });
});
