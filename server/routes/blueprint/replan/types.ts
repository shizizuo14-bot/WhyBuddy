import type {
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../job-store.js";
import type { BlueprintLogger } from "../context.js";

export type BlueprintReplanMode = "in_place" | "branch";

export interface BlueprintReplanRequest {
  fromStage: BlueprintGenerationStage;
  mode: BlueprintReplanMode;
  reason?: string;
}

export type BlueprintReplanErrorCode =
  | "invalid_from_stage"
  | "invalid_mode"
  | "invalid_reason"
  | "job_not_found"
  | "downstream_running"
  | "internal_error";

export interface BlueprintReplanContext {
  now: () => Date;
  logger: BlueprintLogger;
}

export interface BlueprintReplanDeps {
  jobStore: BlueprintJobStore;
  ctx: BlueprintReplanContext;
  newJobId?: () => string;
}

export interface BlueprintReplanSummaryBase {
  fromStage: BlueprintGenerationStage;
  triggeredAt: string;
}

export interface BlueprintInPlaceReplanSummary extends BlueprintReplanSummaryBase {
  markedStaleArtifactCount: number;
  markedStaleArtifactIds: string[];
}

export interface BlueprintBranchReplanSummary extends BlueprintReplanSummaryBase {
  inheritedUpstreamArtifactCount: number;
  inheritedUpstreamArtifactIds: string[];
  branchedAt: string;
}

export interface BlueprintInPlaceReplanResponse {
  mode: "in_place";
  job: BlueprintGenerationJob;
  summary: BlueprintInPlaceReplanSummary;
}

export interface BlueprintBranchReplanResponse {
  mode: "branch";
  job: BlueprintGenerationJob;
  parentJobId: string;
  summary: BlueprintBranchReplanSummary;
}

export type BlueprintReplanResponse =
  | BlueprintInPlaceReplanResponse
  | BlueprintBranchReplanResponse;
