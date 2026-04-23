import { describe, expect, it } from "vitest";

import { executeFileSlicingNode } from "../routes/node-adapters/file-slicing-node-adapter.js";

describe("executeFileSlicingNode", () => {
  it("slices markdown content into paragraph chunks and emits RAG-compatible outputs", async () => {
    const result = await executeFileSlicingNode({
      nodeType: "file_slicing",
      input: {
        sourceType: "document",
        sourceId: "doc-1",
        projectId: "proj-1",
        fileName: "runbook.md",
        fileType: "markdown",
        content: `
# 支付排障

先检查支付状态，再核对回调状态。

如果仍有异常，请查看履约日志和告警面板。
        `,
        strategy: {
          mode: "paragraph",
          maxChars: 60,
        },
        metadata: {
          category: "ops",
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output.status).toBe("completed");
    expect(result.output.sourceType).toBe("document");
    expect(result.output.fileType).toBe("markdown");
    expect(result.output.strategy.mode).toBe("paragraph");
    expect(result.output.chunks.length).toBeGreaterThan(1);
    expect(result.output.chunks[0].chunkId).toBe("document:doc-1:0");
    expect(result.output.ingestionPayloads[0]).toMatchObject({
      sourceType: "document",
      sourceId: "doc-1#chunk-0",
      projectId: "proj-1",
      metadata: expect.objectContaining({
        chunkId: "document:doc-1:0",
        parentSourceId: "doc-1",
        fileType: "markdown",
        slicingMode: "paragraph",
        category: "ops",
      }),
    });
    expect(result.output.retrievalPreview[0]).toMatchObject({
      chunkId: "document:doc-1:0",
      sourceType: "document",
      sourceId: "doc-1",
      totalCandidates: result.output.chunks.length,
    });
  });

  it("supports line-based slicing for log files", async () => {
    const result = await executeFileSlicingNode({
      nodeType: "file_slicing",
      input: {
        sourceType: "mission_log",
        sourceId: "log-1",
        projectId: "proj-ops",
        fileType: "log",
        content: `
2026-04-23 10:00:00 INFO start workflow
2026-04-23 10:00:01 WARN callback delayed
2026-04-23 10:00:02 ERROR downstream timeout
        `,
        strategy: {
          mode: "line",
          maxChars: 80,
        },
      },
    });

    expect(result.output.fileType).toBe("log");
    expect(result.output.strategy.mode).toBe("line");
    expect(result.output.chunks.length).toBe(3);
    expect(result.output.chunks[1].content).toContain("WARN");
    expect(result.output.retrievalPreview[2].highlight).toContain("ERROR");
  });

  it("sanitizes html input and falls back to fixed window slicing", async () => {
    const result = await executeFileSlicingNode({
      nodeType: "file_slicing",
      input: {
        sourceType: "document",
        sourceId: "html-1",
        projectId: "proj-web",
        fileType: "html",
        content:
          "<html><body><h1>帮助中心</h1><p>先登录控制台。</p><script>bad()</script><p>再打开任务面板。</p></body></html>",
        strategy: {
          mode: "fixed_window",
          maxChars: 20,
          overlapChars: 5,
        },
      },
    });

    expect(result.output.chunks.length).toBeGreaterThan(1);
    expect(result.output.chunks[0].content).toContain("帮助中心");
    expect(result.output.chunks[0].content).not.toContain("script");
    expect(result.output.warnings).toContain(
      "HTML 内容已执行轻量标签清洗，仅保留正文文本。",
    );
  });

  it("rejects missing sourceId or content", async () => {
    await expect(
      executeFileSlicingNode({
        nodeType: "file_slicing",
        input: {
          projectId: "proj-1",
          content: "hello",
        },
      }),
    ).rejects.toThrow(/requires sourceId/i);

    await expect(
      executeFileSlicingNode({
        nodeType: "file_slicing",
        input: {
          sourceId: "doc-1",
          projectId: "proj-1",
        },
      }),
    ).rejects.toThrow(/requires content/i);
  });
});
