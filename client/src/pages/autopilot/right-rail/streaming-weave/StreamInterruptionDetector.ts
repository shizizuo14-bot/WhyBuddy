/**
 * 流中断检测器
 *
 * 纯 class 实现，不依赖 React。负责监测流式 token 到达间隔，
 * 判定当前是否处于中断或重连状态。
 *
 * 核心行为：
 * - `check(now)` 根据当前时间与 lastTokenAt 的差值判定中断状态
 * - `onTokenReceived(now)` 记录最新 token 到达时间并清除中断状态
 * - `reset()` 重置所有内部状态
 *
 * 阈值：
 * - 500ms 无 token → isInterrupted = true
 * - 10s 无 token → isReconnecting = true
 * - token 恢复 → 清除中断状态
 *
 * 对应 spec：`.kiro/specs/autopilot-streaming-lifecycle-weave/`
 * - 需求 3.1：500ms 后显示"连接中断"提示
 * - 需求 3.2：恢复后移除中断提示
 * - 需求 3.3：10s 后显示"重新连接中"状态
 */

import type { InterruptionConfig } from "./types";

// ---------------------------------------------------------------------------
// 中断状态接口
// ---------------------------------------------------------------------------

/**
 * 中断检测结果。
 *
 * 由 `check()` 方法返回，描述当前流的中断状态。
 */
export interface InterruptionState {
  /** 是否处于中断状态（500ms 无 token） */
  isInterrupted: boolean;
  /** 是否处于重连状态（10s 无 token） */
  isReconnecting: boolean;
  /** 中断持续时长（ms），未中断时为 0 */
  duration: number;
}

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

/** 默认中断检测配置 */
const DEFAULT_CONFIG: InterruptionConfig = {
  warningThresholdMs: 500,
  reconnectThresholdMs: 10000,
  maxRetries: 3,
};

// ---------------------------------------------------------------------------
// 类实现
// ---------------------------------------------------------------------------

/**
 * 流中断检测器。
 *
 * 设计为纯数据结构 + 判定逻辑，不包含定时器。
 * 外层通过定期调用 `check(now)` 驱动状态更新。
 */
export class StreamInterruptionDetector {
  /** 最后一次收到 token 的时间戳（ms） */
  private lastTokenAt = 0;

  /** 当前是否处于中断状态 */
  private interrupted = false;

  /** 当前是否处于重连状态 */
  private reconnecting = false;

  /** 配置 */
  private readonly config: InterruptionConfig;

  constructor(config?: Partial<InterruptionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 检查当前中断状态。
   *
   * 根据 `now` 与 `lastTokenAt` 的差值判定是否中断或重连。
   * 若尚未收到任何 token（lastTokenAt === 0），视为未中断。
   *
   * @param now - 当前时间戳（ms），通常为 Date.now()
   * @returns 当前中断状态
   */
  check(now: number): InterruptionState {
    // 尚未开始接收 token，不视为中断
    if (this.lastTokenAt === 0) {
      return { isInterrupted: false, isReconnecting: false, duration: 0 };
    }

    const elapsed = now - this.lastTokenAt;

    if (elapsed >= this.config.reconnectThresholdMs) {
      this.interrupted = true;
      this.reconnecting = true;
    } else if (elapsed >= this.config.warningThresholdMs) {
      this.interrupted = true;
      this.reconnecting = false;
    } else {
      this.interrupted = false;
      this.reconnecting = false;
    }

    const duration = this.interrupted ? elapsed : 0;

    return {
      isInterrupted: this.interrupted,
      isReconnecting: this.reconnecting,
      duration,
    };
  }

  /**
   * 记录收到新 token。
   *
   * 更新 `lastTokenAt` 并清除中断/重连状态。
   *
   * @param now - token 到达时间戳（ms）
   */
  onTokenReceived(now: number): void {
    this.lastTokenAt = now;
    this.interrupted = false;
    this.reconnecting = false;
  }

  /**
   * 重置检测器状态。
   *
   * 用于流结束或组件卸载时的清理。
   */
  reset(): void {
    this.lastTokenAt = 0;
    this.interrupted = false;
    this.reconnecting = false;
  }
}
