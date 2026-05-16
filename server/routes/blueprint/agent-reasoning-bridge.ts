/**
 * `autopilot-agent-reasoning-stream` spec Task 4：Agent 推理流桥接 bridge。
 *
 * 本模块位于「四层数据映射」中的 Layer 2 → Layer 3 转译层：订阅
 * {@link CallbackReceiver}.onProgress 收到的 {@link AgentProgressEvent}（HMAC
 * 回调载荷），按 spec 的脱敏与映射规则转译为 `role.agent.*` 系列
 * {@link BlueprintGenerationEvent}，并通过 {@link BlueprintEventBus}.emit 注入
 * 蓝图栈事件总线；下游 `BlueprintSocketRelay` / `BlueprintRealtimeStore` /
 * `AgentReasoningTimeline` 都不在本文件管辖之内，仅作为消费方存在。
 *
 * 关键约束：
 * - **不修改** {@link RoleAgentDelegator} / {@link RoleAgentRuntime} /
 *   {@link LiteAgentRuntime} / {@link CallbackReceiver} 的内部实现，全部通过
 *   `import type` 实现接口耦合。
 * - 不引入新依赖；脱敏复用既有 {@link applyAgentCrewRedaction} +
 *   {@link createDefaultAgentCrewStageActivationPolicy}（与 trace-sanitizer /
 *   diagnostics-store 一致）。
 * - 不扩大 TypeScript 基线 113 个错误；新代码全量类型，不使用 `any`。
 * - `BUILD_TARGET=test` 下强制视为 env-off，保留既有 5140+ 测试默认兼容性。
 * - 不在前端引入定时轮询；节奏完全由真实 LLM 循环的 `AgentProgressEvent` 驱动。
 *
 * 与 Task 5 的解耦：本模块只输出工厂；具体的例子测试由 Task 5 在
 * `agent-reasoning-bridge.test.ts` 中提供。
 */

import { randomUUID } from "node:crypto";

import type {
  BlueprintGenerationEvent,
  BlueprintGenerationStage,
  BlueprintGenerationStatus,
} from "../../../shared/blueprint/contracts.js";
import type {
  AgentProgressEvent,
  AgentProgressEventType,
} from "../../../shared/blueprint/agent-events.js";
import { BlueprintEventName } from "../../../shared/blueprint/events.js";

import type { BlueprintEventBus, BlueprintLogger } from "./context.js";
import type {
  CallbackReceiver,
  ProgressListener,
} from "./role-agent-runtime/callback-receiver.js";
import type { RoleAgentDelegator } from "./role-agent-runtime/delegator.js";
import type { BlueprintRuntimeDiagnosticsStore } from "./runtime-enablement/diagnostics-store.js";
import {
  applyAgentCrewRedaction,
  createDefaultAgentCrewStageActivationPolicy,
  type AgentCrewStageActivationPolicy,
} from "./agent-crew-stage-activation/policy.js";

// ─── 公共类型 ────────────────────────────────────────────────────────────────

/**
 * Bridge 工厂依赖。所有外部能力均通过 `deps` 注入，便于宿主装配层与例子测试
 * 替换桩件。
 */
export interface AgentReasoningBridgeDeps {
  /** 蓝图栈统一事件总线（只调用 emit；不订阅）。 */
  eventBus: BlueprintEventBus;
  /**
   * 容器内 Agent Loop 的 HMAC 回调接收器。
   * 未注入时（`undefined`）bridge 走 env-off 路径，`start/stop` 为 no-op，
   * 与既有装配代码保持向后兼容（design §「Env flag off 路径」）。
   */
  callbackReceiver?: CallbackReceiver;
  /**
   * 角色 Agent 委派器。可选，仅用于推断 `agent.failed` 时的 tier 降级标志
   * （Real / Lite / Fallback）。未注入时 `degraded` 默认为 `false`。
   */
  delegator?: RoleAgentDelegator;
  /** 运行时诊断 store（写入 forward / dropped 计数与 enabled 标志）。 */
  runtimeDiagnostics: BlueprintRuntimeDiagnosticsStore;
  /** 静默 logger 即可，仅用于 listener 异常分支。 */
  logger: BlueprintLogger;
  /** 当前时间注入；测试场景用 `() => new Date(fixed)` 固化。 */
  now: () => Date;
}

/**
 * Bridge 对外暴露的诊断快照。
 *
 * 与 {@link BlueprintRuntimeDiagnosticsStore} 中的 `agentReasoningBridge` entry
 * 字段保持 1:1 对齐，但本接口只面向 bridge 自身的计数器（不含 `lastEventAt /
 * lastEventType` 等需要从 store 聚合的字段）。
 */
export interface AgentReasoningBridgeDiagnostics {
  enabled: boolean;
  totalForwarded: number;
  droppedEntryCount: number;
}

/**
 * Bridge 句柄：装配层 / 集成测试通过它启停 listener，并读取诊断。
 *
 * 不暴露 `forward` 等内部实现细节，避免外部绕过 callbackReceiver 直接注入
 * 事件破坏来源单一性。
 */
export interface AgentReasoningBridgeHandle {
  /** 注册 listener；env-off 或重复调用为 no-op。 */
  start: () => void;
  /** 释放 listener；env-off 或未启动时为 no-op。 */
  stop: () => void;
  /** 当前 forward / dropped 计数与 enabled 标志。 */
  getDiagnostics: () => AgentReasoningBridgeDiagnostics;
}

// ─── 内部常量 ────────────────────────────────────────────────────────────────

/**
 * `thought` 字段最大字符数（按 UTF-8 字符计，不是字节）。
 * 与 Req 4.1 / design §Layer 4 保持一致。
 */
const THOUGHT_MAX_CHARS = 280;

/**
 * `observation.summary` 与 `error.message` 的最大字符数。
 * 与 Req 4.3 / Req 4.4 保持一致。
 */
const SUMMARY_MAX_CHARS = 200;

/** 默认家族名：所有 7 条 `role.agent.*` 事件归入 `role` 家族。 */
const FAMILY_ROLE = "role" as const;

/** 截断省略号标记。中英文上下文均可读。 */
const TRUNCATION_ELLIPSIS = "…";

/**
 * 复用与 trace-sanitizer / diagnostics-store 一致的脱敏策略实例。
 * 在模块加载时一次性创建，纯数据，不持有状态。
 */
const REDACTION_POLICY: AgentCrewStageActivationPolicy =
  createDefaultAgentCrewStageActivationPolicy();

// ─── 工厂 ────────────────────────────────────────────────────────────────────

/**
 * 创建一个 {@link AgentReasoningBridgeHandle}。
 *
 * env-off 判定（任一条命中即为 off，整个 bridge 走 no-op 路径）：
 * - `process.env.BLUEPRINT_AGENT_REASONING_STREAM_ENABLED !== "true"`
 * - `process.env.BUILD_TARGET === "test"`
 * - `deps.callbackReceiver == null`
 *
 * env-off 时：
 * - `start()` / `stop()` 为 no-op；
 * - `getDiagnostics()` 返回稳定 shape `{ enabled: false, totalForwarded: 0,
 *   droppedEntryCount: 0 }`；
 * - 不调用 {@link BlueprintRuntimeDiagnosticsStore} 的任何方法（避免污染 store）；
 * - 不调用 `callbackReceiver.onProgress`。
 *
 * env-on 时：
 * - 首次 `start()` 注册 `callbackReceiver.onProgress(forward)` listener，并调用
 *   `runtimeDiagnostics.setAgentReasoningEnabled(true)`；
 * - 重复 `start()` 为 no-op（保护 `dev:all` 双重启动）；
 * - 首次 `stop()` 释放 unsubscribe handle 并调用
 *   `runtimeDiagnostics.setAgentReasoningEnabled(false)`；
 * - 重复 `stop()` 为 no-op。
 */
export function createAgentReasoningBridge(
  deps: AgentReasoningBridgeDeps
): AgentReasoningBridgeHandle {
  const envOff = isEnvOff(deps);

  // env-off 快速路径：固化 stable shape，避免后续任何操作触发 store 写入。
  if (envOff) {
    return {
      start: () => void 0,
      stop: () => void 0,
      getDiagnostics: () => ({
        enabled: false,
        totalForwarded: 0,
        droppedEntryCount: 0,
      }),
    };
  }

  // env-on 路径：bridge 内部计数器与 unsubscribe handle 由闭包持有。
  let totalForwarded = 0;
  let droppedEntryCount = 0;
  let started = false;
  let unsubscribe: (() => void) | undefined;

  /**
   * 单条 `AgentProgressEvent` 的 forward listener。
   *
   * 错误处理约定（spec Task 4.5）：
   * - try：translate → emit → 记 forward 计数 / 诊断 store；
   * - catch（含 translate 抛错、emit 抛错）：debug 日志 + 记 dropped 计数；
   * - 不重抛，避免污染 callbackReceiver 的 listener fan-out 循环。
   * - translate 返回 null（无法识别 type）也视为 dropped。
   */
  const forward: ProgressListener = (event) => {
    try {
      const blueprintEvent = translateAgentProgressEvent(
        event,
        deps.now,
        deps.delegator
      );
      if (blueprintEvent === null) {
        droppedEntryCount += 1;
        deps.runtimeDiagnostics.recordAgentReasoningDropped();
        return;
      }
      deps.eventBus.emit(blueprintEvent);
      totalForwarded += 1;
      deps.runtimeDiagnostics.recordAgentReasoningForwarded(
        blueprintEvent.type,
        deps.now()
      );
    } catch (error) {
      droppedEntryCount += 1;
      deps.runtimeDiagnostics.recordAgentReasoningDropped();
      deps.logger.debug("[agent-reasoning-bridge] forward failed", {
        eventType: event.type,
        jobId: event.jobId,
        roleId: event.roleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  function start(): void {
    if (started) {
      return;
    }
    // 先标记 started 再注册 listener：避免 `onProgress` 同步触发的极端场景里
    // 重入 start() 导致重复订阅。
    started = true;
    // callbackReceiver 在 env-off 检查中已确保非 undefined；TypeScript narrow
    // 不能跨闭包推断，这里用本地常量 + non-null 断言收紧。
    const receiver = deps.callbackReceiver;
    if (!receiver) {
      // 防御性兜底：理论上不会触发（env-off 已拦截），保持 started=true 避免
      // 反复尝试订阅。
      return;
    }
    unsubscribe = receiver.onProgress(forward);
    deps.runtimeDiagnostics.setAgentReasoningEnabled(true);
  }

  function stop(): void {
    if (!started) {
      return;
    }
    started = false;
    const handle = unsubscribe;
    unsubscribe = undefined;
    if (handle) {
      handle();
    }
    deps.runtimeDiagnostics.setAgentReasoningEnabled(false);
  }

  function getDiagnostics(): AgentReasoningBridgeDiagnostics {
    return {
      enabled: started,
      totalForwarded,
      droppedEntryCount,
    };
  }

  return { start, stop, getDiagnostics };
}

// ─── env-off 判定 ────────────────────────────────────────────────────────────

/**
 * 判定 bridge 是否应进入 env-off 路径。
 *
 * 任一条件为真即返回 `true`：
 * - `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED !== "true"`；
 * - `BUILD_TARGET === "test"`（覆盖 server 端 5140+ 测试默认兼容性）；
 * - 未注入 `callbackReceiver`（装配阶段可能因 Docker / Agent runtime 缺失而
 *   提前剪枝）。
 */
function isEnvOff(deps: AgentReasoningBridgeDeps): boolean {
  if (process.env.BLUEPRINT_AGENT_REASONING_STREAM_ENABLED !== "true") {
    return true;
  }
  if (process.env.BUILD_TARGET === "test") {
    return true;
  }
  if (deps.callbackReceiver == null) {
    return true;
  }
  return false;
}

// ─── Layer 2 → Layer 3 转译 ─────────────────────────────────────────────────

/**
 * 把一条 {@link AgentProgressEvent} 翻译成 {@link BlueprintGenerationEvent}。
 *
 * 不可识别的 type 返回 `null`；调用方据此累计 dropped 计数。
 *
 * 字段填充规则（详见 design §Layer 2→3 表）：
 * - `id`：`randomUUID()`，保证幂等去重；
 * - `family`：硬编码 `"role"`；
 * - `stage`：取 `event.stageId`，缺省回退到 `"route_generation"`（与 agent-driven
 *   pipeline 一致）；
 * - `status`：根据 phase 派生 `"running" | "completed" | "failed"`；
 * - `message`：中文友好简短描述；
 * - `occurredAt`：取 `event.timestamp`，缺省 `now().toISOString()`。
 */
export function translateAgentProgressEvent(
  event: AgentProgressEvent,
  now: () => Date,
  delegator?: RoleAgentDelegator
): BlueprintGenerationEvent | null {
  const mapping = mapAgentProgressType(event.type);
  if (mapping === null) {
    return null;
  }

  const stage = resolveStage(event.stageId);
  const occurredAt = pickNonEmptyString(event.timestamp) ?? now().toISOString();

  const base: BlueprintGenerationEvent = {
    id: randomUUID(),
    jobId: event.jobId,
    type: mapping.type,
    family: FAMILY_ROLE,
    stage,
    status: mapping.status,
    message: mapping.message(event),
    occurredAt,
    roleId: event.roleId,
    iteration: event.iteration,
    stageId: event.stageId,
  };

  // 各 phase 独有的可选字段按需注入；不携带的 phase 一律保持 undefined。
  switch (event.type) {
    case "agent.thinking":
      return withThought(base, event);
    case "agent.acting":
      return withAction(base, event);
    case "agent.observing":
      return withObservation(base, event);
    case "agent.failed":
      return withFailureDegraded(base, event, delegator);
    case "agent.aborted":
      return withAbortReason(base, event);
    case "agent.started":
    case "agent.iteration_completed":
    case "agent.completed":
    default:
      return withBudget(base, event);
  }
}

/**
 * 8 种 `AgentProgressEvent.type` → `role.agent.*` 字面量 + 状态 + 消息派生器。
 *
 * 表对应 design §「Layer 2 → Layer 3 映射表」：
 * - `agent.failed` 与 `agent.aborted` 共同映射到 `role.agent.error`，由
 *   `degraded / reason` 字段在 base event 之外区分。
 */
function mapAgentProgressType(
  type: AgentProgressEventType
): {
  type: BlueprintGenerationEvent["type"];
  status: BlueprintGenerationStatus;
  message: (event: AgentProgressEvent) => string;
} | null {
  switch (type) {
    case "agent.started":
      return {
        type: BlueprintEventName.RoleAgentIterationStarted,
        status: "running",
        message: (event) => `Agent 第 ${event.iteration} 轮启动`,
      };
    case "agent.thinking":
      return {
        type: BlueprintEventName.RoleAgentThinking,
        status: "running",
        message: () => "Agent 正在思考",
      };
    case "agent.acting":
      return {
        type: BlueprintEventName.RoleAgentActing,
        status: "running",
        message: (event) => {
          const toolId = event.action?.toolId;
          return toolId
            ? `Agent 调用工具 ${toolId}`
            : "Agent 正在调用工具";
        },
      };
    case "agent.observing":
      return {
        type: BlueprintEventName.RoleAgentObserving,
        status: "running",
        message: (event) => {
          const success = event.observation?.success;
          if (success === true) return "Agent 观察到工具成功返回";
          if (success === false) return "Agent 观察到工具调用失败";
          return "Agent 正在处理观察结果";
        },
      };
    case "agent.iteration_completed":
      return {
        type: BlueprintEventName.RoleAgentIterationCompleted,
        status: "running",
        message: (event) => `Agent 第 ${event.iteration} 轮完成`,
      };
    case "agent.completed":
      return {
        type: BlueprintEventName.RoleAgentCompleted,
        status: "completed",
        message: () => "Agent 任务完成",
      };
    case "agent.failed":
      return {
        type: BlueprintEventName.RoleAgentError,
        status: "failed",
        message: () => "Agent 任务失败",
      };
    case "agent.aborted":
      return {
        type: BlueprintEventName.RoleAgentError,
        status: "failed",
        message: () => "Agent 任务被取消",
      };
    default: {
      // 编译期穷举守卫：若未来 union 扩字面量，TS 会在此处报错。
      const _exhaustive: never = type;
      void _exhaustive;
      return null;
    }
  }
}

// ─── 字段注入辅助 ────────────────────────────────────────────────────────────

/**
 * 注入 `thought`：脱敏 + 280 UTF-8 字符截断 + 省略号标记。
 *
 * `event.thought` 缺省（`undefined` / 空串）时不写字段，保持 base 形态。
 */
function withThought(
  base: BlueprintGenerationEvent,
  event: AgentProgressEvent
): BlueprintGenerationEvent {
  const raw = pickNonEmptyString(event.thought);
  if (raw === undefined) {
    return withBudget(base, event);
  }
  const sanitized = applyAgentCrewRedaction(raw, REDACTION_POLICY);
  const truncated = truncateUtf8WithEllipsis(sanitized, THOUGHT_MAX_CHARS);
  return withBudget({ ...base, thought: truncated }, event);
}

/**
 * 注入 `actionToolId`：仅保留稳定 `toolId`，丢弃 `params`（Req 4.2）。
 */
function withAction(
  base: BlueprintGenerationEvent,
  event: AgentProgressEvent
): BlueprintGenerationEvent {
  const toolId = pickNonEmptyString(event.action?.toolId);
  const next: BlueprintGenerationEvent = toolId
    ? { ...base, actionToolId: toolId }
    : base;
  return withBudget(next, event);
}

/**
 * 注入 `observationSuccess` + `observationSummary`。
 *
 * - `observation.success` 必填，直接透传 boolean；
 * - `observation` 上若有 `summary` 字段（非标准 union 字段，按 unknown 读取），
 *   走 `applyAgentCrewRedaction` + 200 UTF-8 字符截断。
 */
function withObservation(
  base: BlueprintGenerationEvent,
  event: AgentProgressEvent
): BlueprintGenerationEvent {
  const success = event.observation?.success;
  const partial: Partial<BlueprintGenerationEvent> = {};
  if (typeof success === "boolean") {
    partial.observationSuccess = success;
  }
  // `observation.summary` 不是 AgentProgressEvent 的标准字段，但 spec 留出读
  // 通道：通过 unknown 读取兼容上游附带摘要的扩展。
  const observationLike = event.observation as
    | { success?: boolean; summary?: unknown }
    | undefined;
  const rawSummary = pickNonEmptyString(observationLike?.summary);
  if (rawSummary !== undefined) {
    const sanitized = applyAgentCrewRedaction(rawSummary, REDACTION_POLICY);
    partial.observationSummary = truncateUtf8WithEllipsis(
      sanitized,
      SUMMARY_MAX_CHARS
    );
  }
  return withBudget({ ...base, ...partial }, event);
}

/**
 * 注入 `agent.failed` 的 `error` + `degraded`。
 *
 * `degraded` 推断：
 * - 注入了 delegator 时取 `delegator.getDiagnostics().lastMode`，`lite` /
 *   `fallback` → `true`；`real` 或缺省 → `false`；
 * - 未注入 delegator 时默认 `false`（与 spec 默认值一致）。
 */
function withFailureDegraded(
  base: BlueprintGenerationEvent,
  event: AgentProgressEvent,
  delegator?: RoleAgentDelegator
): BlueprintGenerationEvent {
  const errorMessage = sanitizeErrorMessage(event.error);
  const degraded = inferDegradedFromDelegator(delegator);
  const next: BlueprintGenerationEvent = {
    ...base,
    degraded,
  };
  if (errorMessage !== undefined) {
    next.error = errorMessage;
  }
  return withBudget(next, event);
}

/**
 * 注入 `agent.aborted` 的 `degraded` / `reason`。
 *
 * 默认 `degraded = false`，`reason = "用户取消"`（spec Task 4.6）。如果上游
 * `event.error` 含更具体的 reason 字符串（例如 timeout 场景），仍走脱敏链路。
 */
function withAbortReason(
  base: BlueprintGenerationEvent,
  event: AgentProgressEvent
): BlueprintGenerationEvent {
  const next: BlueprintGenerationEvent = {
    ...base,
    degraded: false,
    reason: "用户取消",
  };
  const errorMessage = sanitizeErrorMessage(event.error);
  if (errorMessage !== undefined) {
    next.error = errorMessage;
  }
  return withBudget(next, event);
}

/**
 * 把 `tokensUsed` / `budgetRemaining`（time 维度）写到 base，所有 phase 共用。
 *
 * `budgetRemaining` 是结构化对象（iterations / tokens / timeMs），event 上层
 * 字段是单值；这里取 `tokens` 维度作为最具代表性的剩余度量。
 */
function withBudget(
  base: BlueprintGenerationEvent,
  event: AgentProgressEvent
): BlueprintGenerationEvent {
  const next: BlueprintGenerationEvent = { ...base };
  if (Number.isFinite(event.tokensUsed)) {
    next.tokensUsed = event.tokensUsed;
  }
  const remaining = event.budgetRemaining?.tokens;
  if (typeof remaining === "number" && Number.isFinite(remaining)) {
    next.budgetRemaining = remaining;
  }
  return next;
}

// ─── 通用辅助 ────────────────────────────────────────────────────────────────

/**
 * 从 delegator 诊断中推断当前是否处于降级 tier。
 *
 * - lastMode === "real"     → degraded = false
 * - lastMode === "lite"     → degraded = true
 * - lastMode === "fallback" → degraded = true
 * - 未注入 delegator 或 lastMode 为空 → degraded = false（Spec 默认值）
 */
function inferDegradedFromDelegator(delegator?: RoleAgentDelegator): boolean {
  if (!delegator) {
    return false;
  }
  try {
    const lastMode = delegator.getDiagnostics().lastMode;
    return lastMode === "lite" || lastMode === "fallback";
  } catch {
    // delegator 抛错时保守默认 false，不让推断破坏 forward 链路。
    return false;
  }
}

/**
 * 对 error.message 应用脱敏 + 200 UTF-8 字符截断；显式不含 stack。
 */
function sanitizeErrorMessage(raw: string | undefined): string | undefined {
  const value = pickNonEmptyString(raw);
  if (value === undefined) {
    return undefined;
  }
  const sanitized = applyAgentCrewRedaction(value, REDACTION_POLICY);
  return truncateUtf8WithEllipsis(sanitized, SUMMARY_MAX_CHARS);
}

/**
 * 把字符串按 **UTF-8 字符数**（而非字节或 UTF-16 code unit）截断到 `maxChars`，
 * 截断后追加 `…` 省略号标记。`maxChars` 即截断阈值，不含省略号本身。
 *
 * 使用 `Array.from(str)` 处理 surrogate pair（emoji / 罕见汉字），避免按
 * `String.prototype.slice` 半截字符的问题。
 */
function truncateUtf8WithEllipsis(value: string, maxChars: number): string {
  const codepoints = Array.from(value);
  if (codepoints.length <= maxChars) {
    return value;
  }
  return codepoints.slice(0, maxChars).join("") + TRUNCATION_ELLIPSIS;
}

/**
 * stageId 缺省回退：与 agent-driven pipeline 一致使用 `route_generation`。
 */
function resolveStage(stageId: string | undefined): BlueprintGenerationStage {
  if (stageId && isBlueprintGenerationStage(stageId)) {
    return stageId;
  }
  return "route_generation";
}

/**
 * 静态运行期守卫：确保来源字符串确实属于 {@link BlueprintGenerationStage} union。
 *
 * 11 个字面量由 `shared/blueprint/contracts.ts` 维护；新增 stage 时此处自动收口
 * 即可（编译期 `set` 字面量不会被绕过）。
 */
function isBlueprintGenerationStage(
  value: string
): value is BlueprintGenerationStage {
  return BLUEPRINT_GENERATION_STAGE_SET.has(
    value as BlueprintGenerationStage
  );
}

const BLUEPRINT_GENERATION_STAGE_SET: ReadonlySet<BlueprintGenerationStage> =
  new Set<BlueprintGenerationStage>([
    "input",
    "clarification",
    "route_generation",
    "spec_tree",
    "spec_docs",
    "preview",
    "effect_preview",
    "prompt_packaging",
    "runtime_capability",
    "engineering_handoff",
    "engineering_landing",
  ]);

/**
 * 安全读取「非空字符串」字段：值为非字符串 / 空串时返回 `undefined`。
 */
function pickNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.length === 0) {
    return undefined;
  }
  return value;
}
