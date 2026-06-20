import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { isRAGIngestionPythonRuntimeResult } from "../../../shared/rag/contracts.js";
import { createRAGRouter, type RAGRouteDeps } from "../rag.js";

function createDeps(ingestResult: unknown): RAGRouteDeps {
  return {
    ingestionPipeline: {
      ingest: vi.fn(async () => ingestResult),
      ingestBatch: vi.fn(),
      getDeadLetters: vi.fn(async () => []),
      retryDeadLetter: vi.fn(),
    } as unknown as RAGRouteDeps["ingestionPipeline"],
    retriever: { search: vi.fn(async () => []) } as unknown as RAGRouteDeps["retriever"],
    ragPipeline: {} as RAGRouteDeps["ragPipeline"],
    feedbackCollector: {
      recordExplicit: vi.fn(),
      getStats: vi.fn(() => ({})),
    } as unknown as RAGRouteDeps["feedbackCollector"],
    lifecycleManager: { purge: vi.fn() } as unknown as RAGRouteDeps["lifecycleManager"],
    healthChecker: { check: vi.fn() } as unknown as RAGRouteDeps["healthChecker"],
    metrics: {
      snapshot: vi.fn(),
      recordRetrieval: vi.fn(),
    } as unknown as RAGRouteDeps["metrics"],
    augmentationLogger: {
      getByTaskId: vi.fn(() => []),
    } as unknown as RAGRouteDeps["augmentationLogger"],
  };
}

async function withApp(
  configure: (app: express.Express) => void,
  handler: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  configure(app);
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

describe("RAG ingestion Python production storage bridge", () => {
  it("accepts successful memory upsert and delete storage contracts", () => {
    const base = {
      contractVersion: "rag-ingestion.runtime.v1",
      runtime: "python-contract",
      ok: true,
      status: "completed",
      ingestionId: "ingest-production-1",
      projectId: "project-production",
      sourceType: "document",
      sourceId: "doc-production-1",
      storage: "memory",
      migratedStorage: true,
      provenance: {
        provider: "memory",
        source: "production-storage-test",
      },
      lifecycle: {
        state: "active",
      },
      feedback: {
        helpfulChunkIds: [],
        irrelevantChunkIds: [],
      },
    };
    const upsert = {
      ...base,
      operation: "upsert",
      upsert: {
        collection: "rag_project-production",
        attempted: true,
        stored: true,
        upsertedCount: 2,
        recordIds: ["document:doc-production-1:0", "document:doc-production-1:1"],
      },
    };
    const deleted = {
      ...base,
      operation: "delete",
      delete: {
        collection: "rag_project-production",
        attempted: true,
        deleted: true,
        deletedCount: 2,
        targetIds: ["document:doc-production-1:0", "document:doc-production-1:1"],
      },
    };

    expect(isRAGIngestionPythonRuntimeResult(upsert)).toBe(true);
    expect(isRAGIngestionPythonRuntimeResult(deleted)).toBe(true);
  });

  it("returns storage unavailable as 503 without fallback success", async () => {
    const unavailable = {
      contractVersion: "rag-ingestion.runtime.v1",
      runtime: "python-contract",
      operation: "upsert",
      ok: false,
      status: "unavailable",
      ingestionId: "ingest-production-1",
      projectId: "project-production",
      sourceType: "document",
      sourceId: "doc-production-1",
      storage: "unavailable",
      migratedStorage: false,
      provenance: {
        provider: "memory",
        source: "production-storage-test",
      },
      lifecycle: {
        state: "active",
      },
      feedback: {
        helpfulChunkIds: [],
        irrelevantChunkIds: [],
      },
      deadLetter: {
        entryId: "dlq-ingest-production-1",
        retryCount: 0,
        stage: "store",
        error: "storage offline",
      },
      error: {
        code: "python_rag_ingestion_storage_unavailable",
        message: "storage offline",
        retryable: true,
      },
    };
    const deps = createDeps(unavailable);

    await withApp(
      (app) => app.use("/api/rag", createRAGRouter(deps)),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/rag/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: {
              sourceType: "document",
              sourceId: "doc-production-1",
              projectId: "project-production",
              content: "Production storage contract body.",
              metadata: {},
              timestamp: "2026-06-20T00:00:00.000Z",
            },
          }),
        });

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body).toEqual(unavailable);
        expect(body.ok).toBe(false);
        expect(body.status).toBe("unavailable");
        expect(body.storage).toBe("unavailable");
        expect(body.migratedStorage).toBe(false);
        expect(body).not.toHaveProperty("upsert");
      },
    );

    expect(deps.ingestionPipeline.ingest).toHaveBeenCalledTimes(1);
  });

  it("returns storage failed as 500 without fallback success", async () => {
    const failed = {
      contractVersion: "rag-ingestion.runtime.v1",
      runtime: "python-contract",
      operation: "upsert",
      ok: false,
      status: "failed",
      ingestionId: "ingest-production-1",
      projectId: "project-production",
      sourceType: "document",
      sourceId: "doc-production-1",
      storage: "memory",
      migratedStorage: false,
      provenance: {
        provider: "memory",
        source: "production-storage-test",
      },
      lifecycle: {
        state: "active",
      },
      feedback: {
        helpfulChunkIds: [],
        irrelevantChunkIds: [],
      },
      deadLetter: {
        entryId: "dlq-ingest-production-1",
        retryCount: 0,
        stage: "store",
        error: "storage failed",
      },
      error: {
        code: "python_rag_ingestion_storage_failed",
        message: "storage failed",
        retryable: false,
      },
    };
    const deps = createDeps(failed);

    await withApp(
      (app) => app.use("/api/rag", createRAGRouter(deps)),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/rag/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: {
              sourceType: "document",
              sourceId: "doc-production-1",
              projectId: "project-production",
              content: "Production storage contract body.",
              metadata: {},
              timestamp: "2026-06-20T00:00:00.000Z",
            },
          }),
        });

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body).toEqual(failed);
        expect(body.ok).toBe(false);
        expect(body.status).toBe("failed");
        expect(body).not.toHaveProperty("upsert");
      },
    );

    expect(deps.ingestionPipeline.ingest).toHaveBeenCalledTimes(1);
  });
});
