import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const blueprintSource = () => readFileSync(resolve(here, "../blueprint.ts"), "utf8");

describe("brainstorm reasoning graph artifact persistence wiring", () => {
  it("creates standalone brainstorm_reasoning_graph artifacts from transient graph data", () => {
    const source = blueprintSource();

    expect(source).toContain('type: "brainstorm_reasoning_graph"');
    expect(source).toContain("BrainstormReasoningGraphArtifactPayload");
    expect(source).toContain("createBrainstormReasoningGraphArtifact");
  });

  it("keeps transient graph data out of persisted spec tree and document payloads", () => {
    const source = blueprintSource();

    expect(source).toContain("omitTransientReasoningGraph(specTree)");
    expect(source).toContain("payload: omitTransientReasoningGraph(document)");
    expect(source).toContain("readTransientReasoningGraph(document)");
  });

  it("threads LLM service graph outputs through spec_tree and spec_docs persistence", () => {
    const source = blueprintSource();

    expect(source).toContain("serviceResult?.reasoningGraph");
    expect(source).toContain("specTreeReasoningGraphArtifact");
    expect(source).toContain("documentReasoningGraphArtifacts");
  });
});
