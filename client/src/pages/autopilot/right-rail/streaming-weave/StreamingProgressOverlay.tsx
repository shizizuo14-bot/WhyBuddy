/**
 * 流式进度叠加层组件
 *
 * 叠加在 StageProgressIndicator 上方，根据流式状态展示不同视觉反馈：
 * - 正常流式：蓝色渐变脉冲动画
 * - 中断态：琥珀色背景 + 警告图标 + "连接中断" 文案
 * - 重连态：红色背景 + 旋转图标 + "重新连接中" 文案
 *
 * 设计约束：
 * - text-[10px]，light theme 配色
 * - 使用 Tailwind CSS 工具类
 * - 不引入 @testing-library/react
 *
 * 对应 spec：`.kiro/specs/autopilot-streaming-lifecycle-weave/`
 * - 需求 1.1：流式进行中显示进度动画
 * - 需求 1.4：暂停超过 3s 切换为不确定态
 * - 需求 3.1：500ms 后显示"连接中断"提示
 * - 需求 3.3：10s 后显示"重新连接中"状态
 */

import React from "react";

// ---------------------------------------------------------------------------
// Props 接口
// ---------------------------------------------------------------------------

/**
 * StreamingProgressOverlay 组件属性。
 */
export interface StreamingProgressOverlayProps {
  /** 是否正在接收流式 token */
  isStreaming: boolean;
  /** 是否处于中断状态（500ms 无 token） */
  isInterrupted: boolean;
  /** 是否处于重连状态（10s 无 token） */
  isReconnecting: boolean;
  /** 当前流式进度（0-100） */
  progress: number;
}

// ---------------------------------------------------------------------------
// 子组件：警告图标
// ---------------------------------------------------------------------------

/**
 * 警告三角图标（中断态使用）。
 */
function WarningIcon() {
  return (
    <svg
      className="w-3 h-3 text-amber-600 flex-shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 1L15 14H1L8 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 子组件：旋转图标
// ---------------------------------------------------------------------------

/**
 * 旋转加载图标（重连态使用）。
 */
function SpinnerIcon() {
  return (
    <svg
      className="w-3 h-3 text-red-600 flex-shrink-0 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="28"
        strokeDashoffset="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

/**
 * 流式进度叠加层。
 *
 * 根据 `isStreaming`、`isInterrupted`、`isReconnecting` 三个状态
 * 展示不同的视觉反馈。不流式时不渲染任何内容。
 */
export const StreamingProgressOverlay: React.FC<StreamingProgressOverlayProps> =
  React.memo(function StreamingProgressOverlay({
    isStreaming,
    isInterrupted,
    isReconnecting,
    progress,
  }) {
    // 非流式状态不渲染
    if (!isStreaming && !isInterrupted && !isReconnecting) {
      return null;
    }

    // 重连态：红色背景 + 旋转图标 + "重新连接中"
    if (isReconnecting) {
      return (
        <div
          className="absolute inset-x-0 top-0 flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded text-[10px] text-red-600"
          role="status"
          aria-live="polite"
        >
          <SpinnerIcon />
          <span>重新连接中</span>
        </div>
      );
    }

    // 中断态：琥珀色背景 + 警告图标 + "连接中断"
    if (isInterrupted) {
      return (
        <div
          className="absolute inset-x-0 top-0 flex items-center gap-1 px-2 py-0.5 bg-amber-50 rounded text-[10px] text-amber-600"
          role="status"
          aria-live="polite"
        >
          <WarningIcon />
          <span>连接中断</span>
        </div>
      );
    }

    // 正常流式：蓝色渐变脉冲动画 + 进度条
    return (
      <div className="absolute inset-x-0 top-0 overflow-hidden rounded">
        {/* 脉冲背景动画 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-transparent animate-pulse" />
        {/* 进度条 */}
        <div
          className="relative h-0.5 bg-blue-500/40 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="流式输出进度"
        />
      </div>
    );
  });
