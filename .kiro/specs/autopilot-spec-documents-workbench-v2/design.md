# Design Document

## Overview

本设计将 `client/src/pages/autopilot/right-rail/streaming-doc/StreamingDocRenderer.tsx` 从“左 200px 侧栏 + 右文档主区”的 2 栏 IA 重构为“顶部状态栏 + 左 Spec 树 + 中文档主区 + 底部执行步骤”的 4 区驾驶舱 IA，承接 requirements.md 中的 R1-R7。

设计严格遵循 compatibility-first 原则：

- 不修改 `useBlueprintRealtimeStore` schema、`BlueprintGenerationJob` / `BlueprintSpecTree` / `BlueprintSpecDocument` 字段、`MiroFishCardStream` 派生算法、`handleGenerateAllSpecDocs` / `handleGenerateNodeSpecDocs` / `exportSpecDocumentsToDownload` 签名（对齐 requirements 的 Non-Goals 1-4 / 6 / 8）。
- 不引入新的 npm 运行时依赖（R6.2），不要求 `swiper`（R5.8）。
- 复用 `MarkdownRenderer`、`StreamCursor`、`MiroFishCardStream`、`deriveSpecTreeChip`、`parseSpecDocsObservingEntries`、`exportSpecDocumentsToDownload` 等既有工具（R3.5 / R4.3 / R5.2 / R5.4 / R7.4）。
- 测试沿用本仓既有 `react-dom/server` `renderToStaticMarkup` + `vi.mock` 模式（R6.5），不引入 `@testing-library/react`。

实施按 Phase 1（四区骨架）→ Phase 2（顶部统计 / 文档类型卡片 + 底部双栏）→ Phase 3（AI 摘要 / 章节清单 / 相关引用）三个阶段组织，与 requirements 中的 PhaseMapping 完全对齐。

## Architecture

### 四区骨架（R1）

桌面宽度（≥ 1280px）下 `AutopilotSpecDocumentsWorkbench` 渲染为 CSS Grid 容器，划分为四个语义区域：

```
┌──────────────────────────────────────────────────────────────────────┐
│ StatusBar  data-testid="autopilot-workbench-status-bar"              │ ← 顶部状态栏
├──────────────────┬───────────────────────────────────────────────────┤
│                  │                                                   │
│ SpecTreePanel    │ DocMainPanel                                      │
│ data-testid=     │ data-testid="autopilot-workbench-doc-main"        │
│ "autopilot-      │                                                   │
│ workbench-spec-  │                                                   │
│ tree"            │                                                   │
│                  │                                                   │
├──────────────────┴───────────────────────────────────────────────────┤
│ ExecutionPanel  data-testid="autopilot-workbench-execution-panel"    │ ← 底部执行步骤
└──────────────────────────────────────────────────────────────────────┘
```

容器 grid 模板：

```
grid-template-rows: auto 1fr auto;
grid-template-columns: 240px minmax(0, 1fr);
grid-template-areas:
  "status status"
  "tree   main"
  "exec   exec";
```

宽度宽容性：

- StatusBar 与 ExecutionPanel 跨两列；SpecTreePanel 固定 240px 宽，DocMainPanel 通过 `minmax(0, 1fr)` 占据剩余空间，沿用旧实现的 `min-width: 0 / max-width: 100% / box-sizing: border-box` 硬约束（沿用 `StreamingDocRenderer` 既有宽度约束注释），杜绝 `min-content` 撑出 grid track（R1.3）。
- 1280px → 1920px 区间不对四区做折叠或主次切换；ExecutionPanel 高度由内容决定但通过 `max-height` + `overflow-y: auto` 控制下限，不挤压 DocMainPanel 主滚动区。
- 四个区域均渲染稳定 `data-testid`（R1.2），保证 SSR markup 中可被 `markup.includes(...)` 断言（R1.4）。

### 与 `AutopilotRightRail` 的挂载边界（R1.5 / R7）

- `AutopilotRightRail` 当前在 `activeStageKey === "spec_documents" || activeStageKey === "spec_tree"` 分支统一渲染 `StreamingDocRenderer`；本规格保持该单一挂载点不变（Non-Goals 8）。
- props 签名维持 `StreamingDocRendererProps` 的现有形状：`entries / specDocuments / specTree / locale / onGenerateAll / onGenerateNode / generating / jobId / job`。重构后的实现在内部把 `onGenerateAll` 暴露为 StatusBar 的 `refresh` 处理（R2.4 / R7.3）、`onGenerateNode` 暴露为左侧 Spec 树的“生成当前节点 spec 文档”动作（R7.2）、`exportSpecDocumentsToDownload(jobId, ...)` 暴露为 StatusBar 的 `export` 动作（R2.3 / R7.4）。
- 不在本组件内部新建并行的 API 调用路径或并行的 in-flight 锁；继续依赖 `AutopilotRightRail` 的 `specDocsGenerating` / `triggerSpecDocsGeneration` 调度（R7.3）。

## Component Decomposition

为控制单文件体量并便于独立 SSR 测试，把现有 `StreamingDocRenderer.tsx` 拆分为一个容器 + 四个区域组件 + 若干派生纯函数：

```
streaming-doc/
├── StreamingDocRenderer.tsx                # 容器：仍是对外入口与默认导出
├── workbench/
│   ├── AutopilotSpecDocumentsWorkbench.tsx # 四区 grid 容器（接管旧渲染）
│   ├── WorkbenchStatusBar.tsx              # 顶部状态栏（R2)
│   ├── WorkbenchSpecTree.tsx               # 左侧 Spec 树（R3）
│   ├── WorkbenchDocMain.tsx                # 中间文档主区（R4）
│   ├── WorkbenchExecutionPanel.tsx         # 底部执行步骤（R5）
│   ├── derive-doc-stats.ts                 # DocStats 派生纯函数（R2.6 / R2.10）
│   ├── derive-chapter-checklist.ts         # ChapterChecklist 派生纯函数（R4.7）
│   ├── derive-related-refs.ts              # RelatedRef 派生纯函数（R4.8 / R4.10）
│   └── __tests__/                          # 各子组件 + 派生函数的 SSR / 纯函数单测
└── (现有 MarkdownRenderer / StreamCursor / DocOutline / ... 保持不变)
```

设计要点：

- `StreamingDocRenderer.tsx` 保留为对外默认导出与 `__testing__` 命名空间，内部委托给 `AutopilotSpecDocumentsWorkbench`，避免破坏 `AutopilotRightRail` 与既有测试导入路径。
- 拆分后的子组件均为纯展示组件，所有数据派生集中在 `derive-*.ts` 纯函数中，便于在不挂 React 树的情况下做属性级单测。
- 既有 `streamingDocsReducer / appendChunkReducer / isSpecDocumentContentEntry / pickDocumentId / pickChunk` 等 entries → chunks 派生逻辑保留在 `StreamingDocRenderer.tsx`（或抽到 `streaming-state.ts`）并通过 props 传给 `WorkbenchDocMain`，以维持 `__testing__` 测试契约不破。

### 容器：`AutopilotSpecDocumentsWorkbench`

职责：

1. 接收来自 `StreamingDocRenderer` 的 props（与现有 `StreamingDocRendererProps` 相同）。
2. 维持现有的 reducer 状态（流式 chunks）、`activeDocId` 选择状态、滚动位置缓存与 `expandedNodeIds` 折叠状态。
3. 派生 `docStats`、`chapterChecklist`、`relatedRefs` 等聚合值，通过 props 透传给四个区域组件。
4. 渲染四区 grid 骨架与稳定 `data-testid`。

不在容器中处理任何业务副作用（API 调用、socket 订阅），保持纯组件特征。

### `WorkbenchStatusBar`（R2）

Props（节选）：

```ts
interface WorkbenchStatusBarProps {
  /** 主标题：取自 BlueprintGenerationJob 的现有展示位（如 job.title 或派生），数据缺失时降级到固定文案。 */
  title: string;
  /** 副标题：缺失时使用固定占位文案，不渲染空白（R2.1）。 */
  subtitle: string;
  /** 派生统计聚合（R2.5 / R2.6）。 */
  docStats: DocStats;
  /** 当前生成态：用于禁用按钮，与现有 specDocsGenerating 一致。 */
  generating: "all" | "single" | null;
  /** 三个动作回调（R2.2 / R2.3 / R2.4 / R7）。 */
  onExport: () => void;
  onReview: () => void;
  onRefresh: () => void;
  locale: AppLocale;
}
```

布局：

- 一行三列：左侧 `Title + Subtitle`（DOM 结构稳定，副标题缺失时降级文案为 `当前蓝图概览`/`Blueprint Overview`，不留空 DOM）。
- 中间三个统计 badge：
  - `autopilot-workbench-stat-docs`：`SpecDocument.length / SpecTree.nodes.length × DOC_TYPE_COUNT(=3)` 派生（R2.5 / R2.6）。
  - `autopilot-workbench-stat-tasks`：基于 SpecDocument 中 `type === "tasks"` 的数量与“完成数”派生（R2.5）。
  - `autopilot-workbench-stat-completion`：`completedCount / generatedCount` 取百分比，分母为 0 时显示 `0%`（R2.8 / R2.9）。
- 右侧三个操作按钮 `export / review / refresh`，分别对应 `data-testid="autopilot-workbench-action-{export|review|refresh}"`（R2.2）。
  - `export` 调用 `props.onExport`，容器实现里桥接到 `exportSpecDocumentsToDownload({ jobId, granularity: "all" })`（R2.3 / R7.4）。
  - `refresh` 调用 `props.onRefresh`，容器实现里桥接到 `onGenerateAll`（即 `handleGenerateAllSpecDocs`，R2.4 / R7.3）。
  - `review` 当前在 `AutopilotRightRail` 不存在专用 handler；本规格定义为占位按钮，挂载 `data-testid` 与禁用态以满足渲染契约（R2.2），点击行为退化为 no-op 并标注 TODO，不引入新的 API 调用路径（与 Non-Goals 4 一致）。
- 状态栏底部一行渲染三张文档类型卡片（R2.7）：
  - 卡片 `data-testid="autopilot-workbench-doctype-card-requirements"`、`...-design`、`...-tasks`。
  - 每张卡片显示 `已生成数 / 完成数` 文案；当统计来源缺失时按 `0 / 0` 渲染（R2.8）。

无障碍：

- 状态栏外层用 `role="banner"` + `aria-label`，按钮使用原生 `<button type="button">` 并附 `aria-disabled` 反映 `generating` 状态。

### `WorkbenchSpecTree`（R3）

Props（节选）：

```ts
interface WorkbenchSpecTreeProps {
  specTree: BlueprintSpecTree | null | undefined;
  specDocuments: readonly BlueprintSpecDocument[] | undefined;
  /** 用于派生节点 chip（R3.5）。 */
  observingSnapshot: SpecDocsObservingSnapshot;
  /** 当前选中文档与回调，复用容器内 activeDocId 状态。 */
  activeDocId: string | null;
  onSelectDocument: (docId: string) => void;
  /** 单节点生成 spec 文档（R7.2）。 */
  onGenerateNode?: (nodeId: string) => void;
  generating: "all" | "single" | null;
  locale: AppLocale;
}
```

数据来源与渲染策略：

- 节点层级直接消费 `specTree.nodes` 的 `parentId / children` 字段（R3.2），不在前端重新计算父子关系。容器层把 `nodes` 转成 `Map<nodeId, node>` + `Map<parentId, nodeId[]>` 一次，传给本组件。
- 顶部搜索框 `data-testid="autopilot-workbench-spec-tree-search"`（R3.1），复用现有过滤行为：在节点 title / 子树内文档 title / 文档 type 字符串上做大小写无关 `includes` 匹配；非空查询时自动展开匹配子树。
- 折叠 / 展开切换控件 `data-testid="autopilot-workbench-spec-tree-toggle-{nodeId}"`（R3.3），仅切换该节点 `expandedNodeIds`，不影响其他分支（R3.4）。状态保留在容器，确保用户在中文档区切换文档时折叠状态稳定。
- 类型 chip：从 `deriveSpecTreeChip(docsForNode, ephemeralForNode)` 派生（R3.5），其中 `ephemeralForNode` 由 `observingSnapshot.byNodeTitle.get(node.title)` 提供，与 `SpecTreeWorkbench` 中现有的派生方式一致；本规格不引入并行的 chip 计算。
- 节点点击：调用 `onSelectDocument`，目标 doc 选择规则——
  1. 若该节点拥有 `requirements / design / tasks` 三类文档，按 `TYPE_ORDER` 取第一个未读 / 第一个；
  2. 若节点尚无文档但已有 `streamingOnlyIds`（流式生成中的 default doc）落在当前 nodeId 的 placeholder 上，使用占位 doc id；
  3. 节点选中态通过 `data-active="true"` 与 indigo 背景表达（R3.6）。
- 单节点生成 spec 文档动作：在节点行的 hover / 选中态下渲染一个内联按钮 `data-testid="autopilot-workbench-spec-tree-generate-{nodeId}"`，点击调用 `onGenerateNode(nodeId)`（R7.2），按钮在 `generating === "single"` 时禁用。
- 空态：`specTree === null || specTree.nodes.length === 0` 时仅渲染搜索框 + 一段说明文案（R3.7），不渲染空列表容器。

### `WorkbenchDocMain`（R4）

Props（节选）：

```ts
interface WorkbenchDocMainProps {
  /** 当前 active 文档元数据（沿用旧 ActiveDocMeta 形状）。 */
  activeDoc: ActiveDocMeta | null;
  /** 渲染用的 markdown：流式 chunks 优先，否则回退到 SpecDocument.content。 */
  renderedMarkdown: string;
  isStreaming: boolean;
  /** 章节清单与关联引用，由容器派生纯函数产出。 */
  chapterChecklist: ChapterChecklistItem[];
  relatedRefs: RelatedRef[];
  /** AI 摘要：当前阶段从 SpecDocument.summary（若上游已存在）或 Non-Goal 6 允许的派生位置取值。 */
  aiSummary: string | null;
  onSelectDocument: (docId: string) => void;
  onToggleExpand: () => void;
  expanded: boolean;
  locale: AppLocale;
}
```

布局：

- 顶部头部行（R4.1）：左侧 DocType chip `data-testid="autopilot-workbench-doc-type-chip"` 渲染 `getTypeBadge(activeDoc.type, locale).fullLabel`；中间 `data-testid="autopilot-workbench-doc-title"` 显示当前文档标题（streaming 状态时附加 `生成中` 指示器，沿用旧实现样式）；右侧渲染“展开文档”按钮 `data-testid="autopilot-workbench-doc-expand"`（R4.2），点击切换 `expanded` 状态。
- 中部 Markdown 滚动容器：复用现有 `<MarkdownRenderer markdown={renderedMarkdown} isStreaming={isStreaming} locale={locale} />` 与 `<StreamCursor visible={isStreaming} />`（R4.3），不引入新依赖。容器宽度沿用旧 `min-width:0 / max-width:100%` 与 `wordBreak: break-word` 约束。
- Markdown 正文下方依次渲染：
  - `AISummary` 区块 `data-testid="autopilot-workbench-doc-ai-summary"`（R4.4）。本规格不接入新摘要 API（Non-Goals 6）：
    - 若 `BlueprintSpecDocument.summary`（已存在的可选字段，见 contracts.ts L998 / L1190 等）非空，则展示该字段。
    - 否则展示降级占位文案（R4.5），中文 `“AI 摘要尚未生成”` / 英文 `“AI summary not yet available”`。
  - `ChapterChecklist` 区块 `data-testid="autopilot-workbench-doc-chapter-checklist"`（R4.6 / R4.7）。
  - `RelatedRef` 区块 `data-testid="autopilot-workbench-doc-related-refs"`（R4.8 / R4.9 / R4.10）。
- 展开模式：`expanded === true` 时容器把高度限制改为视口铺满；不强制全屏，避免影响外层 `AutopilotRightRail` 的 grid 布局。展开按钮的 `aria-pressed` 反映状态。

### `WorkbenchExecutionPanel`（R5）

Props（节选）：

```ts
interface WorkbenchExecutionPanelProps {
  job: BlueprintGenerationJob | null | undefined;
  locale: AppLocale;
}
```

布局：

- 一行两列：
  - 左栏 `data-testid="autopilot-workbench-execution-artifacts"`：渲染 ArtifactCard 列表（R5.1）。
  - 右栏 `data-testid="autopilot-workbench-execution-reasoning"`：渲染 ReasoningCard 时间线（R5.1）。
- 不引入 `swiper`，使用 CSS Grid + `min-width: 0` 实现稳定左右分栏（R5.8）。
- 内部不重写 reasoning / artifact 派生（R5.2）：
  - 左栏：通过 `MiroFishCardStream` 配合 `stageFilter=["artifact_created"]` 风格的过滤渲染 ArtifactCard；当本规格无法精确通过 stageFilter 隔离时，回退方案是把 `MiroFishCardStream` 直接嵌入左栏并使用 CSS 选择器在该容器内只显示 `kind === "artifact_created"` 的卡片（仍由 `MiroFishCardStream` 内部渲染，不复制其派生逻辑）。
  - 右栏：同样通过 `MiroFishCardStream` 渲染推理流，按 `kind === "reasoning"` 的 `entry.role`（Analyzer / Planner / Generator）做角色分类小标题；分类映射来自 `MiroFishStreamEntry` 已有的 role 字段，组件内部不重写识别逻辑（R5.5）。
- ArtifactCard 类型标签（R5.3）：依赖 `MiroFishCardStream` 已有的 `ArtifactCreatedCard` 渲染产出；卡片内已带 `design` / `tasks` / `requirements` 等类型标签，本规格不在外层重复硬编码。
- observing 状态标签（R5.4）：通过容器派生的 `observingSnapshot = parseSpecDocsObservingEntries(reasoningEntries)` 注入到底部面板上层 chip，挂载于左栏顶部以表示当前 observing 节点；不在本组件内部重新解析 observing 文案。
- 空态（R5.6 / R5.7）：
  - `job?.artifacts?.length === 0` 时，左栏仅渲染一段 `<p data-testid="autopilot-workbench-execution-artifacts-empty">…</p>` 占位文案，不渲染任何列表容器（包括零项列表容器）。
  - `agentReasoning.entries.length === 0` 时，右栏仅渲染一段占位文案 `data-testid="autopilot-workbench-execution-reasoning-empty"`。
  - 该两条空态判定在 `WorkbenchExecutionPanel` 内部直接条件渲染 `MiroFishCardStream` 与空态 `<p>`，避免出现“空态容器壳”。

无障碍：

- 左右栏外层使用 `role="region"` + `aria-label`，并复用 `MiroFishCardStream` 已经具备的 `data-testid="mirofish-card-stream"` 作为辅助断言点。

## Data Derivation

为保持容器无业务副作用，所有派生集中在 `workbench/derive-*.ts` 纯函数中。

### DocStats（R2.5 / R2.6 / R2.8 / R2.10）

```ts
export interface DocStats {
  totalDocs: number;
  totalTasks: number;
  completionRate: number; // 0..1
  byType: Record<BlueprintSpecDocumentType, { generated: number; completed: number }>;
}

export function deriveDocStats(input: {
  specDocuments: readonly BlueprintSpecDocument[] | undefined;
  specTree: BlueprintSpecTree | null | undefined;
}): DocStats;
```

派生规则：

- `totalDocs` = `specDocuments.length`；缺失或为空时为 `0`（R2.8）。
- `totalTasks` = `specDocuments.filter(d => d.type === "tasks").length`。
- 完成判定：`BlueprintSpecDocument.status === "accepted"` 视为该文档已完成（与 `deriveSpecTreeChip` / `deriveSpecDocumentTreeStats` 既有口径一致），其余 `draft / reviewing` 不计入完成数。
- `byType[type].generated` = 该类型 SpecDocument 数；`byType[type].completed` = 该类型 `accepted` 文档数。
- `byType[type].completed = min(generated, completed)`，避免上游异常导致负向（R2.10）。
- `completionRate`：分母 = `byType.requirements.generated + byType.design.generated + byType.tasks.generated`；分子 = 三类 `completed` 之和；分母为 0 时返回 0（R2.9）。

### ChapterChecklist（R4.6 / R4.7）

```ts
export interface ChapterChecklistItem {
  /** 章节锚点 id，由章节标题 slug 化得到。 */
  id: string;
  title: string;
  completed: boolean;
}

export function deriveChapterChecklist(markdown: string): ChapterChecklistItem[];
```

派生规则：

- 仅扫描 Markdown 顶层二级标题 `^## (.+)$`（R4.7）。
- `id` 通过对标题做 ASCII / CJK 兼容的 slug：`title.trim().toLowerCase().replace(/\s+/g, "-")`（不引入新依赖）。
- `completed` 当前阶段定义为：章节内是否存在非空内容（即下一行不是另一个 `##` 标题且至少有一段非空白文本）；这是 Phase 3 的最小必要派生，避免新建额外章节元数据存储（R4.7）。
- 实现纯函数，便于纯单测覆盖。

### RelatedRef（R4.8 / R4.10）

```ts
export interface RelatedRef {
  documentId: string;
  nodeId: string;
  type: BlueprintSpecDocumentType;
  title: string;
  /** 关系：同节点其他类型 / 父节点 / 子节点。 */
  relation: "sibling-type" | "parent-node" | "child-node";
}

export function deriveRelatedRefs(input: {
  activeDoc: BlueprintSpecDocument | null;
  specDocuments: readonly BlueprintSpecDocument[] | undefined;
  specTree: BlueprintSpecTree | null | undefined;
}): RelatedRef[];
```

派生规则：

- `sibling-type`：同 `nodeId` 下其他 `BlueprintSpecDocumentType` 的 SpecDocument。
- `parent-node`：根据 `specTree.nodes` 中的 `parentId` 反查父节点，列出其 `requirements / design / tasks` 三类文档（若存在）。
- `child-node`：根据 `node.children`（或 `nodes.filter(n => n.parentId === activeNodeId)`）列出第一层子节点的全部文档，避免树过深时一次性展开。
- 结果按 `relation` 分组、组内按 `TYPE_ORDER` 排序。
- 返回数组为空时，UI 渲染单一占位文案而不渲染列表容器（R4.10）。

### activeDoc 切换路径统一（R4.9）

`WorkbenchSpecTree` 与 `RelatedRef` 列表点击均通过同一 `onSelectDocument(docId: string)` 回调进入容器层，触发 `setActiveDocId`，并复用旧实现的滚动位置 `scrollPositions` snapshot 逻辑，确保左侧导航与右侧引用切换的行为一致。

## Phase Mapping

为支持 PhaseMapping（requirements Glossary）：

| Phase | 实施内容 | 涉及组件 / 派生 |
|-------|---------|-----------------|
| Phase 1 | 四区骨架；StatusBar 标题/副标题/三个动作按钮；Spec 树（搜索 + 折叠 + chip）；DocMain 头部 + Markdown + 展开按钮；ExecutionPanel 保持 `MiroFishCardStream` 作为单入口 | `AutopilotSpecDocumentsWorkbench`、`WorkbenchStatusBar`（仅按钮 / 标题）、`WorkbenchSpecTree`、`WorkbenchDocMain`（仅头部 + Markdown + 展开按钮）、`WorkbenchExecutionPanel`（保留旧入口） |
| Phase 2 | StatusBar 三个统计 badge 与三张 DocType 卡片；ExecutionPanel 拆分左右分栏与角色分类时间线 | `deriveDocStats`、`WorkbenchStatusBar`（统计层）、`WorkbenchExecutionPanel`（双栏） |
| Phase 3 | DocMain 下方 AISummary、ChapterChecklist、RelatedRef | `deriveChapterChecklist`、`deriveRelatedRefs`、`WorkbenchDocMain`（下方区块） |

各 Phase 的 `data-testid` 在 Phase 1 即定义完整骨架占位，Phase 2 / Phase 3 仅填充内容；这样可以让 Phase 1 落地后 SSR 测试一次写齐渲染断点（R6.5），后续阶段不再调整断点。

## Interfaces

### 对外 props

`StreamingDocRendererProps` 字段保持不变（R6.6 / R7.1）。`AutopilotSpecDocumentsWorkbench` 内部新增 props 是子组件的私有契约，不暴露到 `AutopilotRightRail`。

### 内部派生上下文

容器内通过 `useMemo` 计算并向子组件透传：

```ts
interface WorkbenchDerivedContext {
  docStats: DocStats;
  observingSnapshot: SpecDocsObservingSnapshot;
  nodeTitleByNodeId: ReadonlyMap<string, string>;
  groupedDocs: DocGroup[];
  docById: ReadonlyMap<string, BlueprintSpecDocument>;
  activeDoc: ActiveDocMeta | null;
  renderedMarkdown: string;
  chapterChecklist: ChapterChecklistItem[];
  relatedRefs: RelatedRef[];
  aiSummary: string | null;
}
```

`groupedDocs / docById / activeDoc / renderedMarkdown` 沿用旧实现的 `useMemo` 派生不变；`docStats / chapterChecklist / relatedRefs / aiSummary` 是本规格新增。

## File / Module Layout

```
client/src/pages/autopilot/right-rail/streaming-doc/
├── StreamingDocRenderer.tsx
├── workbench/
│   ├── AutopilotSpecDocumentsWorkbench.tsx
│   ├── WorkbenchStatusBar.tsx
│   ├── WorkbenchSpecTree.tsx
│   ├── WorkbenchDocMain.tsx
│   ├── WorkbenchExecutionPanel.tsx
│   ├── derive-doc-stats.ts
│   ├── derive-chapter-checklist.ts
│   ├── derive-related-refs.ts
│   └── __tests__/
│       ├── AutopilotSpecDocumentsWorkbench.skeleton.test.tsx
│       ├── WorkbenchStatusBar.stats.test.tsx
│       ├── WorkbenchSpecTree.toggle.test.tsx
│       ├── WorkbenchDocMain.switching.test.tsx
│       ├── WorkbenchExecutionPanel.empty.test.tsx
│       ├── derive-doc-stats.test.ts
│       ├── derive-chapter-checklist.test.ts
│       └── derive-related-refs.test.ts
```

模块约束：

- 所有源文件含中文 JSDoc 描述模块职责、props 与关键函数（R6.3）。
- `data-testid` / promptId / API 字段名一律使用英文（R6.4）。
- 不向 `package.json` 的 `dependencies` / `devDependencies` 新增任何包（R6.2）。
- 复用现有 `cn` / `MarkdownRenderer` / `StreamCursor` / `MiroFishCardStream` / `deriveSpecTreeChip` / `parseSpecDocsObservingEntries` / `exportSpecDocumentsToDownload`，不新建并行实现。

## Test Strategy

沿用本仓既有测试模式（R6.5）：`react-dom/server` 的 `renderToStaticMarkup` + `vi.mock` 组合，不引入 `@testing-library/react` / `jsdom` / `happy-dom`。

### 派生纯函数单测

- `derive-doc-stats.test.ts`：覆盖空 SpecDocuments / 完成数 > 已生成数 / 三类 doc 完成率 / 分母为 0 等分支（R2.8 / R2.9 / R2.10）。
- `derive-chapter-checklist.test.ts`：仅匹配 `^## ` 标题、忽略 `### / # / ####` 标题、空内容章节标记为未完成（R4.7）。
- `derive-related-refs.test.ts`：覆盖同节点其他类型 / 父节点 / 子节点 / 无关联 4 类输入（R4.10）。

### SSR 渲染断言

- `AutopilotSpecDocumentsWorkbench.skeleton.test.tsx`：渲染包含 4 个 `data-testid` 的 markup 断言（R1.2 / R1.4）。
- `WorkbenchStatusBar.stats.test.tsx`：mock `useBlueprintRealtimeStore` 返回非空 / 空 entries，断言三个统计 badge / 三张 DocType 卡片的 `data-testid` 与文案（R2.5 / R2.7 / R2.8）。
- `WorkbenchSpecTree.toggle.test.tsx`：通过直接调用 FC + 遍历 props 树的方式触发 `onClick`，断言只有目标 nodeId 的展开状态变化（R3.4）；同时校验 `deriveSpecTreeChip` 的输出文案是否被正确渲染（R3.5）。
- `WorkbenchDocMain.switching.test.tsx`：当 `activeDocId` 变化时断言标题、type chip、`MarkdownRenderer` 接收到的 `markdown` 与 RelatedRef 切换路径一致（R4.1 / R4.9）。
- `WorkbenchExecutionPanel.empty.test.tsx`：分别 mock 空 artifacts / 空 reasoning entries，断言不出现任何列表容器（R5.6 / R5.7）。

### 回归保护

- 保留 `StreamingDocRenderer` 的 `__testing__` 命名空间导出（`streamingDocsReducer / pickChunk / ...`），不破坏旧测试契约。
- `AutopilotRightRail.subtimeline-mount.test.tsx` 等既有 SSR 测试不变，组件 props 与挂载分支保持兼容。

## Non-functional Concerns

### TypeScript / 编译预算

- 全部新增源文件以 TypeScript 严格模式书写。
- 不向类型库新增公开类型（R6.6）；新增 `DocStats / ChapterChecklistItem / RelatedRef` 等类型仅在 `workbench/` 内部导出，不进入 `shared/blueprint/contracts.ts`。
- 控制变更不引入 TypeScript 错误，确保仓库基线不超过 117 项（R6.1）。

### 国际化

- 复用现有 `locale` props，不新建 i18n 资源文件；中英文文案以本组件内的 `const` 字面量管理，与 `getTypeBadge`、`emptyHint` 等既有处理方式一致。
- 所有新增文案都在 zh-CN / en 两套下提供；当数据缺失时使用稳定降级文案（R2.1 / R4.5 / R4.10 / R5.6 / R5.7）。

### 性能

- DocStats / ChapterChecklist / RelatedRef 派生均通过 `useMemo` 缓存；`MarkdownRenderer` 已有的渲染缓存继续生效。
- ExecutionPanel 的左右栏在容器内只引入一次 `MiroFishCardStream`，避免在两侧重复订阅 `useBlueprintRealtimeStore`。当确实需要双侧分别订阅时，作为未来优化通过容器层的 `useBlueprintRealtimeStore` selector 一次取得 `agentReasoning.entries` 后向下传递（不在本规格里改 store schema）。

### 兼容回归

- `StreamingDocRenderer.tsx` 默认导出与 `__testing__` 导出形状不变。
- `AutopilotRightRail.tsx` 不需要任何修改即可继续工作。
- `useBlueprintRealtimeStore` / `BlueprintGenerationJob` / `BlueprintSpecTree` / `BlueprintSpecDocument` schema 不变（Non-Goals 1 / 2）。
- `MiroFishCardStream` / `parseSpecDocsObservingEntries` / `deriveSpecTreeChip` / `exportSpecDocumentsToDownload` / `handleGenerateAllSpecDocs` / `handleGenerateNodeSpecDocs` 行为不变（Non-Goals 3 / 4 / 6 / 8）。

## Decisions and Trade-offs

### Decision 1：在 `StreamingDocRenderer.tsx` 内部委托给新容器，而不是改名

理由：`AutopilotRightRail` 直接 import `StreamingDocRenderer` 与 `__testing__` 命名空间，且既有测试导入路径稳定。改名会扩大 diff 半径，并增加上层挂载分支调整的风险（与 R7 / Non-Goals 8 不符）。

替代方案：直接把 `StreamingDocRenderer` 扩成 4 区组件。被否决，原因：单文件超过 1000 行且混合 reducer / 派生 / 渲染，难以独立测试新增的 DocStats / ChapterChecklist / RelatedRef 派生。

### Decision 2：ExecutionPanel 左右栏共用一个 `MiroFishCardStream` 实例 + 视觉过滤，而不是双实例

理由：`MiroFishCardStream` 内部维护订阅、`useEffect` 自动滚动、连续 `node_completed` 折叠等行为；双实例会导致：

- 两套滚动副作用与 ref，无法稳定 SSR 测试；
- 复用 `deriveMiroFishStreamEntries` 的成本翻倍；
- 与 Non-Goals 3（不修改派生算法）边界冲突。

权衡：左右栏分类靠容器层 chip / 标题表达，并通过 CSS Grid 把 `MiroFishCardStream` 渲染到左右栏的容器内即可——若一次渲染无法满足左右两栏的细分，可在 `MiroFishCardStream` 上叠加 `stageFilter` 复用其 props 而非新建逻辑（R5.2 / R5.5）。

### Decision 3：`review` 按钮采取占位实现

理由：`AutopilotRightRail` 当前没有 `review` 对应的 handler，不允许在本规格中新建并行调用路径（Non-Goals 4）；同时 R2.2 仅要求按钮存在与对应 `data-testid`，未要求行为。占位实现既能落地骨架，又不违反范围约束。

后续：当 `AutopilotRightRail` 提供 `onReviewSpecDocs` 之类的 prop 后，本组件以最小变更接入；本规格在 `WorkbenchStatusBarProps.onReview?: () => void` 上预留 optional 通道。

### Decision 4：AI 摘要使用 `BlueprintSpecDocument.summary` 派生，而不是新摘要服务

理由：Non-Goals 6 明确不引入新摘要 / 章节解析 / 相关引用图谱服务。`BlueprintSpecDocument` 已具备 `summary?: string`（contracts.ts L1190 等处可见），用作 Phase 3 AISummary 的稳定派生源；缺失时降级文案满足 R4.5。

### Decision 5：完成判定口径统一为 `status === "accepted"`

理由：与既有 `deriveSpecTreeChip` / `deriveSpecDocumentTreeStats` 一致，避免新口径污染统计语义。`reviewing / draft` 视为已生成未完成，`rejected` 视为已生成未完成（按 R2.10 夹取后不会越过 `generated`）。

## Open Questions

1. `review` 按钮的最终目标行为（指向 ReviewPage？打开抽屉？）需在后续 spec 中明确；本规格落实占位 + 预留 prop。
2. ChapterChecklist 的“完成”判定是否需要更细粒度（如二级 checkbox 状态）当前不在范围内；本规格使用“章节内是否有非空内容”作为最小可派生信号，等待用户反馈再迭代。
3. RelatedRef 的“父节点 / 子节点”遍历层数当前限定在第一层；如未来需要全树穿越，再单独立项扩展派生函数。
