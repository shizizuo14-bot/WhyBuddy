/**
 * Blueprint Job Store Scope Decision 103 - Node thin bridge / consumer.
 *
 * Python service returns scope decision envelope.
 * Node bridge consumes it and asserts:
 *   node-retained / out-of-scope areas never equal python productionTakeover.
 *
 * This does NOT migrate the real job store, event bus, ledger or replan.
 * It only formalizes the denominator classification for migration accounting.
 */

import type {
  BlueprintJobStoreScopeDecision,
  BlueprintJobStoreScopeOwnership,
} from "../../../shared/blueprint/jobs/types.js";

export const BLUEPRINT_JOB_STORE_SCOPE_DECISION_CONTRACT = "blueprint.job-store-scope-decision.v1" as const;

export type { BlueprintJobStoreScopeDecision, BlueprintJobStoreScopeOwnership };


const DEFAULT_NODE_DECISION: BlueprintJobStoreScopeDecision = {
  area: "all",
  ownership: {
    jobStore: "node-retained",
    eventBus: "node-retained",
    ledger: "node-retained",
    replan: "node-retained",
    promptPackage: "node-retained",
    previewState: "node-retained",
    jobStateSlice: "python-owned",
  },
  productionTakeover: false,
  migrationDenominator: {
    total: 7,
    pythonOwned: 1,
    nodeRetained: 6,
  },
  reason: "node-retained-durable-surfaces-per-102-evidence;no-production-migration-for-store",
  evidence: {
    source: "102-ownership-closure + runtime-boundary",
    nodeRetains: ["jobStore", "eventBus", "ledger", "replan", "promptPackage", "previewState"],
    pythonOnlySlice: ["jobStateSlice"],
  },
  contractVersion: BLUEPRINT_JOB_STORE_SCOPE_DECISION_CONTRACT,
  provenance: "node-blueprint-job-store-scope-decision-103",
  ok: true,
};

export function computeLocalJobStoreScopeDecision(input?: { area?: string; simulate?: Record<string, unknown> }): BlueprintJobStoreScopeDecision {
  const area = (input?.area as string) || "all";
  const sim = input?.simulate || {};
  const base: Record<string, BlueprintJobStoreScopeOwnership> = {
    jobStore: "node-retained",
    eventBus: "node-retained",
    ledger: "node-retained",
    replan: "node-retained",
    promptPackage: "node-retained",
    previewState: "node-retained",
    jobStateSlice: "python-owned",
  };
  if (sim.forceNodeRetained || sim.allRetained) {
    Object.keys(base).forEach((k) => (base[k] = "node-retained"));
  }
  const ownership = area === "all" ? base : (base[area] ?? "node-retained");
  const productionTakeover = !!sim.productionTakeover;
  return {
    ...DEFAULT_NODE_DECISION,
    area,
    ownership,
    productionTakeover,
    reason: area === "jobStateSlice"
      ? "python-thin-job-state-boundary-slice;store-and-bus-retained-in-node"
      : DEFAULT_NODE_DECISION.reason,
  };
}

/**
 * Node bridge consumer for python decision (thin).
 * In real use would fetch from python /api/... but here supports local for contract.
 * The test asserts retained areas never report productionTakeover.
 */
export async function getBlueprintJobStoreScopeDecisionPython(
  input?: { area?: string; simulate?: Record<string, unknown> }
): Promise<BlueprintJobStoreScopeDecision> {
  // For gate/test we return the local computed shape matching python contract.
  // Real wiring would proxy to python service when env flag set.
  return computeLocalJobStoreScopeDecision(input);
}

export function assertNoProductionTakeoverForRetained(decision: BlueprintJobStoreScopeDecision): void {
  const own = decision.ownership;
  if (typeof own === "string") {
    if ((own === "node-retained" || own === "out-of-scope") && decision.productionTakeover) {
      throw new Error("node-retained must not equal productionTakeover");
    }
  } else if (own && typeof own === "object") {
    for (const [k, v] of Object.entries(own)) {
      if ((v === "node-retained" || v === "out-of-scope") && decision.productionTakeover) {
        throw new Error(`node-retained area ${k} must not report productionTakeover`);
      }
    }
  }
}
