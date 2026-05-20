# Requirements Document

## Introduction

本规格用于将 `client/src/pages/autopilot/right-rail/streaming-doc/StreamingDocRenderer.tsx` 从当前的“左侧面板 + 右侧文档”两栏布局重构为“顶部状态栏 + 左侧 Spec 树 + 中间文档主区 + 底部执行步骤”四区驾驶舱布局，使之与已经与用户对齐的 SPEC-FIRST 蓝图设计图一致。

重构遵循 compatibility-first 原则：

- 数据源继续复用 `useBlueprintRealtimeStore` 的 `agentReasoning.entries` / `rolePhases` / `agentProgress` / `capabilityStatuses`、`BlueprintGenerationJob` 的 `artifacts` / `events`、`BlueprintSpecTree` 的 `nodes` 与 `BlueprintSpecDocument`，不引入新的 store schema 或新的真相源。
- CTA 行为继续复用 `AutopilotRightRail` 已经接线的 `handleGenerateAllSpecDocs` / `handleGenerateNodeSpecDocs` 与 `exportSpecDocumentsToDownload`，不修改其签名。
- 复用现有 `MiroFishCardStream` 的 reasoning 与 artifact 派生逻辑、`MarkdownRenderer` 的 Markdown 渲染、`deriveSpecTreeChip` 与 `parseSpecDocsObservingEntries` 工具，不新建并行实现。

本规格按 Phase 1 / Phase 2 / Phase 3 三个阶段组织实施分组，分别对应骨架布局、补充内容与增强能力。

## Glossary

- **AutopilotSpecDocumentsWorkbench**: 本规格定义的四区驾驶舱组件（即重构后的 `StreamingDocRenderer.tsx` 及其拆分子组件），由 `AutopilotRightRail` 在 `spec_tree` / `spec_documents` 阶段挂载。
- **SpecTreeNode**: 来自 `BlueprintSpecTree.nodes` 的单个节点，包含 `id`、`parentId`、`title`、`type`、`children` 字段；`type` 枚举对应蓝图节点类型（如 Topic、需求、系统蓝图）。
- **SpecDocument**: 来自 `BlueprintSpecDocument` 的文档实体，包含 `nodeId`、`type`（取值 `requirements` / `design` / `tasks` 之一）与 Markdown 内容。
- **DocType**: SpecDocument 的类型维度，仅取 `requirements`、`design`、`tasks` 三值。
- **DocStats**: 顶部状态栏展示的统计指标聚合，包括文档总数、任务总数、完成率，以及按 DocType 分组的“已生成数 / 完成数”。
- **ExecutionPanel**: 底部执行步骤区域，由左侧 Artifacts 列表与右侧 Reasoning 时间线两栏组成，复用 `MiroFishCardStream` 的派生逻辑。
- **ArtifactCard**: ExecutionPanel 左栏中的单个 artifact 项，对应 `BlueprintGenerationJob.artifacts` 的一个 artifact，附带 observing 状态标签（来源于 `parseSpecDocsObservingEntries`）。
- **ReasoningCard**: ExecutionPanel 右栏时间线中的单个推理条目，对应 `agentReasoning.entries` 的一条记录，按 Analyzer / Planner / Generator 角色分类展示。
- **ChapterChecklist**: 中间文档主区中基于当前 SpecDocument 解析出的关键章节清单，以 checkbox 列表形式呈现，标识章节是否完整。
- **RelatedRef**: 中间文档主区中展示的“相关文档引用”，列出当前 SpecTreeNode 的同 nodeId 下其他 DocType 的 SpecDocument，以及父节点 / 子节点的关联文档。
- **AISummary**: 中间文档主区的 AI 摘要区块，对当前 SpecDocument 内容生成简要描述；本规格不要求新建摘要服务，允许从 SpecDocument 已有元数据派生或在数据缺失时显示降级文案。
- **PhaseMapping**: 实施阶段映射，Phase 1 = 四区骨架布局，Phase 2 = 顶部统计 / 文档类型卡片与底部双栏，Phase 3 = AI 摘要 / 章节清单 / 相关引用。

## Requirements

### Requirement 1：四区骨架布局（Phase 1）

**User Story:** 作为 Autopilot 用户，我希望在生成 spec 文档时看到“顶部状态栏 + 左侧 Spec 树 + 中间文档 + 底部执行步骤”的四区驾驶舱布局，以便我在同一屏内同时掌握全局统计、节点导航、文档内容与执行进度，而不需要在多栏视图之间切换。本需求属于 Phase 1：先做骨架布局。

#### Acceptance Criteria

1. WHEN AutopilotSpecDocumentsWorkbench 被挂载，THE AutopilotSpecDocumentsWorkbench SHALL 在桌面宽度（≥ 1280px）下渲染四个语义区域：顶部状态栏、左侧 Spec 树、中间文档主区、底部执行步骤。
2. THE AutopilotSpecDocumentsWorkbench SHALL 为四个区域分别暴露稳定的 `data-testid`：`autopilot-workbench-status-bar`、`autopilot-workbench-spec-tree`、`autopilot-workbench-doc-main`、`autopilot-workbench-execution-panel`。
3. WHEN 用户在浏览器中调整宽度从 1280px 到 1920px，THE AutopilotSpecDocumentsWorkbench SHALL 保持四区结构稳定，不出现区域折叠或主次区域消失。
4. WHEN AutopilotSpecDocumentsWorkbench 在 SSR（`react-dom/server`）下被渲染用于测试，THE AutopilotSpecDocumentsWorkbench SHALL 输出包含上述四个 `data-testid` 的 HTML 字符串。
5. THE AutopilotSpecDocumentsWorkbench SHALL 由 `AutopilotRightRail` 在 `spec_tree` 与 `spec_documents` 两个 stage 下复用同一个组件实例，不引入额外的挂载条件分支。

### Requirement 2：顶部状态栏（Phase 1 + Phase 2）

**User Story:** 作为 Autopilot 用户，我希望顶部状态栏一眼可见“当前蓝图标题、整体统计、按文档类型分组的进度、关键操作入口”，以便我在不点开任何子区域的情况下评估当前进度并触发常用动作。本需求属于 Phase 1（标题与按钮骨架）与 Phase 2（统计 badge 与文档类型卡片）。

#### Acceptance Criteria

1. THE AutopilotSpecDocumentsWorkbench SHALL 在顶部状态栏区域显示当前蓝图的主标题与副标题；副标题在数据缺失时降级为固定文案，不渲染空白。
2. THE AutopilotSpecDocumentsWorkbench SHALL 在顶部状态栏渲染三个操作按钮：`export`、`review`、`refresh`，分别对应 `data-testid="autopilot-workbench-action-export"`、`autopilot-workbench-action-review`、`autopilot-workbench-action-refresh`。
3. WHEN 用户点击 `export` 按钮，THE AutopilotSpecDocumentsWorkbench SHALL 调用现有的 `exportSpecDocumentsToDownload` 接口完成导出，不修改其入参签名。
4. WHEN 用户点击 `refresh` 按钮，THE AutopilotSpecDocumentsWorkbench SHALL 触发由父组件 `AutopilotRightRail` 已接线的 `handleGenerateAllSpecDocs` 处理函数，不绕过现有调用路径。
5. THE AutopilotSpecDocumentsWorkbench SHALL 在顶部状态栏渲染三个统计 badge：文档总数、任务总数、完成率（百分比），分别对应 `data-testid="autopilot-workbench-stat-docs"`、`autopilot-workbench-stat-tasks`、`autopilot-workbench-stat-completion`。
6. THE AutopilotSpecDocumentsWorkbench SHALL 从 `BlueprintSpecDocument` 集合与 `BlueprintSpecTree.nodes` 派生 DocStats，不在前端额外维护重复计数状态。
7. THE AutopilotSpecDocumentsWorkbench SHALL 在顶部状态栏渲染三张文档类型卡片，分别对应 `requirements`、`design`、`tasks`，每张卡片显示该 DocType 的“已生成数 / 完成数”，对应 `data-testid="autopilot-workbench-doctype-card-{type}"`。
8. IF 当前蓝图尚未生成任何 SpecDocument，THEN THE AutopilotSpecDocumentsWorkbench SHALL 在三个统计 badge 中显示 `0 / 0` 或 `0%`，并在文档类型卡片中显示 `0 / 0`，而不抛出渲染异常。
9. WHILE SpecDocument 已存在但完成数仍为 0，THE AutopilotSpecDocumentsWorkbench SHALL 在统计 badge 与文档类型卡片中显示 `已生成数 / 0` 与 `0%` 完成率，并保持组件正常渲染，不抛出渲染异常。
10. THE AutopilotSpecDocumentsWorkbench SHALL 在派生 DocStats 时确保任意 DocType 的完成数不超过该 DocType 的已生成数；IF 上游数据出现完成数大于已生成数的情况，THEN THE AutopilotSpecDocumentsWorkbench SHALL 将完成数夹取至已生成数。

### Requirement 3：左侧 Spec 树（Phase 1）

**User Story:** 作为 Autopilot 用户，我希望左侧能以树形折叠分组的方式浏览蓝图节点，并通过节点上的类型标签快速识别 Topic / 需求 / 系统蓝图等，以便我在大型蓝图中精确定位到目标节点。本需求属于 Phase 1：保留现有节点列表 + 搜索，并补齐折叠分组与类型标签。

#### Acceptance Criteria

1. THE AutopilotSpecDocumentsWorkbench SHALL 在左侧 Spec 树区域顶部渲染一个搜索框，对应 `data-testid="autopilot-workbench-spec-tree-search"`，并保留现有搜索过滤行为。
2. THE AutopilotSpecDocumentsWorkbench SHALL 基于 `BlueprintSpecTree.nodes` 的 `parentId` / `children` 字段渲染层级树形结构，不在前端重新计算父子关系。
3. WHEN SpecTreeNode 拥有子节点，THE AutopilotSpecDocumentsWorkbench SHALL 在该节点上渲染一个折叠 / 展开切换控件，对应 `data-testid="autopilot-workbench-spec-tree-toggle-{nodeId}"`。
4. WHEN 用户点击折叠 / 展开控件，THE AutopilotSpecDocumentsWorkbench SHALL 仅切换该节点子树的可见性，不影响其它分支的展开状态。
5. THE AutopilotSpecDocumentsWorkbench SHALL 为每个 SpecTreeNode 渲染一个类型标签（chip），其展示文案与样式来源于现有 `deriveSpecTreeChip` 工具，不在组件内重新硬编码节点类型映射。
6. WHEN 用户点击某个 SpecTreeNode，THE AutopilotSpecDocumentsWorkbench SHALL 将中间文档主区切换为该 nodeId 对应的当前选中 SpecDocument，并在树中以高亮样式标识被选中的节点。
7. IF `BlueprintSpecTree.nodes` 为空，THEN THE AutopilotSpecDocumentsWorkbench SHALL 在左侧区域显示一段说明性占位文案，并保留搜索框可见。

### Requirement 4：中间文档主区（Phase 1 + Phase 3）

**User Story:** 作为 Autopilot 用户，我希望中间文档主区清晰展示当前选中文档的标题与类型标签、可展开查看 Markdown 全文，并能在文档下方查看 AI 摘要、关键章节清单与相关文档引用，以便我在阅读单一文档时同时获得上下文与可执行的检查项。本需求属于 Phase 1（标题、类型标签、Markdown 与展开按钮）与 Phase 3（AI 摘要、章节清单、相关引用）。

#### Acceptance Criteria

1. THE AutopilotSpecDocumentsWorkbench SHALL 在中间文档主区顶部渲染当前选中 SpecDocument 的标题与 DocType 标签，对应 `data-testid="autopilot-workbench-doc-title"` 与 `autopilot-workbench-doc-type-chip`。
2. THE AutopilotSpecDocumentsWorkbench SHALL 在中间文档主区渲染一个“展开文档”按钮，对应 `data-testid="autopilot-workbench-doc-expand"`，用于将文档内容切换到全屏或扩展视图。
3. THE AutopilotSpecDocumentsWorkbench SHALL 通过现有 `MarkdownRenderer` 渲染 SpecDocument 的 Markdown 正文，不引入新的 Markdown 渲染依赖。
4. THE AutopilotSpecDocumentsWorkbench SHALL 在 Markdown 正文下方渲染一个 AISummary 区块，对应 `data-testid="autopilot-workbench-doc-ai-summary"`。
5. WHEN 当前 SpecDocument 没有可用的摘要数据，THE AutopilotSpecDocumentsWorkbench SHALL 在 AISummary 区块显示降级占位文案，而不调用任何新的后端摘要 API。
6. THE AutopilotSpecDocumentsWorkbench SHALL 在中间文档主区渲染 ChapterChecklist，对应 `data-testid="autopilot-workbench-doc-chapter-checklist"`，每个章节项以 checkbox 形式呈现并标识完成状态。
7. THE AutopilotSpecDocumentsWorkbench SHALL 基于当前 SpecDocument 的 Markdown 二级标题（`##`）生成 ChapterChecklist，不要求新建额外的章节元数据存储。
8. THE AutopilotSpecDocumentsWorkbench SHALL 在中间文档主区渲染 RelatedRef 列表，对应 `data-testid="autopilot-workbench-doc-related-refs"`，列出同 nodeId 下其它 DocType 的文档以及父节点 / 子节点的关联文档。
9. WHEN 用户点击 RelatedRef 中的某个引用项，THE AutopilotSpecDocumentsWorkbench SHALL 切换中间文档主区为对应的 SpecDocument，复用与左侧 Spec 树点击相同的切换路径。
10. IF 当前 nodeId 没有任何关联文档，THEN THE AutopilotSpecDocumentsWorkbench SHALL 在 RelatedRef 区域显示空态文案，而不渲染空列表容器。

### Requirement 5：底部执行步骤（Phase 1 + Phase 2）

**User Story:** 作为 Autopilot 用户，我希望底部执行步骤区域以左右分栏的方式展示 Artifacts 列表（含 observing 状态标签）与 Reasoning 时间线（按 Analyzer / Planner / Generator 角色分类），以便我在阅读文档的同时持续观察执行链路。本需求属于 Phase 1（保留 MiroFishCardStream 入口）与 Phase 2（左右分栏与角色分类时间线）。

#### Acceptance Criteria

1. THE AutopilotSpecDocumentsWorkbench SHALL 在底部 ExecutionPanel 区域以左右分栏布局呈现 ArtifactCard 列表与 ReasoningCard 时间线，分别对应 `data-testid="autopilot-workbench-execution-artifacts"` 与 `autopilot-workbench-execution-reasoning"`。
2. THE AutopilotSpecDocumentsWorkbench SHALL 通过现有 `MiroFishCardStream` 派生 ArtifactCard 与 ReasoningCard，不在组件内重写 reasoning / artifact 的派生逻辑。
3. THE AutopilotSpecDocumentsWorkbench SHALL 为左栏中每张 ArtifactCard 渲染对应的 artifact 类型标签（取值至少包含 `design`、`tasks`、`requirements`）以及 observing 状态标签。
4. THE AutopilotSpecDocumentsWorkbench SHALL 通过现有 `parseSpecDocsObservingEntries` 工具派生 observing 状态标签，不在组件内重新解析 observing 文案。
5. THE AutopilotSpecDocumentsWorkbench SHALL 在右栏 ReasoningCard 时间线中按时间顺序渲染来自 `agentReasoning.entries` 的条目，并按角色 `Analyzer` / `Planner` / `Generator` 分类显示。
6. WHEN `BlueprintGenerationJob.artifacts` 为空，THE AutopilotSpecDocumentsWorkbench SHALL 在左栏渲染一段空态占位文案，且不渲染任何列表容器（包括零项列表容器与空态容器壳）。
7. WHEN `agentReasoning.entries` 为空，THE AutopilotSpecDocumentsWorkbench SHALL 在右栏渲染一段空态占位文案，且不渲染任何列表容器（包括零项列表容器与空态容器壳）。
8. THE AutopilotSpecDocumentsWorkbench SHALL 不要求引入 `swiper` 作为底部执行面板的运行时依赖；当前设计明确不需要 swiper 即可完成左右分栏布局。

### Requirement 6：工程边界与质量约束（横切）

**User Story:** 作为该模块的维护者，我希望本次重构在不扩大现有 TypeScript 基线错误数、不新增运行时依赖、不破坏既有测试模式的前提下完成，以便重构能稳定合入并被后续迭代继承。本需求横跨 Phase 1 / Phase 2 / Phase 3。

#### Acceptance Criteria

1. THE AutopilotSpecDocumentsWorkbench SHALL 通过 TypeScript 严格模式编译，并保持仓库当前 TypeScript 基线错误数不超过 117 项。
2. THE AutopilotSpecDocumentsWorkbench SHALL 不向 `package.json` 的 `dependencies` 或 `devDependencies` 引入新的 npm 运行时包。
3. THE AutopilotSpecDocumentsWorkbench SHALL 在所有源文件与子组件中使用中文 JSDoc 描述模块职责、props 与关键函数。
4. THE AutopilotSpecDocumentsWorkbench SHALL 对所有 `data-testid`、promptId 与 API 字段名使用英文标识，不与中文 JSDoc 混合。
5. THE AutopilotSpecDocumentsWorkbench SHALL 通过 `react-dom/server` SSR 与 `vi.mock` 组合的测试模式覆盖关键渲染路径，至少包括四区骨架渲染、顶部统计派生、左侧 Spec 树折叠、中间 SpecDocument 切换与底部双栏空态。
6. WHEN 现有的 `useBlueprintRealtimeStore`、`BlueprintGenerationJob`、`BlueprintSpecTree`、`BlueprintSpecDocument` 任一类型在外部被扩展，THE AutopilotSpecDocumentsWorkbench SHALL 仅消费其现有字段，不在本规格内修改其 schema。

### Requirement 7：CTA 与父组件集成边界（横切）

**User Story:** 作为该模块的调用方（`AutopilotRightRail`），我希望 AutopilotSpecDocumentsWorkbench 继续以与现有版本兼容的方式接入已有 CTA 与导出 API，以便上层组件无需为本次重构调整。

#### Acceptance Criteria

1. THE AutopilotSpecDocumentsWorkbench SHALL 接受由 `AutopilotRightRail` 透传的 `handleGenerateAllSpecDocs` 与 `handleGenerateNodeSpecDocs` 处理函数，并保持其调用签名不变。
2. WHEN 用户在左侧 Spec 树中触发针对单个节点的“生成 spec 文档”动作，THE AutopilotSpecDocumentsWorkbench SHALL 通过 `handleGenerateNodeSpecDocs` 完成派发，不绕过该处理函数直接发起请求。
3. WHEN 用户在顶部状态栏触发整体重新生成动作，THE AutopilotSpecDocumentsWorkbench SHALL 通过 `handleGenerateAllSpecDocs` 完成派发，不在内部维护并行的批量生成路径。
4. THE AutopilotSpecDocumentsWorkbench SHALL 通过 `exportSpecDocumentsToDownload` 完成导出，不在组件内复制其文件打包逻辑。

## Non-Goals

为避免范围蔓延，本规格明确不涵盖以下内容：

1. 不修改 `useBlueprintRealtimeStore` 的 store schema、selector 边界或事件订阅模式。
2. 不修改 `BlueprintGenerationJob`、`BlueprintSpecTree`、`BlueprintSpecDocument` 的字段定义或后端契约。
3. 不修改 `MiroFishCardStream` 的 reasoning / artifact 派生算法，包括其聚合规则、时序对齐与角色识别逻辑。
4. 不修改 `handleGenerateAllSpecDocs`、`handleGenerateNodeSpecDocs` 的函数签名、错误处理路径或副作用边界。
5. 不修复跨切面缺陷，例如近期在 `blueprint-realtime-store` 中针对 `agentReasoning.entries` 保留逻辑的修复；该类问题应单独立项。
6. 不引入新的 AI 摘要服务、章节解析服务或相关引用图谱服务，所有 AISummary / ChapterChecklist / RelatedRef 内容均从既有 SpecDocument 与 SpecTree 数据派生。
7. 不在本次重构中接入或要求 `swiper` 运行时依赖；底部执行面板使用原生分栏布局。
8. 不调整 `AutopilotRightRail` 在 `spec_tree` / `spec_documents` 两个 stage 已经合并为单一挂载路径的现状，本组件继续作为单一组件被复用。
