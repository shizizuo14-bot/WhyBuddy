import * as fc from "fast-check";
import type { BlueprintGenerationJob } from "../../../../../../shared/blueprint/contracts.js";
import type { BlueprintReplanMode } from "../../types.js";
import {
  blueprintJobArb,
  blueprintStageArb,
} from "../../../staleness/__tests__/__fixtures__/arbitraries.js";

export {
  blueprintArtifactArb,
  blueprintArtifactTypeArb,
  blueprintJobArb,
  blueprintMaybeInvalidStageArb,
  blueprintStageArb,
} from "../../../staleness/__tests__/__fixtures__/arbitraries.js";

export const replanModeArb = fc.constantFrom<BlueprintReplanMode>(
  "in_place",
  "branch",
);

export const replanReasonArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  fc.string({ minLength: 1, maxLength: 256 }),
);

export const replanFixtureJobArb: fc.Arbitrary<BlueprintGenerationJob> =
  blueprintJobArb;

export const replanRequestArb = fc.record({
  fromStage: blueprintStageArb,
  mode: replanModeArb,
  reason: replanReasonArb,
});
