/**
 * `use-blueprint-progress-data` 占位（wt4 任务 2，方案 B）。
 *
 * 当前实现：`BlueprintProgressPanel.tsx` 内部直接调用多个 fetch* / normalize* helper
 * 以组装进度数据。
 *
 * 物理迁移计划：把这些取数封装成 `useBlueprintProgressData(jobId, options)` hook，
 * 让 panel 层只剩区块装配。等 `panels/*` 物理抽离后再做，避免反复改 BlueprintProgressPanel。
 *
 * 对应 `.kiro/specs/autopilot-blueprint-refactor-split` 需求 2.6。
 */

export const USE_BLUEPRINT_PROGRESS_DATA_PLACEHOLDER =
  "see client/src/pages/specs/BlueprintProgressPanel.tsx for the current fetch wiring";
