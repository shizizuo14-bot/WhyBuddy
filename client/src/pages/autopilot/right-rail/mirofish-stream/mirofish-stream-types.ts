/**
 * autopilot-mirofish-stream / Wave 0
 *
 * MiroFish 流式卡片的 entry union 类型与 tone 枚举。
 *
 * 设计目标：
 * - 6 类 entry 共享一个 base shape（id / kind / stageId / timestamp / tone）
 * - 每类 entry 携带最小必要载荷供卡片渲染
 * - tone 由派生函数从 entry 内部状态算出，不让卡片组件自己反向推 tone
 *   （便于派生层做颜色规则收紧 / 视觉一致性）
 */

import type { AgentReasoningPhase } from "@shared/blueprint/agent-reasoning";

/** 流式卡片的视觉色调；与 derive-spec-tree-chip 的 ChipTone 同一调色。 */
export type MiroFishStreamTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

/** 流式卡片的类型枚举。 */
export type MiroFishStreamEntryKind =
  | "reasoning"
  | "node_completed"
  | "route_decision"
  | "capability_invocation"
  | "artifact_created"
  | "system_note";

/** 卡片基础 shape，所有 entry 共享。 */
export interface MiroFishStreamEntryBase {
  /**
   * 稳定 id，用于 React key + 派生函数去重。
   *
   * 命名约定：
   * - reasoning：直接复用 AgentReasoningEntry.id
   * - node_completed：`node-completed-${nodeId}`
   * - route_decision：`route-decision-${selectionId}`
   * - capability_invocation：`capability-${capabilityId}-${status}`
   * - artifact_created：直接复用 BlueprintGenerationArtifact.id
   * - system_note：调用方自定义
   */
  id: string;
  kind: MiroFishStreamEntryKind;
  /**
   * 用于 stageFilter 过滤；缺失视为全局事件，在所有 stageFilter 下都显示。
   *
   * 后端 stage 名（`route_generation` / `route_selection` / `intake_created`
   * / `clarification` / `spec_tree` / `spec_docs` / `effect_preview` /
   * `prompt_packaging` / `engineering_handoff` / `agent_crew_fabric`）。
   */
  stageId?: string;
  /** ISO timestamp。派生函数用此字段稳定排序。 */
  timestamp: string;
  /** 视觉色调；由派生函数从内部状态算。 */
  tone: MiroFishStreamTone;
}

// ─── 6 类 entry ──────────────────────────────────────────────────────────────

export interface MiroFishReasoningEntry extends MiroFishStreamEntryBase {
  kind: "reasoning";
  phase: AgentReasoningPhase;
  /** 形如 `#1` / `#2`，便于 UI 渲染分隔线。 */
  iterationLabel: string;
  /** 已脱敏 ≤ 280 chars。 */
  thought?: string;
  actionToolId?: string;
  observationSummary?: string;
  observationSuccess?: boolean;
  reason?: string;
  error?: string;
}

export interface MiroFishNodeCompletedEntry extends MiroFishStreamEntryBase {
  kind: "node_completed";
  nodeId: string;
  nodeTitle: string;
  /** 该节点已完成的 BlueprintSpecDocumentType 列表，按 requirements/design/tasks 顺序。 */
  documentTypes: ReadonlyArray<"requirements" | "design" | "tasks">;
  /**
   * 多数派 generationSource：llm / fallback / template。最严重级（template > fallback > llm）。
   */
  generationSource?: "llm" | "fallback" | "template";
}

export interface MiroFishRouteDecisionEntry extends MiroFishStreamEntryBase {
  kind: "route_decision";
  routeId: string;
  routeTitle: string;
  reason?: string;
  /** RouteSet 中该路线的位置：primary / alternative。 */
  routeKind?: "primary" | "alternative";
}

export type MiroFishCapabilityInvocationStatus =
  | "invoking"
  | "completed"
  | "failed";

export interface MiroFishCapabilityInvocationEntry
  extends MiroFishStreamEntryBase {
  kind: "capability_invocation";
  capabilityId: string;
  status: MiroFishCapabilityInvocationStatus;
}

export interface MiroFishArtifactCreatedEntry extends MiroFishStreamEntryBase {
  kind: "artifact_created";
  artifactId: string;
  /** BlueprintGenerationArtifactType 的字符串（不收紧 union 以容忍未来新增）。 */
  artifactType: string;
  title: string;
}

export interface MiroFishSystemNoteEntry extends MiroFishStreamEntryBase {
  kind: "system_note";
  message: string;
  /** 选填提示（warning 时通常带原因）。 */
  hint?: string;
}

export type MiroFishStreamEntry =
  | MiroFishReasoningEntry
  | MiroFishNodeCompletedEntry
  | MiroFishRouteDecisionEntry
  | MiroFishCapabilityInvocationEntry
  | MiroFishArtifactCreatedEntry
  | MiroFishSystemNoteEntry;
