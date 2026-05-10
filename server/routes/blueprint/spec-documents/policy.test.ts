import { describe, it, expect, afterEach } from "vitest";
import {
  createDefaultSpecDocumentsLlmPolicy,
  applySpecDocumentsRedaction,
} from "./policy.js";

describe("createDefaultSpecDocumentsLlmPolicy", () => {
  afterEach(() => {
    delete process.env.BLUEPRINT_SPEC_DOCUMENTS_LLM_TIMEOUT_MS;
  });

  it("returns maxInvocationTimeoutMs === 30_000 by default", () => {
    const policy = createDefaultSpecDocumentsLlmPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(30_000);
  });

  it("reads BLUEPRINT_SPEC_DOCUMENTS_LLM_TIMEOUT_MS env var when valid", () => {
    process.env.BLUEPRINT_SPEC_DOCUMENTS_LLM_TIMEOUT_MS = "5000";
    const policy = createDefaultSpecDocumentsLlmPolicy();
    expect(policy.maxInvocationTimeoutMs).toBe(5_000);
  });

  it("falls back to 30_000 for invalid env var values", () => {
    const invalidValues = ["abc", "-1", "99999", "0"];
    for (const val of invalidValues) {
      process.env.BLUEPRINT_SPEC_DOCUMENTS_LLM_TIMEOUT_MS = val;
      const policy = createDefaultSpecDocumentsLlmPolicy();
      expect(policy.maxInvocationTimeoutMs).toBe(30_000);
    }
  });
});

describe("applySpecDocumentsRedaction", () => {
  const policy = createDefaultSpecDocumentsLlmPolicy();

  it("redacts API key patterns from the input string", () => {
    const input = "sk-ABCDEFGHIJKLMNOP1234567890";
    const result = applySpecDocumentsRedaction(input, policy);
    expect(result).not.toContain("sk-ABCDEFGHIJKLMNOP1234567890");
  });

  it("redacts email addresses from the input string", () => {
    const input = "contact alice@example.com";
    const result = applySpecDocumentsRedaction(input, policy);
    expect(result).not.toContain("alice@example.com");
  });

  it("completes redaction of a 5MB string in under 200ms (ReDoS sentinel)", () => {
    const largeInput = "a".repeat(5_000_000);
    const start = performance.now();
    applySpecDocumentsRedaction(largeInput, policy);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
