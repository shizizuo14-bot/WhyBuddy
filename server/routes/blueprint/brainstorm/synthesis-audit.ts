/**
 * @description Synthesis Audit — primary-model (gpt-5.5) review of a brainstorm
 * synthesis decision. After the aux pool finishes deliberating and the primary
 * model produces a synthesis, this module asks the SAME primary model to audit
 * that decision: is it supported by the crew outputs / evidence, are there
 * unresolved challenges, is anything fabricated?
 *
 * The result (`pass` / `needs_review`) is consumed downstream (Task 4) where it
 * is written to the checks ledger and may flag the StageResult for re-review.
 *
 * Hard guarantee: `auditSynthesis` NEVER throws. Any caller rejection,
 * unparseable response, or internal error degrades to a conservative
 * `needs_review` result so the pipeline can keep running while still surfacing
 * that the synthesis could not be confidently validated.
 *
 * @see .kiro/specs/autopilot-brainstorm-companion-runtime/design.md §2
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import type {
  BrainstormSession,
  SynthesisResult,
} from "../../../../shared/blueprint/brainstorm-contracts";

import type { LLMCallerFn } from "./orchestrator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Outcome of the primary-model audit over a synthesis decision. */
export interface SynthesisAuditResult {
  status: "pass" | "needs_review";
  reasons: string[];
  unresolvedChallengeCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * When the number of unresolved deliberation challenges reaches this threshold,
 * the synthesis is flagged for review regardless of the model's verdict.
 */
export const UNRESOLVED_CHALLENGE_REVIEW_THRESHOLD = 3;

/** Cap on how much crew/decision text is fed into the audit prompt. */
const MAX_TEXT_SLICE = 1200;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit a synthesis decision with the primary model.
 *
 * Derives the unresolved-challenge count from the session's deliberation
 * summary (the existing contract field — no new field invented), asks the
 * primary model whether the decision is evidence-supported / free of
 * fabrication, then combines the two signals into a `pass` / `needs_review`
 * verdict. Never throws.
 */
export async function auditSynthesis(input: {
  synthesis: SynthesisResult;
  session: BrainstormSession;
  primaryCaller: LLMCallerFn;
}): Promise<SynthesisAuditResult> {
  const unresolvedChallengeCount = deriveUnresolvedChallengeCount(input.session);

  try {
    const prompt = buildAuditPrompt(
      input.synthesis,
      input.session,
      unresolvedChallengeCount,
    );

    const raw = await input.primaryCaller(prompt, {});
    const verdict = parseAuditVerdict(raw);

    if (!verdict) {
      return {
        status: "needs_review",
        reasons: ["audit failed: unparseable audit response"],
        unresolvedChallengeCount,
      };
    }

    const reasons: string[] = [...verdict.reasons];
    let status: SynthesisAuditResult["status"] = "pass";

    if (verdict.unsupported) {
      status = "needs_review";
      reasons.push("primary model flagged the decision as unsupported by evidence");
    }
    if (verdict.fabrication) {
      status = "needs_review";
      reasons.push("primary model flagged possible fabrication");
    }
    if (unresolvedChallengeCount >= UNRESOLVED_CHALLENGE_REVIEW_THRESHOLD) {
      status = "needs_review";
      reasons.push(
        `unresolved challenge count (${unresolvedChallengeCount}) >= threshold (${UNRESOLVED_CHALLENGE_REVIEW_THRESHOLD})`,
      );
    }
    // Respect an explicit model verdict even when no specific flag was set.
    if (!verdict.supported && status === "pass") {
      status = "needs_review";
      reasons.push("primary model did not affirm the decision");
    }

    return { status, reasons, unresolvedChallengeCount };
  } catch (err) {
    return {
      status: "needs_review",
      reasons: [`audit failed: ${redactReason(err)}`],
      unresolvedChallengeCount,
    };
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Derive the unresolved-challenge count from the existing deliberation summary
 * contract field. Falls back to deriving it from the challenge/rebuttal lists
 * when the explicit count is absent, and finally to 0.
 */
function deriveUnresolvedChallengeCount(session: BrainstormSession): number {
  const summary = session.deliberationSummary;
  if (!summary) return 0;

  if (typeof summary.unresolvedChallengeCount === "number") {
    return Math.max(0, Math.round(summary.unresolvedChallengeCount));
  }

  // Fallback: challenges that received no rebuttal.
  const challengeCount = summary.challenges?.length ?? 0;
  const rebuttalCount = summary.rebuttals?.length ?? 0;
  return Math.max(0, challengeCount - rebuttalCount);
}

function buildAuditPrompt(
  synthesis: SynthesisResult,
  session: BrainstormSession,
  unresolvedChallengeCount: number,
): string {
  const crewOutputs = Array.from(session.crewMembers.values())
    .map((member) => {
      const content = member.output?.content?.trim();
      if (!content) return null;
      return `[${member.roleId}] (confidence ${member.output?.confidence?.toFixed(2) ?? "n/a"}):\n${content.slice(0, MAX_TEXT_SLICE)}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n\n---\n\n");

  const deliberationText = buildDeliberationText(session);

  return (
    `You are an audit reviewer for a multi-agent brainstorm session. The crew ` +
    `(aux models) deliberated and a primary synthesis decision was produced. ` +
    `Your job is to critically validate that decision.\n\n` +
    `Synthesis decision:\n${synthesis.decision.slice(0, MAX_TEXT_SLICE)}\n` +
    `Stated confidence: ${synthesis.confidence.toFixed(2)}\n\n` +
    `Crew member outputs (evidence base):\n${crewOutputs || "(none)"}\n\n` +
    (deliberationText ? `${deliberationText}\n` : "") +
    `Unresolved challenge count: ${unresolvedChallengeCount}\n\n` +
    `Evaluate:\n` +
    `1. Is the decision supported by the crew outputs / evidence?\n` +
    `2. Are there unresolved challenges that undermine it?\n` +
    `3. Does the decision contain fabricated claims not grounded in the outputs?\n\n` +
    `Respond with a JSON object matching this exact schema:\n` +
    `{\n` +
    `  "supported": boolean,\n` +
    `  "unsupported": boolean,\n` +
    `  "fabrication": boolean,\n` +
    `  "reasons": ["short string", ...]\n` +
    `}`
  );
}

function buildDeliberationText(session: BrainstormSession): string {
  const summary = session.deliberationSummary;
  if (!summary) return "";

  const lines: string[] = [];
  for (const challenge of summary.challenges ?? []) {
    lines.push(
      `Challenge (round ${challenge.roundNumber}) ${challenge.challengerRoleId} -> ${challenge.targetRoleId}: ${challenge.summary}`,
    );
  }
  for (const rebuttal of summary.rebuttals ?? []) {
    lines.push(
      `Rebuttal (round ${rebuttal.roundNumber}) ${rebuttal.responderRoleId} to "${rebuttal.challengeSummary}": ${rebuttal.summary}`,
    );
  }
  for (const dissent of summary.dissentingOpinions ?? []) {
    lines.push(`Dissent ${dissent.roleId}: ${dissent.opinion}`);
  }

  if (lines.length === 0) return "";
  return `Deliberation challenges / rebuttals / dissent:\n${lines.join("\n")}`;
}

interface AuditVerdict {
  supported: boolean;
  unsupported: boolean;
  fabrication: boolean;
  reasons: string[];
}

/**
 * Lenient JSON parse of the primary model's audit response. The model may wrap
 * JSON in prose / code fences, so we try a direct parse first then fall back to
 * extracting the first `{...}` block. Returns `null` when nothing usable is
 * found.
 */
function parseAuditVerdict(raw: string): AuditVerdict | null {
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
    "supported" in obj ||
    "unsupported" in obj ||
    "fabrication" in obj ||
    "reasons" in obj;
  if (!hasSignal) return null;

  const supported = typeof obj.supported === "boolean" ? obj.supported : false;
  const unsupported =
    typeof obj.unsupported === "boolean" ? obj.unsupported : false;
  const fabrication =
    typeof obj.fabrication === "boolean" ? obj.fabrication : false;

  const reasons = Array.isArray(obj.reasons)
    ? obj.reasons.filter((r): r is string => typeof r === "string")
    : [];

  return { supported, unsupported, fabrication, reasons };
}

/** Produce a short, non-sensitive reason string from an unknown error. */
function redactReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 120);
}
