import { afterEach, describe, expect, it, vi } from "vitest";

import { callLlmWithPoolKey } from "../llm-key-pool";

import {
  assembleBrainstormContext,
  executeStageWithBrainstorm,
  type StageContext,
} from "./pipeline-integration";
import type { LLMCallerFn, EventEmitterFn } from "./orchestrator";

/**
 * Property 3 — Primary / aux model isolation (Task 4).
 *
 * Asserts that the brainstorm debate (orchestrator crew members) runs on the
 * pool-backed AUX caller, while the Decision Gate, synthesis and synthesis
 * audit run on the PRIMARY caller. The two callers are physically distinct and
 * injectable, so the test can count which caller each phase used. When the pool
 * env is unset, the aux caller degrades to the primary caller (aux === primary)
 * and the debate is observed on the primary caller.
 *
 * Validates: Requirements 2.1, 2.4, 7.3
 *
 * The network is fully mocked: `callLlmWithPoolKey` is replaced via `vi.mock`
 * (NO real HTTP), while the real `parseKeyPoolFromEnv` / `createLlmKeyPool` keep
 * the round-robin pool behaviour genuine.
 */
vi.mock("../llm-key-pool", async (importActual) => {
  const actual = await importActual<typeof import("../llm-key-pool")>();
  return {
    ...actual,
    // Aux pool always returns a completed crew-member output so the debate can
    // terminate quickly. Tagged so the test can confirm debate ran on the pool.
    callLlmWithPoolKey: vi.fn(
      async () =>
        JSON.stringify({
          content: "AUX crew member analysis",
          confidence: 0.8,
          needsToolCall: false,
        }),
    ),
  };
});

const CREW_PROMPT_MARKER = "Provide your analysis and conclusion.";
const GATE_PROMPT_MARKER = "You are the Decision Gate";
const SYNTHESIS_PROMPT_MARKER = "You are a synthesis engine";
const AUDIT_PROMPT_MARKER = "You are an audit reviewer";

function stubPoolEnv(): void {
  vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", "key-a,key-b,key-c");
  vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL", "https://example.test/v1");
  vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL", "ouyi-5-preview-thinking");
}

/**
 * A primary-model caller spy that routes by prompt type: Decision Gate →
 * brainstormNeeded, synthesis → SynthesisResult, audit → pass verdict. Any
 * other prompt (a crew debate prompt) returns a tagged "PRIMARY" crew output so
 * the test can detect if debate accidentally crossed onto the primary caller.
 */
function makePrimaryCaller(): LLMCallerFn & ReturnType<typeof vi.fn> {
  return vi.fn(async (prompt: string) => {
    if (prompt.includes(GATE_PROMPT_MARKER)) {
      return JSON.stringify({
        brainstormNeeded: true,
        recommendedMode: "discussion",
        requiredRoles: ["planner", "architect"],
        requiredToolCategories: [],
        reasoning: "complex task needs debate",
      });
    }
    if (prompt.includes(SYNTHESIS_PROMPT_MARKER)) {
      return JSON.stringify({
        decision: "Synthesized primary decision",
        confidence: 0.9,
        reasoningPoints: [{ roleId: "planner", point: "A is simpler" }],
        dissentingOpinions: [],
        tokenUsage: 20,
      });
    }
    if (prompt.includes(AUDIT_PROMPT_MARKER)) {
      return JSON.stringify({
        supported: true,
        unsupported: false,
        fabrication: false,
        reasons: ["evidence-backed"],
      });
    }
    // Fallback: a crew debate prompt reaching the primary caller.
    return JSON.stringify({
      content: "PRIMARY crew member analysis",
      confidence: 0.7,
      needsToolCall: false,
    });
  });
}

function makeStageContext(overrides?: Partial<StageContext>): StageContext {
  return {
    jobId: "job-iso",
    stageId: "spec_docs",
    stageDescription: "Design the authentication system",
    degradedBridges: [],
    previousStageOutputs: [],
    ...overrides,
  };
}

describe("Pipeline Integration - primary/aux model isolation (Property 3)", () => {
  const originalEnabled = process.env.BLUEPRINT_BRAINSTORM_ENABLED;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    if (originalEnabled === undefined) {
      delete process.env.BLUEPRINT_BRAINSTORM_ENABLED;
    } else {
      process.env.BLUEPRINT_BRAINSTORM_ENABLED = originalEnabled;
    }
  });

  it("runs debate on the aux pool caller and synthesis/audit on the primary caller", async () => {
    stubPoolEnv();
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";

    const primaryCaller = makePrimaryCaller();
    const emitter: EventEmitterFn = vi.fn();
    const ctx = assembleBrainstormContext(primaryCaller, emitter)!;
    expect(ctx).not.toBeNull();
    // The primary caller is retained on the context for audit use.
    expect(ctx.primaryCaller).toBe(primaryCaller);

    const result = await executeStageWithBrainstorm(
      makeStageContext(),
      ctx,
      primaryCaller,
      emitter,
      vi.fn().mockResolvedValue("single agent fallback"),
    );

    const poolMock = vi.mocked(callLlmWithPoolKey);
    const primaryPrompts = primaryCaller.mock.calls.map((c) => c[0]);

    // Debate ran on the aux pool — not on the primary caller.
    expect(poolMock).toHaveBeenCalled();
    expect(
      primaryPrompts.some((p) => p.includes(CREW_PROMPT_MARKER)),
    ).toBe(false);

    // Decision Gate, synthesis, and audit all ran on the primary caller.
    expect(primaryPrompts.some((p) => p.includes(GATE_PROMPT_MARKER))).toBe(true);
    expect(
      primaryPrompts.some((p) => p.includes(SYNTHESIS_PROMPT_MARKER)),
    ).toBe(true);
    expect(primaryPrompts.some((p) => p.includes(AUDIT_PROMPT_MARKER))).toBe(true);

    // Pool only ever received crew debate prompts (never gate/synthesis/audit).
    const poolPrompts = poolMock.mock.calls.map((c) => c[3] as string);
    expect(
      poolPrompts.every(
        (p) =>
          !p.includes(GATE_PROMPT_MARKER) &&
          !p.includes(SYNTHESIS_PROMPT_MARKER) &&
          !p.includes(AUDIT_PROMPT_MARKER),
      ),
    ).toBe(true);

    expect(result.type).toBe("brainstorm");
    expect(result.output).toBe("Synthesized primary decision");

    ctx.orchestrator.dispose();
  });

  it("degrades aux to the primary caller when the pool env is unset (aux === primary)", async () => {
    // No pool env stubbed → createPoolBackedBrainstormCaller() returns null.
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", "");
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";

    const primaryCaller = makePrimaryCaller();
    const emitter: EventEmitterFn = vi.fn();
    const ctx = assembleBrainstormContext(primaryCaller, emitter)!;

    const result = await executeStageWithBrainstorm(
      makeStageContext(),
      ctx,
      primaryCaller,
      emitter,
      vi.fn().mockResolvedValue("single agent fallback"),
    );

    const poolMock = vi.mocked(callLlmWithPoolKey);
    const primaryPrompts = primaryCaller.mock.calls.map((c) => c[0]);

    // Pool never used; debate fell back onto the primary caller.
    expect(poolMock).not.toHaveBeenCalled();
    expect(primaryPrompts.some((p) => p.includes(CREW_PROMPT_MARKER))).toBe(true);
    // Synthesis and audit still ran on the primary caller.
    expect(
      primaryPrompts.some((p) => p.includes(SYNTHESIS_PROMPT_MARKER)),
    ).toBe(true);
    expect(primaryPrompts.some((p) => p.includes(AUDIT_PROMPT_MARKER))).toBe(true);

    expect(result.type).toBe("brainstorm");

    ctx.orchestrator.dispose();
  });

  it("flags needsReview on the StageResult and records the audit when audit fails", async () => {
    stubPoolEnv();
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";

    const recordCheck = vi.fn();
    const primaryCaller: LLMCallerFn & ReturnType<typeof vi.fn> = vi.fn(
      async (prompt: string) => {
        if (prompt.includes(GATE_PROMPT_MARKER)) {
          return JSON.stringify({
            brainstormNeeded: true,
            recommendedMode: "discussion",
            requiredRoles: ["planner", "architect"],
            requiredToolCategories: [],
            reasoning: "needs debate",
          });
        }
        if (prompt.includes(SYNTHESIS_PROMPT_MARKER)) {
          return JSON.stringify({
            decision: "Shaky decision",
            confidence: 0.4,
            reasoningPoints: [],
            dissentingOpinions: [],
            tokenUsage: 10,
          });
        }
        if (prompt.includes(AUDIT_PROMPT_MARKER)) {
          return JSON.stringify({
            supported: false,
            unsupported: true,
            fabrication: false,
            reasons: ["claim not grounded in crew outputs"],
          });
        }
        return JSON.stringify({
          content: "crew output",
          confidence: 0.6,
          needsToolCall: false,
        });
      },
    );

    const emitter: EventEmitterFn = vi.fn();
    const ctx = assembleBrainstormContext(primaryCaller, emitter)!;
    ctx.checksLedger = { recordCheck };

    const result = await executeStageWithBrainstorm(
      makeStageContext(),
      ctx,
      primaryCaller,
      emitter,
      vi.fn().mockResolvedValue("single agent fallback"),
    );

    expect(result.type).toBe("brainstorm");
    expect(result.needsReview).toBe(true);
    expect(result.auditReasons && result.auditReasons.length).toBeGreaterThan(0);

    // The synthesis audit was written to the checks ledger (warn status).
    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        checkType: "companion_trace",
        checkName: expect.stringMatching(/^brainstorm:synthesis-audit:/),
        status: "warn",
        validator: "brainstorm/synthesis-audit.ts",
      }),
    );

    ctx.orchestrator.dispose();
  });

  it("emits runtime graph decision and edge events around the Decision Gate", async () => {
    stubPoolEnv();
    process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";

    const primaryCaller = makePrimaryCaller();
    const emitter: EventEmitterFn & ReturnType<typeof vi.fn> = vi.fn();
    const ctx = assembleBrainstormContext(primaryCaller, emitter)!;

    const result = await executeStageWithBrainstorm(
      makeStageContext({ jobId: "job-runtime-events" }),
      ctx,
      primaryCaller,
      emitter,
      vi.fn().mockResolvedValue("single agent fallback"),
    );

    expect(result.type).toBe("brainstorm");
    expect(emitter).toHaveBeenCalledWith(
      "decision.marker.emitted",
      expect.objectContaining({
        jobId: "job-runtime-events",
        sessionId: "decision-gate:job-runtime-events:spec_docs",
        stage: "spec_docs",
        marker: "BRANCH",
        roleId: "decision-gate",
      }),
    );
    expect(emitter).toHaveBeenCalledWith(
      "edge.condition.evaluated",
      expect.objectContaining({
        jobId: "job-runtime-events",
        edgeId: "decision-gate:brainstorm",
        condition: "brainstormNeeded === true",
        matched: true,
      }),
    );
    expect(emitter).toHaveBeenCalledWith(
      "edge.triggered",
      expect.objectContaining({
        jobId: "job-runtime-events",
        edgeId: "decision-gate:brainstorm",
        sourceNodeId: "decision-gate",
        targetNodeId: "brainstorm-orchestrator",
      }),
    );

    ctx.orchestrator.dispose();
  });
});
