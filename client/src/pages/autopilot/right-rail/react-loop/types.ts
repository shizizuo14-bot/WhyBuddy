/**
 * ReAct 循环内联展示 — 类型定义与阶段视觉配置。
 *
 * 对应 `.kiro/specs/autopilot-llm-react-loop-inline` Task 1.2。
 *
 * 定义 ReActPhase / ReActLoop / UseReActLoopStateReturn 接口，
 * 以及 PHASE_CONFIG 阶段视觉配置常量。
 */

// ---------------------------------------------------------------------------
// 阶段类型
// ---------------------------------------------------------------------------

/** ReAct 循环中的阶段类型 */
export type ReActPhaseType =
  | "thinking"
  | "tool-selecting"
  | "executing"
  | "observing"
  | "next-step";

// ---------------------------------------------------------------------------
// 核心接口
// ---------------------------------------------------------------------------

/**
 * 单个 ReAct 阶段对象。
 *
 * 由 `useReActLoopState` 从 `agentReasoning.entries` 解析而来，
 * 每个 entry 映射为一个或多个 ReActPhase。
 */
export interface ReActPhase {
  /** 唯一标识，格式为 `${entryId}:${type}` */
  id: string;
  /** 阶段类型 */
  type: ReActPhaseType;
  /** 阶段文本内容 */
  content: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 工具名称（仅 tool-selecting / executing 阶段） */
  toolName?: string;
  /** 所属循环索引（从 0 开始） */
  loopIndex: number;
  /** 时间戳（毫秒） */
  timestamp: number;
}

/**
 * 一次完整的 ReAct 循环（thinking → tool-selecting → executing → observing → next-step）。
 */
export interface ReActLoop {
  /** 循环索引（从 0 开始） */
  index: number;
  /** 该循环包含的所有阶段 */
  phases: ReActPhase[];
  /** 该循环是否已完成 */
  isComplete: boolean;
}

/**
 * `useReActLoopState` hook 的返回值类型。
 */
export interface UseReActLoopStateReturn {
  /** 所有已解析的循环 */
  loops: ReActLoop[];
  /** 当前正在流式输出的阶段（如果有） */
  currentPhase: ReActPhase | null;
  /** 是否有任何阶段正在流式输出 */
  isStreaming: boolean;
  /** 循环总数 */
  totalLoops: number;
}

// ---------------------------------------------------------------------------
// 阶段视觉配置
// ---------------------------------------------------------------------------

/**
 * 各阶段的视觉配置：左侧竖条颜色、图标、中文标签。
 *
 * 颜色使用 Tailwind border-l-* 工具类，与 light theme slate 色系搭配。
 */
export const PHASE_CONFIG: Record<
  ReActPhaseType,
  { borderColor: string; icon: string; label: string }
> = {
  thinking: { borderColor: "border-l-violet-500", icon: "💭", label: "思考" },
  "tool-selecting": {
    borderColor: "border-l-amber-500",
    icon: "🔍",
    label: "选工具",
  },
  executing: {
    borderColor: "border-l-orange-500",
    icon: "⚙️",
    label: "执行",
  },
  observing: { borderColor: "border-l-teal-500", icon: "👁", label: "观察" },
  "next-step": {
    borderColor: "border-l-slate-400",
    icon: "→",
    label: "下一步",
  },
};
