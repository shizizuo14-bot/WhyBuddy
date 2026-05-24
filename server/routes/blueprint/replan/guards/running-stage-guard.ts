import type {
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../../shared/blueprint/contracts.js";
import { getTransitiveDownstreamStages } from "../../staleness/dependency-graph.js";

export type RunningDownstreamReason =
  | "job_running"
  | "handoff_active"
  | "next_action_active";

export interface RunningDownstreamResult {
  runningStage: BlueprintGenerationStage;
  reason: RunningDownstreamReason;
}

const INACTIVE_HANDOFF_STATES = new Set([
  undefined,
  "idle",
  "confirmed",
  "reset",
  "failed",
]);

export function detectRunningDownstream(
  job: BlueprintGenerationJob,
  fromStage: BlueprintGenerationStage,
): RunningDownstreamResult | null {
  for (const stage of getTransitiveDownstreamStages(fromStage)) {
    if (job.status === "running" && job.stage === stage) {
      return { runningStage: stage, reason: "job_running" };
    }

    if (!INACTIVE_HANDOFF_STATES.has(job.handoffState) && job.stage === stage) {
      return { runningStage: stage, reason: "handoff_active" };
    }

    if (
      job.nextAction?.stage === stage &&
      job.nextAction.type !== "none" &&
      !job.nextAction.type.startsWith("review_")
    ) {
      return { runningStage: stage, reason: "next_action_active" };
    }
  }

  return null;
}
