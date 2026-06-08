import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlueprintRouter } from "../blueprint";

describe("blueprint diagnostics brainstorm entry", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function invokeDiagnostics(brainstormContext: unknown) {
    const router = createBlueprintRouter({
      blueprintServiceContext: {
        now: () => new Date("2026-06-02T00:00:00.000Z"),
        runtimeDiagnostics: {
          snapshot: vi.fn(() => ({ bridges: { docker: { mode: "disabled" } } })),
        },
        brainstormContext,
      } as any,
    });
    const diagnosticsLayer = (router as any).stack.find(
      (layer: any) => layer.route?.path === "/diagnostics",
    );
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status: vi.fn(function (this: typeof res, code: number) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn(function (this: typeof res, body: unknown) {
        this.body = body;
        return this;
      }),
    };

    diagnosticsLayer.route.stack[0].handle({}, res);
    return res;
  }

  it("includes brainstorm diagnostics without replacing the runtime diagnostics snapshot", () => {
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";
    process.env.BRAINSTORM_STAGE_ROUTE_GENERATION_ENABLED = "true";
    delete process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS;

    const res = invokeDiagnostics(null);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.body as {
      bridges: unknown;
      brainstorm: {
        enabled: boolean;
        activeSessionsCount: number;
        totalSessionsCompleted: number;
        degradationCount: number;
        averageSessionDurationMs: number;
        tokenBudget: number;
        toolCallLimit: number;
        perStageConfig: Record<string, boolean>;
        pool: { configured: boolean; keyCount: number };
      };
    };
    // The runtime diagnostics snapshot is preserved (additive, not replaced).
    expect(body.bridges).toEqual({ docker: { mode: "disabled" } });
    // The brainstorm block is present under a stable `brainstorm` key.
    expect(body.brainstorm).toMatchObject({
      enabled: false,
      activeSessionsCount: 0,
      totalSessionsCompleted: 0,
      degradationCount: 0,
      averageSessionDurationMs: 0,
      tokenBudget: 0,
      toolCallLimit: 0,
      pool: { configured: false, keyCount: 0 },
    });
    expect(body.brainstorm.perStageConfig.route_generation).toBe(true);
  });

  it("reports pool.configured/keyCount when the aux key pool env is present", () => {
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";
    process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS = "k1,k2,k3,k4,k5";

    const res = invokeDiagnostics(null);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.body as { brainstorm: { pool: unknown } };
    expect(body.brainstorm.pool).toEqual({ configured: true, keyCount: 5 });
  });

  it("reports pool not configured when the aux key pool env is absent", () => {
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";
    delete process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS;

    const res = invokeDiagnostics(null);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.body as { brainstorm: { pool: unknown } };
    expect(body.brainstorm.pool).toEqual({ configured: false, keyCount: 0 });
  });

  it("surfaces the disabled brainstorm shape (with pool) when context is null", () => {
    delete process.env.BLUEPRINT_BRAINSTORM_ENABLED;
    delete process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS;

    const res = invokeDiagnostics(null);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.body as {
      brainstorm: { enabled: boolean; pool: { configured: boolean; keyCount: number } };
    };
    expect(body.brainstorm.enabled).toBe(false);
    expect(body.brainstorm.pool).toEqual({ configured: false, keyCount: 0 });
  });
});
