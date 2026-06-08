import { describe, expect, it } from "vitest";

import type {
  BlueprintSpecDocument,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/contracts.js";
import {
  extractFirstMermaidSource,
  renderRoutedMermaidPreview,
  shouldRouteNodeToMermaid,
} from "./mermaid-routing.js";

function node(overrides: Partial<BlueprintSpecTreeNode> = {}): BlueprintSpecTreeNode {
  return {
    id: "node-arch",
    title: "System Architecture",
    summary: "Flowchart for the runtime",
    type: "spec_document",
    status: "accepted",
    priority: 1,
    dependencies: [],
    outputs: ["architecture diagram"],
    children: [],
    ...overrides,
  };
}

function document(content: string): BlueprintSpecDocument {
  return {
    id: "doc-design",
    jobId: "job-1",
    treeId: "tree-1",
    nodeId: "node-arch",
    type: "design",
    status: "accepted",
    title: "Design",
    summary: "Design",
    content,
    format: "markdown",
    createdAt: "2026-06-08T00:00:00.000Z",
    provenance: {
      jobId: "job-1",
      githubUrls: [],
      treeVersion: 1,
      nodeType: "spec_document",
      nodeTitle: "System Architecture",
      nodeSummary: "Flowchart",
      dependencies: [],
      outputs: [],
    },
  };
}

describe("mermaid preview routing", () => {
  it("extracts the first Mermaid code block from spec documents", () => {
    expect(
      extractFirstMermaidSource([
        document("plain"),
        document("```mermaid\ngraph TD\nA-->B\n```"),
      ]),
    ).toBe("graph TD\nA-->B");
  });

  it("routes architecture or flowchart nodes only when Mermaid source exists", () => {
    expect(
      shouldRouteNodeToMermaid({
        node: node(),
        documents: [document("```mermaid\ngraph TD\nA-->B\n```")],
      }),
    ).toBe(true);

    expect(
      shouldRouteNodeToMermaid({
        node: node({ title: "Plain Feature", summary: "Business behavior", outputs: [] }),
        documents: [document("```mermaid\ngraph TD\nA-->B\n```")],
      }),
    ).toBe(false);

    expect(
      shouldRouteNodeToMermaid({
        node: node(),
        documents: [document("no mermaid")],
      }),
    ).toBe(false);
  });

  it("renders routed Mermaid as SVG metadata compatible with preview audit", async () => {
    const result = await renderRoutedMermaidPreview({
      jobId: "job-1",
      node: node(),
      documents: [document("```mermaid\ngraph TD\nA-->B\n```")],
      generatedAt: "2026-06-08T00:00:00.000Z",
    });

    expect(result).not.toBeNull();
    expect(result?.svg).toContain("<svg");
    expect(result?.meta).toMatchObject({
      imageId: "node-arch",
      jobId: "job-1",
      nodeId: "node-arch",
      filePath: "job-1/node-arch.svg",
      watermarkLabel: "preview · unverified",
      localizedWatermarkLabel: "预览·未验证",
      provenance: {
        source: "model",
        ok: true,
        modelUsed: "mermaid-deterministic",
        generatedAt: "2026-06-08T00:00:00.000Z",
      },
    });
    expect(result?.meta.fileSizeBytes).toBeGreaterThan(0);
    expect(result?.meta.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
