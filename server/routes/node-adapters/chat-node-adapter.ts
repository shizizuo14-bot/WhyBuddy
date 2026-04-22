import { getAIConfig } from "../../core/ai-config.js";
import { callLLM } from "../../core/llm-client.js";

export type ChatNodeType = "llm" | "dialogue";

export interface ChatNodeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatNodeInput {
  messages?: ChatNodeMessage[];
  prompt?: string;
  systemPrompt?: string;
  context?: unknown;
  variables?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ChatNodeExecutionRequest {
  nodeType: ChatNodeType;
  input?: ChatNodeInput;
}

export interface ChatNodeExecutionResult {
  ok: true;
  nodeType: ChatNodeType;
  output: {
    content: string;
    model: string;
    latencyMs: number;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    messages: ChatNodeMessage[];
    reply: {
      role: "assistant";
      content: string;
    };
  };
}

export interface ChatNodeAdapterDeps {
  executeLLM?: typeof callLLM;
  getConfig?: typeof getAIConfig;
  now?: () => number;
}

function isChatNodeMessage(value: unknown): value is ChatNodeMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "system" ||
      candidate.role === "user" ||
      candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

function normalizeMessages(messages: unknown): ChatNodeMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter(isChatNodeMessage);
}

function stringifyContext(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyContext(entry))
      .filter(Boolean)
      .join("\n");
  }

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function clampTemperature(value: unknown): number {
  return Math.max(0, Math.min(2, Number(value) || 0.7));
}

function clampMaxTokens(value: unknown): number {
  return Math.max(64, Math.min(4000, Number(value) || 400));
}

function buildMessages(input?: ChatNodeInput): ChatNodeMessage[] {
  const normalizedInput = input ?? {};
  const baseMessages = normalizeMessages(normalizedInput.messages);
  const prompt =
    typeof normalizedInput.prompt === "string" ? normalizedInput.prompt.trim() : "";
  const systemPrompt =
    typeof normalizedInput.systemPrompt === "string"
      ? normalizedInput.systemPrompt.trim()
      : "";
  const contextText = stringifyContext(normalizedInput.context);
  const variablesText =
    normalizedInput.variables &&
    typeof normalizedInput.variables === "object" &&
    Object.keys(normalizedInput.variables).length > 0
      ? JSON.stringify(normalizedInput.variables, null, 2)
      : "";

  const systemSegments = [systemPrompt];
  if (contextText) {
    systemSegments.push(`Upstream context:\n${contextText}`);
  }
  if (variablesText) {
    systemSegments.push(`Variables:\n${variablesText}`);
  }

  const messages: ChatNodeMessage[] = [];
  const normalizedSystem = systemSegments.filter(Boolean).join("\n\n").trim();
  if (normalizedSystem) {
    messages.push({ role: "system", content: normalizedSystem });
  }

  messages.push(...baseMessages);

  if (prompt) {
    messages.push({ role: "user", content: prompt });
  }

  const hasPromptLikeMessage = messages.some((message) => message.role !== "system");
  if (!hasPromptLikeMessage) {
    throw new Error("Chat node input requires prompt or messages.");
  }

  return messages;
}

export function isChatNodeType(value: unknown): value is ChatNodeType {
  return value === "llm" || value === "dialogue";
}

export async function executeChatNode(
  request: ChatNodeExecutionRequest,
  deps: ChatNodeAdapterDeps = {},
): Promise<ChatNodeExecutionResult> {
  if (!isChatNodeType(request.nodeType)) {
    throw new Error("Unsupported chat node type.");
  }

  const input = request.input ?? {};
  const messages = buildMessages(input);
  const getConfigValue = deps.getConfig ?? getAIConfig;
  const executeLLM = deps.executeLLM ?? callLLM;
  const now = deps.now ?? Date.now;
  const config = getConfigValue();
  const model =
    typeof input.model === "string" && input.model.trim()
      ? input.model.trim()
      : config.model;

  const startedAt = now();
  const response = await executeLLM(messages, {
    model,
    temperature: clampTemperature(input.temperature),
    maxTokens: clampMaxTokens(input.maxTokens),
  });
  const finishedAt = now();

  return {
    ok: true,
    nodeType: request.nodeType,
    output: {
      content: response.content,
      model,
      latencyMs: Math.max(0, finishedAt - startedAt),
      usage: response.usage,
      messages,
      reply: {
        role: "assistant",
        content: response.content,
      },
    },
  };
}
