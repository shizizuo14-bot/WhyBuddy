import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyRoleCapabilityRedaction,
  createDefaultRoleSystemArchitectureCapabilityPolicy,
} from "./policy.js";

/**
 * Validates: Requirements 2.5, 4.7, 7.4, 9.2
 *
 * ~6 example-based tests covering:
 * - API key and GitHub PAT redaction
 * - Email redaction
 * - Key-value pair redaction (Authorization, api_key)
 * - Default policy values match design §4.3
 * - Env var override for timeout (valid, clamped, invalid)
 * - ReDoS sentinel (5MB plain text within 200ms)
 */
describe("applyRoleCapabilityRedaction", () => {
  const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();

  // 8.1 API keys and GitHub PATs
  it("replaces API keys with [redacted-api-key] and GitHub PATs with [redacted-github-token]", () => {
    // OpenAI-style API key
    const apiKeyInput = "key=sk-ABCDEFGHIJKLMNOP1234567890";
    const apiKeyResult = applyRoleCapabilityRedaction(apiKeyInput, policy);
    expect(apiKeyResult).toContain("[redacted-api-key]");
    expect(apiKeyResult).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");

    // GitHub classic PAT (ghp_ prefix, 40 chars)
    const ghpInput = "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
    const ghpResult = applyRoleCapabilityRedaction(ghpInput, policy);
    expect(ghpResult).toBe("[redacted-github-token]");

    // GitHub fine-grained PAT (github_pat_ prefix)
    const ghPatInput = "github_pat_abcdefghijklmnopqrstuv";
    const ghPatResult = applyRoleCapabilityRedaction(ghPatInput, policy);
    expect(ghPatResult).toBe("[redacted-github-token]");
  });

  // 8.2 Email redaction
  it('redacts email addresses to "[redacted-email]"', () => {
    const result = applyRoleCapabilityRedaction("user@example.com", policy);
    expect(result).toBe("[redacted-email]");
  });

  // 8.3 Key-value pair redaction (Authorization, api_key)
  it("redacts Authorization headers and api_key values", () => {
    const authResult = applyRoleCapabilityRedaction(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9",
      policy,
    );
    expect(authResult).toMatch(/^authorization: \[redacted\]$/i);

    const apiKeyResult = applyRoleCapabilityRedaction(
      "api_key=superSecret123",
      policy,
    );
    expect(apiKeyResult).toMatch(/^api_key: \[redacted\]$/i);
  });
});

describe("createDefaultRoleSystemArchitectureCapabilityPolicy", () => {
  // 8.4 Default values match design §4.3
  it("returns defaults matching design §4.3", () => {
    const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(30_000);
    expect(policy.temperature).toBe(0.2);
    expect(policy.callJsonRetryAttempts).toBe(1);
    expect(policy.maxLogLines).toBe(20);
    expect(policy.maxLogBytes).toBe(4_096);
    expect(policy.maxStructuredPayloadSummaryBytes).toBe(300);
    expect(policy.redactionKeywords).toContain("authorization");
    expect(policy.redactionKeywords).toContain("api_key");
    expect(policy.redactionKeywords).toContain("secret");
    expect(policy.redactedEmailPattern).toBeInstanceOf(RegExp);
    expect(policy.redactedApiKeyPattern).toBeInstanceOf(RegExp);
    expect(policy.redactedGithubPatPattern).toBeInstanceOf(RegExp);
  });

  // 8.5 Env var override for timeout
  describe("BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS override", () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("uses env var value when valid and within bounds", () => {
      vi.stubEnv("BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS", "15000");
      const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();
      expect(policy.maxInvocationTimeoutMs).toBe(15_000);
    });

    it("clamps to MAX (180_000) when env var exceeds maximum", () => {
      vi.stubEnv("BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS", "999999");
      const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();
      expect(policy.maxInvocationTimeoutMs).toBe(180_000);
    });

    it("falls back to 30000 when env var is non-numeric", () => {
      vi.stubEnv("BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS", "abc");
      const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();
      expect(policy.maxInvocationTimeoutMs).toBe(30_000);
    });
  });
});

describe("applyRoleCapabilityRedaction - ReDoS sentinel", () => {
  // 8.6 ReDoS sentinel: 5MB plain text within 200ms
  it("processes 5MB plain text without sensitive markers within 200ms", () => {
    const policy = createDefaultRoleSystemArchitectureCapabilityPolicy();
    // Generate 5MB of plain text with no sensitive markers
    const chunk = "The quick brown fox jumps over the lazy dog. ";
    const fiveMB = chunk.repeat(Math.ceil((5 * 1024 * 1024) / chunk.length));

    const start = performance.now();
    const result = applyRoleCapabilityRedaction(fiveMB, policy);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    // Content should pass through unchanged (no sensitive markers)
    expect(result.length).toBe(fiveMB.length);
  });
});
