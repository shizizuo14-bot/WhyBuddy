import { callLLMJsonWithUsage } from "../core/llm-client.js";
import {
  isEmptyDialogueJsonShape,
  resolveSlideRuleJsonMaxTokens,
  type SlideRuleJsonCapability,
} from "../core/llm-json-budget.js";

type DialogueJson = { title?: string; summary?: string; content?: string };

export async function callSlideRuleDialogueJsonLlm(
  capabilityId: SlideRuleJsonCapability,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: {
    model: string;
    temperature?: number;
    timeoutMs?: number;
    retryAttempts?: number;
    maxTokens?: number;
    reasoningEffort?: string;  // allow per-call lighter reasoning for 504 recovery
  }
): Promise<{ json: DialogueJson; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; finishReason?: string }> {
  const maxTokens = resolveSlideRuleJsonMaxTokens(capabilityId, options.maxTokens);
  const timeoutMs = options.timeoutMs ?? 120_000;

  const first = await callLLMJsonWithUsage<DialogueJson>(messages, {
    model: options.model,
    temperature: options.temperature,
    maxTokens,
    timeoutMs,
    retryAttempts: options.retryAttempts ?? 1,
    reasoningEffort: options.reasoningEffort,
  } as any);

  if (!isEmptyDialogueJsonShape(first.json)) {
    return first;
  }

  const boosted = Math.min(maxTokens * 2, 32_000);
  if (boosted <= maxTokens) {
    return first;
  }

  console.warn(
    `[sliderule-json-llm] ${capabilityId}: empty content after first pass ` +
      `(maxTokens=${maxTokens}, finish=${first.finishReason ?? "unknown"}); retrying with ${boosted}`
  );

  const second = await callLLMJsonWithUsage<DialogueJson>(messages, {
    model: options.model,
    temperature: options.temperature,
    maxTokens: boosted,
    timeoutMs,
    retryAttempts: 0,
  } as any);

  return isEmptyDialogueJsonShape(second.json) ? first : second;
}