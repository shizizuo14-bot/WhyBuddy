/**
 * 流式 Token 追加 Hook — useStreamingTokenAppend
 *
 * 订阅 `useStreamingWeave` 的 token 分发，将 token 累积为字符串，
 * 通过 useRef 避免每次 token 到达触发消费组件 re-render。
 *
 * 主要用于 AgentReasoningSubTimeline 的当前条目实时追加，
 * 也可用于任何需要流式文本追加的消费端。
 *
 * 使用方式：
 * ```ts
 * const { textRef, text, reset } = useStreamingTokenAppend(subscribe);
 * // textRef.current 始终包含最新累积文本（不触发 re-render）
 * // text 是 state 版本（触发 re-render，适合需要响应式展示的场景）
 * ```
 *
 * 对应 spec：`.kiro/specs/autopilot-streaming-lifecycle-weave/`
 * - 需求 2.2：实时追加 token 到 AgentReasoningSubTimeline 当前条目
 * - 需求 4.3：使用共享 ref 避免重复 re-render
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { StreamTokenCallback, Unsubscribe } from "./types";

// ---------------------------------------------------------------------------
// 返回值接口
// ---------------------------------------------------------------------------

/**
 * useStreamingTokenAppend 返回值。
 */
export interface StreamingTokenAppendReturn {
  /**
   * 累积文本的 ref 引用（不触发 re-render）。
   *
   * 适合通过 DOM 操作直接更新文本节点的场景。
   */
  textRef: React.RefObject<string>;
  /**
   * 累积文本的 state 版本（触发 re-render）。
   *
   * 适合需要响应式展示的场景。注意：高频 token 场景下建议优先使用 textRef。
   */
  text: string;
  /**
   * 重置累积文本。
   *
   * 在阶段切换或流式结束时调用，清空已累积的 token。
   */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook 实现
// ---------------------------------------------------------------------------

/**
 * 流式 Token 追加 Hook。
 *
 * 订阅流式协调层的 token 分发，将 token 累积为字符串。
 * 提供 ref 版本（零 re-render）和 state 版本（响应式）两种消费方式。
 *
 * @param subscribe - 来自 useStreamingWeave 的 subscribe 函数
 * @param consumerId - 消费端唯一标识，默认 "reasoning-timeline"
 * @returns StreamingTokenAppendReturn
 */
export function useStreamingTokenAppend(
  subscribe: (consumerId: string, callback: StreamTokenCallback) => Unsubscribe,
  consumerId: string = "reasoning-timeline"
): StreamingTokenAppendReturn {
  const [text, setText] = useState("");
  const textRef = useRef<string>("");

  // 重置函数
  const reset = useCallback(() => {
    textRef.current = "";
    setText("");
  }, []);

  // 订阅 token 分发
  useEffect(() => {
    const unsubscribe = subscribe(consumerId, (tokens: string[]) => {
      const joined = tokens.join("");
      textRef.current += joined;
      setText(textRef.current);
    });

    return unsubscribe;
  }, [subscribe, consumerId]);

  return { textRef, text, reset };
}
