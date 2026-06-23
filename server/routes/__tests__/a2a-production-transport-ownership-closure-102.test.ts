/**
 * A2A production transport ownership closure 102.
 *
 * Confirms:
 * - productionTakeover is always false
 * - real transports marked node-retained or external-agent-required
 * - sessionStreamSliceDecision may be python-owned as decision surface only
 * - No claim that python owns production session/stream transport
 */

import { describe, expect, it } from "vitest";

import {
  validateA2AProductionTransportOwnership,
  A2A_PRODUCTION_TRANSPORT_OWNERSHIP_CONTRACT_VERSION,
  runA2AProductionTransportOwnership,
} from "../a2a-python-runtime.js";

describe("a2a-production-transport-ownership-closure-102", () => {
  it("defaults no productionTakeover and contract version", () => {
    const res = validateA2AProductionTransportOwnership({});
    expect(res.productionTakeover).toBe(false);
    expect(res.ok).toBe(true);
    expect(res.contractVersion).toBe(A2A_PRODUCTION_TRANSPORT_OWNERSHIP_CONTRACT_VERSION);
  });

  it("marks transport surfaces as node-retained or external", () => {
    const res = validateA2AProductionTransportOwnership({
      productionTakeover: false,
      ownership: {
        realStreamTransport: "node-retained",
        registryMutation: "node-retained",
        externalAgentInvoke: "external-agent-required",
        chatReporting: "node-retained",
      },
    });
    expect(res.productionTakeover).toBe(false);
    expect(res.ownership.realStreamTransport).toBe("node-retained");
    expect(res.ownership.externalAgentInvoke).toBe("external-agent-required");
  });

  it("bridge falls back with retained when python not wired", async () => {
    const res = await runA2AProductionTransportOwnership(undefined as any, {});
    expect(res.productionTakeover).toBe(false);
    expect(res.ownership.realStreamTransport).toBe("node-retained");
  });

  it("python slice decision area is python-owned but does not affect transport", () => {
    const res = validateA2AProductionTransportOwnership({
      ownership: { sessionStreamSliceDecision: "python-owned" },
    });
    expect(res.productionTakeover).toBe(false);
    expect(res.ownership.sessionStreamSliceDecision).toBe("python-owned");
  });
});
