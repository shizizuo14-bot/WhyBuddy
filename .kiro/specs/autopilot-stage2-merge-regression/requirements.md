# Requirements Document

Autopilot Stage-2 SPEC Workspace Merge Regression

## Introduction

Autopilot 的用户可见流程是**三个阶段**：

1. **第一阶段** — 输入澄清 + 路线选择（clarification + route selection）
2. **第二阶段** — 规格树 + 规格文档（spec tree + spec documents），二者是**同一个阶段内部的相邻步骤**，必须呈现在**同一个合并工作区**里，而不是两个独立页面
3. **第三阶段** — 效果预演（effect preview）

`autopilot-streaming-doc-renderer` 已经把第二阶段实现为一个合并视图：左侧 SPEC 树节点导航 + 右侧文档渲染，由 `StreamingDocRenderer` / 四区工作台 `AutopilotSpecDocumentsWorkbench` 统一承载。已提交基线（HEAD）中，`AutopilotRightRail` 的渲染分支对 `activeStageKey === "spec_tree"` 与 `activeStageKey === "spec_documents"` **共用同一个合并视图**。

**回归现象**：当前工作区里有一版未提交改动把这条合并分支拆开了——`spec_tree` 分支退回去渲染旧的 `SpecTreeWorkbench`（accordion 折叠面板），`spec_documents` 分支才渲染 `StreamingDocRenderer`，并删除了 `isSpecDocumentsStage` 的阶段归一逻辑。后果：

- 用户在第二阶段时，标题/页面状态显示不对（像"已经到了效果预览页面"）。
- 规格树和规格文档不再是同一个合并工作区里的相邻步骤，而是割裂成两套界面。
- `autopilot-right-rail-cards.test.tsx` 中断言合并行为的测试与组件实现自相矛盾（2 个测试红）。
- 旧 `SpecTreeWorkbench` 重新出现，丢失了合并工作区里按节点行展示文档状态（spec-docs 进度）的能力。

本 spec 的目标是**恢复第二阶段的合并工作区模型**，让规格树与规格文档重新统一在同一视图中作为内部步骤，修正阶段标题/分组，并让组件与既有合并测试重新一致。**不**重做设计系统，**不**改后端契约，**不**改 `/tasks` 深链，**不**触碰第一阶段/第三阶段已正确的行为。

## Glossary

- **WorkbenchStage**：`STAGE_ORDER` 中的 6 个工作台阶段标识（`input | clarification | route | spec_tree | spec_documents | effect_preview`）。
- **Rail_Sub_Stage**：fabric 内部的 8 个子阶段（`agent_crew_fabric | spec_tree | effect_preview | prompt_package | runtime_capability | engineering_handoff | artifact_memory` 等）。
- **合并工作区 / Merged SPEC workspace**：`StreamingDocRenderer` → `AutopilotSpecDocumentsWorkbench` 承载的四区视图（左侧 SPEC 树节点导航 + 右侧文档渲染 + 进度/状态），对应 testid `streaming-doc-renderer` 与 `autopilot-spec-documents-workbench`。
- **activeStageKey**：`AutopilotRightRail` 当前活跃的 `WorkbenchStage`，决定 StageContent 渲染哪个分支。

## Requirements

### Requirement 1: 第二阶段共用同一个合并工作区

**User Story:** 作为 Autopilot 用户，当我处于第二阶段（规格树/规格文档）时，我希望看到一个统一的合并工作区（左树右文档），而不是两个割裂的页面，这样规格树和规格文档是同一阶段的相邻步骤。

#### Acceptance Criteria

1. WHEN `activeStageKey === "spec_tree"` THEN `AutopilotRightRail` SHALL 在 StageContent 主区域渲染合并工作区（`streaming-doc-renderer` + `autopilot-spec-documents-workbench`），而不是旧的 `spec-tree-workbench`。
2. WHEN `activeStageKey === "spec_documents"` THEN `AutopilotRightRail` SHALL 渲染同一个合并工作区组件（与 `spec_tree` 分支一致的 `StreamingDocRenderer`）。
3. WHEN 合并工作区渲染时 THEN 它 SHALL 包含左侧按 `nodeId` 渲染的 SPEC 树节点导航（`autopilot-workbench-spec-tree-node-*`）与右侧每份文档（`autopilot-workbench-spec-tree-doc-*`）。
4. WHEN `specTree` 为 `null` 或无节点 THEN 合并工作区 SHALL 渲染空态（`autopilot-workbench-spec-tree-empty`，文案 "No SPEC nodes yet" / 中文等价），而不是回退到旧 `spec-tree-workbench` 的空态。
5. The implementation SHALL NOT 在第二阶段渲染旧 `SpecTreeWorkbench`（`data-testid="spec-tree-workbench"`）。

### Requirement 2: 阶段分组与标题正确

**User Story:** 作为 Autopilot 用户，当我在第二阶段时，我希望标题与阶段标识体现"规格"阶段，而不是错误地显示成效果预览或暗示我已进入下一页。

#### Acceptance Criteria

1. WHEN `job.stage === "spec_docs"` 且当前子阶段为 `spec_tree` THEN `activeStageKey` SHALL 保持 `"spec_tree"`，StageViewport SHALL 渲染 `data-stage-key="spec_tree"`，且 SHALL NOT 渲染 `data-stage-key="spec_documents"`（保留既有"pinned SPEC tree review titled as SPEC tree"契约）。
2. WHEN 用户处于第二阶段 THEN StageHeader 的步骤编号与标题 SHALL 反映规格阶段（中文 `步骤 04 · 规格树` 或合并后的规格标题），SHALL NOT 显示效果预览（`效果预览` / `EFFECT PREVIEW`）的标题。
3. WHEN 用户仍在第二阶段（规格树/规格文档）THEN UI SHALL NOT 暗示已进入第三阶段效果预览。

### Requirement 3: 进入效果预演 CTA 仅在文档就绪后出现

**User Story:** 作为 Autopilot 用户，我希望"进入效果预演"按钮只在 SPEC 文档真正生成之后才出现，避免我在规格树阶段就被引导跳到第三阶段。

#### Acceptance Criteria

1. WHEN 第二阶段且没有任何已持久化的 SPEC 文档 THEN 合并工作区 SHALL NOT 渲染"进入效果预演"按钮（`autopilot-workbench-action-enter-effect-preview`）。
2. WHEN 第二阶段且存在至少一份已持久化的 SPEC 文档 AND `activeStageKey === "spec_documents"` THEN 合并工作区 SHALL 渲染可点击的"进入效果预演"按钮。
3. WHEN 用户处于规格树 review（`currentSubStage === "spec_tree"`）THEN UI SHALL NOT 暴露进入效果预演入口（沿用既有 "does not expose the effect preview entry while still on the SPEC tree review step" 契约）。

### Requirement 4: 保留每节点文档状态（spec-docs 进度）能力

**User Story:** 作为 Autopilot 用户，我希望在合并工作区里仍能看到每个 SPEC 节点的文档生成状态（待生成/生成中/已完成/重试/失败），这是被回归改动丢掉的能力。

#### Acceptance Criteria

1. WHEN 合并工作区渲染节点行 THEN 每个节点 SHALL 通过节点行状态标记（`spec-tree-chip` 或等价）展示由 `nodeStatusById` 派生的文档状态。
2. WHEN 实时生成进度（`specDocsProgress`）更新某节点 THEN 对应节点行状态 SHALL 跟随更新（live overlay 优先于 persisted baseline）。
3. WHEN 页面刷新后存在已落盘文档 THEN 对应节点 SHALL 以 `completed` 基线展示（不被误判为 pending）。

### Requirement 5: 组件与既有合并测试重新一致

**User Story:** 作为维护者，我希望组件实现与既有断言合并行为的测试重新一致，回归测试转绿，且不破坏其它既有 Autopilot 右栏契约。

#### Acceptance Criteria

1. WHEN 运行 `autopilot-right-rail-cards.test.tsx` THEN 全部测试 SHALL 通过（含 "renders the merged SPEC workbench when job.stage === 'spec_docs'" 与 "case 2: renders awaiting state when specTree is null"）。
2. WHEN 运行 `fabric-dispatch.property.test.tsx` 与 `WorkbenchStatusBar.enter-effect-preview.test.tsx` THEN 全部测试 SHALL 通过。
3. WHEN 运行 `AutopilotRoutePage.test.tsx` THEN 全部测试 SHALL 通过。
4. The change SHALL NOT 改动后端契约、socket 事件、`/tasks` 深链或第一/第三阶段的既有行为。
5. The change SHALL NOT 扩大 `node --run check` 的现有 TypeScript 基线错误数。

### Requirement 6: 回归防护属性测试

**User Story:** 作为维护者，我希望有一条属性/不变量测试锁住"第二阶段两个 WorkbenchStage 都渲染合并工作区且不渲染旧 SpecTreeWorkbench"，防止再次被拆开。

#### Acceptance Criteria

1. WHEN 对 `job.stage ∈ {spec_tree, spec_docs}` 与 `currentSubStage ∈ {undefined, spec_tree}` 的组合渲染 `AutopilotRightRail` THEN 输出 SHALL 始终包含 `streaming-doc-renderer` 且始终不包含 `data-testid="spec-tree-workbench"`。
2. WHEN 上述任意组合渲染 THEN `data-stage-key` SHALL ∈ {`spec_tree`}（不出现 `spec_documents` 作为可见 stage-key，沿用既有契约）。
