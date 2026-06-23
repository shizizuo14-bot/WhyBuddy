import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  executeBlueprintMainRuntimeClosure,
  mapBlueprintMainRuntimeClosurePython,
  BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION,
} from "../blueprint/main-runtime-closure-python";

describe("blueprint main runtime closure 100 - node bridge", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps python closure summary and preserves metadata", async () => {
    vi.stubEnv("BLUEPRINT_MAIN_RUNTIME_CLOSURE_PYTHON", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-closure.test/");
    vi.stubEnv("PYTHON_SLIDE_RULE_INTERNAL_KEY", "internal-test");

    const pythonEnvelope = {
      status: "success",
      contractVersion: BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION,
      provenance: "python-blueprint-main-runtime-closure",
      runtime: { owner: "python", mode: "bounded_closure", jobStoreOwner: "node", eventBusOwner: "node", ledgerOwner: "node", previewOwner: "node", promptPackageOwner: "node" },
      jobId: "job-100",
      projectId: "p-100",
      stageId: "spec_tree",
      closureSummary: {
        jobId: "job-100",
        projectId: "p-100",
        stageId: "spec_tree",
        status: "success",
        components: { mainState: true, jobLifecycle: true, eventStream: true, promptPreview: true, reviewExport: true, artifactMemory: true },
        metadata: { actor: { id: "actor-1" }, causation: { traceId: "tr-100" }, diagnostic: { gate: "closure" } },
      },
      diagnostics: {
        componentsCovered: ["mainState", "jobLifecycle", "eventStream", "promptPreview", "reviewExport", "artifactMemory"],
        nodePersistencePreserved: true,
        nodeEventBusPreserved: true,
        nodeLedgerPreserved: true,
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(pythonEnvelope), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const payload = {
      jobId: "job-100",
      projectId: "p-100",
      stageId: "spec_tree",
      actor: { id: "actor-1" },
      causation: { traceId: "tr-100" },
      diagnostics: { gate: "closure" },
    };

    const res = await executeBlueprintMainRuntimeClosure(payload);

    expect(res.contractVersion).toBe(BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION);
    expect(res.jobId).toBe("job-100");
    expect(res.stageId).toBe("spec_tree");
    expect(res.closureSummary.jobId).toBe("job-100");
    expect(res.closureSummary.metadata.actor?.id).toBe("actor-1");
    expect(res.closureSummary.metadata.causation?.traceId).toBe("tr-100");
    expect(res.diagnostics.nodePersistencePreserved).toBe(true);
    expect(res.runtime.jobStoreOwner).toBe("node");
    // bridge actually consumed and mapped from python envelope (not local fallback)
    expect(res.provenance).toBe("python-blueprint-main-runtime-closure");
  });

  it("maps python diagnostic-only via bridge and forces guards", async () => {
    vi.stubEnv("BLUEPRINT_MAIN_RUNTIME_CLOSURE_PYTHON", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-closure.test/");
    vi.stubEnv("PYTHON_SLIDE_RULE_INTERNAL_KEY", "internal-test");

    const diagPy = {
      status: "diagnostic-only",
      contractVersion: BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION,
      provenance: "python-blueprint-main-runtime-closure",
      runtime: { owner: "python", mode: "bounded_closure", jobStoreOwner: "node", eventBusOwner: "node", ledgerOwner: "node", previewOwner: "node", promptPackageOwner: "node" },
      jobId: "d-bridge",
      stageId: "input",
      closureSummary: { jobId: "d-bridge", stageId: "input", status: "diagnostic-only", components: {}, metadata: {} },
      diagnostics: { componentsCovered: [], nodePersistencePreserved: true, nodeEventBusPreserved: true, nodeLedgerPreserved: true },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(diagPy), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await executeBlueprintMainRuntimeClosure({ jobId: "d-bridge", diagnosticOnly: true });

    expect(res.status).toBe("diagnostic-only");
    expect(res.provenance).toBe("python-blueprint-main-runtime-closure");
    expect(res.productionTakeover).toBe(false);
    expect(res.diagnosticOnly).toBe(true);
  });

  it("supports all five closure statuses via simulate/local", async () => {
    const base = { jobId: "j" };

    const s = await executeBlueprintMainRuntimeClosure(base);
    expect(["success", "partial", "degraded", "failed", "diagnostic-only"]).toContain(s.status);

    const partial = await executeBlueprintMainRuntimeClosure({ ...base, simulate: { partial: true } });
    expect(partial.status).toBe("partial");

    const degraded = await executeBlueprintMainRuntimeClosure({ ...base, simulate: { degraded: true } });
    expect(degraded.status).toBe("degraded");

    const failed = await executeBlueprintMainRuntimeClosure({ ...base, simulate: { forceFailed: true } });
    expect(failed.status).toBe("failed");

    const diag = await executeBlueprintMainRuntimeClosure({ ...base, diagnosticOnly: true });
    expect(diag.status).toBe("diagnostic-only");
    expect(diag.diagnosticOnly).toBe(true);
    expect(diag.productionTakeover).toBe(false);
  });

  it("does not treat diagnostic-only as production takeover", async () => {
    const diagPy = {
      status: "diagnostic-only",
      contractVersion: BLUEPRINT_MAIN_RUNTIME_CLOSURE_CONTRACT_VERSION,
      provenance: "python-blueprint-main-runtime-closure",
      runtime: { owner: "python", mode: "bounded_closure", jobStoreOwner: "node", eventBusOwner: "node", ledgerOwner: "node", previewOwner: "node", promptPackageOwner: "node" },
      jobId: "d1",
      stageId: "input",
      closureSummary: { jobId: "d1", stageId: "input", status: "diagnostic-only", components: {}, metadata: {} },
      diagnostics: { componentsCovered: [], nodePersistencePreserved: true, nodeEventBusPreserved: true, nodeLedgerPreserved: true },
    };

    const mapped = mapBlueprintMainRuntimeClosurePython(diagPy);
    expect(mapped.status).toBe("diagnostic-only");
    expect(mapped.productionTakeover).toBe(false);
    expect(mapped.diagnosticOnly).toBe(true);
  });

  it("bridge keeps node boundaries even on python unavailable shape", async () => {
    // force fallback by bad env but local path always honors
    const res = await executeBlueprintMainRuntimeClosure({ jobId: "b", simulate: { failed: true } });
    expect(res.runtime.eventBusOwner).toBe("node");
    expect(res.runtime.ledgerOwner).toBe("node");
    expect(res.diagnostics.nodeEventBusPreserved).toBe(true);
  });
});
