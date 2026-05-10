import { describe, expect, it } from "vitest";

import {
  buildSpecTreePrompt,
  SPEC_TREE_PROMPT_ID,
  type BuildSpecTreePromptInput,
} from "./prompt.js";

/**
 * `prompt.ts` 的 co-located 单测。
 *
 * 覆盖：
 * 1. 确定性：同一组输入两次调用产出字节相同 userMessage
 * 2. 输入变化敏感：追加 clarification answer 后 userMessage 变化
 * 3. answers 按 questionId 字典序排序
 * 4. locale === "zh-CN" 时 systemMessage 包含 CJK 字符
 * 5. locale === "en-US" 时 systemMessage 不含 CJK 且以英文开头
 * 6. SPEC_TREE_PROMPT_ID 与 prompt 输出的 promptId 一致
 * 7. primaryRoute.steps 在 userPayload 中保留原始顺序
 * 8. userPayload.outputSchema 包含节点 type 枚举的 7 个值
 *
 * 所有断言都是 example-based，不声称是 PBT。
 *
 * **Validates: Requirements 2.2, 3.1, 3.2, 9.2**
 */

// ---------------------------------------------------------------------------
// Helper: build a valid BuildSpecTreePromptInput fixture
// ---------------------------------------------------------------------------

function createFixtureInput(
  overrides?: Partial<BuildSpecTreePromptInput>,
): BuildSpecTreePromptInput {
  return {
    request: {
      targetText: "Build a release dashboard for the team",
      githubUrls: ["https://github.com/org/repo"],
    },
    routeSet: {
      id: "rs-001",
      routes: [
        { id: "route-a", title: "Route A", summary: "Primary route" },
        { id: "route-b", title: "Route B", summary: "Alternative route" },
      ],
    },
    primaryRoute: {
      id: "route-a",
      title: "Route A",
      summary: "Primary route",
      rationale: "Best fit for the team",
      steps: [
        { id: "step-1", title: "Design", description: "Design the dashboard", role: "designer" },
        { id: "step-2", title: "Implement", description: "Build the frontend", role: "developer" },
        { id: "step-3", title: "Test", description: "Run integration tests", role: "tester" },
      ],
      stagesSummary: [{ stage: "planning", label: "Planning" }],
      capabilities: [{ id: "cap-1", label: "React UI" }],
    },
    alternativeRoutes: [
      { id: "route-b", title: "Route B", summary: "Alternative route" },
    ],
    clarificationSession: {
      id: "cs-001",
      strategyId: "strategy-default",
      templateId: "tmpl-001",
      answers: [
        { questionId: "q-b", answer: "Answer B" },
        { questionId: "q-a", answer: "Answer A" },
      ],
    },
    domainContext: {
      projectId: "proj-001",
      sourceId: "src-001",
      domain: "frontend",
      notes: "Use React 19",
    },
    locale: "en-US" as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildSpecTreePrompt", () => {
  it("6.1 确定性：同一组输入两次调用产出字节相同 userMessage", () => {
    const input = createFixtureInput();
    const result1 = buildSpecTreePrompt(input);
    const result2 = buildSpecTreePrompt(input);

    expect(result1.userMessage).toBe(result2.userMessage);
    expect(result1.promptFingerprint).toBe(result2.promptFingerprint);
  });

  it("6.2 输入变化敏感：追加一条新的 clarification answer 后 userMessage 发生变化", () => {
    const input1 = createFixtureInput();
    const result1 = buildSpecTreePrompt(input1);

    const input2 = createFixtureInput({
      clarificationSession: {
        ...input1.clarificationSession!,
        answers: [
          ...input1.clarificationSession!.answers,
          { questionId: "q-d", answer: "Answer D" },
        ],
      },
    });
    const result2 = buildSpecTreePrompt(input2);

    expect(result1.userMessage).not.toBe(result2.userMessage);
    expect(result1.promptFingerprint).not.toBe(result2.promptFingerprint);
  });

  it("6.3 answers 按 questionId 字典序排序（输入 [q-c, q-a, q-b] → 输出顺序 [q-a, q-b, q-c]）", () => {
    const input = createFixtureInput({
      clarificationSession: {
        strategyId: "s",
        templateId: "t",
        answers: [
          { questionId: "q-c", answer: "C" },
          { questionId: "q-a", answer: "A" },
          { questionId: "q-b", answer: "B" },
        ],
      },
    });

    const result = buildSpecTreePrompt(input);
    const payload = JSON.parse(result.userMessage);
    const questionIds = payload.clarification.answers.map(
      (a: { questionId: string }) => a.questionId,
    );

    expect(questionIds).toEqual(["q-a", "q-b", "q-c"]);
  });

  it("6.4 locale === 'zh-CN' 时 systemMessage 包含 CJK 字符", () => {
    const input = createFixtureInput({ locale: "zh-CN" });
    const result = buildSpecTreePrompt(input);

    expect(result.systemMessage).toMatch(/[\u4e00-\u9fff]/);
  });

  it("6.5 locale === 'en-US' 时 systemMessage 不含 CJK 且以英文开头", () => {
    const input = createFixtureInput({ locale: "en-US" });
    const result = buildSpecTreePrompt(input);

    expect(result.systemMessage).not.toMatch(/[\u4e00-\u9fff]/);
    // The English system message starts with "You are the SPEC Tree reasoner inside the /autopilot pipeline."
    expect(result.systemMessage).toMatch(/^You are the SPEC Tree reasoner/);
  });

  it("6.6 SPEC_TREE_PROMPT_ID === 'blueprint.spec-tree.v1' 与 prompt 输出的 promptId 一致", () => {
    expect(SPEC_TREE_PROMPT_ID).toBe("blueprint.spec-tree.v1");

    const input = createFixtureInput();
    const result = buildSpecTreePrompt(input);

    expect(result.promptId).toBe(SPEC_TREE_PROMPT_ID);
    expect(result.promptId).toBe("blueprint.spec-tree.v1");
  });

  it("6.7 primaryRoute.steps 在 userPayload 中保留原始顺序（不被字典序排序）", () => {
    const input = createFixtureInput({
      primaryRoute: {
        id: "route-a",
        title: "Route A",
        summary: "Primary",
        steps: [
          { id: "step-z", title: "Zulu", description: "Last alphabetically", role: "dev" },
          { id: "step-a", title: "Alpha", description: "First alphabetically", role: "dev" },
          { id: "step-m", title: "Mike", description: "Middle alphabetically", role: "dev" },
        ],
      },
    });

    const result = buildSpecTreePrompt(input);
    const payload = JSON.parse(result.userMessage);
    const stepIds = payload.primaryRoute.steps.map(
      (s: { id: string }) => s.id,
    );

    // Steps should preserve original order, NOT be sorted alphabetically
    expect(stepIds).toEqual(["step-z", "step-a", "step-m"]);
  });

  it("6.8 userPayload.outputSchema 包含节点 type 枚举的 7 个值的文案提示", () => {
    const input = createFixtureInput();
    const result = buildSpecTreePrompt(input);
    const payload = JSON.parse(result.userMessage);

    const typeField = payload.outputSchema["nodes[].type"] as string;
    expect(typeField).toBeDefined();

    // All 7 type enum values must be mentioned
    const expectedTypes = [
      "root",
      "route_step",
      "alternative_route",
      "spec_document",
      "effect_preview",
      "prompt_package",
      "engineering_plan",
    ];

    for (const t of expectedTypes) {
      expect(typeField).toContain(t);
    }
  });
});
