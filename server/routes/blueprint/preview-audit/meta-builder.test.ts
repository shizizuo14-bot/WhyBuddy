import { describe, expect, it } from "vitest";

import { buildPreviewMetasFromStageCResult } from "./meta-builder.js";

describe("buildPreviewMetasFromStageCResult", () => {
  it("stamps every preview meta with preview unverified labels", () => {
    const metas = buildPreviewMetasFromStageCResult(
      "job-1",
      {
        imageBase64ByNodeId: {
          nodeA: {
            b64: Buffer.from("large-enough-preview-content").toString("base64"),
            generatedAt: "2026-06-08T00:00:00.000Z",
          },
        },
        failedProvenanceByNodeId: {
          nodeB: {
            source: "fallback",
            ok: false,
            errorIndicators: ["timeout"],
            generatedAt: "2026-06-08T00:00:00.000Z",
            retryCount: 0,
          },
        },
      },
      "2026-06-08T00:00:00.000Z",
    );

    expect(metas).toHaveLength(2);
    for (const meta of metas) {
      expect(meta.watermarkLabel).toBe("preview · unverified");
      expect(meta.localizedWatermarkLabel).toBe("预览·未验证");
    }
  });
});
