/**
 * Crew 动画 prefers-reduced-motion 降级工具。
 *
 * 封装 framer-motion 的 `useReducedMotion()` hook，为 crew-activation
 * 组件提供统一的动画降级策略：
 * - framer-motion 动画：duration 设为 0
 * - CSS 动画：已在 index.css 中通过 `@media (prefers-reduced-motion: reduce)` 设为 `animation: none`
 *
 * 对应 `.kiro/specs/autopilot-agent-crew-stage-activation` Task 5.2。
 * 需求: 2.4
 */

import { useReducedMotion } from "framer-motion";

import type { Transition } from "framer-motion";

/**
 * 获取 crew 组件的 framer-motion transition 配置。
 *
 * 当用户启用 prefers-reduced-motion 时，所有 duration 设为 0，
 * 确保状态变化即时生效但无动画。
 *
 * @param defaultTransition - 默认 transition 配置
 * @returns 根据 reduced-motion 偏好调整后的 transition
 */
export function useCrewTransition(defaultTransition: Transition): Transition {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return { duration: 0 };
  }

  return defaultTransition;
}

/**
 * 判断是否应禁用 crew 动画。
 *
 * 直接复用 framer-motion 的 `useReducedMotion()` hook。
 * 当返回 true 时：
 * - framer-motion 动画 duration 应设为 0
 * - CSS 动画已由全局样式自动降级为 `animation: none`
 */
export function useCrewReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
