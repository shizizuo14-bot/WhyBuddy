import { describe, expect, it } from "vitest";

import { parseSpecTreeLlmResponse } from "../llm-spec-prompts.js";

describe("parseSpecTreeLlmResponse", () => {
  it("normalizes workbench-style nodes with title/summary aliases and platform node types", () => {
    const result = parseSpecTreeLlmResponse({
      nodes: [
        {
          id: "root-node",
          name: "Generated Root",
          description: "Root description from a direct SPEC tree payload.",
          type: "root",
          priority: "100",
          status: "seed",
          dependencies: [],
          outputs: [],
          children: ["docs-node"],
        },
        {
          id: "docs-node",
          parentId: "root-node",
          label: "Requirements Document",
          details: "Document anchor emitted by the workbench SPEC tree prompt.",
          type: "spec_document",
          status: "seed",
          dependencies: [],
          outputs: [],
          children: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rootTitle).toBe("Generated Root");
    expect(result.data.rootSummary).toBe("Root description from a direct SPEC tree payload.");
    expect(result.data.nodes[1]).toMatchObject({
      title: "Requirements Document",
      summary: "Document anchor emitted by the workbench SPEC tree prompt.",
      type: "spec_document",
      priority: 50,
    });
  });

  it("includes the failing schema path in validation errors", () => {
    const result = parseSpecTreeLlmResponse({
      rootTitle: "Root",
      rootSummary: "Root summary",
      nodes: [
        {
          id: "root-node",
          title: "Root",
          summary: "Root with proper fields.",
          type: "root",
          priority: 100,
        },
        {
          id: "step-without-title",
          parentId: "root-node",
          // 故意缺 title：非 root 节点没有 wrapper 兜底，应在 nodes.1.title 处报错。
          summary: "Missing title should include the node path.",
          type: "route_step",
          priority: 80,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("nodes.1.title");
  });

  it("normalizes a top-level array (reasoning model dropping the wrapper) into { nodes }", () => {
    // 模拟 `ouyi-5-preview-thinking` 等 reasoning 模型在严格 JSON 模式下省略
    // wrapper、直接把 nodes 数组当成 finish output 提交的真实情况。
    const result = parseSpecTreeLlmResponse([
      {
        id: "root-node",
        title: "Generated Root",
        summary: "Root description from a top-level array payload.",
        type: "root",
        priority: 90,
      },
      {
        id: "step-1",
        parentId: "root-node",
        title: "Route Step 1",
        summary: "First decomposed step from a top-level array payload.",
        type: "route_step",
        priority: 70,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(2);
    expect(result.data.rootTitle).toBe("Generated Root");
    expect(result.data.rootSummary).toBe(
      "Root description from a top-level array payload.",
    );
  });

  it("normalizes responses that wrap the tree in an extra { output } envelope", () => {
    const result = parseSpecTreeLlmResponse({
      output: {
        nodes: [
          {
            id: "root-node",
            title: "Wrapped Root",
            summary: "Root description from a wrapped output envelope.",
            type: "root",
            priority: 88,
          },
          {
            id: "step-1",
            parentId: "root-node",
            title: "Wrapped Step",
            summary: "Decomposed step inside an output envelope.",
            type: "route_step",
            priority: 60,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rootTitle).toBe("Wrapped Root");
    expect(result.data.nodes[1]).toMatchObject({
      title: "Wrapped Step",
      type: "route_step",
    });
  });

  it("falls back to a default rootTitle/rootSummary when the LLM omits the wrapper fields entirely", () => {
    // Reasoning 类模型在严格 JSON 输出下偶尔会完全省略 rootTitle / rootSummary,
    // 同时连 root 节点都不写 title。两个字段在下游不消费，只是 schema 形式约束,
    // 因此 normalize 应给一个稳定 fallback 让 schema 必过,而不是回退到模板。
    const result = parseSpecTreeLlmResponse([
      {
        id: "root-node",
        type: "root",
        priority: 100,
        // 故意不写 title / summary
      },
      {
        id: "step-1",
        parentId: "root-node",
        title: "Step Without Wrapper",
        summary: "Step summary used as fallback for root summary.",
        type: "route_step",
        priority: 70,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rootTitle.length).toBeGreaterThan(0);
    expect(result.data.rootSummary.length).toBeGreaterThan(0);
    // root 节点的 title 缺失时应被 rootTitle 兜底，避免单独被 schema 卡住
    expect(result.data.nodes[0].title.length).toBeGreaterThan(0);
    expect(result.data.nodes[0].summary.length).toBeGreaterThan(0);
  });

  it("normalizes nested root/children tree payloads without a nodes wrapper", () => {
    const result = parseSpecTreeLlmResponse({
      specTree: {
        root: {
          title: "Nested Root",
          description: "Nested tree root description.",
          children: [
            {
              title: "Nested Route Step",
              description: "Nested child route step.",
              type: "route_step",
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rootTitle).toBe("Nested Root");
    expect(result.data.nodes.map((node) => node.title)).toContain("Nested Route Step");
    expect(result.data.nodes[1].parentId).toBe(result.data.nodes[0].id);
  });

  it("finds nodes arrays inside non-standard response envelopes", () => {
    const result = parseSpecTreeLlmResponse({
      response: {
        payload: {
          blueprint: {
            treeNodes: [
              {
                id: "root-node",
                title: "Deep Root",
                summary: "Deeply wrapped root summary.",
                type: "root",
              },
              {
                id: "deep-step",
                parentId: "root-node",
                title: "Deep Step",
                summary: "Deeply wrapped child summary.",
                type: "route_step",
              },
            ],
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rootTitle).toBe("Deep Root");
    expect(result.data.nodes[1].title).toBe("Deep Step");
  });

  it("normalizes overlong node ids and remaps child parentIds", () => {
    const overlongId =
      "this-is-a-very-long-llm-generated-node-id-that-exceeds-sixty-four-characters-by-a-lot";
    const result = parseSpecTreeLlmResponse({
      nodes: [
        {
          id: "root-node",
          title: "Root",
          summary: "Root summary.",
          type: "root",
          priority: 100,
        },
        {
          id: overlongId,
          parentId: "root-node",
          title: "Overlong Id Node",
          summary: "This node has an id that must be normalized.",
          type: "route_step",
          priority: 80,
        },
        {
          id: "child-of-overlong",
          parentId: overlongId,
          title: "Child Node",
          summary: "This child should point at the normalized parent id.",
          type: "spec_document",
          priority: 70,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const normalizedParent = result.data.nodes.find(
      (node) => node.title === "Overlong Id Node",
    );
    const child = result.data.nodes.find((node) => node.title === "Child Node");
    expect(normalizedParent?.id.length).toBeLessThanOrEqual(64);
    expect(normalizedParent?.id).not.toBe(overlongId);
    expect(child?.parentId).toBe(normalizedParent?.id);
  });
});
