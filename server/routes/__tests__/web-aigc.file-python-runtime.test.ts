import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeExcelReadNode } from "../node-adapters/excel-read-node-adapter.js";
import { executeFileGenerationNode } from "../node-adapters/file-generation-node-adapter.js";
import {
  clearFileTranslationOutputStoreForTests,
  executeFileTranslationNode,
} from "../node-adapters/file-translation-node-adapter.js";
import { executeFileSlicingNode } from "../node-adapters/file-slicing-node-adapter.js";
import { executeLongTextExtractionNode } from "../node-adapters/long-text-extraction-node-adapter.js";

const pythonRuntime = {
  backend: "python",
  provider: "fake",
  externalCalls: false,
  persisted: false,
} as const;

function buildWorkbookBase64(rows: unknown[][]): string {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Runtime");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })).toString(
    "base64",
  );
}

afterEach(() => {
  clearFileTranslationOutputStoreForTests();
  vi.restoreAllMocks();
});

describe("web AIGC file Python runtime bridge", () => {
  it("file generation accepts Python runtime artifact evidence without writing real files", async () => {
    const runtime = {
      ...pythonRuntime,
      source: "python-file-generation-runtime",
    };
    const writeArtifactFile = vi.fn(async () => ({
      outputId: "artifact-runtime-1",
      artifact: {
        kind: "file" as const,
        name: "runtime.md",
        path: "memory://web-aigc-file-adapter/artifact-runtime-1/runtime.md",
        mimeType: "text/markdown",
        downloadUrl: "/api/file-generation/outputs/artifact-runtime-1/runtime.md?download=1",
        previewUrl: "/api/file-generation/outputs/artifact-runtime-1/runtime.md/preview",
        description: "fake Python runtime artifact",
      },
      absolutePath: "memory://web-aigc-file-adapter/artifact-runtime-1/runtime.md",
    }));
    const readArtifactPreview = vi.fn(async () => ({
      inlineText: "# Runtime\n\nPython file runtime.",
      truncated: false,
      sizeBytes: 31,
      contentType: "text/markdown",
    }));

    const result = await executeFileGenerationNode(
      {
        nodeType: "file_generation",
        input: {
          filename: "runtime.md",
          format: "md",
          content: "# Runtime\n\nPython file runtime.",
          outputId: "artifact-runtime-1",
          context: {
            provenance: {
              provider: "fake",
              runtime: "python-contract",
              kind: "file_generation",
              operation: "generated",
            },
            runtime,
          },
        },
      },
      { writeArtifactFile, readArtifactPreview },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.context.runtime).toMatchObject(runtime);
    expect(result.output.context.provenance).toMatchObject({
      provider: "fake",
      kind: "file_generation",
    });
    expect(result.output.artifact.artifact.path).toBe(
      "memory://web-aigc-file-adapter/artifact-runtime-1/runtime.md",
    );
    expect(writeArtifactFile).toHaveBeenCalledOnce();
    expect(readArtifactPreview).toHaveBeenCalledWith(
      "memory://web-aigc-file-adapter/artifact-runtime-1/runtime.md",
    );
  });

  it("file slicing carries Python runtime context while keeping retrieval preview local", async () => {
    const runtime = {
      ...pythonRuntime,
      source: "python-file-slicing-runtime",
    };
    const result = await executeFileSlicingNode({
      nodeType: "file_slicing",
      input: {
        sourceType: "document",
        sourceId: "python-runtime-source",
        projectId: "project-runtime",
        fileName: "runtime.txt",
        fileType: "text",
        content: "alpha beta gamma delta epsilon zeta eta theta",
        strategy: { mode: "fixed_window", maxChars: 16, overlapChars: 0 },
        metadata: {
          provenance: {
            provider: "fake",
            runtime: "python-contract",
            kind: "file_slicing",
            operation: "sliced",
          },
          runtime,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.chunks.length).toBeGreaterThan(1);
    expect(result.output.chunks[0].metadata).toMatchObject({
      runtime,
      provenance: {
        provider: "fake",
        kind: "file_slicing",
      },
    });
    expect(result.output.retrievalPreview[0].chunkId).toBe(
      result.output.chunks[0].chunkId,
    );
  });

  it("file translation accepts Python runtime provenance and does not call a real translator", async () => {
    const translateSegment = vi.fn(
      async ({ text, targetLanguage }: { text: string; targetLanguage: string }) =>
        `[${targetLanguage}] ${text}`,
    );

    const result = await executeFileTranslationNode(
      {
        nodeType: "file_translation",
        input: {
          file: { name: "guide.txt", content: "hello\nworld" },
          targetLanguage: "zh-CN",
          artifact: { outputId: "translation-runtime-1", outputFormat: "txt" },
          context: {
            provenance: {
              provider: "fake",
              runtime: "python-contract",
              kind: "file_translation",
              operation: "translated",
            },
            runtime: {
              ...pythonRuntime,
              source: "python-file-translation-runtime",
            },
          },
        },
      },
      { translateSegment, now: () => 1000 },
    );

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.translation.text).toBe("[zh-CN] hello\n[zh-CN] world");
    expect(result.output.context.runtime).toMatchObject({
      backend: "python",
      source: "python-file-translation-runtime",
    });
    expect(result.output.artifact?.artifact.path).toBe(
      "memory://web-aigc-file-translation/translation-runtime-1/guide.zh-CN.txt",
    );
    expect(translateSegment).toHaveBeenCalledTimes(2);
  });

  it("excel read and long text extraction preserve Python runtime context without external services", async () => {
    const workbookBase64 = buildWorkbookBase64([
      ["Name", "Amount"],
      ["Ops", 12],
    ]);
    const excel = await executeExcelReadNode({
      nodeType: "excel_read",
      input: {
        workbookBase64,
        fileName: "runtime.xlsx",
        sheetName: "Runtime",
        context: {
          runtime: {
            ...pythonRuntime,
            source: "python-excel-read-runtime",
          },
        },
      },
    });
    const text = await executeLongTextExtractionNode({
      nodeType: "long_text_extraction",
      input: {
        title: "Runtime Extraction",
        text: "Python runtime extraction keeps provenance and safe local summary evidence.",
        context: {
          runtime: {
            ...pythonRuntime,
            source: "python-long-text-extraction-runtime",
          },
        },
      },
    });

    expect(excel.ok).toBe(true);
    expect(excel.output.status).toBe("completed");
    expect(excel.output.context.runtime).toMatchObject({
      backend: "python",
      source: "python-excel-read-runtime",
    });
    expect(text.ok).toBe(true);
    expect(text.output.status).toBe("completed");
    expect(text.output.context.runtime).toMatchObject({
      backend: "python",
      source: "python-long-text-extraction-runtime",
    });
  });
});
