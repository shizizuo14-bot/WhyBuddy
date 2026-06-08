import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import {
  assembleBrainstormContext,
  executeStageWithBrainstorm,
  type StageContext,
  type StageResult,
} from "./pipeline-integration";
import type { LLMCallerFn, EventEmitterFn } from "./orchestrator";

/**
 * Property 2 — Graceful degradation never throws (Task 8).
 *
 * For ARBITRARY key-failure combinations — the aux key pool failing on any
 * subset of calls (none / partial / all), the primary caller failing on the
 * Decision Gate / synthesis / audit, the aux caller degrading onto the primary
 * caller (pool unconfigured), and the reasoning-graph projection throwing —
 * `executeStageWithBrainstorm` ALWAYS resolves to a valid `StageResult` (type
 * `single-agent` or `brainstorm`) and NEVER rejects.
 *
 * Validates: Requirements 1.4, 6.1, 7.2
 *
 * The network is fully mocked. `callLlmWithPoolKey` (the aux pool transport) is
 * driven by a hoisted controller so the test can fail arbitrary subsets of pool
 * calls without any real HTTP. `emitReasoningGraphArtifact` is mocked so the
 * projection-throws branch can be exercised; the real emitter's own no-throw
 * guarantee is proven separately in `reasoning-graph-emitter.test.ts`.
 */

// Hoisted controllers shared with the vi.mock factories (vi.mock is hoisted
// above normal top-level declarations, so the mutable state must be too).
const poolCtl = vi.hoisted(() => ({ counter: 0, mask: [] as boolean[] }));
const projectionCtl = vi.hoisted(() => ({ throws: false }));

vi.mock("../llm-key-pool", async (importActual) => {
  const actual = await importActual<typeof import("../llm-key-pool")>();
  return {
    ...actual,
    // Aux pool transport: fails on call `i` when `mask[i % mask.length]` is set,
    // otherwise returns a parseable completed crew-member output.
    callLlmWithPoolKey: vi.fn(async () => {
      const index = poolCtl.counter++;
      const shouldFail =
        poolCtl.mask.length > 0 && poolCtl.mask[index % poolCtl.mask.length];
      if (shouldFail) {
        throw new Error("aux pool key failure (503 / timeout)");
      }
      return JSON.stringify({
        content: "AUX crew member analysis",
        confidence: 0.7,
        needsToolCall: false,
      });
    }),
  };
});

vi.mock("./reasoning-graph-emitter", () => ({
  emitReasoningGraphArtifact: vi.fn(() => {
    if (projectionCtl.throws) {
      throw new Error("projection boom");
    }
  }),
}));

const GATE_MARKER = "You are the Decision Gate";
const SYNTHESIS_MARKER = "You are a synthesis engine";
const AUDIT_MARKER = "You are an audit reviewer";

interface PrimaryFlags {
  gateNeeded: boolean;
  gateFails: boolean;
  synthesisFails: boolean;
  auditFails: boolean;
  primaryDebateFails: boolean;
}

/**
 * A primary-model caller that routes by prompt marker and optionally throws on
 * each phase. When the pool is unconfigured the aux caller degrades to this
 * caller, so crew-debate prompts may also arrive here (controlled by
 * `primaryDebateFails`).
 */
function makePrimaryCaller(flags: PrimaryFlags): LLMCallerFn {
  return vi.fn(async (prompt: string) => {
    if (prompt.includes(GATE_MARKER)) {
      if (flags.gateFails) throw new Error("gate caller failure");
      return JSON.stringify({
        brainstormNeeded: flags.gateNeeded,
        recommendedMode: "discussion",
        requiredRoles: ["planner", "architect"],
        requiredToolCategories: [],
        reasoning: "fuzzed decision",
      });
    }
    if (prompt.includes(SYNTHESIS_MARKER)) {
      if (flags.synthesisFails) throw new Error("synthesis caller failure");
      return JSON.stringify({
        decision: "Synthesized decision",
        confidence: 0.8,
        reasoningPoints: [],
        dissentingOpinions: [],
        tokenUsage: 12,
      });
    }
    if (prompt.includes(AUDIT_MARKER)) {
      if (flags.auditFails) throw new Error("audit caller failure");
      return JSON.stringify({
        supported: true,
        unsupported: false,
        fabrication: false,
        reasons: ["evidence-backed"],
      });
    }
    // Crew debate prompt reaching the primary caller (aux degraded to primary).
    if (flags.primaryDebateFails) throw new Error("primary debate failure");
    return JSON.stringify({
      content: "PRIMARY crew member analysis",
      confidence: 0.6,
      needsToolCall: false,
    });
  });
}

function makeStageContext(): StageContext {
  return {
    jobId: "job-degrade",
    stageId: "spec_docs",
    stageDescription: "Design the authentication system",
    degradedBridges: [],
    previousStageOutputs: [],
  };
}

const POOL_ENV_KEYS = [
  "BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS",
  "BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL",
  "BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL",
] as const;

function setPoolEnv(configured: boolean): void {
  if (configured) {
    process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS = "key-a,key-b,key-c";
    process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL = "https://example.test/v1";
    process.env.BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL = "ouyi-5-preview-thinking";
  } else {
    for (const key of POOL_ENV_KEYS) delete process.env[key];
  }
}

describe("executeStageWithBrainstorm — Property 2: degradation never throws", () => {
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of [...POOL_ENV_KEYS, "BLUEPRINT_BRAINSTORM_ENABLED"]) {
    savedEnv[key] = process.env[key];
  }

  afterEach(() => {
    vi.clearAllMocks();
    poolCtl.counter = 0;
    poolCtl.mask = [];
    projectionCtl.throws = false;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("always resolves to a StageResult across arbitrary key-failure combinations (Validates: Requirements 1.4, 6.1, 7.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          poolConfigured: fc.boolean(),
          // Cycled failure mask for aux pool calls: [], all-true (all-fail),
          // mixed (partial), all-false (none) are all reachable.
          poolFailMask: fc.array(fc.boolean(), { minLength: 0, maxLength: 6 }),
          gateNeeded: fc.boolean(),
          gateFails: fc.boolean(),
          synthesisFails: fc.boolean(),
          auditFails: fc.boolean(),
          primaryDebateFails: fc.boolean(),
          projectionThrows: fc.boolean(),
        }),
        async (cfg) => {
          // Reset per-run controllers and env.
          poolCtl.counter = 0;
          poolCtl.mask = cfg.poolFailMask;
          projectionCtl.throws = cfg.projectionThrows;
          process.env.BLUEPRINT_BRAINSTORM_ENABLED = "true";
          setPoolEnv(cfg.poolConfigured);

          const primaryCaller = makePrimaryCaller({
            gateNeeded: cfg.gateNeeded,
            gateFails: cfg.gateFails,
            synthesisFails: cfg.synthesisFails,
            auditFails: cfg.auditFails,
            primaryDebateFails: cfg.primaryDebateFails,
          });
          const emitter: EventEmitterFn = vi.fn();

          const ctx = assembleBrainstormContext(primaryCaller, emitter)!;
          expect(ctx).not.toBeNull();

          let result: StageResult | undefined;
          try {
            // The single-agent fallback is the reliable deterministic path —
            // it must never throw (mirrors `generateSpecDocuments`). The
            // property is that brainstorm-layer failures degrade onto it.
            result = await executeStageWithBrainstorm(
              makeStageContext(),
              ctx,
              primaryCaller,
              emitter,
              async () => "deterministic single-agent output",
            );
          } finally {
            ctx.orchestrator.dispose();
          }

          // Never rejected; always a structurally valid StageResult.
          expect(result).toBeDefined();
          expect(["single-agent", "brainstorm"]).toContain(result!.type);
          expect(typeof result!.output).toBe("string");
        },
      ),
      { numRuns: 60 },
    );
  });
});
