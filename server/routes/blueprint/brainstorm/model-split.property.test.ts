// Feature: autopilot-brainstorm-real-collaboration, Property 10: Model split routes debate to aux and synthesis/audit/adjudication to primary
//
// P10 (Model split routes debate to aux and synthesis/audit/adjudication to
//      primary):
//   For ANY executed discussion-mode brainstorm session constructed with two
//   DISTINCT, distinguishable callers (an aux caller and a primary caller),
//   every agent-claim / Critique / Rebuttal call SHALL be routed through the
//   AUX caller, and every adjudication call SHALL be routed through the PRIMARY
//   caller. Call types are distinguished purely by prompt content (claim prompt
//   vs critique prompt vs rebuttal prompt vs adjudication prompt).
//   Validates: Requirements 8.1, 8.2, 12.5
//
// Library: fast-check + Vitest (server config). Minimum 100 iterations.
// The injected spy callers return parseable JSON for every prompt shape so the
// real structured deliberation path completes deterministically (no network).

import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import type {
  BrainstormRoleId,
  SessionConfig,
} from "../../../../shared/blueprint/brainstorm-contracts.js";
import {
  BrainstormOrchestrator,
  type EventEmitterFn,
  type LLMCallerFn,
} from "./orchestrator.js";

// ---------------------------------------------------------------------------
// Prompt classification (by content only)
// ---------------------------------------------------------------------------

type PromptKind = "claim" | "critique" | "rebuttal" | "adjudication" | "unknown";

/**
 * Classify an LLM prompt by content alone. Marker phrases are pinned from the
 * orchestrator/adjudicator prompt builders:
 *  - adjudication: "You are the adjudicator for round"     (buildAdjudicationPrompt)
 *  - critique:     "Critically review this specific"        (buildCritiquePrompt)
 *  - rebuttal:     "Respond to the critique"                (buildRebuttalPrompt)
 *  - claim:        "Provide your analysis and conclusion"   (executeCrewMember)
 */
function classifyPrompt(prompt: string): PromptKind {
  if (prompt.includes("You are the adjudicator for round")) return "adjudication";
  if (prompt.includes("Critically review this specific")) return "critique";
  if (prompt.includes("Respond to the critique")) return "rebuttal";
  if (prompt.includes("Provide your analysis and conclusion")) return "claim";
  return "unknown";
}

/** JSON the aux caller returns for a claim prompt. */
function claimResponse(): string {
  return JSON.stringify({
    content: "Use a layered architecture with clear interface contracts.",
    confidence: 0.8,
    needsToolCall: false,
  });
}

/** JSON the aux caller returns for a critique prompt. */
function critiqueResponse(): string {
  return JSON.stringify({
    critique: "This claim under-specifies the failure modes.",
    severity: "medium",
  });
}

/** JSON the aux caller returns for a rebuttal prompt. */
function rebuttalResponse(): string {
  return JSON.stringify({
    rebuttal: "Failure modes are covered by the retry policy already noted.",
    stance: "defend",
  });
}

/**
 * JSON the primary caller returns for an adjudication prompt. `consensusReached`
 * is true so the structured loop terminates at `minRounds` (keeps each run fast
 * while still exercising at least one adjudication call).
 */
function adjudicationResponse(): string {
  return JSON.stringify({
    consensusReached: true,
    convergenceScore: 0.9,
    unresolvedCritiqueIds: [],
    rationale: "Most critiques were addressed.",
  });
}

interface SpyCaller {
  caller: LLMCallerFn;
  kinds: PromptKind[];
}

/** Aux spy: serves claim / critique / rebuttal prompts with valid JSON. */
function makeAuxSpy(): SpyCaller {
  const kinds: PromptKind[] = [];
  const caller: LLMCallerFn = vi.fn(async (prompt: string) => {
    const kind = classifyPrompt(prompt);
    kinds.push(kind);
    switch (kind) {
      case "critique":
        return critiqueResponse();
      case "rebuttal":
        return rebuttalResponse();
      case "claim":
        return claimResponse();
      default:
        // Any other prompt that ever lands on aux still returns parseable JSON
        // so the engine never stalls; the assertions below will flag misroutes.
        return claimResponse();
    }
  });
  return { caller, kinds };
}

/** Primary spy: serves adjudication prompts with a valid verdict. */
function makePrimarySpy(): SpyCaller {
  const kinds: PromptKind[] = [];
  const caller: LLMCallerFn = vi.fn(async (prompt: string) => {
    const kind = classifyPrompt(prompt);
    kinds.push(kind);
    return adjudicationResponse();
  });
  return { caller, kinds };
}

function makeNoopEmitter(): EventEmitterFn {
  return vi.fn();
}

const ALL_ROLES: BrainstormRoleId[] = [
  "decider",
  "planner",
  "architect",
  "executor",
  "auditor",
  "ui_previewer",
];

function makeConfig(overrides: Partial<SessionConfig>): SessionConfig {
  return {
    jobId: "job-p10",
    stageId: "stage-p10",
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
 * microtasks. The injected spies resolve synchronously, so the whole structured
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
// Generators — random session shapes
// ---------------------------------------------------------------------------

/** A random non-empty subset of the registered roles (order preserved). */
const arbRoles = fc
  .subarray(ALL_ROLES, { minLength: 1, maxLength: ALL_ROLES.length })
  .filter((roles) => roles.length >= 1);

const arbConfig = fc.record({
  roles: arbRoles,
  jobId: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `job-${s.replace(/\s/g, "_")}`),
  stageId: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `stage-${s.replace(/\s/g, "_")}`),
  stageContext: fc.string({ minLength: 1, maxLength: 80 }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe("Property 10: model split routes debate to aux, adjudication to primary", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes claim/critique/rebuttal to aux and adjudication to primary across random sessions", async () => {
    await fc.assert(
      fc.asyncProperty(arbConfig, async ({ roles, jobId, stageId, stageContext }) => {
        const aux = makeAuxSpy();
        const primary = makePrimarySpy();
        const orchestrator = new BrainstormOrchestrator(
          aux.caller,
          makeNoopEmitter(),
          primary.caller,
        );

        try {
          await runDiscussionToCompletion(
            orchestrator,
            makeConfig({
              roles: [...new Set(roles)],
              jobId,
              stageId,
              stageContext: stageContext.trim() || "fallback context",
            }),
          );

          // Every prompt the AUX caller saw must be a debate call
          // (claim / critique / rebuttal) — NEVER an adjudication.
          for (const kind of aux.kinds) {
            expect(["claim", "critique", "rebuttal"]).toContain(kind);
          }
          expect(aux.kinds).not.toContain("adjudication");

          // Every prompt the PRIMARY caller saw must be an adjudication —
          // NEVER a claim / critique / rebuttal.
          for (const kind of primary.kinds) {
            expect(kind).toBe("adjudication");
          }
          expect(primary.kinds).not.toContain("claim");
          expect(primary.kinds).not.toContain("critique");
          expect(primary.kinds).not.toContain("rebuttal");

          // The structured path must actually have run: at least one agent
          // claim on aux and at least one adjudication on primary.
          expect(aux.kinds.filter((k) => k === "claim").length).toBeGreaterThanOrEqual(1);
          expect(primary.kinds.length).toBeGreaterThanOrEqual(1);
        } finally {
          orchestrator.dispose();
        }
      }),
      { numRuns: 120 },
    );
  });
});
