/**
 * 阶段指示器组件。
 *
 * 对应 `.kiro/specs/autopilot-llm-react-loop-inline` Task 2.2。
 *
 * 显示阶段图标 + 中文标签，text-[10px] font-medium，
 * 颜色从 PHASE_CONFIG 映射获取。
 */

import type { FC } from "react";

import { PHASE_CONFIG, type ReActPhaseType } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PhaseIndicatorProps {
  /** 阶段类型 */
  type: ReActPhaseType;
}

// ---------------------------------------------------------------------------
// 颜色映射：将 border-l-* 转为 text-* 用于指示器文字
// ---------------------------------------------------------------------------

const TEXT_COLOR_MAP: Record<ReActPhaseType, string> = {
  thinking: "text-violet-600",
  "tool-selecting": "text-amber-600",
  executing: "text-orange-600",
  observing: "text-teal-600",
  "next-step": "text-slate-500",
};

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

/**
 * 阶段指示器：图标 + 中文标签。
 *
 * 紧凑展示，用于 ReActPhaseBlock 头部。
 */
export const PhaseIndicator: FC<PhaseIndicatorProps> = ({ type }) => {
  const config = PHASE_CONFIG[type];
  const textColor = TEXT_COLOR_MAP[type];

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${textColor}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};
