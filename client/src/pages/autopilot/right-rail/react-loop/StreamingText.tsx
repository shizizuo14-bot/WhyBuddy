/**
 * 流式文本展示组件。
 *
 * 对应 `.kiro/specs/autopilot-llm-react-loop-inline` Task 3.1。
 *
 * 显示文本内容（逐字或完整展示），流式输出时末尾显示闪烁光标，
 * 超过 maxLines 行时折叠并提供"展开"按钮。
 *
 * 样式：text-[11px] font-mono text-slate-700 leading-relaxed
 * 光标：使用全局 CSS `.animate-react-cursor-blink`
 */

import { useState, type FC } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StreamingTextProps {
  /** 文本内容 */
  content: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 最大显示行数，超出后折叠（默认 4） */
  maxLines?: number;
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

/**
 * 流式文本展示。
 *
 * - `isStreaming` 为 true 时，末尾追加闪烁光标
 * - 文本超过 `maxLines` 行时折叠，显示"展开"按钮
 * - `prefers-reduced-motion` 下光标降级为静态 `|`（由 CSS 控制动画取消）
 */
export const StreamingText: FC<StreamingTextProps> = ({
  content,
  isStreaming,
  maxLines = 4,
}) => {
  const [expanded, setExpanded] = useState(false);

  // 判断是否需要折叠
  const lines = content.split("\n");
  const shouldCollapse = !expanded && lines.length > maxLines;
  const displayText = shouldCollapse
    ? lines.slice(0, maxLines).join("\n")
    : content;

  return (
    <div className="text-[11px] font-mono text-slate-700 leading-relaxed">
      {/* 文本内容 */}
      <span className="whitespace-pre-wrap break-words">{displayText}</span>

      {/* 流式光标 */}
      {isStreaming && (
        <span
          className="animate-react-cursor-blink inline-block ml-px w-[1px] h-[13px] bg-slate-700 align-middle"
          aria-hidden="true"
        />
      )}

      {/* 折叠时的省略与展开按钮 */}
      {shouldCollapse && (
        <span className="block mt-0.5">
          <button
            type="button"
            className="text-[10px] text-blue-600 hover:text-blue-700 cursor-pointer"
            onClick={() => setExpanded(true)}
          >
            展开
          </button>
        </span>
      )}
    </div>
  );
};
