/**
 * prompt.ts — co-located unit tests (~10 example-based tests).
 *
 * Validates `buildSpecDocumentsPrompt` determinism, locale awareness,
 * targetDocumentType branching, and field ordering.
 * Requirements: 2.2, 2.5, 3.1, 3.2, 9.2
 */

import { describe, it, expect } from "vitest";
import {
  buildSpecDocumentsPrompt,
  SPEC_DOCUMENTS_PROMPT_ID,
  type BuildSpecDocumentsPromptInput,
} from "./prompt.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMinimalInput(
  overrides?: Partial<BuildSpecDocumentsPromptInput>,
): BuildSpecDocumentsPromptInput {
  return {
    request: {
      targetText: "Build a user authentication system",
      githubUrls: ["https://github.com/example/repo"],
      projectId: "proj-1",
      sourceId: "src-1",
    } as any,
    specTreeNode: {
      id: "node-auth",
      title: "Authentication Module",
      summary: "Handles user login and session management",
      type: "route_step",
      priority: 1,
      dependencies: ["node-db"],
      outputs: ["auth-token"],
    } as any,
    targetDocumentType: "requirements",
    locale: "en-US",
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildSpecDocumentsPrompt", () => {
  // 6.1 确定性：同一组输入两次调用产出字节相同 userMessage
  it("produces byte-identical userMessage for the same input", () => {
    const input = makeMinimalInput({
      primaryRoute: {
        id: "route-1",
        title: "Main Route",
        summary: "Primary execution path",
        steps: [
          { id: "step-1", title: "Step One", description: "First step" },
          { id: "step-2", title: "Step Two", description: "Second step" },
        ],
      } as any,
      clarificationSession: {
        strategyId: "strat-1",
        templateId: "tmpl-1",
        answers: [
          { questionId: "q-b", answer: "Answer B" },
          { questionId: "q-a", answer: "Answer A" },
        ],
      } as any,
      domainContext: { projectId: "proj-1", updatedAt: "2026-01-01" } as any,
      upstreamEvidence: {
        reusableRoleFindings: [
          { id: "f-2", label: "Finding 2", summary: "Sum 2" },
          { id: "f-1", label: "Finding 1", summary: "Sum 1" },
        ],
      },
    });

    const result1 = buildSpecDocumentsPrompt(input);
    const result2 = buildSpecDocumentsPrompt(input);

    expect(result1.userMessage).toBe(result2.userMessage);
    expect(result1.promptFingerprint).toBe(result2.promptFingerprint);
  });

  // 6.2 输入变化敏感：追加一条新的 clarification answer 后 userMessage 发生变化
  it("changes userMessage and promptFingerprint when input changes", () => {
    const input1 = makeMinimalInput({
      clarificationSession: {
        strategyId: "s1",
        templateId: "t1",
        answers: [{ questionId: "q-a", answer: "A" }],
      } as any,
    });
    const input2 = makeMinimalInput({
      clarificationSession: {
        strategyId: "s1",
        templateId: "t1",
        answers: [
          { questionId: "q-a", answer: "A" },
          { questionId: "q-b", answer: "B" },
        ],
      } as any,
    });

    const result1 = buildSpecDocumentsPrompt(input1);
    const result2 = buildSpecDocumentsPrompt(input2);

    expect(result1.userMessage).not.toBe(result2.userMessage);
    expect(result1.promptFingerprint).not.toBe(result2.promptFingerprint);
  });

  // 6.3 answers 按 questionId 字典序排序
  it("sorts clarification answers by questionId lexicographically", () => {
    const input = makeMinimalInput({
      clarificationSession: {
        strategyId: "s1",
        templateId: "t1",
        answers: [
          { questionId: "q-c", answer: "C" },
          { questionId: "q-a", answer: "A" },
          { questionId: "q-b", answer: "B" },
        ],
      } as any,
    });

    const result = buildSpecDocumentsPrompt(input);
    const payload = result.userPayload as any;
    const answerIds = payload.clarification.answers.map(
      (a: any) => a.questionId,
    );

    expect(answerIds).toEqual(["q-a", "q-b", "q-c"]);
  });

  // 6.4 locale === "zh-CN" 时 systemMessage 包含 CJK 字符
  it("uses CJK characters in systemMessage when locale is zh-CN", () => {
    const input = makeMinimalInput({ locale: "zh-CN" });
    const result = buildSpecDocumentsPrompt(input);

    expect(result.systemMessage).toMatch(/[\u4e00-\u9fff]/);
  });

  // 6.5 locale === "en-US" 时 systemMessage 不含 CJK 且以英文开头
  it("uses English systemMessage without CJK when locale is en-US", () => {
    const input = makeMinimalInput({ locale: "en-US" });
    const result = buildSpecDocumentsPrompt(input);

    expect(result.systemMessage).not.toMatch(/[\u4e00-\u9fff]/);
    expect(result.systemMessage).toMatch(
      /^You are the \/autopilot SPEC Document/,
    );
  });

  // 6.6 SPEC_DOCUMENTS_PROMPT_ID 与 prompt 输出的 promptId 一致
  it("has SPEC_DOCUMENTS_PROMPT_ID equal to output promptId", () => {
    expect(SPEC_DOCUMENTS_PROMPT_ID).toBe("blueprint.spec-documents.v1");

    const input = makeMinimalInput();
    const result = buildSpecDocumentsPrompt(input);

    expect(result.promptId).toBe(SPEC_DOCUMENTS_PROMPT_ID);
    expect((result.userPayload as any).promptId).toBe(
      SPEC_DOCUMENTS_PROMPT_ID,
    );
  });

  // 6.7 三个 targetDocumentType 分支的 systemMessage 文本互不相同
  it("produces different systemMessage for requirements/design/tasks", () => {
    const reqResult = buildSpecDocumentsPrompt(
      makeMinimalInput({ targetDocumentType: "requirements" }),
    );
    const designResult = buildSpecDocumentsPrompt(
      makeMinimalInput({ targetDocumentType: "design" }),
    );
    const tasksResult = buildSpecDocumentsPrompt(
      makeMinimalInput({ targetDocumentType: "tasks" }),
    );

    expect(reqResult.systemMessage).not.toBe(designResult.systemMessage);
    expect(reqResult.systemMessage).not.toBe(tasksResult.systemMessage);
    expect(designResult.systemMessage).not.toBe(tasksResult.systemMessage);
  });

  // 6.8 primaryRoute.steps 在 userPayload 中保留原始顺序
  it("preserves primaryRoute.steps in original order", () => {
    const input = makeMinimalInput({
      primaryRoute: {
        id: "route-1",
        title: "Route",
        summary: "Sum",
        steps: [
          { id: "z-step", title: "Z Step", description: "Last alphabetically" },
          { id: "a-step", title: "A Step", description: "First alphabetically" },
          { id: "m-step", title: "M Step", description: "Middle" },
        ],
      } as any,
    });

    const result = buildSpecDocumentsPrompt(input);
    const payload = result.userPayload as any;
    const stepIds = payload.primaryRoute.steps.map((s: any) => s.id);

    // Original order preserved, NOT sorted alphabetically
    expect(stepIds).toEqual(["z-step", "a-step", "m-step"]);
  });

  // 6.9 userPayload.outputSchema 包含关键约束描述
  it("includes outputSchema with key constraint descriptions", () => {
    const input = makeMinimalInput();
    const result = buildSpecDocumentsPrompt(input);
    const schema = (result.userPayload as any).outputSchema;

    expect(schema).toBeDefined();
    expect(schema.title).toContain("200");
    expect(schema.summary).toContain("500");
    expect(schema.sections).toContain("2..20");
    expect(schema["sections[].id"]).toContain("kebab-case");
    expect(schema["sections[].title"]).toContain("200");
    expect(schema["sections[].summary"]).toContain("500");
    expect(schema["sections[].body"]).toContain("8000");
    expect(schema.status).toContain("draft");
  });

  // 6.10 upstreamEvidence 为 undefined 时 userPayload.upstreamEvidence 也为 undefined
  it("omits upstreamEvidence from userPayload when input is undefined", () => {
    const input = makeMinimalInput({ upstreamEvidence: undefined });
    const result = buildSpecDocumentsPrompt(input);

    expect(result.userPayload).not.toHaveProperty("upstreamEvidence");
  });
});
