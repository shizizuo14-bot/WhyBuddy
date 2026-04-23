import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { GraphStore } from "../knowledge/graph-store.js";
import { KnowledgeService } from "../knowledge/knowledge-service.js";
import { KnowledgeGraphQuery } from "../knowledge/query-service.js";
import { OntologyRegistry } from "../knowledge/ontology-registry.js";
import { createGraphSearchRouter } from "../routes/graph-search.js";
import type { Entity } from "../../shared/knowledge/types.js";

function uniqueProjectId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function seedEntity(
  graphStore: GraphStore,
  overrides: Partial<Entity> & { name: string },
): Entity {
  return graphStore.createEntity({
    entityType: "CodeModule",
    description: "图谱测试实体",
    source: "code_analysis",
    confidence: 0.9,
    projectId: overrides.projectId ?? uniqueProjectId("proj"),
    needsReview: false,
    linkedMemoryIds: [],
    extendedAttributes: {},
    ...overrides,
  });
}

function createTestDeps() {
  const graphStore = new GraphStore();
  const ontologyRegistry = new OntologyRegistry();
  const queryService = new KnowledgeGraphQuery(graphStore, ontologyRegistry);
  const knowledgeService = new KnowledgeService(queryService, graphStore);
  return { graphStore, queryService, knowledgeService };
}

async function withServer(
  handler: (
    baseUrl: string,
    deps: ReturnType<typeof createTestDeps>,
  ) => Promise<void>,
): Promise<void> {
  const deps = createTestDeps();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/graph-search",
    createGraphSearchRouter({
      queryService: deps.queryService,
      knowledgeService: deps.knowledgeService,
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

describe("POST /api/graph-search/nodes/execute", () => {
  it("rejects unsupported node types", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/graph-search/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "dialogue",
          input: {},
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("nodeType must be graph_search");
    });
  });

  it("executes path mode with graph nodes, edges, path and answer draft", async () => {
    await withServer(async (baseUrl, deps) => {
      const projectId = uniqueProjectId("proj-graph-route");
      const source = seedEntity(deps.graphStore, {
        name: "payment-api",
        projectId,
      });
      const middle = seedEntity(deps.graphStore, {
        name: "order-orchestrator",
        projectId,
      });
      const target = seedEntity(deps.graphStore, {
        name: "fulfillment-rule",
        entityType: "BusinessRule",
        description: "履约校验规则",
        source: "llm_inferred",
        confidence: 0.82,
        projectId,
      });
      deps.graphStore.createRelation({
        relationType: "CALLS",
        sourceEntityId: source.entityId,
        targetEntityId: middle.entityId,
        weight: 1,
        evidence: "payment-api calls order-orchestrator",
        source: "code_analysis",
        confidence: 0.91,
        needsReview: false,
      });
      deps.graphStore.createRelation({
        relationType: "IMPLEMENTS",
        sourceEntityId: middle.entityId,
        targetEntityId: target.entityId,
        weight: 1,
        evidence: "order-orchestrator implements fulfillment-rule",
        source: "code_analysis",
        confidence: 0.87,
        needsReview: false,
      });

      const response = await fetch(`${baseUrl}/api/graph-search/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "graph_search",
          input: {
            mode: "path",
            projectId,
            sourceEntityId: source.entityId,
            targetEntityId: target.entityId,
            includeAnswerDraft: true,
            answerQuestion: "支付 API 是怎么走到履约规则的？",
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.nodeType).toBe("graph_search");
      expect(body.output.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "payment-api" }),
          expect.objectContaining({ name: "order-orchestrator" }),
          expect.objectContaining({ name: "fulfillment-rule" }),
        ]),
      );
      expect(body.output.graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ relationType: "CALLS" }),
          expect.objectContaining({ relationType: "IMPLEMENTS" }),
        ]),
      );
      expect(body.output.graph.path.length).toBeGreaterThanOrEqual(2);
      expect(body.output.downstream.knowledgeQaReady).toBe(true);
      expect(body.output.downstream.answerDraft.question).toBe(
        "支付 API 是怎么走到履约规则的？",
      );
      expect(body.output.downstream.answerDraft.citations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^CodeModule:/),
        ]),
      );
    });
  });

  it("returns 400 when subgraph mode is missing entityIds", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/graph-search/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "graph_search",
          input: {
            mode: "subgraph",
          },
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("requires entityIds");
    });
  });

  it("executes natural language mode by default and returns graph summary", async () => {
    await withServer(async (baseUrl, deps) => {
      const projectId = uniqueProjectId("proj-nl-route");
      seedEntity(deps.graphStore, {
        name: "refund-policy",
        entityType: "BusinessRule",
        description: "退款时要先核对支付状态",
        source: "llm_inferred",
        confidence: 0.88,
        projectId,
      });

      const naturalLanguageQuerySpy = vi.spyOn(
        deps.queryService,
        "naturalLanguageQuery",
      );

      const response = await fetch(`${baseUrl}/api/graph-search/nodes/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: "graph_search",
          input: {
            projectId,
            query: "退款规则有哪些？",
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.output.mode).toBe("natural_language");
      expect(body.output.graph.summary).toContain("Found");
      expect(naturalLanguageQuerySpy).toHaveBeenCalledWith("退款规则有哪些？", projectId);
    });
  });
});
