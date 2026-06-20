import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateWebAigcFileTranslationOutputSegment } from "../../../shared/web-aigc-file-translation.js";
import {
  executeExcelReadNode,
} from "../node-adapters/excel-read-node-adapter.js";
import {
  executeFileGenerationNode,
  persistFileGenerationArtifact,
  validateFileGenerationSegment,
} from "../node-adapters/file-generation-node-adapter.js";
import {
  clearFileTranslationOutputStoreForTests,
  executeFileTranslationNode,
} from "../node-adapters/file-translation-node-adapter.js";
import {
  executeFileSlicingNode,
} from "../node-adapters/file-slicing-node-adapter.js";
import {
  executeLongTextExtractionNode,
} from "../node-adapters/long-text-extraction-node-adapter.js";

function buildWorkbookBase64(rows: unknown[][]): string {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer).toString("base64");
}

afterEach(() => {
  clearFileTranslationOutputStoreForTests();
  vi.restoreAllMocks();
});

describe("web AIGC file Python contract adapters", () => {
  it("generated file output uses injected fake artifact runtime without writing real files", async () => {
    const writeArtifactFile = vi.fn(async () => ({
      outputId: "artifact-generated-1",
      artifact: {
        kind: "file" as const,
        name: "contract.md",
        path: "memory://web-aigc-file-adapter/artifact-generated-1/contract.md",
        mimeType: "text/markdown",
        downloadUrl: "/api/file-generation/outputs/artifact-generated-1/contract.md?download=1",
        previewUrl: "/api/file-generation/outputs/artifact-generated-1/contract.md/preview",
        description: "fake contract artifact",
      },
      absolutePath: "memory://web-aigc-file-adapter/artifact-generated-1/contract.md",
    }));
    const readArtifactPreview = vi.fn(async () => ({
      inlineText: "# Contract\n\nGenerated content.",
      truncated: false,
      sizeBytes: 30,
      contentType: "text/markdown",
    }));

    const result = await executeFileGenerationNode(
      {
        nodeType: "file_generation",
        input: {
          filename: "contract.md",
          format: "md",
          content: "# Contract\n\nGenerated content.",
          outputId: "artifact-generated-1",
        },
      },
      { writeArtifactFile, readArtifactPreview },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.filename).toBe("contract.md");
    expect(result.output.artifact.outputId).toBe("artifact-generated-1");
    expect(result.output.artifact.artifact.path).toBe(
      "memory://web-aigc-file-adapter/artifact-generated-1/contract.md",
    );
    expect(result.output.preview.inlineText).toContain("Generated content");
    expect(writeArtifactFile).toHaveBeenCalledOnce();
    expect(readArtifactPreview).toHaveBeenCalledWith(
      "memory://web-aigc-file-adapter/artifact-generated-1/contract.md",
    );
  });

  it("sliced file output carries stable chunk and retrieval identifiers from inline content", async () => {
    const result = await executeFileSlicingNode({
      nodeType: "file_slicing",
      input: {
        sourceType: "document",
        sourceId: "source-file-1",
        projectId: "project-1",
        fileName: "notes.txt",
        fileType: "text",
        content: "alpha beta gamma delta epsilon zeta eta theta iota kappa",
        strategy: {
          mode: "fixed_window",
          maxChars: 18,
          overlapChars: 0,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.sourceId).toBe("source-file-1");
    expect(result.output.chunks.length).toBeGreaterThan(1);
    expect(result.output.chunks[0]).toMatchObject({
      chunkId: "document:source-file-1:0",
      chunkIndex: 0,
    });
    expect(result.output.ingestionPayloads[0].sourceId).toBe(
      "source-file-1#chunk-0",
    );
    expect(result.output.retrievalPreview[0].chunkId).toBe(
      result.output.chunks[0].chunkId,
    );
  });

  it("translated file output stores only a memory artifact with stable artifact id fields", async () => {
    const result = await executeFileTranslationNode(
      {
        nodeType: "file_translation",
        input: {
          file: {
            name: "guide.txt",
            mimeType: "text/plain; charset=utf-8",
            content: "hello\nworld",
          },
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
          artifact: {
            outputId: "artifact-translated-1",
            outputFormat: "txt",
          },
        },
      },
      {
        translateSegment: async ({ text, targetLanguage }) =>
          `[${targetLanguage}] ${text}`,
        now: () => 1000,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.translation.text).toBe("[zh-CN] hello\n[zh-CN] world");
    expect(result.output.artifact).toMatchObject({
      outputId: "artifact-translated-1",
      format: "txt",
      artifact: {
        name: "guide.zh-CN.txt",
        path: "memory://web-aigc-file-translation/artifact-translated-1/guide.zh-CN.txt",
      },
    });
    expect(result.output.observability.artifactPersisted).toBe(true);
  });

  it("read excel output parses an inline base64 workbook without reading user paths", async () => {
    const workbookBase64 = buildWorkbookBase64([
      ["Name", "Amount"],
      ["Ops", 12],
      ["QA", 8],
    ]);

    const result = await executeExcelReadNode({
      nodeType: "excel_read",
      input: {
        workbookBase64,
        fileName: "budget.xlsx",
        sheetName: "Budget",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.workbook).toMatchObject({
      fileName: "budget.xlsx",
      totalSheets: 1,
      sheetNames: ["Budget"],
    });
    expect(result.output.columns.map((column) => column.key)).toEqual([
      "Name",
      "Amount",
    ]);
    expect(result.output.rows).toEqual([
      { Name: "Ops", Amount: 12 },
      { Name: "QA", Amount: 8 },
    ]);
    expect(result.output.dynamicChart.compatible).toBe(true);
  });

  it("extracted long text output returns summary, keywords, fragments, and chunks", async () => {
    const result = await executeLongTextExtractionNode({
      nodeType: "long_text_extraction",
      input: {
        title: "Migration Contract",
        text: [
          "Migration contract tracks generated file artifacts and fake runtime behavior.",
          "Migration contract extracts stable summaries and fragments for review.",
          "File adapter contract keeps real user files out of the fake runtime.",
        ].join(" "),
        mode: "balanced",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.title).toBe("Migration Contract");
    expect(result.output.summary.short).toContain("Migration contract");
    expect(result.output.keywords.length).toBeGreaterThan(0);
    expect(result.output.fragments.length).toBeGreaterThan(0);
    expect(result.output.chunks.length).toBeGreaterThan(0);
    expect(result.output.structured.notes).toContain(
      `chunk_count:${result.output.source.chunkCount}`,
    );
  });

  it("rejects path traversal before fake artifact adapters can accept unsafe ids", async () => {
    const writeArtifactFile = vi.fn();
    const readArtifactPreview = vi.fn();

    expect(validateFileGenerationSegment("safe-output.1")).toBe(true);
    expect(validateFileGenerationSegment("..")).toBe(false);
    expect(validateFileGenerationSegment("../escape")).toBe(false);

    await expect(
      executeFileGenerationNode(
        {
          nodeType: "file_generation",
          input: {
            outputId: "../escape",
            filename: "contract.txt",
            format: "txt",
            content: "bad",
          },
        },
        { writeArtifactFile, readArtifactPreview },
      ),
    ).rejects.toThrow(/invalid file generation output path segment/i);
    expect(writeArtifactFile).not.toHaveBeenCalled();

    await expect(
      persistFileGenerationArtifact({
        outputId: "safe-output",
        filename: "../blocked.txt",
        content: "bad",
      }),
    ).rejects.toThrow(/invalid file generation output path segment/i);

    expect(validateWebAigcFileTranslationOutputSegment("safe-output.1")).toBe(
      true,
    );
    expect(validateWebAigcFileTranslationOutputSegment("..")).toBe(false);
    expect(validateWebAigcFileTranslationOutputSegment("../escape")).toBe(false);

    await expect(
      executeFileTranslationNode({
        nodeType: "file_translation",
        input: {
          file: {
            name: "guide.txt",
            content: "bad",
          },
          artifact: {
            outputId: "../escape",
            outputFormat: "txt",
          },
        },
      }),
    ).rejects.toThrow(/invalid file translation outputid/i);
  });
});
