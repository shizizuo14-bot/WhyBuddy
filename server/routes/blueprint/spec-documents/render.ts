/**
 * SPEC Documents Markdown Renderer — 纯函数模块。
 *
 * 将 LLM 返回的结构化 sections 渲染为 Markdown 字符串。
 * 本文件禁止 import 任何运行时 / 业务模块（纯字符串拼接）。
 *
 * 对应 design §4.7 + requirements 2.4, 2.6。
 */

// ─── Interface ───────────────────────────────────────────────────────────────

export interface RenderSectionsInput {
  title: string;
  summary: string;
  sections: Array<{
    id: string;
    title: string;
    summary: string;
    body: string;
  }>;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

/**
 * 将结构化 sections 渲染为 Markdown 字符串。
 *
 * 规则（design §4.7）：
 * 1. 顶层 `# {title}` + 空行 + `{summary}` + 空行
 * 2. 每个 section `## {section.title}` + 空行 + `{section.body}` + 空行
 * 3. 不输出 `section.id` 与 `section.summary`（只用于校验 / 预览，不入 content）
 * 4. 最终产出以单个换行结束（`.replace(/\n+$/, "\n")`）
 *
 * 对 `title` / `summary` / `section.title` / `section.body` 做 `.trim()`（防御性）。
 */
export function renderSectionsToMarkdown(input: RenderSectionsInput): string {
  const title = input.title.trim();
  const summary = input.summary.trim();

  let md = `# ${title}\n\n${summary}\n\n`;

  for (const section of input.sections) {
    const sectionTitle = section.title.trim();
    const sectionBody = section.body.trim();
    md += `## ${sectionTitle}\n\n${sectionBody}\n\n`;
  }

  // Normalize trailing newlines to exactly one
  return md.replace(/\n+$/, "\n");
}
