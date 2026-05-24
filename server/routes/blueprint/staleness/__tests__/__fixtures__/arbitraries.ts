import * as fc from "fast-check";
import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationArtifactType,
  BlueprintGenerationStage,
} from "../../../../../../shared/blueprint/contracts.js";
import type { BlueprintStaleSource } from "../../invalidate-downstream.js";
import {
  BLUEPRINT_ARTIFACT_TYPES,
  BLUEPRINT_STAGES,
  buildFixtureArtifact,
  buildFixtureJob,
  buildFixtureStaleSource,
} from "./build-fixture-job.js";

export const blueprintStageArb = fc.constantFrom<BlueprintGenerationStage>(
  ...BLUEPRINT_STAGES,
);

export const blueprintMaybeInvalidStageArb = fc.oneof(
  blueprintStageArb,
  fc.constant("__invalid_stage__" as BlueprintGenerationStage),
);

export const blueprintArtifactTypeArb =
  fc.constantFrom<BlueprintGenerationArtifactType>(...BLUEPRINT_ARTIFACT_TYPES);

const staleSourceArb: fc.Arbitrary<BlueprintStaleSource> = fc
  .record({
    stage: blueprintStageArb,
    artifactId: fc.string({ minLength: 1, maxLength: 16 }),
    artifactType: blueprintArtifactTypeArb,
    reason: fc.constantFrom(
      "upstream_target_changed",
      "upstream_clarification_changed",
      "upstream_route_changed",
      "upstream_route_selection_changed",
      "upstream_explicit_invalidation",
    ),
    triggeredAt: fc.constant("2026-05-23T01:00:00.000Z"),
  })
  .map((source) => buildFixtureStaleSource(source));

export const blueprintArtifactArb: fc.Arbitrary<BlueprintGenerationArtifact> =
  fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 18 }),
      type: blueprintArtifactTypeArb,
      title: fc.string({ minLength: 1, maxLength: 30 }),
      summary: fc.string({ minLength: 1, maxLength: 80 }),
      createdAt: fc.constant("2026-05-23T00:00:00.000Z"),
      payload: fc.jsonValue(),
      stale: fc.boolean(),
      invalidatedBy: staleSourceArb,
    })
    .map((item) =>
      buildFixtureArtifact({
        id: item.id,
        type: item.type,
        title: item.title,
        summary: item.summary,
        createdAt: item.createdAt,
        payload: item.payload,
        staleSince: item.stale ? "2026-05-23T01:00:00.000Z" : undefined,
        invalidatedBy: item.stale ? item.invalidatedBy : undefined,
      }),
    );

export const blueprintJobArb = fc
  .uniqueArray(blueprintArtifactArb, {
    minLength: 0,
    maxLength: 25,
    selector: (artifact) => artifact.id,
  })
  .map((artifacts) =>
    buildFixtureJob({
      id: "job-property",
      artifacts,
      staleArtifactIds: artifacts
        .filter((artifact) => Boolean((artifact as any).staleSince))
        .map((artifact) => artifact.id),
    }),
  );
