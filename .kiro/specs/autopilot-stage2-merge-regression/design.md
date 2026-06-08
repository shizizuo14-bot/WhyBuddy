# Design — Autopilot Stage-2 SPEC Workspace Merge Regression

## Overview

回归的根因是 `AutopilotRightRail.tsx` 的 StageContent 渲染分支被一版未提交改动从**合并**改成了**拆分**：

- 已提交基线（HEAD）：`(activeStageKey === "spec_documents" || activeStageKey === "spec_tree")` → 渲染同一个 `StreamingDocRenderer`（合并工作区）。
- 当前工作区（回归）：`activeStageKey === "spec_tree"` → 渲染旧 `SpecTreeWorkbench`；`activeStageKey === "spec_documents"` → 渲染 `StreamingDocRenderer`。并删除了 `isSpecDocumentsStage` 阶段归一逻辑。

修复策略是**恢复合并分支**：让 `spec_tree` 与 `spec_documents` 两个 `WorkbenchStage` 都渲染同一个 `StreamingDocRenderer`（四区合并工作区）。这是受控修复，不是对整片未提交改动做 `git checkout`（工作区里还有大量其它在途改动，盲目还原会误伤）。

同时保留本轮已落地的"进入效果预演 CTA 仅在文档就绪后出现"的细化（Bug 2 修复），并补一条回归防护属性测试。

## Architecture

### 现状 vs 目标（仅 AutopilotRightRail StageContent 分支）

```
现状（回归，未提交）:
  activeStageKey === "spec_tree"      → <SpecTreeWorkbench/>          ❌ 旧 accordion
  activeStageKey === "spec_documents" → <StreamingDocRenderer/>       ✅ 合并工作区

目标（恢复合并）:
  activeStageKey === "spec_tree"      → <StreamingDocRenderer/>       ✅ 合并工作区
  activeStageKey === "spec_documents" → <StreamingDocRenderer/>       ✅ 合并工作区（同一组件）
```

### 阶段模型确认（不改）

- `STAGE_ORDER` / `STAGE_CONFIG` / `WorkbenchStage` 保持不变（仍是 6 个 WorkbenchStage）。
- `resolveRailSubStage` 保持不变：`spec_tree` 与 `spec_docs` job stage 都映射到 `spec_tree` rail sub-stage。
- `mapSubStageToStageIndex("spec_tree")` 保持返回 `STAGE_ORDER.indexOf("spec_tree")`，因此 `activeStageKey` 在第二阶段默认是 `"spec_tree"`，`data-stage-key="spec_tree"`。这满足既有 "pinned SPEC tree review titled as SPEC tree" 契约（不出现 `spec_documents` 作为可见 stage-key）。
- **不恢复** `isSpecDocumentsStage` 强制把 `activeStageKey` 抬到 `"spec_documents"` 的逻辑——那会让 `data-stage-key` 变成 `spec_documents`，破坏 "titled as SPEC tree" 测试。第二阶段的标题来自 `STAGE_CONFIG.spec_tree`（`步骤 04 · 规格树`），这正是用户期望的"规格"阶段标题，且不会显示成效果预览。
- `activeStageKey === "spec_documents"` 仍可由 `manualWorkbenchStageOverride` 进入（用户手动切到文档步骤），此时合并工作区照样渲染同一个 `StreamingDocRenderer`。

## Components and Interfaces

### AutopilotRightRail.tsx — 合并 StageContent 分支

把当前的两段分支：

```tsx
{activeStageKey === "spec_tree" ? (
  <div ...><SpecTreeWorkbench .../></div>
) : activeStageKey === "spec_documents" ? (
  <div ...><StreamingDocRenderer ... onEnterEffectPreview={...} /></div>
) : currentStage === "fabric" && activeSubStage !== undefined ? (
  ...
```

合并为：

```tsx
{(activeStageKey === "spec_tree" || activeStageKey === "spec_documents") ? (
  <div
    data-sub-stage-placeholder={activeSubStage ?? ""}
    data-timeline-status="active"
    aria-current="step"
    className="h-full min-h-0"
  >
    <StreamingDocRenderer
      entries={reasoningEntries}
      specDocuments={persistedSpecDocuments}
      specTree={props.specTree}
      nodeStatusById={nodeStatusById}
      locale={locale}
      onGenerateAll={handleGenerateAllSpecDocs}
      onGenerateNode={handleGenerateNodeSpecDocs}
      generating={specDocsGenerating}
      jobId={props.jobId}
      job={props.job}
      onEnterEffectPreview={
        canEnterEffectPreviewFromCurrentStage &&
        (persistedSpecDocuments?.length ?? 0) > 0
          ? handleEnterEffectPreview
          : undefined
      }
      effectPreviewState={effectPreviewState}
      effectPreviewDisabled={
        !canEnterEffectPreviewFromCurrentStage ||
        !props.jobId ||
        (persistedSpecDocuments?.length ?? 0) === 0
      }
    />
  </div>
) : currentStage === "fabric" && activeSubStage !== undefined ? (
  ...保持不变...
```

要点：
- 两个 stage key 共用同一个 `StreamingDocRenderer` 实例化（合并工作区）。
- `data-sub-stage-placeholder` / `data-timeline-status="active"` / `aria-current="step"` 包裹属性保留，避免破坏 `fabric-dispatch.property.test.tsx` 等断点。
- `onEnterEffectPreview` 沿用本轮 Bug 2 的 gating（`canEnterEffectPreviewFromCurrentStage && persistedSpecDocuments > 0`）。由于第二阶段默认 `activeStageKey === "spec_tree"` → `canEnterEffectPreviewFromCurrentStage === false` → CTA 不渲染（满足 Req 3.1/3.3）；仅当 manual override 到 `spec_documents` 且有文档时才出现（Req 3.2）。
- 移除本分支对旧 `SpecTreeWorkbench` 的渲染。`SpecTreeWorkbench` 的 import 若仍被 `ActiveNodeContent` 使用则保留，否则一并清理，避免 unused-import lint。

### 每节点文档状态（Req 4）

`AutopilotSpecDocumentsWorkbench`（经 `StreamingDocRenderer` 委托）已消费 `nodeStatusById`（由 `deriveNodeStatusById({ persistedSpecDocuments, liveProgressNodes, liveBatchStatus })` 派生）并在左侧节点行渲染状态 chip。恢复合并分支后，第二阶段（含 `spec_tree`）即自动获得按节点的文档状态展示，无需复活已删除的 `SpecDocsProgressPanel.tsx`。`nodeStatusById` 已在组件顶层 `useMemo` 计算，作用域可用。

## Data Models

本回归修复不引入新数据模型，复用既有契约/派生类型：

- `WorkbenchStage`（`stage-config.ts`）、`AutopilotRailSubStage`（`types.ts`）：阶段/子阶段枚举，不变。
- `StreamingDocRendererProps = AutopilotSpecDocumentsWorkbenchProps`：合并工作区入参形状，不变。
- `nodeStatusById: Record<string, { status; wasRetried?; errorSummary? }>`：由 `deriveNodeStatusById({ persistedSpecDocuments, liveProgressNodes, liveBatchStatus })` 派生，作为每节点文档状态来源。
- `persistedSpecDocuments: BlueprintSpecDocument[] | undefined`：由 `resolvePersistedSpecDocuments({ job, specTree })` 派生，作为 CTA 就绪与文档列表来源。

## Correctness Properties

新增属性测试 `autopilot-right-rail-stage2-merge.property.test.tsx`，使用 `fast-check` 的 `fc.constantFrom` 组合枚举 + `renderToStaticMarkup`（SSR-only，沿用同目录既有测试风格）。

### Property 1: 合并工作区恒在

对 `job.stage ∈ {spec_tree, spec_docs}` × `currentSubStage ∈ {undefined, "spec_tree"}` × `specTree ∈ {空树, null}` 的所有组合，渲染输出恒包含 `data-testid="streaming-doc-renderer"`，且恒不包含 `data-testid="spec-tree-workbench"`。

**Validates: Requirements 6.1, 1.1, 1.5**

### Property 2: stage-key 稳定

上述所有组合下 `data-stage-key="spec_tree"` 恒成立，`data-stage-key="spec_documents"` 恒不出现。

**Validates: Requirements 6.2, 2.1**

## Error Handling

- 本修复不引入新的网络/IO 路径，无新增错误来源。
- `specTree` 为 `null` / 空节点：由合并工作区 `AutopilotSpecDocumentsWorkbench` 的空态（`autopilot-workbench-spec-tree-empty`）兜底，不抛异常。
- `persistedSpecDocuments` 为 `undefined`：`(persistedSpecDocuments?.length ?? 0)` 安全求值为 0，CTA 隐藏，不报错。
- 既有 `TrustSection` / 生成失败 toast / `CardErrorBoundary` 等错误边界保持不变。

## Testing Strategy

### 单元 / SSR 契约测试影响清单

| 测试 | 期望 | 说明 |
| --- | --- | --- |
| `autopilot-right-rail-cards.test.tsx` :: "renders the merged SPEC workbench when job.stage === 'spec_docs'" | 转绿 | 合并分支恢复后 spec_tree 渲染 streaming-doc-renderer |
| `autopilot-right-rail-cards.test.tsx` :: "case 2: renders awaiting state when specTree is null" | 转绿 | 合并分支空态由 workbench 承载 |
| `autopilot-right-rail-cards.test.tsx` :: "keeps a pinned SPEC tree review titled as SPEC tree" | 保持绿 | activeStageKey 仍是 spec_tree，无 CTA |
| `autopilot-right-rail-cards.test.tsx` :: "does not expose the effect preview entry while still on the SPEC tree review step" | 保持绿 | spec_tree 下无 CTA |
| `fabric-dispatch.property.test.tsx` | 保持绿 | 包裹属性与 CTA 缺省不变 |
| `WorkbenchStatusBar.enter-effect-preview.test.tsx` | 保持绿 | 组件级契约未动 |
| `AutopilotRoutePage.test.tsx` | 保持绿 | 不涉及 |

## Non-Goals

- 不改后端契约 / socket 事件 / `/tasks` 深链。
- 不改 `STAGE_ORDER` / `STAGE_CONFIG` / `resolveRailSubStage` / `mapSubStageToStageIndex`。
- 不复活已删除的 `SpecDocsProgressPanel.tsx`（其能力已由合并工作区的节点行状态承载）。
- 不动第一阶段（输入/澄清/路线）与第三阶段（效果预演/后续）的渲染分支。
- 不重做设计系统或主题。

## Rollback

改动集中在 `AutopilotRightRail.tsx` 的单个 StageContent 分支 + 一个新增测试文件。回滚只需还原该分支为拆分写法并删除新增测试，不影响其它模块。
