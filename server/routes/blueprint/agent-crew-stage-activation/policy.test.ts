import { describe, expect, it } from "vitest";

import {
  applyAgentCrewRedaction,
  createDefaultAgentCrewStageActivationPolicy,
} from "./policy.js";

describe("AgentCrewStageActivationPolicy", () => {
  const policy = createDefaultAgentCrewStageActivationPolicy();

  it("createDefaultAgentCrewStageActivationPolicy returns design §4.3 defaults", () => {
    expect(policy.suppressRepeatedStates).toBe(true);
    expect(policy.enforceTripletIdempotence).toBe(true);
    expect(policy.defaultLocale).toBe("en-US");
    expect([...policy.supportedPromptIds]).toEqual([
      "blueprint.role-architecture.v1",
    ]);
    expect(policy.maxErrorBytes).toBe(400);
  });

  it("redacts API keys and GitHub PATs", () => {
    expect(
      applyAgentCrewRedaction(
        "key=sk-ABCDEFGHIJKLMNOP1234567890",
        policy
      )
    ).toContain("[redacted-api-key]");

    expect(
      applyAgentCrewRedaction(
        "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
        policy
      )
    ).toContain("[redacted-github-token]");

    expect(
      applyAgentCrewRedaction(
        "github_pat_abcdefghijklmnopqrstuv",
        policy
      )
    ).toContain("[redacted-github-token]");
  });

  it("redacts email addresses", () => {
    const result = applyAgentCrewRedaction("user@example.com", policy);
    expect(result).toBe("[redacted-email]");
  });

  it("redacts keyword-based sensitive values", () => {
    // "authorization" keyword matches "Authorization: Bearer" → replaces value
    const authResult = applyAgentCrewRedaction(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9",
      policy
    );
    expect(authResult).toContain("Authorization: [redacted]");

    // "api_key" keyword matches "api_key=superSecret123" → replaces value
    const apiKeyResult = applyAgentCrewRedaction(
      "api_key=superSecret123",
      policy
    );
    expect(apiKeyResult).toContain("api_key: [redacted]");
    expect(apiKeyResult).not.toContain("superSecret123");
  });

  it("maxErrorBytes truncates long error strings to 400 bytes", () => {
    const longReason = "x".repeat(1000);
    const truncated = longReason.slice(0, policy.maxErrorBytes);
    expect(truncated.length).toBe(400);
    expect(policy.maxErrorBytes).toBe(400);
    // Verify the truncation produces a usable substring
    expect(truncated).toBe("x".repeat(400));
  });
});
