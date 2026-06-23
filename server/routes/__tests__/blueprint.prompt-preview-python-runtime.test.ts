/**
 * Node mapping tests for Blueprint prompt/preview Python runtime envelopes (task 97).
 *
 * Verifies:
 * - prompt-package / effect-preview / preview-audit can map python results
 * - provenance / policy / cost metadata retained
 * - degraded/error never masquerade as success (llm generationSource)
 * - existing service tests run alongside (no breakage)
 */

import { describe, expect, it } from "vitest";

import {
  mapPromptPackagePythonResult,
  type PythonPromptPackageEnvelope,
} from "../blueprint/prompt-package/service.js";
import {
  mapEffectPreviewPythonResult,
  type PythonPreviewEnvelope,
} from "../blueprint/effect-preview/service.js";
import {
  mapPreviewAuditPythonResult,
  type PythonPreviewAuditEnvelope,
} from "../blueprint/preview-audit/service.js";
import type { PromptPackageLlmServiceOutput } from "../blueprint/prompt-package/service.js";

describe("Blueprint prompt-preview python runtime Node mapping", () => {
  it("maps prompt package success envelope and retains provenance/policy", () => {
    const pyEnv: PythonPromptPackageEnvelope = {
      status: "success",
      generationSource: "llm",
      renderedTitle: "T",
      renderedSummary: "S",
      renderedContent: "# T\n\nS",
      renderedSections: [{ heading: "H", body: "B" }],
      renderedPrompts: [],
      promptId: "blueprint.prompt-package.v1",
      model: "python-runtime",
      promptFingerprint: "fp1",
      responseDigest: "sha256:abc",
      structuredPayloadDigest: "sha256:def",
      provenance: "python-blueprint-prompt-preview-runtime",
      policy: { maxErrorLength: 400 },
      cost: { tokens: 10 },
    };

    const out = mapPromptPackagePythonResult(pyEnv);
    expect(out.generationSource).toBe("llm");
    expect(out.renderedTitle).toBe("T");
    expect(out.provenance).toBe("python-blueprint-prompt-preview-runtime");
    expect(out.policy).toEqual({ maxErrorLength: 400 });
    expect(out.cost).toEqual({ tokens: 10 });
  });

  it("maps prompt package invalid/degraded/error to llm_fallback, never llm success", () => {
    const cases: PythonPromptPackageEnvelope[] = [
      { status: "invalid", error: "schema fail", generationSource: "llm_fallback" },
      { status: "degraded", error: "normalize fail" },
      { status: "error", error: "boom" },
    ];
    for (const c of cases) {
      const out = mapPromptPackagePythonResult(c);
      expect(out.generationSource).toBe("llm_fallback");
      expect(out.error).toBeTruthy();
      // ensure no rendered content pretending success
      expect(out.renderedContent).toBeUndefined();
    }
  });

  it("maps preview result envelope as llm without degradation flag", () => {
    const py: PythonPreviewEnvelope = {
      status: "result",
      ok: true,
      degraded: false,
      summary: "preview ok",
      progressPlan: [],
      promptFingerprint: "fp-preview-real",
      responseDigest: "sha256:real1",
      structuredPayloadDigest: "sha256:real2",
      provenance: "python-blueprint-prompt-preview-runtime",
      policy: { source: "python" },
      cost: { mock: true },
    };
    const out = mapEffectPreviewPythonResult(py);
    expect(out.generationSource).toBe("llm");
    expect(out.summary).toBe("preview ok");
    expect(out.error).toBeUndefined();
    expect(out.promptFingerprint).toBe("fp-preview-real");
    expect(out.responseDigest).toBe("sha256:real1");
    expect(out.structuredPayloadDigest).toBe("sha256:real2");
    expect(out.provenance).toBe("python-blueprint-prompt-preview-runtime");
    expect(out.policy).toEqual({ source: "python" });
    expect(out.cost).toEqual({ mock: true });
  });

  it("maps preview plan envelope as llm success (safe plan)", () => {
    const py: PythonPreviewEnvelope = {
      status: "plan",
      ok: true,
      degraded: false,
      provenance: "python-blueprint-prompt-preview-runtime",
      policy: { source: "python" },
      cost: { mock: true },
    };
    const out = mapEffectPreviewPythonResult(py);
    expect(out.generationSource).toBe("llm");
    expect(out.error).toBeUndefined();
    expect(out.provenance).toBe("python-blueprint-prompt-preview-runtime");
    expect(out.policy).toEqual({ source: "python" });
    expect(out.cost).toEqual({ mock: true });
  });

  it("maps preview degraded and error to llm_fallback, does not succeed", () => {
    const deg = mapEffectPreviewPythonResult({ status: "degraded", degraded: true, error: "d", degradedReason: "safe" });
    expect(deg.generationSource).toBe("llm_fallback");
    expect(deg.error).toContain("d");

    const err = mapEffectPreviewPythonResult({ status: "error", error: "e" });
    expect(err.generationSource).toBe("llm_fallback");
    expect(err.error).toContain("e");
  });

  it("maps preview audit result preserving metadata", () => {
    const pyEnv: PythonPreviewAuditEnvelope = {
      jobId: "j1",
      auditedAt: "2026-06-23T00:00:00Z",
      totalImages: 2,
      passCount: 1,
      failCount: 1,
      findings: [{ imageId: "i1", reason: "fake_success", details: "x", severity: "error" }],
      overallStatus: "fail",
      provenance: "python-blueprint-prompt-preview-runtime",
      policy: { audit: true },
    };
    const res = mapPreviewAuditPythonResult(pyEnv);
    expect(res.jobId).toBe("j1");
    expect(res.failCount).toBe(1);
    expect(res.overallStatus).toBe("fail");
    expect(res.provenance).toBe("python-blueprint-prompt-preview-runtime");
    expect(res.policy).toEqual({ audit: true });
  });

  it("retains that degraded/error never look succeeded in any envelope", () => {
    const pkg = mapPromptPackagePythonResult({ status: "degraded", error: "d" });
    expect(pkg.generationSource).not.toBe("llm");

    const prev = mapEffectPreviewPythonResult({ status: "degraded", error: "d", degraded: true });
    expect(prev.generationSource).not.toBe("llm");
  });
});
