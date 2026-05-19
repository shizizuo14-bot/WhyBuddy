import { z } from "zod";

/**
 * Zod schema for a single variable entry within a prompt.
 *
 * Field constraints:
 * - `name`: 1..64 characters
 * - `description`: 1..500 characters
 * - `required`: strict boolean (no coerce)
 *
 * No `.strict()` — zod default strip behaviour silently discards unknown
 * fields (design §D8).
 *
 * No `.transform()` / `z.coerce.*` / `z.preprocess()` — requirement 3.3
 * forbids coerce chains; `required` must be strict boolean.
 */
export const VariableSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(500),
  required: z.boolean(),
});

/**
 * Zod schema for a single example entry within a prompt.
 *
 * All fields are optional, but `.superRefine()` at the package level
 * ensures at least one of `title` / `input` / `output` is non-empty
 * when an example is provided.
 */
export const ExampleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  input: z.string().min(1).max(4000).optional(),
  output: z.string().min(1).max(4000).optional(),
});

/**
 * Zod schema for a single prompt entry within the Prompt Package LLM response.
 *
 * Field constraints:
 * - `id`: 1..128 characters
 * - `title`: 1..200 characters
 * - `systemPrompt`: 1..4000 characters
 * - `userPrompt`: 1..4000 characters
 * - `variables`: array of 0..30 VariableSchema entries
 * - `examples`: optional array of 0..10 ExampleSchema entries
 */
export const PromptSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  systemPrompt: z.string().min(1).max(4000),
  userPrompt: z.string().min(1).max(4000),
  variables: z.array(VariableSchema).min(0).max(30),
  examples: z.array(ExampleSchema).min(0).max(10).optional(),
});

/**
 * Zod schema for a single section entry within the Prompt Package LLM response.
 *
 * Field constraints:
 * - `heading`: 1..200 characters
 * - `body`: 1..5000 characters
 */
export const SectionSchema = z.object({
  heading: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

/**
 * Strict zod schema for the complete Prompt Package LLM response.
 *
 * Top-level constraints:
 * - `title`: 1..200 characters
 * - `summary`: 1..500 characters
 * - `prompts`: array of 1..12 PromptSchema entries
 * - `sections`: array of 1..20 SectionSchema entries
 *
 * `.superRefine()` enforces 6 package-level invariants (design §D8):
 * 1. All string fields must not be empty after trim
 * 2. `prompts[*].id` must be unique within the package (case-insensitive, trimmed)
 *    and each prompt's `id` / `title` / `systemPrompt` / `userPrompt` must not be empty after trim
 * 3. Each prompt's `variables[*].name` must be unique within that prompt (case-insensitive, trimmed)
 *    and `name` / `description` must not be empty after trim
 * 4. `examples[*]` must have at least one non-empty `title` / `input` / `output`
 * 5. `sections[*].heading` must be unique within the package (case-insensitive, trimmed)
 *    and `heading` / `body` must not be empty after trim
 * 6. Each invariant violation calls `ctx.addIssue` then returns to avoid cascading
 *
 * No `.strict()` — zod default strip behaviour silently discards unknown
 * fields (design §D8).
 *
 * No `.transform()` / `z.coerce.*` / `z.preprocess()` — requirement 3.3
 * forbids coerce chains.
 */
export const PromptPackageLlmResponseSchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(500),
    prompts: z.array(PromptSchema).min(1).max(12),
    sections: z.array(SectionSchema).min(1).max(20),
  })
  .superRefine((data, ctx) => {
    // Invariant 1: title / summary trim 后非空
    if (data.title.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "title must not be empty after trim",
      });
      return;
    }
    if (data.summary.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["summary"],
        message: "summary must not be empty after trim",
      });
      return;
    }

    // Invariant 2: prompts[*].id 在 Package 内唯一（trim + lowercase）
    // 且每个 prompt 的 id / title / systemPrompt / userPrompt trim 后非空
    const seenPromptIds = new Set<string>();
    for (let i = 0; i < data.prompts.length; i++) {
      const prompt = data.prompts[i];
      if (prompt.id.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prompts", i, "id"],
          message: "prompts[*].id must not be empty after trim",
        });
        return;
      }
      if (prompt.title.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prompts", i, "title"],
          message: "prompts[*].title must not be empty after trim",
        });
        return;
      }
      if (prompt.systemPrompt.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prompts", i, "systemPrompt"],
          message: "prompts[*].systemPrompt must not be empty after trim",
        });
        return;
      }
      if (prompt.userPrompt.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prompts", i, "userPrompt"],
          message: "prompts[*].userPrompt must not be empty after trim",
        });
        return;
      }
      const normalizedId = prompt.id.trim().toLowerCase();
      if (seenPromptIds.has(normalizedId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prompts", i, "id"],
          message: `duplicated prompt id: "${prompt.id}"`,
        });
        return;
      }
      seenPromptIds.add(normalizedId);
    }

    // Invariant 3: 每个 prompt 的 variables[*].name 在该 prompt 内唯一（trim + lowercase）
    // 且 name / description trim 后非空
    for (let i = 0; i < data.prompts.length; i++) {
      const prompt = data.prompts[i];
      const seenVarNames = new Set<string>();
      for (let j = 0; j < prompt.variables.length; j++) {
        const variable = prompt.variables[j];
        if (variable.name.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["prompts", i, "variables", j, "name"],
            message: "variables[*].name must not be empty after trim",
          });
          return;
        }
        if (variable.description.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["prompts", i, "variables", j, "description"],
            message: "variables[*].description must not be empty after trim",
          });
          return;
        }
        const normalizedName = variable.name.trim().toLowerCase();
        if (seenVarNames.has(normalizedName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["prompts", i, "variables", j, "name"],
            message: `duplicated variable name: "${variable.name}"`,
          });
          return;
        }
        seenVarNames.add(normalizedName);
      }
    }

    // Invariant 4: examples[*] 至少一个 title / input / output 非空（避免 {} 空 object）
    for (let i = 0; i < data.prompts.length; i++) {
      const prompt = data.prompts[i];
      if (!prompt.examples) continue;
      for (let j = 0; j < prompt.examples.length; j++) {
        const example = prompt.examples[j];
        const hasTitle =
          example.title !== undefined && example.title.trim().length > 0;
        const hasInput =
          example.input !== undefined && example.input.trim().length > 0;
        const hasOutput =
          example.output !== undefined && example.output.trim().length > 0;
        if (!hasTitle && !hasInput && !hasOutput) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["prompts", i, "examples", j],
            message:
              "examples[*] must have at least one non-empty title, input, or output",
          });
          return;
        }
      }
    }

    // Invariant 5: sections[*].heading 在 Package 内唯一（trim + lowercase）
    // 且 heading / body trim 后非空
    const seenHeadings = new Set<string>();
    for (let i = 0; i < data.sections.length; i++) {
      const section = data.sections[i];
      if (section.heading.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "heading"],
          message: "sections[*].heading must not be empty after trim",
        });
        return;
      }
      if (section.body.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "body"],
          message: "sections[*].body must not be empty after trim",
        });
        return;
      }
      const normalizedHeading = section.heading.trim().toLowerCase();
      if (seenHeadings.has(normalizedHeading)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "heading"],
          message: `duplicated section heading: "${section.heading}"`,
        });
        return;
      }
      seenHeadings.add(normalizedHeading);
    }
  });

/** Inferred type — the complete Prompt Package LLM response. */
export type PromptPackageLlmResponse = z.infer<
  typeof PromptPackageLlmResponseSchema
>;

/** Inferred type — a single prompt entry within the response. */
export type PromptPackageLlmPrompt = z.infer<typeof PromptSchema>;

/** Inferred type — a single section entry within the response. */
export type PromptPackageLlmSection = z.infer<typeof SectionSchema>;

/** Inferred type — a single variable entry within a prompt. */
export type PromptPackageLlmVariable = z.infer<typeof VariableSchema>;

/** Inferred type — a single example entry within a prompt. */
export type PromptPackageLlmExample = z.infer<typeof ExampleSchema>;
