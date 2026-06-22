import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "../../shared/auth.js";
import type {
  PythonAuthSessionMutationContract,
  SessionService,
} from "../auth/session-service.js";
import { validatePythonAuthSessionMutationContract } from "../auth/session-service.js";
import { createAuthRouter } from "../routes/auth.js";

const validUser: CurrentUser = {
  id: "user-1",
  email: "user@example.com",
  role: "user",
  status: "active",
  emailVerified: true,
  createdAt: "2026-04-30T00:00:00.000Z",
};

async function withAuthServer(
  sessionService: SessionService,
  handler: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/auth",
    createAuthRouter({
      users: {} as never,
      sessions: {} as never,
      sessionService,
    }),
  );

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => (error ? reject(error) : resolve()));
  });

  const address = server.address() as AddressInfo;
  try {
    await handler(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function sessionServiceWithMutation(mutation: PythonAuthSessionMutationContract): SessionService {
  return {
    createSession: vi.fn(async () => {
      throw new Error("not used");
    }),
    resolveCurrentUser: vi.fn(async () => ({
      sessionId: "session-1",
      user: validUser,
    })),
    revokeSession: vi.fn(async () => mutation),
    refreshSession: vi.fn(async () => mutation),
    readSessionToken: vi.fn(() => "test-token"),
    writeSessionCookie: vi.fn(),
    clearCookie: vi.fn(),
  };
}

describe("auth session refresh/logout Python runtime mapping", () => {
  it("maps Python refreshed and logged_out states to successful mutations", () => {
    expect(
      validatePythonAuthSessionMutationContract({
        ok: true,
        operation: "refresh",
        state: "refreshed",
        sessionId: "session-1",
      }),
    ).toEqual({
      success: true,
      status: 200,
      state: "refreshed",
      sessionId: "session-1",
    });

    expect(
      validatePythonAuthSessionMutationContract({
        ok: true,
        operation: "logout",
        state: "logged_out",
        sessionId: "session-1",
      }),
    ).toEqual({
      success: true,
      status: 200,
      state: "logged_out",
      sessionId: "session-1",
    });
  });

  it("maps Python expired, invalid, and error states to failed mutations", () => {
    expect(
      validatePythonAuthSessionMutationContract({
        ok: false,
        operation: "refresh",
        state: "expired",
        error: "expired",
      }),
    ).toMatchObject({ success: false, error: "expired", status: 401 });

    expect(
      validatePythonAuthSessionMutationContract({
        ok: false,
        operation: "refresh",
        state: "invalid",
        error: "invalid",
      }),
    ).toMatchObject({ success: false, error: "invalid", status: 401 });

    expect(
      validatePythonAuthSessionMutationContract({
        ok: false,
        operation: "logout",
        state: "error",
        error: {
          code: "auth_session_store_failure",
          reason: "write_failed",
          message: "disk path C:/private/auth-store failed",
          retryable: true,
        },
      }),
    ).toEqual({
      success: false,
      error: "store_failure",
      status: 503,
      message: "Auth session persistence failed.",
      state: "error",
    });
  });

  it("does not let a Python refresh expired state become an authenticated route response", async () => {
    const sessionService = sessionServiceWithMutation({
      success: false,
      error: "expired",
      status: 401,
      message: "Session expired",
      state: "expired",
    });

    await withAuthServer(sessionService, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { cookie: "cube_test_session=test-token" },
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: "Session expired",
      });
    });
  });

  it("does not let a Python logout runtime error become a successful route response", async () => {
    const sessionService = sessionServiceWithMutation({
      success: false,
      error: "store_failure",
      status: 503,
      message: "Auth session persistence failed.",
      state: "error",
    });

    await withAuthServer(sessionService, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: "cube_test_session=test-token" },
      });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: "Auth session persistence failed.",
      });
    });
  });
});
