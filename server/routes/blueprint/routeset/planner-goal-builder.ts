/**
 * `autopilot-agent-driven-pipeline` spec Task 2：Planner Goal Builder。
 *
 * 根据用户请求构建 Planner Agent 的目标描述、系统提示词和预算配置。
 */

import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";

/**
 * 从 request 和 intake 提取关键信息，生成 Planner Agent 的结构化目标描述。
 *
 * @precondition request.targetText 非空字符串
 * @postcondition 返回非空字符串
 */
export function buildPlannerGoal(
  request: { targetText?: string; githubUrls?: string[] },
  intake?: unknown,
): string {
  const parts: string[] = [];

  if (request.targetText) {
    parts.push(`目标：${request.targetText}`);
  }

  if (request.githubUrls?.length) {
    parts.push(`分析以下 GitHub 仓库：${request.githubUrls.join(", ")}`);
    parts.push("请先 clone 仓库，分析代码结构和依赖关系，然后基于分析结果生成路线规划。");
  }

  const intakeSummary = intake && typeof intake === "object" && "summary" in intake
    ? (intake as { summary?: string }).summary
    : undefined;
  if (intakeSummary) {
    parts.push(`项目上下文：${intakeSummary}`);
  }

  parts.push("最终输出必须是一个符合 BlueprintRouteSet 结构的 JSON 对象，包含 2-5 条路线（恰好 1 条 primary）。");

  return parts.join("\n\n");
}

/**
 * 返回 Planner 角色系统提示词。
 */
export function buildPlannerSystemPrompt(locale: string): string {
  if (locale === "zh-CN") {
    return `你是 /autopilot 的 Planner 角色。你的任务是分析用户输入（可能包含 GitHub 仓库 URL）并生成一份路线规划（BlueprintRouteSet）。

你可以使用提供的工具来完成任务：
- mcp.github：克隆和分析 GitHub 仓库
- aigc.code_analysis：分析代码结构和依赖
- skill.architecture：生成架构摘要

当你完成分析后，使用 finish 工具返回最终的 RouteSet JSON。

约束：
1. 输出必须包含 2-5 条路线
2. 恰好 1 条路线的 kind 为 "primary"
3. 每条路线必须包含 title、summary、kind、complexity、riskLevel、costLevel
4. 不要在输出中包含任何敏感信息（API key、token 等）`;
  }

  return `You are the Planner role in /autopilot. Your task is to analyze user input (which may include GitHub repository URLs) and generate a route plan (BlueprintRouteSet).

You can use the provided tools:
- mcp.github: Clone and analyze GitHub repositories
- aigc.code_analysis: Analyze code structure and dependencies
- skill.architecture: Generate architecture summaries

When your analysis is complete, use the finish tool to return the final RouteSet JSON.

Constraints:
1. Output must contain 2-5 routes
2. Exactly 1 route must have kind "primary"
3. Each route must include title, summary, kind, complexity, riskLevel, costLevel
4. Do not include any sensitive information (API keys, tokens, etc.) in the output`;
}

/**
 * 解析 Agent 预算配置，支持 env 变量覆盖和 overrides 参数。
 * 所有值 clamp 到有效范围。
 *
 * @postcondition maxIterations ∈ [1, 50]
 * @postcondition maxTokens ∈ [10000, 500000]
 * @postcondition timeoutMs ∈ [30000, 600000]
 */
export function resolveAgentBudget(
  overrides?: Partial<AgentBudget>,
): AgentBudget {
  const envIterations = parseInt(process.env.BLUEPRINT_AGENT_MAX_ITERATIONS ?? "", 10);
  const envTokens = parseInt(process.env.BLUEPRINT_AGENT_MAX_TOKENS ?? "", 10);
  const envTimeout = parseInt(process.env.BLUEPRINT_AGENT_TIMEOUT_MS ?? "", 10);

  return {
    maxIterations: clamp(overrides?.maxIterations ?? (Number.isFinite(envIterations) ? envIterations : 20), 1, 50),
    maxTokens: clamp(overrides?.maxTokens ?? (Number.isFinite(envTokens) ? envTokens : 100_000), 10_000, 500_000),
    timeoutMs: clamp(overrides?.timeoutMs ?? (Number.isFinite(envTimeout) ? envTimeout : 300_000), 30_000, 600_000),
    toolTimeoutMs: overrides?.toolTimeoutMs ?? 60_000,
    allowParallelTools: overrides?.allowParallelTools ?? false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
