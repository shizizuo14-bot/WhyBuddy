import { describe, expect, it } from "vitest";

import { executeWebQaNode } from "../routes/node-adapters/web-qa-node-adapter.js";
import type { UnifiedKnowledgeResult } from "../../shared/knowledge/types.js";
import type { WebAigcDocumentSearchResponse } from "../../shared/rag/web-aigc-search.js";

function makeKnowledgeResult(summary: string): UnifiedKnowledgeResult {
  return {
    mergedSummary: summary,
    structuredResults: {
      entities: [
        {
          entityId: "entity-1",
          entityType: "FAQ",
          name: "web-qa-fallback",
          description: summary,
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          source: "user_defined",
          confidence: 0.9,
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

describe("executeWebQaNode", () => {
  it("answers from inline pages and document search with citations and links", async () => {
    const question = "How do I investigate a payment failure?";
    const searchCalls: string[] = [];

    const result = await executeWebQaNode(
      {
        nodeType: "web_qa",
        input: {
          question,
          pages: [
            {
              pageId: "ops-runbook",
              route: "/runbooks/payment",
              title: "Payment Runbook",
              summary: "Verify payment status before checking callbacks and fulfillment logs.",
              content:
                "After a payment failure, verify payment status, inspect callback logs, then compare downstream consumption records.",
            },
          ],
          search: {
            scope: {
              projectId: "proj-web-qa",
              sourceTypes: ["document"],
            },
            options: {
              topK: 2,
              mode: "hybrid",
            },
            linkMap: {
              "doc-payment-1": {
                pageId: "doc-payment-1",
                href: "https://docs.example.com/payment/troubleshooting",
                title: "Payment Troubleshooting Doc",
                targetKind: "external_url",
                openMode: "new_tab",
              },
            },
          },
          workflowId: "wf-web-qa-1",
          sessionId: "session-web-qa-1",
          missionId: "mission-web-qa-1",
          agentId: "agent-web-qa-1",
          stage: "web_qa",
        },
      },
      {
        documentSearch: async (request) => {
          searchCalls.push(request.query);
          const response: WebAigcDocumentSearchResponse = {
            query: request.query,
            totalCandidates: 1,
            latencyMs: 15,
            mode: "hybrid",
            results: [
              {
                documentId: "doc-payment-1",
                sourceType: "document",
                score: 0.91,
                summary:
                  "When callbacks fail, check gateway retries and downstream consumption records.",
                highlights: ["gateway retries", "downstream consumption records"],
                fragments: [],
              },
            ],
          };
          return response;
        },
        executeLLM: async (messages) => ({
          content: `web qa answer: ${messages[messages.length - 1]?.content}`,
          usage: {
            prompt_tokens: 20,
            completion_tokens: 12,
            total_tokens: 32,
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
            current += 25;
            return current;
          };
        })(),
      },
    );

    expect(searchCalls).toEqual([question]);
    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.strategy).toBe("document_search");
    expect(result.output.answer).toContain(question);
    expect(result.output.citations).toEqual(
      expect.arrayContaining([
        "Payment Runbook: Verify payment status before checking callbacks and fulfillment logs.",
        "doc-payment-1: When callbacks fail, check gateway retries and downstream consumption records. [gateway retries | downstream consumption records]",
      ]),
    );
    expect(result.output.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "page",
          label: "Payment Runbook",
          route: "/runbooks/payment",
        }),
        expect.objectContaining({
          source: "search",
          label: "Payment Troubleshooting Doc",
          href: "https://docs.example.com/payment/troubleshooting",
          targetKind: "external_url",
          openMode: "new_tab",
          external: true,
        }),
      ]),
    );
    expect(result.output.evidenceList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "page",
          title: "Payment Runbook",
        }),
        expect.objectContaining({
          source: "search",
          title: "doc-payment-1",
          score: 0.91,
        }),
      ]),
    );
    expect(result.output.fallbackUsed).toBe(false);
    expect(result.output.metadata.downstreamConsumers).toEqual([
      "end",
      "file_generation",
    ]);
    expect(result.output.observability).toMatchObject({
      eventKey: "external.web_qa",
      nodeType: "web_qa",
      strategy: "document_search",
      question,
      projectId: "proj-web-qa",
      pageCount: 1,
      inlinePageCount: 1,
      sourceCount: 2,
      searchUsed: true,
      searchQuery: question,
      searchResultCount: 1,
      fallbackUsed: false,
    });
  });

  it("falls back to knowledge_qa when search is unavailable", async () => {
    const result = await executeWebQaNode(
      {
        nodeType: "web_qa",
        input: {
          question: "What should I do when the page context is unavailable?",
          search: {
            scope: {
              projectId: "proj-web-qa",
            },
          },
          knowledgeFallback: {
            enabled: true,
            projectId: "proj-web-qa",
            options: {
              mode: "preferStructured",
            },
          },
        },
      },
      {
        documentSearch: async () => {
          throw new Error("web search upstream unavailable");
        },
        knowledgeService: {
          query: async () =>
            makeKnowledgeResult("Fallback knowledge answer: check internal FAQ and summaries."),
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("fallback");
    expect(result.output.strategy).toBe("knowledge_fallback");
    expect(result.output.answer).toBe(
      "Fallback knowledge answer: check internal FAQ and summaries.",
    );
    expect(result.output.fallbackUsed).toBe(true);
    expect(result.output.fallbackReason).toContain("web search upstream unavailable");
    expect(result.output.citations).toEqual(
      expect.arrayContaining(["FAQ:web-qa-fallback"]),
    );
    expect(result.output.evidenceList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "knowledge_fallback",
          title: "web-qa-fallback",
        }),
      ]),
    );
  });

  it("returns failed when no page/search context and no fallback are available", async () => {
    const result = await executeWebQaNode({
      nodeType: "web_qa",
      input: {
        question: "What if there is no context at all?",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("failed");
    expect(result.output.error).toContain("No page context or search results available");
  });
});
