import { describe, expect, it, vi } from "vitest";

import type { RetrievalResult } from "../../shared/rag/contracts.js";
import { executeFragmentSearchNode } from "../routes/node-adapters/fragment-search-node-adapter.js";

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: "document:doc-1:0",
    score: 0.91,
    content: "Graph runtime compatibility content with document evidence.",
    sourceType: "document",
    sourceId: "doc-1",
    metadata: {
      ingestedAt: "2026-04-23T00:00:00.000Z",
      lastAccessedAt: "2026-04-23T00:00:00.000Z",
      contentHash: "hash-doc-1",
    },
    totalCandidates: 2,
    ...overrides,
  };
}

describe("executeFragmentSearchNode", () => {
  it("projects fragment hits into node output and normalizes retrieval options", async () => {
    const searchFragments = vi.fn(async () => [
      makeResult(),
      makeResult({
        chunkId: "document:doc-2:0",
        sourceId: "doc-2",
        score: 0.72,
        content: "Fragment that should be filtered out by documentIds.",
      }),
    ]);

    let current = 100;
    const now = () => {
      current += 9;
      return current;
    };

    const result = await executeFragmentSearchNode(
      {
        nodeType: "fragment_search",
        input: {
          query: "graph runtime",
          scope: {
            projectId: "proj-web-aigc",
            sourceTypes: ["document"],
            documentIds: ["doc-1"],
          },
          options: {
            topK: 5,
            minScore: 0.2,
            mode: "keyword",
          },
        },
      },
      {
        searchFragments,
        now,
      },
    );

    expect(searchFragments).toHaveBeenCalledWith(
      "graph runtime",
      expect.objectContaining({
        projectId: "proj-web-aigc",
        sourceTypes: ["document"],
        sourceIds: ["doc-1"],
        topK: 5,
        minScore: 0.2,
        mode: "keyword",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      nodeType: "fragment_search",
      output: {
        query: "graph runtime",
        totalCandidates: 1,
        latencyMs: 9,
        mode: "keyword",
        observability: {
          eventKey: "external.knowledge_retrieval",
          nodeType: "fragment_search",
          projectId: "proj-web-aigc",
          queryMode: "keyword",
          latencyMs: 9,
          structuredEntityCount: 0,
          semanticHitCount: 1,
          totalCandidates: 1,
        },
      },
    });
    expect(result.output.results).toHaveLength(1);
    expect(result.output.results[0]).toMatchObject({
      chunkId: "document:doc-1:0",
      documentId: "doc-1",
      score: 0.91,
    });
    expect(result.output.results[0].summary).toContain("Graph runtime");
    expect(result.output.results[0].highlight).toContain("Graph runtime");
    expect(result.output.results[0].positionHint).toEqual({
      start: 0,
      end: 13,
    });
    expect(result.output.result.results).toEqual(result.output.results);
  });

  it("rejects fragment_search without query", async () => {
    await expect(
      executeFragmentSearchNode(
        {
          nodeType: "fragment_search",
          input: {
            scope: {
              projectId: "proj-web-aigc",
            },
          },
        },
        {
          searchFragments: vi.fn(async () => []),
        },
      ),
    ).rejects.toThrow(/query is required/i);
  });

  it("rejects fragment_search without scope.projectId", async () => {
    await expect(
      executeFragmentSearchNode(
        {
          nodeType: "fragment_search",
          input: {
            query: "graph runtime",
            scope: {},
          },
        },
        {
          searchFragments: vi.fn(async () => []),
        },
      ),
    ).rejects.toThrow(/scope\.projectId is required/i);
  });

  it("rejects fragment_search when executor wiring is missing", async () => {
    await expect(
      executeFragmentSearchNode({
        nodeType: "fragment_search",
        input: {
          query: "graph runtime",
          scope: {
            projectId: "proj-web-aigc",
          },
        },
      }),
    ).rejects.toThrow(/requires fragment search retriever wiring/i);
  });

  it("wraps retriever failures with fragment search node context", async () => {
    await expect(
      executeFragmentSearchNode(
        {
          nodeType: "fragment_search",
          input: {
            query: "graph runtime",
            scope: {
              projectId: "proj-web-aigc",
            },
          },
        },
        {
          searchFragments: vi.fn(async () => {
            throw new Error("retriever exploded");
          }),
        },
      ),
    ).rejects.toThrow(/Fragment search node failed: retriever exploded/);
  });
});
