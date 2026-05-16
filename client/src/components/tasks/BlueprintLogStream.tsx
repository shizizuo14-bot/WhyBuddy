/**
 * Blueprint 日志流式面板。
 *
 * 接入 `BlueprintRealtimeStore.logEntries`，实现流式追加渲染。
 * 新条目出现时自动滚动到底部（除非用户手动滚动到非底部位置）。
 *
 * 对应 `.kiro/specs/autopilot-realtime-observation-bridge` Task 5。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBlueprintRealtimeStore,
  type BlueprintLogEntry,
} from "@/lib/blueprint-realtime-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 格式化时间戳为 HH:mm:ss.SSS。
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * 日志级别对应的样式。
 */
function levelClass(level: BlueprintLogEntry["level"]): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "debug":
      return "text-slate-400";
    case "info":
    default:
      return "text-sky-300";
  }
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export interface BlueprintLogStreamProps {
  /** 额外 className */
  className?: string;
  /** 最大显示条数（默认 100） */
  maxVisible?: number;
}

/**
 * Blueprint 日志流式追加面板。
 *
 * - 接入 `BlueprintRealtimeStore.logEntries`
 * - 自动滚动到底部（用户手动滚动时暂停自动滚动）
 */
export function BlueprintLogStream({
  className,
  maxVisible = 100,
}: BlueprintLogStreamProps) {
  const logEntries = useBlueprintRealtimeStore(state => state.logEntries);
  const connectionState = useBlueprintRealtimeStore(
    state => state.connectionState
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevLengthRef = useRef(0);

  // 检测用户是否手动滚动到非底部位置
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    setAutoScroll(isAtBottom);
  }, []);

  // 新条目出现时自动滚动到底部
  useEffect(() => {
    if (!autoScroll) return;
    if (logEntries.length <= prevLengthRef.current) {
      prevLengthRef.current = logEntries.length;
      return;
    }
    prevLengthRef.current = logEntries.length;

    const el = containerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [logEntries.length, autoScroll]);

  const visibleEntries = logEntries.slice(-maxVisible);

  if (connectionState === "disconnected" && logEntries.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "overflow-y-auto rounded-lg bg-slate-900/90 p-2 font-mono text-[11px] leading-relaxed",
        className
      )}
    >
      {visibleEntries.length === 0 ? (
        <div className="py-2 text-center text-slate-500 text-xs">
          {connectionState === "connecting"
            ? "Connecting..."
            : "Waiting for events..."}
        </div>
      ) : (
        visibleEntries.map(entry => (
          <LogEntryRow key={entry.id} entry={entry} />
        ))
      )}
      {!autoScroll && logEntries.length > 0 && (
        <button
          type="button"
          className="sticky bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-sky-600/80 px-2 py-0.5 text-[10px] text-white shadow-md hover:bg-sky-500"
          onClick={() => {
            setAutoScroll(true);
            const el = containerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
}

function LogEntryRow({ entry }: { entry: BlueprintLogEntry }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="shrink-0 text-slate-500">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span className={cn("shrink-0 w-10 uppercase", levelClass(entry.level))}>
        {entry.level}
      </span>
      <span className="shrink-0 text-violet-300">[{entry.source}]</span>
      <span className="text-slate-200 break-all">{entry.message}</span>
    </div>
  );
}

export default BlueprintLogStream;
