/**
 * Zod schemas for validating LLM-generated RouteSet responses.
 *
 * See `.kiro/specs/autopilot-routeset-llm-generation/design.md` §4.2 for the
 * strict schema contract. These schemas are consumed by the RouteSet LLM
 * generator (task 6) and its unit tests (task 3).
 *
 * Notes:
 * - Enums are copied as zod literals rather than imported from
 *   `shared/blueprint/contracts.ts` so schema-level validation stays
 *   independent of contract-side type aliases.
 * - `ComplexityEnum` matches `BlueprintRouteComplexity = "light" | "balanced"
 *   | "deep"`; it is deliberately NOT `"simple" | "standard" | "complex"`.
 * - The single-primary invariant is enforced via `.refine()` on the
 *   top-level response schema; violating payloads fail validation and the
 *   caller falls back to templated routes.
 */

import { z } from "zod";

const RouteKindEnum = z.enum(["primary", "alternative"]);

const RiskLevelEnum = z.enum(["low", "medium", "high"]);

const CostLevelEnum = z.enum(["low", "medium", "high"]);

const ComplexityEnum = z.enum(["light", "balanced", "deep"]);

const CapabilityUsageSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  purpose: z.string().min(1).max(240),
  // `kind` intentionally accepts any non-empty string up to 40 chars instead
  // of a zod enum over the full `BlueprintRuntimeCapabilityKind` union.
  // Normalization against the capabilities registry happens inside the
  // generator (see design §4.5) to keep the failure surface small.
  kind: z.string().min(1).max(40),
});

const BlueprintRouteCandidateLlmSchema = z.object({
  id: z.string().min(1).max(120),
  kind: RouteKindEnum,
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  rationale: z.string().min(1).max(600),
  riskLevel: RiskLevelEnum,
  costLevel: CostLevelEnum,
  complexity: ComplexityEnum,
  estimatedEffort: z.string().min(1).max(80),
  capabilities: z.array(CapabilityUsageSchema).min(1).max(8),
});

/**
 * Top-level schema for the LLM RouteSet response payload.
 *
 * - `routes` must contain between 2 and 5 candidate routes.
 * - Exactly one route must have `kind === "primary"`; violations fail the
 *   refinement and force a fallback (see design §4.2).
 * - `summary` is optional free-form text the LLM may emit alongside routes.
 * - Additional unknown fields are silently stripped (zod default behavior)
 *   and MUST NOT trigger a fallback.
 */
export const BlueprintRouteSetLlmResponseSchema = z
  .object({
    routes: z.array(BlueprintRouteCandidateLlmSchema).min(2).max(5),
    summary: z.string().optional(),
  })
  .refine(
    (data) =>
      data.routes.filter((route) => route.kind === "primary").length === 1,
    { message: "Exactly one route must have kind === 'primary'" },
  );

export type BlueprintRouteSetLlmResponse = z.infer<
  typeof BlueprintRouteSetLlmResponseSchema
>;
