/**
 * Normalization layer for Prompt Package LLM responses.
 *
 * Owns:
 * - `NormalizedPromptPackage` type (the post-normalization shape).
 * - `RenderedPromptAsset` type (a single prompt asset after normalization).
 * - `normalizePromptPackageResponse(validated, input, policy)` pure function.
 *
 * This module performs 7-step normalization (design §4.6) on a validated
 * (zod-passed) LLM response before it is rendered into final content.
 *
 * No runtime / business imports — only `import type` for policy, schema, and
 * service types. This file is intentionally a pure data module + pure function.
 *
 * See design §4.6, requirements 3.6.
 */

import type { PromptPackageLlmPolicy } from "./policy.js";
import type { PromptPackageLlmResponse } from "./schema.js";

/**
 * A single rendered prompt asset after normalization.
 * Exported for use by service.ts and downstream consumers.
 */
export interface RenderedPromptAsset {
  id: string;
  title: string;
  systemPrompt: string;
  userPrompt: string;
  variables: Array<{ name: string; description: string; required: boolean }>;
  examples: Array<{ title?: string; input?: string; output?: string }>;
}

/**
 * The normalized shape of a Prompt Package LLM response,
 * ready for rendering into final content.
 */
export interface NormalizedPromptPackage {
  title: string;
  summary: string;
  prompts: RenderedPromptAsset[];
  sections: Array<{ heading: string; body: string }>;
}

/**
 * Lightweight slug transformation for prompt ids.
 * - toLowerCase
 * - replace whitespace runs with `-`
 * - strip anything not [a-z0-9-]
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Deduplicate an array of strings (compared via lowercase) by appending
 * numeric suffixes (-2, -3, ...) to duplicates. Preserves original order.
 * Returns the deduplicated array of strings (original casing preserved for
 * the first occurrence, suffixed for subsequent ones).
 */
function deduplicateWithSuffix(items: string[]): string[] {
  const seen = new Map<string, number>();
  const result: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);

    if (count === 0) {
      result.push(item);
    } else {
      result.push(`${item}-${count + 1}`);
    }
  }

  return result;
}

/**
 * Truncate a string to a maximum length if it exceeds the limit.
 * Returns the original string if within bounds.
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

/**
 * Normalize a validated Prompt Package LLM response according to design §4.6.
 *
 * 7-step normalization:
 * 1. Trim all string fields (leading/trailing whitespace).
 * 2. Slugify `prompts[*].id` (toLowerCase + whitespace→`-` + keep [a-z0-9-]).
 * 3. Deduplicate prompt ids with numeric suffixes (-2, -3, ...), preserving order.
 * 4. Deduplicate each prompt's `variables[*].name` (trim+lowercase compare,
 *    preserve original case, append numeric suffix).
 * 5. Deduplicate `sections[*].heading` (trim+lowercase compare, append suffix).
 * 6. Default missing `examples` (undefined) to empty array `[]`.
 * 7. Defensive truncation: clip overlong strings to policy upper bounds.
 *
 * MUST NOT reorder the `prompts` or `sections` arrays (only deduplicate with
 * suffixes, no reordering).
 *
 * @param validated - The zod-validated LLM response payload.
 * @param _input - Service input (reserved for future use; currently unused).
 * @param policy - The prompt package LLM policy with upper bounds.
 * @returns The normalized prompt package ready for rendering.
 */
export function normalizePromptPackageResponse(
  validated: PromptPackageLlmResponse,
  _input: unknown,
  policy: PromptPackageLlmPolicy,
): NormalizedPromptPackage {
  // Step 1: Trim all top-level string fields
  const title = validated.title.trim();
  const summary = validated.summary.trim();

  // Steps 2+3: Slugify prompt ids, then deduplicate
  const slugifiedIds = validated.prompts.map((p) => slugify(p.id.trim()));
  const deduplicatedIds = deduplicateWithSuffix(slugifiedIds);

  // Build normalized prompts (preserving original order)
  const prompts: RenderedPromptAsset[] = validated.prompts.map((p, i) => {
    // Step 1: Trim prompt string fields
    const promptTitle = p.title.trim();
    const systemPrompt = p.systemPrompt.trim();
    const userPrompt = p.userPrompt.trim();

    // Step 4: Deduplicate variables[*].name within this prompt
    const trimmedVarNames = p.variables.map((v) => v.name.trim());
    const deduplicatedVarNames = deduplicateWithSuffix(trimmedVarNames);

    const variables = p.variables.map((v, vi) => ({
      name: deduplicatedVarNames[vi],
      description: v.description.trim(),
      required: v.required,
    }));

    // Step 6: Default missing examples to empty array
    const examples: Array<{ title?: string; input?: string; output?: string }> =
      (p.examples ?? []).map((ex) => ({
        ...(ex.title !== undefined ? { title: ex.title.trim() } : {}),
        ...(ex.input !== undefined ? { input: ex.input.trim() } : {}),
        ...(ex.output !== undefined ? { output: ex.output.trim() } : {}),
      }));

    // Step 7: Defensive truncation for prompt fields
    return {
      id: deduplicatedIds[i],
      title: truncate(promptTitle, policy.maxPromptTitleLength),
      systemPrompt: truncate(systemPrompt, policy.maxSystemPromptLength),
      userPrompt: truncate(userPrompt, policy.maxUserPromptLength),
      variables: variables.map((v) => ({
        name: truncate(v.name, policy.maxVariableNameLength),
        description: truncate(v.description, policy.maxVariableDescriptionLength),
        required: v.required,
      })),
      examples: examples.map((ex) => ({
        ...(ex.title !== undefined
          ? { title: truncate(ex.title, policy.maxExampleTitleLength) }
          : {}),
        ...(ex.input !== undefined
          ? { input: truncate(ex.input, policy.maxExampleInputLength) }
          : {}),
        ...(ex.output !== undefined
          ? { output: truncate(ex.output, policy.maxExampleOutputLength) }
          : {}),
      })),
    };
  });

  // Step 5: Deduplicate sections[*].heading
  const trimmedHeadings = validated.sections.map((s) => s.heading.trim());
  const deduplicatedHeadings = deduplicateWithSuffix(trimmedHeadings);

  // Build normalized sections (preserving original order)
  const sections = validated.sections.map((s, i) => {
    const body = s.body.trim();
    return {
      heading: truncate(deduplicatedHeadings[i], policy.maxSectionHeadingLength),
      // Step 7: Defensive truncation for body
      body: truncate(body, policy.maxSectionBodyLength),
    };
  });

  // Step 7: Defensive truncation for top-level fields
  return {
    title: truncate(title, policy.maxTitleLength),
    summary: truncate(summary, policy.maxSummaryLength),
    prompts,
    sections,
  };
}
