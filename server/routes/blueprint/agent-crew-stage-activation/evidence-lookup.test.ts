import { describe, expect, it } from "vitest";

import { findRoleArchitectureEvidence } from "./evidence-lookup.js";
import { createDefaultAgentCrewStageActivationPolicy } from "./policy.js";

import type { BlueprintGenerationJob } from "../../../../shared/blueprint/index.js";

/**
 * Helper: create a minimal job with given artifacts.
 */
function createJob(
  artifacts: BlueprintGenerationJob["artifacts"] = []
): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: { targetText: "test", githubUrls: [] } as any,
    status: "running",
    stage: "input",
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    artifacts,
    events: [],
  };
}

/**
 * Helper: create a capability_evidence artifact with role-system-architecture payload.
 */
function createRoleEvidence(overrides: {
  executionMode?: "real" | "simulated_fallback";
  routeSetId?: string;
  primaryRouteId?: string;
  promptId?: string;
  structuredRoles?: { payload?: { roles: any[] } } | undefined;
  rolesCount?: number;
}) {
  const {
    executionMode = "real",
    routeSetId = "rs-abc",
    primaryRouteId = "rs-abc:primary",
    promptId = "blueprint.role-architecture.v1",
    rolesCount = 2,
  } = overrides;

  const structuredRoles =
    "structuredRoles" in overrides
      ? overrides.structuredRoles
      : {
          payload: {
            roles: Array.from({ length: rolesCount }, (_, i) => ({
              id: `role-${i}`,
              label: `Role ${i}`,
              responsibilities: ["resp"],
              activationStages: ["input"],
            })),
          },
        };

  return {
    id: "artifact-1",
    type: "capability_evidence" as any,
    title: "Role Evidence",
    summary: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    payload: {
      id: "ev-1",
      jobId: "job-1",
      invocationId: "inv-1",
      capabilityId: "role-system-architecture",
      capabilityLabel: "Role System Architecture",
      kind: "analysis" as const,
      status: "recorded" as const,
      title: "Role Evidence",
      summary: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
      artifacts: [],
      logs: [],
      tags: [],
      payloadSummary: {},
      provenance: {
        jobId: "job-1",
        githubUrls: [],
        executionMode,
        routeSetId,
        routeId: primaryRouteId,
        promptId,
        structuredRoles,
      },
    },
  };
}

describe("findRoleArchitectureEvidence", () => {
  const policy = createDefaultAgentCrewStageActivationPolicy();

  it("Real path + triplet match → status === 'real'", () => {
    const job = createJob([createRoleEvidence({})]);
    const result = findRoleArchitectureEvidence({
      job,
      routeSetId: "rs-abc",
      primaryRouteId: "rs-abc:primary",
      policy,
    });
    expect(result.status).toBe("real");
    if (result.status === "real") {
      expect(result.payload.roles.length).toBe(2);
    }
  });

  it("job === null → 'job not found'", () => {
    const result = findRoleArchitectureEvidence({
      job: null,
      policy,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.reason).toBe("job not found");
    }
  });

  it("No role-system-architecture evidence → 'role evidence not found'", () => {
    const job = createJob([]);
    const result = findRoleArchitectureEvidence({ job, policy });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.reason).toBe("role evidence not found");
    }
  });

  it("Fallback candidate only (executionMode === 'simulated_fallback') → 'role bridge fallback'", () => {
    const job = createJob([
      createRoleEvidence({ executionMode: "simulated_fallback" }),
    ]);
    const result = findRoleArchitectureEvidence({
      job,
      routeSetId: "rs-abc",
      primaryRouteId: "rs-abc:primary",
      policy,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.reason).toBe("role bridge fallback");
    }
  });

  it("structuredRoles missing → 'structured roles missing'", () => {
    const job = createJob([
      createRoleEvidence({ structuredRoles: undefined }),
    ]);
    const result = findRoleArchitectureEvidence({
      job,
      routeSetId: "rs-abc",
      primaryRouteId: "rs-abc:primary",
      policy,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.reason).toBe("structured roles missing");
    }
  });

  it("promptId v2 not supported → reason contains 'not supported'", () => {
    const job = createJob([
      createRoleEvidence({ promptId: "blueprint.role-architecture.v2" }),
    ]);
    const result = findRoleArchitectureEvidence({
      job,
      routeSetId: "rs-abc",
      primaryRouteId: "rs-abc:primary",
      policy,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.reason).toContain("not supported");
      expect(result.reason).toContain("blueprint.role-architecture.v2");
    }
  });

  it("Triplet partial match (routeSetId matches, primaryRouteId does not) → 'role evidence not found'", () => {
    const job = createJob([
      createRoleEvidence({
        routeSetId: "rs-abc",
        primaryRouteId: "rs-abc:other-route",
      }),
    ]);
    const result = findRoleArchitectureEvidence({
      job,
      routeSetId: "rs-abc",
      primaryRouteId: "rs-abc:primary",
      policy,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.reason).toBe("role evidence not found");
    }
  });
});
