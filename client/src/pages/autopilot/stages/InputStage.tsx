/**
 * Autopilot stage 1: Input（方案 B 视图壳）。
 *
 * 当前实现仍内联在 `../AutopilotRoutePage.tsx` 的 `AutopilotWorkflowRail` 中。
 * 本文件导出的组件是该阶段的**入口控件**：`IntakeSummary`（GitHub 与目标输入摘要）。
 *
 * 后续物理迁移时，把 input 阶段的表单输入、GitHub 粘贴框、附件拖拽等 UI
 * 抽到本文件，保留 `AutopilotWorkflowRail` 只做阶段切换。
 *
 * 对应 `.kiro/specs/autopilot-blueprint-refactor-split` 需求 2.5、6.2。
 */

// IntakeSummary 目前是 AutopilotRoutePage.tsx 内部的 local 组件，还未 export。
// 物理迁移时先在 AutopilotRoutePage.tsx 加上 export，再改本文件为 re-export。
// 本文件保留为入口占位，让 stage 目录结构满足 design.md 约定。

export const INPUT_STAGE_PLACEHOLDER =
  "see client/src/pages/autopilot/AutopilotRoutePage.tsx (AutopilotWorkflowRail)";
