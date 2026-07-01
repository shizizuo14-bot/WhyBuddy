import { describe, it, expect } from "vitest";
import {
  buildMiniSession,
  buildStageContext,
  extractUpstreamClaim,
} from "../mini-session.js";
import type { V5SessionState } from "../../../shared/blueprint/v5-reasoning-state.js";
import { GOLDEN_DURABLE_V52_SESSION } from "../../../shared/blueprint/v5-reasoning-state.js";

describe("mini-session (R2)", () => {
  it("extractUpstreamClaim prefers trusted route_options artifacts", () => {
    const state = {
      sessionId: "s1",
      goal: { text: "goal" },
      artifacts: [
        {
          id: "r1",
          kind: "route_options",
          trustLevel: "gated_pass",
          content: "路线 A：RBAC + scoped filter",
        },
        {
          id: "e1",
          kind: "evidence",
          trustLevel: "gated_pass",
          content: "ignored kind",
        },
      ],
    } as any;

    expect(extractUpstreamClaim(state, ["e1", "r1"])).toContain("RBAC");
  });

  it("buildMiniSession creates two-member crew", () => {
    const session = buildMiniSession({
      turnId: "t1",
      challengerRole: "auditor",
      targetRole: "architect",
      stageContext: "ctx",
    });
    expect(session.crewMembers.has("auditor")).toBe(true);
    expect(session.crewMembers.has("architect")).toBe(true);
    expect(session.status).toBe("active");
  });

  it("buildMiniSession supports N-role panel via participants[]", () => {
    const session = buildMiniSession({
      turnId: "panel-1",
      challengerRole: "planner",
      targetRole: "architect",
      participants: ["planner", "architect", "auditor"],
      stageContext: "ctx",
    });
    expect(session.crewMembers.size).toBe(3);
    expect(session.crewMembers.has("planner")).toBe(true);
    expect(session.crewMembers.has("architect")).toBe(true);
    expect(session.crewMembers.has("auditor")).toBe(true);
  });

  it("buildStageContext includes goal and claim", () => {
    const ctx = buildStageContext("权限", "主张 X");
    expect(ctx).toContain("权限");
    expect(ctx).toContain("主张 X");
  });
});

// --- V5 durable session golden fixture TS-side contract consumer (sliderule-python-v52-state-ts-parity-golden-105) ---
// Proves: same golden session shape from shared fixture is accepted by TS V5SessionState blueprint (thin consumer / frontend contract).
// Python owns authoritative durable golden + model; this Vitest only validates contract consumption parity (no Node backend ownership).
describe("V5SessionState durable golden fixture (TS contract consumer)", () => {
  it("reads shared golden and accepts as V5SessionState shape for durable V5.2 session parity", () => {
    // The golden is defined with `satisfies V5SessionState` in blueprint; typed assignment + runtime asserts prove contract acceptance.
    // No `as` cast (which would bypass); Node/TS is thin consumer of the Python-owned durable schema parity fixture.
    const state: V5SessionState = { ...GOLDEN_DURABLE_V52_SESSION };
    expect(state.sessionId).toBe("durable-golden-001");
    expect(state.goal.text).toBe("Prove V5.2 durable state parity");
    expect(state.currentFocus?.artifactId).toBe("art-g1");
    expect(state.userIntervention?.intent).toBe("challenge");
    expect(state.userIntervention?.text).toBe("why this?");
    expect(state.brainstormDegraded).toBe(false);
    expect(state.escalated).toBe(false);
    expect(Array.isArray(state.projectionDirtyNodeIds)).toBe(true);
    expect(state.supersededArtifactIds).toEqual(["art-old-round"]);
    expect(state.capabilityRuns.length).toBe(1);
    expect(state.capabilityRuns[0].timing?.durationMs).toBe(800);
    // key durable fields from full V5SessionState present
    expect(state).toHaveProperty("sessionReplayLog");
    expect(state).toHaveProperty("reasoningEvents");
    expect(state).toHaveProperty("decisionLedger");
    expect(state).toHaveProperty("costLedger");
  });
});
