/**
 * `autopilot-role-autonomous-agent` spec Task 2.3 / 2.4 / 2.5：
 * Agent Loop thinking 阶段的 LLM 调用封装。
 *
 * 职责：
 * 1. 将 `AgentToolDefinition[]` 转为 LLM 可感知的 function-calling 规格
 *    （附加两个 builtin 工具 `finish` 与 `think`）。
 * 2. 构造统一消息数组：`system prompt + history + context`。
 * 3. 复用既有 `BlueprintLlmDependencies.callJson()` 调用 LLM，响应约定为
 *    单一 JSON 对象：
 *    - `{ "tool_call": { "tool_id": ..., "params": {...} }, "thought"?: ... }`
 *    - `{ "finish": { "output": ... }, "thought"?: ... }`
 *    - `{ "error": "..." }`
 * 4. 解析响应后产出 `LlmCallOutput`。
 * 5. 非法 JSON / 解析失败时追加 format hint 重试一次；仍失败返回
 *    `{ type: "error", ... }`，不向外抛错。
 *
 * 重要约定：
 * - 本模块**绝不向调用方抛错**；异常在内部全部转化为 `{ type: "error" }`。
 * - 真实 token 用量依赖 LLM 响应；当前默认估算值为 0，后续如需精确值可从
 *   LLM client 暴露更完整的 usage 字段再补齐（Task 2.3 约束：不依赖真实
 *   usage 回传也能跑通状态机 / 预算检查）。
 */

import type {
  BlueprintLlmDependencies,
  BlueprintLogger,
} from "../context.js";
import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";
import type { AgentTraceEntry } from "../../../../shared/blueprint/agent-state.js";

/** LLM 调用输入。 */
export interface LlmCallInput {
  /** 系统提示词（角色与 ReAct 行为约束）。 */
  systemPrompt: string;
  /** 历史 trace（Think → Act → Observe 循环累积）。 */
  history: AgentTraceEntry[];
  /** 上层业务上下文（如 GitHub URL、已有产物摘要）。 */
  context: Record<string, unknown>;
  /** 可调用工具（含 MCP / Skill / AIGC 节点 / builtin）。 */
  tools: AgentToolDefinition[];
  /** 温度；未提供时默认 0.1。 */
  temperature?: number;
}

/** LLM 调用输出（三选一）。 */
export type LlmCallOutput =
  | {
      type: "finish";
      output: unknown;
      thought?: string;
      tokensUsed: number;
    }
  | {
      type: "action";
      action: { toolId: string; params: Record<string, unknown> };
      thought?: string;
      tokensUsed: number;
    }
  | {
      type: "error";
      error: string;
      tokensUsed: number;
    };

/** LLM 调用入口函数签名。 */
export type LlmCallFn = (input: LlmCallInput) => Promise<LlmCallOutput>;

/** 依赖：共享 LLM 客户端 + logger。 */
export interface LlmCallFactoryDeps {
  llm: BlueprintLlmDependencies;
  logger: BlueprintLogger;
}

/** Builtin 工具 ID。 */
export const BUILTIN_FINISH_TOOL_ID = "builtin.finish";
export const BUILTIN_THINK_TOOL_ID = "builtin.think";

/**
 * 构造 LLM 可消费的工具清单（含 builtin）。
 *
 * 返回值只是一段给 LLM 阅读的 JSON 描述，并非 OpenAI tool schema —
 * 选择 prompt-engineering 路径是因为 `callJson` 当前不暴露 function-calling
 * 透传接口。借助 schema 描述 + 严格响应约束即可让 LLM 生成可解析 JSON。
 */
function describeToolsForLlm(tools: AgentToolDefinition[]): Array<Record<string, unknown>> {
  const builtins: AgentToolDefinition[] = [
    {
      id: BUILTIN_FINISH_TOOL_ID,
      name: "finish",
      description: "完成任务并返回最终产物。调用后 Agent Loop 结束。",
      category: "builtin",
      inputSchema: {
        type: "object",
        properties: {
          output: {
            description: "最终产物（符合角色输出 schema）。",
          },
        },
        required: ["output"],
      },
      requiresProxy: false,
      timeoutMs: 1_000,
    },
    {
      id: BUILTIN_THINK_TOOL_ID,
      name: "think",
      description: "记录思考过程但不执行任何动作；下一轮 LLM 仍需决策。",
      category: "builtin",
      inputSchema: {
        type: "object",
        properties: { thought: { type: "string" } },
        required: ["thought"],
      },
      requiresProxy: false,
      timeoutMs: 1_000,
    },
  ];
  const seen = new Set<string>();
  const combined: AgentToolDefinition[] = [];
  for (const tool of [...tools, ...builtins]) {
    if (seen.has(tool.id)) continue;
    seen.add(tool.id);
    combined.push(tool);
  }
  return combined.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * 将 history 中的一条 trace 压缩为 LLM 可读的上下文片段。
 */
function summarizeTraceEntry(entry: AgentTraceEntry): string {
  const parts: string[] = [`iteration=${entry.iteration}`, `phase=${entry.phase}`];
  if (entry.thought) parts.push(`thought=${entry.thought}`);
  if (entry.action) {
    parts.push(
      `action.tool=${entry.action.toolId}`,
      `action.params=${safeStringify(entry.action.params)}`,
    );
  }
  if (entry.observation) {
    parts.push(
      `observation.tool=${entry.observation.toolId}`,
      `observation.durationMs=${entry.observation.durationMs}`,
      `observation.result=${safeStringify(entry.observation.result)}`,
    );
  }
  if (entry.error) parts.push(`error=${entry.error}`);
  return parts.join("; ");
}

function safeStringify(value: unknown): string {
  try {
    const raw = JSON.stringify(value);
    if (typeof raw !== "string") return "";
    return raw.length > 1_000 ? `${raw.slice(0, 1_000)}…` : raw;
  } catch {
    return "[unserializable]";
  }
}

/**
 * 构建系统消息：原始 systemPrompt + Agent Loop 响应格式约束。
 */
function buildSystemMessage(systemPrompt: string, tools: AgentToolDefinition[]): string {
  const toolSummary = describeToolsForLlm(tools);
  const formatHint = [
    "你是一个运行在 ReAct Loop 中的自主 Agent。",
    "每一轮请严格返回单个 JSON 对象，且必须满足以下三种形态之一：",
    '1) {"thought": "...", "tool_call": {"tool_id": "<id>", "params": { ... }}}',
    '2) {"thought": "...", "finish": {"output": <最终产物 JSON>}}',
    '3) {"error": "<简要说明>"}',
    "禁止同时返回 tool_call 与 finish；禁止返回额外字段；禁止 markdown 包装。",
    "调用的 tool_id 必须严格匹配以下工具之一：",
    JSON.stringify(toolSummary),
  ];
  return `${systemPrompt.trim()}\n\n${formatHint.join("\n")}`;
}

/**
 * 构建用户消息：当前 context + 最近历史摘要（保持可控长度）。
 */
function buildUserMessage(
  context: Record<string, unknown>,
  history: AgentTraceEntry[],
  extraHint?: string,
): string {
  const recentHistory = history.slice(-10).map(summarizeTraceEntry);
  const sections = [
    `context=${safeStringify(context)}`,
    recentHistory.length > 0
      ? `recent_trace:\n${recentHistory.join("\n")}`
      : "recent_trace: <empty>",
  ];
  if (extraHint) sections.push(`format_hint: ${extraHint}`);
  return sections.join("\n\n");
}

/**
 * 解析 LLM JSON 响应。
 *
 * 约束：callJson 已经做过 jsonMode + 正则兜底，如果返回结构不合法抛
 * `Error("unrecognized_response")`，外层负责触发重试。
 */
function parseLlmJson(
  raw: unknown,
  availableTools: AgentToolDefinition[],
): LlmCallOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("unrecognized_response: not an object");
  }
  const payload = raw as Record<string, unknown>;
  const thought = typeof payload.thought === "string" ? payload.thought : undefined;

  // 形态 3：错误。
  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return { type: "error", error: payload.error.trim(), tokensUsed: 0 };
  }

  // 形态 2：finish。
  const finish = payload.finish;
  if (finish && typeof finish === "object") {
    const output = (finish as Record<string, unknown>).output;
    return {
      type: "finish",
      output,
      thought,
      tokensUsed: 0,
    };
  }

  // 形态 1：tool_call。
  const toolCall = payload.tool_call;
  if (toolCall && typeof toolCall === "object") {
    const call = toolCall as Record<string, unknown>;
    const toolId = typeof call.tool_id === "string" ? call.tool_id : undefined;
    const params =
      call.params && typeof call.params === "object" && !Array.isArray(call.params)
        ? (call.params as Record<string, unknown>)
        : {};
    if (!toolId) {
      throw new Error("unrecognized_response: tool_call.tool_id missing");
    }

    // Finish 以 builtin 工具形式呈现时也归一为 finish 类型。
    if (toolId === BUILTIN_FINISH_TOOL_ID) {
      const output = (params as Record<string, unknown>).output;
      return {
        type: "finish",
        output,
        thought,
        tokensUsed: 0,
      };
    }
    // think builtin：无执行副作用，但允许触发下一轮思考。按 action 返回给
    // 状态机；状态机会走一次 acting，让工具侧返回空观察后继续。
    const valid = new Set<string>([
      BUILTIN_FINISH_TOOL_ID,
      BUILTIN_THINK_TOOL_ID,
      ...availableTools.map((tool) => tool.id),
    ]);
    if (!valid.has(toolId)) {
      throw new Error(`unrecognized_response: tool_id '${toolId}' not in tool set`);
    }
    return {
      type: "action",
      action: { toolId, params },
      thought,
      tokensUsed: 0,
    };
  }

  throw new Error("unrecognized_response: neither tool_call / finish / error provided");
}

/**
 * 创建 LLM 调用函数。
 *
 * 典型用法：
 * ```ts
 * const llmCall = createLlmCall({ llm: ctx.llm, logger: ctx.logger });
 * const result = await llmCall({ systemPrompt, history, context, tools });
 * ```
 */
export function createLlmCall(deps: LlmCallFactoryDeps): LlmCallFn {
  const { llm, logger } = deps;

  async function callOnce(
    input: LlmCallInput,
    extraHint: string | undefined,
  ): Promise<LlmCallOutput> {
    const messages = [
      { role: "system" as const, content: buildSystemMessage(input.systemPrompt, input.tools) },
      { role: "user" as const, content: buildUserMessage(input.context, input.history, extraHint) },
    ];
    const raw = await llm.callJson(messages, {
      temperature: input.temperature ?? 0.1,
      maxTokens: 2_000,
    });
    return parseLlmJson(raw, input.tools);
  }

  return async function llmCall(input) {
    // 第一次尝试。
    try {
      return await callOnce(input, undefined);
    } catch (firstError) {
      const firstMessage =
        firstError instanceof Error ? firstError.message : String(firstError);
      logger.warn("[agent.llm] first attempt failed, retrying once", {
        error: firstMessage,
      });

      // 第二次尝试：附加 format hint，强化 JSON 响应要求。
      try {
        return await callOnce(
          input,
          "上一次响应不是合法 JSON 或字段缺失，请严格按照 system 指令中的三种 JSON 形态之一重新返回。",
        );
      } catch (secondError) {
        const secondMessage =
          secondError instanceof Error ? secondError.message : String(secondError);
        logger.warn("[agent.llm] retry failed, returning error output", {
          error: secondMessage,
        });
        return {
          type: "error",
          error: `llm_failed: ${secondMessage}`,
          tokensUsed: 0,
        };
      }
    }
  };
}
