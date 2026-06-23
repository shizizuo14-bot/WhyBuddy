import { describe, expect, it } from "vitest";

import {
  validatePermissionAuditProductionOwnershipClosure,
  type PermissionAuditProductionOwnershipClosureResult,
} from "../permission/check-engine.js";

// Node test for permission-audit-production-ownership-closure-102.
// Validates consumption of python ownership closure for durable boundary context.
// Confirms node-retained/external for stores, python-owned only for decision slice.
// Covers policy/audit durable at boundary.

describe("permission-audit-production-ownership-closure-102 - node consumption", () => {
  it("validates python ownership closure and no takeover for durable stores", () => {
    const success = validatePermissionAuditProductionOwnershipClosure({
      status: "success",
      contractVersion: "permission-audit.production-ownership-closure.v1",
      provenance: "python-permission-audit-production-ownership-closure-102",
      ok: true,
      productionTakeover: false,
      ownership: {
        policyStore: "node-retained",
        auditDurableStore: "node-retained",
        externalAuditPlatform: "external-owned",
        retention: "node-retained",
        durableDecision: "python-owned",
      },
      nodeBoundaries: { auditDurableStore: "node", policyStore: "node" },
    });
    expect(success.status).toBe("success");
    expect(success.ok).toBe(true);
    expect(success.productionTakeover).toBe(false);
    expect(success.ownership?.auditDurableStore).toBe("node-retained");
    expect(success.ownership?.externalAuditPlatform).toBe("external-owned");
    expect(success.ownership?.durableDecision).toBe("python-owned");
  });

  it("handles failed/degraded/node-fallback", () => {
    const failed = validatePermissionAuditProductionOwnershipClosure({ status: "failed" });
    expect(failed.status).toBe("failed");
    expect(failed.ok).toBe(false);
    expect(failed.productionTakeover).toBe(false);

    const fb = validatePermissionAuditProductionOwnershipClosure(null);
    expect(fb.status).toBe("node-fallback");
    expect(fb.productionTakeover).toBe(false);
  });

  it("ownership distinguishes boundaries and covers audit/policy durable", () => {
    const d = validatePermissionAuditProductionOwnershipClosure({
      status: "success",
      ownership: {
        policyStore: "node-retained",
        auditDurableStore: "node-retained",
        externalAuditPlatform: "external-owned",
        durableDecision: "python-owned",
      },
    });
    expect(d.ownership?.policyStore).toBe("node-retained");
    expect(d.ownership?.auditDurableStore).toBe("node-retained");
  });
});
