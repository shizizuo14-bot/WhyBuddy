/**
 * Second-Stage Brainstorm Companion — wiring unit tests.
 *
 * Task 6 of `autopilot-brainstorm-companion-runtime` (conservative / side-channel).
 *
 * Proves the wiring contract:
 *  (a) flag OFF → the second-stage path does NOT assemble/trigger brainstorm
 *      (`executeStageWithBrainstorm` is never invoked).
 *  (b) flag ON (+ per-stage config + context present) → `executeStageWithBrainstorm`
 *      is invoked exactly once at the second stage (`spec_docs`), with an empty
 *      single-agent fallback so the deterministic output is never replaced.
 *  (c) the companion never throws and never blocks (best-effort, Req 6.2).
 *
 * @see .kiro/specs/autopilot-brainstorm-companion-runtime/design.md §"4. 第二阶段接线"
 * Requirements: 4.1, 4.2, 4.3, 4.4, 6.2
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the pipeline-integration module so we can spy on executeStageWithBrainstorm
// while keeping the real isStageEnabled gating (stage-config is NOT mocked).
vi.mock("../../../routes/blueprint/brainstorm/pipeline-integration.js", () => ({
  executeStageWithBrainstorm: vi.fn(
    async (
      _stageCtx: unknown,
      _ctx: unknown,
      _llmCaller: unknown,
      _emit: unknown,
      fallback: (ctx: unknown) => Promise<string>,
    ) => {
      // Exercise the supplied fallback to assert it is the conservative empty one.
      const fb = await fallback(_stageCtx);
      return { type: "brainstorm", output: "synthesis-decision", _fallback: fb };
    },
  ),
}));

import { runSecondStageBrainstormCompanion } from "../../../routes/blueprint/brainstorm/second-stage-companion.js";
import { executeStageWithBrainstorm } from "../../../routes/blueprint/brainstorm/pipeline-integration.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOptions(
  overrides: Record<string, unknown> = {},
): Parameters<typeof runSecondStageBrainstormCompanion>[0] {
  return {
    // A minimal enabled context is enough — the orchestrator is never reached
    // because executeStageWithBrainstorm is mocked.
    brainstormContext: { enabled: true } as never,
    llm: { callJson: vi.fn(async () => ({ content: "{}" })) },
    eventBus: { emit: vi.fn() },
    logger: { warn: vi.fn(), debug: vi.fn() },
    jobId: "job-1",
    stageDescription: "Generate SPEC requirements, design, and task documents.",
    ...overrides,
  } as Parameters<typeof runSecondStageBrainstormCompanion>[0];
}

const ENABLED = "BLUEPRINT_BRAINSTORM_ENABLED";
const PER_STAGE = "BRAINSTORM_STAGE_SPEC_DOCS_ENABLED";

describe("runSecondStageBrainstormCompanion (Task 6 wiring)", () => {
  let savedEnabled: string | undefined;
  let savedPerStage: string | undefined;

  beforeEach(() => {
    savedEnabled = process.env[ENABLED];
    savedPerStage = process.env[PER_STAGE];
    vi.mocked(executeStageWithBrainstorm).mockClear();
  });

  afterEach(() => {
    if (savedEnabled === undefined) delete process.env[ENABLED];
    else process.env[ENABLED] = savedEnabled;
    if (savedPerStage === undefined) delete process.env[PER_STAGE];
    else process.env[PER_STAGE] = savedPerStage;
  });

  // (a) flag OFF → no trigger
  it("does NOT trigger when BLUEPRINT_BRAINSTORM_ENABLED is off (even if per-stage is on)", async () => {
    delete process.env[ENABLED];
    process.env[PER_STAGE] = "true";

    const result = await runSecondStageBrainstormCompanion(makeOptions());

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("stage-disabled");
    expect(executeStageWithBrainstorm).not.toHaveBeenCalled();
  });

  it("does NOT trigger when the per-stage flag is off (master on)", async () => {
    process.env[ENABLED] = "true";
    delete process.env[PER_STAGE];

    const result = await runSecondStageBrainstormCompanion(makeOptions());

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("stage-disabled");
    expect(executeStageWithBrainstorm).not.toHaveBeenCalled();
  });

  it("does NOT trigger when the brainstorm context is absent (e.g. BUILD_TARGET=test)", async () => {
    process.env[ENABLED] = "true";
    process.env[PER_STAGE] = "true";

    const result = await runSecondStageBrainstormCompanion(
      makeOptions({ brainstormContext: null }),
    );

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("no-context");
    expect(executeStageWithBrainstorm).not.toHaveBeenCalled();
  });

  // (b) flag ON → triggers at the second stage
  it("invokes executeStageWithBrainstorm once at the spec_docs stage when flags are on", async () => {
    process.env[ENABLED] = "true";
    process.env[PER_STAGE] = "true";

    const result = await runSecondStageBrainstormCompanion(makeOptions());

    expect(result.triggered).toBe(true);
    expect(executeStageWithBrainstorm).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(executeStageWithBrainstorm).mock.calls[0];
    const stageCtx = callArgs[0] as { stageId: string };
    expect(stageCtx.stageId).toBe("spec_docs");
  });

  it("passes a CONSERVATIVE empty single-agent fallback (deterministic output is never replaced)", async () => {
    process.env[ENABLED] = "true";
    process.env[PER_STAGE] = "true";

    const result = await runSecondStageBrainstormCompanion(makeOptions());

    // The mock invoked the supplied fallback and echoed its return value.
    expect(result.triggered).toBe(true);
    expect(
      (result.stageResult as { _fallback?: string } | undefined)?._fallback,
    ).toBe("");
  });

  // (c) best-effort: never throws / never blocks
  it("never throws when executeStageWithBrainstorm rejects (best-effort degradation)", async () => {
    process.env[ENABLED] = "true";
    process.env[PER_STAGE] = "true";
    vi.mocked(executeStageWithBrainstorm).mockRejectedValueOnce(
      new Error("boom"),
    );
    const logger = { warn: vi.fn(), debug: vi.fn() };

    const result = await runSecondStageBrainstormCompanion(
      makeOptions({ logger }),
    );

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("error");
    expect(logger.warn).toHaveBeenCalled();
  });
});
