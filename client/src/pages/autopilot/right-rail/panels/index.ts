/**
 * Autopilot 驾驶舱右栏收敛 — canonical panels barrel
 *
 * 对应 spec：`.kiro/specs/autopilot-right-rail-stage-panels/`
 * - 需求 1.2（barrel 统一 re-export 8 个组件与 props 类型）
 * - 需求 1.3（named export，不引入 default / index.tsx 混用）
 * - 需求 8.1–8.3（canonical panels 单向依赖守卫）
 *
 * 每接入一个新面板都在此 re-export；当前阶段只有 `AgentCrewFabricPanel` 进入。
 */

export { AgentCrewFabricPanel } from "./AgentCrewFabricPanel";
export type {
  AgentCrewFabricPanelProps,
  BlueprintRoleEventProjection,
  BlueprintRoleEventProjectionItem,
  BlueprintRoleEventConsumerId,
} from "./AgentCrewFabricPanel";
