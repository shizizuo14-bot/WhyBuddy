import { describe, expect, it } from "vitest";

import { parseBrainstormReasoningGraphPayload } from "./brainstorm-reasoning-graph-payload.js";

describe("parseBrainstormReasoningGraphPayload", () => {
  it("accepts valid LLM-authored graph payloads", () => {
    const graph = parseBrainstormReasoningGraphPayload({
      jobId: "job-1",
      stage: "spec_tree",
      payload: {
        reasoningGraph: {
          id: "graph-1",
          nodes: [
            { id: "question", type: "question", title: "What should split?", status: "open" },
            { id: "hypothesis", type: "hypothesis", title: "Split by trust boundary", status: "active", roleId: "spec-architect" },
          ],
          edges: [
            { id: "e1", source: "question", target: "hypothesis", type: "refines", label: "refines" },
          ],
          consoleLines: [{ id: "c1", kind: "Thinking", text: "Branching options" }],
        },
      },
    });

    expect(graph?.jobId).toBe("job-1");
    expect(graph?.stage).toBe("spec_tree");
    expect(graph?.nodes.map(node => node.type)).toEqual(["question", "hypothesis"]);
    expect(graph?.edges).toHaveLength(1);
    expect(graph?.consoleLines?.[0]?.text).toBe("Branching options");
  });

  it("drops edges that reference missing nodes", () => {
    const graph = parseBrainstormReasoningGraphPayload({
      jobId: "job-1",
      stage: "spec_tree",
      payload: {
        reasoningGraph: {
          nodes: [
            { id: "question", type: "question", title: "Q", status: "open" },
            { id: "evidence", type: "evidence", title: "E", status: "supported" },
          ],
          edges: [
            { id: "good", source: "question", target: "evidence", type: "supports" },
            { id: "bad", source: "question", target: "missing", type: "supports" },
          ],
        },
      },
    });

    expect(graph?.edges.map(edge => edge.id)).toEqual(["good"]);
  });

  it("normalizes unknown node and edge enum values to safe fallbacks", () => {
    const graph = parseBrainstormReasoningGraphPayload({
      jobId: "job-1",
      stage: "spec_docs",
      payload: {
        brainstormReasoningGraph: {
          nodes: [
            { id: "question", type: "question", title: "Q", status: "open" },
            { id: "wild", type: "unsupported", title: "Wild", status: "unknown" },
          ],
          edges: [
            { id: "edge", source: "question", target: "wild", type: "unsupported" },
          ],
        },
      },
    });

    expect(graph?.nodes.find(node => node.id === "wild")?.type).toBe("hypothesis");
    expect(graph?.nodes.find(node => node.id === "wild")?.status).toBe("active");
    expect(graph?.edges[0]?.type).toBe("refines");
  });

  it("truncates overlong node text", () => {
    const graph = parseBrainstormReasoningGraphPayload({
      jobId: "job-1",
      stage: "spec_tree",
      payload: {
        reasoningGraph: {
          nodes: [
            { id: "question", type: "question", title: "Q".repeat(200), body: "B".repeat(400), status: "open" },
          ],
          edges: [],
        },
      },
    });

    expect(graph?.nodes[0]?.title.length).toBeLessThanOrEqual(120);
    expect(graph?.nodes[0]?.body?.length).toBeLessThanOrEqual(240);
  });

  it("ignores missing or empty graph payloads", () => {
    expect(parseBrainstormReasoningGraphPayload({
      jobId: "job-1",
      stage: "spec_tree",
      payload: {},
    })).toBeNull();
    expect(parseBrainstormReasoningGraphPayload({
      jobId: "job-1",
      stage: "spec_tree",
      payload: { reasoningGraph: { nodes: [], edges: [] } },
    })).toBeNull();
  });
});
