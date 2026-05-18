/**
 * ReAct 阶段块组件。
 *
 * 对应 `.kiro/specs/autopilot-llm-react-loop-inline` Task 2.1。
 *
 * 左侧 2px 彩色竖条 + 阶段图标/标签 + 流式文本内容区域。
 * tool-selecting 阶段额外显示 ToolSelectionBadge（工具名称内联标签）。
 * 进入动画：framer-motion opacity 0→1, x: -4→0, duration 0.2。
 */

import { motion, useReducedMotion } from "framer-motion";
import type { FC } from "react";

import type { AppLocale } from "@/lib/locale";

import { PhaseIndicator } from "./PhaseIndicator";
import { StreamingText } from "./StreamingText";
import { PHASE_CONFIG, type ReActPhase } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReActPhaseBlockProps {
  /** ReAct 阶段数据 */
  phase: ReActPhase;
  /** 应用语言（预留，当前默认中文） */
  locale?: AppLocale;
}

// ---------------------------------------------------------------------------
// 子组件：ToolSelectionBadge
// ---------------------------------------------------------------------------

/**
 * 工具选择标签：内联展示所选工具名称。
 */
const ToolSelectionBadge: FC<{ toolName: string }> = ({ toolName }) => (
  <span className="inline-flex items-center bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] ml-1">
    {toolName}
  </span>
);

// ---------------------------------------------------------------------------
// 动画配置
// ---------------------------------------------------------------------------

const ENTER_VARIANTS = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0 },
};

const ENTER_TRANSITION = { duration: 0.2 };
const REDUCED_MOTION_TRANSITION = { duration: 0 };

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

/**
 * ReAct 阶段块。
 *
 * 每个阶段渲染为一个带左侧彩色竖条的紧凑块：
 * - 头部：PhaseIndicator（图标 + 标签）+ 可选 ToolSelectionBadge
 * - 内容：StreamingText（流式文本 + 光标 + 折叠）
 */
export const ReActPhaseBlock: FC<ReActPhaseBlockProps> = ({ phase }) => {
  const prefersReducedMotion = useReducedMotion();
  const config = PHASE_CONFIG[phase.type];

  return (
    <motion.div
      className={`border-l-2 ${config.borderColor} pl-2 py-1`}
      variants={ENTER_VARIANTS}
      initial="hidden"
      animate="visible"
      transition={
        prefersReducedMotion ? REDUCED_MOTION_TRANSITION : ENTER_TRANSITION
      }
    >
      {/* 头部：阶段指示器 + 工具标签 */}
      <div className="flex items-center gap-1 mb-0.5">
        <PhaseIndicator type={phase.type} />
        {phase.type === "tool-selecting" && phase.toolName && (
          <ToolSelectionBadge toolName={phase.toolName} />
        )}
      </div>

      {/* 内容区域：流式文本 */}
      <StreamingText content={phase.content} isStreaming={phase.isStreaming} />
    </motion.div>
  );
};
