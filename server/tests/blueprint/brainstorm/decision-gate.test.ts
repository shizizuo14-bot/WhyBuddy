/**
 * Unit tests for Decision Gate module.
 *
 * Tests prompt construction, JSON parsing, timeout behavior,
 * degradation state detection, and fallback event emission.
 *
 * Requirements: 1.1, 1.2, 1.5, 1.6
 * @see .kiro/specs/autopilot-multi-agent-brainstorm/design.md §1
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDecisionGatePrompt,
  decide,
  parseDecisionGateResponse,
  type EventEmitterFn,
  type LLMCallerFn,
} from "../../../routes/blueprint/brainstorm/decision-gate";
import type { DecisionGateInput } from "../../../../shared/blueprint/brainstorm-contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<DecisionGateInput> = {}): DecisionGateInput {
  return {
    jobId: "job-123",
    stageId: "stage-planning",
    stageContext: "We need to design a REST API for user management.",
    degradedBridges: [],
    ...overrides,
  };
}

const VALID_LLM_RESPONSE = JSON.stringify({
  brainstormNeeded: true,
  recommendedMode: "discussion",
  requiredRoles: ["planner", "architect"],
  requiredToolCategories: ["mcp", "github"],
  reasoning: "Complex API design benefits from multiple perspectives.",
});

// ---------------------------------------------------------------------------
// buildDecisionGatePrompt
// ---------------------------------------------------------------------------

describe("buildDecisionGatePrompt", () => {
  it("includes job ID, stage ID, and stage context in the prompt", () => {
    const input = makeInput({
      jobId: "job-abc",
      stageId: "stage-design",
      stageContext: "Design a payment gateway integration.",
    });

    const prompt = buildDecisionGatePrompt(input);

    expect(prompt).toContain("Job ID: job-abc");
    expect(prompt).toContain("Stage ID: stage-design");
    expect(prompt).toContain("Design a payment gateway integration.");
  });

  it("includes previous stage outputs when provided", () => {
    const input = makeInput({
      previousStageOutputs: ["Output from stage 1", "Output from stage 2"],
    });

    const prompt = buildDecisionGatePrompt(input);

    expect(prompt).toContain("Previous Stage Outputs:");
    expect(prompt).toContain("Output from stage 1");
    expect(prompt).toContain("Output from stage 2");
  });

  it("omits previous stage outputs section when empty", () => {
    const input = makeInput({ previousStageOutputs: [] });

    const prompt = buildDecisionGatePrompt(input);

    expect(prompt).not.toContain("Previous Stage Outputs:");
  });

  it("includes degradation warning when bridges are degraded", () => {
    const input = makeInput({
      degradedBridges: ["docker-analysis-sandbox", "mcp-github-source"],
    });

    const prompt = buildDecisionGatePrompt(input);

    expect(prompt).toContain("WARNING:");
    expect(prompt).toContain("docker-analysis-sandbox");
    expect(prompt).toContain("mcp-github-source");
    expect(prompt).toContain("biasing toward brainstormNeeded=false");
  });

  it("omits degradation warning when no bridges are degraded", () => {
    const input = makeInput({ degradedBridges: [] });

    const prompt = buildDecisionGatePrompt(input);

    expect(prompt).not.toContain("WARNING:");
  });
});

// ---------------------------------------------------------------------------
// parseDecisionGateResponse
// ---------------------------------------------------------------------------

describe("parseDecisionGateResponse", () => {
  it("parses a valid JSON response into DecisionGateOutput", () => {
    const result = parseDecisionGateResponse(VALID_LLM_RESPONSE);

    expect(result).toEqual({
      brainstormNeeded: true,
      recommendedMode: "discussion",
      requiredRoles: ["planner", "architect"],
      requiredToolCategories: ["mcp", "github"],
      reasoning: "Complex API design benefits from multiple perspectives.",
    });
  });

  it("parses JSON from markdown code block", () => {
    const raw = '```json\n' + VALID_LLM_RESPONSE + '\n```';
    const result = parseDecisionGateResponse(raw);

    expect(result).not.toBeNull();
    expect(result!.brainstormNeeded).toBe(true);
  });

  it("extracts JSON object from surrounding text", () => {
    const raw = 'Here is my decision:\n' + VALID_LLM_RESPONSE + '\nEnd.';
    const result = parseDecisionGateResponse(raw);

    expect(result).not.toBeNull();
    expect(result!.brainstormNeeded).toBe(true);
  });

  it("returns null for completely invalid text", () => {
    const result = parseDecisionGateResponse("This is not JSON at all.");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseDecisionGateResponse("");
    expect(result).toBeNull();
  });

  it("returns null when brainstormNeeded is not boolean", () => {
    const raw = JSON.stringify({
      brainstormNeeded: "yes",
      recommendedMode: "discussion",
      requiredRoles: ["planner"],
      requiredToolCategories: [],
      reasoning: "test",
    });
    expect(parseDecisionGateResponse(raw)).toBeNull();
  });

  it("returns null when recommendedMode is invalid", () => {
    const raw = JSON.stringify({
      brainstormNeeded: true,
      recommendedMode: "invalid_mode",
      requiredRoles: ["planner"],
      requiredToolCategories: [],
      reasoning: "test",
    });
    expect(parseDecisionGateResponse(raw)).toBeNull();
  });

  it("returns null when requiredRoles is empty", () => {
    const raw = JSON.stringify({
      brainstormNeeded: true,
      recommendedMode: "vote",
      requiredRoles: [],
      requiredToolCategories: [],
      reasoning: "test",
    });
    expect(parseDecisionGateResponse(raw)).toBeNull();
  });

  it("returns null when requiredRoles contains only invalid entries", () => {
    const raw = JSON.stringify({
      brainstormNeeded: true,
      recommendedMode: "vote",
      requiredRoles: ["invalid_role_1", "invalid_role_2"],
      requiredToolCategories: [],
      reasoning: "test",
    });
    expect(parseDecisionGateResponse(raw)).toBeNull();
  });

  it("filters out invalid roles but keeps valid ones", () => {
    const raw = JSON.stringify({
      brainstormNeeded: true,
      recommendedMode: "vote",
      requiredRoles: ["planner", "unknown_role", "architect"],
      requiredToolCategories: ["mcp", "invalid_cat"],
      reasoning: "test",
    });
    const result = parseDecisionGateResponse(raw);

    expect(result).not.toBeNull();
    expect(result!.requiredRoles).toEqual(["planner", "architect"]);
    expect(result!.requiredToolCategories).toEqual(["mcp"]);
  });

  it("returns null when reasoning is missing", () => {
    const raw = JSON.stringify({
      brainstormNeeded: true,
      recommendedMode: "discussion",
      requiredRoles: ["planner"],
      requiredToolCategories: [],
    });
    expect(parseDecisionGateResponse(raw)).toBeNull();
  });

  it("returns null for malformed JSON (truncated)", () => {
    const raw = '{"brainstormNeeded": true, "recommended';
    expect(parseDecisionGateResponse(raw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decide — timeout behavior
// ---------------------------------------------------------------------------

describe("decide — timeout behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns fallback when LLM call exceeds timeout", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn((_prompt, options) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(VALID_LLM_RESPONSE), 10_000);
        options?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const input = makeInput();
    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });

    // Advance time past the timeout
    await vi.advanceTimersByTimeAsync(5001);

    const result = await resultPromise;

    expect(result.brainstormNeeded).toBe(false);
    expect(result.reasoning).toContain("fallback");
    expect(mockEmit).toHaveBeenCalledWith(
      "brainstorm.degraded",
      expect.objectContaining({
        reason: expect.stringContaining("timed out"),
        affectedComponent: "decision-gate",
        fallbackAction: "single-agent",
      }),
    );
  });

  it("succeeds when LLM responds within timeout", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn((_prompt, _options) => {
      return new Promise(resolve => {
        setTimeout(() => resolve(VALID_LLM_RESPONSE), 1000);
      });
    });

    const input = makeInput();
    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });

    await vi.advanceTimersByTimeAsync(1001);

    const result = await resultPromise;

    expect(result.brainstormNeeded).toBe(true);
    expect(result.recommendedMode).toBe("discussion");
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// decide — degradation state detection
// ---------------------------------------------------------------------------

describe("decide — degradation state detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("biases brainstormNeeded to false when degraded bridges exist", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => {
      return JSON.stringify({
        brainstormNeeded: true,
        recommendedMode: "vote",
        requiredRoles: ["planner", "architect"],
        requiredToolCategories: ["docker"],
        reasoning: "LLM says brainstorm needed",
      });
    });

    const input = makeInput({
      degradedBridges: ["docker-analysis-sandbox"],
    });

    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    // Even though LLM said true, degradation overrides to false
    expect(result.brainstormNeeded).toBe(false);
    expect(result.reasoning).toContain("Overridden: degraded bridges detected");
    expect(result.reasoning).toContain("docker-analysis-sandbox");
  });

  it("emits degraded event when LLM fails with degraded bridges", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => {
      throw new Error("LLM provider unreachable");
    });

    const input = makeInput({
      degradedBridges: ["mcp-github-source"],
    });

    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.brainstormNeeded).toBe(false);
    expect(mockEmit).toHaveBeenCalledWith(
      "brainstorm.degraded",
      expect.objectContaining({
        reason: expect.stringContaining("degraded mode"),
        affectedComponent: "decision-gate",
        fallbackAction: "single-agent",
      }),
    );
  });

  it("returns fallback when LLM response is unparseable with degraded bridges", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => "garbage response");

    const input = makeInput({
      degradedBridges: ["docker-analysis-sandbox"],
    });

    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.brainstormNeeded).toBe(false);
    expect(mockEmit).toHaveBeenCalledWith(
      "brainstorm.degraded",
      expect.objectContaining({
        reason: expect.stringContaining("failed to parse"),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// decide — normal operation & fallback on error
// ---------------------------------------------------------------------------

describe("decide — normal operation and fallback on error", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns parsed DecisionGateOutput on successful LLM response", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => VALID_LLM_RESPONSE);

    const input = makeInput();
    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result).toEqual({
      brainstormNeeded: true,
      recommendedMode: "discussion",
      requiredRoles: ["planner", "architect"],
      requiredToolCategories: ["mcp", "github"],
      reasoning: "Complex API design benefits from multiple perspectives.",
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("returns fallback and emits degraded event when LLM throws", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => {
      throw new Error("Network error");
    });

    const input = makeInput();
    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.brainstormNeeded).toBe(false);
    expect(result.reasoning).toContain("fallback");
    expect(mockEmit).toHaveBeenCalledWith(
      "brainstorm.degraded",
      expect.objectContaining({
        reason: expect.stringContaining("Network error"),
        affectedComponent: "decision-gate",
        fallbackAction: "single-agent",
      }),
    );
  });

  it("returns fallback and emits degraded event when LLM returns unparseable response", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => "I cannot help with that.");

    const input = makeInput();
    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.brainstormNeeded).toBe(false);
    expect(mockEmit).toHaveBeenCalledWith(
      "brainstorm.degraded",
      expect.objectContaining({
        reason: expect.stringContaining("failed to parse"),
        affectedComponent: "decision-gate",
      }),
    );
  });

  it("passes the prompt to the LLM caller with stage context included", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => VALID_LLM_RESPONSE);

    const input = makeInput({
      stageContext: "Implement a caching layer for the API.",
    });

    const resultPromise = decide(input, mockLLM, mockEmit, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(0);
    await resultPromise;

    expect(mockLLM).toHaveBeenCalledTimes(1);
    const passedPrompt = (mockLLM as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedPrompt).toContain("Implement a caching layer for the API.");
    expect(passedPrompt).toContain("Job ID: job-123");
    expect(passedPrompt).toContain("Stage ID: stage-planning");
  });
});

// ---------------------------------------------------------------------------
// decide — force mode (BLUEPRINT_BRAINSTORM_FORCE)
// ---------------------------------------------------------------------------

describe("decide — force mode", () => {
  it("returns brainstormNeeded=true WITHOUT calling the LLM when config.force is true", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => VALID_LLM_RESPONSE);

    const result = await decide(makeInput(), mockLLM, mockEmit, {
      timeoutMs: 5000,
      force: true,
    });

    expect(result.brainstormNeeded).toBe(true);
    expect(result.requiredRoles).toEqual([
      "decider",
      "planner",
      "architect",
      "executor",
      "auditor",
    ]);
    // Gate LLM is skipped entirely in force mode (saves tokens, guarantees on).
    expect(mockLLM).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(
      "brainstorm.gate.forced",
      expect.objectContaining({ stageId: "stage-planning" }),
    );
  });

  it("forces ON even when capability bridges are degraded", async () => {
    const mockEmit: EventEmitterFn = vi.fn();
    const mockLLM: LLMCallerFn = vi.fn(async () => VALID_LLM_RESPONSE);

    const result = await decide(
      makeInput({ degradedBridges: ["docker", "mcp"] }),
      mockLLM,
      mockEmit,
      { timeoutMs: 5000, force: true },
    );

    expect(result.brainstormNeeded).toBe(true);
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it("reads BLUEPRINT_BRAINSTORM_FORCE from env when config.force is undefined", async () => {
    const prev = process.env.BLUEPRINT_BRAINSTORM_FORCE;
    process.env.BLUEPRINT_BRAINSTORM_FORCE = "true";
    try {
      const mockEmit: EventEmitterFn = vi.fn();
      const mockLLM: LLMCallerFn = vi.fn(async () => VALID_LLM_RESPONSE);

      const result = await decide(makeInput(), mockLLM, mockEmit, {
        timeoutMs: 5000,
      });

      expect(result.brainstormNeeded).toBe(true);
      expect(mockLLM).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.BLUEPRINT_BRAINSTORM_FORCE;
      else process.env.BLUEPRINT_BRAINSTORM_FORCE = prev;
    }
  });
});
