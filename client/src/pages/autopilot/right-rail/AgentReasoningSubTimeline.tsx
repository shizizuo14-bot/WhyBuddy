/**
 * autopilot-streaming-experience integration-gap-2026-05-16 — Agent 推理子时间线
 *
 * 历史背景：从 AutopilotRightRail.tsx 抽出来的可复用组件，消费
 * `useBlueprintRealtimeStore.agentReasoning.entries`，在多个挂载点（intake_created /
 * clarification / route / fabric stages）显示 thinking/acting/observing 双轨流。
 *
 * autopilot-mirofish-stream 重构（2026-05-17）：
 * - 把双轨布局升级为 MiroFish 单纵向卡片流（MiroFishCardStream）。
 * - 本组件保留为 thin wrapper，把 `locale` / `stageFilter` 透传给 MiroFishCardStream，
 *   让既有挂载点（AutopilotRightRail / AutopilotRoutePage 各阶段卡片底部）零改动
 *   获得新流式视觉。
 * - 新增能力：MiroFishCardStream 不仅承载 reasoning entries，还会合并 capability
 *   invocations / artifact creations / route decisions / node completions。要拿到
 *   完整流，挂载方应通过 props.job 把 latestJob 传下去（Wave 2 接入）。
 *
 * 设计原则与其它 store-observability 组件一致：
 * - 只读：不写 store，不订阅 socket
 * - 折叠态：可见 entry 计数为 0 时返回 null，避免空容器抢占布局
 * - 可在多个位置挂载：右栏 fabric 分支 + 跨阶段 HUD overlay 都是合法位置
 */

import { type FC } from "react";

import type { AppLocale } from "@/lib/locale";
import type { BlueprintGenerationJob } from "@shared/blueprint/contracts";

import { MiroFishCardStream } from "./mirofish-stream/MiroFishCardStream";

export interface AgentReasoningSubTimelineProps {
  locale?: AppLocale;
  /**
   * 当前活跃阶段标识。提供时仅显示 `entry.stageId === stageFilter` 的条目（或
   * 当 `stageFilter` 是数组时，`entry.stageId ∈ stageFilter`），让多阶段共享
   * 同一份 entries 时，每张 active 卡片只看到属于自身阶段的事件。不提供时
   * 显示全部条目（fabric 阶段的右栏 active 节点等场景沿用旧行为）。
   *
   * 数组形态用于 UI 上将多个后端 stage 合并为同一张卡片：例如前端把
   * "路线生成 + 路线选择 + spec_tree 派生" 合并为单一"路线"卡片，但后端
   * 仍保留 `route_generation` / `spec_tree` 等独立 stage 名，用于 capability /
   * agentCrew / events 投影；此时数组让前端 UI 合并视图与后端 stage 模型解耦。
   *
   * `autopilot-streaming-experience` integration-gap-2026-05-16。
   */
  stageFilter?: string | readonly string[];
  /**
   * 当前蓝图 job（可选）。当传入时 MiroFishCardStream 会从 job.artifacts 派生
   * route_decision / artifact_created / node_completed entry，与 reasoning /
   * capability_invocation 一同显示在统一流里。
   *
   * 不传时只显示来自 store slice 的 reasoning + capability_invocation entry，
   * 与本组件 wrapper 化前的行为保持兼容。
   */
  job?: BlueprintGenerationJob | null;
}

/**
 * 单纵向 MiroFish 卡片流。委托给 MiroFishCardStream 实现，外部 API 与历史一致。
 *
 * 注意：该组件 *不* 注入任何模拟事件。事件由
 * `server/routes/blueprint/stage-progress-emitter.ts`（route handler 直发）与
 * `server/routes/blueprint/agent-reasoning-bridge.ts`（Docker 容器 HMAC 回调）
 * 两条链路共同填充 `agentReasoning.entries`；空态由 store 决定。
 */
export const AgentReasoningSubTimeline: FC<AgentReasoningSubTimelineProps> = ({
  locale = "zh-CN",
  stageFilter,
  job,
}) => {
  return (
    <MiroFishCardStream locale={locale} stageFilter={stageFilter} job={job} />
  );
};

export default AgentReasoningSubTimeline;
