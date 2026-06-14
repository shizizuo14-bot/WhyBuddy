/**
 * P0 · C_GAP → C_QEXP → G_READY readiness chain (V5.1).
 * Scheduling + gap lifecycle — zero LLM.
 */

import type { V5CapabilityId } from "./contracts.js";
import type { CoverageGap, V5SessionState } from "./v5-reasoning-state.js";
import { isVagueGoal, userClearsReadiness } from "./sliderule-interactive-gates.js";

export function openReadinessBlockingGaps(state: V5SessionState): CoverageGap[] {
  const contract = state.coverageContract;
  const blocking = new Set(contract?.blockingGapIds || []);
  return (state.coverageGaps || []).filter(
    (g) =>
      g.status === "open" &&
      (g.kind === "open_question" || g.kind === "missing_capability") &&
      (blocking.size === 0 || blocking.has(g.id))
  );
}

export function hasTrustedGapAskArtifact(state: V5SessionState): boolean {
  const stales = new Set(state.staleArtifactIds || []);
  return (state.artifacts || []).some(
    (a) =>
      a.producedBy?.capabilityId === "gap.ask" &&
      (a.trustLevel === "gated_pass" || a.trustLevel === "audited") &&
      !stales.has(a.id)
  );
}

/** True when ORCH should run gap.ask → question.expand before risk/report. */
export function needsReadinessChain(state: V5SessionState, userText: string): boolean {
  if (userClearsReadiness(userText, state)) return false;
  // Converge / delivery / report intents must not be preempted by S11 prepending.
  if (/报告|可行性|总结|收敛|report|落地|交付|路线|对比|预览|风险|安全/.test(userText)) return false;
  if (state.goal?.status === "clear" || state.deliveryPhase === "shipping") return false;

  const openQ = openReadinessBlockingGaps(state).filter((g) => g.kind === "open_question");
  if (openQ.length > 0) return true;

  const goalText = state.goal?.text || "";
  // S11 applies only to genuinely vague goals before gap.ask has run once.
  if (isVagueGoal(goalText) && !hasTrustedGapAskArtifact(state)) return true;

  return false;
}

/** Picker prepend for S11: gap.ask then question.expand. */
export function pickReadinessChainCapabilities(
  state: V5SessionState
): Array<{ capabilityId: V5CapabilityId; roleId: string }> {
  const recent = new Set(
    (state.capabilityRuns || []).slice(-8).map((r) => r.capabilityId as V5CapabilityId)
  );
  const picks: Array<{ capabilityId: V5CapabilityId; roleId: string }> = [];
  if (!recent.has("gap.ask")) {
    picks.push({ capabilityId: "gap.ask", roleId: "规划" });
  }
  if (!recent.has("question.expand")) {
    picks.push({ capabilityId: "question.expand", roleId: "规划" });
  }
  return picks;
}

/**
 * 结构化澄清问题（gap.ask 产出，喂澄清卡片）。
 * 词汇对齐 V4 `BlueprintClarificationQuestion`（prompt/type/options:string[]/defaultAnswer/context）。
 */
export type ClarifyQuestionType = "free_text" | "single_choice" | "multi_choice";
export interface ClarifyQuestion {
  id?: string;
  prompt: string;
  type?: ClarifyQuestionType;
  options?: string[];
  defaultAnswer?: string;
  context?: string;
}

/** 解析 gap.ask content 内的 ```clarify-json 围栏块 → 结构化问题 + 去块后的可读正文。 */
export function extractClarifyBlock(content: string): {
  questions: ClarifyQuestion[] | null;
  cleanedContent: string;
} {
  const re = /```clarify-json\s*([\s\S]*?)```/i;
  const m = content.match(re);
  if (!m) return { questions: null, cleanedContent: content };
  let questions: ClarifyQuestion[] | null = null;
  try {
    const parsed = JSON.parse(m[1].trim());
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (Array.isArray(arr)) {
      questions = arr
        .map((q: any) => {
          const prompt = String(q?.prompt ?? q?.question ?? "").trim();
          if (!prompt) return null;
          const options = Array.isArray(q.options)
            ? q.options
                .map((o: any) => (typeof o === "string" ? o : o?.label))
                .filter((o: any) => typeof o === "string" && o.trim())
                .slice(0, 4)
                .map((o: string) => o.trim().slice(0, 80))
            : undefined;
          const rawType = String(q?.type || "").trim();
          const type: ClarifyQuestionType =
            rawType === "single_choice" || rawType === "multi_choice" || rawType === "free_text"
              ? (rawType as ClarifyQuestionType)
              : options && options.length > 0
                ? "single_choice"
                : "free_text";
          return {
            prompt: prompt.slice(0, 240),
            type,
            options: options && options.length > 0 ? options : undefined,
            defaultAnswer:
              typeof (q?.defaultAnswer ?? q?.recommended) === "string"
                ? String(q.defaultAnswer ?? q.recommended).trim().slice(0, 80)
                : undefined,
            context: typeof q?.context === "string" ? q.context.trim().slice(0, 160) : undefined,
          } as ClarifyQuestion;
        })
        .filter((q): q is ClarifyQuestion => q !== null)
        .slice(0, 6);
    }
  } catch {
    questions = null;
  }
  const cleanedContent = content.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  return { questions: questions && questions.length > 0 ? questions : null, cleanedContent };
}

/** Extract blocking questions from gap.ask artifact body. */
export function extractBlockingQuestions(content: string): string[] {
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (/^[-*•]\s+/.test(line) && (line.includes("?") || line.includes("？"))) {
      out.push(line.replace(/^[-*•]\s+/, "").slice(0, 200));
    } else if (/^\d+[.)]\s+/.test(line) && (line.includes("?") || line.includes("？"))) {
      out.push(line.replace(/^\d+[.)]\s+/, "").slice(0, 200));
    } else if (/^【.+问题/.test(line) || /^问题\s*\d/.test(line)) {
      out.push(line.slice(0, 200));
    }
  }
  if (out.length === 0 && content.trim()) {
    out.push(content.trim().slice(0, 200));
  }
  return out.slice(0, 5);
}

/** After gap.ask commit: materialize open_question gaps + blockingGapIds. */
export function gapsFromGapAskContent(
  content: string,
  turnId: string,
  artifactId: string
): CoverageGap[] {
  const now = new Date().toISOString();
  const questions = extractBlockingQuestions(content);
  return questions.map((label, i) => ({
    id: `gap-q-${turnId}-${i}`,
    kind: "open_question" as const,
    label,
    status: "open" as const,
    reason: `gap.ask artifact ${artifactId}`,
    createdAt: now,
  }));
}

/** After gap.ask commit: materialize open_question gaps from STRUCTURED clarify questions (with options). */
export function gapsFromClarifyQuestions(
  questions: ClarifyQuestion[],
  turnId: string,
  artifactId: string
): CoverageGap[] {
  const now = new Date().toISOString();
  return questions.map((q, i) => ({
    id: `gap-q-${turnId}-${i}`,
    kind: "open_question" as const,
    label: q.prompt.slice(0, 240),
    status: "open" as const,
    reason: `gap.ask artifact ${artifactId}`,
    createdAt: now,
    clarifyType: q.type ?? (q.options && q.options.length > 0 ? "single_choice" : "free_text"),
    options: q.options && q.options.length > 0 ? q.options : undefined,
    defaultAnswer: q.defaultAnswer,
    context: q.context,
    questionId: q.id || `gap-q-${turnId}-${i}`,
  }));
}

export function mergeGapAskIntoState(
  state: V5SessionState,
  gaps: CoverageGap[]
): V5SessionState {
  if (gaps.length === 0) return state;
  const existing = state.coverageGaps || [];
  const contract = state.coverageContract;
  const newIds = gaps.map((g) => g.id);
  const mergedGaps = [...existing];
  for (const g of gaps) {
    if (!mergedGaps.some((x) => x.id === g.id)) mergedGaps.push(g);
  }
  const blocking = new Set(contract?.blockingGapIds || []);
  for (const id of newIds) blocking.add(id);
  return {
    ...state,
    coverageGaps: mergedGaps,
    coverageContract: contract
      ? { ...contract, blockingGapIds: [...blocking] }
      : contract,
  };
}

/** INTAKE: user supplement resolves open_question blocking gaps. */
export function resolveReadinessGapsFromUserText(
  state: V5SessionState,
  userText: string
): V5SessionState {
  if (!userClearsReadiness(userText, state)) return state;
  const now = new Date().toISOString();
  let changed = false;
  const gaps = (state.coverageGaps || []).map((g) => {
    if (g.status !== "open" || g.kind !== "open_question") return g;
    changed = true;
    return { ...g, status: "resolved" as const, updatedAt: now };
  });
  return changed ? { ...state, coverageGaps: gaps } : state;
}

/**
 * 澄清卡片回答：按 gap id 精确把这些 open_question gap 置 resolved（支持部分回答）。
 * 比启发式整批解析更可靠 —— 卡片提交时带 answeredGapIds。
 */
export function resolveReadinessGapsByIds(
  state: V5SessionState,
  answeredGapIds: string[]
): V5SessionState {
  if (!answeredGapIds || answeredGapIds.length === 0) return state;
  const target = new Set(answeredGapIds);
  const now = new Date().toISOString();
  let changed = false;
  const gaps = (state.coverageGaps || []).map((g) => {
    if (g.status !== "open" || g.kind !== "open_question" || !target.has(g.id)) return g;
    changed = true;
    return { ...g, status: "resolved" as const, updatedAt: now };
  });
  return changed ? { ...state, coverageGaps: gaps } : state;
}