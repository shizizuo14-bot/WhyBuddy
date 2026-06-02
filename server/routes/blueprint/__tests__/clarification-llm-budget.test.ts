import path from "node:path";
import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

const BLUEPRINT_SOURCE_PATH = path.resolve(
  __dirname,
  "../../blueprint.ts",
);

async function loadSource(): Promise<string> {
  return fs.readFile(BLUEPRINT_SOURCE_PATH, "utf8");
}

describe("blueprint clarification LLM budget", () => {
  it("uses an env-overridable maxTokens budget for fallback clarification generation", async () => {
    const source = await loadSource();
    const declarationIndex = source.search(
      /async\s+function\s+generateClarificationQuestionsWithLlm\s*\(/,
    );
    expect(declarationIndex).toBeGreaterThan(-1);

    const body = source.slice(
      declarationIndex,
      source.indexOf("function normalizeLlmClarificationQuestions", declarationIndex),
    );

    expect(body).toMatch(
      /maxTokens:\s*resolveBlueprintClarificationMaxTokens\(\)/,
    );
    expect(source).toMatch(
      /process\.env\.BLUEPRINT_CLARIFICATION_LLM_MAX_TOKENS/,
    );
  });
});
