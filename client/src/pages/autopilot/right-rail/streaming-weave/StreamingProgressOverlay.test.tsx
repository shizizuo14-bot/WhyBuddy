/**
 * StreamingProgressOverlay SSR 渲染测试
 *
 * 使用 react-dom/server 的 renderToString 验证组件在不同状态下的渲染。
 * 不引入 @testing-library/react。
 *
 * 验证：
 * - 非流式状态不渲染内容
 * - 正常流式状态渲染蓝色脉冲动画
 * - 中断态渲染琥珀色背景 + "连接中断"
 * - 重连态渲染红色背景 + "重新连接中"
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StreamingProgressOverlay } from "./StreamingProgressOverlay";

describe("StreamingProgressOverlay", () => {
  it("非流式状态不渲染任何内容", () => {
    const html = renderToString(
      React.createElement(StreamingProgressOverlay, {
        isStreaming: false,
        isInterrupted: false,
        isReconnecting: false,
        progress: 0,
      })
    );

    expect(html).toBe("");
  });

  it("正常流式状态渲染蓝色渐变脉冲", () => {
    const html = renderToString(
      React.createElement(StreamingProgressOverlay, {
        isStreaming: true,
        isInterrupted: false,
        isReconnecting: false,
        progress: 50,
      })
    );

    expect(html).toContain("bg-gradient-to-r");
    expect(html).toContain("from-blue-500/20");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("progressbar");
    expect(html).toContain("50%");
  });

  it("中断态渲染琥珀色背景和警告文案", () => {
    const html = renderToString(
      React.createElement(StreamingProgressOverlay, {
        isStreaming: true,
        isInterrupted: true,
        isReconnecting: false,
        progress: 30,
      })
    );

    expect(html).toContain("bg-amber-50");
    expect(html).toContain("text-amber-600");
    expect(html).toContain("连接中断");
  });

  it("重连态渲染红色背景和重连文案", () => {
    const html = renderToString(
      React.createElement(StreamingProgressOverlay, {
        isStreaming: true,
        isInterrupted: true,
        isReconnecting: true,
        progress: 30,
      })
    );

    expect(html).toContain("bg-red-50");
    expect(html).toContain("text-red-600");
    expect(html).toContain("重新连接中");
    expect(html).toContain("animate-spin");
  });

  it("重连态优先于中断态展示", () => {
    const html = renderToString(
      React.createElement(StreamingProgressOverlay, {
        isStreaming: true,
        isInterrupted: true,
        isReconnecting: true,
        progress: 30,
      })
    );

    // 重连态应展示红色，不应展示琥珀色
    expect(html).toContain("bg-red-50");
    expect(html).not.toContain("bg-amber-50");
    expect(html).toContain("重新连接中");
    expect(html).not.toContain("连接中断");
  });

  it("进度条宽度不超过 100%", () => {
    const html = renderToString(
      React.createElement(StreamingProgressOverlay, {
        isStreaming: true,
        isInterrupted: false,
        isReconnecting: false,
        progress: 150,
      })
    );

    expect(html).toContain("100%");
    expect(html).not.toContain("150%");
  });
});
