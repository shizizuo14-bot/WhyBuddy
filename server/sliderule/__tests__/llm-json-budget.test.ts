import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isEmptyDialogueJsonShape,
  resolveSlideRuleJsonMaxTokens,
} from "../../core/llm-json-budget.js";

describe("llm-json-budget", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.SLIDERULE_JSON_LLM_MAX_TOKENS;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("raises budget for dialogue caps and thinking models", () => {
    process.env.LLM_MODEL = "ouyi-5-preview-thinking";
    process.env.LLM_REASONING_EFFORT = "high";
    expect(resolveSlideRuleJsonMaxTokens("route.generate")).toBeGreaterThanOrEqual(16_000);
    expect(resolveSlideRuleJsonMaxTokens("risk.analyze")).toBeGreaterThanOrEqual(16_000);
  });

  it("report.write 在 thinking 模型上即使传了 12k 默认 override 也要 ≥16k(修 report 薄→兜底慢)", () => {
    process.env.LLM_MODEL = "ouyi-5-preview-thinking";
    // buildCapabilityPrompt 给 report.write 传的固定默认 12000 不能短路掉 thinking 加码
    expect(resolveSlideRuleJsonMaxTokens("report.write", 12_000)).toBeGreaterThanOrEqual(16_000);
  });

  it("override 作为「至少」下限:非 thinking 时不低于默认/不低于 override", () => {
    delete process.env.LLM_MODEL;
    delete process.env.LLM_REASONING_EFFORT;
    expect(resolveSlideRuleJsonMaxTokens("report.write", 12_000)).toBe(12_000);
    expect(resolveSlideRuleJsonMaxTokens("route.generate", 20_000)).toBe(20_000); // 调用方要更多则尊重
  });

  it("detects empty dialogue JSON shapes", () => {
    expect(isEmptyDialogueJsonShape({ title: "t", summary: "s", content: "" })).toBe(true);
    expect(isEmptyDialogueJsonShape({ title: "t", summary: "s", content: "ok" })).toBe(false);
  });
});