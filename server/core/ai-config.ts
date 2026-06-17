import dotenv from 'dotenv';

dotenv.config();

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /**
   * Net-new additive field (sliderule-llm-autonomous-reasoning, 需求 3.1).
   *
   * Optional low-cost / faster model used by the LLM_Router for scheduling
   * decisions. OPTIONAL so durable old configs (which never carried it) stay
   * compatible; the router resolves the routing model as
   * `config.routerModel ?? config.model`.
   */
  routerModel?: string;
  modelReasoningEffort: string;
  maxContext: number;
  providerName: string;
  wireApi: 'responses' | 'chat_completions';
  timeoutMs: number;
  stream: boolean;
  chatThinkingType?: string;
}

function normalizeWireApi(value?: string): 'responses' | 'chat_completions' {
  return value?.toLowerCase() === 'responses' ? 'responses' : 'chat_completions';
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() !== 'false';
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstConfigured(...values: Array<string | undefined>): string | undefined {
  return values.find(value => typeof value === 'string' && value.length > 0);
}

function deriveProviderName(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function getAIConfig(): AIConfig {
  const preferProjectLlmConfig = Boolean(
    firstConfigured(process.env.LLM_API_KEY, process.env.LLM_BASE_URL, process.env.LLM_MODEL)
  );
  const pickProviderValue = (llmValue?: string, openAIValue?: string) =>
    preferProjectLlmConfig
      ? firstConfigured(llmValue, openAIValue)
      : firstConfigured(openAIValue, llmValue);

  const apiKey = pickProviderValue(process.env.LLM_API_KEY, process.env.OPENAI_API_KEY) || '';
  const baseUrl =
    pickProviderValue(process.env.LLM_BASE_URL, process.env.OPENAI_BASE_URL) ||
    'https://api.openai.com/v1';
  const model =
    pickProviderValue(process.env.LLM_MODEL, process.env.OPENAI_MODEL) ||
    (preferProjectLlmConfig || !firstConfigured(process.env.OPENAI_API_KEY)
      ? 'gpt-4o-mini'
      : 'gpt-4.1-mini');

  const routerModel = pickProviderValue(
    process.env.LLM_ROUTER_MODEL,
    process.env.OPENAI_ROUTER_MODEL
  );

  // Belt-and-suspenders: when a dev proxy is active, force the LLM host into NO_PROXY (direct).
  // Opt-out: set LLM_PROXY_THROUGH=1 to route LLM traffic THROUGH the proxy instead (e.g. the
  // host is only reachable via Clash/VPN). In that case we must NOT auto-add it to NO_PROXY.
  try {
    const routeThroughProxy =
      process.env.LLM_PROXY_THROUGH === '1' || process.env.LLM_PROXY_THROUGH === 'true';
    const hasProxy = !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy || process.env.NODE_USE_ENV_PROXY);
    if (hasProxy && baseUrl && !routeThroughProxy) {
      const host = (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })();
      if (host) {
        const current = ((process.env.NO_PROXY || process.env.no_proxy || '') + ',localhost,127.0.0.1').toLowerCase();
        if (!current.includes(host.toLowerCase())) {
          const merged = (process.env.NO_PROXY || process.env.no_proxy || '') + ',' + host + ',localhost,127.0.0.1';
          const cleaned = Array.from(new Set(merged.split(',').map(s => s.trim()).filter(Boolean))).join(',');
          process.env.NO_PROXY = cleaned;
          process.env.no_proxy = cleaned;
        }
      }
    }
  } catch {}

  const rawWire = pickProviderValue(process.env.LLM_WIRE_API, process.env.OPENAI_WIRE_API);
  const modelReasoningEffort =
    pickProviderValue(process.env.LLM_REASONING_EFFORT, process.env.OPENAI_REASONING_EFFORT) ||
    'medium';

  // Smart wire selection for reasoning models (gpt-5.x, o-series, thinking etc).
  // Many modern providers (including blackaicoding for gpt-5.5/gpt-5.4) only return
  // useful content on the /responses endpoint when reasoning effort is requested.
  // If the user explicitly forces chat_completions it is respected *unless* we have
  // a strong signal (reasoning + gpt-5 style model) that responses is required for
  // the key+model combo to produce non-empty bodies.
  let wireApi: 'responses' | 'chat_completions';
  const hasReasoning = modelReasoningEffort && modelReasoningEffort !== 'none' && modelReasoningEffort.trim().length > 0;
  const isReasoningModel = /gpt-5|gpt5|o[0-3]|thinking|reasoning/i.test(model);
  if (rawWire && rawWire.toLowerCase() === 'responses') {
    wireApi = 'responses';
  } else if (rawWire && rawWire.toLowerCase() === 'chat_completions') {
    // Honor explicit chat_completions as-is. Some providers (e.g. rcouyi) only implement
    // /chat/completions and return HTTP 501 on /responses, so auto-upgrading reasoning models
    // to /responses here would break them. If a host genuinely needs /responses for a
    // reasoning model, set LLM_WIRE_API=responses explicitly.
    wireApi = 'chat_completions';
  } else {
    // Wire unset → infer: reasoning models (gpt-5.x / o-series / thinking) default to /responses.
    wireApi = (hasReasoning && isReasoningModel) ? 'responses' : normalizeWireApi(rawWire);
  }

  return {
    apiKey,
    baseUrl,
    model,
    ...(routerModel ? { routerModel } : {}),
    modelReasoningEffort,
    maxContext: normalizeNumber(process.env.LLM_MAX_CONTEXT, 1_000_000),
    providerName: deriveProviderName(baseUrl),
    wireApi,
    timeoutMs: normalizeNumber(
      pickProviderValue(process.env.LLM_TIMEOUT_MS, process.env.OPENAI_TIMEOUT_MS),
      600000
    ),
    stream: normalizeBoolean(
      pickProviderValue(process.env.LLM_STREAM, process.env.OPENAI_STREAM),
      false
    ),
    chatThinkingType: pickProviderValue(
      process.env.LLM_CHAT_THINKING_TYPE,
      process.env.OPENAI_CHAT_THINKING_TYPE
    ),
  };
}
