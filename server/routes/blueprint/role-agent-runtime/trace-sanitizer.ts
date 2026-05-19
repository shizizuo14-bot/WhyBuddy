/**
 * `autopilot-role-autonomous-agent` spec Task 11.1：Trace 凭证脱敏。
 *
 * 遍历 {@link AgentTraceEntry} 的所有字符串字段，把 API key / Bearer token /
 * email / GitHub PAT 等敏感凭证替换为占位符。由 {@link wrapAgentOutput}
 * 在 `delegator.ts` 中调用，保证 `DelegateOutput.trace` 不含原始凭证。
 *
 * 复用仓库既有 `applyAgentCrewRedaction` + `createDefaultAgentCrewStageActivationPolicy`
 * 以保持脱敏规则与 diagnostics-store / spec-tree / spec-documents 一致。
 *
 * 关键约束：
 * - 返回新对象，不 mutate 入参。
 * - 不脱敏 `AgentJobOutput.output`（业务产物应保持原样）；只对 trace 脱敏。
 * - 递归深度上限 10，防止深嵌套爆栈。
 * - 纯函数，无副作用。
 */

import type { AgentTraceEntry } from "../../../../shared/blueprint/agent-state.js";
import {
  applyAgentCrewRedaction,
  createDefaultAgentCrewStageActivationPolicy,
} from "../agent-crew-stage-activation/policy.js";

const REDACTION_POLICY = createDefaultAgentCrewStageActivationPolicy();

/** 对单个字符串应用脱敏策略。 */
function sanitizeString(value: string): string {
  return applyAgentCrewRedaction(value, REDACTION_POLICY);
}

/**
 * 递归遍历任意值，对所有字符串字段应用脱敏。
 * 深度超过 maxDepth 时停止递归，直接返回原值。
 */
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * 对单条 {@link AgentTraceEntry} 执行凭证脱敏。
 *
 * 处理字段：
 * - `thought`：直接 sanitizeString
 * - `action.params`：递归 sanitizeValue
 * - `observation.result`：递归 sanitizeValue
 * - `error`：直接 sanitizeString
 * - 其它字段（iteration / phase / timestamp / tokensUsed / toolId / durationMs）保持不变
 */
export function sanitizeTraceEntry(entry: AgentTraceEntry): AgentTraceEntry {
  return {
    iteration: entry.iteration,
    phase: entry.phase,
    timestamp: entry.timestamp,
    tokensUsed: entry.tokensUsed,
    thought: entry.thought ? sanitizeString(entry.thought) : undefined,
    action: entry.action
      ? {
          toolId: entry.action.toolId,
          params: sanitizeValue(entry.action.params) as Record<string, unknown>,
        }
      : undefined,
    observation: entry.observation
      ? {
          toolId: entry.observation.toolId,
          result: sanitizeValue(entry.observation.result),
          durationMs: entry.observation.durationMs,
        }
      : undefined,
    error: entry.error ? sanitizeString(entry.error) : undefined,
  };
}

/**
 * 对整个 trace 数组执行凭证脱敏。
 */
export function sanitizeTraceEntries(
  entries: AgentTraceEntry[],
): AgentTraceEntry[] {
  return entries.map(sanitizeTraceEntry);
}
