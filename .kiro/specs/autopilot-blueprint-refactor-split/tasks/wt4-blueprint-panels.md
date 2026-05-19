<!--
 * @Author: wangchunji
 * @Date: 2026-05-08 12:03:24
 * @Description: 
 * @LastEditTime: 2026-05-08 14:52:46
 * @LastEditors: wangchunji
-->
# Worktree wt4-blueprint-panels 任务清单

**分支**：`feat/blueprint-panels-split`
**Wave**：B
**前置**：`wt2-blueprint-sdk` 必须先合入 `main`
**并行**：可与 wt3 并行

## 目标

把 `BlueprintProgressPanel.tsx` 拆成 10 个子面板 + 统一数据 hook；瘦身 panel 层。所有任务为强制项。

**严格边界**：保留顶层 DOM 顺序、布局容器与所有 `data-testid` 不变，避免既有测试断言漂移。

## 任务

- [x] 1. 拆出 10 个子面板
  - 在 `client/src/pages/specs/panels/` 下新建 `ProgressHeaderPanel` / `JobLedgerPanel` / `SpecTreePanel` / `SpecDocumentsPanel` / `EffectPreviewPanel` / `PromptPackagePanel` / `RuntimeCapabilityPanel` / `EngineeringLandingPanel` / `ArtifactMemoryPanel`，并把 `RouteCandidateCard` / `RuntimeProjectionCard` 重新定位到对应面板目录。
  - 保留顶层 DOM 顺序、布局容器与所有 `data-testid` 不变。
  - _Requirements: 2.6, 6.2_

- [x] 2. 新建统一数据 hook `use-blueprint-progress-data`
  - 新建 `client/src/pages/specs/hooks/use-blueprint-progress-data.ts`，统一封装 `fetchBlueprintSpecsProgress` / `fetchLatestBlueprintGenerationJob` / `fetchBlueprintJobEvents` / capability / invocation / evidence / sandbox / preview / prompt / handoff / replay 相关取数。
  - `BlueprintProgressPanel` 通过该 hook 获取数据并把结果分发给 10 个子面板。
  - _Requirements: 2.6_

- [x] 3. 瘦身 `BlueprintProgressPanel.tsx`
  - `BlueprintProgressPanel.tsx` 仅承担区块装配 + 数据获取，不再内联子面板 JSX；行数显著下降。
  - _Requirements: 2.6, 2.7_

- [x] 4. 运行 panel 层单测并按需放宽断言
  - 运行 `BlueprintProgressPanel.test.tsx` 与相关子面板单测，确认断言未漂移。
  - 必要时将断言从 `toEqual` 改为 `toMatchObject` 以容纳新增可选字段（如 `handoffState` / `reviewingHandoff`）。
  - _Requirements: 6.2, 7.4_
