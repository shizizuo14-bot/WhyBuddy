/**
 * render.ts — co-located unit tests (~5 example-based tests).
 *
 * Validates `renderSectionsToMarkdown` pure function behavior.
 * Requirements: 2.4, 2.6
 */

import { describe, it, expect } from "vitest";
import { renderSectionsToMarkdown } from "./render.js";

describe("renderSectionsToMarkdown", () => {
  // 8.1 最小合法输入 → 精确匹配预期字节
  it("renders minimal valid input to expected Markdown bytes", () => {
    const result = renderSectionsToMarkdown({
      title: "My Document",
      summary: "A brief summary.",
      sections: [
        { id: "overview", title: "Overview", summary: "Overview summary", body: "This is the overview." },
        { id: "details", title: "Details", summary: "Details summary", body: "These are the details." },
      ],
    });

    const expected =
      "# My Document\n\nA brief summary.\n\n## Overview\n\nThis is the overview.\n\n## Details\n\nThese are the details.\n";
    expect(result).toBe(expected);
  });

  // 8.2 section.id 与 section.summary 不出现在 content 中
  it("does not include section.id or section.summary in output", () => {
    const result = renderSectionsToMarkdown({
      title: "Title",
      summary: "Summary",
      sections: [
        { id: "unique-section-id-abc", title: "Section One", summary: "hidden-summary-xyz", body: "Body one." },
        { id: "another-id-def", title: "Section Two", summary: "also-hidden-summary", body: "Body two." },
      ],
    });

    expect(result).not.toContain("unique-section-id-abc");
    expect(result).not.toContain("another-id-def");
    expect(result).not.toContain("hidden-summary-xyz");
    expect(result).not.toContain("also-hidden-summary");
  });

  // 8.3 多个 sections → 每个 section 之间用空行分隔，不产生多余连续换行
  it("separates multiple sections with blank lines without extra consecutive newlines", () => {
    const sections = Array.from({ length: 5 }, (_, i) => ({
      id: `section-${i}`,
      title: `Section ${i}`,
      summary: `Summary ${i}`,
      body: `Body content ${i}.`,
    }));

    const result = renderSectionsToMarkdown({
      title: "Multi Section Doc",
      summary: "Has five sections.",
      sections,
    });

    // Should not have 3+ consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
    // Each section header should be present
    for (let i = 0; i < 5; i++) {
      expect(result).toContain(`## Section ${i}`);
      expect(result).toContain(`Body content ${i}.`);
    }
    // Ends with single newline
    expect(result).toMatch(/[^\n]\n$/);
  });

  // 8.4 section.body 内部含 ## 二级标题 → 不被二次 escape，原样保留
  it("preserves ## headers inside section.body without escaping", () => {
    const result = renderSectionsToMarkdown({
      title: "Doc",
      summary: "Sum",
      sections: [
        { id: "a", title: "First", summary: "s", body: "## Sub header\n\nSome content under sub header." },
        { id: "b", title: "Second", summary: "s", body: "Normal body." },
      ],
    });

    expect(result).toContain("## Sub header\n\nSome content under sub header.");
  });

  // 8.5 输入含首尾空白 → 输出 content 中 trim 后的标题；结尾 \n+ 被规范化为单个 \n
  it("trims title/summary/section fields and normalizes trailing newlines", () => {
    const result = renderSectionsToMarkdown({
      title: "  Draft  ",
      summary: "  A summary with spaces  ",
      sections: [
        { id: "a", title: "  Spaced Title  ", summary: "s", body: "  Spaced body  " },
        { id: "b", title: "Normal", summary: "s", body: "Normal body" },
      ],
    });

    expect(result).toContain("# Draft\n");
    expect(result).toContain("A summary with spaces\n");
    expect(result).toContain("## Spaced Title\n");
    expect(result).toContain("Spaced body\n");
    // Ends with exactly one newline
    expect(result.endsWith("\n")).toBe(true);
    expect(result.endsWith("\n\n")).toBe(false);
  });
});
