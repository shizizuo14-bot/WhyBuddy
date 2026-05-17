/**
 * autopilot-mirofish-stream / Wave 0 — 主流组件
 *
 * 替代既有 AgentReasoningSubTimeline 的双轨布局,改为单纵向卡片流。
 * 阶段卡片底部挂载点保持 stageFilter prop 兼容,内部派生 6 类 entry。
 *
 * 数据来源（多路 store slice 合并 + job artifacts 派生）：
 * - useBlueprintRealtimeStore.agentReasoning.entries → reasoning entries
 * - useBlueprintRealtimeStore.capabilityStatuses + agentReasoning acting 反查
 *   timestamp → capability_invocation entries
 * - latestJob.artifacts → artifact_created entries
 * - extractRouteSelection(latestJob) → route_decision entry
 * - extractSpecTree(latestJob) + deriveSpecDocumentTreeStats → node_completed entries
 *
 * 设计原则：
 * - 只读：不写 store,不订阅 socket（订阅由 AutopilotRoutePage 完成）
 * - 折叠态：visibleEntries.length === 0 时返回 null,避免空容器抢占布局
 * - 自动 scroll：有新条目时滚到底部,与 AgentReasoningSubTimeline 行为一致
 * - 受 stageFilter 过滤,缺失 stageId 视为全局事件继续显示
 */

import { useEffect, useMemo, useRef, type FC } from "react";

import { useBlueprintRealtimeStore } from "@/lib/blueprint-realtime-store";
import {
  deriveSpecDocumentTreeStats,
  type SpecDocumentTreeStats,
} from "@/lib/blueprint-spec-document-stats";
import type { AppLocale } from "@/lib/locale";

import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintRouteSelection,
  BlueprintRouteSet,
  BlueprintSpecTree,
} from "@shared/blueprint/contracts";

import {
  ArtifactCreatedCard,
  CapabilityInvocationCard,
  NodeCompletedCard,
  ReasoningCard,
  RouteDecisionCard,
  SystemNoteCard,
} from "./cards";
import { deriveMiroFishStreamEntries } from "./derive-mirofish-stream-entries";
import type {
  MiroFishStreamEntry,
} from "./mirofish-stream-types";

// ─── helpers：从 latestJob 派生 routeSet / routeSelection / specTree ─────

function readArtifactPayload<T>(
  job: BlueprintGenerationJob | null | undefined,
  type: BlueprintGenerationArtifact["type"]
): T | null {
  const artifact = job?.artifacts.find(a => a.type === type);
  if (!artifact || artifact.payload === undefined) return null;
  return artifact.payload as T;
}

// ─── 组件 props ──────────────────────────────────────────────────────────

export interface MiroFishCardStreamProps {
  locale?: AppLocale;
  /**
   * 阶段过滤；与既有 AgentReasoningSubTimeline 同语义。
   *
   * - string："route_generation" 等单一阶段,只显示该阶段的 entry
   * - readonly string[]：多个阶段合并显示（合并视图,如 "route" 卡片承接
   *   route_generation / route_selection / spec_tree 三段事件）
   * - undefined：显示所有 entry（含缺失 stageId 的）
   */
  stageFilter?: string | readonly string[];
  /**
   * 当前蓝图 job。组件需要从 job.artifacts 派生 routeSelection / routeSet /
   * specTree / artifacts。父级（AutopilotRightRail）从 props.job 传入。
   *
   * 缺失（null / undefined）时只渲染来自 store slice 的 reasoning + capability。
   */
  job?: BlueprintGenerationJob | null;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

export const MiroFishCardStream: FC<MiroFishCardStreamProps> = ({
  locale: _locale = "zh-CN",
  stageFilter,
  job,
}) => {
  const agentReasoning = useBlueprintRealtimeStore(
    s => s.agentReasoning.entries
  );
  const capabilityStatuses = useBlueprintRealtimeStore(
    s => s.capabilityStatuses
  );

  // 从 latestJob.artifacts 派生 routeSet / routeSelection / specTree / artifacts
  const routeSelection = useMemo(
    () => readArtifactPayload<BlueprintRouteSelection>(job, "route_selection"),
    [job]
  );
  const routeSet = useMemo(
    () => readArtifactPayload<BlueprintRouteSet>(job, "route_set"),
    [job]
  );
  const specTree = useMemo(
    () => readArtifactPayload<BlueprintSpecTree>(job, "spec_tree"),
    [job]
  );
  const artifacts = useMemo(
    () => job?.artifacts ?? [],
    [job]
  );
  const specDocumentTreeStats = useMemo<SpecDocumentTreeStats | null>(
    () =>
      job && specTree
        ? deriveSpecDocumentTreeStats(job, specTree)
        : null,
    [job, specTree]
  );

  // 派生流式 entries
  const allEntries = useMemo(
    () =>
      deriveMiroFishStreamEntries({
        agentReasoning,
        capabilityStatuses,
        artifacts,
        routeSelection,
        routeSet,
        specTree,
        specDocumentTreeStats,
      }),
    [
      agentReasoning,
      capabilityStatuses,
      artifacts,
      routeSelection,
      routeSet,
      specTree,
      specDocumentTreeStats,
    ]
  );

  // stageFilter 归一化为 Set
  const filterSet = useMemo(
    () =>
      stageFilter === undefined
        ? undefined
        : new Set(
            typeof stageFilter === "string" ? [stageFilter] : stageFilter
          ),
    [stageFilter]
  );

  const visibleEntries = useMemo(
    () =>
      allEntries.filter(e => {
        if (filterSet && e.stageId && !filterSet.has(e.stageId)) return false;
        return true;
      }),
    [allEntries, filterSet]
  );

  // 自动 scroll 到底部跟踪最新条目
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [visibleEntries.length]);

  if (visibleEntries.length === 0) return null;

  return (
    <div
      data-testid="mirofish-card-stream"
      className="mt-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3"
    >
      {visibleEntries.map(entry => (
        <MiroFishCard key={entry.id} entry={entry} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

// ─── 分发组件 ─────────────────────────────────────────────────────────────

const MiroFishCard: FC<{ entry: MiroFishStreamEntry }> = ({ entry }) => {
  switch (entry.kind) {
    case "reasoning":
      return <ReasoningCard entry={entry} />;
    case "node_completed":
      return <NodeCompletedCard entry={entry} />;
    case "route_decision":
      return <RouteDecisionCard entry={entry} />;
    case "capability_invocation":
      return <CapabilityInvocationCard entry={entry} />;
    case "artifact_created":
      return <ArtifactCreatedCard entry={entry} />;
    case "system_note":
      return <SystemNoteCard entry={entry} />;
  }
};

export default MiroFishCardStream;
