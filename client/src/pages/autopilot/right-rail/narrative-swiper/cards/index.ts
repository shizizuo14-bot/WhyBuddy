/**
 * Autopilot 右栏底部叙事 Swiper — 子卡片 barrel 导出
 *
 * 本文件统一导出 narrative-swiper 专属的两个新子卡片：
 * - `RoleStatusCard`：渲染头像 + 角色名 + 阶段标签
 * - `FleetActivationCard`：渲染激活 chip + 动作摘要
 *
 * 既有 mirofish-stream/cards/* 子卡片由 NarrativeCard 分发器直接从
 * `../../mirofish-stream/cards` 导入，不在此处重复导出。
 */

export { RoleStatusCard } from "./RoleStatusCard";
export type { RoleStatusCardProps } from "./RoleStatusCard";

export { FleetActivationCard } from "./FleetActivationCard";
export type { FleetActivationCardProps } from "./FleetActivationCard";
