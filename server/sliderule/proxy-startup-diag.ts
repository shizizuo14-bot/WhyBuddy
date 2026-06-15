import { readEnvCompat } from "../../shared/env/read-env-compat.js";
import { getAIConfig } from "../core/ai-config.js";
import {
  isSlideRuleCapabilityPoolEnabled,
  resolveSlideRulePoolRaceMode,
} from "./pool-json-llm.js";

function envSet(name: string): boolean {
  return !!(
    readEnvCompat(name) ||
    process.env[name] ||
    process.env[name.toLowerCase()]
  );
}

/** One-shot proxy / NO_PROXY diagnostic at server boot (no secrets). */
export function logSlideRuleProxyStartupDiag(): void {
  const ai = getAIConfig();
  let llmHost = ai.baseUrl;
  try {
    llmHost = new URL(ai.baseUrl).host;
  } catch {
    /* keep raw */
  }

  const payload = {
    tag: "sliderule.startup-proxy",
    llmHost,
    llmModel: ai.model,
    NODE_USE_ENV_PROXY: readEnvCompat("NODE_USE_ENV_PROXY") || process.env.NODE_USE_ENV_PROXY || "0",
    HTTP_PROXY: envSet("HTTP_PROXY") ? "set" : "unset",
    HTTPS_PROXY: envSet("HTTPS_PROXY") ? "set" : "unset",
    NO_PROXY: readEnvCompat("NO_PROXY") || process.env.NO_PROXY || process.env.no_proxy || "(unset)",
    no_proxy: readEnvCompat("no_proxy") || process.env.no_proxy || "(unset)",
    sliderulePoolEnabled: isSlideRuleCapabilityPoolEnabled(),
    sliderulePoolRaceMode: resolveSlideRulePoolRaceMode(),
    hint:
      "LLM host should appear in NO_PROXY when dev-all injects HTTP_PROXY (Clash etc.)",
  };

  console.log(JSON.stringify(payload));
}