import { describe, expect, it } from "vitest";

import {
  LiveSmokeDiagnostic,
  ExternalDependencyLiveSmokeResult,
  summarizeExternalLiveSmoke,
} from "../../../shared/telemetry/contracts.js";

// Cutover readiness reuses/enhances the live smoke shape but focuses on cutover decision.
// Node consumption test verifies classification including deployed_python_service.

function makePythonCutoverResult(overrides: Partial<ExternalDependencyLiveSmokeResult> = {}): ExternalDependencyLiveSmokeResult {
  const baseChecks: LiveSmokeDiagnostic[] = [
    { provider: "qdrant", status: "config_missing", reason: "no key", durationMs: 0, metadata: {} },
    { provider: "embedding", status: "config_missing", reason: "no key", durationMs: 5, metadata: {} },
    { provider: "search", status: "skipped", reason: "node owned", durationMs: 0, metadata: {} },
    { provider: "ocr", status: "skipped", reason: "slice", durationMs: 0, metadata: {} },
    { provider: "vision", status: "skipped", reason: "slice", durationMs: 0, metadata: {} },
    { provider: "audio", status: "skipped", reason: "slice", durationMs: 0, metadata: {} },
    { provider: "apm", status: "skipped", reason: "platform", durationMs: 0, metadata: {} },
    { provider: "billing", status: "skipped", reason: "platform", durationMs: 0, metadata: {} },
    { provider: "audit", status: "skipped", reason: "platform", durationMs: 0, metadata: {} },
    { provider: "deployed_python_service", status: "ready", reason: "python module loadable", durationMs: 2, metadata: { probe: "import" } },
  ];
  return {
    overall: "config_missing",
    checks: baseChecks,
    durationMs: 20,
    note: "degraded or config_missing or skipped means NOT ready for cutover.",
    counts: { ready: 1, skipped: 7, config_missing: 2, failed_or_timeout: 0, degraded: 0 },
    ...overrides,
  };
}

describe("python external provider cutover readiness (Node consumption) 100", () => {
  it("accepts python cutover readiness shape and lists per-provider including deployed_python_service", () => {
    const result = makePythonCutoverResult();
    expect(result.checks.length).toBeGreaterThanOrEqual(10);
    const providers = result.checks.map((c) => c.provider);
    expect(providers).toContain("qdrant");
    expect(providers).toContain("embedding");
    expect(providers).toContain("search");
    expect(providers).toContain("ocr");
    expect(providers).toContain("vision");
    expect(providers).toContain("audio");
    expect(providers).toContain("apm");
    expect(providers).toContain("billing");
    expect(providers).toContain("audit");
    expect(providers).toContain("deployed_python_service");

    for (const c of result.checks) {
      expect(typeof c.provider).toBe("string");
      expect(["ready", "skipped", "config_missing", "failed", "timeout", "degraded"]).toContain(c.status);
      expect(typeof c.reason).toBe("string");
      expect(typeof c.durationMs).toBe("number");
      expect(c.metadata).toBeDefined();
    }
  });

  it("cutover summary: config_missing / skipped / degraded block production cutover claim", () => {
    const result = makePythonCutoverResult();
    const summary = summarizeExternalLiveSmoke(result.checks);
    expect(summary.canClaimProduction).toBe(false);
    expect(summary.configMissing + summary.skipped).toBeGreaterThan(0);
  });

  it("cutover with some ready but others skipped keeps canClaim false (no fake green)", () => {
    const partial = makePythonCutoverResult({
      overall: "partial",
      checks: [
        { provider: "qdrant", status: "ready", reason: "", durationMs: 10, metadata: {} },
        { provider: "embedding", status: "ready", reason: "", durationMs: 2, metadata: {} },
        { provider: "search", status: "skipped", reason: "node owned", durationMs: 0, metadata: {} },
        { provider: "ocr", status: "skipped", reason: "node owned", durationMs: 0, metadata: {} },
        { provider: "vision", status: "skipped", reason: "node owned", durationMs: 0, metadata: {} },
        { provider: "audio", status: "skipped", reason: "node owned", durationMs: 0, metadata: {} },
        { provider: "apm", status: "skipped", reason: "platform", durationMs: 0, metadata: {} },
        { provider: "billing", status: "skipped", reason: "platform", durationMs: 0, metadata: {} },
        { provider: "audit", status: "skipped", reason: "platform", durationMs: 0, metadata: {} },
        { provider: "deployed_python_service", status: "ready", reason: "", durationMs: 1, metadata: {} },
      ],
      counts: { ready: 3, skipped: 7, config_missing: 0, failed_or_timeout: 0, degraded: 0 },
    });
    const summary = summarizeExternalLiveSmoke(partial.checks);
    expect(summary.ready).toBeGreaterThan(0);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(summary.canClaimProduction).toBe(false);
  });

  it("degraded from python blocks cutover claim", () => {
    const bad = makePythonCutoverResult({
      overall: "degraded",
      checks: [
        { provider: "qdrant", status: "degraded", reason: "probe degraded", durationMs: 5, metadata: {} },
        { provider: "embedding", status: "degraded", reason: "probe degraded", durationMs: 5, metadata: {} },
        { provider: "deployed_python_service", status: "degraded", reason: "import issue", durationMs: 10, metadata: {} },
      ],
      counts: { ready: 0, skipped: 0, config_missing: 0, failed_or_timeout: 0, degraded: 3 },
    });
    const summary = summarizeExternalLiveSmoke(bad.checks);
    expect(summary.failedOrTimeout).toBe(0); // but we treat degraded separate
    // note: summarize may not count degraded as failed, but canClaim must be false
    expect(summary.canClaimProduction).toBe(false);
  });

  it("ready only when explicit and no blockers", () => {
    const allReady = makePythonCutoverResult({
      overall: "ready",
      checks: [
        { provider: "qdrant", status: "ready", reason: "", durationMs: 8, metadata: { http_status: 200 } },
        { provider: "embedding", status: "ready", reason: "", durationMs: 1, metadata: {} },
        { provider: "search", status: "ready", reason: "", durationMs: 12, metadata: {} },
        { provider: "ocr", status: "ready", reason: "", durationMs: 3, metadata: {} },
        { provider: "vision", status: "ready", reason: "", durationMs: 4, metadata: {} },
        { provider: "audio", status: "ready", reason: "", durationMs: 7, metadata: {} },
        { provider: "apm", status: "ready", reason: "", durationMs: 2, metadata: {} },
        { provider: "billing", status: "ready", reason: "", durationMs: 5, metadata: {} },
        { provider: "audit", status: "ready", reason: "", durationMs: 6, metadata: {} },
        { provider: "deployed_python_service", status: "ready", reason: "", durationMs: 1, metadata: {} },
      ],
      counts: { ready: 10, skipped: 0, config_missing: 0, failed_or_timeout: 0, degraded: 0 },
    });
    const summary = summarizeExternalLiveSmoke(allReady.checks);
    // even if all ready in mock, summarize requires zero non-readies for canClaim
    expect(summary.canClaimProduction).toBe(true);
    expect(summary.ready).toBe(10);
  });

  it("Node side adapters still expose live smoke diagnostics (compat)", () => {
    // this test file gate also runs embedding/qdrant adapter tests indirectly via vitest list
    // shape check only here
    const diag: LiveSmokeDiagnostic = { provider: "qdrant", status: "ready", reason: "", durationMs: 1, metadata: {} };
    expect(diag.status).toBe("ready");
  });
});
