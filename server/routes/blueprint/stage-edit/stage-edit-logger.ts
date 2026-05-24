import type {
  BlueprintGenerationStage,
  BlueprintStaleReason,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintLogger } from "../context.js";

export type StageEditTriggeringEndpoint =
  | "intake_patch"
  | "clarification_answers"
  | "route_reselection";

export interface StageEditLoggerContext {
  logger: Pick<BlueprintLogger, "debug" | "info" | "warn">;
}

export interface StageEditInvalidatedMeta {
  jobId: string;
  fromStage: BlueprintGenerationStage;
  reason: BlueprintStaleReason;
  triggeringEndpoint: StageEditTriggeringEndpoint;
  markedArtifactCount: number;
}

export interface StageEditNoopMeta {
  jobId: string;
  fromStage: BlueprintGenerationStage;
  triggeringEndpoint: StageEditTriggeringEndpoint;
  alreadyStaleCount?: number;
}

export interface StageEditBlockedMeta {
  jobId: string;
  fromStage: BlueprintGenerationStage;
  triggeringEndpoint: StageEditTriggeringEndpoint;
  runningStage: BlueprintGenerationStage;
}

export function logStageEditInvalidated(
  ctx: StageEditLoggerContext,
  meta: StageEditInvalidatedMeta,
): void {
  ctx.logger.info("stage_edit.invalidated", toLogMeta(meta));
}

export function logStageEditNoop(
  ctx: StageEditLoggerContext,
  meta: StageEditNoopMeta,
): void {
  ctx.logger.debug("stage_edit.noop", toLogMeta(meta));
}

export function logStageEditBlocked(
  ctx: StageEditLoggerContext,
  meta: StageEditBlockedMeta,
): void {
  ctx.logger.warn("stage_edit.blocked", toLogMeta(meta));
}

function toLogMeta(meta: object): Record<string, unknown> {
  return meta as unknown as Record<string, unknown>;
}
