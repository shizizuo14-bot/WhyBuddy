import { describe, expect, it } from "vitest";

import { normalizePermissionRateLimitDecision } from "../../shared/permission/contracts.js";
import { toPermissionRateLimitRuntimeResult } from "./rate-limiter-python-runtime.js";

describe("permission rate limit Python runtime boundary", () => {
  it("maps Python runtime allowed decisions to allowed rate-limit results", () => {
    const result = toPermissionRateLimitRuntimeResult({
      source: "python_runtime",
      allowed: true,
      limit: 2,
      remaining: 2,
      retryAfterMs: 0,
      resetAtMs: null,
      reason: "allowed",
    });

    expect(result).toEqual({
      allowed: true,
      status: 200,
      decision: {
        allowed: true,
        limit: 2,
        remaining: 2,
        retryAfterMs: 0,
        resetAtMs: null,
        reason: "allowed",
      },
    });
  });

  it("maps Python runtime rate_limit_exceeded decisions to denied results", () => {
    const result = toPermissionRateLimitRuntimeResult({
      source: "python_runtime",
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterMs: 30_000,
      resetAtMs: 60_000,
      reason: "rate_limit_exceeded",
    });

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.decision).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30_000,
      resetAtMs: 60_000,
      reason: "rate_limit_exceeded",
    });
  });

  it("maps Python runtime invalid_limit decisions to denied bad-request results", () => {
    const result = toPermissionRateLimitRuntimeResult({
      source: "python_runtime",
      allowed: false,
      limit: 0,
      remaining: 0,
      retryAfterMs: 60_000,
      resetAtMs: 65_000,
      reason: "invalid_limit",
    });

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(400);
    expect(result.decision.reason).toBe("invalid_limit");
  });

  it("does not allow success-shaped Python runtime denials", () => {
    const normalized = normalizePermissionRateLimitDecision({
      source: "python_runtime",
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterMs: 30_000,
      resetAtMs: 60_000,
      reason: "rate_limit_exceeded",
    });

    expect(normalized).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterMs: 30_000,
      resetAtMs: 60_000,
      reason: "rate_limit_exceeded",
    });
  });

  it("does not allow malformed success envelopes with invalid limits", () => {
    const result = toPermissionRateLimitRuntimeResult({
      source: "python_runtime",
      allowed: true,
      limit: 0,
      remaining: 1,
      retryAfterMs: 0,
      resetAtMs: null,
      reason: "allowed",
    });

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(400);
    expect(result.decision).toEqual({
      allowed: false,
      limit: 0,
      remaining: 0,
      retryAfterMs: 0,
      resetAtMs: null,
      reason: "invalid_limit",
    });
  });

  it("does not map malformed Python runtime errors to allow", () => {
    const result = toPermissionRateLimitRuntimeResult({
      source: "python_runtime",
      ok: false,
      error: {
        code: "runtime_error",
        message: "Python runtime failed",
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(400);
    expect(result.decision.reason).toBe("invalid_limit");
  });
});
