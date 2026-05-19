/**
 * 能力 Bridge 运行时面板 — 主容器组件
 *
 * 组合 BridgeStatusSummary + BridgeInvocationTimeline，
 * 以紧凑时间线形式展示 Docker/MCP/AIGC 节点/Skill 的调用过程。
 *
 * - 容器：bg-white border border-slate-200 rounded-lg p-2
 * - 最大高度 240px，overflow-y-auto
 * - 无调用数据时返回 null（不渲染空面板）
 * - framer-motion 进入动画：opacity 0→1, duration 0.2
 * - prefers-reduced-motion 降级：动画 duration 设为 0
 *
 * 对应 spec：`.kiro/specs/autopilot-capability-bridge-runtime-panel/`
 * - 需求 1.1, 2.1
 */

import { motion, useReducedMotion } from "framer-motion";
import type { FC } from "react";

import type { AppLocale } from "@/lib/locale";

import { BridgeInvocationTimeline } from "./BridgeInvocationTimeline";
import { BridgeStatusSummary } from "./BridgeStatusSummary";
import { useCapabilityBridgeState } from "./useCapabilityBridgeState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CapabilityBridgePanelProps {
  /** 当前语言环境 */
  locale: AppLocale;
}

// ---------------------------------------------------------------------------
// 组件实现
// ---------------------------------------------------------------------------

/**
 * 能力 Bridge 运行时面板主容器。
 *
 * 内部调用 `useCapabilityBridgeState()` 获取调用数据，
 * 无调用时返回 null，有调用时以 motion.div 包裹实现进入动画。
 */
export const CapabilityBridgePanel: FC<CapabilityBridgePanelProps> = ({
  locale,
}) => {
  const { invocations, summary } = useCapabilityBridgeState();
  const shouldReduceMotion = useReducedMotion();

  // 无调用数据时不渲染
  if (invocations.length === 0) {
    return null;
  }

  /** 动画时长：prefers-reduced-motion 时设为 0 */
  const animationDuration = shouldReduceMotion ? 0 : 0.2;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: animationDuration }}
      className="bg-white border border-slate-200 rounded-lg p-2 max-h-[240px] overflow-y-auto"
    >
      <BridgeStatusSummary summary={summary} />
      <BridgeInvocationTimeline invocations={invocations} locale={locale} />
    </motion.div>
  );
};
