/**
 * `autopilot-agent-driven-pipeline` spec Task 4：Agent-Driven Generator。
 *
 * 封装 delegate → validate → RouteSet 的完整流程。
 * 所有异常被内部捕获并走 fallback 路径，永不向调用方抛错。
 */

import type {
  BlueprintClarificationSession,
  BlueprintGenerationRequest,
  BlueprintIntake,
  BlueprintProjectDomainContext,
  BlueprintRouteSet,
} from "../../../../shared/blueprint/index.js";
import type { DelegateInput } from "../../../../shared/blueprint/agent-delegator.js";
import type { RoleAgentDelegator } from "../role-agent-runtime/delegator.js";
import type { RouteSetLlmGenerator } from "./route-llm-generator.js";
import { buildPlannerGoal, buildPlannerSystemPrompt, resolveAgentBudget } from "./planner-goal-builder.js";
import { BlueprintRouteSetOutputSchema, validateAndNormalizeAgentRouteSetOutput } from "./agent-output-validator.js";
import type { BlueprintLogger } from "../context.js";

/** Agent 驱动 RouteSet 生成的输入。 */
export interface AgentDrivenRouteSetInput {
  request: BlueprintGenerationRequest;
  jobId: string;
  createdAt: string;
  intake?: BlueprintIntake;
  clarificationSession?: BlueprintClarificationSession;
  projectContext?: BlueprintProjectDomainContext;
}

/** Agent 驱动 RouteSet 生成的输出（含执行元数据）。 */
export interface AgentDrivenRouteSetOutput {
  routeSet: BlueprintRouteSet;
  /** 产出源标识 */
  generationSource: "agent" | "agent_fallback_lite" | "agent_fallback_llm";
  executionMode: "real" | "lite";
  iterations: number;
  totalTokens: number;
  durationMs: number;
  /** 降级原因（仅 fallback 时填充） */
  fallbackReason?: string;
}

/** Agent-Driven RouteSet 生成器函数签名。 */
export type AgentDrivenRouteSetGenerator = (
  input: AgentDrivenRouteSetInput,
) => Promise<AgentDrivenRouteSetOutput>;

/**
 * 创建 Agent-Driven RouteSet 生成器。
 *
 * @param delegator RoleAgentDelegator 实例
 * @param fallbackGenerator 现有 RouteSetLlmGenerator（作为最终 fallback）
 * @param logger 可选 logger
 */
export function createAgentDrivenRouteSetGenerator(
  delegator: RoleAgentDelegator,
  fallbackGenerator: RouteSetLlmGenerator,
  logger?: BlueprintLogger,
): AgentDrivenRouteSetGenerator {
  return async function generateRouteSetViaAgent(
    input: AgentDrivenRouteSetInput,
  ): Promise<AgentDrivenRouteSetOutput> {
    const { randomUUID } = await import("node:crypto");
    const routeSetId = `blueprint-routeset-${randomUUID()}`;
    const primaryRouteId = `${routeSetId}:primary`;

    try {
      // Step 1: Build delegation input
      const delegateInput: DelegateInput = {
        roleId: "planner",
        stageId: "route_generation",
        jobId: input.jobId,
        goal: buildPlannerGoal(input.request, input.intake),
        systemPrompt: buildPlannerSystemPrompt(input.request.locale === "zh-CN" ? "zh" : "en"),
        context: {
          request: input.request,
          intake: input.intake,
          clarificationSession: input.clarificationSession,
          projectContext: input.projectContext,
          routeSetId,
          primaryRouteId,
        },
        budget: resolveAgentBudget(),
        outputSchema: BlueprintRouteSetOutputSchema,
      };

      // Step 2: Delegate to Agent
      const result = await delegator.delegate(delegateInput);

      // Step 3: Validate output
      if (result.status === "completed" && result.output != null) {
        const routeSet = validateAndNormalizeAgentRouteSetOutput(
          result.output,
          input.request,
          routeSetId,
          primaryRouteId,
          input.createdAt,
        );
        if (routeSet != null) {
          // 补充 provenance 中的 agent 标记
          routeSet.provenance.generationSource = "llm";
          return {
            routeSet,
            generationSource: "agent",
            executionMode: result.executionMode,
            iterations: result.iterations,
            totalTokens: result.totalTokens,
            durationMs: result.durationMs,
          };
        }
        // 输出校验失败，走 fallback
        logger?.warn("[agent-driven-generator] Agent output validation failed, falling back to LLM generator");
      } else {
        logger?.warn("[agent-driven-generator] Agent delegation failed or returned no output, falling back", {
          status: result.status,
          error: result.error,
        });
      }

      // Step 4: Fallback to existing routeSetLlmGenerator
      const fallbackResult = await fallbackGenerator({
        request: input.request,
        intake: input.intake,
        clarificationSession: input.clarificationSession,
        projectContext: input.projectContext,
        routeSetId,
        primaryRouteId,
        createdAt: input.createdAt,
        locale: input.request.locale,
      });

      // 构建 fallback RouteSet（复用 buildRouteSet 的逻辑）
      const fallbackRouteSet: BlueprintRouteSet = {
        id: routeSetId,
        requestId: input.jobId,
        createdAt: input.createdAt,
        primaryRouteId,
        routes: fallbackResult.routes,
        nextAsset: {
          type: "spec_tree",
          menu: "deduction",
          description:
            "Use the selected RouteSet path as the source asset for the Deduction menu and SPEC tree workbench.",
        },
        provenance: {
          projectId: input.request.projectId,
          sourceId: input.request.sourceId,
          targetText: input.request.targetText,
          githubUrls: input.request.githubUrls ?? [],
          clarificationSessionId: input.request.clarificationSessionId,
          generationSource: fallbackResult.provenanceExtras.generationSource,
          promptId: fallbackResult.provenanceExtras.promptId,
          model: fallbackResult.provenanceExtras.model,
          error: fallbackResult.provenanceExtras.error,
        },
      };

      const fallbackReason = result.status === "completed"
        ? "agent_output_validation_failed"
        : (result.error ?? "agent_delegation_failed");

      return {
        routeSet: fallbackRouteSet,
        generationSource: "agent_fallback_llm",
        executionMode: result.executionMode,
        iterations: result.iterations,
        totalTokens: result.totalTokens,
        durationMs: result.durationMs,
        fallbackReason: fallbackReason.slice(0, 400),
      };
    } catch (err) {
      // 所有异常走 fallback，永不向调用方抛错
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger?.warn("[agent-driven-generator] Unexpected error, falling back to LLM generator", {
        error: errorMsg,
      });

      try {
        const fallbackResult = await fallbackGenerator({
          request: input.request,
          intake: input.intake,
          clarificationSession: input.clarificationSession,
          projectContext: input.projectContext,
          routeSetId,
          primaryRouteId,
          createdAt: input.createdAt,
        });

        const fallbackRouteSet: BlueprintRouteSet = {
          id: routeSetId,
          requestId: input.jobId,
          createdAt: input.createdAt,
          primaryRouteId,
          routes: fallbackResult.routes,
          nextAsset: {
            type: "spec_tree",
            menu: "deduction",
            description:
              "Use the selected RouteSet path as the source asset for the Deduction menu and SPEC tree workbench.",
          },
          provenance: {
            projectId: input.request.projectId,
            sourceId: input.request.sourceId,
            targetText: input.request.targetText,
            githubUrls: input.request.githubUrls ?? [],
            clarificationSessionId: input.request.clarificationSessionId,
            generationSource: fallbackResult.provenanceExtras.generationSource,
            promptId: fallbackResult.provenanceExtras.promptId,
            model: fallbackResult.provenanceExtras.model,
            error: fallbackResult.provenanceExtras.error,
          },
        };

        return {
          routeSet: fallbackRouteSet,
          generationSource: "agent_fallback_llm",
          executionMode: "lite",
          iterations: 0,
          totalTokens: 0,
          durationMs: 0,
          fallbackReason: errorMsg.slice(0, 400),
        };
      } catch (fallbackErr) {
        // 即使 fallback 也失败，也不抛错 — 返回最小有效 RouteSet
        logger?.error("[agent-driven-generator] Fallback generator also failed", {
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
        throw fallbackErr; // 这种极端情况让上层处理
      }
    }
  };
}
