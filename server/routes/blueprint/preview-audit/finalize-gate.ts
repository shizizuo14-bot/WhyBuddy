import type { ChecksLedgerService } from "../checks-ledger/types.js";
import type { PreviewImageMeta } from "../../../../shared/blueprint/preview-audit/types.js";
import {
  detectDuplicates,
  detectFakeSuccess,
  detectFallbackFraud,
} from "./detectors.js";

export interface FinalizeGateInput {
  jobId: string;
  expectedNodeIds: string[];
  previews: PreviewImageMeta[];
  currentRunWindow: { start: string; end: string };
  emitEvent?: (type: string, payload: Record<string, unknown>) => void;
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
}

export interface FinalizeGateResult {
  allowed: boolean;
  reasons: string[];
}

function inRunWindow(meta: PreviewImageMeta, window: FinalizeGateInput["currentRunWindow"]): boolean {
  const generatedAt = Date.parse(meta.provenance.generatedAt);
  return (
    Number.isFinite(generatedAt) &&
    generatedAt >= Date.parse(window.start) &&
    generatedAt <= Date.parse(window.end)
  );
}

function writeLedger(input: FinalizeGateInput, result: FinalizeGateResult): void {
  try {
    input.checksLedger?.recordCheck({
      jobId: input.jobId,
      stage: "effect_preview",
      checkType: "preview_audit",
      checkName: "preview_audit_finalize_gate",
      status: result.allowed ? "pass" : "fail",
      validator: "preview-audit/finalize-gate.ts",
      output: JSON.stringify({ allowed: result.allowed, reasons: result.reasons }),
      metadata: {
        expectedNodeCount: input.expectedNodeIds.length,
        previewCount: input.previews.length,
      },
    });
  } catch {
    // Finalize gate ledger writes must not throw into route handling.
  }
}

function emitGate(input: FinalizeGateInput, result: FinalizeGateResult): void {
  try {
    input.emitEvent?.(result.allowed ? "checks.gate.passed" : "checks.gate.failed", {
      jobId: input.jobId,
      stage: "effect_preview",
      gate: "preview_finalize",
      reasons: result.reasons,
    });
  } catch {
    // Event emission is observational only.
  }
}

export function evaluateFinalizeGate(input: FinalizeGateInput): FinalizeGateResult {
  const reasons = new Set<string>();
  const expected = new Set(input.expectedNodeIds);
  const previewsByNode = new Map<string, PreviewImageMeta[]>();
  for (const preview of input.previews) {
    if (!expected.has(preview.nodeId)) continue;
    const bucket = previewsByNode.get(preview.nodeId) ?? [];
    bucket.push(preview);
    previewsByNode.set(preview.nodeId, bucket);
  }

  for (const nodeId of input.expectedNodeIds) {
    const bucket = previewsByNode.get(nodeId) ?? [];
    if (bucket.length !== 1) {
      reasons.add("preview_count_mismatch");
    }
  }

  for (const preview of input.previews) {
    if (!inRunWindow(preview, input.currentRunWindow)) {
      reasons.add("stale_preview");
    }
    const fallback = detectFallbackFraud(preview);
    if (fallback) reasons.add(fallback.reason);
    const fake = detectFakeSuccess(preview);
    if (fake) reasons.add(fake.reason);
  }

  for (const duplicate of detectDuplicates(input.previews)) {
    reasons.add(duplicate.reason);
  }

  const result = {
    allowed: reasons.size === 0,
    reasons: [...reasons],
  };
  writeLedger(input, result);
  emitGate(input, result);
  return result;
}
