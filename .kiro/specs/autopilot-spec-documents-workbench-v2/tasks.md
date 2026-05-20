# Implementation Plan

任务按 design.md 的 Phase 1 / Phase 2 / Phase 3 组织。每条任务都引用 requirements.md 中的 Acceptance Criteria 编号，并在子项中列出最小可执行步骤；所有改动遵循 compatibility-first：不修改 store schema、不变更 `MiroFishCardStream` / `handleGenerateAllSpecDocs` / `handleGenerateNodeSpecDocs` / `exportSpecDocumentsToDownload` 签名、不引入新的 npm 运行时依赖。

## Phase 1：四区骨架

- [x] 1. 建立 `workbench/` 目录与容器骨架
  - 在 `client/src/pages/autopilot/right-rail/streaming-doc/workbench/` 下新建 `AutopilotSpecDocumentsWorkbench.tsx`、`WorkbenchStatusBar.tsx`、`WorkbenchSpecTree.tsx`、`WorkbenchDocMain.tsx`、`WorkbenchExecutionPanel.tsx` 与 `__tests__/` 目录
  - 容器组件接收与 `StreamingDocRendererProps` 等价的 props，并以 CSS Grid 渲染四个区域，分别挂 `data-testid="autopilot-workbench-status-bar"`、`autopilot-workbench-spec-tree`、`autopilot-workbench-doc-main`、`autopilot-workbench-execution-panel`
  - 沿用旧实现的 `width: 100% / max-width: 100% / min-width: 0 / box-sizing: border-box` 宽度硬约束，确保 1280-1920 桌面区间四区结构稳定不折叠
  - 在 `StreamingDocRenderer.tsx` 内部把渲染委托给 `AutopilotSpecDocumentsWorkbench`，保持对外默认导出与 `__testing__` 命名空间不变
  - 写一份 `AutopilotSpecDocumentsWorkbench.skeleton.test.tsx`，使用 `react-dom/server` 的 `renderToStaticMarkup` + `vi.mock` 断言四个 `data-testid` 同时出现在 SSR markup 中
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.5_

- [x] 2. 顶部状态栏标题、副标题与三个动作按钮（骨架）
  - 在 `WorkbenchStatusBar.tsx` 中渲染主标题与副标题；副标题在数据缺失时使用稳定降级文案（zh-CN / en 各一份），不渲染空白 DOM
  - 渲染 `export` / `review` / `refresh` 三个 `<button type="button">`，分别挂 `data-testid="autopilot-workbench-action-export"`、`autopilot-workbench-action-review`、`autopilot-workbench-action-refresh`
  - 容器层把 `onExport` 桥接到 `exportSpecDocumentsToDownload({ jobId, granularity: "all" })`，把 `onRefresh` 桥接到 `props.onGenerateAll`（即 `handleGenerateAllSpecDocs`）；`onReview` 在本任务保留为 no-op 占位并加 TODO 注释
  - 按钮在 `generating !== null` 时禁用并设置 `aria-disabled="true"`，沿用现有 generating 状态语义
  - 补充 `WorkbenchStatusBar.actions.test.tsx`，对三个按钮的 `data-testid`、禁用态、点击委派路径（通过遍历 props 树触发 `onClick`）做 SSR 断言
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.3, 7.4, 6.4, 6.5_

- [x] 3. 左侧 Spec 树搜索 + 折叠 + 类型 chip
  - 在 `WorkbenchSpecTree.tsx` 顶部渲染搜索框 `data-testid="autopilot-workbench-spec-tree-search"`，复用现有大小写无关 `includes` 过滤
  - 基于 `BlueprintSpecTree.nodes` 的 `parentId / children` 字段渲染层级，不在前端重新计算父子关系；容器层一次性派生 `Map<nodeId, node>` 与 `Map<parentId, nodeId[]>` 后透传
  - 为有子节点的 SpecTreeNode 渲染折叠 / 展开切换控件 `data-testid="autopilot-workbench-spec-tree-toggle-{nodeId}"`，仅切换该节点 `expandedNodeIds`，不影响其他分支
  - 调用现有 `deriveSpecTreeChip(docsForNode, observingSnapshot.byNodeTitle.get(node.title))` 渲染节点类型 chip，不在组件内重新硬编码节点类型映射
  - 节点点击通过容器 `onSelectDocument(docId)` 触发 active 切换，并以 `data-active="true"` 高亮被选中节点；同时为单节点生成 spec 文档动作挂载 `data-testid="autopilot-workbench-spec-tree-generate-{nodeId}"`，在选中态下可见，点击调用 `props.onGenerateNode(nodeId)`
  - 当 `specTree === null || specTree.nodes.length === 0` 时仅渲染搜索框 + 一段说明性占位文案，不渲染空列表容器
  - 写 `WorkbenchSpecTree.toggle.test.tsx`，覆盖：搜索过滤匹配、单节点折叠 / 展开互不影响、`deriveSpecTreeChip` 文案被正确渲染、空 specTree 时仅出现搜索框 + 占位文案
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 7.2, 6.5_

- [x] 4. 中间文档主区头部、Markdown 与展开按钮
  - 在 `WorkbenchDocMain.tsx` 顶部渲染 DocType chip `data-testid="autopilot-workbench-doc-type-chip"`（取自 `getTypeBadge(activeDoc.type, locale).fullLabel`）与文档标题 `data-testid="autopilot-workbench-doc-title"`
  - 渲染“展开文档”按钮 `data-testid="autopilot-workbench-doc-expand"`，点击切换内部 `expanded` 状态，并通过 `aria-pressed` 反映状态
  - 通过现有 `<MarkdownRenderer markdown={renderedMarkdown} isStreaming={isStreaming} locale={locale} />` 渲染 Markdown 正文；保留 `<StreamCursor visible={isStreaming} />` 与旧实现一致的 `wordBreak / overflowWrap` 宽度约束
  - 沿用旧实现的滚动位置缓存（`scrollPositions / handleScroll / pendingRestoreRef`）与 `activeDoc` 切换路径，保持文档切换稳定，不在本组件内重写流式 reducer
  - 写 `WorkbenchDocMain.switching.test.tsx`，覆盖：activeDoc 切换时标题、type chip、`MarkdownRenderer` 接收到的 `markdown` 同步更新；展开按钮的 `aria-pressed` 切换符合预期
  - _Requirements: 4.1, 4.2, 4.3, 6.5_

- [x] 5. 底部执行步骤保留 `MiroFishCardStream` 单一入口（Phase 1 占位）
  - 在 `WorkbenchExecutionPanel.tsx` 内通过单一 `<MiroFishCardStream locale={locale} job={job} />` 渲染执行流，不在组件内重写 reasoning / artifact 派生
  - 渲染左右两栏外壳 `data-testid="autopilot-workbench-execution-artifacts"` 与 `autopilot-workbench-execution-reasoning"`，并预留 Phase 2 拆分位
  - 当 `job?.artifacts?.length === 0` 时，左栏不渲染列表容器（包括零项列表容器），只渲染 `data-testid="autopilot-workbench-execution-artifacts-empty"` 的占位文案；当 `agentReasoning.entries.length === 0` 时，右栏同样只渲染 `data-testid="autopilot-workbench-execution-reasoning-empty"` 的占位文案
  - 写 `WorkbenchExecutionPanel.empty.test.tsx`，使用 `vi.mock` 替换 `useBlueprintRealtimeStore`，覆盖空 artifacts / 空 reasoning 两种空态分支均不出现任何列表容器
  - _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8, 6.5_

## Phase 2：顶部统计 / 文档类型卡片 + 底部双栏

- [x] 6. 实现 `derive-doc-stats.ts` 派生纯函数
  - 新增 `workbench/derive-doc-stats.ts`，导出 `DocStats` 类型与 `deriveDocStats({ specDocuments, specTree })` 纯函数
  - 派生口径：`totalDocs = specDocuments.length`；`totalTasks = specDocuments.filter(d => d.type === "tasks").length`；完成判定统一为 `status === "accepted"`，与 `deriveSpecTreeChip / deriveSpecDocumentTreeStats` 既有口径一致
  - `byType[type].completed = min(generated, completed)`，避免上游异常导致 completed 大于 generated
  - `completionRate`：分母为三类 generated 之和；分母为 0 时返回 0；输出范围 `[0, 1]`
  - 写 `derive-doc-stats.test.ts`，覆盖：空输入、completed 越界被夹取、分母为 0 的 0% 分支、三类 doc 的混合完成率
  - _Requirements: 2.5, 2.6, 2.8, 2.9, 2.10_

- [x] 7. 顶部统计 badge 与文档类型卡片接入
  - 在 `WorkbenchStatusBar.tsx` 中消费容器透传的 `docStats`，渲染三个统计 badge：`autopilot-workbench-stat-docs`（`totalDocs`）、`autopilot-workbench-stat-tasks`（`totalTasks` 与“完成数”一同展示）、`autopilot-workbench-stat-completion`（百分比）
  - 渲染三张文档类型卡片 `autopilot-workbench-doctype-card-requirements`、`...-design`、`...-tasks`，每张卡片显示 `byType[type].generated / byType[type].completed` 文案
  - 数据缺失时按 `0 / 0` 与 `0%` 渲染，确保组件不抛出异常
  - 不在 `WorkbenchStatusBar` 内部维护重复计数状态，所有数值均来自 `deriveDocStats`
  - 扩展 `WorkbenchStatusBar.stats.test.tsx`：mock 不同 SpecDocument 集合，断言三个 badge 与三张 DocType 卡片的 `data-testid` 与文案；包含空 SpecDocument、completed 越界、completed 为 0 三种分支
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 6.5_

- [x] 8. 底部执行面板左右双栏拆分与角色分类时间线
  - 把 `WorkbenchExecutionPanel.tsx` 拆为左右两栏 CSS Grid 布局（`min-width: 0` 硬约束，不引入 `swiper`）
  - 左栏聚焦 ArtifactCard：通过 `MiroFishCardStream` 渲染，并在容器顶部叠加由 `parseSpecDocsObservingEntries(reasoningEntries)` 派生的 observing chip；不在外层重复 ArtifactCard 类型标签的硬编码（`design / tasks / requirements` 标签由 `MiroFishCardStream` 内部 `ArtifactCreatedCard` 输出）
  - 右栏聚焦 ReasoningCard：复用同一 `MiroFishCardStream` 派生面，按 `entry.role`（`Analyzer / Planner / Generator`）分类小标题，分类映射来源于 `MiroFishStreamEntry` 已有的 role 字段，不在组件内重写识别逻辑
  - 保持 Phase 1 的空态契约：分别在左栏 / 右栏内联条件渲染空态 `<p>`，不出现任何列表容器
  - 写 `WorkbenchExecutionPanel.split.test.tsx`：mock 非空 artifacts / reasoning entries，断言左右两栏的 `data-testid` 同时出现，并覆盖到角色分类小标题
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.5_

## Phase 3：AI 摘要 / 章节清单 / 相关引用

- [x] 9. 实现 `derive-chapter-checklist.ts` 派生纯函数
  - 新增 `workbench/derive-chapter-checklist.ts`，导出 `ChapterChecklistItem` 类型与 `deriveChapterChecklist(markdown)` 纯函数
  - 仅匹配 Markdown 顶层二级标题 `^## (.+)$`；忽略 `# / ### / ####` 层级标题
  - `id` 通过 `title.trim().toLowerCase().replace(/\s+/g, "-")` 生成，不引入新的 slug 依赖
  - `completed`：章节内是否存在非空内容（即下一行不是另一个 `##` 标题且至少有一段非空白文本）
  - 写 `derive-chapter-checklist.test.ts`，覆盖：仅二级标题入选、空内容章节为未完成、连续二级标题之间夹杂代码块 / 列表 / 段落的混合输入
  - _Requirements: 4.6, 4.7_

- [x] 10. 实现 `derive-related-refs.ts` 派生纯函数
  - 新增 `workbench/derive-related-refs.ts`，导出 `RelatedRef` 类型与 `deriveRelatedRefs({ activeDoc, specDocuments, specTree })` 纯函数
  - 派生三种关系：`sibling-type`（同 nodeId 下其他 DocType 的文档）、`parent-node`（基于 `parentId` 反查父节点的 requirements / design / tasks 文档）、`child-node`（仅取第一层子节点的全部文档，避免深树展开）
  - 结果按 `relation` 分组、组内按 `TYPE_ORDER`（requirements → design → tasks）排序
  - 当 `activeDoc === null` 或没有任何关联文档时返回空数组
  - 写 `derive-related-refs.test.ts`，覆盖：同节点其他类型 / 父节点 / 子节点 / 无关联 4 类输入与组合输入
  - _Requirements: 4.8, 4.10_

- [x] 11. 在 `WorkbenchDocMain` 下方接入 AISummary、ChapterChecklist 与 RelatedRef
  - 在 `<MarkdownRenderer />` 之后依次渲染：
    - `AISummary` 区块 `data-testid="autopilot-workbench-doc-ai-summary"`：优先展示 `BlueprintSpecDocument.summary`；缺失时使用稳定降级占位文案（zh-CN / en 各一份），不调用任何新的后端摘要 API
    - `ChapterChecklist` 区块 `data-testid="autopilot-workbench-doc-chapter-checklist"`：消费容器透传的 `chapterChecklist`，每个章节项以 checkbox（`<input type="checkbox" disabled checked={item.completed}>`）呈现并标识完成状态
    - `RelatedRef` 区块 `data-testid="autopilot-workbench-doc-related-refs"`：消费容器透传的 `relatedRefs`，按 relation 分组渲染；点击某个引用项调用容器 `onSelectDocument(docId)`，复用与左侧 Spec 树点击相同的切换路径
  - 当 `relatedRefs.length === 0` 时仅渲染单一占位文案，不渲染空列表容器
  - 扩展 `WorkbenchDocMain.switching.test.tsx`：覆盖 AISummary 缺失时的降级文案、ChapterChecklist 渲染、RelatedRef 点击触发 `onSelectDocument`、空 RelatedRef 时不出现列表容器
  - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 6.5_

## 横切收口

- [x] 12. 工程边界与回归保护
  - 通过 `node --run check`（或仓库 `tsc` 聚合脚本）确认 TypeScript 严格模式编译通过，并保持仓库当前 TypeScript 错误数不超过 117 项
  - 复核 `package.json` `dependencies / devDependencies` 未新增任何 npm 包；不引入 `@testing-library/react` / `swiper` 等运行时依赖
  - 复核所有新增源文件的 JSDoc 使用中文描述模块职责、props 与关键函数；`data-testid` / promptId / API 字段名一律使用英文
  - 在 `StreamingDocRenderer.tsx` 中验证默认导出与 `__testing__` 命名空间形状不变，并跑通既有 `AutopilotRightRail.subtimeline-mount.test.tsx` 等 SSR 测试不破
  - 跑一次本规格新增的全部 `__tests__/`（派生纯函数 + SSR 渲染断言），确保 R6.5 中列出的关键渲染路径全部通过
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4_
