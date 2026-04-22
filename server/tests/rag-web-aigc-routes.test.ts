import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RetrievalResult } from "../../shared/rag/contracts.js";
import { createRAGRouter, type RAGRouteDeps } from "../routes/rag.js";

function createDeps(results: RetrievalResult[] = []): RAGRouteDeps {
  return {
    ingestionPipeline: {
      ingest: vi.fn(),
      ingestBatch: vi.fn(),
      getDeadLetters: vi.fn(),
      retryDeadLetter: vi.fn(),
    } as unknown as RAGRouteDeps["ingestionPipeline"],
    retriever: {
      search: vi.fn(async () => results),
    } as unknown as RAGRouteDeps["retriever"],
    ragPipeline: {} as RAGRouteDeps["ragPipeline"],
    feedbackCollector: {
      recordExplicit: vi.fn(),
      getStats: vi.fn(),
    } as unknown as RAGRouteDeps["feedbackCollector"],
    lifecycleManager: {
      purge: vi.fn(),
    } as unknown as RAGRouteDeps["lifecycleManager"],
    healthChecker: {
      check: vi.fn(),
    } as unknown as RAGRouteDeps["healthChecker"],
    metrics: {
      snapshot: vi.fn(),
    } as unknown as RAGRouteDeps["metrics"],
    augmentationLogger: {
      getByTaskId: vi.fn(),
    } as unknown as RAGRouteDeps["augmentationLogger"],
  };
}

async function withServer(
  deps: RAGRouteDeps,
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/rag", createRAGRouter(deps));
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

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: "document:doc-1:0",
    score: 0.91,
    content: "Graph runtime compatibility content with document evidence.",
    sourceType: "document",
    sourceId: "doc-1",
    metadata: {
      ingestedAt: "2026-04-22T00:00:00.000Z",
      lastAccessedAt: "2026-04-22T00:00:00.000Z",
      contentHash: "hash-doc-1",
    },
    totalCandidates: 2,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("web-aigc RAG compatibility routes", () => {
  it("projects document_search results into document groups", async () => {
    const deps = createDeps([
      makeResult(),
      makeResult({
        chunkId: "document:doc-1:1",
        score: 0.72,
        content: "Second fragment about graph runtime monitoring compatibility.",
      }),
      makeResult({
        chunkId: "document:doc-2:0",
        sourceId: "doc-2",
        score: 0.88,
        content: "Another document for document search adapter.",
      }),
    ]);

    await withServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/rag/web-aigc/document-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "graph runtime",
          scope: {
            projectId: "proj-web-aigc",
            sourceTypes: ["document"],
          },
          options: {
            topK: 5,
            mode: "hybrid",
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.query).toBe("graph runtime");
      expect(body.mode).toBe("hybrid");
      expect(body.results).toHaveLength(2);
      expect(body.results[0].documentId).toBe("doc-1");
      expect(body.results[0].fragments).toHaveLength(2);
      expect(body.results[0].highlights.length).toBeGreaterThan(0);
    });

    expect(deps.retriever.search).toHaveBeenCalledWith(
      "graph runtime",
      expect.objectContaining({
        projectId: "proj-web-aigc",
        sourceTypes: ["document"],
        topK: 5,
        mode: "hybrid",
      }),
    );
  });

  it("filters fragment_search results by documentIds", async () => {
    const deps = createDeps([
      makeResult(),
      makeResult({
        chunkId: "document:doc-2:0",
        sourceId: "doc-2",
        content: "Fragment that should be filtered out.",
      }),
    ]);

    await withServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/rag/web-aigc/fragment-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "graph runtime",
          scope: {
            projectId: "proj-web-aigc",
            documentIds: ["doc-1"],
          },
          options: {
            mode: "keyword",
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.mode).toBe("keyword");
      expect(body.results).toHaveLength(1);
      expect(body.results[0].documentId).toBe("doc-1");
      expect(body.results[0].summary).toContain("Graph runtime");
    });
  });

  it("returns 400 when query is missing", async () => {
    const deps = createDeps();

    await withServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/rag/web-aigc/document-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: { projectId: "proj-web-aigc" },
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("query");
    });
  });

  it("returns 400 when scope.projectId is missing", async () => {
    const deps = createDeps();

    await withServer(deps, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/rag/web-aigc/fragment-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "graph runtime",
          scope: {},
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("scope.projectId");
    });
  });
});
