import type {
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../../../shared/blueprint/contracts.js";
import {
  buildFixtureJob,
  buildFullChainJob,
} from "../../../staleness/__tests__/__fixtures__/build-fixture-job.js";

export {
  ARTIFACT_TYPE_BY_STAGE,
  BLUEPRINT_ARTIFACT_TYPES,
  BLUEPRINT_STAGES,
  FIXTURE_CREATED_AT,
  buildEmptyJob,
  buildFixtureArtifact,
  buildFixtureJob,
  buildFixtureStaleSource,
  buildFullChainJob,
} from "../../../staleness/__tests__/__fixtures__/build-fixture-job.js";

export function buildBranchJobFixture(
  parent: BlueprintGenerationJob = buildFullChainJob(),
  fromStage: BlueprintGenerationStage = "spec_tree",
  overrides: Partial<BlueprintGenerationJob> = {},
): BlueprintGenerationJob {
  const base = buildFixtureJob({
    id: overrides.id ?? "job-branch-fixture",
    request: parent.request,
    version: parent.version,
    stage: fromStage,
    status: "pending",
    artifacts: overrides.artifacts ?? [],
    events: overrides.events ?? [],
    staleArtifactIds: overrides.staleArtifactIds ?? [],
  });

  return {
    ...base,
    projectId: parent.projectId,
    sourceId: parent.sourceId,
    parentJobId: parent.id,
    branchedAt: overrides.branchedAt ?? "2026-05-23T07:00:00.000Z",
    branchedFromStage: fromStage,
    ...overrides,
  };
}

export function buildRunningJobFixture(
  stage: BlueprintGenerationStage = "spec_docs",
): BlueprintGenerationJob {
  return {
    ...buildFullChainJob({ staleStages: [] }),
    status: "running",
    stage,
  };
}

export function buildJobWithReviewingHandoff(
  stage: BlueprintGenerationStage = "spec_docs",
): BlueprintGenerationJob {
  return {
    ...buildFullChainJob(),
    stage,
    status: "completed",
    handoffState: "reviewing",
  };
}
