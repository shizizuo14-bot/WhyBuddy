import { describe, expect, it } from "vitest";

import { getBlueprintProductionOwnershipClosurePython } from "../blueprint/production-ownership-closure-python.js";

describe("Blueprint production ownership closure 102", () => {
  it("defaults no productionTakeover", () => {
    const res = getBlueprintProductionOwnershipClosurePython();
    expect(res.productionTakeover).toBe(false);
    expect(res.ok).toBe(true);
  });

  it("jobStore etc retained", () => {
    const res = getBlueprintProductionOwnershipClosurePython({ area: "jobStore" });
    expect(res.productionTakeover).toBe(false);
  });
});
