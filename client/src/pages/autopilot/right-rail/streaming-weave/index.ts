/**
 * 流式输出贯穿全生命周期 — 模块入口
 *
 * 对应 spec：`.kiro/specs/autopilot-streaming-lifecycle-weave/`
 */

export { useStreamingWeave } from "./useStreamingWeave";
export { StreamTokenBuffer } from "./StreamTokenBuffer";
export { StreamInterruptionDetector } from "./StreamInterruptionDetector";
export type { InterruptionState } from "./StreamInterruptionDetector";
export { StreamResumeHandler } from "./StreamResumeHandler";
export { StreamingProgressOverlay } from "./StreamingProgressOverlay";
export type { StreamingProgressOverlayProps } from "./StreamingProgressOverlay";
export type {
  InterruptionConfig,
  StreamingWeaveState,
  StreamTokenBufferConfig,
  StreamTokenCallback,
  Unsubscribe,
  UseStreamingWeaveReturn,
} from "./types";
