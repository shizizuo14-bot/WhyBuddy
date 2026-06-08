// Unit tests for orchestrator model-split routing wiring (Task 8.3).
//
// Asserts the critique / rebuttal / adjudicator wiring of the discussion-mode
// structured deliberation path, using two distinguishable spy callers:
//  - R1.1: the Critique call runs on the AUX caller.
//  - R2.1: the Rebuttal call runs on the AUX caller.
//  - R3.1: the Adjudication call runs on the PRIMARY caller.
//
// Call types are distinguished by prompt content (the orchestrator/adjudicator
// prompt builders use stable marker phrases). The spy callers return parseable
// JSON for every prompt shape so the structured path completes deterministically
// without any network access.
//
// Requirements: 1.1, 2.1, 3.1
// @see .kiro/specs/autopilot-brainstorm-real-collaboration/design.md §2 (Property 10 / routing wiring)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionConfig } from "../../../../shared/blueprint/brainstorm-contracts.js";
import {
  BrainstormOrchestrator,
  type EventEmitterFn,
  type LLMCallerFn,
} from "./orchestrator.js";

// ---------------------------------------------------------------------------
// Prompt classification + spy callers
// ---------------------------------------------------------------------------

type PromptKind = "claim" | "critique" | "rebuttal" | "adjudication" | "unknown";

function classifyPrompt(prompt: string): PromptKind {
  if (prompt.includes("You are the adjudicator for round")) return "adjudication";
  if (prompt.includes("Critically review this specific")) return "critique";
  if (prompt.includes("Respond to the critique")) return "rebuttal";
  if (prompt.includes("Provide your analysis and conclusion")) return "claim";
  return "unknown";
}

function responseFor(kind: PromptKind): string {
  switch (kind) {
    case "critique":
      return JSON.stringify({
        critique: "The claim ignores the rollback path.",
        severity: "high",
      });
    case "rebuttal":
      return JSON.stringify({
        rebuttal: "Rollback is handled by the migration guard.",
        stance: "defend",
      });
    case "adjudication":
      return JSON.stringify({
        consensusReached: true,
        convergenceScore: 0.85,
        unresolvedCritiqueIds: [],
        rationale: "Critiques addressed.",
      });
    case "claim":
    default:
      return JSON.stringify({
        content: "Adopt an event-driven design with idempotent handlers.",
        confidence: 0.8,
        needsToolCall: false,
      });
  }
}

interface SpyCaller {
  caller: LLMCallerFn;
  kinds: PromptKind[];
}

function makeSpy(): SpyCaller {
  const kinds: PromptKind[] = [];
  const caller: LLMCallerFn = vi.fn(async (prompt: string) => {
    const kind = classifyPrompt(prompt);
    kinds.push(kind);
    return responseFor(kind);
  });
  return { caller, kinds };
}

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    jobId: "job-routing-1",
    stageId: "stage-routing",
    mode: "discussion",
    roles: ["planner", "architect"],
    toolCategories: ["mcp"],
    stageContext: "Design a database migration strategy.",
    tokenBudget: 50_000,
    toolCallLimit: 20,
    ...overrides,
  };
}

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

describe("BrainstormOrchestrator - structured routing wiring (R1.1 / R2.1 / R3.1)", () => {
  let aux: SpyCaller;
  let primary: SpyCaller;
  let emitter: EventEmitterFn;
  let orchestrator: BrainstormOrchestrator;

  beforeEach(() => {
    aux = makeSpy();
    primary = makeSpy();
    emitter = vi.fn();
    orchestrator = new BrainstormOrchestrator(aux.caller, emitter, primary.caller);
  });

  afterEach(() => {
    orchestrator.dispose();
    vi.clearAllMocks();
  });

  it("R1.1: routes the Critique call through the aux caller", async () => {
    await runDiscussionToCompletion(orchestrator, makeConfig());

    expect(aux.kinds).toContain("critique");
    // The primary caller must never receive a critique prompt.
    expect(primary.kinds).not.toContain("critique");
  });

  it("R2.1: routes the Rebuttal call through the aux caller", async () => {
    await runDiscussionToCompletion(orchestrator, makeConfig());

    expect(aux.kinds).toContain("rebuttal");
    expect(primary.kinds).not.toContain("rebuttal");
  });

  it("R3.1: routes the Adjudication call through the primary caller", async () => {
    await runDiscussionToCompletion(orchestrator, makeConfig());

    expect(primary.kinds).toContain("adjudication");
    expect(primary.kinds.every((k) => k === "adjudication")).toBe(true);
    // The aux caller must never receive an adjudication prompt.
    expect(aux.kinds).not.toContain("adjudication");
  });

  it("routes agent-claim calls through the aux caller (debate stays on aux)", async () => {
    await runDiscussionToCompletion(orchestrator, makeConfig());

    expect(aux.kinds).toContain("claim");
    expect(primary.kinds).not.toContain("claim");
    // Aux only ever sees debate work.
    for (const kind of aux.kinds) {
      expect(["claim", "critique", "rebuttal"]).toContain(kind);
    }
  });
});
