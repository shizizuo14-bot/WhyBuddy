import { describe, expect, it } from "vitest";

import type {
  BlueprintClarificationAnswer,
  BlueprintIntake,
  BlueprintIntakePatchRequest,
} from "../../../../../shared/blueprint/contracts.js";
import { isClarificationAnswersNoop } from "../clarification-noop-detector.js";
import { isIntakePatchNoop } from "../intake-noop-detector.js";

function buildIntake(
  overrides: Partial<BlueprintIntake> = {},
): BlueprintIntake {
  return {
    id: "intake-a",
    targetText: "Original target",
    githubUrls: ["https://github.com/example/a"],
    sources: [],
    duplicateGithubUrls: [],
    domainNotes: [],
    assets: [],
    evidence: [],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 0,
      requiredTotal: 0,
      missingQuestionIds: [],
    },
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

function patch(
  overrides: BlueprintIntakePatchRequest,
): BlueprintIntakePatchRequest {
  return overrides;
}

describe("isIntakePatchNoop", () => {
  it("returns true when supplied targetText and githubUrls are structurally equal", () => {
    const intake = buildIntake();

    expect(
      isIntakePatchNoop(
        intake,
        patch({
          targetText: "Original target",
          githubUrls: ["https://github.com/example/a"],
        }),
      ),
    ).toBe(true);
  });

  it("returns false when either targetText or githubUrls differ", () => {
    const intake = buildIntake();

    expect(
      isIntakePatchNoop(intake, patch({ targetText: "Updated target" })),
    ).toBe(false);
    expect(
      isIntakePatchNoop(
        intake,
        patch({ githubUrls: ["https://github.com/example/b"] }),
      ),
    ).toBe(false);
  });
});

describe("isClarificationAnswersNoop", () => {
  const existing: BlueprintClarificationAnswer[] = [
    { questionId: "q-a", answer: "A" },
    { questionId: "q-b", answer: "B" },
  ];

  it("compares answers by questionId instead of array position", () => {
    expect(
      isClarificationAnswersNoop(existing, [
        { questionId: "q-b", answer: "B" },
        { questionId: "q-a", answer: "A" },
      ]),
    ).toBe(true);
  });

  it("returns false for changed or newly answered questions", () => {
    expect(
      isClarificationAnswersNoop(existing, [{ questionId: "q-a", answer: "A2" }]),
    ).toBe(false);
    expect(
      isClarificationAnswersNoop(existing, [{ questionId: "q-c", answer: "C" }]),
    ).toBe(false);
  });
});
