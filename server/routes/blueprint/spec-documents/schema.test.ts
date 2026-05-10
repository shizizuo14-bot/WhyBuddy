import { describe, it, expect } from "vitest";
import { SpecDocumentsLlmResponseSchema } from "./schema.js";

/**
 * Helper: creates a valid minimal payload for reuse across tests.
 * Contains title + summary + 2 sections (the minimum required).
 */
function validMinimalPayload() {
  return {
    title: "Requirements: User Authentication",
    summary: "This document describes the authentication requirements.",
    sections: [
      {
        id: "overview",
        title: "Overview",
        summary: "High-level overview of the feature.",
        body: "The system shall support email and password authentication.",
      },
      {
        id: "acceptance-criteria",
        title: "Acceptance Criteria",
        summary: "Criteria for acceptance.",
        body: "Users must be able to log in with valid credentials.",
      },
    ],
  };
}

describe("SpecDocumentsLlmResponseSchema", () => {
  // 4.1 合法 minimal payload
  it("4.1 accepts a valid minimal payload (title + summary + 2 sections)", () => {
    const result = SpecDocumentsLlmResponseSchema.safeParse(validMinimalPayload());
    expect(result.success).toBe(true);
  });

  // 4.2 合法 full payload (20 sections, status: "accepted", 每个 section 含完整字段)
  it("4.2 accepts a full payload with 20 sections and status accepted", () => {
    const sections = Array.from({ length: 20 }, (_, i) => ({
      id: `section-${i + 1}`,
      title: `Section ${i + 1} Title`,
      summary: `Summary for section ${i + 1}`,
      body: `Body content for section ${i + 1}. This is detailed content.`,
    }));
    const payload = {
      title: "Design: Payment Gateway",
      summary: "Full design document for the payment gateway integration.",
      sections,
      status: "accepted" as const,
    };
    const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  // 4.3 title 缺失 / summary 缺失 / sections 缺失或非数组
  describe("4.3 required field validation", () => {
    it("fails when title is missing", () => {
      const { title, ...rest } = validMinimalPayload();
      const result = SpecDocumentsLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when summary is missing", () => {
      const { summary, ...rest } = validMinimalPayload();
      const result = SpecDocumentsLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when sections is missing", () => {
      const { sections, ...rest } = validMinimalPayload();
      const result = SpecDocumentsLlmResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("fails when sections is not an array", () => {
      const payload = { ...validMinimalPayload(), sections: "not-an-array" };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // 4.4 sections.length < 2 / > 20
  describe("4.4 sections array length bounds", () => {
    it("fails when sections has only 1 element", () => {
      const payload = {
        ...validMinimalPayload(),
        sections: [validMinimalPayload().sections[0]],
      };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when sections has 21 elements", () => {
      const sections = Array.from({ length: 21 }, (_, i) => ({
        id: `section-${i}`,
        title: `Title ${i}`,
        summary: `Summary ${i}`,
        body: `Body ${i}`,
      }));
      const payload = { ...validMinimalPayload(), sections };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // 4.5 section.id 非 kebab-case
  describe("4.5 section.id must be lowercase kebab-case", () => {
    const invalidIds = [
      { id: "SECTION-1", reason: "uppercase" },
      { id: "section_1", reason: "underscore" },
      { id: "1section", reason: "starts with digit" },
      { id: "", reason: "empty string" },
      { id: "a".repeat(65), reason: "65 characters (exceeds max 64)" },
    ];

    for (const { id, reason } of invalidIds) {
      it(`fails when section.id is "${id}" (${reason})`, () => {
        const payload = validMinimalPayload();
        payload.sections[0].id = id;
        const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    }
  });

  // 4.6 section.id 在数组内重复 (大小写不敏感)
  describe("4.6 duplicated section ids trigger superRefine failure", () => {
    it("fails when two sections have the same id", () => {
      const payload = validMinimalPayload();
      payload.sections[1].id = "overview";
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("duplicated"))).toBe(true);
      }
    });

    it("fails when ids differ only in case (case-insensitive)", () => {
      const payload = {
        ...validMinimalPayload(),
        sections: [
          { id: "overview", title: "A", summary: "A", body: "Body A content here." },
          { id: "overview", title: "B", summary: "B", body: "Body B content here." },
        ],
      };
      // Both are "overview" after toLowerCase
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("duplicated"))).toBe(true);
      }
    });
  });

  // 4.7 title trim 后为空
  describe("4.7 title must not be empty after trim", () => {
    it('fails when title is "   " (spaces only)', () => {
      const payload = { ...validMinimalPayload(), title: "   " };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("must not be empty after trim"))).toBe(true);
      }
    });

    it('fails when title is "\\t\\n" (whitespace only)', () => {
      const payload = { ...validMinimalPayload(), title: "\t\n" };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("must not be empty after trim"))).toBe(true);
      }
    });
  });

  // 4.8 summary trim 后为空
  it("4.8 fails when summary is whitespace-only (trim empty)", () => {
    const payload = { ...validMinimalPayload(), summary: "   " };
    const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("must not be empty after trim"))).toBe(true);
    }
  });

  // 4.9 section.title / section.summary / section.body trim 后为空
  describe("4.9 section fields must not be empty after trim", () => {
    it("fails when section.title is whitespace-only", () => {
      const payload = validMinimalPayload();
      payload.sections[0].title = "   ";
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when section.summary is whitespace-only", () => {
      const payload = validMinimalPayload();
      payload.sections[0].summary = "   ";
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when section.body is whitespace-only", () => {
      const payload = validMinimalPayload();
      payload.sections[0].body = "   ";
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // 4.10 title.length > 200 / summary.length > 500
  describe("4.10 top-level string length limits", () => {
    it("fails when title exceeds 200 characters", () => {
      const payload = { ...validMinimalPayload(), title: "a".repeat(201) };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when summary exceeds 500 characters", () => {
      const payload = { ...validMinimalPayload(), summary: "a".repeat(501) };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // 4.11 section.body.length > 8000 / section.title.length > 200 / section.summary.length > 500
  describe("4.11 section-level string length limits", () => {
    it("fails when section.body exceeds 8000 characters", () => {
      const payload = validMinimalPayload();
      payload.sections[0].body = "x".repeat(8001);
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when section.title exceeds 200 characters", () => {
      const payload = validMinimalPayload();
      payload.sections[0].title = "x".repeat(201);
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when section.summary exceeds 500 characters", () => {
      const payload = validMinimalPayload();
      payload.sections[0].summary = "x".repeat(501);
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // 4.12 status 非受支持值 / status 省略
  describe("4.12 status enum validation", () => {
    it('fails when status is "in_review" (unsupported)', () => {
      const payload = { ...validMinimalPayload(), status: "in_review" };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('fails when status is "archived" (unsupported)', () => {
      const payload = { ...validMinimalPayload(), status: "archived" };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('fails when status is "" (empty string)', () => {
      const payload = { ...validMinimalPayload(), status: "" };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("passes when status is omitted", () => {
      const payload = validMinimalPayload();
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  // 4.13 未知顶层字段 → zod strip 静默丢弃
  it("4.13 unknown top-level fields are silently stripped", () => {
    const payload = { ...validMinimalPayload(), author: "alice" };
    const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).author).toBeUndefined();
    }
  });

  // 4.14 未知 section 字段 → 同样被 strip
  it("4.14 unknown section fields are silently stripped", () => {
    const payload = validMinimalPayload();
    (payload.sections[0] as Record<string, unknown>).meta = "foo";
    const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.sections[0] as Record<string, unknown>).meta).toBeUndefined();
    }
  });

  // 4.15 ReDoS 哨兵：1000 字符 section.id → 被 max(64) 快速拒绝，耗时 < 50ms
  it("4.15 rejects a 1000-char section.id quickly (< 50ms) via max(64)", () => {
    const payload = validMinimalPayload();
    payload.sections[0].id = "a".repeat(1000);
    const start = performance.now();
    const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
    const elapsed = performance.now() - start;
    expect(result.success).toBe(false);
    expect(elapsed).toBeLessThan(50);
  });

  // 4.16 类型错误
  describe("4.16 type errors", () => {
    it('fails when sections is "not-an-array"', () => {
      const payload = { ...validMinimalPayload(), sections: "not-an-array" };
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("fails when section.body is a number instead of string", () => {
      const payload = validMinimalPayload();
      (payload.sections[0] as Record<string, unknown>).body = 123;
      const result = SpecDocumentsLlmResponseSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
