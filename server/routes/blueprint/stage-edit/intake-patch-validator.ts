import type { BlueprintIntakePatchRequest } from "../../../../shared/blueprint/contracts.js";

export type IntakePatchValidationResult =
  | { ok: true; value: BlueprintIntakePatchRequest }
  | {
      ok: false;
      error: "invalid_intake_patch";
      message: string;
    };

export function validateIntakePatch(
  body: unknown,
): IntakePatchValidationResult {
  if (!isRecord(body)) {
    return invalid("Request body must be an object.");
  }

  const value: BlueprintIntakePatchRequest = {};

  if (hasOwn(body, "targetText")) {
    if (typeof body.targetText !== "string") {
      return invalid("targetText must be a string when provided.");
    }
    value.targetText = body.targetText;
  }

  if (hasOwn(body, "githubUrls")) {
    if (
      !Array.isArray(body.githubUrls) ||
      !body.githubUrls.every((url) => typeof url === "string")
    ) {
      return invalid("githubUrls must be an array of strings when provided.");
    }
    value.githubUrls = [...body.githubUrls];
  }

  if (hasOwn(body, "reason")) {
    if (typeof body.reason !== "string") {
      return invalid("reason must be a string when provided.");
    }
    if (body.reason.length > 1024) {
      return invalid("reason must be 1024 characters or fewer.");
    }
    value.reason = body.reason;
  }

  return { ok: true, value };
}

function invalid(message: string): IntakePatchValidationResult {
  return {
    ok: false,
    error: "invalid_intake_patch",
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(
  value: Record<string, unknown>,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
