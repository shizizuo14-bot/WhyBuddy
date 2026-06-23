import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  validateAuthProductionOwnershipClosure,
  type AuthProductionOwnershipClosureResult,
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

describe("auth-production-ownership-closure-102 - node consumption", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates python auth ownership closure and no takeover", () => {
    const success = validateAuthProductionOwnershipClosure({
      status: "success",
      contractVersion: "auth.production-ownership-closure.v1",
      provenance: "python-auth-production-ownership-closure-102",
      ok: true,
      productionTakeover: false,
      ownership: {
        sessionRepository: "node-retained",
        tokenIssuance: "node-retained",
        passwordPolicy: "node-retained",
        emailCodeMailer: "node-retained",
        userRepository: "node-retained",
        sessionTokenBoundaryDecision: "python-owned",
      },
      runtime: { owner: "python", mode: "ownership_closure" },
    });
    expect(success.status).toBe("success");
    expect(success.ok).toBe(true);
    expect(success.productionTakeover).toBe(false);
    expect(success.ownership?.sessionRepository).toBe("node-retained");

    const failed = validateAuthProductionOwnershipClosure({ status: "failed" });
    expect(failed.status).toBe("failed");
    expect(failed.ok).toBe(false);
    expect(failed.productionTakeover).toBe(false);
  });

  it("auth route layer can consume ownership closure via pythonAuthProductionOwnershipClosure dep", async () => {
    const pythonOwnership = {
      execute: vi.fn(async (p: any) => ({
        status: "success",
        contractVersion: "auth.production-ownership-closure.v1",
        provenance: "python-auth-production-ownership-closure-102",
        ok: true,
        productionTakeover: false,
        ownership: {
          sessionRepository: "node-retained",
          tokenIssuance: "node-retained",
          passwordPolicy: "node-retained",
          emailCodeMailer: "node-retained",
          userRepository: "node-retained",
          sessionTokenBoundaryDecision: "python-owned",
        },
        runtime: { owner: "python", mode: "ownership_closure" },
      })),
    };

    await withAuthServer({ pythonAuthProductionOwnershipClosure: pythonOwnership }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/__internal/auth-production-ownership-closure`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.closure.productionTakeover).toBe(false);
      expect(pythonOwnership.execute).toHaveBeenCalled();
      expect(json.closure.ownership.sessionRepository).toBe("node-retained");
    });
  });

  it("falls back when no python ownership wired", async () => {
    await withAuthServer({}, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/__internal/auth-production-ownership-closure`);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.closure.productionTakeover).toBe(false);
      expect(json.closure.status).toBe("node-fallback");
    });
  });
});
