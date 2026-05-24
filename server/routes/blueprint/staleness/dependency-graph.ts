import type {
  BlueprintGenerationArtifactType,
  BlueprintGenerationStage,
} from "../../../../shared/blueprint/contracts.js";

const graph = {
  input: Object.freeze(["clarification"]),
  clarification: Object.freeze(["route_generation"]),
  route_generation: Object.freeze(["spec_tree"]),
  spec_tree: Object.freeze(["spec_docs"]),
  spec_docs: Object.freeze(["preview", "effect_preview"]),
  preview: Object.freeze(["effect_preview"]),
  effect_preview: Object.freeze(["prompt_packaging"]),
  prompt_packaging: Object.freeze(["runtime_capability"]),
  runtime_capability: Object.freeze(["engineering_handoff"]),
  engineering_handoff: Object.freeze(["engineering_landing"]),
  engineering_landing: Object.freeze([]),
} satisfies Record<BlueprintGenerationStage, readonly BlueprintGenerationStage[]>;

export const BLUEPRINT_ASSET_DEPENDENCY_GRAPH: Readonly<
  Record<BlueprintGenerationStage, readonly BlueprintGenerationStage[]>
> = Object.freeze(graph);

export function getTransitiveDownstreamStages(
  fromStage: BlueprintGenerationStage,
): BlueprintGenerationStage[] {
  if (!isBlueprintGenerationStage(fromStage)) {
    return [];
  }

  const result: BlueprintGenerationStage[] = [];
  const visited = new Set<BlueprintGenerationStage>([fromStage]);
  const queue = [...BLUEPRINT_ASSET_DEPENDENCY_GRAPH[fromStage]];

  while (queue.length > 0) {
    const stage = queue.shift();
    if (!stage || visited.has(stage)) {
      continue;
    }
    visited.add(stage);
    result.push(stage);
    queue.push(...BLUEPRINT_ASSET_DEPENDENCY_GRAPH[stage]);
  }

  return result;
}

export function isDownstreamOf(
  candidate: BlueprintGenerationStage,
  fromStage: BlueprintGenerationStage,
): boolean {
  return getTransitiveDownstreamStages(fromStage).includes(candidate);
}

export function mapArtifactTypeToStage(
  artifactType: BlueprintGenerationArtifactType,
): BlueprintGenerationStage | undefined {
  return ARTIFACT_STAGE_BY_TYPE[artifactType];
}

function isBlueprintGenerationStage(
  value: unknown,
): value is BlueprintGenerationStage {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BLUEPRINT_ASSET_DEPENDENCY_GRAPH, value)
  );
}

const ARTIFACT_STAGE_BY_TYPE: Partial<
  Record<BlueprintGenerationArtifactType, BlueprintGenerationStage>
> = {
  intake: "input",
  github_source: "input",
  clarification_session: "clarification",
  project_context: "clarification",
  route_set: "route_generation",
  route_selection: "route_generation",
  spec_tree: "spec_tree",
  spec_tree_version: "spec_tree",
  requirements: "spec_docs",
  design: "spec_docs",
  tasks: "spec_docs",
  spec_document_version: "spec_docs",
  preview: "preview",
  effect_preview: "effect_preview",
  prompt_pack: "prompt_packaging",
  capability_registry: "runtime_capability",
  agent_crew: "runtime_capability",
  role_timeline: "runtime_capability",
  capability_invocation: "runtime_capability",
  capability_evidence: "runtime_capability",
  sandbox_derivation_job: "runtime_capability",
  engineering_plan: "engineering_handoff",
  engineering_run: "engineering_landing",
  replay: undefined,
  feedback: undefined,
};
