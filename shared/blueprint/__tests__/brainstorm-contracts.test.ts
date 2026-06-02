import { describe, expect, it } from "vitest";

import type {
  CollaborationMode,
  BrainstormRoleId,
  ToolCategory,
  BranchNodeType,
  BranchNodeStatus,
  CrewMemberState,
} from "../brainstorm-contracts.js";

import { resolveBrainstormRuntimeConfig } from "../../../server/routes/blueprint/runtime-enablement/resolver.js";

/**
 * Unit tests for brainstorm shared contracts type validation and runtime config.
 *
 * 1. Type exhaustiveness: verifies all type union members are accounted for.
 * 2. resolveBrainstormRuntimeConfig: verifies default/custom/invalid env parsing.
 *
 * Validates: Requirements 1.2, 3.6
 */

// ---------------------------------------------------------------------------
// Type Exhaustiveness Helpers
// ---------------------------------------------------------------------------

/**
 * A compile-time exhaustiveness check helper. If the union is not fully covered,
 * TypeScript will flag an error at the `_exhaustive` assignment.
 */
function assertNever(_value: never): never {
  throw new Error(`Unexpected value: ${_value}`);
}

// ---------------------------------------------------------------------------
// 1. Type Exhaustiveness Tests
// ---------------------------------------------------------------------------

describe("brainstorm-contracts type exhaustiveness", () => {
  it("CollaborationMode covers all 4 members", () => {
    const modes: CollaborationMode[] = ["discussion", "vote", "division", "audit"];
    expect(modes).toHaveLength(4);

    // Compile-time exhaustiveness: if a new member is added this will error
    for (const mode of modes) {
      switch (mode) {
        case "discussion":
        case "vote":
        case "division":
        case "audit":
          break;
        default:
          assertNever(mode);
      }
    }
  });

  it("BrainstormRoleId covers all 6 members", () => {
    const roles: BrainstormRoleId[] = [
      "decider",
      "planner",
      "architect",
      "executor",
      "auditor",
      "ui_previewer",
    ];
    expect(roles).toHaveLength(6);

    for (const role of roles) {
      switch (role) {
        case "decider":
        case "planner":
        case "architect":
        case "executor":
        case "auditor":
        case "ui_previewer":
          break;
        default:
          assertNever(role);
      }
    }
  });

  it("ToolCategory covers all 4 members", () => {
    const categories: ToolCategory[] = ["docker", "mcp", "github", "skills"];
    expect(categories).toHaveLength(4);

    for (const cat of categories) {
      switch (cat) {
        case "docker":
        case "mcp":
        case "github":
        case "skills":
          break;
        default:
          assertNever(cat);
      }
    }
  });

  it("BranchNodeType covers all 6 members", () => {
    const types: BranchNodeType[] = [
      "decision",
      "thinking",
      "action",
      "observation",
      "synthesis",
      "error",
    ];
    expect(types).toHaveLength(6);

    for (const t of types) {
      switch (t) {
        case "decision":
        case "thinking":
        case "action":
        case "observation":
        case "synthesis":
        case "error":
          break;
        default:
          assertNever(t);
      }
    }
  });

  it("BranchNodeStatus covers all 4 members", () => {
    const statuses: BranchNodeStatus[] = ["pending", "active", "completed", "failed"];
    expect(statuses).toHaveLength(4);

    for (const s of statuses) {
      switch (s) {
        case "pending":
        case "active":
        case "completed":
        case "failed":
          break;
        default:
          assertNever(s);
      }
    }
  });

  it("CrewMemberState covers all 6 members", () => {
    const states: CrewMemberState[] = [
      "idle",
      "thinking",
      "acting",
      "observing",
      "completed",
      "failed",
    ];
    expect(states).toHaveLength(6);

    for (const s of states) {
      switch (s) {
        case "idle":
        case "thinking":
        case "acting":
        case "observing":
        case "completed":
        case "failed":
          break;
        default:
          assertNever(s);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. resolveBrainstormRuntimeConfig Tests
// ---------------------------------------------------------------------------

describe("resolveBrainstormRuntimeConfig", () => {
  it("returns defaults when env vars are not set", () => {
    const config = resolveBrainstormRuntimeConfig({});

    expect(config.maxTokens).toBe(50_000);
    expect(config.maxToolCalls).toBe(20);
    expect(config.sessionTimeoutMs).toBe(120_000);
    expect(config.decisionGateTimeoutMs).toBe(5_000);
    expect(config.enabled).toBe(false);
  });

  it("returns custom values when env vars are set", () => {
    const env: NodeJS.ProcessEnv = {
      BRAINSTORM_MAX_TOKENS: "100000",
      BRAINSTORM_MAX_TOOL_CALLS: "50",
      BRAINSTORM_SESSION_TIMEOUT_MS: "300000",
      BRAINSTORM_DECISION_GATE_TIMEOUT_MS: "10000",
      BLUEPRINT_BRAINSTORM_ENABLED: "true",
    };

    const config = resolveBrainstormRuntimeConfig(env);

    expect(config.maxTokens).toBe(100_000);
    expect(config.maxToolCalls).toBe(50);
    expect(config.sessionTimeoutMs).toBe(300_000);
    expect(config.decisionGateTimeoutMs).toBe(10_000);
    expect(config.enabled).toBe(true);
  });

  it("falls back to defaults for invalid (non-numeric) values", () => {
    const env: NodeJS.ProcessEnv = {
      BRAINSTORM_MAX_TOKENS: "not_a_number",
      BRAINSTORM_MAX_TOOL_CALLS: "abc",
      BRAINSTORM_SESSION_TIMEOUT_MS: "xyz",
      BRAINSTORM_DECISION_GATE_TIMEOUT_MS: "!!",
      BLUEPRINT_BRAINSTORM_ENABLED: "maybe",
    };

    const config = resolveBrainstormRuntimeConfig(env);

    expect(config.maxTokens).toBe(50_000);
    expect(config.maxToolCalls).toBe(20);
    expect(config.sessionTimeoutMs).toBe(120_000);
    expect(config.decisionGateTimeoutMs).toBe(5_000);
    // "maybe" !== "true", so enabled is false
    expect(config.enabled).toBe(false);
  });

  it("falls back to defaults for negative numbers", () => {
    const env: NodeJS.ProcessEnv = {
      BRAINSTORM_MAX_TOKENS: "-100",
      BRAINSTORM_MAX_TOOL_CALLS: "-5",
      BRAINSTORM_SESSION_TIMEOUT_MS: "-1",
      BRAINSTORM_DECISION_GATE_TIMEOUT_MS: "-500",
    };

    const config = resolveBrainstormRuntimeConfig(env);

    expect(config.maxTokens).toBe(50_000);
    expect(config.maxToolCalls).toBe(20);
    expect(config.sessionTimeoutMs).toBe(120_000);
    expect(config.decisionGateTimeoutMs).toBe(5_000);
  });

  it("falls back to defaults for values below minimum thresholds", () => {
    const env: NodeJS.ProcessEnv = {
      // maxTokens minimum is 1, maxToolCalls minimum is 1
      BRAINSTORM_MAX_TOKENS: "0",
      BRAINSTORM_MAX_TOOL_CALLS: "0",
      // sessionTimeoutMs minimum is 1000, decisionGateTimeoutMs minimum is 1000
      BRAINSTORM_SESSION_TIMEOUT_MS: "500",
      BRAINSTORM_DECISION_GATE_TIMEOUT_MS: "999",
    };

    const config = resolveBrainstormRuntimeConfig(env);

    // 0 < 1 (minimum), so falls back to default
    expect(config.maxTokens).toBe(50_000);
    expect(config.maxToolCalls).toBe(20);
    // 500 < 1000 (minimum), so falls back to default
    expect(config.sessionTimeoutMs).toBe(120_000);
    // 999 < 1000 (minimum), so falls back to default
    expect(config.decisionGateTimeoutMs).toBe(5_000);
  });

  it("treats empty strings as unset (falls back to defaults)", () => {
    const env: NodeJS.ProcessEnv = {
      BRAINSTORM_MAX_TOKENS: "",
      BRAINSTORM_MAX_TOOL_CALLS: "",
      BRAINSTORM_SESSION_TIMEOUT_MS: "",
      BRAINSTORM_DECISION_GATE_TIMEOUT_MS: "",
      BLUEPRINT_BRAINSTORM_ENABLED: "",
    };

    const config = resolveBrainstormRuntimeConfig(env);

    expect(config.maxTokens).toBe(50_000);
    expect(config.maxToolCalls).toBe(20);
    expect(config.sessionTimeoutMs).toBe(120_000);
    expect(config.decisionGateTimeoutMs).toBe(5_000);
    expect(config.enabled).toBe(false);
  });

  it("enabled is strictly true only when env is exactly 'true'", () => {
    expect(resolveBrainstormRuntimeConfig({ BLUEPRINT_BRAINSTORM_ENABLED: "true" }).enabled).toBe(true);
    expect(resolveBrainstormRuntimeConfig({ BLUEPRINT_BRAINSTORM_ENABLED: "TRUE" }).enabled).toBe(false);
    expect(resolveBrainstormRuntimeConfig({ BLUEPRINT_BRAINSTORM_ENABLED: "1" }).enabled).toBe(false);
    expect(resolveBrainstormRuntimeConfig({ BLUEPRINT_BRAINSTORM_ENABLED: "yes" }).enabled).toBe(false);
    expect(resolveBrainstormRuntimeConfig({ BLUEPRINT_BRAINSTORM_ENABLED: "false" }).enabled).toBe(false);
    expect(resolveBrainstormRuntimeConfig({}).enabled).toBe(false);
  });

  it("truncates decimal values to integer (floor)", () => {
    const env: NodeJS.ProcessEnv = {
      BRAINSTORM_MAX_TOKENS: "75000.9",
      BRAINSTORM_MAX_TOOL_CALLS: "30.5",
    };

    const config = resolveBrainstormRuntimeConfig(env);

    // parseInt("75000.9", 10) === 75000
    expect(config.maxTokens).toBe(75_000);
    // parseInt("30.5", 10) === 30
    expect(config.maxToolCalls).toBe(30);
  });
});
