import { describe, expect, it, vi } from "vitest";

import { renderMermaidPreview } from "./mermaid-renderer.js";

describe("renderMermaidPreview", () => {
  it("produces deterministic svg/hash for identical normalized Mermaid source", async () => {
    const left = await renderMermaidPreview({
      jobId: "job-1",
      nodeId: "arch",
      mermaidSource: "graph TD\nA-->B",
    });
    const right = await renderMermaidPreview({
      jobId: "job-1",
      nodeId: "arch",
      mermaidSource: " graph TD\r\n A --> B ",
    });

    expect(left.kind).toBe("ok");
    expect(right.kind).toBe("ok");
    if (left.kind === "ok" && right.kind === "ok") {
      expect(left.svg).toBe(right.svg);
      expect(left.contentHash).toBe(right.contentHash);
      expect(left.provenance).toMatchObject({
        source: "model",
        ok: true,
        modelUsed: "mermaid-deterministic",
      });
    }
  });

  it("writes preview_audit fail and skips invalid syntax", async () => {
    const recordCheck = vi.fn();
    const result = await renderMermaidPreview({
      jobId: "job-1",
      nodeId: "bad",
      mermaidSource: "not a diagram",
      checksLedger: { recordCheck } as any,
    });

    expect(result.kind).toBe("skipped");
    expect(recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        stage: "effect_preview",
        checkType: "preview_audit",
        status: "fail",
        validator: "effect-preview/mermaid-renderer.ts",
      }),
    );
  });
});
