import { describe, expect, it } from "vitest";

import { consumeWebAigcRealProviderLiveContract } from "../core/web-aigc-runtime-extra-adapters.js";
import { recordWebAigcRealProviderLiveContract } from "../core/web-aigc-runtime-observability.js";
import { summarizeWebAigcRealProviderLiveContract } from "../../shared/telemetry/contracts.js";

const SAMPLE_LIVE_CONTRACT = {
  contractVersion: "web_aigc.real_provider_live_contract.v1",
  provenance: "python-web-aigc-real-provider-live-contract",
  ok: true,
  total: 19,
  counts: {
    liveReady: 0,
    skippedLive: 8,
    synthetic: 10,
    externalOwned: 1,
  },
  providers: {
    web_search: {
      kind: "web_search",
      status: "skipped-live" as const,
      ownership: "external" as const,
      requiredEnv: ["WEB_SEARCH_API_KEY", "SEARCH_PROVIDER_URL"],
      skipReason: "requires real external provider key/credentials; using synthetic only; skipped-live",
      productionTakeover: false,
      liveCapable: true,
      backend: "python" as const,
      externalCalls: false as const,
    },
    vision_analysis: {
      kind: "vision_analysis",
      status: "skipped-live" as const,
      ownership: "external" as const,
      requiredEnv: ["VISION_API_KEY"],
      skipReason: "requires real external provider key/credentials; using synthetic only; skipped-live",
      productionTakeover: false,
      liveCapable: true,
      backend: "python" as const,
      externalCalls: false as const,
    },
    file_generation: {
      kind: "file_generation",
      status: "synthetic" as const,
      ownership: "python" as const,
      requiredEnv: [],
      skipReason: "python synthetic facade (no real external provider)",
      productionTakeover: false,
      liveCapable: false,
      backend: "python" as const,
      externalCalls: false as const,
    },
    ai_ppt_outline: {
      kind: "ai_ppt_outline",
      status: "synthetic" as const,
      ownership: "python" as const,
      requiredEnv: [],
      skipReason: "python synthetic facade (no real external provider)",
      productionTakeover: false,
      liveCapable: false,
      backend: "python" as const,
      externalCalls: false as const,
    },
    dynamic_chart: {
      kind: "dynamic_chart",
      status: "synthetic" as const,
      ownership: "python" as const,
      requiredEnv: [],
      skipReason: "python synthetic facade (no real external provider)",
      productionTakeover: false,
      liveCapable: false,
      backend: "python" as const,
      externalCalls: false as const,
    },
    transaction_flow: {
      kind: "transaction_flow",
      status: "synthetic" as const,
      ownership: "python" as const,
      requiredEnv: [],
      skipReason: "python synthetic facade (no real external provider)",
      productionTakeover: false,
      liveCapable: false,
      backend: "python" as const,
      externalCalls: false as const,
    },
    // web_qa projected from python live contract output (node-retained, per provider-closure-100; must be external-owned not synthetic/live)
    web_qa: {
      kind: "web_qa",
      status: "external-owned" as const,
      ownership: "node" as const,
      requiredEnv: [],
      skipReason: "external-owned provider; python does not own live contract",
      productionTakeover: false,
      liveCapable: false,
      backend: "python" as const,
      externalCalls: false as const,
    },
    ocr_recognition: {
      kind: "ocr_recognition",
      status: "skipped-live" as const,
      ownership: "external" as const,
      requiredEnv: ["OCR_API_KEY"],
      skipReason: "requires real external provider key/credentials; using synthetic only; skipped-live",
      productionTakeover: false,
      liveCapable: true,
      backend: "python" as const,
      externalCalls: false as const,
    },
  },
  realPythonTakeover: 0,
  runtime: { owner: "python", mode: "real_provider_live_contract", externalCalls: false },
  note: "live-ready for external-owned providers does NOT count as python productionTakeover; synthetic and skipped-live MUST NOT be counted as real provider migration.",
};

describe("web AIGC real provider live contract 103 - node consumption", () => {
  it("node consumes python live contract and distinguishes statuses", () => {
    const contract = SAMPLE_LIVE_CONTRACT;
    expect(contract.contractVersion).toBe("web_aigc.real_provider_live_contract.v1");
    expect(contract.counts.skippedLive).toBeGreaterThan(0);
    expect(contract.counts.synthetic).toBeGreaterThan(0);
    expect(contract.providers.web_search.status).toBe("skipped-live");
    expect(contract.providers.web_search.ownership).toBe("external");
    expect(contract.providers.web_search.productionTakeover).toBe(false);
    expect(contract.providers.file_generation.status).toBe("synthetic");
    expect(contract.providers.file_generation.ownership).toBe("python");
    expect(contract.providers.web_qa.status).toBe("external-owned");
    expect(contract.providers.web_qa.ownership).toBe("node");
    expect(contract.realPythonTakeover).toBe(0);

    const viaConsume = consumeWebAigcRealProviderLiveContract(contract);
    const viaRecord = recordWebAigcRealProviderLiveContract(contract);
    expect(viaConsume.skippedLive).toBeGreaterThan(0);
    expect(viaConsume.synthetic).toBeGreaterThan(0);
    expect(viaConsume.liveReady).toBe(0);
    expect(viaConsume.canClaimRealProviderMigration).toBe(false);
    expect(viaRecord.realPythonTakeover).toBe(0);
  });

  it("live contract skipped/synthetic/external never claim real provider migration", () => {
    const summary = summarizeWebAigcRealProviderLiveContract(SAMPLE_LIVE_CONTRACT.providers);
    expect(summary.skippedLive).toBeGreaterThan(0);
    expect(summary.synthetic).toBeGreaterThan(0);
    expect(summary.externalOwned).toBeGreaterThan(0);
    expect(summary.canClaimRealProviderMigration).toBe(false);
    expect(summary.realPythonTakeover).toBe(0);
  });

  it("live contract with simulated live-ready external still does not allow python takeover claim", () => {
    const liveSim = {
      ...SAMPLE_LIVE_CONTRACT,
      providers: {
        ...SAMPLE_LIVE_CONTRACT.providers,
        web_search: {
          ...SAMPLE_LIVE_CONTRACT.providers.web_search,
          status: "live-ready" as const,
          productionTakeover: false,
        },
      },
      counts: { ...SAMPLE_LIVE_CONTRACT.counts, liveReady: 1, skippedLive: 7 },
      realPythonTakeover: 0,
    };
    const s = summarizeWebAigcRealProviderLiveContract(liveSim.providers);
    expect(s.liveReady).toBeGreaterThan(0);
    expect(s.canClaimRealProviderMigration).toBe(false); // external not python takeover
    expect(s.realPythonTakeover).toBe(0);
  });

  it("pure synthetic providers never report live-ready or migration", () => {
    const synthOnly: any = {
      file_generation: { status: "synthetic", ownership: "python", productionTakeover: false },
      ai_ppt_outline: { status: "synthetic", ownership: "python", productionTakeover: false },
    };
    const s = summarizeWebAigcRealProviderLiveContract(synthOnly);
    expect(s.synthetic).toBe(2);
    expect(s.liveReady).toBe(0);
    expect(s.canClaimRealProviderMigration).toBe(false);
  });

  it("web-qa from python live contract projection is external-owned/node and never counted toward real python provider takeover", () => {
    // This uses an entry that matches the shape produced by real python web_aigc_real_provider_live_contract
    // (not purely hand-written for summarizer only); web_qa was missing from LIVE_KINDS before
    const providers = SAMPLE_LIVE_CONTRACT.providers as any;
    expect(providers.web_qa).toBeDefined();
    expect(providers.web_qa.kind).toBe("web_qa");
    expect(providers.web_qa.status).toBe("external-owned");
    expect(providers.web_qa.ownership).toBe("node");
    expect(providers.web_qa.productionTakeover).toBe(false);
    expect(providers.web_qa.liveCapable).toBe(false);
    expect(providers.web_qa.requiredEnv).toEqual([]);

    const s = summarizeWebAigcRealProviderLiveContract(providers);
    expect(s.externalOwned).toBeGreaterThan(0);
    expect(s.canClaimRealProviderMigration).toBe(false);
    expect(s.realPythonTakeover).toBe(0);
    // skipped/synthetic/external including web_qa block any real provider migration claim
  });
});
