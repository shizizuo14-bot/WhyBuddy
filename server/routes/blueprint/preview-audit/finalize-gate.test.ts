import { describe, expect, it, vi } from "vitest";

import type { PreviewImageMeta } from "../../../../shared/blueprint/preview-audit/types.js";
import { evaluateFinalizeGate } from "./finalize-gate.js";

function makeMeta(overrides: Partial<PreviewImageMeta> = {}): PreviewImageMeta {
  return {
    imageId: overrides.imageId ?? "node-1",
    jobId: overrides.jobId ?? "job-1",
    nodeId: overrides.nodeId ?? "node-1",
    filePath: overrides.filePath ?? "job-1/node-1.png",
    contentHash: overrides.contentHash ?? "hash-1",
    fileSizeBytes: overrides.fileSizeBytes ?? 2048,
    provenance: overrides.provenance ?? {
      source: "model",
      ok: true,
      errorIndicators: [],
      generatedAt: "2026-06-08T00:00:10.000Z",
      retryCount: 0,
    },
  };
}

describe("evaluateFinalizeGate", () => {
  it("passes only when every expected node has one valid current-run preview", () => {
    const emitEvent = vi.fn();
    const checksLedger = { recordCheck: vi.fn() };
    const result = evaluateFinalizeGate({
      jobId: "job-1",
      expectedNodeIds: ["node-1", "node-2"],
      previews: [
        makeMeta({ nodeId: "node-1", imageId: "node-1", contentHash: "h1" }),
        makeMeta({ nodeId: "node-2", imageId: "node-2", contentHash: "h2" }),
      ],
      currentRunWindow: {
        start: "2026-06-08T00:00:00.000Z",
        end: "2026-06-08T00:01:00.000Z",
      },
      emitEvent,
      checksLedger: checksLedger as any,
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(emitEvent).toHaveBeenCalledWith(
      "checks.gate.passed",
      expect.objectContaining({ jobId: "job-1" }),
    );
    expect(checksLedger.recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({ checkType: "preview_audit", status: "pass" }),
    );
  });

  it("blocks missing, fake, fallback, duplicate, and stale previews", () => {
    const common = {
      jobId: "job-1",
      expectedNodeIds: ["node-1", "node-2"],
      currentRunWindow: {
        start: "2026-06-08T00:00:00.000Z",
        end: "2026-06-08T00:01:00.000Z",
      },
    };

    expect(
      evaluateFinalizeGate({ ...common, previews: [makeMeta()] }).allowed,
    ).toBe(false);

    expect(
      evaluateFinalizeGate({
        ...common,
        previews: [
          makeMeta({
            nodeId: "node-1",
            provenance: {
              source: "fallback",
              ok: true,
              errorIndicators: [],
              generatedAt: "2026-06-08T00:00:10.000Z",
              retryCount: 0,
            },
          }),
          makeMeta({ nodeId: "node-2", imageId: "node-2", contentHash: "h2" }),
        ],
      }).reasons,
    ).toContain("fallback_pretending");

    expect(
      evaluateFinalizeGate({
        ...common,
        previews: [
          makeMeta({ nodeId: "node-1", fileSizeBytes: 1 }),
          makeMeta({ nodeId: "node-2", imageId: "node-2", contentHash: "h2" }),
        ],
      }).reasons,
    ).toContain("fake_success");

    expect(
      evaluateFinalizeGate({
        ...common,
        previews: [
          makeMeta({ nodeId: "node-1", contentHash: "same" }),
          makeMeta({ nodeId: "node-2", imageId: "node-2", contentHash: "same" }),
        ],
      }).reasons,
    ).toContain("duplicate_content");

    expect(
      evaluateFinalizeGate({
        ...common,
        previews: [
          makeMeta({
            nodeId: "node-1",
            provenance: {
              source: "model",
              ok: true,
              errorIndicators: [],
              generatedAt: "2026-06-07T00:00:00.000Z",
              retryCount: 0,
            },
          }),
          makeMeta({ nodeId: "node-2", imageId: "node-2", contentHash: "h2" }),
        ],
      }).reasons,
    ).toContain("stale_preview");
  });
});
