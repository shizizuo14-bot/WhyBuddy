import { describe, expect, it } from "vitest";

import type {
  BlueprintClarificationAnswer,
  BlueprintClarificationSession,
  BlueprintGenerationRequest,
  BlueprintIntake,
  BlueprintProjectDomainContext,
} from "../../../../shared/blueprint/index.js";

import {
  buildRouteSetPrompt,
  ROUTE_SET_PROMPT_ID,
  type RouteSetPromptInput,
} from "./route-prompt.js";

/**
 * `route-prompt.ts` 的 co-located 单测。
 *
 * 覆盖 design §4.4 / tasks.md §5 约定的 6 类场景：
 *  5.1 确定性：同一输入产出 byte-identical `userMessage`；
 *  5.2 输入变化敏感：追加一条新的 clarification answer 后 `userMessage` 变化；
 *  5.3 `answers` 按 `questionId` 字典序排序；
 *  5.4 `locale === "zh-CN"` 时 `systemMessage` 包含 CJK 字符；
 *  5.5 `locale === "en-US"` 时 `systemMessage` 以
 *      `"You are the /autopilot RouteSet planner"` 开头；
 *  5.6 `prompt.promptId` 恒等于 `"blueprint.routeset.v1"`。
 *
 * Validates: Requirements 3.1, 3.2, 6.3, 9.2
 */

const FIXED_TIMESTAMP = "2026-05-07T00:00:00.000Z";

function makeRequest(
  overrides: Partial<BlueprintGenerationRequest> = {},
): BlueprintGenerationRequest {
  return {
    projectId: "project-1",
    sourceId: "source-1",
    targetText: "Ship a balanced autopilot planner",
    githubUrls: ["https://github.com/example/repo"],
    ...overrides,
  };
}

function makeIntake(overrides: Partial<BlueprintIntake> = {}): BlueprintIntake {
  return {
    id: "intake-1",
    projectId: "project-1",
    sourceId: "source-1",
    targetText: "Ship a balanced autopilot planner",
    githubUrls: ["https://github.com/example/repo"],
    sources: [
      {
        id: "src-b",
        kind: "repository",
        url: "https://github.com/example/repo",
        normalizedUrl: "https://github.com/example/repo",
        owner: "example",
        repo: "repo",
        slug: "example/repo",
        evidenceIds: ["evidence-1"],
      },
      {
        id: "src-a",
        kind: "repository",
        url: "https://github.com/example/other",
        normalizedUrl: "https://github.com/example/other",
        owner: "example",
        repo: "other",
        slug: "example/other",
        evidenceIds: ["evidence-2"],
      },
    ],
    duplicateGithubUrls: [],
    domainNotes: ["focus on balanced delivery"],
    assets: [
      {
        id: "asset-b",
        kind: "product_goal",
        title: "Ship balanced planner",
        summary: "Primary product goal",
        sourceIds: ["src-b"],
        evidenceIds: ["evidence-1"],
        tags: ["balanced"],
        createdAt: FIXED_TIMESTAMP,
      },
      {
        id: "asset-a",
        kind: "domain_note",
        title: "Domain context",
        summary: "Needs a balanced plan",
        sourceIds: [],
        evidenceIds: [],
        tags: ["context"],
        createdAt: FIXED_TIMESTAMP,
      },
    ],
    evidence: [],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 2,
      requiredTotal: 2,
      missingQuestionIds: [],
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function makeAnswer(
  questionId: string,
  answer: string,
): BlueprintClarificationAnswer {
  return {
    questionId,
    answer,
    source: "user",
  };
}

function makeSession(
  overrides: Partial<BlueprintClarificationSession> = {},
): BlueprintClarificationSession {
  return {
    id: "session-1",
    intakeId: "intake-1",
    projectId: "project-1",
    strategyId: "target_first",
    templateId: "template-1",
    questions: [],
    answers: [
      makeAnswer("q-c", "answer to c"),
      makeAnswer("q-a", "answer to a"),
      makeAnswer("q-b", "answer to b"),
    ],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 3,
      requiredTotal: 3,
      missingQuestionIds: [],
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function makeProjectContext(): BlueprintProjectDomainContext {
  return {
    projectId: "project-1",
    updatedAt: FIXED_TIMESTAMP,
    intakeIds: ["intake-1"],
    sourceIds: ["src-a", "src-b"],
    assets: [],
    evidence: [],
  };
}

function makeInput(
  overrides: Partial<RouteSetPromptInput> = {},
): RouteSetPromptInput {
  return {
    request: makeRequest(),
    intake: makeIntake(),
    clarificationSession: makeSession(),
    projectContext: makeProjectContext(),
    locale: "en-US",
    ...overrides,
  };
}

describe("buildRouteSetPrompt", () => {
  it("5.1 同一输入下 userMessage 必须 byte-identical（确定性）", () => {
    const input = makeInput();

    const first = buildRouteSetPrompt(input);
    const second = buildRouteSetPrompt(input);

    expect(second.userMessage).toBe(first.userMessage);
    expect(second.systemMessage).toBe(first.systemMessage);
    expect(second.promptId).toBe(first.promptId);
  });

  it("5.2 追加一条新的 clarification answer 后 userMessage 必须变化", () => {
    const baseInput = makeInput();
    const base = buildRouteSetPrompt(baseInput);

    const extendedSession = makeSession({
      answers: [
        ...makeSession().answers,
        makeAnswer("q-d", "answer added after the fact"),
      ],
    });
    const extendedInput = makeInput({
      clarificationSession: extendedSession,
    });
    const extended = buildRouteSetPrompt(extendedInput);

    expect(extended.userMessage).not.toBe(base.userMessage);
    expect(extended.userMessage).toContain("q-d");
  });

  it("5.3 answers 必须按 questionId 字典序排序", () => {
    const input = makeInput();

    const prompt = buildRouteSetPrompt(input);

    const clarification = prompt.userPayload.clarification as
      | { answers: BlueprintClarificationAnswer[] }
      | undefined;
    expect(clarification).toBeDefined();
    const orderedIds = (clarification?.answers ?? []).map(
      (entry) => entry.questionId,
    );
    expect(orderedIds).toEqual(["q-a", "q-b", "q-c"]);
  });

  it("5.4 locale === \"zh-CN\" 时 systemMessage 必须包含 CJK 字符", () => {
    const prompt = buildRouteSetPrompt(makeInput({ locale: "zh-CN" }));

    expect(prompt.systemMessage).toMatch(/[\u4e00-\u9fff]/);
  });

  it("5.5 locale === \"en-US\" 时 systemMessage 必须以 RouteSet planner 句首开头", () => {
    const prompt = buildRouteSetPrompt(makeInput({ locale: "en-US" }));

    expect(
      prompt.systemMessage.startsWith(
        "You are the /autopilot RouteSet planner",
      ),
    ).toBe(true);
  });

  it("5.6 prompt.promptId 恒等于 'blueprint.routeset.v1'", () => {
    const prompt = buildRouteSetPrompt(makeInput());

    expect(prompt.promptId).toBe("blueprint.routeset.v1");
    expect(prompt.promptId).toBe(ROUTE_SET_PROMPT_ID);
    expect(prompt.userPayload.promptId).toBe("blueprint.routeset.v1");
  });
});
