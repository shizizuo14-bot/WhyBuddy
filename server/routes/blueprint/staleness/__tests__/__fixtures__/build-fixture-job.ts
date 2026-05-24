import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationArtifactType,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../../../shared/blueprint/contracts.js";
import type {
  BlueprintStaleReason,
  BlueprintStaleSource,
} from "../../invalidate-downstream.js";

export const FIXTURE_CREATED_AT = "2026-05-23T00:00:00.000Z";

export const ARTIFACT_TYPE_BY_STAGE: Record<
  BlueprintGenerationStage,
  BlueprintGenerationArtifactType
> = {
  input: "intake",
  clarification: "clarification_session",
  route_generation: "route_set",
  spec_tree: "spec_tree",
  spec_docs: "requirements",
  preview: "preview",
  effect_preview: "effect_preview",
  prompt_packaging: "prompt_pack",
  runtime_capability: "capability_registry",
  engineering_handoff: "engineering_plan",
  engineering_landing: "engineering_run",
};

export const BLUEPRINT_STAGES: BlueprintGenerationStage[] = [
  "input",
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
];

export const BLUEPRINT_ARTIFACT_TYPES: BlueprintGenerationArtifactType[] = [
  "intake",
  "github_source",
  "clarification_session",
  "project_context",
  "route_set",
  "route_selection",
  "spec_tree",
  "spec_tree_version",
  "requirements",
  "design",
  "tasks",
  "spec_document_version",
  "preview",
  "effect_preview",
  "prompt_pack",
  "capability_registry",
  "agent_crew",
  "role_timeline",
  "capability_invocation",
  "capability_evidence",
  "sandbox_derivation_job",
  "engineering_plan",
  "engineering_run",
  "replay",
  "feedback",
];

export function buildFixtureStaleSource(
  overrides: Partial<BlueprintStaleSource> = {},
): BlueprintStaleSource {
  return {
    stage: "input",
    artifactId: "artifact-input",
    artifactType: "intake",
    reason: "upstream_explicit_invalidation",
    triggeredAt: "2026-05-23T01:00:00.000Z",
    ...overrides,
  };
}

export function buildFixtureArtifact(
  overrides: Partial<BlueprintGenerationArtifact> & {
    staleSince?: string;
    invalidatedBy?: BlueprintStaleSource;
  } = {},
): BlueprintGenerationArtifact {
  const type = overrides.type ?? "intake";
  return {
    id: overrides.id ?? `artifact-${type}`,
    type,
    title: overrides.title ?? `Artifact ${type}`,
    summary: overrides.summary ?? `Summary for ${type}`,
    createdAt: overrides.createdAt ?? FIXTURE_CREATED_AT,
    payload: overrides.payload ?? { value: type },
    staleSince: overrides.staleSince,
    invalidatedBy: overrides.invalidatedBy,
  } as BlueprintGenerationArtifact;
}

export function buildFixtureJob(
  overrides: Partial<BlueprintGenerationJob> & {
    artifacts?: BlueprintGenerationArtifact[];
    staleArtifactIds?: string[];
  } = {},
): BlueprintGenerationJob {
  const artifacts =
    overrides.artifacts ?? [buildFixtureArtifact({ id: "artifact-input" })];
  return {
    id: overrides.id ?? "job-fixture",
    request: overrides.request ?? {
      targetText: "Build a blueprint staleness model.",
    },
    status: overrides.status ?? "completed",
    stage: overrides.stage ?? "engineering_landing",
    version: overrides.version ?? "v1",
    createdAt: overrides.createdAt ?? FIXTURE_CREATED_AT,
    updatedAt: overrides.updatedAt ?? FIXTURE_CREATED_AT,
    artifacts,
    events: overrides.events ?? [],
    staleArtifactIds: overrides.staleArtifactIds,
  } as BlueprintGenerationJob;
}

export function buildFullChainJob(
  options: {
    staleStages?: BlueprintGenerationStage[];
    reason?: BlueprintStaleReason;
  } = {},
): BlueprintGenerationJob {
  const staleStages = new Set(options.staleStages ?? []);
  const artifacts = BLUEPRINT_STAGES.map((stage) => {
    const staleSince = staleStages.has(stage)
      ? "2026-05-23T01:00:00.000Z"
      : undefined;
    return buildFixtureArtifact({
      id: `artifact-${stage}`,
      type: ARTIFACT_TYPE_BY_STAGE[stage],
      staleSince,
      invalidatedBy: staleSince
        ? buildFixtureStaleSource({
            reason: options.reason ?? "upstream_explicit_invalidation",
            triggeredAt: staleSince,
          })
        : undefined,
    });
  });

  return buildFixtureJob({
    artifacts,
    staleArtifactIds: artifacts
      .filter((artifact) => Boolean((artifact as any).staleSince))
      .map((artifact) => artifact.id),
  });
}

export function buildEmptyJob(): BlueprintGenerationJob {
  return buildFixtureJob({
    id: "job-empty",
    artifacts: [],
    staleArtifactIds: ["existing-stale-index"],
  });
}
