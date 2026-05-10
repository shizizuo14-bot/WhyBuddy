/**
 * Stable Markdown renderer for Prompt Package LLM responses.
 *
 * Owns:
 * - `renderPromptPackageContent(input)` pure function.
 *
 * Given a normalized `{ title, summary, prompts, sections, targetLabel }` input,
 * produces a deterministic Markdown string that becomes
 * `BlueprintImplementationPromptPackage.content` on the real (LLM) path.
 *
 * Determinism contract (design §4.7, requirements 2.4):
 * - Same input bytes → byte-identical output bytes.
 * - Line separator is always `\n` (never `\r\n`).
 * - Paragraphs are separated by exactly one blank line (two `\n`).
 * - Array ordering is preserved from the caller (normalize.ts guarantees
 *   original order after dedupe).
 *
 * Rendering shape (design §4.7):
 *
 * ```text
 * # ${title}
 *
 * ${summary}
 *
 * **Target platform**: ${targetLabel}
 *
 * ## Reusable Prompts
 *
 * ### Prompt: ${prompts[i].title} (id: ${prompts[i].id})
 *
 * **System prompt**
 *
 * ${prompts[i].systemPrompt}
 *
 * **User prompt**
 *
 * ${prompts[i].userPrompt}
 *
 * **Variables**
 *
 * - `${name}` (required: ${required}): ${description}
 * ...
 *
 * **Examples** (optional)
 *
 * - **${example.title ?? "Example N"}**
 *   - Input: ${example.input ?? "(n/a)"}
 *   - Output: ${example.output ?? "(n/a)"}
 * ...
 *
 * ## ${sections[i].heading}
 *
 * ${sections[i].body}
 * ```
 *
 * Rules enforced by this module:
 * - Omit the `**Examples** (optional)` block entirely when the prompt's
 *   `examples` array is empty.
 * - Omit the variable bullet list when `variables` is empty (the
 *   `**Variables**` header is still emitted as a heading marker; empty
 *   bullets are never produced).
 * - Missing `example.title` falls back to `"Example ${k+1}"` (1-indexed).
 * - Missing `example.input` / `example.output` fall back to `"(n/a)"`.
 * - Boolean `required` is rendered via default `String()` coercion
 *   (`"true"` / `"false"`).
 *
 * Scope fences:
 * - This helper is used ONLY on the LLM real path. The template / fallback
 *   path continues to call the legacy `renderImplementationPromptContent()`
 *   in `server/routes/blueprint.ts`. The two helpers coexist and MUST NOT
 *   cross-call each other (design §4.7).
 * - This file MUST NOT import `renderImplementationPromptContent` or any
 *   other runtime / business module. It only takes a type-only import of
 *   `RenderedPromptAsset` from the sibling normalize module.
 *
 * See design §4.7, requirements 2.4.
 */

import type { RenderedPromptAsset } from "./normalize.js";

/**
 * Input for {@link renderPromptPackageContent}.
 *
 * Shape mirrors {@link RenderedPromptAsset} after normalization plus the
 * package-level `title` / `summary` / `sections` / `targetLabel`.
 */
export interface RenderPromptPackageContentInput {
  title: string;
  summary: string;
  prompts: RenderedPromptAsset[];
  sections: Array<{ heading: string; body: string }>;
  targetLabel: string;
}

/**
 * Render a single prompt asset into an ordered list of Markdown paragraphs
 * (blocks). Blocks are joined later by the top-level renderer with `\n\n`.
 *
 * Deterministic: no Date.now, no Math.random, no Map/Set iteration.
 */
function renderPromptBlocks(prompt: RenderedPromptAsset): string[] {
  const blocks: string[] = [];

  blocks.push(`### Prompt: ${prompt.title} (id: ${prompt.id})`);

  blocks.push("**System prompt**");
  blocks.push(prompt.systemPrompt);

  blocks.push("**User prompt**");
  blocks.push(prompt.userPrompt);

  blocks.push("**Variables**");
  if (prompt.variables.length > 0) {
    const variableLines = prompt.variables
      .map(
        (variable) =>
          `- \`${variable.name}\` (required: ${variable.required}): ${variable.description}`,
      )
      .join("\n");
    blocks.push(variableLines);
  }

  if (prompt.examples.length > 0) {
    blocks.push("**Examples** (optional)");
    const exampleLines = prompt.examples
      .map((example, index) => {
        const title = example.title ?? `Example ${index + 1}`;
        const input = example.input ?? "(n/a)";
        const output = example.output ?? "(n/a)";
        return `- **${title}**\n  - Input: ${input}\n  - Output: ${output}`;
      })
      .join("\n");
    blocks.push(exampleLines);
  }

  return blocks;
}

/**
 * Render a normalized Prompt Package into its final Markdown `content`
 * string, following the design §4.7 stable rendering rule.
 *
 * Pure function. Deterministic. Same bytes in → same bytes out.
 *
 * @param input - Normalized package fields (title / summary / prompts /
 *   sections) plus the human-readable target platform label.
 * @returns A Markdown string ready to be stored in
 *   `BlueprintImplementationPromptPackage.content`.
 */
export function renderPromptPackageContent(
  input: RenderPromptPackageContentInput,
): string {
  const blocks: string[] = [];

  // Header + summary + target platform line.
  blocks.push(`# ${input.title}`);
  blocks.push(input.summary);
  blocks.push(`**Target platform**: ${input.targetLabel}`);

  // Reusable Prompts region.
  blocks.push("## Reusable Prompts");
  for (const prompt of input.prompts) {
    for (const block of renderPromptBlocks(prompt)) {
      blocks.push(block);
    }
  }

  // Sections region (preserve caller order).
  for (const section of input.sections) {
    blocks.push(`## ${section.heading}`);
    blocks.push(section.body);
  }

  return blocks.join("\n\n");
}
