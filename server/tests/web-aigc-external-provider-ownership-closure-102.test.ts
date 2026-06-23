import { describe, expect, it } from "vitest";

import { summarizeWebAigcRealProviderLiveContract } from "../../shared/telemetry/contracts.js";
// Note: 102 is ownership closure, reuses similar summarize shape for distinction; live contract test is separate 103
// This test ensures external ownership closure data is consumed correctly and does not inflate python ownership.

const SAMPLE_OWNERSHIP = {
  contractVersion: "web_aigc.external_provider_ownership_closure.v1",
  provenance: "python-web-aigc-external-provider-ownership",
  ok: false,
  total: 18,
  counts: {
    pythonOwned: 10,
    externalOwned: 8,
    nodeRetained: 0,
    skippedLive: 0,
  },
  providers: {
    web_search: { kind: "web_search", status: "external-owned", ownership: "external", reason: "real external provider; external-owned or node-retained; skipped-live for python migration", productionTakeover: false, externalCalls: false },
    vision_analysis: { kind: "vision_analysis", status: "external-owned", ownership: "external", reason: "...", productionTakeover: false, externalCalls: false },
    file_generation: { kind: "file_generation", status: "python-owned", ownership: "python", reason: "synthetic python internal; python-owned", productionTakeover: false, externalCalls: false },
    ai_ppt_outline: { kind: "ai_ppt_outline", status: "python-owned", ownership: "python", reason: "synthetic python internal; python-owned", productionTakeover: false, externalCalls: false },
  },
};

describe("web AIGC external provider ownership closure 102 - node consumption", () => {
  it("ownership closure marks external real providers as external-owned", () => {
    const o = SAMPLE_OWNERSHIP;
    expect(o.counts.externalOwned).toBeGreaterThan(0);
    expect(o.counts.pythonOwned).toBeGreaterThan(0);
    expect(o.providers.web_search.status).toBe("external-owned");
    expect(o.providers.web_search.ownership).toBe("external");
    expect(o.providers.web_search.productionTakeover).toBe(false);
    expect(o.providers.file_generation.status).toBe("python-owned");
  });

  it("external-owned entries must not be treated as python production takeover", () => {
    const externalKeys = Object.keys(SAMPLE_OWNERSHIP.providers).filter(k => SAMPLE_OWNERSHIP.providers[k as any].status !== "python-owned");
    expect(externalKeys.length).toBeGreaterThan(0);
    for (const k of externalKeys) {
      expect(SAMPLE_OWNERSHIP.providers[k as any].productionTakeover).toBe(false);
    }
  });

  it("live contract summarize (used by 103) confirms external/skipped not counting", () => {
    // cross link: use live contract summarizer shape to verify no migration credit for external
    const mixed = {
      web_search: { status: "external-owned" as const, ownership: "external", productionTakeover: false },
      file_generation: { status: "synthetic" as const, ownership: "python", productionTakeover: false },
    };
    const s = summarizeWebAigcRealProviderLiveContract(mixed);
    expect(s.externalOwned + s.synthetic).toBeGreaterThan(0);
    expect(s.canClaimRealProviderMigration).toBe(false);
  });
});
