import * as fc from "fast-check";
import type {
  BlueprintClarificationAnswer,
  BlueprintGenerationStage,
  BlueprintIntakePatchRequest,
  BlueprintRouteSelectionRequest,
} from "../../../../../../shared/blueprint/contracts.js";
import {
  BLUEPRINT_STAGES,
  buildJobLinkedToIntakeAndSession,
} from "./build-fixture-job.js";

export const stageEditStageArb = fc.constantFrom<BlueprintGenerationStage>(
  "input",
  "clarification",
  "route_generation",
);

export const staleFreshStagesArb = fc
  .uniqueArray(fc.constantFrom<BlueprintGenerationStage>(...BLUEPRINT_STAGES), {
    minLength: 1,
    maxLength: BLUEPRINT_STAGES.length - 1,
  })
  .filter((stages) => stages.length < BLUEPRINT_STAGES.length);

export const stageEditJobArb = fc
  .record({
    fromStage: stageEditStageArb,
    staleStages: staleFreshStagesArb,
  })
  .map(({ fromStage, staleStages }) =>
    buildJobLinkedToIntakeAndSession({
      fromStage,
      staleStages,
    }),
  );

export const intakePatchArb: fc.Arbitrary<BlueprintIntakePatchRequest> =
  fc.record({
    targetText: fc.string({ minLength: 1, maxLength: 80 }),
    githubUrls: fc.uniqueArray(fc.webUrl(), { minLength: 0, maxLength: 4 }),
    reason: fc.option(fc.string({ minLength: 1, maxLength: 80 }), {
      nil: undefined,
    }),
  });

export const clarificationAnswersArb: fc.Arbitrary<
  BlueprintClarificationAnswer[]
> = fc.uniqueArray(
  fc.record({
    questionId: fc.string({ minLength: 1, maxLength: 18 }),
    answer: fc.string({ minLength: 1, maxLength: 80 }),
  }),
  {
    minLength: 1,
    maxLength: 8,
    selector: (answer) => answer.questionId,
  },
);

export const routeReselectionArb: fc.Arbitrary<BlueprintRouteSelectionRequest> =
  fc.record({
    routeId: fc.string({ minLength: 1, maxLength: 24 }),
    reason: fc.option(fc.string({ minLength: 1, maxLength: 80 }), {
      nil: undefined,
    }),
    selectedBy: fc.option(fc.string({ minLength: 1, maxLength: 24 }), {
      nil: undefined,
    }),
    mergedAlternativeRouteIds: fc.uniqueArray(
      fc.string({ minLength: 1, maxLength: 24 }),
      { maxLength: 4 },
    ),
  });
