/**
 * `autopilot-role-autonomous-agent` spec Task 5：RoleAgentDelegator。
 *
 * 宿主进程内的 Agent 委派器，负责把一次蓝图角色任务按 **三级降级** 策略分发：
 *
 * ```text
 * Tier 1: env gate
 *   - BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED !== "true" → 立即 fallback
 * Tier 2: Docker 可达
 *   - executorClient?.assertReachable() 成功 → 尝试 Real Mode（dispatchToContainer）
 *   - 失败 → 直接进入 Lite Mode
 * Tier 3: Real Mode / Lite Mode 抛错
 *   - Real 失败 → Lite 重试
 *   - Lite 失败 → callLLMJson fallback
 * ```
 *
 * 关键约束（spec §5）：
 * - `delegate(input)` 永不向调用方抛错；任何意外都降级到 fallback（`status: "failed"`）。
 * - 不直接依赖 `callLLMJson` / `ExecutorClient` 实现，仅通过注入式参数消费
 *   （`fallbackLlmCall` / `executorClient`）。
 * - 诊断（`getDiagnostics()`）维护不变式：
 *   `totalDelegations === realDelegations + liteDelegations + fallbackDelegations`
 *   （Property 9，Task 8.6 会验证）。
 * - `DelegateOutput.executionMode` 只有 `"real" | "lite"` 两个值；fallback 路径
 *   归入 `"lite"`，但内部计数分离到 `fallbackDelegations`。
 *
 * 与相关模块的关系：
 * - {@link RoleRuntimeContextStore}（`role-container-loader/loader`）：
 *   解析角色的 MCP/Skill/AIGC 绑定；不存在时退化为 builtin-only 工具集。
 * - {@link buildToolDefinitions}（`./tool-registration`）：把绑定转换成 AgentToolDefinition。
 * - {@link ExecutorClient}（`server/core/executor-client`）：仅用于 `assertReachable()` 探活；
 *   本模块不执行 `dispatchPlan`，那交给 `realModeDispatcher` 注入式处理。
 * - {@link LiteAgentRuntime}（Task 6 待实现）：宿主内简化 Agent Loop；本模块只消费接口。
 */

import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";
import type {
  DelegateInput,
  DelegateOutput,
  DelegateStatus,
} from "../../../../shared/blueprint/agent-delegator.js";
import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../../shared/blueprint/agent-job.js";
import type { AgentToolDefinition } from "../../../../shared/blueprint/agent-tool.js";

import type { ExecutorClient } from "../../../core/executor-client.js";
import type { BlueprintLogger } from "../context.js";
import { canonicalKey } from "../role-container-loader/capability-package.js";
import type {
  RoleRuntimeContext,
  RoleRuntimeContextStore,
} from "../role-container-loader/loader.js";

import { validateAgentOutput } from "./output-schema-validator.js";
import { buildToolDefinitions } from "./tool-registration.js";
import { sanitizeTraceEntries } from "./trace-sanitizer.js";

// ─── Public Types ───────────────────────────────────────────────────────────

/** RoleAgentDelegator 对外接口。design §3.3。 */
export interface RoleAgentDelegator {
  /** 委派一次任务；永不抛错。 */
  delegate(input: DelegateInput): Promise<DelegateOutput>;
  /** 查询进行中或已结束任务的状态。 */
  getStatus(jobId: string): DelegateStatus | undefined;
  /** 取消进行中的任务（best-effort：只更新状态 map）。 */
  cancel(jobId: string, reason: string): Promise<void>;
  /** 获取诊断摘要（counters + averages + last*）。 */
  getDiagnostics(): RoleAgentDelegatorDiagnostics;
}

/** Task 6 将提供的 LiteAgentRuntime 接口。design §4.3。 */
export interface LiteAgentRuntime {
  run(input: AgentJobInput): Promise<AgentJobOutput>;
}

/**
 * Real Mode 调度函数签名。
 *
 * 由调用方（宿主装配层）实现：负责把 `AgentJobInput` 派发到容器、等待
 * HMAC 回调、聚合成 `AgentJobOutput`。本模块在 Task 5 阶段只面向接口消费。
 *
 * 未注入（`undefined`）时本模块视为 Real Mode 不可用，直接进入 Lite Mode。
 */
export type RealModeDispatcher = (
  input: AgentJobInput,
) => Promise<AgentJobOutput>;

/**
 * Fallback LLM 调用函数签名。
 *
 * 与 `callLLMJson` 等价语义：一次性 LLM 调用，返回任意结构化结果。
 * 本模块不关心内部实现，调用方可以把 `callLLMJson` 闭包传入。
 */
export type FallbackLlmCall = (input: DelegateInput) => Promise<unknown>;

/** `getDiagnostics()` 返回形状。spec §8 / design §12。 */
export interface RoleAgentDelegatorDiagnostics {
  totalDelegations: number;
  realDelegations: number;
  liteDelegations: number;
  fallbackDelegations: number;
  averageIterations: number;
  averageTokensPerDelegation: number;
  averageDurationMs: number;
  lastInvocationAt?: string;
  lastMode?: "real" | "lite" | "fallback";
  lastError?: string;
}

/** 工厂参数：所有外部依赖都通过注入传入。 */
export interface CreateRoleAgentDelegatorOptions {
  /** 已有：`role-container-loader/loader.ts` 的 RoleRuntimeContextStore。 */
  roleRuntimeContextStore?: RoleRuntimeContextStore;
  /**
   * 已有：`server/core/executor-client.ts` 的 ExecutorClient。
   * 本模块只调用 `assertReachable()` 做 Docker 探活。
   */
  executorClient?: ExecutorClient;
  /** Task 6 的 LiteAgentRuntime 真实实现；未注入时 Lite Mode 视为不可用。 */
  liteAgentRuntime?: LiteAgentRuntime;
  /**
   * Real Mode 调度函数。未注入时 Real Mode 视为不可用，直接走 Lite。
   *
   * 典型实现会：
   * 1. 通过 `executorClient.dispatchPlan(plan)` 派发到 Docker；
   * 2. 等待 HMAC 回调（callback-waiter）聚合 AgentProgressEvent；
   * 3. 返回最终 AgentJobOutput。
   */
  realModeDispatcher?: RealModeDispatcher;
  /** Fallback：保持与 callLLMJson 等价的单次 LLM 调用。必填。 */
  fallbackLlmCall: FallbackLlmCall;
  logger: BlueprintLogger;
  now: () => Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === undefined || err === null) return "";
  return String(err);
}

/**
 * 构造空 ctx 的 builtin-only 工具集：复用 {@link buildToolDefinitions}，
 * 避免在本模块里重复 builtin 定义。
 */
function buildBuiltinOnlyTools(): AgentToolDefinition[] {
  const emptyCtx = {
    mcp: { list: () => [] as string[] },
    skill: { list: () => [] as string[] },
    aigcNode: { list: () => [] as string[] },
  } as unknown as RoleRuntimeContext;
  return buildToolDefinitions(emptyCtx);
}

/**
 * 把 Task 2 的 `AgentJobOutput` 包装为对外的 {@link DelegateOutput}。
 *
 * - `executionMode` 只会是 `"real"` 或 `"lite"`。
 * - `error` 字段只在上游提供时保留，避免显式写 `error: undefined` 破坏 JSON 对齐。
 * - Task 11：trace 在这里统一执行 sanitizer，移除已知凭证模式，避免 API Key /
 *   Bearer Token / AWS Key / password / token 字段被 replay / audit 落盘。
 */
function wrapAgentOutput(
  agentOut: AgentJobOutput,
  mode: "real" | "lite",
): DelegateOutput {
  const base: DelegateOutput = {
    jobId: agentOut.jobId,
    status: agentOut.status,
    output: agentOut.output,
    executionMode: mode,
    iterations: agentOut.iterations,
    totalTokens: agentOut.totalTokens,
    durationMs: agentOut.durationMs,
    trace: sanitizeTraceEntries(agentOut.trace),
  };
  if (typeof agentOut.error === "string" && agentOut.error.length > 0) {
    base.error = agentOut.error;
  }
  return base;
}

/**
 * Task 10：对已经包装好的 DelegateOutput 执行 output schema 校验。
 *
 * 仅在 `status === "completed"` 且 `input.outputSchema` 提供时做校验；
 * 校验不通过 → 抛出特殊错误，由外层 try/catch 触发降级（Real → Lite → Fallback）。
 *
 * 这样实现可以复用既有的 Tier 降级链路，无需再设计独立分支；同时也保证
 * counter 不变式：每次 delegate 调用最终只会命中一个 tier 的 `recordDelegation`。
 */
function validateWrappedOrThrow(
  wrapped: DelegateOutput,
  input: DelegateInput,
  mode: "real" | "lite",
  logger: BlueprintLogger,
): void {
  if (wrapped.status !== "completed") return;
  if (input.outputSchema === undefined) return;
  const validation = validateAgentOutput(wrapped.output, input.outputSchema);
  if (validation.valid) return;
  logger.warn("[delegator] output failed schema validation", {
    mode,
    errors: validation.errors,
  });
  throw new Error(
    `output_schema_validation_failed: ${validation.errors.join("; ")}`,
  );
}

/**
 * 创建一个 {@link RoleAgentDelegator} 实例。
 *
 * 生命周期：实例在创建后可以长期复用，内部维护：
 * - 诊断 counters / averages（见 {@link RoleAgentDelegatorDiagnostics}）
 * - `jobId -> DelegateStatus` 的内存 map
 *
 * 注入点全部可选（除 `fallbackLlmCall` / `logger` / `now`）；运行时按以下规则降级：
 *
 * | 注入项 | 缺失行为 |
 * | --- | --- |
 * | `roleRuntimeContextStore` | 用 builtin-only 工具集继续 |
 * | `executorClient` | Docker 视为不可达，直接走 Lite |
 * | `realModeDispatcher` | Real Mode 不可用，直接走 Lite |
 * | `liteAgentRuntime` | Lite Mode 不可用，直接走 fallback |
 */
export function createRoleAgentDelegator(
  opts: CreateRoleAgentDelegatorOptions,
): RoleAgentDelegator {
  // ── 诊断累加器 ────────────────────────────────────────────────────────
  const diag = {
    totalDelegations: 0,
    realDelegations: 0,
    liteDelegations: 0,
    fallbackDelegations: 0,
    iterationsSum: 0,
    tokensSum: 0,
    durationMsSum: 0,
    lastInvocationAt: undefined as string | undefined,
    lastMode: undefined as "real" | "lite" | "fallback" | undefined,
    lastError: undefined as string | undefined,
  };

  /** jobId → 当前阶段状态。 */
  const statusMap = new Map<string, DelegateStatus>();

  // ── 内部工具方法 ──────────────────────────────────────────────────────

  function setStatus(jobId: string, next: DelegateStatus): void {
    statusMap.set(jobId, next);
  }

  /**
   * 记录一次 delegate 的诊断数据。
   *
   * @param mode 本次逻辑归属的模式：`"real"` / `"lite"` / `"fallback"`。
   *             注意 fallback 路径的 `DelegateOutput.executionMode` 仍然是
   *             `"lite"`，但 counter 单独归入 `fallbackDelegations`。
   */
  function recordDelegation(
    mode: "real" | "lite" | "fallback",
    output: DelegateOutput,
  ): void {
    diag.totalDelegations += 1;
    if (mode === "real") diag.realDelegations += 1;
    else if (mode === "lite") diag.liteDelegations += 1;
    else diag.fallbackDelegations += 1;

    diag.iterationsSum += Math.max(0, output.iterations | 0);
    diag.tokensSum += Math.max(0, output.totalTokens | 0);
    diag.durationMsSum += Math.max(0, output.durationMs | 0);
    diag.lastInvocationAt = opts.now().toISOString();
    diag.lastMode = mode;
    diag.lastError = output.error;
  }

  /** Tier 2 Docker 探活：任何异常都收敛为 false，不抛错。 */
  async function probeDockerReachable(): Promise<boolean> {
    if (!opts.executorClient) return false;
    try {
      await opts.executorClient.assertReachable();
      return true;
    } catch (err) {
      opts.logger.debug("[delegator] docker probe failed", {
        error: errorMessage(err),
      });
      return false;
    }
  }

  /**
   * Tier 1/3 fallback 执行：调用注入的 `fallbackLlmCall`，失败时返回
   * `status: "failed"` 的 DelegateOutput 而不抛错。
   *
   * Task 10：如果 `input.outputSchema` 提供且 fallback 产物校验失败，会把
   * `status` 置为 `"failed"` 并写入 `output_schema_validation_failed` 原因；
   * fallback 已经是最后一级，不再继续降级。
   */
  async function executeFallback(
    input: DelegateInput,
    startMs: number,
    reason: string,
  ): Promise<DelegateOutput> {
    try {
      const output = await opts.fallbackLlmCall(input);
      const durationMs = Math.max(0, opts.now().getTime() - startMs);
      if (input.outputSchema !== undefined) {
        const validation = validateAgentOutput(output, input.outputSchema);
        if (!validation.valid) {
          opts.logger.warn(
            "[delegator] fallback output failed schema validation",
            { reason, errors: validation.errors },
          );
          return {
            jobId: input.jobId,
            status: "failed",
            output: null,
            executionMode: "lite",
            iterations: 0,
            totalTokens: 0,
            durationMs,
            trace: [],
            error: `output_schema_validation_failed: ${validation.errors.join("; ")}${reason ? ` (reason: ${reason})` : ""}`,
          };
        }
      }
      return {
        jobId: input.jobId,
        status: "completed",
        output,
        // fallback 归入 lite 语义：都在宿主侧执行、无隔离容器。
        executionMode: "lite",
        iterations: 0,
        totalTokens: 0,
        durationMs,
        trace: [],
      };
    } catch (err) {
      const message = errorMessage(err);
      const durationMs = Math.max(0, opts.now().getTime() - startMs);
      opts.logger.warn("[delegator] fallback llm call failed", {
        reason,
        error: message,
      });
      return {
        jobId: input.jobId,
        status: "failed",
        output: null,
        executionMode: "lite",
        iterations: 0,
        totalTokens: 0,
        durationMs,
        trace: [],
        error: `fallback_failed: ${message}${reason ? ` (reason: ${reason})` : ""}`,
      };
    }
  }

  /**
   * 从 DelegateInput 构造面向容器 / Lite Runtime 的 AgentJobInput。
   *
   * - `tools`：优先从 RoleRuntimeContext 组装；ctx 不存在时退化为 builtin-only。
   * - `callbackUrl` / `callbackSecret`：由 Task 7 的 callback receiver 填充；
   *   本模块在 Task 5 阶段仅提供占位，dispatcher 真实实现会覆盖。
   */
  function buildAgentJobInput(input: DelegateInput): AgentJobInput {
    const ctx = opts.roleRuntimeContextStore?.get(
      canonicalKey({
        roleId: input.roleId,
        // AgentJobInput 接受任意字符串 stage；canonicalKey 同样按字符串拼接。
        stageId: input.stageId as unknown as never,
        jobId: input.jobId,
      }),
    );
    const tools = ctx ? buildToolDefinitions(ctx) : buildBuiltinOnlyTools();
    return {
      jobId: input.jobId,
      roleId: input.roleId,
      stageId: input.stageId,
      goal: input.goal,
      systemPrompt: input.systemPrompt,
      tools,
      budget: input.budget,
      context: input.context,
      // 由 Task 7 callback 收方补齐；Task 5 阶段保留占位。
      callbackUrl: "",
      callbackSecret: "",
    };
  }

  // ── public: delegate ──────────────────────────────────────────────────
  async function delegate(input: DelegateInput): Promise<DelegateOutput> {
    const startMs = opts.now().getTime();
    setStatus(input.jobId, { phase: "pending" });

    try {
      // ── Tier 1：env gate ──
      if (process.env.BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED !== "true") {
        const out = await executeFallback(input, startMs, "env_gate_off");
        recordDelegation("fallback", out);
        setStatus(
          input.jobId,
          out.status === "completed"
            ? { phase: "completed", output: out.output }
            : { phase: "failed", error: out.error ?? "unknown" },
        );
        return out;
      }

      const agentInput = buildAgentJobInput(input);

      // ── Tier 2：Docker 探活 ──
      const dockerAvailable = await probeDockerReachable();

      if (dockerAvailable && opts.realModeDispatcher) {
        setStatus(input.jobId, {
          phase: "running",
          iteration: 0,
          tokensUsed: 0,
        });
        try {
          const realOut = await opts.realModeDispatcher(agentInput);
          const wrapped = wrapAgentOutput(realOut, "real");
          // Task 10：先校验 output schema；失败会抛错，由 catch 触发降级。
          validateWrappedOrThrow(wrapped, input, "real", opts.logger);
          recordDelegation("real", wrapped);
          setStatus(
            input.jobId,
            wrapped.status === "completed"
              ? { phase: "completed", output: wrapped.output }
              : { phase: "failed", error: wrapped.error ?? "unknown" },
          );
          return wrapped;
        } catch (err) {
          opts.logger.warn(
            "[delegator] real mode failed, falling back to lite",
            { error: errorMessage(err) },
          );
          // fall through to Lite Mode
        }
      }

      // ── Lite Mode ──
      if (opts.liteAgentRuntime) {
        setStatus(input.jobId, {
          phase: "running",
          iteration: 0,
          tokensUsed: 0,
        });
        try {
          const liteOut = await opts.liteAgentRuntime.run(agentInput);
          const wrapped = wrapAgentOutput(liteOut, "lite");
          // Task 10：Lite Mode 同样做 output schema 校验；失败 → fall through。
          validateWrappedOrThrow(wrapped, input, "lite", opts.logger);
          recordDelegation("lite", wrapped);
          setStatus(
            input.jobId,
            wrapped.status === "completed"
              ? { phase: "completed", output: wrapped.output }
              : { phase: "failed", error: wrapped.error ?? "unknown" },
          );
          return wrapped;
        } catch (err) {
          opts.logger.warn(
            "[delegator] lite mode failed, falling back to callLLMJson",
            { error: errorMessage(err) },
          );
          // fall through to Tier 3 fallback
        }
      }

      // ── Tier 3：callLLMJson fallback ──
      const out = await executeFallback(input, startMs, "all_tiers_failed");
      recordDelegation("fallback", out);
      setStatus(
        input.jobId,
        out.status === "completed"
          ? { phase: "completed", output: out.output }
          : { phase: "failed", error: out.error ?? "unknown" },
      );
      return out;
    } catch (outerErr) {
      // outer try/catch：确保 delegate 永不抛错。
      const message = errorMessage(outerErr);
      opts.logger.warn("[delegator] outer error, falling back", {
        error: message,
      });
      const out = await executeFallback(
        input,
        startMs,
        `outer_error: ${message}`,
      );
      recordDelegation("fallback", out);
      setStatus(
        input.jobId,
        out.status === "completed"
          ? { phase: "completed", output: out.output }
          : { phase: "failed", error: out.error ?? message },
      );
      return out;
    }
  }

  // ── public: getStatus ────────────────────────────────────────────────
  function getStatus(jobId: string): DelegateStatus | undefined {
    return statusMap.get(jobId);
  }

  // ── public: cancel ───────────────────────────────────────────────────
  async function cancel(jobId: string, reason: string): Promise<void> {
    // Task 5 只做最小实现：只更新状态 map。真正的 in-flight 中止由
    // RealModeDispatcher / LiteAgentRuntime 自行通过 AbortController 处理。
    if (!statusMap.has(jobId)) {
      opts.logger.debug("[delegator] cancel noop (jobId unknown)", {
        jobId,
        reason,
      });
      return;
    }
    setStatus(jobId, { phase: "aborted", reason });
  }

  // ── public: getDiagnostics ───────────────────────────────────────────
  function getDiagnostics(): RoleAgentDelegatorDiagnostics {
    const total = diag.totalDelegations;
    const snapshot: RoleAgentDelegatorDiagnostics = {
      totalDelegations: total,
      realDelegations: diag.realDelegations,
      liteDelegations: diag.liteDelegations,
      fallbackDelegations: diag.fallbackDelegations,
      averageIterations: total > 0 ? diag.iterationsSum / total : 0,
      averageTokensPerDelegation: total > 0 ? diag.tokensSum / total : 0,
      averageDurationMs: total > 0 ? diag.durationMsSum / total : 0,
    };
    if (diag.lastInvocationAt) snapshot.lastInvocationAt = diag.lastInvocationAt;
    if (diag.lastMode) snapshot.lastMode = diag.lastMode;
    if (diag.lastError) snapshot.lastError = diag.lastError;
    return snapshot;
  }

  return { delegate, getStatus, cancel, getDiagnostics };
}

// Re-export 主要类型，便于消费方单点 import。
export type { AgentBudget };
