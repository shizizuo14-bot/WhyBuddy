<!--
 * @Author: wangchunji
 * @Date: 2026-05-08 12:03:16
 * @Description: 
 * @LastEditTime: 2026-05-08 14:42:00
 * @LastEditors: wangchunji
-->
# Worktree wt3-autopilot-page 任务清单

**分支**：`feat/autopilot-page-split`
**Wave**：B
**前置**：`wt2-blueprint-sdk` 必须先合入 `main`
**并行**：可与 wt4 并行

## 目标

把 `AutopilotRoutePage.tsx` 拆成 5 个阶段组件 + 3 个辅助组件；瘦身 page 层；接 barrel；调整 `Home.tsx` 中 autopilot 入口 import。所有任务为强制项。

**严格边界**：不得动 `Home.tsx` 的 project-space 分支（仅允许改 autopilot 入口与 hand-off 的 import 路径）。

## 任务

- [x] 1. 新建 5 个阶段组件
  - 在 `client/src/pages/autopilot/stages/` 下新建 `InputStage.tsx`、`ClarificationStage.tsx`、`RouteSetStage.tsx`、`SelectionStage.tsx`、`FabricStage.tsx`，从 `AutopilotRoutePage.tsx` 迁出对应 JSX 与本地 hook。
  - _Requirements: 2.5_

- [x] 2. 新建 3 个辅助组件
  - 在 `client/src/pages/autopilot/stages/` 下新建 `ConsolePanel.tsx`、`AutopilotVisualStage.tsx`、`AutopilotWorkflowRail.tsx`，保留原 DOM 结构、`className` 与 `data-testid`。
  - _Requirements: 2.5, 6.2_

- [x] 3. 瘦身 `AutopilotRoutePage.tsx`
  - `AutopilotRoutePage.tsx` 仅保留阶段编排与数据接线（`useAutopilotRoutePlan` / `useAutopilotCockpitModel` 仍在 page 层），不再内联阶段 JSX；行数显著下降。
  - _Requirements: 2.5, 2.7_

- [x] 4. 切换子阶段的 import 到新 barrel
  - 把 `AutopilotRoutePage` 与子阶段内用到的 `BlueprintProgressPanel` / `@/lib/blueprint-api` / `@/lib/autopilot` / `@/lib/blueprint` import 全部切到新 barrel。
  - 运行 `AutopilotRoutePage.test.tsx` 与补的最小 smoke 通过。
  - _Requirements: 6.4_

- [x] 5. 展示 `reviewing` 可选动作文案
  - 在 `BlueprintProgressPanel` 与 `AutopilotRoutePage` 各补最小 UI 提示，展示 `job.handoffState === "reviewing"` 时的可选动作文案；新增 key 写入 `blueprint-copy`（即 `client/src/lib/blueprint/copy.ts`）。
  - _Requirements: 4.2_

- [x] 6. 调整 `Home.tsx` autopilot 入口 import
  - 修改 `client/src/pages/Home.tsx` 中 autopilot 入口与 hand-off 相关 import 路径到新 barrel，仅触碰 autopilot 路径，不动 project-space 分支。
  - 运行 `Home.test.tsx` 与 `Home.desktop-layout.smoke.test.tsx` 通过。
  - _Requirements: 1.2, 6.4, 9.1_
