/**
 * Prompt Package LLM Service.
 *
 * Factory: `createPromptPackageLlmService(ctx)` returns a pure async function
 * that, given a single `(nodeIds, targetPlatform, sourceDocuments,
 * sourcePreviews, includeDrafts, includePreviewDrafts)` combination, either
 * calls the LLM and returns the rendered prompt package content, or reports
 * a fallback signal so the outer layer (buildImplementationPromptPackage)
 * can emit the templated output byte-for-byte identical to today.
 *
 * Six-tier fallback classification (design §4.6 + §5.1):
 *   Tier 1: bridge not enabled (debug, no callJson)
 *   Tier 2: apiKey missing (debug, no callJson — locked to tier-1 equivalence
 *           per design §D2 + §6.3.4: no error / promptId / model populated)
 *   Tier 3: callJson threw or returned non-object (warn, llm_fallback)
 *   Tier 4: schema validation failed (warn, llm_fallback)
 *   Tier 5: `.superRefine()` invariant failed — same handling as tier 4
 *   Tier 6: timeout / AbortError (warn, llm_fallback, error="llm timeout")
 *
 * Hard constraints (design §D1, task 12.7):
 *   - SHALL NOT `import { callLLMJson }` or `import { getAIConfig }`
 *   - SHALL NOT call module-level `fetch()` or import HTTP clients
 *   - SHALL NOT hardcode model names, provider names, or temperature defaults
 *   - SHALL NOT import module-level eventBus / jobStore singletons
 *   - SHALL NOT use bare event strings such as `"prompt.packaged"`
 *   - All LLM capabilities come from `ctx.llm.callJson` + `ctx.llm.getConfig`
 *
 * See design §4.1 / §4.2 / §4.6 / §5.1, requirements 2.1 / 2.2 / 4.1.
 */

import { createHash } from "node:crypto";

import type { BlueprintServiceContext } from "../context.js";
import type {
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintClarificationSession,
  BlueprintEffectPreview,
  BlueprintGenerationJob,
  BlueprintImplementationPromptTargetPlatform,
  BlueprintProjectDomainContext,
  BlueprintRouteCandidate,
  BlueprintSpecDocument,
  BlueprintSpecTree,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/index.js";

import {
  applyPromptPackageRedaction,
  createDefaultPromptPackageLlmPolicy,
  type PromptPackageLlmPolicy,
} from "./policy.js";
import { PromptPackageLlmResponseSchema } from "./schema.js";
import {
  PROMPT_PACKAGE_PROMPT_ID,
  buildPromptPackagePrompt,
} from "./prompt.js";
import {
  normalizePromptPackageResponse,
  type NormalizedPromptPackage,
  type RenderedPromptAsset,
} from "./normalize.js";
import { renderPromptPackageContent } from "./render.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { RenderedPromptAsset } from "./normalize.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Single-package service input. One `generateImplementationPromptPackages()`
 * request with M target platforms triggers M independent service calls.
 */
export interface PromptPackageLlmServiceInput {
  jobId: string;
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  targetPlatform: BlueprintImplementationPromptTargetPlatform;
  /** Target node set (already filtered by targetNodeIds). */
  nodes: BlueprintSpecTreeNode[];
  /** SPEC documents filtered by includeDrafts semantics. */
  sourceDocuments: BlueprintSpecDocument[];
  /** Effect previews filtered by includePreviewDrafts semantics. */
  sourcePreviews: BlueprintEffectPreview[];
  /** Primary route (resolved from specTree.selectedRouteId if available). */
  primaryRoute?: BlueprintRouteCandidate;
  /** Clarification session (locale resolution source). */
  clarificationSession?: BlueprintClarificationSession;
  domainContext?: BlueprintProjectDomainContext;
  /** Optional capability invocations from RouteSet sandbox derivation pipeline. */
  capabilityInvocations?: BlueprintCapabilityInvocation[];
  /** Optional capability evidence from bridge spec outputs. */
  capabilityEvidence?: BlueprintCapabilityEvidence[];
  includeDrafts: boolean;
  includePreviewDrafts: boolean;
  createdAt: string;
}

/**
 * Single-package service output.
 *
 * - Real path: populates rendered content fields + provenance digests.
 * - Fallback path: populates `generationSource="llm_fallback"` + `error`
 *   + optional promptId / model / promptFingerprint; content fields are
 *   undefined (outer layer emits the template path).
 * - Template path: populates `generationSource="template"` only; all other
 *   fields are undefined.
 */
export interface PromptPackageLlmServiceOutput {
  generationSource: "llm" | "llm_fallback" | "template";
  /** Populated on real path only; undefined on fallback / template. */
  renderedTitle?: string;
  renderedSummary?: string;
  /**
   * Fully rendered Markdown content string (LLM prompts + sections →
   * stable Markdown per design §4.7).
   */
  renderedContent?: string;
  /**
   * Outer layer must merge these content-only section fields with
   * externally derived structure fields (id / kind / items / nodeIds /
   * sourceDocumentIds / sourcePreviewIds) to produce the final
   * `BlueprintImplementationPromptSection[]`.
   */
  renderedSections?: Array<{ heading: string; body: string }>;
  /**
   * Reusable prompt asset list. Outer layer can mount these under an
   * aggregate `implementation`-kind "Reusable Prompts" section so that the
   * asset list is persisted without breaking the
   * `BlueprintImplementationPromptPackage` top-level type.
   */
  renderedPrompts?: RenderedPromptAsset[];
  /** Populated when LLM was actually invoked (real + llm_fallback with model/prompt known). */
  promptId?: string;
  model?: string;
  promptFingerprint?: string;
  /** Populated on real path. */
  responseDigest?: string;
  structuredPayloadDigest?: string;
  /** Populated on llm_fallback path (already redacted + truncated). */
  error?: string;
}

export type PromptPackageLlmService = (
  input: PromptPackageLlmServiceInput,
) => Promise<PromptPackageLlmServiceOutput>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERVICE_ENABLED_ENV = "BLUEPRINT_PROMPT_PACKAGE_LLM_ENABLED";

/** SHA-256 hex digest of a UTF-8 string. */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Truncate an arbitrary error message to `maxLength` characters with a
 * `"..."` suffix when exceeded. Used before redaction so the redaction
 * pass always sees a bounded-size string.
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return value.slice(0, maxLength - 3) + "...";
}

/**
 * Build a human-readable target platform label used in the rendered
 * Markdown. Falls back to capitalizing the platform id when no explicit
 * mapping is known.
 */
function resolveTargetLabel(
  platform: BlueprintImplementationPromptTargetPlatform,
): string {
  switch (platform) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    case "cursor":
      return "Cursor";
    case "kiro":
      return "Kiro";
    case "trae":
      return "Trae";
    case "windsurf":
      return "Windsurf";
    default: {
      const p = platform as string;
      return p.length === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1);
    }
  }
}

/**
 * Resolve locale from the service input. Task 12 option A: derive from the
 * clarification session when it carries a locale; otherwise default to
 * `"en-US"`. (The `BlueprintClarificationSession` type does not today
 * expose a stable `locale` field, so we defensively read it via an
 * untyped narrowing without widening the public type.)
 */
function resolveLocale(
  clarificationSession: BlueprintClarificationSession | undefined,
): "zh-CN" | "en-US" {
  if (!clarificationSession) return "en-US";
  const candidate = (clarificationSession as unknown as { locale?: unknown })
    .locale;
  return candidate === "zh-CN" ? "zh-CN" : "en-US";
}

/**
 * Format the zod safeParse error into a compact single-line summary of
 * `path: message; path: message; ...` entries.
 */
function formatZodError(issues: readonly { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `PromptPackageLlmService` instance bound to the given
 * `BlueprintServiceContext`. The policy is resolved eagerly at factory
 * time so downstream calls reuse the same policy object.
 *
 * The returned function is a pure async closure: all LLM access happens
 * through `ctx.llm.callJson` / `ctx.llm.getConfig`; no module-level
 * singletons are touched.
 */
export function createPromptPackageLlmService(
  ctx: BlueprintServiceContext,
): PromptPackageLlmService {
  // Task 13 wires `ctx.promptPackageLlmPolicy` as an override slot so tests
  // and composition roots can swap the policy without touching the factory.
  // When omitted, falls back to the default policy (equivalent to today).
  const policy: PromptPackageLlmPolicy =
    ctx.promptPackageLlmPolicy ?? createDefaultPromptPackageLlmPolicy();

  return async (input) => {
    const { targetPlatform } = input;

    // --- Tier 1: service not enabled ---
    if (process.env[SERVICE_ENABLED_ENV] !== "true") {
      ctx.logger.debug("prompt-package llm: not enabled, using template", {
        targetPlatform,
      });
      return { generationSource: "template" };
    }

    // --- Tier 2: apiKey missing (locked to tier-1 equivalence) ---
    const config = ctx.llm.getConfig();
    if (!config.apiKey) {
      ctx.logger.debug("prompt-package llm: apiKey missing, using template", {
        targetPlatform,
      });
      return { generationSource: "template" };
    }

    // --- Build deterministic prompt payload ---
    const locale = resolveLocale(input.clarificationSession);
    const promptPayload = buildPromptPackagePrompt({
      job: input.job,
      specTree: input.specTree,
      targetPlatform: input.targetPlatform,
      nodes: input.nodes,
      sourceDocuments: input.sourceDocuments,
      sourcePreviews: input.sourcePreviews,
      primaryRoute: input.primaryRoute,
      clarificationSession: input.clarificationSession,
      domainContext: input.domainContext,
      capabilityInvocations: input.capabilityInvocations,
      capabilityEvidence: input.capabilityEvidence,
      includeDrafts: input.includeDrafts,
      includePreviewDrafts: input.includePreviewDrafts,
      locale,
    });

    const model = config.model;
    const sessionId =
      input.clarificationSession?.id ??
      input.job.request.clarificationSessionId ??
      undefined;

    // --- Tiers 3/6: call LLM ---
    let rawPayload: unknown;
    try {
      rawPayload = await ctx.llm.callJson(
        [
          { role: "system", content: promptPayload.systemMessage },
          { role: "user", content: promptPayload.userMessage },
        ],
        {
          model,
          temperature: policy.temperature,
          timeoutMs: policy.maxInvocationTimeoutMs,
          retryAttempts: policy.callJsonRetryAttempts,
          sessionId,
        } as any,
      );
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : String(err);

      // Tier 6: timeout / AbortError identified by text heuristics.
      if (/abort|timeout/i.test(rawMessage)) {
        const redactedTimeoutError = applyPromptPackageRedaction(
          "llm timeout",
          policy,
        );
        ctx.logger.warn("prompt-package llm: timeout, using fallback", {
          promptId: PROMPT_PACKAGE_PROMPT_ID,
          targetPlatform,
          error: redactedTimeoutError,
        });
        return {
          generationSource: "llm_fallback",
          error: redactedTimeoutError,
          promptId: PROMPT_PACKAGE_PROMPT_ID,
          model,
          promptFingerprint: promptPayload.promptFingerprint,
        };
      }

      // Tier 3: callJson threw.
      const threwBody = truncate(rawMessage, policy.maxErrorLength - 30);
      const threwError = applyPromptPackageRedaction(
        `llm callJson threw: ${threwBody}`,
        policy,
      );
      const truncatedError = truncate(threwError, policy.maxErrorLength);
      ctx.logger.warn("prompt-package llm: callJson threw, using fallback", {
        promptId: PROMPT_PACKAGE_PROMPT_ID,
        targetPlatform,
        error: truncatedError,
      });
      return {
        generationSource: "llm_fallback",
        error: truncatedError,
        promptId: PROMPT_PACKAGE_PROMPT_ID,
        model,
        promptFingerprint: promptPayload.promptFingerprint,
      };
    }

    // --- Tier 3 (continued): non-JSON / undefined / non-object response ---
    if (rawPayload == null || typeof rawPayload !== "object") {
      const shapeError = applyPromptPackageRedaction("non-json response", policy);
      ctx.logger.warn("prompt-package llm: non-json response, using fallback", {
        promptId: PROMPT_PACKAGE_PROMPT_ID,
        targetPlatform,
        error: shapeError,
      });
      return {
        generationSource: "llm_fallback",
        error: shapeError,
        promptId: PROMPT_PACKAGE_PROMPT_ID,
        model,
        promptFingerprint: promptPayload.promptFingerprint,
      };
    }

    // --- Tiers 4/5: schema + superRefine validation ---
    const parsed = PromptPackageLlmResponseSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const rawSummary = formatZodError(parsed.error.issues);
      const schemaBody = truncate(rawSummary, policy.maxErrorLength - 30);
      const schemaError = applyPromptPackageRedaction(
        `schema validation failed: ${schemaBody}`,
        policy,
      );
      const truncatedError = truncate(schemaError, policy.maxErrorLength);
      ctx.logger.warn(
        "prompt-package llm: schema validation failed, using fallback",
        {
          promptId: PROMPT_PACKAGE_PROMPT_ID,
          targetPlatform,
          errorMsg: truncatedError,
        },
      );
      return {
        generationSource: "llm_fallback",
        error: truncatedError,
        promptId: PROMPT_PACKAGE_PROMPT_ID,
        model,
        promptFingerprint: promptPayload.promptFingerprint,
      };
    }

    // --- Happy path: normalize + render + digest ---
    const normalized: NormalizedPromptPackage = normalizePromptPackageResponse(
      parsed.data,
      input,
      policy,
    );

    const targetLabel = resolveTargetLabel(input.targetPlatform);
    const renderedContent = renderPromptPackageContent({
      title: normalized.title,
      summary: normalized.summary,
      prompts: normalized.prompts,
      sections: normalized.sections,
      targetLabel,
    });

    const responseDigest = "sha256:" + sha256Hex(JSON.stringify(rawPayload));
    const structuredPayloadDigest =
      "sha256:" + sha256Hex(JSON.stringify(normalized));

    return {
      generationSource: "llm",
      renderedTitle: normalized.title,
      renderedSummary: normalized.summary,
      renderedContent,
      renderedSections: normalized.sections,
      renderedPrompts: normalized.prompts,
      promptId: PROMPT_PACKAGE_PROMPT_ID,
      model,
      promptFingerprint: promptPayload.promptFingerprint,
      responseDigest,
      structuredPayloadDigest,
    };
  };
}
