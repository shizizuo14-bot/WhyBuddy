import type { V5SessionState } from "../../shared/blueprint/v5-reasoning-state.js";
import type { V5CapabilityId } from "../../shared/blueprint/contracts.js";
import { ALL_V5_CAPABILITIES } from "../../shared/blueprint/contracts.js";
import { CAPABILITY_DESCRIPTIONS } from "../../shared/blueprint/sliderule-capability-catalog.js";
import { pickNextCapabilities } from "../../shared/blueprint/sliderule-pick-heuristic.js";
import {
  pickBrainstormChain,
  resolveRoleMode,
  shouldDegradeBrainstorm,
} from "../../shared/blueprint/sliderule-role-mode.js";
import {
  validateProposedPlan,
  type DropReason,
} from "../../shared/blueprint/sliderule-plan-validation.js";
import { capabilityDomainAnchoringBlock } from "../../shared/blueprint/sliderule-narration-immunity.js";
import { getAIConfig } from "../core/ai-config.js";
import { callLLMJsonWithUsage, clearPrimaryLLMCooldown } from "../core/llm-client.js";
import { callPoolJsonLlm, shouldSkipPrimaryLlmAfterPoolExhausted } from "./pool-json-llm.js";
import { readEnvCompat } from "../../shared/env/read-env-compat.js";
import {
  hasGroundedExternalEvidence,
  isGroundedEvidenceArtifact,
  recentUngroundedEvidenceAttempts,
} from "../../shared/blueprint/sliderule-grounding.js";

/** Resolved routing model (需求 3.1): `routerModel` when set, else primary `model`. */
export function resolveRouterModel(config: { routerModel?: string; model: string }): string {
  return config.routerModel ?? config.model;
}

/**
 * Mechanical convergence predicate (需求 3.3 / 3.4 — 修订 B).
 * Purely structural: `selected` empty AND `converged === true`. Never inspects rationale text.
 */
export function isMechanicalConvergenceSignal(selected: unknown, converged: unknown): boolean {
  return Array.isArray(selected) && selected.length === 0 && converged === true;
}

export type OrchestratePlanFallbackReason =
  | "no_api_key"
  | "llm_error"
  | "empty_response"
  | "invalid_proposal";

export type OrchestratePlanRequest = {
  state: V5SessionState;
  turnId: string;
  userText: string;
  intervention?: {
    intent?: string;
    targetArtifactId?: string;
    targetDecisionId?: string;
  } | null;
};

export type OrchestratePlanResponse = {
  selected: Array<{ capabilityId: V5CapabilityId; roleId: string; why?: string }>;
  rationale: string;
  source: "llm" | "heuristic_fallback";
  /**
   * Net-new (需求 3.3 / 3.4 — 修订 B): mechanical convergence signal. Set to
   * `true` only when the router returns an empty `selected` set together with
   * `converged === true`. The Session_Driver reads this purely structural flag
   * to terminate the re-entry loop as `convergence_signal` (distinct from an
   * `invalid_proposal` degradation). Optional / additive: callers and fixtures
   * that never emit `converged` keep working unchanged.
   */
  converged?: boolean;
  dropped?: Array<{ capabilityId: string; reason: DropReason }>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model?: string;
  };
  reason?: OrchestratePlanFallbackReason;
};

function healthyArtifactKinds(state: V5SessionState): string[] {
  const stales = new Set(state.staleArtifactIds || []);
  const kinds = new Set<string>();
  for (const a of state.artifacts || []) {
    if (
      (a.trustLevel === "gated_pass" || a.trustLevel === "audited") &&
      !stales.has(a.id)
    ) {
      kinds.add(a.kind);
    }
  }
  return Array.from(kinds);
}

function recentChoseCaps(state: V5SessionState): string[] {
  const ledger = state.decisionLedger || [];
  return ledger
    .slice(-4)
    .flatMap((d) => d.chose || []);
}

function budgetSummary(state: V5SessionState): {
  turns: number;
  runs: number;
  remainingTurns: number;
  remainingRuns: number;
  estimatedTokens: number;
} {
  const runs = state.capabilityRuns || [];
  const turnIds = new Set(runs.map((r) => r.turnId).filter(Boolean));
  const maxTurns = 30;
  const maxRuns = 120;
  const costs = state.costLedger || [];
  const estimatedTokens = costs.reduce((s, c) => s + (c.estimatedTokens || 0), 0);
  return {
    turns: turnIds.size,
    runs: runs.length,
    remainingTurns: Math.max(0, maxTurns - turnIds.size),
    remainingRuns: Math.max(0, maxRuns - runs.length),
    estimatedTokens,
  };
}

function buildCapabilityCatalogBlock(): string {
  return ALL_V5_CAPABILITIES.map(
    (id) => `- ${id}: ${CAPABILITY_DESCRIPTIONS[id]}`
  ).join("\n");
}

/**
 * Net-new (需求 3.2): inject the Coverage_Contract's required & conditional
 * capability summary into the router prompt so the LLM_Router can prioritize
 * required gaps. Only capability ids / contract metadata are emitted here — no
 * full artifact content — preserving the existing compression constraint
 * (prompt passes only id/kind/summary, never full content).
 */
function buildOpenGapsBlock(state: V5SessionState): string {
  const contract = state.coverageContract;
  const gaps = state.coverageGaps || [];
  if (!contract || gaps.length === 0) {
    return "OPEN_GAPS: (none)";
  }
  const blocking = new Set(contract.blockingGapIds || []);
  const open = gaps.filter((g) => blocking.has(g.id) && g.status === "open");
  if (open.length === 0) return "OPEN_GAPS: (all blocking gaps resolved/waived)";
  return (
    "OPEN_GAPS (blocking — must address before converge):\n" +
    open
      .map(
        (g) =>
          `  - ${g.id}: ${g.kind}${g.requiredCapabilityId ? ` → ${g.requiredCapabilityId}` : ""} (${g.label})`
      )
      .join("\n")
  );
}

function buildEvidenceStatusBlock(state: V5SessionState): string {
  const grounded = hasGroundedExternalEvidence(state);
  const attempts = recentUngroundedEvidenceAttempts(state, 6);
  const runs = (state.capabilityRuns || []).slice(-4);
  const evLines = runs
    .filter((r) => r.capabilityId === "evidence.search")
    .map((r) => {
      const art = (state.artifacts || []).find((a) => a.producedBy?.capabilityRunId === r.id);
      const ok = art ? isGroundedEvidenceArtifact(art) : false;
      const trust = art?.trustLevel || "none";
      return `  - run ${r.id}: grounded=${ok} trust=${trust}`;
    });
  return (
    `EVIDENCE_STATUS: session_grounded=${grounded}; recent_ungrounded_attempts=${attempts}\n` +
    (evLines.length ? evLines.join("\n") : "  (no recent evidence.search runs)")
  );
}

function buildFailureEventsBlock(state: V5SessionState): string {
  const conv = (state.conversation || [])
    .filter((c) => c.role === "system" && /\[G-ROOT\]|\[GCOV\]|\[G-GROUND\]|检索失败|未引入外部证据/i.test(c.text || ""))
    .slice(-6)
    .map((c) => `  - ${c.text?.slice(0, 160)}`);
  const failedRuns = (state.capabilityRuns || [])
    .slice(-8)
    .filter((r) => {
      const gates = r.gateResults || [];
      return gates.some((g) => g.gateId === "ground" && g.status === "failed");
    })
    .map((r) => `  - ${r.capabilityId} @ ${r.id}: G-GROUND failed`);
  const lines = [...conv, ...failedRuns];
  if (lines.length === 0) return "FAILURE_EVENTS: (none recent)";
  return "FAILURE_EVENTS (must not repeat blindly — change query/source or mark blocking):\n" + lines.join("\n");
}

function buildCoverageContractBlock(state: V5SessionState): string {
  const contract = state.coverageContract;
  if (!contract) {
    return "COVERAGE_CONTRACT: (none authored)";
  }
  const required = contract.requiredCapabilities || [];
  const conditional = contract.conditionalCapabilities || [];
  return (
    `COVERAGE_CONTRACT (prioritize required gaps; mode=${contract.mode}):\n` +
    `  required (${required.length}): ${required.join(", ") || "(none)"}\n` +
    `  conditional (${conditional.length}): ${conditional.join(", ") || "(none)"}\n` +
    `  min_evidence_per_requirement: ${contract.minEvidencePerRequirement}`
  );
}

const ORCHESTRATE_MAX_SELECTED = 4;

/**
 * Mechanical guard: complex product-build goals must run deliberation primers
 * (critique.generate → synthesis.merge) before report.write when not yet committed.
 *
 * V5.2/V5.3 audit (RPG marathon): LLM router can still propose 4 non-panel caps
 * and put critique/synthesis into alternativesRejected even when ROLE_MODE=complex.
 * This function is the last mechanical backstop — it must preserve primers even
 * when selected.length === 4 (do not let MAX_SELECTED slice them out).
 */
export function ensureComplexDeliberationPrimers(
  state: V5SessionState,
  userText: string,
  selected: Array<{ capabilityId: V5CapabilityId; roleId: string; why?: string }>
): Array<{ capabilityId: V5CapabilityId; roleId: string; why?: string }> {
  if (resolveRoleMode(state, userText) !== "complex" || shouldDegradeBrainstorm(state, userText)) {
    return selected;
  }

  const recent = new Set(
    (state.capabilityRuns || []).slice(-12).map((r) => r.capabilityId as string)
  );
  const alreadyScheduled = new Set(selected.map((s) => s.capabilityId));
  if (recent.has("critique.generate") || alreadyScheduled.has("critique.generate")) {
    return selected;
  }

  const primers = pickBrainstormChain(state).filter(
    (p) => !recent.has(p.capabilityId) && !alreadyScheduled.has(p.capabilityId)
  );
  if (primers.length === 0) return selected;

  // Prepend primers first (they must come before report.write per contract + V5.2 design).
  // Then append non-primer selected items. Finally respect MAX but *keep all primers*.
  const merged = [
    ...primers.map((p) => ({ capabilityId: p.capabilityId, roleId: p.roleId })),
    ...selected.filter((s) => !primers.some((p) => p.capabilityId === s.capabilityId)),
  ];
  const seen = new Set<string>();
  const deduped = merged.filter((p) => {
    if (seen.has(p.capabilityId)) return false;
    seen.add(p.capabilityId);
    return true;
  });

  // If over limit, keep primers + as many others as fit (never drop primers for product/game goals).
  if (deduped.length > ORCHESTRATE_MAX_SELECTED) {
    const primerCount = primers.length;
    const others = deduped.slice(primerCount);
    return [...deduped.slice(0, primerCount), ...others.slice(0, ORCHESTRATE_MAX_SELECTED - primerCount)];
  }
  return deduped;
}

function buildOrchestrateSystemPrompt(): string {
  return (
    "You are SlideRule V5's orchestration planner (ORCH). " +
    capabilityDomainAnchoringBlock() +
    "Given session state and user input, propose 1-4 capability actions for this turn. " +
    "Return ONLY a JSON object (no markdown fences) with exactly:\n" +
    '{"selected":[{"capabilityId":"...","roleId":"...","why":"..."}],"rationale":"..."}\n' +
    "Rules: use only capability ids from the provided catalog; 1-4 items; roleId must be a V5 role; " +
    "why is optional but encouraged when repeating or prioritizing a capability. " +
    "\n" +
    "CRITICAL — V5.2 Roles + V5.3 contract rule (product-build / game / platform / multi-agent goals): " +
    "If ROLE_MODE=complex (or COVERAGE_CONTRACT.mode=complex), you MUST front-load critique.generate " +
    "(role 挑刺) and synthesis.merge (role 综合) before any report.write or final convergence. " +
    "These are required by the authored CoverageContract for complex goals (see COVERAGE_CONTRACT block). " +
    "Skipping them for a complex goal is a policy violation — prefer them even if it means using fewer other caps. " +
    "Only skip if the contract explicitly lists only evidence.search as blocking. " +
    "When ROLE_MODE=complex and critique.generate has not run, you MUST include it (and synthesis.merge when missing) BEFORE report.write. " +
    "Do not skip multi-role deliberation for product-build / game / platform / 多Agent goals.\n" +
    'When you confirm no further reasoning steps are needed, return {"selected": [], "converged": true, "rationale": ...}.'
  );
}

/** Exported for deterministic prompt-compression regression tests (需求 11.3). */
export function buildOrchestrateUserPrompt(req: OrchestratePlanRequest): string {
  const { state, userText, intervention } = req;
  const goal = state.goal?.text || "";
  const goalStatus = state.goal?.status || "unknown";
  const staleIds = state.staleArtifactIds || [];
  const healthyKinds = healthyArtifactKinds(state);
  const recentChose = recentChoseCaps(state);
  const budget = budgetSummary(state);
  const openQ = (state.openQuestions || []).length;

  const interventionNote =
    intervention?.intent === "challenge"
      ? "INTERVENTION: user challenged prior conclusions — stale artifacts withdrawn; prefer re-convergence (e.g. risk/report) where gaps exist.\n"
      : intervention?.intent
        ? `INTERVENTION: ${intervention.intent}\n`
        : "";

  const roleMode = resolveRoleMode(state, userText);

  return (
    `${capabilityDomainAnchoringBlock(goal)}` +
    `${interventionNote}` +
    `GOAL: ${goal}\nGOAL_STATUS (mechanical): ${goalStatus}\n` +
    `ROLE_MODE: ${roleMode}\n` +
    `USER_TEXT: ${userText}\n` +
    `HEALTHY_ARTIFACT_KINDS: ${healthyKinds.join(", ") || "(none)"}\n` +
    `STALE_COUNT: ${staleIds.length}\n` +
    `OPEN_QUESTIONS: ${openQ}\n` +
    `RECENT_DLEDGER_CHOSE (soft avoid): ${recentChose.join(", ") || "(none)"}\n` +
    `BUDGET: turns_used=${budget.turns} runs=${budget.runs} est_tokens=${budget.estimatedTokens} ` +
    `remaining_turns≈${budget.remainingTurns} remaining_runs≈${budget.remainingRuns}\n\n` +
    `${buildCoverageContractBlock(state)}\n\n` +
    `IMPORTANT: For complex goals the COVERAGE_CONTRACT lists required deliberation caps (critique.generate, synthesis.merge, risk.analyze etc). The plan MUST respect them or the GCOV gate will block later. Prefer the required caps early.\n\n` +
    `${buildOpenGapsBlock(state)}\n\n` +
    `${buildEvidenceStatusBlock(state)}\n\n` +
    `${buildFailureEventsBlock(state)}\n\n` +
    `CAPABILITY_CATALOG:\n${buildCapabilityCatalogBlock()}`
  );
}

function heuristicFallback(
  req: OrchestratePlanRequest,
  reason: OrchestratePlanFallbackReason
): OrchestratePlanResponse {
  const userText = req.userText || req.state.goal?.text || "";
  let selected = pickNextCapabilities(req.state, userText);
  // Heuristic guard (V5.2/V5.3 audit): even on fallback (no_api_key / llm_error / invalid etc),
  // complex goals must get their deliberation primers (critique.generate etc) prepended.
  // Mirrors the ensureComplexDeliberationPrimers path taken on successful LLM proposals.
  selected = ensureComplexDeliberationPrimers(req.state, userText, selected);
  return {
    selected,
    rationale: `heuristic_fallback (${reason}) for: ${userText.slice(0, 80)}`,
    source: "heuristic_fallback",
    reason,
  };
}

export async function executeOrchestratePlan(
  req: OrchestratePlanRequest
): Promise<OrchestratePlanResponse> {
  const config = getAIConfig();

  // Net-new (需求 3.1): route with the low-cost router model when configured,
  // else fall back to the primary model. R1 validation / clamp / fallback below
  // is consumed as preserved baseline and not redesigned.
  const routerModel = resolveRouterModel(config);

  const parseOrchestrateJson = async (): Promise<{
    json: {
      selected?: Array<{ capabilityId?: string; roleId?: string; why?: string }>;
      rationale?: string;
      converged?: boolean;
    };
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    modelLabel: string;
  } | null> => {
    const userPrompt = buildOrchestrateUserPrompt(req);
    const systemPrompt = buildOrchestrateSystemPrompt();

    // 5+1 architecture: the router (orchestrate.plan) is always handled by the high-level model (gpt-5.5).
    // It is the "planner" that decides allocation. We bypass the low-level pool here to ensure
    // planning and complex decisions use the strong model. Low-level execution caps use the 5 ouyi pool.
    // (Previously we tried pooled first for cost; now forced to primary per user 5+1 requirement.)
    if (!config.apiKey) return null;

    // 5+1 planner prefers the high-level model (gpt-5.5) for quality planning/allocation.
    // If high fails (as in this run: repeated "Cannot reach blackaicoding" leading to "all providers unavailable"),
    // fall back to the low 5-key ouyi pool for the planning call. This keeps the marathon moving with
    // (degraded) 5+1: high preferred, low as resilient concurrent backup for planner.
    // Low execution caps continue to use the pool in parallel.
    const routerTimeout = Number(
      readEnvCompat("LLM_ROUTER_TIMEOUT_MS") || config.timeoutMs || 600000
    );

    const plannerModel = config.model;  // the gpt-5.5 high model

    try {
      // Use a lighter reasoning effort for the *planning* step even if global LLM_REASONING_EFFORT=high.
      // Heavy planning prompts (full state + many agents + JSON) + high reasoning frequently cause
      // upstream gateway timeouts (HTTP 524 from Cloudflare fronting blackaicoding etc.).
      // Lighter effort still gives good allocation quality but finishes faster on the provider side.
      const { json, usage } = await callLLMJsonWithUsage<{
        selected?: Array<{ capabilityId?: string; roleId?: string; why?: string }>;
        rationale?: string;
        converged?: boolean;
      }>(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          model: plannerModel,
          temperature: 0.2,
          maxTokens: 4000,
          timeoutMs: routerTimeout,
          retryAttempts: 1,
          stream: false,
          reasoningEffort: 'medium',
        } as any
      );
      return { json, usage, modelLabel: plannerModel };
    } catch (e) {
      const errStr = String(e);
      const isTransient = /cannot reach|524|gateway timeout|origin.*timeout|network|fetch failed/i.test(errStr);
      const providerHost = (config.baseUrl || "").replace(/^https?:\/\//, "").split("/")[0] || "configured LLM host";
      const logMsg = isTransient
        ? `[sliderule] /orchestrate-plan high model hit transient connectivity / gateway issue to ${providerHost} (e.g. "Cannot reach LLM service" or 5xx). This can happen intermittently even with direct fetch + NO_PROXY (Clash etc.). Falling back to 5-low pool (sequential for safety).`
        : `[sliderule] /orchestrate-plan high model failed, falling back to 5-low pool for planning:`;
      console.warn(logMsg, isTransient ? errStr.slice(0, 300) : errStr.slice(0, 200));

      // Use sequential for the fallback planning call to avoid concurrent overload on flaky providers/keys.
      // (The env mode is parallel, but for critical router fallback we force safer sequential to give individual keys a better chance.)
      const originalRace = process.env.SLIDERULE_POOL_RACE_MODE;
      process.env.SLIDERULE_POOL_RACE_MODE = "sequential";
      const pooled = await callPoolJsonLlm<{
        selected?: Array<{ capabilityId?: string; roleId?: string; why?: string }>;
        rationale?: string;
        converged?: boolean;
      }>(systemPrompt, userPrompt, 0.2);
      if (originalRace) process.env.SLIDERULE_POOL_RACE_MODE = originalRace;
      if (pooled?.json) {
        // Transient connectivity blip to primary (blackaicoding) — clear cooldowns (primary + global)
        // so the very next planning iteration (and other gpt-5.5 caps) can immediately retry the primary
        // instead of waiting even the short 15s.
        if (isTransient) {
          try { clearPrimaryLLMCooldown(); } catch {}
        }
        return {
          json: pooled.json,
          usage: pooled.usage ? {
            prompt_tokens: pooled.usage.inputTokens,
            completion_tokens: pooled.usage.outputTokens,
            total_tokens: pooled.usage.totalTokens,
          } : undefined,
          modelLabel: `${pooled.model}@${pooled.poolLabel} (5+1 pool fallback)`,
        };
      }
      return null;
    }
  };

  try {
    const parsed = await parseOrchestrateJson();
    if (!parsed) {
      console.warn("[sliderule] /orchestrate-plan fallback: no_llm_available");
      return heuristicFallback(req, "no_api_key");
    }
    const { json, usage, modelLabel } = parsed;

    const rationale = String(json?.rationale || "").trim();

    // Net-new (需求 3.3 / 3.4 — 修订 B): Convergence_Signal mechanical contract.
    // The decision is PURELY STRUCTURAL — no semantic matching on rationale text.
    // When the router returns an empty `selected` set AND `converged === true`,
    // pass it through as a convergence signal (source=llm) rather than degrading
    // to `invalid_proposal`. The empty-selected case WITHOUT `converged === true`
    // falls through to the preserved heuristic-fallback path below.
    const rawSelected = json?.selected;
    if (isMechanicalConvergenceSignal(rawSelected, json?.converged)) {
      return {
        selected: [],
        rationale,
        source: "llm",
        converged: true,
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            model: modelLabel,
          }
        : undefined,
      };
    }

    const validated = validateProposedPlan(
      { selected: json?.selected, rationale },
      req.state
    );

    if (!validated.valid || validated.selected.length === 0) {
      // TEMP diagnostic: why did the planner proposal fail validation? (raw shape + dropped reasons)
      const sel: any = (json as any)?.selected;
      console.warn(
        "[sliderule] /orchestrate-plan fallback: invalid_proposal |",
        "jsonKeys=", json && typeof json === "object" ? Object.keys(json as any).join(",") : typeof json,
        "| selected=", Array.isArray(sel) ? `array(len ${sel.length})` : typeof sel,
        "| sample=", (() => { try { return JSON.stringify(sel).slice(0, 300); } catch { return "n/a"; } })(),
        "| dropped=", JSON.stringify(validated.dropped).slice(0, 300)
      );
      const fb = heuristicFallback(req, "invalid_proposal");
      return { ...fb, dropped: validated.dropped };
    }

    if (!rationale) {
      console.warn("[sliderule] /orchestrate-plan fallback: empty_response");
      const fb = heuristicFallback(req, "empty_response");
      return { ...fb, dropped: validated.dropped };
    }

    const withDeliberation = ensureComplexDeliberationPrimers(
      req.state,
      req.userText || req.state.goal?.text || "",
      validated.selected
    );

    return {
      selected: withDeliberation,
      rationale,
      source: "llm",
      ...(validated.dropped.length ? { dropped: validated.dropped } : {}),
      usage: usage
        ? {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            model: modelLabel,
          }
        : undefined,
    };
  } catch (e: any) {
    console.warn(
      "[sliderule] /orchestrate-plan fallback: llm_error —",
      String(e?.message || e).slice(0, 200)
    );
    return heuristicFallback(req, "llm_error");
  }
}

/**
 * Router abstraction for Session_Driver injection (需求 2.1 / 3.1).
 *
 * The Session_Driver drives the multi-step re-entry loop and needs an
 * injectable router seam (so a Deterministic_Provider can be swapped in under
 * `BUILD_TARGET=test`). R1's validation / clamp / fallback
 * (`validateProposedPlan`, `maxCapabilityRunsPerTurn`, `heuristicFallback`) is
 * consumed as preserved baseline through `executeOrchestratePlan` and is NOT
 * redesigned here.
 */
export interface ReasoningRouter {
  proposePlan(req: OrchestratePlanRequest): Promise<OrchestratePlanResponse>;
}

/**
 * Default router adapter: a thin pass-through to the existing
 * `executeOrchestratePlan` path. Session_Driver uses this when no explicit
 * router is injected.
 */
export const defaultReasoningRouter: ReasoningRouter = {
  proposePlan: (req) => executeOrchestratePlan(req),
};