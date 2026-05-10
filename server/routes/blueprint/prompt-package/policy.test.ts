/**
 * Unit tests for PromptPackageLlmPolicy + applyPromptPackageRedaction
 * (autopilot-prompt-package-llm, task 2).
 *
 * Validates the policy contract + redaction behavior documented in:
 *   - requirements.md 4.1, 9.8
 *   - design.md §4.3
 *   - tasks.md 2.1–2.6
 *
 * Every test case is example-based (no PBT in this spec per requirement 9.3).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPromptPackageRedaction,
  createDefaultPromptPackageLlmPolicy,
  type PromptPackageLlmPolicy,
} from "./policy.js";

describe("createDefaultPromptPackageLlmPolicy defaults (task 2.1)", () => {
  it("returns maxInvocationTimeoutMs === 30_000 by default", () => {
    vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS", "");
    const policy = createDefaultPromptPackageLlmPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(30_000);
    vi.unstubAllEnvs();
  });
});

describe("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS override (task 2.2)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honors a legal override value", () => {
    vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS", "5000");
    const policy = createDefaultPromptPackageLlmPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(5_000);
  });
});

describe("illegal env var values fall back to 30_000 (task 2.3)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to 30_000 for non-numeric value 'abc'", () => {
    vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS", "abc");
    expect(
      createDefaultPromptPackageLlmPolicy().maxInvocationTimeoutMs,
    ).toBe(30_000);
  });

  it("falls back to 30_000 for negative value '-1'", () => {
    vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS", "-1");
    expect(
      createDefaultPromptPackageLlmPolicy().maxInvocationTimeoutMs,
    ).toBe(30_000);
  });

  it("falls back to 30_000 for over-ceiling value '99999'", () => {
    vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS", "99999");
    expect(
      createDefaultPromptPackageLlmPolicy().maxInvocationTimeoutMs,
    ).toBe(30_000);
  });

  it("falls back to 30_000 for zero value '0'", () => {
    vi.stubEnv("BLUEPRINT_PROMPT_PACKAGE_LLM_TIMEOUT_MS", "0");
    expect(
      createDefaultPromptPackageLlmPolicy().maxInvocationTimeoutMs,
    ).toBe(30_000);
  });
});

describe("applyPromptPackageRedaction — API keys and GitHub PATs (task 2.4)", () => {
  const policy: PromptPackageLlmPolicy =
    createDefaultPromptPackageLlmPolicy();

  it("redacts OpenAI-style sk-* API key", () => {
    const input = "sk-ABCDEFGHIJKLMNOP1234567890";
    const output = applyPromptPackageRedaction(input, policy);
    expect(output).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
    expect(output).toContain("[redacted-api-key]");
  });

  it("redacts classic GitHub PAT ghp_*", () => {
    const input = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    const output = applyPromptPackageRedaction(input, policy);
    expect(output).not.toContain(
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    );
    expect(output).toContain("[redacted-github-token]");
  });
});

describe("applyPromptPackageRedaction — emails and Authorization headers (task 2.5)", () => {
  const policy: PromptPackageLlmPolicy =
    createDefaultPromptPackageLlmPolicy();

  it("redacts email addresses", () => {
    const input = "contact alice@example.com";
    const output = applyPromptPackageRedaction(input, policy);
    expect(output).not.toContain("alice@example.com");
    expect(output).toContain("[redacted-email]");
  });

  it("redacts Authorization: Bearer header", () => {
    const input = "Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxx";
    const output = applyPromptPackageRedaction(input, policy);
    expect(output).not.toContain("Bearer sk-xxxxxxxxxxxxxxxxxxxx");
  });
});

describe("ReDoS sentinel (task 2.6)", () => {
  it("redacts a 5MB string in under 200ms", () => {
    const policy = createDefaultPromptPackageLlmPolicy();
    const input = "a".repeat(5_000_000);

    const start = performance.now();
    applyPromptPackageRedaction(input, policy);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});
