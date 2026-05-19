/**
 * StreamInterruptionDetector 单元测试
 *
 * 验证中断检测器的核心行为：
 * - 500ms 无 token → isInterrupted = true
 * - 10s 无 token → isReconnecting = true
 * - token 恢复 → 清除中断状态
 * - reset() 重置所有状态
 */

import { describe, expect, it } from "vitest";

import { StreamInterruptionDetector } from "./StreamInterruptionDetector";

describe("StreamInterruptionDetector", () => {
  it("初始状态下 check 返回未中断", () => {
    const detector = new StreamInterruptionDetector();
    const state = detector.check(Date.now());

    expect(state.isInterrupted).toBe(false);
    expect(state.isReconnecting).toBe(false);
    expect(state.duration).toBe(0);
  });

  it("收到 token 后短时间内 check 返回未中断", () => {
    const detector = new StreamInterruptionDetector();
    const now = 1000;

    detector.onTokenReceived(now);
    const state = detector.check(now + 100); // 100ms 后

    expect(state.isInterrupted).toBe(false);
    expect(state.isReconnecting).toBe(false);
    expect(state.duration).toBe(0);
  });

  it("500ms 无 token 触发 isInterrupted", () => {
    const detector = new StreamInterruptionDetector();
    const now = 1000;

    detector.onTokenReceived(now);
    const state = detector.check(now + 500); // 恰好 500ms

    expect(state.isInterrupted).toBe(true);
    expect(state.isReconnecting).toBe(false);
    expect(state.duration).toBe(500);
  });

  it("10s 无 token 触发 isReconnecting", () => {
    const detector = new StreamInterruptionDetector();
    const now = 1000;

    detector.onTokenReceived(now);
    const state = detector.check(now + 10000); // 10s

    expect(state.isInterrupted).toBe(true);
    expect(state.isReconnecting).toBe(true);
    expect(state.duration).toBe(10000);
  });

  it("token 恢复后清除中断状态", () => {
    const detector = new StreamInterruptionDetector();
    const now = 1000;

    // 先触发中断
    detector.onTokenReceived(now);
    const interrupted = detector.check(now + 600);
    expect(interrupted.isInterrupted).toBe(true);

    // token 恢复
    detector.onTokenReceived(now + 600);
    const recovered = detector.check(now + 650);

    expect(recovered.isInterrupted).toBe(false);
    expect(recovered.isReconnecting).toBe(false);
    expect(recovered.duration).toBe(0);
  });

  it("reset() 重置所有状态", () => {
    const detector = new StreamInterruptionDetector();
    const now = 1000;

    detector.onTokenReceived(now);
    detector.check(now + 600); // 触发中断

    detector.reset();
    const state = detector.check(now + 1000);

    // reset 后 lastTokenAt 为 0，视为未开始
    expect(state.isInterrupted).toBe(false);
    expect(state.isReconnecting).toBe(false);
    expect(state.duration).toBe(0);
  });

  it("支持自定义阈值配置", () => {
    const detector = new StreamInterruptionDetector({
      warningThresholdMs: 200,
      reconnectThresholdMs: 5000,
    });
    const now = 1000;

    detector.onTokenReceived(now);

    // 200ms 触发中断
    const state200 = detector.check(now + 200);
    expect(state200.isInterrupted).toBe(true);
    expect(state200.isReconnecting).toBe(false);

    // 5000ms 触发重连
    const state5000 = detector.check(now + 5000);
    expect(state5000.isInterrupted).toBe(true);
    expect(state5000.isReconnecting).toBe(true);
  });
});
