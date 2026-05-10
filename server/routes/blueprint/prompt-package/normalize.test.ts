/**
 * Unit tests for normalizePromptPackageResponse
 * (autopilot-prompt-package-llm, task 8).
 *
 * Validates the 7-step normalization contract documented in:
 *   - requirements.md 3.6
 *   - design.md §4.6
 *   - tasks.md 8.1–8.7
 *
 * Every test case is example-based (no PBT in this spec per requirement 9.3).
 */

import { describe, expect, it } from "vitest";

import { createDefaultPromptPackageLlmPolicy } from "./policy.js";
import { normalizePromptPackageResponse } from "./normalize.js";
import type { PromptPackageLlmResponse } from "./schema.js";

/**
 * Helper: create a minimal valid payload matching PromptPackageLlmResponse.
 */
function createMinimalPayload(
  overrides: Partial<PromptPackageLlmResponse> = {},
): PromptPackageLlmResponse {
  return {
    title: "Test Title",
    summary: "Test Summary",
    prompts: [
      {
        id: "test-prompt",
        title: "Test Prompt",
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Generate code for {{task}}.",
        variables: [
          { name: "task", description: "The task to complete", required: true },
        ],
        examples: [
          { title: "Example 1", input: "Build a form", output: "Here is the form code..." },
        ],
      },
    ],
    sections: [
      { heading: "Overview", body: "This is the overview section." },
    ],
    ...overrides,
  };
}

describe("normalizePromptPackageResponse (task 8)", () => {
  const policy = createDefaultPromptPackageLlmPolicy();
  const dummyInput = {};

  describe("8.1 — full normalization pass on valid payload", () => {
    it("trims all string fields, slugifies prompt ids, deduplicates, and defaults examples", () => {
      const payload = createMinimalPayload({
        title: "  Padded Title  ",
        summary: "  Padded Summary  ",
        prompts: [
          {
            id: "  My Prompt  ",
            title: "  Prompt Title  ",
            systemPrompt: "  system  ",
            userPrompt: "  user  ",
            variables: [
              { name: "  varName  ", description: "  desc  ", required: true },
            ],
            examples: undefined,
          },
        ],
        sections: [
          { heading: "  Section One  ", body: "  body content  " },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, policy);

      // Trimmed
      expect(result.title).toBe("Padded Title");
      expect(result.summary).toBe("Padded Summary");
      expect(result.prompts[0].title).toBe("Prompt Title");
      expect(result.prompts[0].systemPrompt).toBe("system");
      expect(result.prompts[0].userPrompt).toBe("user");
      expect(result.prompts[0].variables[0].name).toBe("varName");
      expect(result.prompts[0].variables[0].description).toBe("desc");
      expect(result.sections[0].heading).toBe("Section One");
      expect(result.sections[0].body).toBe("body content");

      // Slugified id
      expect(result.prompts[0].id).toBe("my-prompt");

      // Examples defaulted to empty array
      expect(result.prompts[0].examples).toEqual([]);
    });
  });

  describe("8.2 — duplicate prompt ids get numeric suffixes preserving order", () => {
    it('deduplicates ["setup", "Setup", "setup"] → ["setup", "setup-2", "setup-3"]', () => {
      const payload = createMinimalPayload({
        prompts: [
          {
            id: "setup",
            title: "First",
            systemPrompt: "sys1",
            userPrompt: "usr1",
            variables: [],
          },
          {
            id: "Setup",
            title: "Second",
            systemPrompt: "sys2",
            userPrompt: "usr2",
            variables: [],
          },
          {
            id: "setup",
            title: "Third",
            systemPrompt: "sys3",
            userPrompt: "usr3",
            variables: [],
          },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, policy);

      expect(result.prompts[0].id).toBe("setup");
      expect(result.prompts[1].id).toBe("setup-2");
      expect(result.prompts[2].id).toBe("setup-3");

      // Verify original order preserved (titles match)
      expect(result.prompts[0].title).toBe("First");
      expect(result.prompts[1].title).toBe("Second");
      expect(result.prompts[2].title).toBe("Third");
    });
  });

  describe("8.3 — prompt ids with whitespace are slugified", () => {
    it('slugifies "Main Setup" → "main-setup" and "deploy feed" → "deploy-feed"', () => {
      const payload = createMinimalPayload({
        prompts: [
          {
            id: "Main Setup",
            title: "P1",
            systemPrompt: "sys",
            userPrompt: "usr",
            variables: [],
          },
          {
            id: "deploy feed",
            title: "P2",
            systemPrompt: "sys",
            userPrompt: "usr",
            variables: [],
          },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, policy);

      expect(result.prompts[0].id).toBe("main-setup");
      expect(result.prompts[1].id).toBe("deploy-feed");
    });
  });

  describe("8.4 — duplicate variable names within a prompt get numeric suffixes", () => {
    it('deduplicates ["id", "ID", " id "] → all different, preserving original case', () => {
      const payload = createMinimalPayload({
        prompts: [
          {
            id: "test",
            title: "Test",
            systemPrompt: "sys",
            userPrompt: "usr",
            variables: [
              { name: "id", description: "first", required: true },
              { name: "ID", description: "second", required: false },
              { name: " id ", description: "third", required: true },
            ],
          },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, policy);

      const names = result.prompts[0].variables.map((v) => v.name);
      // All names should be unique
      expect(new Set(names).size).toBe(3);
      // First keeps original (trimmed)
      expect(names[0]).toBe("id");
      // Second gets suffix (preserves original case "ID" but appended)
      expect(names[1]).toBe("ID-2");
      // Third gets suffix (trimmed "id" + suffix)
      expect(names[2]).toBe("id-3");
    });
  });

  describe("8.5 — duplicate section headings get numeric suffixes", () => {
    it('deduplicates ["Overview", "overview"] → different headings with suffix', () => {
      const payload = createMinimalPayload({
        sections: [
          { heading: "Overview", body: "First body" },
          { heading: "overview", body: "Second body" },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, policy);

      expect(result.sections[0].heading).toBe("Overview");
      expect(result.sections[1].heading).toBe("overview-2");
      // Order preserved
      expect(result.sections[0].body).toBe("First body");
      expect(result.sections[1].body).toBe("Second body");
    });
  });

  describe("8.6 — examples undefined defaults to [], empty array stays empty", () => {
    it("defaults undefined examples to [] and preserves existing empty array", () => {
      const payload = createMinimalPayload({
        prompts: [
          {
            id: "prompt-a",
            title: "A",
            systemPrompt: "sys",
            userPrompt: "usr",
            variables: [],
            examples: undefined,
          },
          {
            id: "prompt-b",
            title: "B",
            systemPrompt: "sys",
            userPrompt: "usr",
            variables: [],
            examples: [],
          },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, policy);

      expect(result.prompts[0].examples).toEqual([]);
      expect(result.prompts[1].examples).toEqual([]);
    });
  });

  describe("8.7 — defensive truncation clips overlong strings to policy upper bound", () => {
    it("truncates systemPrompt exceeding policy limit", () => {
      const customPolicy = {
        ...createDefaultPromptPackageLlmPolicy(),
        maxSystemPromptLength: 3500,
        maxUserPromptLength: 3500,
        maxSectionBodyLength: 3500,
        maxExampleInputLength: 3500,
        maxExampleOutputLength: 3500,
      };

      const longString = "x".repeat(5000);

      const payload = createMinimalPayload({
        prompts: [
          {
            id: "test",
            title: "Test",
            systemPrompt: longString,
            userPrompt: longString,
            variables: [],
            examples: [
              { title: "Ex", input: longString, output: longString },
            ],
          },
        ],
        sections: [
          { heading: "Sec", body: longString },
        ],
      });

      const result = normalizePromptPackageResponse(payload, dummyInput, customPolicy);

      expect(result.prompts[0].systemPrompt.length).toBe(3500);
      expect(result.prompts[0].userPrompt.length).toBe(3500);
      expect(result.prompts[0].examples[0].input!.length).toBe(3500);
      expect(result.prompts[0].examples[0].output!.length).toBe(3500);
      expect(result.sections[0].body.length).toBe(3500);
    });
  });
});
