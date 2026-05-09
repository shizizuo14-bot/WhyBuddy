/**
 * Agent Crew Stage Activation — Driver Tests
 *
 * R9.2 四条硬需求 + R8.1 + R8.2 = 6 条硬需求 + ~6 条补充 = 12 条
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
} from "../../../../shared/blueprint/index.js";

import type { BlueprintServiceContext } from "../context.js";
import { createAgentCrewStageActivationDriver } from "./driver.js";
import { createDefaultAgentCrewStageActivationPolicy } from "./policy.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeRoleEvidence(options: {
  roles: Array<{
    id: string;
    label: string;
    activationStages: string[];
    responsibilities?: string[];
  }>;
  executionMode?: string;
  promptId?: string;
  structuredRoles?: unknown;
  noStructuredRoles?: boolean;
}) {
  const {
    roles,
    executionMode = "real",
    promptId = "blueprint.role-architecture.v1",
    noStructuredRoles = false,
  } = options;

  const structuredRoles = noStructuredRoles
    ? undefined
    : { payload: { roles } };

  return {
    id: "evidence-001",
    capabilityId: "role-system-architecture",
    title: "Role Architecture",
    provenance: {
      executionMode,
      promptId,
      routeSetId: "rs-1",
      routeId: "rs-1:primary",
      structuredRoles,
    },
  };
}

function makeJob(options: {
  roles: Array<{
    id: string;
    label: string;
    activationStages: string[];
    responsibilities?: string[];
  }>;
  stages: BlueprintGenerationStage[];
  status?: string;
  executionMode?: string;
  promptId?: string;
  noStructuredRoles?: boolean;
  noEvidence?: boolean;
}): BlueprintGenerationJob {
  const evidence = options.noEvidence
    ? undefined
    : makeRoleEvidence({
        roles: options.roles,
        executionMode: options.executionMode,
        promptId: options.promptId,
        noStructuredRoles: options.noStructuredRoles,
      });

  return {
    id: "job-1",
    projectId: "proj-1",
    status: (options.status ?? "running") as any,
    stage: options.stages[0] ?? ("input" as any),
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { routeSetId: "rs-1" } as any,
    artifacts: evidence
      ? [{ id: "art-1", type: "capability_evidence", title: "Role Evidence", createdAt: "2026-01-01T00:00:00.000Z", payload: evidence }]
      : [],
    events: [],
    routeSet: {
      routes: [
        {
          id: "rs-1:primary",
          stages: options.stages,
        },
      ],
    },
    stageState: {
      nextAction: { routeId: "rs-1:primary" },
    },
  } as unknown as BlueprintGenerationJob;
}

function makeCtx(options?: {
  now?: () => Date;
  suppressRepeatedStates?: boolean;
}) {
  const emitSpy = vi.fn();
  const debugSpy = vi.fn();
  const warnSpy = vi.fn();

  const policy = createDefaultAgentCrewStageActivationPolicy();
  if (options?.suppressRepeatedStates !== undefined) {
    (policy as any).suppressRepeatedStates = options.suppressRepeatedStates;
  }

  const ctx = {
    now: options?.now ?? (() => new Date("2026-01-01T00:00:00.000Z")),
    eventBus: { emit: emitSpy, subscribe: () => () => {} },
    logger: {
      debug: debugSpy,
      info: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
    },
    agentCrewStageActivationPolicy: policy,
  } as unknown as BlueprintServiceContext;

  return { ctx, emitSpy, debugSpy, warnSpy, policy };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("createAgentCrewStageActivationDriver", () => {
  beforeEach(() => {
    vi.stubEnv("BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── R9.2 (a) Initial activation mapping ─────────────────────────────────

  it("11.1 R9.2(a): initial activation maps roles correctly at first stage", () => {
    const { ctx, emitSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [
        { id: "planner", label: "Planner", activationStages: ["input", "clarification"], responsibilities: [] },
        { id: "architect", label: "Architect", activationStages: ["spec_tree"], responsibilities: [] },
        { id: "reviewer", label: "Reviewer", activationStages: ["engineering_handoff"], responsibilities: [] },
      ],
      stages: ["input", "clarification", "spec_tree", "engineering_handoff"] as BlueprintGenerationStage[],
    });

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).toHaveBeenCalledTimes(3);
    const events = emitSpy.mock.calls.map((c: any) => c[0]);

    // Stable role-first order
    expect(events[0].type).toBe(BlueprintEventName.RoleActivated);
    expect(events[0].roleId).toBe("planner");
    expect(events[0].presenceState).toBe("active");

    expect(events[1].type).toBe(BlueprintEventName.RoleWatching);
    expect(events[1].roleId).toBe("architect");
    expect(events[1].presenceState).toBe("watching");

    expect(events[2].type).toBe(BlueprintEventName.RoleWatching);
    expect(events[2].roleId).toBe("reviewer");
    expect(events[2].presenceState).toBe("watching");
  });

  // ── R9.2 (b) Mid-stage watching ────────────────────────────────────────

  it("11.2 R9.2(b): future activation role is watching", () => {
    const { ctx, emitSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [
        { id: "architect", label: "Architect", activationStages: ["spec_tree"], responsibilities: [] },
      ],
      stages: ["input", "clarification", "spec_tree"] as BlueprintGenerationStage[],
    });

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).toHaveBeenCalledTimes(1);
    const event = emitSpy.mock.calls[0][0];
    expect(event.type).toBe(BlueprintEventName.RoleWatching);
    expect(event.presenceState).toBe("watching");
    expect(event.roleId).toBe("architect");
  });

  // ── R9.2 (c) Final sleeping ─────────────────────────────────────────────

  it("11.3 R9.2(c): role transitions through active → reviewing → sleeping", () => {
    const { ctx, emitSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [
        { id: "planner", label: "Planner", activationStages: ["input"], responsibilities: [] },
      ],
      stages: ["input", "clarification", "spec_tree"] as BlueprintGenerationStage[],
    });

    // Stage 1: input → active
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    // Stage 2: clarification → reviewing
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "clarification" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    // Stage 3: spec_tree → sleeping
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "spec_tree" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).toHaveBeenCalledTimes(3);
    const events = emitSpy.mock.calls.map((c: any) => c[0]);

    expect(events[0].type).toBe(BlueprintEventName.RoleActivated);
    expect(events[0].presenceState).toBe("active");

    expect(events[1].type).toBe(BlueprintEventName.RoleReviewStarted);
    expect(events[1].presenceState).toBe("reviewing");

    expect(events[2].type).toBe(BlueprintEventName.RoleSleeping);
    expect(events[2].presenceState).toBe("sleeping");
  });

  // ── R9.2 (d) Fallback silent ────────────────────────────────────────────

  it("11.4 R9.2(d): fallback silent when no role evidence", () => {
    const { ctx, emitSpy, debugSpy, warnSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [],
      stages: ["input"] as BlueprintGenerationStage[],
      noEvidence: true,
    });

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).not.toHaveBeenCalled();
    expect(driver.executionMode).toBe("simulated_fallback");
    expect(driver.lastFallbackReason).toContain("role evidence not found");
    expect(debugSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ── R8.1 Determinism ────────────────────────────────────────────────────

  it("11.5 R8.1: deterministic output across two runs (except id/occurredAt)", () => {
    const roles = [
      { id: "planner", label: "Planner", activationStages: ["input"], responsibilities: [] as string[] },
      { id: "architect", label: "Architect", activationStages: ["spec_tree"], responsibilities: [] as string[] },
    ];
    const stages = ["input", "clarification", "spec_tree"] as BlueprintGenerationStage[];

    // Run 1
    const { ctx: ctx1, emitSpy: emit1 } = makeCtx({
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    const driver1 = createAgentCrewStageActivationDriver(ctx1);
    const job1 = makeJob({ roles, stages });
    driver1.onStageTransition({ jobId: "job-1", stageId: "input" as BlueprintGenerationStage, transition: "stage_started", job: job1 });

    // Run 2
    const { ctx: ctx2, emitSpy: emit2 } = makeCtx({
      now: () => new Date("2026-01-01T00:00:01.000Z"),
    });
    const driver2 = createAgentCrewStageActivationDriver(ctx2);
    const job2 = makeJob({ roles, stages });
    driver2.onStageTransition({ jobId: "job-1", stageId: "input" as BlueprintGenerationStage, transition: "stage_started", job: job2 });

    expect(emit1.mock.calls.length).toBe(emit2.mock.calls.length);

    for (let i = 0; i < emit1.mock.calls.length; i++) {
      const e1 = { ...emit1.mock.calls[i][0] };
      const e2 = { ...emit2.mock.calls[i][0] };
      // Remove non-deterministic fields
      delete (e1 as any).id;
      delete (e1 as any).occurredAt;
      delete (e2 as any).id;
      delete (e2 as any).occurredAt;
      expect(e1).toEqual(e2);
    }
  });

  // ── R8.2 Triplet idempotence ────────────────────────────────────────────

  it("11.6 R8.2: same stageId called twice does not re-emit", () => {
    const { ctx, emitSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [
        { id: "planner", label: "Planner", activationStages: ["input"], responsibilities: [] },
      ],
      stages: ["input", "clarification"] as BlueprintGenerationStage[],
    });

    // First call
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    expect(emitSpy).toHaveBeenCalledTimes(1);

    // Second call with same stageId
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    // Should not emit again (triplet already recorded)
    expect(emitSpy).toHaveBeenCalledTimes(1);

    // stage_retry is not handled in current version (debug skip)
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_retry",
      job,
    });
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  // ── Supplementary: Not enabled ──────────────────────────────────────────

  it("11.7 not enabled: fallback when env not set", () => {
    vi.stubEnv("BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED", "false");

    const { ctx, emitSpy, debugSpy, warnSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [{ id: "planner", label: "Planner", activationStages: ["input"], responsibilities: [] }],
      stages: ["input"] as BlueprintGenerationStage[],
    });

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).not.toHaveBeenCalled();
    expect(driver.executionMode).toBe("simulated_fallback");
    expect(driver.lastFallbackReason).toBe("driver not enabled");
    expect(debugSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ── Supplementary: PromptId mismatch ────────────────────────────────────

  it("11.8 promptId v2 mismatch: fallback with warn", () => {
    const { ctx, emitSpy, warnSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [{ id: "planner", label: "Planner", activationStages: ["input"], responsibilities: [] }],
      stages: ["input"] as BlueprintGenerationStage[],
      promptId: "blueprint.role-architecture.v2",
    });

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).not.toHaveBeenCalled();
    expect(driver.lastFallbackReason).toMatch(/not supported/);
    expect(warnSpy).toHaveBeenCalled();
  });

  // ── Supplementary: structuredRoles missing ──────────────────────────────

  it("11.9 structuredRoles missing: fallback with warn", () => {
    const { ctx, emitSpy, warnSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [{ id: "planner", label: "Planner", activationStages: ["input"], responsibilities: [] }],
      stages: ["input"] as BlueprintGenerationStage[],
      noStructuredRoles: true,
    });

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });

    expect(emitSpy).not.toHaveBeenCalled();
    expect(driver.lastFallbackReason).toBe("structured roles missing");
    expect(warnSpy).toHaveBeenCalled();
  });

  // ── Supplementary: After job completed (R8.5) ───────────────────────────

  it("11.10 event after job completed: skips silently", () => {
    const { ctx, emitSpy, debugSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [{ id: "planner", label: "Planner", activationStages: ["input", "clarification"], responsibilities: [] }],
      stages: ["input", "clarification"] as BlueprintGenerationStage[],
    });

    // First call succeeds
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(driver.executionMode).toBe("real");

    // Mark job as completed
    const completedJob = { ...job, status: "completed" } as unknown as BlueprintGenerationJob;

    driver.onStageTransition({
      jobId: "job-1",
      stageId: "clarification" as BlueprintGenerationStage,
      transition: "stage_started",
      job: completedJob,
    });

    // No new events emitted
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalled();
  });

  // ── Supplementary: Before any transition (R8.4) ─────────────────────────

  it("11.11 before any transition: no events emitted, mode is not_determined", () => {
    const { ctx, emitSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    expect(emitSpy).not.toHaveBeenCalled();
    expect(driver.executionMode).toBe("not_determined");
    expect(driver.lastFallbackReason).toBeUndefined();
  });

  // ── Supplementary: suppressRepeatedStates (R3.7) ────────────────────────

  it("11.12 suppressRepeatedStates: consecutive active stages suppressed by default", () => {
    const { ctx, emitSpy } = makeCtx();
    const driver = createAgentCrewStageActivationDriver(ctx);

    const job = makeJob({
      roles: [
        { id: "planner", label: "Planner", activationStages: ["input", "clarification"], responsibilities: [] },
      ],
      stages: ["input", "clarification"] as BlueprintGenerationStage[],
    });

    // Stage 1: input → active (emitted)
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0].type).toBe(BlueprintEventName.RoleActivated);

    // Stage 2: clarification → still active (suppressed)
    driver.onStageTransition({
      jobId: "job-1",
      stageId: "clarification" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    expect(emitSpy).toHaveBeenCalledTimes(1); // No new emit

    // Now test with suppressRepeatedStates = false
    const { ctx: ctx2, emitSpy: emit2 } = makeCtx({ suppressRepeatedStates: false });
    const driver2 = createAgentCrewStageActivationDriver(ctx2);

    driver2.onStageTransition({
      jobId: "job-1",
      stageId: "input" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    driver2.onStageTransition({
      jobId: "job-1",
      stageId: "clarification" as BlueprintGenerationStage,
      transition: "stage_started",
      job,
    });
    // Both emitted when suppression is off
    expect(emit2).toHaveBeenCalledTimes(2);
  });
});
