import {
  normalizePermissionRateLimitDecision,
  type PermissionRateLimitDecision,
} from "../../shared/permission/contracts.js";

export interface PermissionRateLimitRuntimeResult {
  allowed: boolean;
  status: number;
  decision: PermissionRateLimitDecision;
}

export function toPermissionRateLimitRuntimeResult(
  value: unknown,
): PermissionRateLimitRuntimeResult {
  const decision = normalizePermissionRateLimitDecision(value);
  if (decision.allowed) {
    return {
      allowed: true,
      status: 200,
      decision,
    };
  }

  return {
    allowed: false,
    status: decision.reason === "rate_limit_exceeded" ? 429 : 400,
    decision,
  };
}
