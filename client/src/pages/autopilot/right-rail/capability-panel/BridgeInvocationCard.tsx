/**
 * 能力 Bridge 调用卡片组件
 *
 * 单行紧凑布局展示一次能力 Bridge 调用的类型、名称、状态和耗时。
 * 根据 bridgeType 差异化显示图标和颜色，根据 status 显示不同状态徽章。
 *
 * 对应 spec：`.kiro/specs/autopilot-capability-bridge-runtime-panel/`
 * - 需求 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
 */

import type { FC } from "react";

import { cn } from "@/lib/utils";

import { BRIDGE_TYPE_CONFIG, type BridgeInvocation } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BridgeInvocationCardProps {
  /** 调用实例数据 */
  invocation: BridgeInvocation;
  /** 是否使用紧凑模式（默认 true） */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// 状态徽章样式映射
// ---------------------------------------------------------------------------

const STATUS_BADGE_STYLES: Record<BridgeInvocation["status"], string> = {
  pending: "bg-white/[0.08] text-white/50",
  running: "bg-blue-500/20 text-blue-300",
  completed: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300 border border-red-400/30",
  retrying: "bg-amber-500/20 text-amber-300",
};

/** 状态中文标签 */
const STATUS_LABELS: Record<BridgeInvocation["status"], string> = {
  pending: "等待",
  running: "运行中",
  completed: "完成",
  failed: "失败",
  retrying: "重试中",
};

// ---------------------------------------------------------------------------
// 组件实现
// ---------------------------------------------------------------------------

/**
 * 单条能力 Bridge 调用卡片。
 *
 * 布局：类型图标(12×12) + 名称 + 状态徽章 + 耗时
 * - running 态：图标 animate-spin
 * - failed 态：红色边框 + 错误摘要（最多 2 行）
 * - retrying 态：重试计数徽章
 */
export const BridgeInvocationCard: FC<BridgeInvocationCardProps> = ({
  invocation,
  compact = true,
}) => {
  const { bridgeType, name, status, durationMs, error, retryCount } =
    invocation;
  const typeConfig = BRIDGE_TYPE_CONFIG[bridgeType];

  const isRunning = status === "running";
  const isFailed = status === "failed";
  const isRetrying = status === "retrying";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-2 rounded",
        compact ? "py-1.5" : "py-2",
        isFailed && "border border-red-400/30 bg-red-500/10"
      )}
    >
      {/* 主行：图标 + 名称 + 状态徽章 + 耗时 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* 类型图标 */}
        <span
          className={cn(
            "flex-shrink-0 w-3 h-3 flex items-center justify-center text-[10px] leading-none rounded",
            typeConfig.color,
            isRunning && "animate-spin"
          )}
          title={typeConfig.label}
        >
          {typeConfig.icon}
        </span>

        {/* 调用名称 */}
        <span className="flex-1 min-w-0 truncate text-[11px] text-white/75 font-medium">
          {name}
        </span>

        {/* 重试计数徽章 */}
        {isRetrying && retryCount != null && retryCount > 0 && (
          <span className="flex-shrink-0 px-1 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300">
            ×{retryCount}
          </span>
        )}

        {/* 状态徽章 */}
        <span
          className={cn(
            "flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
            STATUS_BADGE_STYLES[status]
          )}
        >
          {STATUS_LABELS[status]}
        </span>

        {/* 耗时 */}
        {durationMs != null && (
          <span className="flex-shrink-0 text-[10px] font-mono text-white/40">
            {durationMs < 1000
              ? `${durationMs}ms`
              : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* 错误摘要（仅 failed 态，最多 2 行） */}
      {isFailed && error && (
        <p className="text-[10px] text-red-300 line-clamp-2 pl-[18px]">
          {error}
        </p>
      )}
    </div>
  );
};
