import { describe, expect, it } from "vitest";

import {
  validatePythonAuthSessionContract,
  validatePythonAuthSessionMutationContract,
} from "../auth/session-service.js";

const validUser = {
  id: "user-1",
  email: "user@example.com",
  role: "user" as const,
  status: "active" as const,
  emailVerified: true,
  createdAt: "2026-04-30T00:00:00.000Z",
};

describe("auth session Python runtime boundary", () => {
  it("maps Python session read errors to unauthenticated instead of authenticated", () => {
    const result = validatePythonAuthSessionContract({
      valid: false,
      error: "expired",
      status: 401,
      message: "Session expired",
    });

    expect(result).toEqual({
      valid: false,
      error: "expired",
      status: 401,
      message: "Session expired",
    });
    expect(result.valid).toBe(false);
  });

  it("maps Python refresh auth errors to failed mutations instead of success", () => {
    const result = validatePythonAuthSessionMutationContract({
      ok: false,
      operation: "refresh",
      error: "expired",
      status: 401,
      message: "Session expired",
    });

    expect(result).toEqual({
      success: false,
      error: "expired",
      status: 401,
      message: "Session expired",
    });
  });

  it("maps Python logout store failures to diagnostic failures instead of success", () => {
    const result = validatePythonAuthSessionMutationContract({
      ok: false,
      operation: "logout",
      status: 503,
      error: {
        code: "auth_session_store_failure",
        reason: "write_failed",
        message: "disk path C:/private/auth-store failed",
        retryable: true,
      },
      message: "Auth session persistence failed.",
    });

    expect(result).toEqual({
      success: false,
      error: "store_failure",
      status: 503,
      message: "Auth session persistence failed.",
    });
    expect(JSON.stringify(result)).not.toContain("C:/private/auth-store");
  });

  it("rejects secret-bearing Python mutation success payloads", () => {
    const result = validatePythonAuthSessionMutationContract({
      ok: true,
      operation: "refresh",
      sessionId: "session-1",
      tokenHash: "sha256-secret-token-hash",
      user: validUser,
    });

    expect(result).toEqual({
      success: false,
      error: "invalid",
      status: 401,
      message: "Invalid session",
    });
  });
});
