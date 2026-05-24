import type {
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../shared/blueprint/contracts.js";
import { getTransitiveDownstreamStages } from "../staleness/dependency-graph.js";

const TERMINAL_HANDOFF_STATES = new Set([
  "confirmed",
  "reset",
  "failed",
  "idle",
]);

export function detectRunningDownstreamForEdit(
  job: BlueprintGenerationJob,
  fromStage: BlueprintGenerationStage,
): BlueprintGenerationStage | null {
  const downstreamStages = getTransitiveDownstreamStages(fromStage);

  for (const stage of downstreamStages) {
    if (job.stage === stage && job.status === "running") {
      return stage;
    }

    if (
      job.stage === stage &&
      job.handoffState !== undefined &&
      !TERMINAL_HANDOFF_STATES.has(job.handoffState)
    ) {
      return stage;
    }

    if (
      job.nextAction?.stage === stage &&
      job.nextAction.type !== "none" &&
      !job.nextAction.type.startsWith("review_")
    ) {
      return stage;
    }
  }

  return null;
}
