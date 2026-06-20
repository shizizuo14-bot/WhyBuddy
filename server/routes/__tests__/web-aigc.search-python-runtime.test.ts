import { describe, expect, it, vi } from "vitest";

import type { QueryResult } from "../../../shared/knowledge/types.js";
import type { WebAigcImageSearchResponse } from "../../../shared/web-aigc-image-search.js";
import type { WebSearchResponse } from "../../../shared/web-search.js";
import { executeGraphSearchNode } from "../node-adapters/graph-search-node-adapter.js";
import { executeImageSearchNode } from "../node-adapters/image-search-node-adapter.js";
import { executeStaticWebpageReadNode } from "../node-adapters/static-webpage-read-node-adapter.js";
import { executeWebSearchNode } from "../node-adapters/web-search-node-adapter.js";

const pythonRuntime = {
  backend: "python",
  provider: "fake",
  externalCalls: false,
} as const;

describe("web AIGC search Python runtime bridge", () => {
  it("web search accepts Python runtime success without external fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const executeWebSearch = vi.fn().mockResolvedValue({
      ok: true,
      query: "python runtime web",
      status: "completed",
      results: [
        {
          title: "Python runtime web result",
          url: "https://example.test/python-runtime-web",
          snippet: "Fake Python runtime web result.",
          source: "fake-web-search",
        },
      ],
      totalCandidates: 1,
      latencyMs: 3,
      mode: "mock",
      provenance: {
        provider: "fake",
        source: "fake-web-search",
        query: "python runtime web",
        auditId: "audit-runtime-web",
      },
      runtime: {
        ...pythonRuntime,
        source: "python-web-search-runtime",
      },
    } satisfies WebSearchResponse & { status: "completed"; runtime: unknown });

    const result = await executeWebSearchNode(
      { nodeType: "web_search", input: { query: "python runtime web" } },
      { executeWebSearch, now: () => 1000 },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.query).toBe("python runtime web");
    expect(result.output.provenance?.auditId).toBe("audit-runtime-web");
    expect(result.output.runtime).toMatchObject({
      backend: "python",
      source: "python-web-search-runtime",
      externalCalls: false,
    });
    expect(executeWebSearch).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("web search keeps Python runtime empty separate from completed", async () => {
    const result = await executeWebSearchNode(
      { nodeType: "web_search", input: { query: "python runtime empty" } },
      {
        executeWebSearch: vi.fn().mockResolvedValue({
          ok: true,
          query: "python runtime empty",
          status: "empty",
          results: [],
          totalCandidates: 0,
          latencyMs: 1,
          mode: "mock",
          provenance: {
            provider: "fake",
            source: "fake-web-search",
            query: "python runtime empty",
          },
          runtime: {
            ...pythonRuntime,
            source: "python-web-search-runtime",
          },
        } satisfies WebSearchResponse & { status: "empty"; runtime: unknown }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("empty");
    expect(result.output.status).not.toBe("completed");
    expect(result.output.runtime).toMatchObject({ backend: "python" });
  });

  it("web search keeps Python runtime error separate from completed", async () => {
    const result = await executeWebSearchNode(
      { nodeType: "web_search", input: { query: "python runtime error" } },
      {
        executeWebSearch: vi.fn().mockResolvedValue({
          ok: false,
          query: "python runtime error",
          status: "error",
          error: {
            code: "fake_provider_error",
            message: "Fake search provider failed.",
          },
          results: [],
          totalCandidates: 0,
          latencyMs: 1,
          mode: "mock",
          provenance: {
            provider: "fake",
            source: "fake-web-search",
            query: "python runtime error",
          },
          runtime: {
            ...pythonRuntime,
            source: "python-web-search-runtime",
          },
        } satisfies WebSearchResponse & { status: "error"; runtime: unknown }),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("error");
    expect(result.output.status).not.toBe("completed");
    expect(result.output.error?.code).toBe("fake_provider_error");
    expect(result.output.runtime).toMatchObject({ backend: "python" });
  });

  it("image search keeps Python runtime permission denied separate from completed", async () => {
    const response = {
      ok: false,
      query: "python runtime blocked image",
      normalized: {
        textQuery: "python runtime blocked image",
        tags: [],
        referenceTags: [],
      },
      results: [],
      totalCandidates: 0,
      degraded: true,
      warnings: [],
      mode: "mock",
      status: "permission_denied",
      error: {
        code: "permission_denied",
        message: "Search adapter execution denied by permission policy.",
      },
      provenance: {
        provider: "fake",
        source: "fake-image-search",
        query: "python runtime blocked image",
        auditId: "audit-runtime-image-denied",
        permission: {
          allowed: false,
          reason: "policy_denied",
          auditId: "audit-runtime-image-denied",
        },
      },
      runtime: {
        ...pythonRuntime,
        source: "python-image-search-runtime",
      },
    } satisfies WebAigcImageSearchResponse & { runtime: unknown };

    const result = await executeImageSearchNode(
      { nodeType: "image_search", input: { query: "python runtime blocked image" } },
      { executeImageSearch: vi.fn().mockResolvedValue(response) },
    );

    expect(result.ok).toBe(false);
    expect(result.output.status).toBe("permission_denied");
    expect(result.output.status).not.toBe("completed");
    expect(result.output.error?.code).toBe("permission_denied");
    expect(result.output.provenance?.permission).toMatchObject({
      allowed: false,
      reason: "policy_denied",
    });
    expect(result.output.runtime).toMatchObject({
      backend: "python",
      source: "python-image-search-runtime",
    });
  });

  it("graph search carries Python runtime provenance through context", async () => {
    const queryService = {
      naturalLanguageQuery: vi.fn().mockResolvedValue({
        entities: [
          {
            entityId: "entity-runtime-1",
            entityType: "concept",
            name: "Python Runtime Graph",
            description: "Fake runtime graph result.",
            confidence: 0.91,
            projectId: "project-runtime",
          },
        ],
        relations: [],
        contextSummary: "Python runtime graph summary.",
        isPartial: false,
      } satisfies QueryResult),
      getNeighbors: vi.fn(),
      findPath: vi.fn(),
      subgraph: vi.fn(),
    };

    const result = await executeGraphSearchNode(
      {
        nodeType: "graph_search",
        input: {
          projectId: "project-runtime",
          query: "python runtime graph",
          mode: "natural_language",
          context: {
            provenance: {
              provider: "fake",
              source: "fake-graph-search",
              query: "python runtime graph",
            },
            runtime: {
              ...pythonRuntime,
              source: "python-graph-search-runtime",
            },
          },
        },
      },
      { queryService },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.provenance).toMatchObject({
      provider: "fake",
      source: "fake-graph-search",
      query: "python runtime graph",
    });
    expect(result.output.context.runtime).toMatchObject({
      backend: "python",
      source: "python-graph-search-runtime",
    });
  });

  it("static webpage read accepts Python fake page as inline content without fetching", async () => {
    const fetchHtml = vi.fn();
    const result = await executeStaticWebpageReadNode(
      {
        nodeType: "static_webpage_read",
        input: {
          url: "https://example.test/python-runtime-page",
          html: "<html><head><title>Python Runtime Page</title></head><body><main>Python runtime fake static page.</main></body></html>",
          context: {
            provenance: {
              provider: "fake",
              source: "fake-static-webpage-read",
              query: "https://example.test/python-runtime-page",
            },
            runtime: {
              ...pythonRuntime,
              source: "python-static-webpage-read-runtime",
            },
          },
        },
      },
      { fetchHtml },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.page.fetched).toBe(false);
    expect(result.output.page.contentSource).toBe("inline_html");
    expect(result.output.context.runtime).toMatchObject({
      backend: "python",
      source: "python-static-webpage-read-runtime",
    });
    expect(fetchHtml).not.toHaveBeenCalled();
  });
});
