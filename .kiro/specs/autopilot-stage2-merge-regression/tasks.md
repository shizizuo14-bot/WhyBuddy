# Implementation Plan: Autopilot Stage-2 SPEC Workspace Merge Regression

## Overview

恢复 `AutopilotRightRail` 第二阶段（规格树 + 规格文档）的合并工作区渲染：让 `spec_tree` 与 `spec_documents` 两个 `WorkbenchStage` 共用同一个 `StreamingDocRenderer`，移除回归引入的旧 `SpecTreeWorkbench` 分支，保留本轮 CTA gating，并补一条回归防护属性测试。改动集中在单个文件 + 一个新测试文件。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "4"] },
    { "wave": 3, "tasks": ["5"] },
    { "wave": 4, "tasks": ["6"] }
  ]
}
```

```
1 (恢复合并分支)
├─ 2 (清理未用引用)
├─ 3 (空态/每节点状态校验)
└─ 4 (既有测试转绿)
     └─ 5 (新增回归属性测试)
          └─ 6 (标题/分组人工核对 + check)
```

## Tasks

- [x] 1. 恢复 AutopilotRightRail 第二阶段合并渲染分支
  - 在 `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx` 的 StageContent 渲染处，把当前 `activeStageKey === "spec_tree"`（渲染旧 `SpecTreeWorkbench`）与 `activeStageKey === "spec_documents"`（渲染 `StreamingDocRenderer`）两段分支合并为一段：`(activeStageKey === "spec_tree" || activeStageKey === "spec_documents")` 共用同一个 `StreamingDocRenderer`（四区合并工作区）
  - 保留包裹 `div` 的 `data-sub-stage-placeholder` / `data-timeline-status="active"` / `aria-current="step"` 属性
  - 保留本轮 Bug 2 的 CTA gating：`onEnterEffectPreview={canEnterEffectPreviewFromCurrentStage && (persistedSpecDocuments?.length ?? 0) > 0 ? handleEnterEffectPreview : undefined}`，`effectPreviewDisabled` 维持现状
  - 透传 `entries={reasoningEntries}` / `specDocuments={persistedSpecDocuments}` / `specTree={props.specTree}` / `nodeStatusById` / `locale` / `onGenerateAll` / `onGenerateNode` / `generating={specDocsGenerating}` / `jobId` / `job`
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 3.1, 3.2, 3.3_

- [x] 2. 清理回归遗留与未用引用
  - 确认合并后 `SpecTreeWorkbench` 是否仍被 `ActiveNodeContent` 使用；若不再被任何路径使用则移除其 import，否则保留，避免 unused-import / TS 报错
  - 确认 `specDocsError` / `handleRetrySpecDocs` 等仅服务于旧 spec_tree 分支的局部变量是否仍被引用；未用则清理，仍用（如 `ActiveNodeContent` 的 `generationError` / `onRetry`）则保留
  - 运行 `get_diagnostics` 确认 `AutopilotRightRail.tsx` 无新增 TS/lint 报错
  - _Requirements: 5.4, 5.5_

- [x] 3. 校验合并工作区空态与每节点状态（Req 1.4 / Req 4）
  - 确认 `specTree` 为 `null` 或无节点时，合并工作区渲染 `autopilot-workbench-spec-tree-empty`（"No SPEC nodes yet" / 中文等价），而非旧 `spec-tree-workbench` 空态
  - 确认 `nodeStatusById`（`deriveNodeStatusById`）在合并分支可用，左侧节点行通过 `spec-tree-chip` 展示文档状态；live `specDocsProgress` overlay 优先于 persisted baseline
  - 不复活已删除的 `SpecDocsProgressPanel.tsx`
  - _Requirements: 1.4, 4.1, 4.2, 4.3_

- [x] 4. 让既有合并测试转绿
  - 运行 `client/src/pages/autopilot/right-rail/__tests__/autopilot-right-rail-cards.test.tsx`，确认 "renders the merged SPEC workbench when job.stage === 'spec_docs'" 与 "case 2: renders awaiting state when specTree is null" 转绿，且 "keeps a pinned SPEC tree review titled as SPEC tree" / "does not expose the effect preview entry while still on the SPEC tree review step" 保持绿
  - 运行 `fabric-dispatch.property.test.tsx`、`WorkbenchStatusBar.enter-effect-preview.test.tsx`、`AutopilotRoutePage.test.tsx`，确认全绿
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. 新增回归防护属性测试
  - 新建 `client/src/pages/autopilot/right-rail/__tests__/autopilot-right-rail-stage2-merge.property.test.tsx`
  - 用 `fast-check` 枚举 `job.stage ∈ {spec_tree, spec_docs}` × `currentSubStage ∈ {undefined, "spec_tree"}` × `specTree ∈ {空树, null}` 组合，SSR `renderToStaticMarkup(<AutopilotRightRail .../>)`
  - 断言 P1：输出恒包含 `data-testid="streaming-doc-renderer"`，恒不包含 `data-testid="spec-tree-workbench"`
  - 断言 P2：输出恒包含 `data-stage-key="spec_tree"`，恒不包含 `data-stage-key="spec_documents"`
  - _Requirements: 6.1, 6.2_

- [x] 6. 阶段标题/分组人工核对（无回归）
  - 核对第二阶段 StageHeader 显示 `步骤 04 · 规格树`（来自 `STAGE_CONFIG.spec_tree`），不显示 `效果预览` / `EFFECT PREVIEW`
  - 核对第一阶段（输入/澄清/路线）与第三阶段（效果预演）渲染分支未受影响
  - 运行 `node --run check`，确认未扩大现有 TypeScript 基线错误数
  - _Requirements: 2.1, 2.2, 2.3, 5.4, 5.5_

## Notes

- 这是受控修复，不要对工作区里其它在途未提交改动做 `git checkout` / 盲目还原。
- 不复活已删除的 `SpecDocsProgressPanel.tsx`；其能力由合并工作区节点行状态承载。
- 不改 `STAGE_ORDER` / `STAGE_CONFIG` / `resolveRailSubStage` / `mapSubStageToStageIndex` / 后端契约 / socket / `/tasks` 深链。
