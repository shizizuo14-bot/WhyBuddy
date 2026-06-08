// Feature: autopilot-brainstorm-real-collaboration, Task 12.2
//
// Integration/unit coverage for `getBrainstormDiagnostics` surfacing the REAL
// structured-collaboration counters (critiqueCount / rebuttalCount /
// unresolvedCount / adjudicationCount / voteCount) on both branches of the
// diagnostics shape:
//
//   - null context branch  -> all five counts === 0, plus enabled:false,
//     a populated perStageConfig map and the pool descriptor.
//   - enabled context branch -> after a discussion-mode session runs through a
//     real BrainstormOrchestrator (with deterministic aux + primary callers so
//     the structured Critique -> Rebuttal -> Adjudication path actually runs),
//     getBrainstormDiagnostics reflects non-zero critiqueCount / adjudicationCount.
//
// Validates: Requirements 11.1, 11.2, 11.3
//
// The injected callers return parseable JSON for every prompt shape so the real
// structured deliberation chain completes deterministically (no network, no
// timers).

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionConfig } from "../../../../shared/blueprint/brainstorm-contracts.js";
import {
  BrainstormOrchestrator,
  type EventEmitterFn,
  type LLMCallerFn,
} from "./orchestrator.js";
import {
  getBrainstormDiagnostics,
  type BrainstormServiceContext,
} from "./pipeline-integration.js";

// ---------------------------------------------------------------------------
// Deterministic caller helpers (classified by prompt content)
// ---------------------------------------------------------------------------

type PromptKind = "claim" | "critique" | "rebuttal" | "adjudication" | "unknown";

/** Classify an LLM prompt by content alone (marker phrases pinned to builders). */
function classifyPrompt(prompt: string): PromptKind {
  if (prompt.includes("You are the adjudicator for round")) return "adjudication";
  if (prompt.includes("Critically review this specific")) return "critique";
  if (prompt.includes("Respond to the critique")) return "rebuttal";
  if (prompt.includes("Provide your analysis and conclusion")) return "claim";
  return "unknown";
}

function claimResponse(): string {
  return JSON.stringify({
    content: "Use a layered architecture with clear interface contracts.",
    confidence: 0.8,
    needsToolCall: false,
  });
}

function critiqueResponse(): string {
  return JSON.stringify({
    critique: "This claim under-specifies the failure modes.",
    severity: "high",
  });
}

function rebuttalResponse(): string {
  // `defend` keeps the critique unresolved so unresolvedCount can be exercised.
  return JSON.stringify({
    rebuttal: "Failure modes are covered by the retry policy already noted.",
    stance: "defend",
  });
}

/**
 * Adjudication verdict. `consensusReached:false` keeps the loop running to the
 * max-round bound, guaranteeing multiple adjudication calls (adjudicationCount
 * === rounds executed).
 */
function adjudicationResponse(): string {
  return JSON.stringify({
    consensusReached: false,
    convergenceScore: 0.4,
    unresolvedCritiqueIds: [],
    rationale: "Several critiques remain open.",
  });
}

/** Aux caller: serves claim / critique / rebuttal prompts. */
function makeAuxCaller(): LLMCallerFn {
  return vi.fn(async (prompt: string) => {
    switch (classifyPrompt(prompt)) {
      case "critique":
        return critiqueResponse();
      case "rebuttal":
        return rebuttalResponse();
      case "claim":
        return claimResponse();
      default:
        return claimResponse();
    }
  });
}

/** Primary caller: serves adjudication prompts. */
function makePrimaryCaller(): LLMCallerFn {
  return vi.fn(async (_prompt: string) => adjudicationResponse());
}

function makeNoopEmitter(): EventEmitterFn {
  return vi.fn();
}

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    jobId: "job-diag",
    stageId: "stage-diag",
    mode: "discussion",
    roles: ["planner", "architect"],
    toolCategories: ["mcp"],
    stageContext: "Design a resilient service.",
    tokenBudget: 50_000,
    toolCallLimit: 20,
    ...overrides,
  };
}

/**
 * Drive a discussion session to a terminal (non-active) state by flushing
 * microtasks. The injected callers resolve synchronously, so the structured
 * deliberation chain settles within microtasks — no timers / no network.
 */
async function runDiscussionToCompletion(
  orchestrator: BrainstormOrchestrator,
  config: SessionConfig,
): Promise<void> {
  const session = await orchestrator.startSession(config);
  for (let i = 0; i < 5_000 && session.status === "active"; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getBrainstormDiagnostics structured-collaboration counts", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("null context branch: all five counts are 0, plus enabled:false / perStageConfig / pool (R11.1, R11.2)", () => {
    const diagnostics = getBrainstormDiagnostics(null);

    // The five real structured-collaboration counters are surfaced and zero.
    expect(diagnostics.critiqueCount).toBe(0);
    expect(diagnostics.rebuttalCount).toBe(0);
    expect(diagnostics.unresolvedCount).toBe(0);
    expect(diagnostics.adjudicationCount).toBe(0);
    expect(diagnostics.voteCount).toBe(0);

    // Stable diagnostics shape on the disabled branch (R11.1).
    expect(diagnostics.enabled).toBe(false);
    expect(diagnostics.activeSessionsCount).toBe(0);
    expect(diagnostics.totalSessionsCompleted).toBe(0);
    expect(diagnostics.degradationCount).toBe(0);

    // perStageConfig present and a plain object map of stage -> boolean.
    expect(diagnostics.perStageConfig).toBeDefined();
    expect(typeof diagnostics.perStageConfig).toBe("object");
    for (const value of Object.values(diagnostics.perStageConfig)) {
      expect(typeof value).toBe("boolean");
    }

    // pool descriptor present.
    expect(diagnostics.pool).toBeDefined();
    expect(typeof diagnostics.pool.configured).toBe("boolean");
    expect(typeof diagnostics.pool.keyCount).toBe("number");
    expect(diagnostics.pool.keyCount).toBeGreaterThanOrEqual(0);
  });

  it("enabled context branch: reflects non-zero critiqueCount / adjudicationCount after a real discussion session (R11.1, R11.2, R11.3)", async () => {
    const aux = makeAuxCaller();
    const primary = makePrimaryCaller();
    const orchestrator = new BrainstormOrchestrator(aux, makeNoopEmitter(), primary);

    try {
      await runDiscussionToCompletion(orchestrator, makeConfig());

      // Wrap the real orchestrator into a minimal BrainstormServiceContext-like
      // object. getBrainstormDiagnostics only reads `orchestrator.getDiagnostics()`
      // on the enabled branch, so a partial context is sufficient.
      const ctx = {
        orchestrator,
        enabled: true,
      } as unknown as BrainstormServiceContext;

      const diagnostics = getBrainstormDiagnostics(ctx);

      // The structured deliberation actually ran: real critiques were produced
      // and at least one adjudication round executed (R11.2).
      expect(diagnostics.critiqueCount).toBeGreaterThan(0);
      expect(diagnostics.adjudicationCount).toBeGreaterThan(0);

      // Counters are non-negative integers and consistent with the enabled shape.
      expect(diagnostics.rebuttalCount).toBeGreaterThanOrEqual(0);
      expect(diagnostics.unresolvedCount).toBeGreaterThanOrEqual(0);
      expect(diagnostics.voteCount).toBeGreaterThanOrEqual(0);
      expect(diagnostics.enabled).toBe(true);

      // Enabled branch still surfaces perStageConfig + pool (R11.1).
      expect(diagnostics.perStageConfig).toBeDefined();
      expect(diagnostics.pool).toBeDefined();

      // Sanity: the deterministic callers were actually exercised.
      expect(aux).toHaveBeenCalled();
      expect(primary).toHaveBeenCalled();
    } finally {
      orchestrator.dispose();
    }
  });
});
