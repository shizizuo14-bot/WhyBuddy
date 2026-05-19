import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAIConfig } from "../core/ai-config.js";

const AI_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_REASONING_EFFORT",
  "OPENAI_WIRE_API",
  "OPENAI_TIMEOUT_MS",
  "OPENAI_STREAM",
  "OPENAI_CHAT_THINKING_TYPE",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_REASONING_EFFORT",
  "LLM_WIRE_API",
  "LLM_TIMEOUT_MS",
  "LLM_STREAM",
  "LLM_CHAT_THINKING_TYPE",
  "LLM_MAX_CONTEXT",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

function clearAIEnv(): void {
  for (const key of AI_ENV_KEYS) {
    delete process.env[key];
  }
}

describe("getAIConfig", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = snapshotEnv();
    clearAIEnv();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it("prefers project LLM_* settings over inherited OPENAI_* settings", () => {
    process.env.OPENAI_API_KEY = "openai-global-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.example/v1";
    process.env.OPENAI_MODEL = "openai-global-model";
    process.env.OPENAI_REASONING_EFFORT = "low";
    process.env.OPENAI_WIRE_API = "chat_completions";
    process.env.OPENAI_TIMEOUT_MS = "30000";
    process.env.OPENAI_STREAM = "true";
    process.env.OPENAI_CHAT_THINKING_TYPE = "enabled";

    process.env.LLM_API_KEY = "project-llm-key";
    process.env.LLM_BASE_URL = "https://www.su8.codes/codex/v1";
    process.env.LLM_MODEL = "gpt-5.5";
    process.env.LLM_REASONING_EFFORT = "high";
    process.env.LLM_WIRE_API = "responses";
    process.env.LLM_TIMEOUT_MS = "600000";
    process.env.LLM_STREAM = "false";
    process.env.LLM_CHAT_THINKING_TYPE = "disabled";

    const config = getAIConfig();

    expect(config.apiKey).toBe("project-llm-key");
    expect(config.baseUrl).toBe("https://www.su8.codes/codex/v1");
    expect(config.providerName).toBe("www.su8.codes");
    expect(config.model).toBe("gpt-5.5");
    expect(config.modelReasoningEffort).toBe("high");
    expect(config.wireApi).toBe("responses");
    expect(config.timeoutMs).toBe(600000);
    expect(config.stream).toBe(false);
    expect(config.chatThinkingType).toBe("disabled");
  });

  it("uses OPENAI_* settings when no project LLM_* settings exist", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.example/v1";
    process.env.OPENAI_MODEL = "openai-model";
    process.env.OPENAI_REASONING_EFFORT = "medium";
    process.env.OPENAI_WIRE_API = "responses";
    process.env.OPENAI_TIMEOUT_MS = "45000";
    process.env.OPENAI_STREAM = "false";

    const config = getAIConfig();

    expect(config.apiKey).toBe("openai-key");
    expect(config.baseUrl).toBe("https://api.openai.example/v1");
    expect(config.providerName).toBe("api.openai.example");
    expect(config.model).toBe("openai-model");
    expect(config.modelReasoningEffort).toBe("medium");
    expect(config.wireApi).toBe("responses");
    expect(config.timeoutMs).toBe(45000);
    expect(config.stream).toBe(false);
  });
});
