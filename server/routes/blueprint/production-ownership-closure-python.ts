/**
 * Blueprint Production Ownership Closure 102 - Node thin bridge.
 * Mirrors python decision for tests.
 * productionTakeover remains false for retained surfaces.
 */

export const BLUEPRINT_PRODUCTION_OWNERSHIP_CLOSURE_CONTRACT = "blueprint.production-ownership-closure.v1" as const;

export interface BlueprintProductionOwnershipClosure {
  status: string;
  contractVersion: typeof BLUEPRINT_PRODUCTION_OWNERSHIP_CLOSURE_CONTRACT;
  provenance: string;
  productionTakeover: boolean;
  ownership: Record<string, string>;
  ok: boolean;
}

export function getBlueprintProductionOwnershipClosurePython(input?: { area?: string; simulate?: Record<string, unknown> }): BlueprintProductionOwnershipClosure {
  const sim = input?.simulate || {};
  const status = sim.forceFailed ? "failed" : sim.degraded ? "degraded" : "success";
  return {
    status,
    contractVersion: BLUEPRINT_PRODUCTION_OWNERSHIP_CLOSURE_CONTRACT,
    provenance: "node-blueprint-production-ownership-closure-102",
    productionTakeover: false,
    ownership: {
      jobStore: "node-retained",
      eventBus: "node-retained",
      ledger: "node-retained",
      replan: "node-retained",
      promptPackage: "node-retained",
      previewState: "node-retained",
      jobStateSlice: "python-owned",
    },
    ok: status === "success",
  };
}
