import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpSlideRuleSessionStore } from "../sliderule-http-store";
import type { V5SessionState } from "@shared/blueprint/v5-reasoning-state";

function makeState(sessionId = "sliderule-v51-product"): V5SessionState {
  return {
    sessionId,
    goal: { text: "test goal", status: "needs_refinement" },
    artifacts: [],
    capabilityRuns: [],
    coverageGaps: [],
    coverageContract: null,
    coverageGate: null,
    graph: {
      id: "sliderule-session-graph",
      jobId: "sliderule-prototype",
      stage: "effect_preview",
      nodes: [],
      edges: [],
      source: "runtime",
    },
    staleArtifactIds: [],
    conversation: [],
  } as V5SessionState;
}

describe("HttpSlideRuleSessionStore Python compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps Python session envelopes on load", async () => {
    const state = makeState();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        state,
        provenance: "python-fullpath",
        backend: "python",
      }),
    } as Response);

    const store = new HttpSlideRuleSessionStore();
    const loaded = await store.load("sliderule-v51-product");

    expect(loaded?.sessionId).toBe("sliderule-v51-product");
    expect((loaded as any).state).toBeUndefined();
    expect(loaded?.graph?.nodes).toEqual([]);
    expect(loaded?.gates).toEqual([]);
    expect(loaded?.dependencyGraph).toEqual([]);
    expect(loaded?.decisions).toEqual([]);
    expect(loaded?.risks).toEqual([]);
  });

  it("keeps the submitted state when Python save returns an ack envelope", async () => {
    const state = makeState("save-python-ack");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        provenance: "python-fullpath",
        backend: "python",
      }),
    } as Response);

    const store = new HttpSlideRuleSessionStore();
    const saved = await store.save(state);

    expect(saved.sessionId).toBe("save-python-ack");
    expect(saved.graph?.nodes).toEqual([]);
    expect((saved as any).ok).toBeUndefined();
  });

  it("does not crash the active turn when an older Python schema rejects untrusted artifacts", async () => {
    const state = {
      ...makeState("save-python-old-schema"),
      artifacts: [
        {
          id: "art-untrusted",
          kind: "evidence",
          provenance: "llm_fallback",
          trustLevel: "untrusted",
          passedGates: [],
          producedBy: {
            capabilityRunId: "run-untrusted",
            capabilityId: "evidence.search",
            roleId: "grounding",
          },
        },
      ],
    } as V5SessionState;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () =>
        '{"detail":[{"loc":["body","artifacts",0,"trustLevel"],"input":"untrusted"}]}',
    } as Response);

    const store = new HttpSlideRuleSessionStore();
    const saved = await store.save(state);

    expect(saved.sessionId).toBe("save-python-old-schema");
    expect(saved.artifacts[0]?.trustLevel).toBe("untrusted");
  });
});
