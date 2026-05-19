import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildRoleArchitecturePrompt,
  ROLE_ARCHITECTURE_PROMPT_ID,
  type BuildRoleArchitecturePromptInput,
} from "./prompt.js";

/**
 * Validates: Requirements 2.2, 2.3, 2.6, 2.8, 9.2
 *
 * ~7 example-based tests covering:
 * - Determinism (same input → same output)
 * - Locale-aware system message (zh-CN vs en-US)
 * - Clarification answers sorted by questionId
 * - Prompt ID constant value
 * - Prompt fingerprint format and correctness
 * - selectedRoute.steps passthrough order
 * - userMessage content inclusion and clarification undefined handling
 */
describe("buildRoleArchitecturePrompt", () => {
  const baseInput: BuildRoleArchitecturePromptInput = {
    request: {
      targetText: "Build a release dashboard",
      githubUrls: ["https://github.com/example/repo"],
      domainContext: { domain: "devops" },
      projectId: "proj-1",
      sourceId: "src-1",
    },
    clarificationSession: {
      strategyId: "strategy-1",
      templateId: "template-1",
      answers: [
        { questionId: "q-b", answer: "Answer B" },
        { questionId: "q-a", answer: "Answer A" },
      ],
      locale: "en-US",
    },
    route: {
      id: "route-1",
      title: "Primary Route",
      summary: "Main execution path",
      steps: [
        { title: "S1", description: "Step one", role: "planner" },
        { title: "S2", description: "Step two", role: "executor" },
      ],
    },
    routeSet: {
      routes: [
        { id: "route-1", title: "Primary Route", summary: "Main path" },
        { id: "route-2", title: "Alt Route", summary: "Alternative path" },
      ],
      stagesSummary: [
        { stage: "planning", label: "Planning" },
        { stage: "execution", label: "Execution" },
      ],
    },
    primaryRouteId: "route-1",
    locale: "en-US",
  };

  // 10.1 Determinism: same input produces same output
  it("produces deterministic userMessage and promptFingerprint for same input", () => {
    const result1 = buildRoleArchitecturePrompt(baseInput);
    const result2 = buildRoleArchitecturePrompt(baseInput);

    expect(result1.userMessage).toBe(result2.userMessage);
    expect(result1.promptFingerprint).toBe(result2.promptFingerprint);
  });

  // 10.2 Locale-aware system message
  it("uses CJK system message for zh-CN locale and English for en-US", () => {
    const zhInput: BuildRoleArchitecturePromptInput = {
      ...baseInput,
      clarificationSession: {
        ...baseInput.clarificationSession!,
        locale: "zh-CN",
      },
      locale: "zh-CN",
    };
    const zhResult = buildRoleArchitecturePrompt(zhInput);
    expect(zhResult.systemMessage).toMatch(/[\u4e00-\u9fa5]/);

    const enResult = buildRoleArchitecturePrompt(baseInput);
    expect(enResult.systemMessage).not.toMatch(/[\u4e00-\u9fa5]/);
    expect(enResult.systemMessage).toMatch(/^[A-Z]/);
  });

  // 10.3 Clarification answers sorted by questionId
  it("sorts clarification answers by questionId ascending", () => {
    const result = buildRoleArchitecturePrompt(baseInput);
    const payload = result.userPayload as Record<string, unknown>;
    const clarification = payload.clarification as {
      answers: Array<{ questionId: string; answer: string }>;
    };

    expect(clarification.answers[0].questionId).toBe("q-a");
    expect(clarification.answers[1].questionId).toBe("q-b");
  });

  // 10.4 Prompt ID constant value
  it("has ROLE_ARCHITECTURE_PROMPT_ID equal to 'blueprint.role-architecture.v1'", () => {
    expect(ROLE_ARCHITECTURE_PROMPT_ID).toBe("blueprint.role-architecture.v1");

    const result = buildRoleArchitecturePrompt(baseInput);
    expect(result.promptId).toBe(ROLE_ARCHITECTURE_PROMPT_ID);
  });

  // 10.5 Prompt fingerprint format and correctness
  it("produces a valid sha256 fingerprint matching manual computation", () => {
    const result = buildRoleArchitecturePrompt(baseInput);

    // Format check
    expect(result.promptFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Manual computation
    const expectedHash = createHash("sha256")
      .update(result.systemMessage + "\n\n" + result.userMessage, "utf8")
      .digest("hex");
    expect(result.promptFingerprint).toBe("sha256:" + expectedHash);
  });

  // 10.6 selectedRoute.steps passthrough order (not sorted)
  it("preserves selectedRoute.steps in input order without sorting", () => {
    const inputWithUnorderedSteps: BuildRoleArchitecturePromptInput = {
      ...baseInput,
      route: {
        id: "route-1",
        title: "Primary Route",
        summary: "Main path",
        steps: [
          { title: "S3", description: "Third", role: "reviewer" },
          { title: "S1", description: "First", role: "planner" },
          { title: "S2", description: "Second", role: "executor" },
        ],
      },
    };

    const result = buildRoleArchitecturePrompt(inputWithUnorderedSteps);
    const payload = result.userPayload as Record<string, unknown>;
    const selectedRoute = payload.selectedRoute as {
      steps: Array<{ title: string; description: string; role: string }>;
    };

    expect(selectedRoute.steps.map((s) => s.title)).toEqual(["S3", "S1", "S2"]);
    // Each step has title, description, role
    for (const step of selectedRoute.steps) {
      expect(step).toHaveProperty("title");
      expect(step).toHaveProperty("description");
      expect(step).toHaveProperty("role");
    }
  });

  // 10.7 userMessage content inclusion and clarification undefined handling
  it("includes targetText, githubUrls, primaryRouteId in userMessage; omits clarification when undefined", () => {
    const inputWithUrls: BuildRoleArchitecturePromptInput = {
      ...baseInput,
      request: {
        targetText: "Build a release dashboard",
        githubUrls: ["url1", "url2"],
      },
      primaryRouteId: "rs-abc:primary",
    };

    const result = buildRoleArchitecturePrompt(inputWithUrls);
    expect(result.userMessage).toContain("Build a release dashboard");
    expect(result.userMessage).toContain("url1");
    expect(result.userMessage).toContain("url2");
    // githubUrls appear in input order
    const url1Idx = result.userMessage.indexOf("url1");
    const url2Idx = result.userMessage.indexOf("url2");
    expect(url1Idx).toBeLessThan(url2Idx);

    // When clarificationSession is undefined, clarification key should not appear
    const noClarInput: BuildRoleArchitecturePromptInput = {
      ...baseInput,
      clarificationSession: undefined,
    };
    const noClarResult = buildRoleArchitecturePrompt(noClarInput);
    const parsed = JSON.parse(noClarResult.userMessage);
    expect(parsed.clarification).toBeUndefined();
  });
});
