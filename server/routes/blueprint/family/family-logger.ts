import type { BlueprintLogger } from "../context.js";

export interface FamilyReadLogPayload {
  requestedJobId: string;
  rootJobId: string;
  familySize: number;
  replanEventCount: number;
}

export interface FamilyRejectedLogPayload {
  requestedJobId: string;
  reason: "job_not_found";
}

export interface FamilyCycleLogPayload {
  requestedJobId: string;
  jobId: string;
  chainSummary: string;
}

export function logFamilyRead(
  logger: Pick<BlueprintLogger, "info">,
  payload: FamilyReadLogPayload,
): void {
  logger.info("[blueprint-family] family.read", {
    event: "family.read",
    requestedJobId: payload.requestedJobId,
    rootJobId: payload.rootJobId,
    familySize: payload.familySize,
    replanEventCount: payload.replanEventCount,
  });
}

export function logFamilyRejected(
  logger: Pick<BlueprintLogger, "debug">,
  payload: FamilyRejectedLogPayload,
): void {
  logger.debug("[blueprint-family] family.rejected", {
    event: "family.rejected",
    requestedJobId: payload.requestedJobId,
    reason: payload.reason,
  });
}

export function logFamilyCycle(
  logger: Pick<BlueprintLogger, "error">,
  payload: FamilyCycleLogPayload,
): void {
  logger.error("[blueprint-family] family.cycle_detected", {
    event: "family.cycle_detected",
    requestedJobId: payload.requestedJobId,
    jobId: payload.jobId,
    chainSummary: payload.chainSummary,
  });
}
