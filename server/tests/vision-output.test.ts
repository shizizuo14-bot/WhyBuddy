import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveVisionOutputAbsolutePath,
  validateVisionOutputSegment,
  writeOCRArtifacts,
} from "../core/vision-output.js";

const cleanupTargets = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...cleanupTargets].map(target =>
      fs.rm(target, { recursive: true, force: true })
    )
  );
  cleanupTargets.clear();
});

describe("vision-output", () => {
  it("writes OCR artifacts in multiple output formats", async () => {
    const outputId = "vision-output-test";
    cleanupTargets.add(path.join(process.cwd(), "tmp", "vision-outputs", outputId));

    const persisted = await writeOCRArtifacts(
      [
        {
          name: "scan.png",
          recognition: {
            text: "Invoice #42\nTotal: $12.00",
            fragments: [
              { text: "Invoice #42", page: 1, region: "top-left" },
              { text: "Total: $12.00", page: 1, region: "bottom-right" },
            ],
            pages: [{ page: 1, text: "Invoice #42\nTotal: $12.00" }],
            rawResponse: '{"text":"Invoice #42\\nTotal: $12.00"}',
          },
        },
      ],
      {
        outputId,
        formats: ["json", "txt", "md"],
      }
    );

    expect(persisted.outputId).toBe(outputId);
    expect(persisted.artifacts.map(artifact => artifact.name)).toEqual([
      "ocr-results.json",
      "ocr-results.txt",
      "ocr-results.md",
    ]);

    const jsonContent = JSON.parse(
      await fs.readFile(
        resolveVisionOutputAbsolutePath(outputId, "ocr-results.json"),
        "utf-8"
      )
    );
    const textContent = await fs.readFile(
      resolveVisionOutputAbsolutePath(outputId, "ocr-results.txt"),
      "utf-8"
    );
    const markdownContent = await fs.readFile(
      resolveVisionOutputAbsolutePath(outputId, "ocr-results.md"),
      "utf-8"
    );

    expect(jsonContent.results[0].recognition.text).toBe("Invoice #42\nTotal: $12.00");
    expect(textContent).toContain("[scan.png]");
    expect(textContent).toContain("Total: $12.00");
    expect(markdownContent).toContain("# OCR Results");
    expect(markdownContent).toContain("## scan.png");
  });

  it("rejects unsafe output path segments", () => {
    expect(validateVisionOutputSegment("ocr_bundle-1")).toBe(true);
    expect(validateVisionOutputSegment("../escape")).toBe(false);
    expect(validateVisionOutputSegment("bad/name")).toBe(false);
  });
});
