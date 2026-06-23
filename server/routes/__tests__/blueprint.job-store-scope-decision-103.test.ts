import { describe, expect, it } from "vitest";

import {
  getBlueprintJobStoreScopeDecisionPython,
  assertNoProductionTakeoverForRetained,
  computeLocalJobStoreScopeDecision,
  BLUEPRINT_JOB_STORE_SCOPE_DECISION_CONTRACT,
} from "../blueprint/job-store-scope-decision-python.js";

describe("Blueprint job store scope decision 103", () => {
  it("returns stable envelope from bridge", async () => {
    const d = await getBlueprintJobStoreScopeDecisionPython({ area: "all" });
    expect(d.contractVersion).toBe(BLUEPRINT_JOB_STORE_SCOPE_DECISION_CONTRACT);
    expect(d.ok).toBe(true);
    expect(d).toHaveProperty("migrationDenominator");
    expect(d.productionTakeover).toBe(false);
  });

  it("marks jobStore/eventBus/ledger as node-retained with no takeover", async () => {
    for (const area of ["jobStore", "eventBus", "ledger", "replan", "promptPackage", "previewState"]) {
      const d = await getBlueprintJobStoreScopeDecisionPython({ area });
      expect(d.ownership).toBe("node-retained");
      expect(d.productionTakeover).toBe(false);
    }
  });

  it("marks jobStateSlice python-owned but productionTakeover remains false", async () => {
    const d = await getBlueprintJobStoreScopeDecisionPython({ area: "jobStateSlice" });
    expect(d.ownership).toBe("python-owned");
    expect(d.productionTakeover).toBe(false);
  });

  it("node bridge asserts retained areas never produce takeover", async () => {
    const d = await getBlueprintJobStoreScopeDecisionPython({ area: "jobStore" });
    expect(() => assertNoProductionTakeoverForRetained(d)).not.toThrow();
    const bad = { ...d, productionTakeover: true, ownership: "node-retained" as const };
    expect(() => assertNoProductionTakeoverForRetained(bad as any)).toThrow();
  });

  it("simulate all retained forces node retained", async () => {
    const d = computeLocalJobStoreScopeDecision({ area: "jobStateSlice", simulate: { forceNodeRetained: true } });
    expect(d.ownership).toBe("node-retained");
  });

  it("migration denominator is computable", async () => {
    const d = await getBlueprintJobStoreScopeDecisionPython();
    expect(d.migrationDenominator.total).toBeGreaterThanOrEqual(7);
    expect(d.migrationDenominator.nodeRetained).toBeGreaterThan(0);
  });
});
