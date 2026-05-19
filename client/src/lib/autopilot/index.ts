/**
 * `client/src/lib/autopilot/` barrel（wt2 任务 4，方案 B）。
 *
 * 归类 6 个原本散落在 `client/src/lib/` 下的 autopilot UI helper：
 * - autopilot-launch-examples → launch-examples
 * - autopilot-prompt-optimizer → prompt-optimizer
 * - autopilot-frontend-model → frontend-model
 * - use-autopilot-cockpit-model → use-cockpit-model
 * - use-autopilot-route-plan → use-route-plan
 * - launch-router → launch-router
 *
 * 物理搬运留到一轮观察期后再做（需求 6.5）。
 */

export * from "./launch-examples.js";
export * from "./prompt-optimizer.js";
export * from "./frontend-model.js";
export * from "./use-cockpit-model.js";
export * from "./use-route-plan.js";
export * from "./launch-router.js";
