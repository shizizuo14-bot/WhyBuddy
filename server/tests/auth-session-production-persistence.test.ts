import { afterEach, describe, expect, it, vi } from "vitest";

import {
  validatePythonAuthSessionContract,
  validatePythonAuthSessionMutationContract,
} from "../auth/session-service.js";

describe("auth session production persistence boundary in Python mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("maps Python mode session read store failures to diagnostic unauthenticated responses", () => {
    vi.stubEnv("SLIDERULE_V5_BACKEND", "python");

    const result = validatePythonAuthSessionContract({
      ok: false,
      status: 503,
      error: {
        code: "auth_session_store_failure",
        reason: "read_failed",
        message: "disk path C:/private/auth-store failed",
        retryable: true,
      },
      message: "Auth session persistence failed.",
    });

    expect(result).toEqual({
      valid: false,
      error: "store_failure",
      status: 503,
      message: "Auth session persistence failed.",
    });
    expect(JSON.stringify(result)).not.toContain("C:/private/auth-store");
  });

  it("does not report refresh success when Python persistence refresh fails", () => {
    vi.stubEnv("SLIDERULE_V5_BACKEND", "python");
    const result = validatePythonAuthSessionMutationContract({
      ok: false,
      operation: "refresh",
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
  });

  it("does not report logout success when Python persistence logout fails", () => {
    vi.stubEnv("SLIDERULE_V5_BACKEND", "python");
    const result = validatePythonAuthSessionMutationContract({
      ok: false,
      operation: "logout",
      error: "missing",
      status: 401,
      message: "Authentication required",
    });

    expect(result).toEqual({
      success: false,
      error: "missing",
      status: 401,
      message: "Authentication required",
    });
  });
});
