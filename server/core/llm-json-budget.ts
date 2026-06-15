import { getAIConfig } from "./ai-config.js";

export type SlideRuleJsonCapability =
  | "route.generate"
  | "route.compare"
  | "intent.clarify"
  | "gap.ask"
  | "question.expand"
  | "requirement.write"
  | "risk.analyze"
  | "report.write"
  | "synthesis.merge"
  | string;

const DIALOGUE_JSON_CAPS = new Set([
  "route.generate",
  "route.compare",
  "intent.clarify",
  "gap.ask",
  "question.expand",
  "requirement.write",
  "risk.analyze",
]);

/** Output budget for JSON-mode SlideRule caps (reasoning models need extra headroom). */
export function resolveSlideRuleJsonMaxTokens(
  capabilityId: SlideRuleJsonCapability,
  override?: number
): number {
  // env 是绝对逃生阀(用户显式全局设定),最高优先级。
  const envRaw = process.env.SLIDERULE_JSON_LLM_MAX_TOKENS;
  const envParsed = envRaw ? Number.parseInt(envRaw, 10) : NaN;
  if (Number.isFinite(envParsed) && envParsed > 0) {
    return envParsed;
  }

  let base = 8000;
  if (capabilityId === "report.write") base = 12_000;
  else if (DIALOGUE_JSON_CAPS.has(capabilityId)) base = 12_000;

  // override 视为「至少这么多」而非「恰好」—— 调用方(如 buildCapabilityPrompt 给 report.write 的 12k)
  // 传的是默认值,不能因此短路掉下面 thinking 模型的 16k 加码(否则 report.write 在 thinking 模型上
  // 永远只有 12k,reasoning 吃完 → 正文薄/空 → 质量门挂 → 模板兜底 → 体感很慢)。
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    base = Math.max(base, override);
  }

  const model = (getAIConfig().model || process.env.LLM_MODEL || "").toLowerCase();
  const reasoningEffort = (process.env.LLM_REASONING_EFFORT || "").trim();
  const isReasoningHeavy =
    model.includes("thinking") ||
    model.includes("reasoning") ||
    reasoningEffort.length > 0;

  if (isReasoningHeavy) {
    base = Math.max(base, 16_000);
  }

  return base;
}

export function isEmptyDialogueJsonShape(
  json: { title?: string; summary?: string; content?: string } | null | undefined
): boolean {
  if (!json || typeof json !== "object") return true;
  const content = String(json.content ?? "").trim();
  return content.length === 0;
}