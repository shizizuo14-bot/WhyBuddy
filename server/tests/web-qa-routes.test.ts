import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createWebQaRouter } from "../routes/web-qa.js";
import type { UnifiedKnowledgeResult } from "../../shared/knowledge/types.js";

function makeKnowledgeResult(summary: string): UnifiedKnowledgeResult {
  return {
    mergedSummary: summary,
    structuredResults: {
      entities: [
        {
          entityId: "entity-1",
          entityType: "FAQ",
          name: "网页问答知识回退",
          description: summary,
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          source: "user_defined",
          confidence: 0.8,
          projectId: "proj-web-qa",
          status: "active",
          needsReview: false,
          linkedMemoryIds: [],
          extendedAttributes: {},
        },
      ],
      relations: [],
    },
    semanticResults: [],
  };
}

async function withServer(
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/web-qa",
    createWebQaRouter({
      documentSearch: async (request) => ({
        query: request.query,
        totalCandidates: 1,
        latencyMs: 18,
        mode: request.options?.mode ?? "hybrid",
        results: [
          {
            documentId: "doc-web-qa-1",
            sourceType: "document",
            score: 0.89,
            summary: "网页检索结果指出要先校验状态，再查看回调日志。",
            highlights: ["校验状态", "回调日志"],
            fragments: [],
          },
        ],
      }),
      knowledgeService: {
        query: async () => makeKnowledgeResult("知识库回退：优先查看内部 FAQ。"),
      },
      executeLLM: async (messages) => ({
        content: `web-qa:${messages[messages.length - 1]?.content ?? ""}`,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
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
      now: (() => {
        let current = 100;
        return () => {
          current += 30;
          return current;
        };
      })(),
    }),
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
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("POST /api/web-qa/nodes/execute", () => {
  it("returns 400 when nodeType is invalid", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/web-qa/nodes/execute`, {
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

  it("returns completed web qa output with source links and evidence", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/web-qa/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "web_qa",
          input: {
            question: "如何处理网页问答？",
            pages: [
              {
                pageId: "runbook-1",
                route: "/runbooks/web-qa",
                title: "网页问答手册",
                summary: "先整理网页证据，再生成回答。",
              },
            ],
            search: {
              scope: {
                projectId: "proj-web-qa",
              },
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.output.status).toBe("completed");
      expect(body.output.strategy).toBe("document_search");
      expect(body.output.sourceLinks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "page",
            label: "网页问答手册",
          }),
        ]),
      );
      expect(body.output.evidenceList).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "search",
            title: "doc-web-qa-1",
          }),
        ]),
      );
      expect(body.output.observability).toMatchObject({
        eventKey: "external.web_qa",
        nodeType: "web_qa",
        strategy: "document_search",
        projectId: "proj-web-qa",
        pageCount: 1,
        sourceCount: 2,
        searchUsed: true,
        searchResultCount: 1,
        fallbackUsed: false,
      });
    });
  });

  it("returns fallback result when knowledge fallback is used", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/web-qa",
      createWebQaRouter({
        documentSearch: async () => {
          throw new Error("web upstream timeout");
        },
        knowledgeService: {
          query: async () => makeKnowledgeResult("知识库回退：优先查看内部 FAQ。"),
        },
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
      const response = await fetch(`${baseUrl}/api/web-qa/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "web_qa",
          input: {
            question: "网页不可用怎么办？",
            search: {
              scope: {
                projectId: "proj-web-qa",
              },
            },
            knowledgeFallback: {
              enabled: true,
              projectId: "proj-web-qa",
            },
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output.status).toBe("fallback");
      expect(body.output.fallbackUsed).toBe(true);
      expect(body.output.fallbackReason).toContain("web upstream timeout");
      expect(body.output.observability).toMatchObject({
        eventKey: "external.web_qa",
        nodeType: "web_qa",
        strategy: "knowledge_fallback",
        projectId: "proj-web-qa",
        pageCount: 0,
        sourceCount: 0,
        searchUsed: true,
        searchResultCount: 0,
        fallbackUsed: true,
        fallbackReason: expect.stringContaining("web upstream timeout"),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
