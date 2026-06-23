import { describe, expect, it } from "vitest";

import {
  validatePermissionAuditDurableStoreBoundary,
  type PermissionAuditDurableStoreBoundaryResult,
} from "../permission/check-engine.js";

// Node test for permission-audit durable-store-boundary 103.
// Verifies Node bridge consumes Python durable boundary decision.
// Distinguishes python-owned (decision slice), node-retained (durable stores), external-owned (platform).
// Policy store and audit durable store boundaries covered.
// Never promotes hooks/sink/export to durable store ownership.

describe("permission-audit-durable-store-boundary-103 - node bridge", () => {
  function makeDecision(
    overrides: Partial<PermissionAuditDurableStoreBoundaryResult> = {},
  ): PermissionAuditDurableStoreBoundaryResult {
    return {
      status: "python-owned",
      contractVersion: "permission-audit-durable-store-boundary.v1",
      provenance: "python-permission-audit-durable-store-boundary-103",
      ok: true,
      productionTakeover: false,
      ownership: {
        policyStore: "node-retained",
        auditDurableStore: "node-retained",
        externalAuditPlatform: "external-owned",
        retention: "node-retained",
        durableDecision: "python-owned",
      },
      boundaries: {
        durableStoreOwner: "node",
        externalAuditPlatformOwner: "external",
        policyDecisionOwner: "python",
      },
      runtime: { owner: "python", mode: "durable_store_boundary" },
      ...overrides,
    };
  }

  it("validates python-owned decision and node/external boundaries", () => {
    const d = validatePermissionAuditDurableStoreBoundary(makeDecision());
    expect(d.status).toBe("python-owned");
    expect(d.ok).toBe(true);
    expect(d.productionTakeover).toBe(false);
    expect(d.ownership?.auditDurableStore).toBe("node-retained");
    expect(d.ownership?.externalAuditPlatform).toBe("external-owned");
    expect(d.ownership?.durableDecision).toBe("python-owned");
    expect(d.boundaries?.durableStoreOwner).toBe("node");
  });

  it("validates blocked and distinguishes ownerships", () => {
    const blocked = validatePermissionAuditDurableStoreBoundary({ status: "blocked" });
    expect(blocked.status).toBe("blocked");
    expect(blocked.ok).not.toBe(true);
    expect(blocked.productionTakeover).toBe(false);

    const nodeRet = validatePermissionAuditDurableStoreBoundary({
      status: "ready",
      ownership: { policyStore: "node-retained", auditDurableStore: "node-retained", externalAuditPlatform: "external-owned", durableDecision: "python-owned" },
    });
    expect(nodeRet.ownership?.auditDurableStore).toBe("node-retained");
  });

  it("area scoped and real boundary coverage (policy/audit durable)", () => {
    const d = validatePermissionAuditDurableStoreBoundary({
      status: "python-owned",
      ownership: {
        policyStore: "node-retained",
        auditDurableStore: "node-retained",
        externalAuditPlatform: "external-owned",
        durableDecision: "python-owned",
      },
    });
    expect(d.ownership?.policyStore).toBe("node-retained");
    expect(d.ownership?.durableDecision).toBe("python-owned");
    expect(d.ownership?.auditDurableStore).toBe("node-retained");
  });

  it("node bridge decision does not claim durable store or external platform", () => {
    const d = validatePermissionAuditDurableStoreBoundary(makeDecision());
    expect(d.productionTakeover).not.toBe(true);
    expect(d.ownership?.externalAuditPlatform).not.toBe("python-owned");
    expect(d.ownership?.auditDurableStore).not.toBe("python-owned");
  });

  it("degraded/out-of-scope and error stay non-takeover", () => {
    const deg = validatePermissionAuditDurableStoreBoundary({ status: "out-of-scope" });
    expect(deg.status).toBe("out-of-scope");
    expect(deg.productionTakeover).toBe(false);

    const bad = validatePermissionAuditDurableStoreBoundary(null);
    expect(bad.status).toBe("blocked");
    expect(bad.ok).toBe(false);
  });

  it("contract and provenance roundtrip for boundary", () => {
    const raw = {
      status: "python-owned",
      contractVersion: "permission-audit-durable-store-boundary.v1",
      provenance: "python-permission-audit-durable-store-boundary-103",
      ownership: { durableDecision: "python-owned", auditDurableStore: "node-retained" },
    };
    const v = validatePermissionAuditDurableStoreBoundary(raw);
    expect(v.contractVersion).toBe("permission-audit-durable-store-boundary.v1");
    expect(v.provenance).toContain("python-permission-audit-durable-store-boundary-103");
    expect(v.ownership?.durableDecision).toBe("python-owned");
  });
});
