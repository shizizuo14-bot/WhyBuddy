/**
 * @description Adjudicator — primary-model (gpt-5.5) structured verdict on
 * whether a round of brainstorm deliberation reached consensus. Replaces the
 * old `computeConvergenceScore` text-similarity heuristic with a real
 * Primary_Model judgement over the structured Critique / Rebuttal exchange.
 *
 * Given the round's critiques and rebuttals, the primary model decides:
 *   - did the crew converge (consensus)?
 *   - how converged are they ([0, 1] score)?
 *   - which critiques remain unresolved?
 *   - why (rationale)?
 *
 * Hard guarantee: the returned `AdjudicatorFn` NEVER throws. Any caller
 * rejection, timeout, or unparseable response degrades to a conservative
 * "no consensus" verdict (`consensusReached=false`, `convergenceScore=0`, all
 * critiques unresolved) so the deliberation engine keeps running and simply
 * proceeds to the next round / synthesis.
 *
 * `convergenceScore` is always clamped to the closed interval [0, 1]: NaN,
 * ±Infinity, and out-of-range values are clamped to a boundary (NaN → 0).
 *
 * Model split (R8): adjudication runs on the Primary_Model (`LLM_*` gpt-5.5),
 * physically separate from the aux pool used for debate. Mirrors the
 * never-throw + lenient JSON-extraction pattern of `synthesis-audit.ts`.
 *
 * @see .kiro/specs/autopilot-brainstorm-real-collaboration/design.md §2 (AdjudicatorFn)
 * Requirements: 3.1, 3.2, 3.6
 */

import type {
  AdjudicationResult,
  Critique,
  Rebuttal,
} from "../../../../shared/blueprint/brainstorm-contracts";

import type { LLMCallerFn } from "./orchestrator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Adjudicates a single round of deliberation. Never throws — on any failure it
 * resolves to a conservative `consensusReached=false` verdict (R3.6).
 */
export type AdjudicatorFn = (input: {
  critiques: Critique[];
  rebuttals: Rebuttal[];
  roundNumber: number;
}) => Promise<AdjudicationResult>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cap on how much critique/rebuttal text is fed into the adjudication prompt. */
const MAX_TEXT_SLICE = 600;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an {@link AdjudicatorFn} backed by the primary model caller (gpt-5.5).
 *
 * The returned function is the convergence/consensus judge for a deliberation
 * round. It never throws: LLM failure or an unparseable response yields a
 * conservative verdict that treats the round as not converged with every
 * critique unresolved.
 */
export function createAdjudicator(primaryCaller: LLMCallerFn): AdjudicatorFn {
  return async (input) => {
    const allCritiqueIds = input.critiques.map((c) => c.id);

    try {
      const prompt = buildAdjudicationPrompt(
        input.critiques,
        input.rebuttals,
        input.roundNumber,
      );

      const raw = await primaryCaller(prompt, {});
      const verdict = parseAdjudicationVerdict(raw);

      if (!verdict) {
        return conservativeVerdict(
          allCritiqueIds,
          "adjudication failed: unparseable verdict response",
        );
      }

      // Only surface critique ids that actually belong to this round, so the
      // unresolved set never references a phantom critique.
      const knownIds = new Set(allCritiqueIds);
      const unresolvedCritiqueIds = verdict.unresolvedCritiqueIds.filter((id) =>
        knownIds.has(id),
      );

      return {
        consensusReached: verdict.consensusReached,
        convergenceScore: clampConvergenceScore(verdict.convergenceScore),
        unresolvedCritiqueIds,
        rationale: verdict.rationale || "(no rationale provided)",
      };
    } catch (err) {
      return conservativeVerdict(
        allCritiqueIds,
        `adjudication failed: ${redactReason(err)}`,
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Conservative "no consensus" verdict used on any failure (R3.6): the round did
 * not converge, the score is the lower boundary, and every critique is treated
 * as unresolved so it is retained for later rounds / surfaced as dissent.
 */
function conservativeVerdict(
  critiqueIds: string[],
  rationale: string,
): AdjudicationResult {
  return {
    consensusReached: false,
    convergenceScore: 0,
    unresolvedCritiqueIds: [...critiqueIds],
    rationale,
  };
}

/**
 * Clamp the convergence score into the closed interval [0, 1].
 *
 * Non-numeric or NaN inputs clamp to 0; values below 0 (including -Infinity)
 * clamp to 0; values above 1 (including +Infinity) clamp to 1 (R3.2).
 */
function clampConvergenceScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function buildAdjudicationPrompt(
  critiques: Critique[],
  rebuttals: Rebuttal[],
  roundNumber: number,
): string {
  const rebuttalsByCritiqueId = new Map<string, Rebuttal[]>();
  for (const rebuttal of rebuttals) {
    const list = rebuttalsByCritiqueId.get(rebuttal.challengeId) ?? [];
    list.push(rebuttal);
    rebuttalsByCritiqueId.set(rebuttal.challengeId, list);
  }

  const exchangeText =
    critiques
      .map((critique) => {
        const header =
          `Critique [${critique.id}] (severity ${critique.severity}) ` +
          `${critique.challengerRoleId} -> ${critique.targetRoleId} ` +
          `on claim "${critique.targetClaim.slice(0, MAX_TEXT_SLICE)}":\n` +
          `  ${critique.critique.slice(0, MAX_TEXT_SLICE)}`;

        const replies = rebuttalsByCritiqueId.get(critique.id) ?? [];
        const replyText = replies
          .map(
            (r) =>
              `  Rebuttal [${r.stance}] by ${r.responderRoleId}: ` +
              `${r.rebuttal.slice(0, MAX_TEXT_SLICE)}`,
          )
          .join("\n");

        return replyText ? `${header}\n${replyText}` : `${header}\n  (no rebuttal)`;
      })
      .join("\n\n") || "(no critiques were raised this round)";

  const critiqueIds = critiques.map((c) => c.id);

  return (
    `You are the adjudicator for round ${roundNumber} of a multi-agent ` +
    `brainstorm deliberation. The crew exchanged structured critiques and ` +
    `rebuttals. Judge whether the crew has converged toward consensus.\n\n` +
    `Critique / rebuttal exchange:\n${exchangeText}\n\n` +
    `Evaluate:\n` +
    `1. Has the crew reached consensus (most critiques conceded or resolved)?\n` +
    `2. How converged are they overall, on a scale from 0 (fully divergent) ` +
    `to 1 (fully converged)?\n` +
    `3. Which critiques remain unresolved? Use exactly these critique ids: ` +
    `[${critiqueIds.join(", ")}].\n\n` +
    `Respond with a JSON object matching this exact schema:\n` +
    `{\n` +
    `  "consensusReached": boolean,\n` +
    `  "convergenceScore": number,\n` +
    `  "unresolvedCritiqueIds": ["critique-id", ...],\n` +
    `  "rationale": "short string"\n` +
    `}`
  );
}

interface ParsedAdjudication {
  consensusReached: boolean;
  convergenceScore: number;
  unresolvedCritiqueIds: string[];
  rationale: string;
}

/**
 * Lenient JSON parse of the primary model's adjudication response. The model
 * may wrap JSON in prose / code fences, so we try a direct parse first then
 * fall back to extracting the first `{...}` block. Returns `null` when nothing
 * usable is found.
 */
function parseAdjudicationVerdict(raw: string): ParsedAdjudication | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  // Require at least one of the recognised signals to consider it valid.
  const hasSignal =
    "consensusReached" in obj ||
    "convergenceScore" in obj ||
    "unresolvedCritiqueIds" in obj ||
    "rationale" in obj;
  if (!hasSignal) return null;

  const consensusReached =
    typeof obj.consensusReached === "boolean" ? obj.consensusReached : false;

  // Pass the raw value through; clamping happens in clampConvergenceScore.
  const convergenceScore =
    typeof obj.convergenceScore === "number" ? obj.convergenceScore : 0;

  const unresolvedCritiqueIds = Array.isArray(obj.unresolvedCritiqueIds)
    ? obj.unresolvedCritiqueIds.filter((id): id is string => typeof id === "string")
    : [];

  const rationale = typeof obj.rationale === "string" ? obj.rationale : "";

  return { consensusReached, convergenceScore, unresolvedCritiqueIds, rationale };
}

/** Produce a short, non-sensitive reason string from an unknown error. */
function redactReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 120);
}
