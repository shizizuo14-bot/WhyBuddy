/**
 * `autopilot-role-autonomous-agent` spec Task 2.1 + 2.2 + 2.7 + 2.9：
 * Agent Loop 状态机主引擎（ReAct：Think → Act → Observe）。
 *
 * 负责：
 * - 维护 `AgentLoopState`（phase / iteration / tokensUsed / history ...）。
 * - 每次 thinking 阶段前检查预算（iterations / tokens / timeout）。
 * - 调用 LLM → 解析响应：finish / action / error。
 * - 通过 `ToolInvoker` 执行工具调用，并把 observation 写入 trace。
 * - 经 `ProgressEmitter` 广播 lifecycle 事件（thinking / acting / observing
 *   / iteration_completed / completed / failed / aborted）。
 * - 提供 `abort(reason)` 强制终止；下一轮 loop 检查时退出。
 * - 绝不向调用方抛错：所有异常内部收敛为 `AgentJobOutput{status:"failed"}`。
 */

import { randomUUID } from "node:crypto";

import type {
  AgentJobInput,
  AgentJobOutput,
} from "../../../../shared/blueprint/agent-job.js";
import type { AgentBudget } from "../../../../shared/blueprint/agent-budget.js";
import type {
  AgentLoopPhase,
  AgentLoopState,
  AgentTraceEntry,
} from "../../../../shared/blueprint/agent-state.js";
import type {
  AgentProgressEvent,
  AgentProgressEventType,
} from "../../../../shared/blueprint/agent-events.js";
import type { BlueprintLogger } from "../context.js";

import type { LlmCallFn } from "./llm-call.js";
import type { ToolInvoker } from "./tool-proxy-client.js";
import type { ProgressEmitter } from "./progress-emitter.js";

function readPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** 外部依赖组合。 */
export interface AgentLoopStateMachineDeps {
  llmCall: LlmCallFn;
  toolInvoker: ToolInvoker;
  progressEmitter: ProgressEmitter;
  logger: BlueprintLogger;
  now: () => Date;
}

/**
 * Agent Loop 状态机。
 *
 * 注意：实例不可复用，一次 `run()` 对应一次作业。
 */
export class AgentLoopStateMachine {
  private readonly input: AgentJobInput;
  private readonly deps: AgentLoopStateMachineDeps;
  private readonly state: AgentLoopState;
  private readonly startedAtMs: number;

  private abortReason: string | undefined;
  private completed = false;

  constructor(input: AgentJobInput, deps: AgentLoopStateMachineDeps) {
    this.input = input;
    this.deps = deps;
    const startDate = deps.now();
    this.startedAtMs = startDate.getTime();
    this.state = {
      phase: "idle",
      iteration: 0,
      tokensUsed: 0,
      startedAt: startDate.toISOString(),
      lastTransitionAt: startDate.toISOString(),
      history: [],
    };
  }

  /** 当前状态的深拷贝快照。 */
  getState(): AgentLoopState {
    return JSON.parse(JSON.stringify(this.state)) as AgentLoopState;
  }

  /**
   * 标记中止：下一轮循环检查到此 flag 后以 `aborted` 收尾。
   * 不抛错；允许重复调用（只记录第一次原因）。
   */
  abort(reason: string): void {
    if (!this.abortReason) {
      this.abortReason = reason || "aborted";
    }
  }

  /**
   * 主循环。不抛错，始终返回 `AgentJobOutput`。
   */
  async run(): Promise<AgentJobOutput> {
    try {
      // 开始事件。
      this.emitProgress("agent.started");

      // 主循环：循环边界由预算 / abort / 终态决定。
      // 用 for 替代 while(true) 避免“最终必然 return”的静态分析误判。
      for (;;) {
        if (this.completed) {
          // 防御：理论上 finalize 返回后不会再走到这里。
          break;
        }

        if (this.abortReason) {
          return this.finalize("aborted", this.abortReason, null);
        }

        // 预算检查（Task 2.2）—— 在 thinking 之前严格校验。
        const budgetCheck = this.checkBudget();
        if (budgetCheck) {
          return this.finalize("failed", budgetCheck, null);
        }

        // Phase: Thinking
        this.transitionTo("thinking");
        this.state.iteration += 1;
        this.emitProgress("agent.thinking");

        const thinkResult = await this.safeCallLlm();
        this.state.tokensUsed += Math.max(0, thinkResult.tokensUsed | 0);

        if (thinkResult.type === "finish") {
          this.recordTrace({
            phase: "thinking",
            thought: thinkResult.thought,
            tokensUsed: thinkResult.tokensUsed,
          });
          this.transitionTo("completed");
          this.emitProgress("agent.completed", { output: thinkResult.output });
          return this.finalize("completed", null, thinkResult.output);
        }

        if (thinkResult.type === "error") {
          this.state.error = thinkResult.error;
          this.recordTrace({
            phase: "thinking",
            thought: undefined,
            tokensUsed: thinkResult.tokensUsed,
            error: thinkResult.error,
          });
          this.transitionTo("failed");
          this.emitProgress("agent.failed", { error: thinkResult.error });
          return this.finalize("failed", thinkResult.error, null);
        }

        // thinkResult.type === "action"
        const action = thinkResult.action;
        const requestId = randomUUID();
        this.state.currentAction = {
          toolId: action.toolId,
          params: action.params,
          requestId,
        };

        this.transitionTo("acting");
        this.emitProgress("agent.acting", {
          action: { toolId: action.toolId },
          thought: thinkResult.thought,
        });

        const toolResult = await this.safeInvokeTool({
          toolId: action.toolId,
          params: action.params,
          requestId,
        });

        // Phase: Observing（Task 2.7：记录 observation 到 trace history）。
        this.transitionTo("observing");
        this.recordTrace({
          phase: "observing",
          thought: thinkResult.thought,
          action: { toolId: action.toolId, params: action.params },
          observation: {
            toolId: action.toolId,
            result: toolResult.success ? toolResult.result : toolResult.error,
            durationMs: toolResult.durationMs,
          },
          tokensUsed: thinkResult.tokensUsed,
          error: toolResult.success ? undefined : toolResult.error,
        });
        this.emitProgress("agent.observing", {
          observation: { toolId: action.toolId, success: toolResult.success },
        });

        this.emitProgress("agent.iteration_completed");
        this.state.currentAction = undefined;
        // 继续下一轮：回到 thinking。
      }

      // 防御分支：不应触达。
      return this.finalize("failed", "loop_exited_unexpectedly", null);
    } catch (error) {
      // 捕获理论上不该出现的异常，统一走 failed 收尾。
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error("[agent.state-machine] unexpected error", { error: message });
      return this.finalize("failed", `unexpected_error: ${message}`, null);
    }
  }

  // ---------------------------------------------------------------------------
  // 私有辅助
  // ---------------------------------------------------------------------------

  /** 预算检查：返回 undefined 表示预算充足，否则返回失败原因。 */
  private checkBudget(): string | undefined {
    const budget = this.input.budget;
    if (this.state.iteration >= this.nonNegative(budget.maxIterations)) {
      return "budget_iterations_exceeded";
    }
    if (this.state.tokensUsed >= this.nonNegative(budget.maxTokens)) {
      return "budget_tokens_exceeded";
    }
    const elapsed = this.deps.now().getTime() - this.startedAtMs;
    if (elapsed >= this.nonNegative(budget.timeoutMs)) {
      return "budget_timeout_exceeded";
    }
    return undefined;
  }

  private nonNegative(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  /** 阶段切换：更新 phase 与 lastTransitionAt。 */
  private transitionTo(phase: AgentLoopPhase): void {
    this.state.phase = phase;
    this.state.lastTransitionAt = this.deps.now().toISOString();
  }

  /** 追加一条 trace 记录。 */
  private recordTrace(entry: Omit<AgentTraceEntry, "iteration" | "timestamp">): void {
    const fullEntry: AgentTraceEntry = {
      iteration: this.state.iteration,
      phase: entry.phase,
      timestamp: this.deps.now().toISOString(),
      thought: entry.thought,
      action: entry.action,
      observation: entry.observation,
      tokensUsed: Math.max(0, (entry.tokensUsed ?? 0) | 0),
      error: entry.error,
    };
    this.state.history.push(fullEntry);
  }

  /** 安全调用 LLM：任何异常都转成 error 输出，不向外抛。 */
  private async safeCallLlm() {
    try {
      return await this.deps.llmCall({
        systemPrompt: this.input.systemPrompt,
        history: this.state.history,
        context: this.input.context,
        tools: this.input.tools,
        maxTokens: readPositiveNumber(this.input.context.llmMaxTokens),
        acceptDirectOutput: this.input.context.llmAcceptDirectOutput === true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.warn("[agent.state-machine] llmCall threw", { error: message });
      return {
        type: "error" as const,
        error: `llm_throw: ${message}`,
        tokensUsed: 0,
      };
    }
  }

  /** 安全调用工具：任何异常都转成 failure 结果，不向外抛。 */
  private async safeInvokeTool(input: {
    toolId: string;
    params: Record<string, unknown>;
    requestId: string;
  }) {
    const budget = this.input.budget;
    try {
      return await this.deps.toolInvoker.invoke({
        roleId: this.input.roleId,
        jobId: this.input.jobId,
        toolId: input.toolId,
        params: input.params,
        requestId: input.requestId,
        timeoutMs: this.nonNegative(budget.toolTimeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.warn("[agent.state-machine] toolInvoker threw", {
        toolId: input.toolId,
        error: message,
      });
      return {
        success: false as const,
        error: `tool_throw: ${message}`,
        durationMs: 0,
      };
    }
  }

  /** 发送进度事件：emitter 内部 fire-and-forget，本函数不抛错。 */
  private emitProgress(
    type: AgentProgressEventType,
    extra?: Partial<AgentProgressEvent>,
  ): void {
    const budget = this.input.budget;
    const elapsed = this.deps.now().getTime() - this.startedAtMs;
    const event: AgentProgressEvent = {
      type,
      jobId: this.input.jobId,
      roleId: this.input.roleId,
      stageId: this.input.stageId,
      iteration: this.state.iteration,
      timestamp: this.deps.now().toISOString(),
      phase: this.state.phase,
      tokensUsed: this.state.tokensUsed,
      budgetRemaining: {
        iterations: Math.max(0, budget.maxIterations - this.state.iteration),
        tokens: Math.max(0, budget.maxTokens - this.state.tokensUsed),
        timeMs: Math.max(0, budget.timeoutMs - elapsed),
      },
      ...(extra ?? {}),
    };
    try {
      this.deps.progressEmitter.emit(event);
    } catch (error) {
      // 理论上 emitter 自己吞错；这里再兜一次。
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.debug("[agent.state-machine] progressEmitter threw", {
        error: message,
      });
    }
  }

  /** 构造最终输出并返回；幂等：第一次调用后 `completed` 标记生效。 */
  private finalize(
    status: "completed" | "failed" | "aborted",
    error: string | null,
    output: unknown,
  ): AgentJobOutput {
    this.completed = true;
    if (status === "aborted") {
      this.transitionTo("failed");
      this.emitProgress("agent.aborted", { error: error ?? undefined });
    }
    const durationMs = Math.max(0, this.deps.now().getTime() - this.startedAtMs);
    return {
      jobId: this.input.jobId,
      roleId: this.input.roleId,
      status,
      output,
      iterations: this.state.iteration,
      totalTokens: this.state.tokensUsed,
      durationMs,
      trace: [...this.state.history],
      error: error ?? undefined,
    };
  }
}

export type {
  AgentJobInput,
  AgentJobOutput,
  AgentBudget,
  AgentLoopPhase,
  AgentLoopState,
  AgentTraceEntry,
};
