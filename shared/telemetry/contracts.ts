/**
 * 事件总线与可观测性契约
 *
 * telemetry-dashboard、cost-observability、state-persistence-recovery
 * 三个模块共享此契约。约定事件名前缀、payload 结构、IndexedDB store key。
 */

// ---------------------------------------------------------------------------
// 事件名前缀约定
// ---------------------------------------------------------------------------

/** 所有遥测事件以 "telemetry:" 为前缀 */
export const TELEMETRY_EVENT_PREFIX = "telemetry:" as const;
/** 所有成本事件以 "cost:" 为前缀 */
export const COST_EVENT_PREFIX = "cost:" as const;
/** 所有持久化恢复事件以 "recovery:" 为前缀 */
export const RECOVERY_EVENT_PREFIX = "recovery:" as const;

// ---------------------------------------------------------------------------
// 遥测事件
// ---------------------------------------------------------------------------

export interface TelemetryLLMCallEvent {
  type: "telemetry:llm_call";
  timestamp: number;
  agentId: string;
  workflowId?: string;
  missionId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: "success" | "error";
  errorMessage?: string;
}

export interface TelemetryStageEvent {
  type: "telemetry:stage_complete";
  timestamp: number;
  workflowId: string;
  stage: string;
  durationMs: number;
  agentCount: number;
  taskCount: number;
}

export interface TelemetryMissionEvent {
  type: "telemetry:mission_update";
  timestamp: number;
  missionId: string;
  status: string;
  stageKey?: string;
  progress: number;
  durationMs?: number;
}

export type TelemetryEvent =
  | TelemetryLLMCallEvent
  | TelemetryStageEvent
  | TelemetryMissionEvent;

// ---------------------------------------------------------------------------
// 成本事件
// ---------------------------------------------------------------------------

export interface CostEstimate {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** 估算费用（美元），基于模型定价表 */
  estimatedCostUsd: number;
  /** 累计费用（当前会话/工作流） */
  cumulativeCostUsd: number;
}

export interface CostBudgetAlert {
  type: "cost:budget_alert";
  timestamp: number;
  level: "warning" | "critical";
  currentCostUsd: number;
  budgetLimitUsd: number;
  percentUsed: number;
  recommendation: string;
}

export interface CostLLMCallRecord {
  type: "cost:llm_call";
  timestamp: number;
  agentId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  workflowId?: string;
  missionId?: string;
  stage?: string;
}

export type CostEvent = CostBudgetAlert | CostLLMCallRecord;

// ---------------------------------------------------------------------------
// 持久化恢复事件
// ---------------------------------------------------------------------------

export interface RecoveryCheckpoint {
  type: "recovery:checkpoint";
  timestamp: number;
  sessionId: string;
  workflowId?: string;
  missionId?: string;
  stage?: string;
  progress: number;
  stateSnapshot: string;
}

export interface RecoveryRestoreEvent {
  type: "recovery:restore";
  timestamp: number;
  sessionId: string;
  restoredFromTimestamp: number;
  success: boolean;
  errorMessage?: string;
}

export type RecoveryEvent = RecoveryCheckpoint | RecoveryRestoreEvent;

// ---------------------------------------------------------------------------
// 统一事件联合类型
// ---------------------------------------------------------------------------

export type ObservabilityEvent = TelemetryEvent | CostEvent | RecoveryEvent;

// ---------------------------------------------------------------------------
// IndexedDB Store Key 命名规范
// ---------------------------------------------------------------------------

/** 所有可观测性模块的 IndexedDB store 名称 */
export const OBSERVABILITY_IDB_STORES = {
  /** 遥测事件历史 */
  telemetryEvents: "obs_telemetry_events",
  /** 遥测聚合统计（按小时/天） */
  telemetryAggregates: "obs_telemetry_aggregates",
  /** 成本记录 */
  costRecords: "obs_cost_records",
  /** 成本预算配置 */
  costBudgets: "obs_cost_budgets",
  /** 恢复检查点 */
  recoveryCheckpoints: "obs_recovery_checkpoints",
  /** 恢复会话状态 */
  recoverySessions: "obs_recovery_sessions",
} as const;

export type ObservabilityIDBStoreName =
  (typeof OBSERVABILITY_IDB_STORES)[keyof typeof OBSERVABILITY_IDB_STORES];

// ---------------------------------------------------------------------------
// 遥测聚合结构
// ---------------------------------------------------------------------------

export interface TelemetryAggregate {
  /** 聚合粒度 */
  granularity: "hour" | "day";
  /** 时间桶起始时间戳 */
  bucketStart: number;
  /** LLM 调用次数 */
  llmCallCount: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 总延迟（毫秒） */
  totalLatencyMs: number;
  /** 错误次数 */
  errorCount: number;
  /** 估算总费用 */
  estimatedCostUsd: number;
  /** 按模型分组统计 */
  byModel: Record<string, {
    callCount: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
  /** 按智能体分组统计 */
  byAgent: Record<string, {
    callCount: number;
    totalTokens: number;
  }>;
}

// ---------------------------------------------------------------------------
// Python Contract Slice: Telemetry/Cost/Monitoring Routes
// ---------------------------------------------------------------------------

export const TELEMETRY_ROUTE_PYTHON_CONTRACT_VERSION =
  "telemetry-route.runtime.v1" as const;

export type TelemetryRoutePythonOperation =
  | "metrics"
  | "events"
  | "cost"
  | "error";

export type TelemetryRoutePythonRoute = "telemetry" | "cost" | "monitoring";
export type TelemetryRoutePythonSource = "synthetic" | "estimated" | "actual";

export interface TelemetryRoutePythonProvenance {
  source: string;
  synthetic: boolean;
  externalMonitoringRequest: false;
  [key: string]: unknown;
}

export interface TelemetryRoutePythonTokens {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: TelemetryRoutePythonSource;
}

export interface TelemetryRoutePythonCost {
  amountUsd: number;
  source: TelemetryRoutePythonSource;
  billingSource: string;
  isEstimate: boolean;
  estimatedUsd?: number | null;
  syntheticUsd?: number | null;
  actualUsd?: number | null;
  currency?: "USD";
  pricingSource?: string;
}

export interface TelemetryRoutePythonMetrics {
  totalCalls: number;
  errorCount: number;
  latencyMs: {
    average: number;
    p95: number;
  };
  tokens: TelemetryRoutePythonTokens;
  cost: TelemetryRoutePythonCost;
  updatedAt: number;
}

export interface TelemetryRoutePythonEvent {
  eventId: string;
  type: string;
  timestamp: number;
  severity: "info" | "warning" | "error";
  message: string;
  source: TelemetryRoutePythonSource;
  [key: string]: unknown;
}

export interface TelemetryRoutePythonError {
  code: string;
  message: string;
  retryable: boolean;
}

interface TelemetryRoutePythonBaseResult {
  contractVersion: typeof TELEMETRY_ROUTE_PYTHON_CONTRACT_VERSION;
  runtime: "python-contract";
  operation: TelemetryRoutePythonOperation;
  route: TelemetryRoutePythonRoute;
  ok: boolean;
  status: "completed" | "failed";
  generatedAt: string;
  provenance: TelemetryRoutePythonProvenance;
}

export type TelemetryRoutePythonContractResult =
  | (TelemetryRoutePythonBaseResult & {
      operation: "metrics";
      ok: true;
      status: "completed";
      metrics: TelemetryRoutePythonMetrics;
    })
  | (TelemetryRoutePythonBaseResult & {
      operation: "events";
      ok: true;
      status: "completed";
      events: TelemetryRoutePythonEvent[];
      eventCount: number;
    })
  | (TelemetryRoutePythonBaseResult & {
      operation: "cost";
      ok: true;
      status: "completed";
      route: "cost";
      cost: TelemetryRoutePythonCost;
      tokens: TelemetryRoutePythonTokens;
    })
  | (TelemetryRoutePythonBaseResult & {
      operation: "error";
      ok: false;
      status: "failed";
      error: TelemetryRoutePythonError;
      businessOutcome: {
        ok: true;
        telemetryErrorIgnored: true;
      };
    });

const TELEMETRY_ROUTE_PYTHON_OPERATIONS: readonly TelemetryRoutePythonOperation[] = [
  "metrics",
  "events",
  "cost",
  "error",
];

const TELEMETRY_ROUTE_PYTHON_ROUTES: readonly TelemetryRoutePythonRoute[] = [
  "telemetry",
  "cost",
  "monitoring",
];

const TELEMETRY_ROUTE_PYTHON_SOURCES: readonly TelemetryRoutePythonSource[] = [
  "synthetic",
  "estimated",
  "actual",
];

export function isTelemetryRoutePythonContractResult(
  value: unknown,
): value is TelemetryRoutePythonContractResult {
  const record = telemetryRouteAsRecord(value);
  if (!record) return false;
  if (record.contractVersion !== TELEMETRY_ROUTE_PYTHON_CONTRACT_VERSION) return false;
  if (record.runtime !== "python-contract") return false;
  if (!telemetryRouteOneOf(record.operation, TELEMETRY_ROUTE_PYTHON_OPERATIONS)) {
    return false;
  }
  if (!telemetryRouteOneOf(record.route, TELEMETRY_ROUTE_PYTHON_ROUTES)) return false;
  if (!telemetryRouteNonEmptyString(record.generatedAt)) return false;
  const provenance = record.provenance;
  if (!isTelemetryRoutePythonProvenance(provenance)) return false;

  if (record.operation === "metrics") {
    return (
      record.ok === true &&
      record.status === "completed" &&
      isTelemetryRoutePythonMetrics(record.metrics, provenance)
    );
  }

  if (record.operation === "events") {
    return (
      record.ok === true &&
      record.status === "completed" &&
      Array.isArray(record.events) &&
      telemetryRouteNonNegativeNumber(record.eventCount) &&
      record.eventCount === record.events.length &&
      record.events.every(event =>
        isTelemetryRoutePythonEvent(event, provenance),
      )
    );
  }

  if (record.operation === "cost") {
    return (
      record.ok === true &&
      record.status === "completed" &&
      record.route === "cost" &&
      isTelemetryRoutePythonCost(record.cost, provenance) &&
      isTelemetryRoutePythonTokens(record.tokens, provenance)
    );
  }

  const businessOutcome = telemetryRouteAsRecord(record.businessOutcome);
  return (
    record.ok === false &&
    record.status === "failed" &&
    isTelemetryRoutePythonError(record.error) &&
    businessOutcome !== null &&
    businessOutcome.ok === true &&
    businessOutcome.telemetryErrorIgnored === true
  );
}

function isTelemetryRoutePythonProvenance(
  value: unknown,
): value is TelemetryRoutePythonProvenance {
  const provenance = telemetryRouteAsRecord(value);
  return (
    provenance !== null &&
    telemetryRouteNonEmptyString(provenance.source) &&
    typeof provenance.synthetic === "boolean" &&
    provenance.externalMonitoringRequest === false
  );
}

function isTelemetryRoutePythonMetrics(
  value: unknown,
  provenance: TelemetryRoutePythonProvenance,
): value is TelemetryRoutePythonMetrics {
  const metrics = telemetryRouteAsRecord(value);
  if (!metrics) return false;
  const latency = telemetryRouteAsRecord(metrics.latencyMs);
  return (
    telemetryRouteNonNegativeNumber(metrics.totalCalls) &&
    telemetryRouteNonNegativeNumber(metrics.errorCount) &&
    latency !== null &&
    telemetryRouteNonNegativeNumber(latency.average) &&
    telemetryRouteNonNegativeNumber(latency.p95) &&
    isTelemetryRoutePythonTokens(metrics.tokens, provenance) &&
    isTelemetryRoutePythonCost(metrics.cost, provenance) &&
    telemetryRouteNonNegativeNumber(metrics.updatedAt)
  );
}

function isTelemetryRoutePythonTokens(
  value: unknown,
  provenance: TelemetryRoutePythonProvenance,
): value is TelemetryRoutePythonTokens {
  const tokens = telemetryRouteAsRecord(value);
  if (!tokens) return false;
  if (!telemetryRouteNonNegativeNumber(tokens.promptTokens)) return false;
  if (!telemetryRouteNonNegativeNumber(tokens.completionTokens)) return false;
  if (!telemetryRouteNonNegativeNumber(tokens.totalTokens)) return false;
  if (tokens.totalTokens !== tokens.promptTokens + tokens.completionTokens) return false;
  if (!telemetryRouteOneOf(tokens.source, TELEMETRY_ROUTE_PYTHON_SOURCES)) return false;
  return !(provenance.synthetic && tokens.source === "actual");
}

function isTelemetryRoutePythonCost(
  value: unknown,
  provenance: TelemetryRoutePythonProvenance,
): value is TelemetryRoutePythonCost {
  const cost = telemetryRouteAsRecord(value);
  if (!cost) return false;
  if (!telemetryRouteNonNegativeNumber(cost.amountUsd)) return false;
  if (!telemetryRouteOneOf(cost.source, TELEMETRY_ROUTE_PYTHON_SOURCES)) return false;
  if (!telemetryRouteNonEmptyString(cost.billingSource)) return false;
  if (typeof cost.isEstimate !== "boolean") return false;
  if (cost.currency !== undefined && cost.currency !== "USD") return false;
  if (cost.pricingSource !== undefined && !telemetryRouteNonEmptyString(cost.pricingSource)) {
    return false;
  }
  if (cost.estimatedUsd !== undefined && cost.estimatedUsd !== null && !telemetryRouteNonNegativeNumber(cost.estimatedUsd)) {
    return false;
  }
  if (cost.syntheticUsd !== undefined && cost.syntheticUsd !== null && !telemetryRouteNonNegativeNumber(cost.syntheticUsd)) {
    return false;
  }
  if (cost.actualUsd !== undefined && cost.actualUsd !== null && !telemetryRouteNonNegativeNumber(cost.actualUsd)) {
    return false;
  }
  if (provenance.synthetic && cost.source === "actual") return false;

  if (cost.source === "actual") {
    return (
      cost.actualUsd !== undefined &&
      cost.actualUsd !== null &&
      cost.isEstimate === false &&
      cost.estimatedUsd === undefined &&
      cost.syntheticUsd === undefined
    );
  }

  if (cost.actualUsd !== undefined && cost.actualUsd !== null) return false;
  if (cost.isEstimate !== true) return false;
  if (cost.source === "estimated") {
    return cost.estimatedUsd !== undefined && cost.estimatedUsd !== null;
  }
  return cost.syntheticUsd !== undefined && cost.syntheticUsd !== null;
}

function isTelemetryRoutePythonEvent(
  value: unknown,
  provenance: TelemetryRoutePythonProvenance,
): value is TelemetryRoutePythonEvent {
  const event = telemetryRouteAsRecord(value);
  return (
    event !== null &&
    telemetryRouteNonEmptyString(event.eventId) &&
    telemetryRouteNonEmptyString(event.type) &&
    telemetryRouteNonNegativeNumber(event.timestamp) &&
    (event.severity === "info" ||
      event.severity === "warning" ||
      event.severity === "error") &&
    telemetryRouteNonEmptyString(event.message) &&
    telemetryRouteOneOf(event.source, TELEMETRY_ROUTE_PYTHON_SOURCES) &&
    !(provenance.synthetic && event.source === "actual")
  );
}

function isTelemetryRoutePythonError(
  value: unknown,
): value is TelemetryRoutePythonError {
  const error = telemetryRouteAsRecord(value);
  return (
    error !== null &&
    telemetryRouteNonEmptyString(error.code) &&
    telemetryRouteNonEmptyString(error.message) &&
    typeof error.retryable === "boolean"
  );
}

function telemetryRouteAsRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function telemetryRouteNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function telemetryRouteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function telemetryRouteOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.includes(value as T);
}
