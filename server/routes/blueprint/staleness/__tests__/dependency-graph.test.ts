import { describe, expect, it } from "vitest";
import type {
  BlueprintGenerationArtifactType,
  BlueprintGenerationStage,
} from "../../../../../shared/blueprint/contracts.js";
import {
  BLUEPRINT_ASSET_DEPENDENCY_GRAPH,
  getTransitiveDownstreamStages,
  isDownstreamOf,
  mapArtifactTypeToStage,
} from "../dependency-graph.js";
import { BLUEPRINT_ARTIFACT_TYPES } from "./__fixtures__/build-fixture-job.js";

describe("blueprint asset dependency graph", () => {
  it("returns transitive downstream stages in BFS/topological order", () => {
    expect(getTransitiveDownstreamStages("input")).toEqual([
      "clarification",
      "route_generation",
      "spec_tree",
      "spec_docs",
      "preview",
      "effect_preview",
      "prompt_packaging",
      "runtime_capability",
      "engineering_handoff",
      "engineering_landing",
    ]);

    expect(getTransitiveDownstreamStages("spec_tree")).toEqual([
      "spec_docs",
      "preview",
      "effect_preview",
      "prompt_packaging",
      "runtime_capability",
      "engineering_handoff",
      "engineering_landing",
    ]);

    expect(getTransitiveDownstreamStages("spec_docs")).toEqual([
      "preview",
      "effect_preview",
      "prompt_packaging",
      "runtime_capability",
      "engineering_handoff",
      "engineering_landing",
    ]);

    expect(getTransitiveDownstreamStages("engineering_landing")).toEqual([]);
  });

  it("handles downstream checks without treating a stage as downstream of itself", () => {
    expect(isDownstreamOf("spec_tree", "input")).toBe(true);
    expect(isDownstreamOf("effect_preview", "spec_docs")).toBe(true);
    expect(isDownstreamOf("input", "spec_tree")).toBe(false);
    expect(isDownstreamOf("input", "input")).toBe(false);
    expect(
      isDownstreamOf(
        "spec_tree",
        "__invalid_stage__" as BlueprintGenerationStage,
      ),
    ).toBe(false);
  });

  it("maps every existing artifact type to its stage or explicit undefined", () => {
    const expected = new Map<
      BlueprintGenerationArtifactType,
      BlueprintGenerationStage | undefined
    >([
      ["intake", "input"],
      ["github_source", "input"],
      ["clarification_session", "clarification"],
      ["project_context", "clarification"],
      ["route_set", "route_generation"],
      ["route_selection", "route_generation"],
      ["spec_tree", "spec_tree"],
      ["spec_tree_version", "spec_tree"],
      ["requirements", "spec_docs"],
      ["design", "spec_docs"],
      ["tasks", "spec_docs"],
      ["spec_document_version", "spec_docs"],
      ["preview", "preview"],
      ["effect_preview", "effect_preview"],
      ["prompt_pack", "prompt_packaging"],
      ["capability_registry", "runtime_capability"],
      ["agent_crew", "runtime_capability"],
      ["role_timeline", "runtime_capability"],
      ["capability_invocation", "runtime_capability"],
      ["capability_evidence", "runtime_capability"],
      ["sandbox_derivation_job", "runtime_capability"],
      ["engineering_plan", "engineering_handoff"],
      ["engineering_run", "engineering_landing"],
      ["replay", undefined],
      ["feedback", undefined],
    ]);

    expect(new Set(expected.keys())).toEqual(new Set(BLUEPRINT_ARTIFACT_TYPES));
    for (const artifactType of BLUEPRINT_ARTIFACT_TYPES) {
      expect(mapArtifactTypeToStage(artifactType)).toBe(
        expected.get(artifactType),
      );
    }
    expect(mapArtifactTypeToStage("__unknown__" as any)).toBeUndefined();
  });

  it("freezes the graph and its direct downstream arrays", () => {
    expect(Object.isFrozen(BLUEPRINT_ASSET_DEPENDENCY_GRAPH)).toBe(true);
    expect(Object.isFrozen(BLUEPRINT_ASSET_DEPENDENCY_GRAPH.input)).toBe(true);
    expect(() =>
      (BLUEPRINT_ASSET_DEPENDENCY_GRAPH.input as BlueprintGenerationStage[]).push(
        "engineering_landing",
      ),
    ).toThrow(TypeError);
  });
});
