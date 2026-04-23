import { describe, expect, it, vi } from "vitest";

import { executeGraphSearchNode } from "../routes/node-adapters/graph-search-node-adapter.js";

describe("executeGraphSearchNode", () => {
  it("executes neighbors mode and projects nodes and edges", async () => {
    const getNeighbors = vi.fn(async () => ({
      entities: [
        {
          entityId: "entity-b",
          entityType: "CodeModule",
          name: "order-service",
          description: "订单服务",
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          source: "code_analysis" as const,
          confidence: 0.92,
          projectId: "proj-1",
          status: "active" as const,
          needsReview: false,
          linkedMemoryIds: [],
          extendedAttributes: {},
        },
      ],
      relations: [
        {
          relationId: "rel-1",
          relationType: "DEPENDS_ON",
          sourceEntityId: "entity-a",
          targetEntityId: "entity-b",
          weight: 1,
          evidence: "import order-service",
          createdAt: "2026-04-23T00:00:00.000Z",
          source: "code_analysis" as const,
          confidence: 0.88,
          needsReview: false,
        },
      ],
      contextSummary: "Found 1 entity and 1 relation.",
      isPartial: false,
    }));

    const result = await executeGraphSearchNode(
      {
        nodeType: "graph_search",
        input: {
          mode: "neighbors",
          entityId: "entity-a",
          relationTypes: ["DEPENDS_ON"],
          depth: 2,
          context: {
            traceId: "trace-graph-neighbors",
          },
        },
      },
      {
        queryService: {
          getNeighbors,
          findPath: vi.fn(),
          subgraph: vi.fn(),
          naturalLanguageQuery: vi.fn(),
        },
      },
    );

    expect(getNeighbors).toHaveBeenCalledWith("entity-a", ["DEPENDS_ON"], 2);
    expect(result).toMatchObject({
      ok: true,
      nodeType: "graph_search",
      output: {
        status: "completed",
        mode: "neighbors",
        graph: {
          nodes: [
            {
              entityId: "entity-b",
              name: "order-service",
              entityType: "CodeModule",
            },
          ],
          edges: [
            {
              relationId: "rel-1",
              relationType: "DEPENDS_ON",
              sourceEntityId: "entity-a",
              targetEntityId: "entity-b",
            },
          ],
          path: [],
          pathFound: true,
          summary: "Found 1 entity and 1 relation.",
          isPartial: false,
        },
        metrics: {
          nodeCount: 1,
          edgeCount: 1,
          pathLength: 0,
        },
        context: {
          traceId: "trace-graph-neighbors",
        },
      },
    });
  });

  it("executes path mode and builds downstream answer draft through knowledge service", async () => {
    const findPath = vi.fn(async () => ({
      entities: [
        {
          entityId: "entity-source",
          entityType: "CodeModule",
          name: "payment-api",
          description: "支付接口",
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          source: "code_analysis" as const,
          confidence: 0.93,
          projectId: "proj-graph",
          status: "active" as const,
          needsReview: false,
          linkedMemoryIds: [],
          extendedAttributes: {},
        },
        {
          entityId: "entity-target",
          entityType: "BusinessRule",
          name: "fulfillment-check",
          description: "履约校验规则",
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          source: "llm_inferred" as const,
          confidence: 0.81,
          projectId: "proj-graph",
          status: "active" as const,
          needsReview: false,
          linkedMemoryIds: [],
          extendedAttributes: {},
        },
      ],
      relations: [
        {
          relationId: "rel-path-1",
          relationType: "IMPLEMENTS",
          sourceEntityId: "entity-source",
          targetEntityId: "entity-target",
          weight: 1,
          evidence: "payment-api triggers fulfillment-check",
          createdAt: "2026-04-23T00:00:00.000Z",
          source: "code_analysis" as const,
          confidence: 0.84,
          needsReview: false,
        },
      ],
      contextSummary: "Found a path between payment-api and fulfillment-check.",
      isPartial: false,
    }));
    const knowledgeQuery = vi.fn(async () => ({
      structuredResults: {
        entities: [
          {
            entityId: "entity-source",
            entityType: "CodeModule",
            name: "payment-api",
            description: "支付接口",
            createdAt: "2026-04-23T00:00:00.000Z",
            updatedAt: "2026-04-23T00:00:00.000Z",
            source: "code_analysis" as const,
            confidence: 0.93,
            projectId: "proj-graph",
            status: "active" as const,
            needsReview: false,
            linkedMemoryIds: [],
            extendedAttributes: {},
          },
        ],
        relations: [
          {
            relationId: "rel-path-1",
            relationType: "IMPLEMENTS",
            sourceEntityId: "entity-source",
            targetEntityId: "entity-target",
            weight: 1,
            evidence: "payment-api triggers fulfillment-check",
            createdAt: "2026-04-23T00:00:00.000Z",
            source: "code_analysis" as const,
            confidence: 0.84,
            needsReview: false,
          },
        ],
      },
      semanticResults: [
        {
          id: "semantic-1",
          content: "支付链路先走 payment-api，再触发 fulfillment-check。",
          score: 0.79,
        },
      ],
      mergedSummary: "支付链路会先经过 payment-api，再进入 fulfillment-check 规则校验。",
    }));

    const result = await executeGraphSearchNode(
      {
        nodeType: "graph_search",
        input: {
          mode: "path",
          projectId: "proj-graph",
          sourceEntityId: "entity-source",
          targetEntityId: "entity-target",
          includeAnswerDraft: true,
          answerQuestion: "支付链路是怎么走到履约校验的？",
        },
      },
      {
        queryService: {
          getNeighbors: vi.fn(),
          findPath,
          subgraph: vi.fn(),
          naturalLanguageQuery: vi.fn(),
        },
        knowledgeService: {
          query: knowledgeQuery,
        },
      },
    );

    expect(findPath).toHaveBeenCalledWith("entity-source", "entity-target");
    expect(knowledgeQuery).toHaveBeenCalledWith(
      "支付链路是怎么走到履约校验的？",
      "proj-graph",
      { mode: "preferStructured" },
    );
    expect(result.output.graph.path).toEqual([
      {
        entityId: "entity-source",
        name: "payment-api",
        entityType: "CodeModule",
        viaRelationType: "IMPLEMENTS",
      },
      {
        entityId: "entity-target",
        name: "fulfillment-check",
        entityType: "BusinessRule",
      },
    ]);
    expect(result.output.downstream).toMatchObject({
      knowledgeQaReady: true,
      answerDraft: {
        question: "支付链路是怎么走到履约校验的？",
        answer: "支付链路会先经过 payment-api，再进入 fulfillment-check 规则校验。",
        citations: [
          "CodeModule:payment-api",
          "IMPLEMENTS:entity-source->entity-target",
          "semantic:semantic-1",
        ],
      },
    });
  });

  it("uses natural language mode by default and rejects missing required fields", async () => {
    const naturalLanguageQuery = vi.fn(async () => ({
      entities: [],
      relations: [],
      contextSummary: "No results found.",
      isPartial: false,
    }));

    await expect(
      executeGraphSearchNode(
        {
          nodeType: "graph_search",
          input: {
            query: "支付相关规则有哪些？",
          },
        },
        {
          queryService: {
            getNeighbors: vi.fn(),
            findPath: vi.fn(),
            subgraph: vi.fn(),
            naturalLanguageQuery,
          },
        },
      ),
    ).rejects.toThrow(/requires projectid/i);

    const result = await executeGraphSearchNode(
      {
        nodeType: "graph_search",
        input: {
          projectId: "proj-nl",
          query: "支付相关规则有哪些？",
        },
      },
      {
        queryService: {
          getNeighbors: vi.fn(),
          findPath: vi.fn(),
          subgraph: vi.fn(),
          naturalLanguageQuery,
        },
      },
    );

    expect(naturalLanguageQuery).toHaveBeenCalledWith("支付相关规则有哪些？", "proj-nl");
    expect(result.output.mode).toBe("natural_language");
    expect(result.output.downstream.knowledgeQaReady).toBe(false);
  });
});
