import { z } from "zod";
import type {
  RoleArchitectureResponse as SharedRoleArchitectureResponse,
  AgentRoleEntry as SharedAgentRoleEntry,
} from "../../../../shared/blueprint/role-architecture.js";

/**
 * Zod schema for a single Agent role entry produced by the Role System
 * Architecture capability bridge LLM reasoning.
 *
 * Field constraints align with `shared/blueprint/role-architecture.ts`
 * interface `AgentRoleEntry`.
 *
 * No `.strict()` — zod default strip behaviour silently discards unknown
 * fields (design §2.D9).
 *
 * No `.transform()` / `z.coerce.*` / `z.preprocess()` — requirement 3.2
 * forbids coerce chains.
 */
export const AgentRoleSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]{0,63}$/),
  label: z.string().min(1).max(80),
  responsibilities: z.array(z.string().min(1).max(200)).min(1).max(10),
  activationStages: z.array(z.string().min(1).max(64)).min(1).max(10),
  permissions: z.array(z.string().min(1).max(120)).min(0).max(10).optional(),
});

/**
 * Zod schema for the complete Role Architecture response produced by the
 * capability bridge LLM call.
 *
 * `roles` array length constrained to [1, 9] — aligned with
 * `BlueprintAgentRole[]` 9-category taxonomy.
 *
 * `.superRefine()` enforces uniqueness of `roles[].id` within a single
 * response.
 */
export const RoleArchitectureResponseSchema = z
  .object({
    roles: z.array(AgentRoleSchema).min(1).max(9),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < data.roles.length; i++) {
      const id = data.roles[i].id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roles", i, "id"],
          message: `roles[].id must be unique within a single response; duplicated id="${id}"`,
        });
        return;
      }
      seen.add(id);
    }
  });

/** Inferred type from `RoleArchitectureResponseSchema` — structurally equivalent to `shared/blueprint/role-architecture.ts#RoleArchitectureResponse`. */
export type RoleArchitectureResponse = z.infer<
  typeof RoleArchitectureResponseSchema
>;

/** Inferred type from `AgentRoleSchema` — structurally equivalent to `shared/blueprint/role-architecture.ts#AgentRoleEntry`. */
export type AgentRoleEntry = z.infer<typeof AgentRoleSchema>;
