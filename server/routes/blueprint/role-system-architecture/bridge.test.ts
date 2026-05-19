import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createRoleSystemArchitectureCapabilityBridge,
  type RoleSystemArchitectureCapabilityBridgeInput,
} from "./bridge.js";
import { createDefaultRoleSystemArchitectureCapabilityPolicy } from "./policy.js";
import type { BlueprintServiceContext } from "../context.js";

/**
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3,
 * 4.6, 4.7, 5.1, 5.2, 5.3, 5.5, 9.1, 9.2, 9.3
 *
 * 8 tests: 5 hard requirements (R9.2 × 4 + R9.3 × 1) + 3 supplementary.
 */

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validRolesPayload = {
  roles: [
    {
      id: "planner",
      label: "Planner",
      responsibilities: ["Plan tasks", "Coordinate team"],
      activationStages: ["route_generation", "planning"],
      permissions: ["read:specs"],
    },
    {
      id: "architect",
      label: "Architect",
      responsibilities: ["Design system architecture"],
      activationStages: ["route_generation"],
    },
    {
      id: "reviewer",
      label: "Reviewer",
      responsibilities: ["Review deliverables"],
      activationStages: ["review"],
    },
  ],
};

function makeInput(overrides?: Partial<RoleSystemArchitectureCapabilityBridgeInput>): RoleSystemArchitectureCapabilityBridgeInput {
  return {
    capability: {
      id: "role-system-architecture",
      label: "Role System Architecture",
      kind: "role",
      securityLevel: "standard",
      requiresApproval: false,
      adapter: "blueprint.runtime.role.system-architecture.simulated",
      tags: ["role", "architecture"],
    },
    route: {
      id: "route-1",
      title: "Primary Route",
      summary: "Main execution path",
      steps: [
        { title: "Step 1", description: "First step", role: "planner" },
        { title: "Step 2", description: "Second step", role: "executor" },
      ],
    },
    jobId: "job-123",
    request: {
      targetText: "Build a release dashboard",
      githubUrls: ["https://github.com/example/repo"],
      projectId: "proj-1",
      sourceId: "src-1",
    },
    routeSet: {
      id: "routeset-1",
      routes: [
        { id: "route-1", title: "Primary Route", summary: "Main path" },
        { id: "route-2", title: "Alt Route", summary: "Alternative" },
      ],
      stagesSummary: [{ stage: "route_generation", label: "Route Generation" }],
    },
    primaryRouteId: "route-1",
    clarificationSession: {
      answers: [{ questionId: "q1", answer: "Yes" }],
      locale: "en-US",
    },
    createdAt: "2026-05-10T00:00:00.000Z",
    invocationId: "inv-001",
    roleId: "role-runtime-executor",
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<{
  callJson: (...args: unknown[]) => Promise<unknown>;
  getConfig: () => { model: string; apiKey: string };
}>): BlueprintServiceContext {
  return {
    now: () => new Date("2026-05-10T00:00:01.000Z"),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    llm: {
      callJson: overrides?.callJson ?? (async () => validRolesPayload),
      getConfig: overrides?.getConfig ?? (() => ({ model: "gpt-4-turbo", apiKey: "sk-test-valid" })),
    },
    roleSystemArchitectureCapabilityPolicy: createDefaultRoleSystemArchitectureCapabilityPolicy(),
  } as unknown as BlueprintServiceContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RoleSystemArchitectureCapabilityBridge", () => {
  beforeEach(() => {
    vi.stubEnv("BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 15.1 R9.2 Happy path
  it("produces real invocation with structured roles on valid LLM response", async () => {
    const ctx = makeCtx();
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const input = makeInput();

    const result = await bridge(input);

    expect(result.executionMode).toBe("real");
    expect(result.structuredRoles!.roles.length).toBe(3);
    expect(result.structuredRolesMeta!.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.structuredRolesMeta!.byteSize).toBeGreaterThan(0);

    const invocation = result.invocation as Record<string, unknown>;
    const provenance = invocation.provenance as Record<string, unknown>;
    expect(provenance.executionMode).toBe("real");
    expect(provenance.promptId).toBe("blueprint.role-architecture.v1");
    expect(provenance.model).toBe("gpt-4-turbo");
    expect(provenance.structuredPayloadDigest).toBe(result.structuredRolesMeta!.digest);
    expect(provenance.primaryRouteId).toBe(input.primaryRouteId);
    expect(provenance.roleCount).toBe(3);
    expect(provenance.error).toBeUndefined();

    const outputSummary = invocation.outputSummary as string;
    expect(outputSummary).toMatch(/Composed\s+3\s+role/);
    expect(invocation.durationMs as number).toBeGreaterThanOrEqual(0);

    // Logs should not contain prompt text
    const logs = invocation.logs as string[];
    const logsJoined = logs.join("\n");
    expect(logsJoined).not.toContain("You are");
    expect(logsJoined).not.toContain("你是");
    expect(logsJoined).not.toContain("system");
  });

  // 15.2 R9.2 Malformed JSON (callJson returns undefined)
  it("falls back on non-json response (undefined)", async () => {
    const ctx = makeCtx({ callJson: async () => undefined });
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const input = makeInput();

    const result = await bridge(input);

    expect(result.executionMode).toBe("simulated_fallback");
    expect(result.structuredRoles).toBeUndefined();
    expect(result.structuredRolesMeta).toBeUndefined();

    const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
    expect(provenance.executionMode).toBe("simulated_fallback");
    expect(provenance.error).toMatch(/non-json response/);
  });

  // 15.3 R9.2 Schema validation fails (3 sub-scenarios)
  describe("schema validation failures", () => {
    it("falls back on empty roles array", async () => {
      const ctx = makeCtx({ callJson: async () => ({ roles: [] }) });
      const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
      const result = await bridge(makeInput());

      expect(result.executionMode).toBe("simulated_fallback");
      const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
      expect(provenance.error).toMatch(/schema validation failed/);
    });

    it("falls back on duplicate role ids", async () => {
      const ctx = makeCtx({
        callJson: async () => ({
          roles: [
            { id: "dup", label: "First", responsibilities: ["r1"], activationStages: ["s1"] },
            { id: "dup", label: "Second", responsibilities: ["r2"], activationStages: ["s2"] },
          ],
        }),
      });
      const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
      const result = await bridge(makeInput());

      expect(result.executionMode).toBe("simulated_fallback");
      const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
      expect(provenance.error).toMatch(/schema validation failed/);
      expect(provenance.error as string).toMatch(/duplicat|unique/i);
    });

    it("falls back on uppercase role id", async () => {
      const ctx = makeCtx({
        callJson: async () => ({
          roles: [{ id: "X", label: "Bad", responsibilities: ["r1"], activationStages: ["s1"] }],
        }),
      });
      const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
      const result = await bridge(makeInput());

      expect(result.executionMode).toBe("simulated_fallback");
      const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
      expect(provenance.error).toMatch(/schema validation failed/);
    });
  });

  // 15.4 R9.2 ApiKey missing
  it("falls back when apiKey is empty and does not call callJson", async () => {
    const callJsonSpy = vi.fn();
    const ctx = makeCtx({
      callJson: callJsonSpy,
      getConfig: () => ({ model: "gpt-4-turbo", apiKey: "" }),
    });
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const result = await bridge(makeInput());

    expect(result.executionMode).toBe("simulated_fallback");
    const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
    expect(provenance.error).toMatch(/llm apiKey missing/);
    expect(callJsonSpy).not.toHaveBeenCalled();
  });

  // 15.5 R9.3 Downstream retrieval feasibility
  it("provides complete structuredRoles for downstream retrieval", async () => {
    const twoRolesPayload = {
      roles: [
        { id: "planner", label: "Planner", responsibilities: ["plan"], activationStages: ["route_generation"] },
        { id: "executor", label: "Executor", responsibilities: ["execute"], activationStages: ["execution"] },
      ],
    };
    const ctx = makeCtx({ callJson: async () => twoRolesPayload });
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const input = makeInput({ primaryRouteId: "rs-abc:primary" });

    const result = await bridge(input);

    expect(result.executionMode).toBe("real");
    expect(result.structuredRoles!.roles.length).toBe(2);
    expect(result.structuredRolesMeta!.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.structuredRolesMeta!.byteSize).toBeGreaterThan(0);
    expect(result.structuredRolesMeta!.summary).toBeTruthy();

    const invocation = result.invocation as Record<string, unknown>;
    const provenance = invocation.provenance as Record<string, unknown>;
    expect(provenance.primaryRouteId).toBe("rs-abc:primary");
    expect(provenance.roleCount).toBe(2);
    expect(provenance.structuredPayloadDigest).toBe(result.structuredRolesMeta!.digest);

    // Simulate buildCapabilityEvidence filling evidence.provenance.structuredRoles
    const evidence = {
      provenance: {
        jobId: input.jobId,
        routeSetId: input.routeSet.id,
        primaryRouteId: provenance.primaryRouteId,
        executionMode: provenance.executionMode,
        roleCount: provenance.roleCount,
        structuredRoles: {
          digest: result.structuredRolesMeta!.digest,
          byteSize: result.structuredRolesMeta!.byteSize,
          summary: result.structuredRolesMeta!.summary,
          payload: result.structuredRoles,
        },
      },
    };

    // Downstream retrieval: can locate by triple (jobId, routeSetId, primaryRouteId)
    expect(evidence.provenance.jobId).toBe(input.jobId);
    expect(evidence.provenance.routeSetId).toBe(input.routeSet.id);
    expect(evidence.provenance.primaryRouteId).toBe("rs-abc:primary");
    expect(evidence.provenance.structuredRoles!.payload!.roles).toEqual(
      result.structuredRoles!.roles,
    );
  });

  // 15.6 Supplementary: Not enabled (tier 1)
  it("falls back when bridge is not enabled", async () => {
    vi.stubEnv("BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED", "false");
    const callJsonSpy = vi.fn();
    const ctx = makeCtx({ callJson: callJsonSpy });
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const input = makeInput();

    const result = await bridge(input);

    expect(result.executionMode).toBe("simulated_fallback");
    const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
    expect(provenance.error).toBe("bridge not enabled");
    expect(provenance.primaryRouteId).toBe(input.primaryRouteId);
    expect(callJsonSpy).not.toHaveBeenCalled();
    expect(ctx.logger.debug).toHaveBeenCalled();
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  // 15.7 Supplementary: Timeout (tier 5)
  it("falls back on timeout/abort error", async () => {
    const ctx = makeCtx({
      callJson: async () => {
        throw new Error("Request aborted due to timeout");
      },
    });
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const result = await bridge(makeInput());

    expect(result.executionMode).toBe("simulated_fallback");
    const provenance = (result.invocation as Record<string, unknown>).provenance as Record<string, unknown>;
    expect(provenance.error).toBe("llm timeout");
  });

  // 15.8 Supplementary: Redaction E2E
  it("redacts sensitive content from logs and outputSummary but preserves structuredRoles payload", async () => {
    const sensitivePayload = {
      roles: [
        {
          id: "data-engineer",
          label: "Data Engineer",
          responsibilities: [
            "contact user@example.com for escalation",
            "use token=sk-ABCDEFGHIJKLMNOP1234567890 for auth",
          ],
          activationStages: ["route_generation"],
        },
      ],
    };
    const ctx = makeCtx({ callJson: async () => sensitivePayload });
    const bridge = createRoleSystemArchitectureCapabilityBridge(ctx);
    const result = await bridge(makeInput());

    expect(result.executionMode).toBe("real");

    const invocation = result.invocation as Record<string, unknown>;
    const logsJoined = (invocation.logs as string[]).join("\n");
    // Logs should not contain raw sensitive values
    expect(logsJoined).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
    expect(logsJoined).not.toContain("user@example.com");

    // outputSummary should not contain raw sensitive values
    expect(invocation.outputSummary as string).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
    expect(invocation.outputSummary as string).not.toContain("user@example.com");

    // But structuredRoles.payload preserves original content (not redacted)
    expect(result.structuredRoles!.roles[0].responsibilities[0]).toContain(
      "user@example.com",
    );
    expect(result.structuredRoles!.roles[0].responsibilities[1]).toContain(
      "sk-ABCDEFGHIJKLMNOP1234567890",
    );
  });
});
