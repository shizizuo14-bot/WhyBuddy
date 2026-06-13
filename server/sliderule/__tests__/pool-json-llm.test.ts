import { describe, it, expect, afterEach, vi } from "vitest";
import {
  resolveSlideRulePoolRaceMode,
  resolveSlideRulePoolTimeoutMs,
  shouldSkipPrimaryLlmAfterPoolExhausted,
  resetSlideRuleCapabilityPoolCache,
} from "../pool-json-llm.js";

describe("pool-json-llm tuning", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetSlideRuleCapabilityPoolCache();
  });

  it("defaults race mode to parallel", () => {
    expect(resolveSlideRulePoolRaceMode()).toBe("parallel");
  });

  it("caps default pool timeout at 90s", () => {
    expect(resolveSlideRulePoolTimeoutMs(300_000)).toBe(90_000);
  });

  it("honors SLIDERULE_POOL_TIMEOUT_MS override", () => {
    vi.stubEnv("SLIDERULE_POOL_TIMEOUT_MS", "45000");
    expect(resolveSlideRulePoolTimeoutMs(300_000)).toBe(45_000);
  });

  it("skips primary after pool when enabled and pool configured", () => {
    vi.stubEnv("SLIDERULE_CAPABILITY_POOL_ENABLED", "true");
    vi.stubEnv(
      "BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS",
      "k1,k2"
    );
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL", "https://example.test/v1");
    resetSlideRuleCapabilityPoolCache();
    expect(shouldSkipPrimaryLlmAfterPoolExhausted()).toBe(true);
  });
});