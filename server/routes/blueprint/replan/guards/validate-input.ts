import type { BlueprintGenerationStage } from "../../../../../shared/blueprint/contracts.js";
import { BLUEPRINT_ASSET_DEPENDENCY_GRAPH } from "../../staleness/dependency-graph.js";
import type {
  BlueprintReplanErrorCode,
  BlueprintReplanMode,
  BlueprintReplanRequest,
} from "../types.js";

export type ReplanValidationResult =
  | { ok: true; value: BlueprintReplanRequest }
  | { ok: false; status: 400; error: Extract<BlueprintReplanErrorCode, "invalid_from_stage" | "invalid_mode" | "invalid_reason"> };

const REPLAN_MODES = new Set<BlueprintReplanMode>(["in_place", "branch"]);
const MAX_REASON_LENGTH = 1024;

export function validateReplanInput(body: unknown): ReplanValidationResult {
  if (!isRecord(body) || !isBlueprintGenerationStage(body.fromStage)) {
    return { ok: false, status: 400, error: "invalid_from_stage" };
  }

  if (!isReplanMode(body.mode)) {
    return { ok: false, status: 400, error: "invalid_mode" };
  }

  if (
    body.reason !== undefined &&
    (typeof body.reason !== "string" || body.reason.length > MAX_REASON_LENGTH)
  ) {
    return { ok: false, status: 400, error: "invalid_reason" };
  }

  return {
    ok: true,
    value: {
      fromStage: body.fromStage,
      mode: body.mode,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlueprintGenerationStage(
  value: unknown,
): value is BlueprintGenerationStage {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BLUEPRINT_ASSET_DEPENDENCY_GRAPH, value)
  );
}

function isReplanMode(value: unknown): value is BlueprintReplanMode {
  return typeof value === "string" && REPLAN_MODES.has(value as BlueprintReplanMode);
}
