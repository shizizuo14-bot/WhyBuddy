import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  validateAuthSessionTokenBoundary,
  type AuthSessionTokenBoundaryResult,
} from "../auth/session-service.js";
import { createAuthRouter } from "../routes/auth.js";
import type { SessionService } from "../auth/session-service.js";

async function withAuthServer(
  overrides: Partial<Parameters<typeof createAuthRouter>[0]>,
  handler: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  const mockSessionService = {
    createSession: vi.fn(async () => ({ token: "t" })),
    writeSessionCookie: vi.fn(),
    refreshSession: vi.fn(async () => ({ success: true })),
    revokeSession: vi.fn(async () => ({ success: true })),
    clearCookie: vi.fn(),
    requireAuth: (req: any, res: any, next: any) => next(),
  } as unknown as SessionService;

  app.use(
    "/api/auth",
    createAuthRouter({
      users: {} as never,
      sessions: {} as never,
      sessionService: mockSessionService,
      ...overrides,
    } as any),
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

describe("auth-session-token-boundary-103 - node consumption", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates python session token boundary and distinguishes ownership", () => {
    const ready = validateAuthSessionTokenBoundary({
      status: "python-owned",
      contractVersion: "auth-session-token-boundary.v1",
      provenance: "python-auth-session-token-boundary-103",
      ok: true,
      runtime: { owner: "python", mode: "session_token_boundary" },
      ownership: {
        sessionRepository: "node-retained",
        tokenIssuance: "node-retained",
        passwordPolicy: "node-retained",
        emailCodeMailer: "node-retained",
        userRepository: "node-retained",
        sessionTokenDecision: "python-owned",
      },
      metadata: { traceId: "b-103" },
    });
    expect(ready.status).toBe("python-owned");
    expect(ready.ok).toBe(true);
    expect(ready.ownership?.sessionRepository).toBe("node-retained");
    expect(ready.ownership?.sessionTokenDecision).toBe("python-owned");

    const blocked = validateAuthSessionTokenBoundary({ status: "blocked" });
    expect(blocked.status).toBe("blocked");
    expect(blocked.ok).toBe(false);

    const nodeRet = validateAuthSessionTokenBoundary({ status: "node-retained" });
    expect(nodeRet.status).toBe("node-retained");
  });

  it("auth route layer can consume boundary via pythonAuthSessionTokenBoundary dep", async () => {
    const pythonBoundary = {
      execute: vi.fn(async (p: any) => ({
        status: "python-owned",
        contractVersion: "auth-session-token-boundary.v1",
        provenance: "python-auth-session-token-boundary-103",
        ok: true,
        runtime: { owner: "python", mode: "session_token_boundary" },
        ownership: {
          sessionRepository: "node-retained",
          tokenIssuance: "node-retained",
          passwordPolicy: "node-retained",
          emailCodeMailer: "node-retained",
          userRepository: "node-retained",
          sessionTokenDecision: "python-owned",
        },
        metadata: { source: p?.metadata?.source },
      })),
    };

    await withAuthServer({ pythonAuthSessionTokenBoundary: pythonBoundary }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/__internal/auth-session-token-boundary`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.boundary.status).toBe("python-owned");
      expect(pythonBoundary.execute).toHaveBeenCalled();
      expect(json.boundary.ownership.sessionRepository).toBe("node-retained");
      expect(json.boundary.ownership.sessionTokenDecision).toBe("python-owned");
    });
  });

  it("falls back to node-retained when no python boundary wired", async () => {
    await withAuthServer({}, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/__internal/auth-session-token-boundary`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(["node-retained", "skipped-live", "blocked", "out-of-scope"]).toContain(json.boundary.status);
      expect(json.boundary.ok).toBe(false);
    });
  });

  it("boundary preserves node retained for production paths and no takeover", () => {
    const withMeta = validateAuthSessionTokenBoundary({
      status: "python-owned",
      contractVersion: "auth-session-token-boundary.v1",
      provenance: "python-auth-session-token-boundary-103",
      ok: true,
      runtime: { owner: "python", mode: "session_token_boundary" },
      ownership: {
        sessionRepository: "node-retained",
        tokenIssuance: "node-retained",
        passwordPolicy: "node-retained",
        emailCodeMailer: "node-retained",
        userRepository: "node-retained",
        sessionTokenDecision: "python-owned",
      },
      metadata: { policy: "node", store: "node" },
    });
    expect(withMeta.ownership?.sessionRepository).toBe("node-retained");
    expect(withMeta.ownership?.tokenIssuance).toBe("node-retained");
    expect(withMeta.status).toBe("python-owned");
    expect(withMeta.productionTakeover).not.toBe(true);
  });

  it("retaining existing security failure semantics", () => {
    const invalid = validateAuthSessionTokenBoundary({ foo: "bar" });
    expect(invalid.ok).toBe(false);
    expect(invalid.status).not.toBe("python-owned");
  });
});
