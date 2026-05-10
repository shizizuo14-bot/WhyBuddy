/**
 * Unit tests for renderPromptPackageContent
 * (autopilot-prompt-package-llm, task 10).
 *
 * Validates the stable Markdown rendering contract documented in:
 *   - requirements.md 2.4
 *   - design.md §4.7
 *   - tasks.md 10.1–10.5
 *
 * Every test case is example-based (no PBT in this spec per requirement 9.3).
 */

import { describe, expect, it } from "vitest";

import type { RenderedPromptAsset } from "./normalize.js";
import { renderPromptPackageContent } from "./render.js";

/**
 * Helper: build a representative RenderedPromptAsset fixture.
 *
 * Defaults produce a fully populated asset (variables + examples); callers
 * can override any field (including setting `examples: []` to exercise the
 * no-examples branch required by task 10.2).
 */
function createRenderedPromptAsset(
  overrides: Partial<RenderedPromptAsset> = {},
): RenderedPromptAsset {
  return {
    id: "prompt-a",
    title: "Prompt A",
    systemPrompt: "You are an expert assistant.",
    userPrompt: "Generate the scaffold.",
    variables: [
      { name: "featureId", description: "Feature ID", required: true },
    ],
    examples: [{ title: "Example 1", input: "foo", output: "bar" }],
    ...overrides,
  };
}

describe("renderPromptPackageContent (task 10)", () => {
  describe("10.1 — determinism", () => {
    it("produces byte-identical output for identical input on repeated calls", () => {
      const input = {
        title: "Release Dashboard Implementation Pack",
        summary: "A reusable prompt package for the release dashboard scenario.",
        prompts: [
          createRenderedPromptAsset({
            id: "plan",
            title: "Plan",
            systemPrompt: "System prompt for planning.",
            userPrompt: "Plan the rollout.",
            variables: [
              { name: "tenantId", description: "Tenant identifier", required: true },
              { name: "region", description: "Deployment region", required: false },
            ],
            examples: [
              { title: "Plan example", input: "tenant-1", output: "Rollout plan" },
            ],
          }),
          createRenderedPromptAsset({
            id: "execute",
            title: "Execute",
            systemPrompt: "System prompt for execution.",
            userPrompt: "Run the rollout.",
            variables: [
              { name: "runId", description: "Run identifier", required: true },
            ],
            examples: [
              { title: "Execute example", input: "run-42", output: "Rollout done" },
            ],
          }),
        ],
        sections: [
          { heading: "Context", body: "Context paragraph." },
          { heading: "Verification", body: "Run the smoke tests." },
        ],
        targetLabel: "Codex",
      };

      const result1 = renderPromptPackageContent(input);
      const result2 = renderPromptPackageContent(input);

      expect(result1).toBe(result2);
    });
  });

  describe("10.2 — no examples means no Examples block", () => {
    it("renders the Variables block but omits the Examples block when examples is empty", () => {
      const input = {
        title: "Minimal Package",
        summary: "Single prompt without examples.",
        prompts: [
          createRenderedPromptAsset({
            id: "only",
            title: "Only Prompt",
            variables: [
              { name: "inputValue", description: "Input payload", required: true },
            ],
            examples: [],
          }),
        ],
        sections: [{ heading: "Overview", body: "Overview body." }],
        targetLabel: "Claude",
      };

      const output = renderPromptPackageContent(input);

      expect(output).toContain("**Variables**");
      expect(output).not.toContain("**Examples**");
      expect(output).not.toContain("Examples (optional)");
    });
  });

  describe("10.3 — order preservation across prompts and sections", () => {
    it("renders 3 prompts and 2 sections in their original order", () => {
      const input = {
        title: "Ordered Package",
        summary: "Three prompts + two sections rendered in order.",
        prompts: [
          createRenderedPromptAsset({
            id: "alpha",
            title: "Alpha Prompt",
            systemPrompt: "Alpha system.",
            userPrompt: "Alpha user.",
            variables: [
              { name: "alphaVar", description: "Alpha var", required: true },
            ],
            examples: [
              { title: "Alpha example", input: "alpha-in", output: "alpha-out" },
            ],
          }),
          createRenderedPromptAsset({
            id: "beta",
            title: "Beta Prompt",
            systemPrompt: "Beta system.",
            userPrompt: "Beta user.",
            variables: [
              { name: "betaVar", description: "Beta var", required: false },
            ],
            examples: [
              { title: "Beta example", input: "beta-in", output: "beta-out" },
            ],
          }),
          createRenderedPromptAsset({
            id: "gamma",
            title: "Gamma Prompt",
            systemPrompt: "Gamma system.",
            userPrompt: "Gamma user.",
            variables: [
              { name: "gammaVar", description: "Gamma var", required: true },
            ],
            examples: [
              { title: "Gamma example", input: "gamma-in", output: "gamma-out" },
            ],
          }),
        ],
        sections: [
          { heading: "First Section", body: "First body." },
          { heading: "Second Section", body: "Second body." },
        ],
        targetLabel: "Codex",
      };

      const output = renderPromptPackageContent(input);

      // Exactly three "### Prompt: " occurrences
      const promptOccurrences = output.split("### Prompt: ").length - 1;
      expect(promptOccurrences).toBe(3);

      // Prompt titles appear in the original order
      const alphaIdx = output.indexOf("Alpha Prompt");
      const betaIdx = output.indexOf("Beta Prompt");
      const gammaIdx = output.indexOf("Gamma Prompt");
      expect(alphaIdx).toBeGreaterThanOrEqual(0);
      expect(betaIdx).toBeGreaterThan(alphaIdx);
      expect(gammaIdx).toBeGreaterThan(betaIdx);

      // Sections rendered in original order
      const firstSectionIdx = output.indexOf("## First Section");
      const secondSectionIdx = output.indexOf("## Second Section");
      expect(firstSectionIdx).toBeGreaterThanOrEqual(0);
      expect(secondSectionIdx).toBeGreaterThan(firstSectionIdx);
    });
  });

  describe("10.4 — target platform label appears in the Target platform line", () => {
    it('renders "**Target platform**: Codex" when targetLabel is "Codex"', () => {
      const input = {
        title: "Target Label Package",
        summary: "Exercises the target label line.",
        prompts: [
          createRenderedPromptAsset({
            variables: [],
            examples: [],
          }),
        ],
        sections: [{ heading: "Context", body: "Context body." }],
        targetLabel: "Codex",
      };

      const output = renderPromptPackageContent(input);

      expect(output).toContain("**Target platform**: Codex");
    });
  });

  describe("10.5 — section rendering and top-level header", () => {
    it('starts with "# ${title}" and renders sections as "## ${heading}\\n\\n${body}"', () => {
      const title = "Verification Package";
      const input = {
        title,
        summary: "Exercises the verification section contract.",
        prompts: [
          createRenderedPromptAsset({
            variables: [],
            examples: [],
          }),
        ],
        sections: [{ heading: "Verification", body: "Run tests." }],
        targetLabel: "Codex",
      };

      const output = renderPromptPackageContent(input);

      expect(output.startsWith(`# ${title}`)).toBe(true);
      expect(output).toContain("## Verification\n\nRun tests.");
    });
  });
});
