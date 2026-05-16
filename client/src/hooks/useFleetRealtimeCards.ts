/**
 * useFleetRealtimeCards hook。
 *
 * 合并 TaskAutopilotPanel 的静态 Fleet 投影数据与 BlueprintRealtimeStore 的实时状态，
 * 实现增量更新：只更新变化的卡片，不全量替换。
 *
 * 对应 `.kiro/specs/autopilot-realtime-observation-bridge` Task 4。
 */

import { useMemo } from "react";
import {
  useBlueprintRealtimeStore,
  type RolePhase,
} from "@/lib/blueprint-realtime-store";
import type { AutopilotFleetRoleCard } from "@/components/tasks/AutopilotFleetLiveView";

/**
 * 将 RolePhase 映射到 Fleet 卡片的 status 字段。
 */
function mapPhaseToFleetStatus(
  phase: RolePhase
): AutopilotFleetRoleCard["status"] {
  switch (phase) {
    case "acting":
    case "thinking":
    case "activated":
      return "running";
    case "observing":
    case "reviewing":
      return "waiting";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "sleeping":
    case "idle":
    default:
      return "idle";
  }
}

/**
 * 合并静态投影与实时 store 数据，优先使用实时数据、fallback 到静态投影。
 * 增量更新逻辑：只更新变化的卡片。
 *
 * @param staticCards - 来自 TaskAutopilotPanel 的静态 Fleet 卡片数据
 * @returns 合并后的 Fleet 卡片列表
 */
export function useFleetRealtimeCards(
  staticCards: AutopilotFleetRoleCard[] | undefined
): AutopilotFleetRoleCard[] {
  const rolePhases = useBlueprintRealtimeStore(state => state.rolePhases);
  const connectionState = useBlueprintRealtimeStore(
    state => state.connectionState
  );

  return useMemo(() => {
    // 如果没有静态卡片，返回空数组
    if (!staticCards || staticCards.length === 0) return [];

    // 如果未连接或没有实时数据，直接返回静态卡片
    if (
      connectionState !== "connected" ||
      Object.keys(rolePhases).length === 0
    ) {
      return staticCards;
    }

    // 增量合并：只更新有实时数据的卡片
    return staticCards.map(card => {
      const phase = rolePhases[card.id] as RolePhase | undefined;
      if (!phase) return card;

      const realtimeStatus = mapPhaseToFleetStatus(phase);

      // 只在状态真正变化时创建新对象（增量更新）
      if (card.status === realtimeStatus) return card;

      return {
        ...card,
        status: realtimeStatus,
        currentAction: phase,
      };
    });
  }, [staticCards, rolePhases, connectionState]);
}
