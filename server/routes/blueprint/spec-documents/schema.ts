/**
 * SPEC Documents LLM Response Schema — 严格 zod 校验。
 *
 * 定义 LLM 返回的 SPEC Document 结构化结果的 schema，
 * 包含 `.superRefine()` 跨字段文档级不变量。
 *
 * 本文件禁止 import 任何运行时 / 业务模块；
 * 仅 `import { z } from "zod"` 与 `import type { BlueprintSpecDocumentStatus }`。
 *
 * 对应 design §4.4 + requirements 3.1, 3.2, 3.3, 3.4, 3.5。
 */

import { z } from "zod";
import type { BlueprintSpecDocumentStatus } from "../../../../shared/blueprint/contracts.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Section ID 必须为 lowercase kebab-case，1..64 字符 */
export const SECTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * `BlueprintSpecDocumentStatus` 的已知受支持值子集。
 * LLM 返回的 `status` 只允许落在此集合；其它值直接 fail。
 */
export const SUPPORTED_STATUSES = [
  "draft",
  "reviewing",
  "accepted",
  "rejected",
] as const satisfies readonly BlueprintSpecDocumentStatus[];

// ─── Section Schema ──────────────────────────────────────────────────────────

export const SpecDocumentsLlmSectionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(SECTION_ID_PATTERN, "section.id must be lowercase kebab-case"),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  body: z.string().min(1).max(8_000),
});

// ─── Response Schema ─────────────────────────────────────────────────────────

export const SpecDocumentsLlmResponseSchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(500),
    sections: z.array(SpecDocumentsLlmSectionSchema).min(2).max(20),
    status: z.enum(SUPPORTED_STATUSES).optional(),
  })
  .superRefine((data, ctx) => {
    // (a) title / summary trim 后非空
    if (data.title.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "title must not be empty after trim",
      });
      return;
    }
    if (data.summary.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["summary"],
        message: "summary must not be empty after trim",
      });
      return;
    }

    // (b) 每个 section.title / summary / body trim 后非空
    for (let i = 0; i < data.sections.length; i++) {
      const section = data.sections[i];
      if (section.title.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "title"],
          message: "section.title must not be empty after trim",
        });
        return;
      }
      if (section.summary.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "summary"],
          message: "section.summary must not be empty after trim",
        });
        return;
      }
      if (section.body.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "body"],
          message: "section.body must not be empty after trim",
        });
        return;
      }
    }

    // (c) sections[*].id 唯一（trim + 大小写不敏感）
    const seen = new Set<string>();
    for (let i = 0; i < data.sections.length; i++) {
      const key = data.sections[i].id.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "id"],
          message: `duplicated section id="${data.sections[i].id}"`,
        });
        return;
      }
      seen.add(key);
    }
  });

// ─── Type Aliases ────────────────────────────────────────────────────────────

export type SpecDocumentsLlmResponse = z.infer<
  typeof SpecDocumentsLlmResponseSchema
>;
export type SpecDocumentsLlmSection = z.infer<
  typeof SpecDocumentsLlmSectionSchema
>;
