import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  callPoolJsonLlm,
  resolveSlideRulePoolRaceMode,
  resolveSlideRulePoolTimeoutMs,
  shouldSkipPrimaryForReportWrite,
  shouldSkipPrimaryLlmAfterPoolExhausted,
  resetSlideRuleCapabilityPoolCache,
} from "../pool-json-llm.js";

// `resolveSlideRulePoolRaceMode` falls back to "parallel" ONLY when there is no
// explicit override and no dev proxy is detected. Both inputs come from the
// process env, which on dev machines is polluted by `.env`/shell: an explicit
// SLIDERULE_POOL_RACE_MODE (and its legacy WHYBUDDY_ alias), or a Clash-style
// HTTP(S)_PROXY that trips the proxy auto-detect → "sequential". Clear all of
// them per-test so the default assertion is environment-independent. (Source is
// correct; only the test needed isolation.)
const RACE_MODE_ENV_KEYS = [
  "SLIDERULE_POOL_RACE_MODE",
  "WHYBUDDY_POOL_RACE_MODE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NODE_USE_ENV_PROXY",
];

describe("pool-json-llm tuning", () => {
  beforeEach(() => {
    for (const key of RACE_MODE_ENV_KEYS) vi.stubEnv(key, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSlideRuleCapabilityPoolCache();
  });

  it("defaults race mode to parallel", () => {
    expect(resolveSlideRulePoolRaceMode()).toBe("parallel");
  });

  it("allows the default pool timeout up to 300s", () => {
    expect(resolveSlideRulePoolTimeoutMs(300_000)).toBe(300_000);
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

  it("skips primary for report.write when pool is configured", () => {
    vi.stubEnv("SLIDERULE_CAPABILITY_POOL_ENABLED", "true");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", "k1");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL", "https://example.test/v1");
    resetSlideRuleCapabilityPoolCache();
    expect(shouldSkipPrimaryForReportWrite()).toBe(true);
  });

  it("allows report.write primary when SLIDERULE_REPORT_SKIP_PRIMARY=0", () => {
    vi.stubEnv("SLIDERULE_CAPABILITY_POOL_ENABLED", "true");
    vi.stubEnv("SLIDERULE_REPORT_SKIP_PRIMARY", "0");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", "k1");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL", "https://example.test/v1");
    resetSlideRuleCapabilityPoolCache();
    expect(shouldSkipPrimaryForReportWrite()).toBe(false);
  });

  it("retries an HTTP 200 empty body from the upstream pool provider", async () => {
    vi.stubEnv("SLIDERULE_CAPABILITY_POOL_ENABLED", "true");
    vi.stubEnv("SLIDERULE_POOL_RACE_MODE", "sequential");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", "k1");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_LABELS", "test001");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL", "https://example.test/v1");
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL", "gpt-test");
    resetSlideRuleCapabilityPoolCache();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callPoolJsonLlm<{ ok: boolean }>("system", "user");

    expect(result?.json).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
