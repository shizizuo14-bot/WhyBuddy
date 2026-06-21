import express from "express";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GraphStore } from "../../knowledge/graph-store.js";
import { OntologyRegistry } from "../../knowledge/ontology-registry.js";
import { KnowledgeReviewQueue } from "../../knowledge/review-queue.js";
import { createKnowledgeAdminRouter } from "../knowledge-admin.js";

type TestDeps = {
  graphStore: GraphStore;
  ontologyRegistry: OntologyRegistry;
  reviewQueue: KnowledgeReviewQueue;
};

const ADMIN_ACTOR = {
  id: "admin-1",
  permissions: ["knowledge.admin"],
};

function createTestDeps(): TestDeps {
  const graphStore = new GraphStore();
  const ontologyRegistry = new OntologyRegistry();
  const reviewQueue = new KnowledgeReviewQueue(graphStore);
  return { graphStore, ontologyRegistry, reviewQueue };
}

async function withServer(
  handler: (baseUrl: string, deps: TestDeps) => Promise<void>,
): Promise<void> {
  const deps = createTestDeps();
  const app = express();
  app.use(express.json());
  app.use("/api/admin/knowledge", createKnowledgeAdminRouter(deps));
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
    await handler(baseUrl, deps);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function postProxy(baseUrl: string, body: Record<string, unknown>) {
  const url = new URL("/api/admin/knowledge/proxy", baseUrl);
  const payload = JSON.stringify(body);

  return new Promise<{ status: number; json: () => Promise<any> }>((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            json: async () => JSON.parse(text || "{}"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function runtimeSuccess(operation: string, payload: Record<string, unknown> = {}) {
  return {
    ok: true,
    operation,
    contractVersion: "knowledge-admin.runtime.v1",
    runtime: {
      owner: "python",
      mode: "runtime_bridge",
      storageOwner: "injected",
      externalStorage: false,
      ingestion: "not_started",
      embedding: "not_started",
    },
    projectId: "project-runtime",
    storage: "memory",
    migratedStorage: true,
    provenance: "python-knowledge-admin-runtime",
    ...payload,
  };
}

describe("knowledge admin Python runtime bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delegates list/get/upsert/delete to Python runtime endpoints", async () => {
    vi.stubEnv("KNOWLEDGE_ADMIN_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-admin.test/");
    vi.stubEnv("PYTHON_SLIDE_RULE_INTERNAL_KEY", "internal-test");

    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const operation = url.split("/").pop() ?? "";
        calls.push({
          url,
          body: JSON.parse(String(init?.body ?? "{}")),
        });

        if (operation === "list") {
          return new Response(
            JSON.stringify(runtimeSuccess("list", { items: [] })),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (operation === "get") {
          return new Response(
            JSON.stringify(
              runtimeSuccess("get", {
                found: true,
                item: { id: "kb-runtime-1", title: "Runtime item" },
              }),
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (operation === "upsert") {
          return new Response(
            JSON.stringify(
              runtimeSuccess("upsert", {
                stored: true,
                item: { id: "kb-runtime-1", title: "Runtime item" },
              }),
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify(runtimeSuccess("delete", { deleted: true, deletedId: "kb-runtime-1" })),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    await withServer(async (baseUrl) => {
      const list = await postProxy(baseUrl, {
        operation: "list",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
      });
      const get = await postProxy(baseUrl, {
        operation: "get",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
        itemId: "kb-runtime-1",
      });
      const upsert = await postProxy(baseUrl, {
        operation: "upsert",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
        item: { id: "kb-runtime-1", title: "Runtime item" },
      });
      const deleted = await postProxy(baseUrl, {
        operation: "delete",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
        itemId: "kb-runtime-1",
      });

      expect(list.status).toBe(200);
      expect(get.status).toBe(200);
      expect(upsert.status).toBe(200);
      expect(deleted.status).toBe(200);
      await expect(list.json()).resolves.toMatchObject({ ok: true, operation: "list" });
      await expect(get.json()).resolves.toMatchObject({ ok: true, operation: "get" });
      await expect(upsert.json()).resolves.toMatchObject({ ok: true, operation: "upsert" });
      await expect(deleted.json()).resolves.toMatchObject({ ok: true, operation: "delete" });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(calls.map((call) => call.url)).toEqual([
      "http://python-admin.test/api/admin/knowledge/runtime/list",
      "http://python-admin.test/api/admin/knowledge/runtime/get",
      "http://python-admin.test/api/admin/knowledge/runtime/upsert",
      "http://python-admin.test/api/admin/knowledge/runtime/delete",
    ]);
    expect(calls[0].body).toMatchObject({
      operation: "list",
      projectId: "project-runtime",
      nodeControl: {
        ingestionOwner: "node",
        embeddingOwner: "node",
        productionStorageOwner: "not_migrated",
      },
    });
  });

  it("preserves Python runtime validation errors instead of falling back to success", async () => {
    vi.stubEnv("KNOWLEDGE_ADMIN_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-admin.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          operation: "upsert",
          error: "validation_error",
          reason: "missing_item_id",
          message: "knowledge admin item id is required",
          permissionFailure: false,
          statusCode: 400,
          provenance: "python-knowledge-admin-runtime",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    await withServer(async (baseUrl) => {
      const res = await postProxy(baseUrl, {
        operation: "upsert",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
        item: { title: "Missing id" },
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        ok: false,
        operation: "upsert",
        error: "validation_error",
        reason: "missing_item_id",
        message: "knowledge admin item id is required",
        permissionFailure: false,
        statusCode: 400,
        provenance: "python-knowledge-admin-runtime",
      });
    });
  });

  it("preserves Python runtime not_found errors instead of returning a successful get", async () => {
    vi.stubEnv("KNOWLEDGE_ADMIN_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-admin.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          operation: "get",
          error: "not_found",
          reason: "knowledge_item_not_found",
          message: "knowledge item missing was not found",
          permissionFailure: false,
          statusCode: 404,
          provenance: "python-knowledge-admin-runtime",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );

    await withServer(async (baseUrl) => {
      const res = await postProxy(baseUrl, {
        operation: "get",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
        itemId: "missing",
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe("not_found");
      expect(body).not.toHaveProperty("item");
    });
  });

  it("returns runtime failure when Python runtime is unreachable instead of contract success", async () => {
    vi.stubEnv("KNOWLEDGE_ADMIN_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-admin.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    await withServer(async (baseUrl) => {
      const res = await postProxy(baseUrl, {
        operation: "delete",
        projectId: "project-runtime",
        actor: ADMIN_ACTOR,
        itemId: "kb-runtime-1",
      });

      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        ok: false,
        operation: "delete",
        error: "runtime_unavailable",
        reason: "python_runtime_failed",
        permissionFailure: false,
        statusCode: 503,
        provenance: "node-knowledge-admin-python-runtime",
      });
    });
  });
});
