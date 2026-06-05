/**
 * SPEC Tree LLM generation service.
 *
 * Owns:
 * - `SpecTreeLlmServiceInput` / `SpecTreeLlmServiceOutput` interfaces.
 * - `SpecTreeLlmService` type alias.
 * - `createSpecTreeLlmService(ctx)` factory returning a closure-based service.
 *
 * The service implements a 6-tier fallback strategy:
 *   Tier 1: not enabled → early return "template"
 *   Tier 2: apiKey missing → early return "template"
 *   Tier 3: callJson throws / non-JSON → "llm_fallback"
 *   Tier 4/5: schema + superRefine fails → "llm_fallback"
 *   Tier 6: timeout (AbortError) → "llm_fallback"
 *   Happy path: schema passes → flatten, compute digests, return "llm"
 *
 * Import restrictions (design §2.D1 / task 10.6):
 * - SHALL NOT import `callLLMJson`, `getAIConfig`, module-level `fetch`
 * - SHALL NOT hardcode model names, temperature defaults, provider names
 * - SHALL NOT import module-level eventBus / jobStore singletons
 * - All LLM capabilities come from `ctx.llm.callJson` + `ctx.llm.getConfig`
 *
 * See design §4.2 / §4.6, requirements 2.1, 2.5, 2.6, 2.7, 3.5, 3.6,
 * 4.1, 4.5, 5.1, 7.1, 7.2, 7.4, 7.5.
 */

import { createHash } from "node:crypto";

import type { BlueprintServiceContext } from "../context.js";
import type {
  BlueprintClarificationSession,
  BlueprintGenerationJob,
  BlueprintGenerationRequest,
  BlueprintRouteCandidate,
  BlueprintRouteSet,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";
import {
  createDefaultSpecTreeLlmPolicy,
  applySpecTreeRedaction,
  type SpecTreeLlmPolicy,
} from "./policy.js";
import { buildSpecTreePrompt, SPEC_TREE_PROMPT_ID } from "./prompt.js";
import { SpecTreeLlmResponseSchema } from "./schema.js";
import { flattenAndRemapIds } from "./flatten-and-remap.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Service input — all data needed to attempt LLM-driven SPEC Tree generation.
 */
export interface SpecTreeLlmServiceInput {
  jobId: string;
  job: BlueprintGenerationJob;
  request: BlueprintGenerationRequest;
  routeSet: BlueprintRouteSet;
  /** The selected primary route; LLM derives SPEC Tree from its steps/stages */
  primaryRoute: BlueprintRouteCandidate;
  /** Alternative routes (for optional alternative_route nodes in the tree) */
  alternativeRoutes: BlueprintRouteCandidate[];
  clarificationSession?: BlueprintClarificationSession;
  /** Optional domain context (projectContext / domainNotes etc.) */
  domainContext?: {
    projectId?: string;
    sourceId?: string;
    domain?: string;
    notes?: string;
  };
  /** Optional AIGC-node evidence summary */
  aigcSpecNodeEvidence?: {
    subsystemsSummary: string;
    riskNoteCount: number;
  };
  createdAt: string;
  /** Pre-allocated stable root node ID; service remaps LLM root to this value */
  rootNodeId: string;
}

/**
 * Service output.
 * - Real path: nodes[] + rootNodeId + full provenance extension fields
 * - Fallback path: generationSource / error / optional promptId / model; nodes undefined
 */
export interface SpecTreeLlmServiceOutput {
  generationSource: "llm" | "llm_fallback" | "template";
  /** Real path: flattened + remapped nodes; fallback/template: undefined */
  nodes?: BlueprintSpecTreeNode[];
  /** Real path: equals pre-allocated rootNodeId */
  rootNodeId?: string;
  /** Filled when LLM was attempted (real or fallback) */
  promptId?: string;
  model?: string;
  promptFingerprint?: string;
  /** Real path: sha256 of raw LLM response JSON */
  responseDigest?: string;
  /** Real path: sha256 of validated+parsed payload JSON */
  structuredPayloadDigest?: string;
  /** Filled only when generationSource === "llm_fallback" */
  error?: string;
}

export type SpecTreeLlmService = (
  input: SpecTreeLlmServiceInput,
) => Promise<SpecTreeLlmServiceOutput>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function truncateError(
  message: string,
  policy: SpecTreeLlmPolicy,
): string {
  const redacted = applySpecTreeRedaction(message, policy);
  if (redacted.length <= policy.maxErrorLength) {
    return redacted;
  }
  return redacted.slice(0, policy.maxErrorLength);
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return /abort|timeout/i.test(err.message) || err.name === "AbortError";
  }
  return false;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the SPEC Tree LLM service.
 *
 * The returned function is a pure async closure that:
 * 1. Checks enablement gate (env var)
 * 2. Checks apiKey availability
 * 3. Builds prompt, calls LLM via ctx.llm.callJson
 * 4. Validates response with strict zod schema
 * 5. Flattens and remaps IDs
 * 6. Computes digests
 *
 * Any failure at steps 3-6 results in a graceful fallback.
 */
export function createSpecTreeLlmService(
  ctx: BlueprintServiceContext,
): SpecTreeLlmService {
  const policy: SpecTreeLlmPolicy =
    (ctx as any).specTreeLlmPolicy ?? createDefaultSpecTreeLlmPolicy();

  return async (input: SpecTreeLlmServiceInput): Promise<SpecTreeLlmServiceOutput> => {
    // ─── Tier 1: Not enabled ──────────────────────────────────────────
    if (process.env.BLUEPRINT_SPEC_TREE_LLM_ENABLED !== "true") {
      ctx.logger.debug("spec-tree llm: not enabled, using template");
      return { generationSource: "template" };
    }

    // ─── Tier 2: apiKey missing ───────────────────────────────────────
    const aiConfig = ctx.llm.getConfig();
    if (!aiConfig.apiKey) {
      ctx.logger.debug("spec-tree llm: apiKey missing, using template");
      return { generationSource: "template" };
    }

    const model = aiConfig.model;

    // Build prompt
    const promptPayload = buildSpecTreePrompt({
      request: input.request,
      routeSet: {
        id: input.routeSet.id,
        routes: input.routeSet.routes.map((r) => ({
          id: r.id,
          title: r.title,
          summary: r.summary,
        })),
      },
      primaryRoute: {
        id: input.primaryRoute.id,
        title: input.primaryRoute.title,
        summary: input.primaryRoute.summary,
        rationale: (input.primaryRoute as any).rationale,
        steps: ((input.primaryRoute as any).steps ?? []).map((s: any) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          role: s.role,
        })),
        stagesSummary: (input.primaryRoute as any).stagesSummary,
        capabilities: (input.primaryRoute as any).capabilities,
      },
      alternativeRoutes: input.alternativeRoutes.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
      })),
      clarificationSession: input.clarificationSession
        ? {
            id: input.clarificationSession.id,
            strategyId: (input.clarificationSession as any).strategyId,
            templateId: (input.clarificationSession as any).templateId,
            answers: ((input.clarificationSession as any).answers ?? []).map(
              (a: any) => ({
                questionId: a.questionId,
                answer: a.answer,
              }),
            ),
            locale: (input.clarificationSession as any).locale,
          }
        : undefined,
      domainContext: input.domainContext,
      aigcSpecNodeEvidence: input.aigcSpecNodeEvidence,
      locale:
        (input.clarificationSession as any)?.locale === "zh-CN"
          ? "zh-CN"
          : "en-US",
    });

    const { promptId, systemMessage, userMessage, promptFingerprint } =
      promptPayload;

    // ─── Tier 3: callJson throws / non-JSON ───────────────────────────
    let rawPayload: unknown;
    try {
      rawPayload = await ctx.llm.callJson(
        [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        {
          model,
          temperature: policy.temperature,
          timeoutMs: policy.maxInvocationTimeoutMs,
          retryAttempts: policy.callJsonRetryAttempts,
          sessionId:
            input.clarificationSession?.id ??
            (input.request as any).clarificationSessionId,
        } as any,
      );
    } catch (err: unknown) {
      // ─── Tier 6: Timeout ──────────────────────────────────────────
      if (isTimeoutError(err)) {
        ctx.logger.warn("spec-tree llm: timeout, using fallback", {
          promptId,
        });
        return {
          generationSource: "llm_fallback",
          promptId,
          model,
          promptFingerprint,
          error: truncateError("llm timeout", policy),
        };
      }

      const errorMsg =
        err instanceof Error ? err.message : String(err);
      ctx.logger.warn("spec-tree llm: callJson threw, using fallback", {
        promptId,
        error: applySpecTreeRedaction(errorMsg, policy),
      });
      return {
        generationSource: "llm_fallback",
        promptId,
        model,
        promptFingerprint,
        error: truncateError(
          `llm callJson threw: ${errorMsg}`,
          policy,
        ),
      };
    }

    // Non-JSON response (undefined / null / non-object)
    if (
      rawPayload === undefined ||
      rawPayload === null ||
      typeof rawPayload !== "object"
    ) {
      ctx.logger.warn("spec-tree llm: non-json response, using fallback", {
        promptId,
      });
      return {
        generationSource: "llm_fallback",
        promptId,
        model,
        promptFingerprint,
        error: truncateError("non-json response", policy),
      };
    }

    // ─── Tier 4/5: Schema + superRefine validation ────────────────────
    const parsed = SpecTreeLlmResponseSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const zodMessage = parsed.error.issues
        .map((issue) => issue.message)
        .join("; ");
      ctx.logger.warn(
        "spec-tree llm: schema validation failed, using fallback",
        {
          promptId,
          errorMsg: applySpecTreeRedaction(zodMessage, policy),
        },
      );
      // Record check failure in ledger
      ctx.checksLedger?.recordCheck({
        jobId: input.jobId,
        stage: "spec_tree",
        checkType: "schema",
        checkName: "SpecTree LLM Response Schema",
        status: "fail",
        validator: "spec-tree/schema.ts",
        output: zodMessage,
      });
      return {
        generationSource: "llm_fallback",
        promptId,
        model,
        promptFingerprint,
        error: truncateError(
          `schema validation failed: ${zodMessage}`,
          policy,
        ),
      };
    }

    // ─── Happy path ───────────────────────────────────────────────────
    const remapped = flattenAndRemapIds(parsed.data, {
      rootNodeId: input.rootNodeId,
      primaryRouteId: input.primaryRoute.id,
    });

    // Record check pass in ledger
    ctx.checksLedger?.recordCheck({
      jobId: input.jobId,
      stage: "spec_tree",
      checkType: "schema",
      checkName: "SpecTree LLM Response Schema",
      status: "pass",
      validator: "spec-tree/schema.ts",
    });

    // Record invariant guard pass (flattenAndRemap succeeded = tree structure valid)
    ctx.checksLedger?.recordCheck({
      jobId: input.jobId,
      stage: "spec_tree",
      checkType: "invariant",
      checkName: "SpecTree Invariant Guard (flatten+remap)",
      status: "pass",
      validator: "spec-tree/flatten-and-remap.ts",
    });

    // Compute digests
    const responseDigest =
      "sha256:" + sha256Hex(JSON.stringify(rawPayload));
    const structuredPayloadDigest =
      "sha256:" + sha256Hex(JSON.stringify(parsed.data));

    return {
      generationSource: "llm",
      nodes: remapped.nodes,
      rootNodeId: remapped.rootNodeId,
      promptId,
      model,
      promptFingerprint,
      responseDigest,
      structuredPayloadDigest,
    };
  };
}
