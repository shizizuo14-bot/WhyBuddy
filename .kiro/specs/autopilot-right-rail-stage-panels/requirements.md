# 需求文档：Autopilot 右栏子阶段面板物理抽离

## Introduction

Spec 1（`autopilot-cockpit-right-rail-convergence`）已经冻结了 `AutopilotTimelineStage`、`AutopilotRailSubStage`、`RAIL_SUB_STAGE_ORDER`、`AutopilotRightRailProps`、`resolveRailSubStage`，并在 `client/src/pages/autopilot/right-rail/` 下落了 5 个 stage placeholder + 8 个 sub-stage placeholder 的最小 scaffolding `<AutopilotRightRail>`。Spec 1 **未**搬运任何实际面板内容；真正的 8 个工作台组件仍然作为 **local function** 内联在 `client/src/pages/specs/BlueprintProgressPanel.tsx`（`AgentCrewFabricWorkbench`、`EffectPreviewWorkbenchPanel`、`PromptPackageWorkbenchPanel`、`RuntimeCapabilityBridgeWorkbenchPanel`、`EngineeringLandingWorkbenchPanel`、`ArtifactMemoryWorkbenchPanel` 等）或外部但未被驾驶舱右栏直接持有的 `SpecTreeWorkbenchPanel.tsx` / `SpecDocumentWorkbenchPanel.tsx`。在 `client/src/pages/specs/panels/` 下目前只有 7 个字符串常量占位文件（`EffectPreviewPanel.tsx`、`PromptPackagePanel.tsx`、`RuntimeCapabilityPanel.tsx`、`EngineeringLandingPanel.tsx`、`ArtifactMemoryPanel.tsx` 等）以及已经做成 re-export 的 `SpecTreePanel.tsx` / `SpecDocumentsPanel.tsx`。

本 spec（Spec 2 `autopilot-right-rail-stage-panels`）的目标是把 8 个 `AutopilotRailSubStage` 对应的工作台组件**物理抽离**到一个稳定的、受 `AutopilotRightRailProps` 约束的新规范位置 `client/src/pages/autopilot/right-rail/panels/`，并保持 `BlueprintProgressPanel.tsx` 与 `/specs` 深链继续可用。每一次迁移都是「从 `BlueprintProgressPanel` 内部移出 → 落到 `autopilot/right-rail/panels/` → 在 `BlueprintProgressPanel` 中改为 import → 旧 `specs/panels/` 占位改为 re-export」的单面板独立 PR。

本 spec **不**做：

1. 删除 `<details data-testid="autopilot-advanced-workbenches">` 折叠区（Spec 3 承接）。
2. 合并 `BlueprintProgressPanel.autoLoad` 的双轨 fetch 到 `useAutopilotRightRailData` hook（Spec 4 承接）。
3. 子阶段自动滚动、步骤驱动动画、URL `?sub=` 参数、键盘快捷键（Spec 5 承接）。
4. 修改 `AutopilotWorkflowRail` 或任何非-`fabric` stage（`input / clarification / routeset / selection`）的渲染；这 4 个 stage 在本 spec 仍由 Spec 2 之前的 `AutopilotWorkflowRail` 承接。
5. 改动后端 REST 合同或 `BlueprintGenerationJob` / `BlueprintSpecTree` / `BlueprintRouteSet` / `BlueprintRouteSelection` / `BlueprintAgentCrewSnapshot` 的任何字段。
6. 重写 `SpecTreeWorkbenchPanel.tsx` 或 `SpecDocumentWorkbenchPanel.tsx` 的内部实现 —— 它们已经是外部文件，本 spec 只新增 `SpecTreePanel.tsx` / `SpecDocumentsPanel.tsx` 两个薄 wrapper。

## Glossary

- **Spec1_Contract**：Spec 1 已冻结的类型、常量、resolver 与 scaffolding，包含 `AutopilotRightRailProps`、`RAIL_SUB_STAGE_ORDER`、`resolveRailSubStage`、`<AutopilotRightRail>`。
- **Canonical_Panel_Directory**：本 spec 引入的新权威目录 `client/src/pages/autopilot/right-rail/panels/`，8 个 sub-stage 面板的最终落点。
- **Sub_Stage_Panel**：与某个 `AutopilotRailSubStage` 一一对应的 React 组件；本 spec 需抽出 8 个，命名固定为：
  - `AgentCrewFabricPanel.tsx`（对应 `agent_crew_fabric`）
  - `SpecTreePanel.tsx`（对应 `spec_tree`，wrap 现有 `SpecTreeWorkbenchPanel`）
  - `SpecDocumentsPanel.tsx`（对应 `spec_documents`，wrap 现有 `SpecDocumentWorkbenchPanel`）
  - `EffectPreviewPanel.tsx`（对应 `effect_preview`）
  - `PromptPackagePanel.tsx`（对应 `prompt_package`）
  - `RuntimeCapabilityPanel.tsx`（对应 `runtime_capability`）
  - `EngineeringHandoffPanel.tsx`（对应 `engineering_handoff`）
  - `ArtifactMemoryPanel.tsx`（对应 `artifact_memory`）
- **Panel_Prop_Slice**：每个 `Sub_Stage_Panel` 只允许接收的 `AutopilotRightRailProps` 字段**严格子集**；禁止再通过 `useAppStore` 或 `@/lib/blueprint-api` 读取外部状态。
- **Shim_File**：`client/src/pages/specs/panels/*Panel.tsx` 中原先以占位字符串存在的文件，在本 spec 结束后将改写为纯 `export { ... } from "@/pages/autopilot/right-rail/panels/..."` 的一行 re-export，保持历史 import 路径兼容。
- **Rendering_Parity**：在同一份 `BlueprintGenerationJob` / `BlueprintSpecTree` / `BlueprintAgentCrewSnapshot` / `BlueprintEffectPreviewSnapshot[]` fixture 下，抽离后由 `BlueprintProgressPanel` 渲染的 DOM 与抽离前产出**相同的 `data-testid` 集合、相同的文案 key、相同的 className 字符串**；细节到嵌套顺序与列表条目数量均需一致。
- **Advanced_Workbenches_Fold**：`AutopilotRoutePage.tsx` 底部现存的 `<details data-testid="autopilot-advanced-workbenches">` 折叠区，本 spec 不删除它，但折叠区内部的 `<BlueprintProgressPanel />` 在抽离后会自动通过新目录提供内容。

## Requirements

### Requirement 1：8 个 Sub_Stage_Panel 的规范落点与命名冻结

**User Story:** 作为 Spec 3/4/5 的实现方，我希望 8 个右栏子阶段面板有一个**唯一规范位置**，这样后续的折叠区删除、数据层合并、URL 参数 deep-link 都可以直接 `import` 而不用再次追踪 local function 的行号。

#### Acceptance Criteria

1. THE Repository SHALL 创建目录 `client/src/pages/autopilot/right-rail/panels/`，并在其中放置 8 个文件：`AgentCrewFabricPanel.tsx`、`SpecTreePanel.tsx`、`SpecDocumentsPanel.tsx`、`EffectPreviewPanel.tsx`、`PromptPackagePanel.tsx`、`RuntimeCapabilityPanel.tsx`、`EngineeringHandoffPanel.tsx`、`ArtifactMemoryPanel.tsx`。
2. THE Repository SHALL 在同目录提供 `index.ts` barrel，统一 re-export 8 个组件与它们的 props 类型（命名固定：`AgentCrewFabricPanelProps`、`SpecTreePanelProps`、`SpecDocumentsPanelProps`、`EffectPreviewPanelProps`、`PromptPackagePanelProps`、`RuntimeCapabilityPanelProps`、`EngineeringHandoffPanelProps`、`ArtifactMemoryPanelProps`）。
3. THE Canonical_Panel_Directory SHALL 不引入任何 `index.tsx` / `default export`；所有导出必须是 named export，且组件名必须与文件名完全一致。
4. IF 任一新文件试图从 `@/pages/specs/BlueprintProgressPanel` 反向 import，THEN THE Repository SHALL 在 lint 或测试阶段阻止该 PR 合入（即 `BlueprintProgressPanel → autopilot/right-rail/panels` 必须是**单向依赖**）。
5. THE Canonical_Panel_Directory SHALL 不新增任何 `data-testid`、不删除任何 `data-testid`；所有 testid 严格沿用抽离前 `BlueprintProgressPanel.tsx` 中 local function 中现有的值。

### Requirement 2：Panel_Prop_Slice 窄化规则

**User Story:** 作为面板作者，我希望每个子阶段面板只收自己需要的字段，避免因为 Spec 4 修改 `AutopilotRightRailProps` 而需要同步改 8 个面板的 prop 列表。

#### Acceptance Criteria

1. THE `AgentCrewFabricPanel` SHALL 只接受 `{ jobId, job, agentCrew, capabilities, capabilityInvocations, capabilityEvidence, locale }` 这个字段子集，且类型为 `Pick<AutopilotRightRailProps, "jobId" | "job" | "agentCrew" | "capabilities" | "capabilityInvocations" | "capabilityEvidence" | "locale">`（可通过额外接口名 `AgentCrewFabricPanelProps` 重命名，但结构必须等价）。
2. THE `SpecTreePanel` SHALL 只接受 `{ jobId, specTree, selection, locale }`，并在内部把 `specTree`（`BlueprintSpecTree | null`）降级为非空路径传递给现有 `SpecTreeWorkbenchPanel`；当 `specTree === null` 时 SHALL 渲染与抽离前一致的空态（即 `BlueprintProgressPanel` 在 `specTree` 为空时展示的那一段 DOM）。
3. THE `SpecDocumentsPanel` SHALL 只接受 `{ jobId, specTree, locale }`，并 wrap 现有 `SpecDocumentWorkbenchPanel`；同样在 `specTree === null` 时保持与抽离前一致的降级 DOM。
4. THE `EffectPreviewPanel` SHALL 只接受 `{ jobId, job, specTree, effectPreviews, agentCrew, capabilityEvidence, locale }`；当 `specTree === null` 时渲染抽离前的 empty-state DOM。
5. THE `PromptPackagePanel` SHALL 只接受 `{ jobId, specTree, effectPreviews, locale }`（documents 由 `specTree` 派生，保持与当前 `PromptPackageWorkbenchPanel` local function 一致）。
6. THE `RuntimeCapabilityPanel` SHALL 只接受 `{ jobId, specTree, capabilities, capabilityInvocations, capabilityEvidence, agentCrew, locale }`。
7. THE `EngineeringHandoffPanel` SHALL 只接受 `{ jobId, locale }`（engineering handoff 的 prompt package、plans、runs 仍由 `BlueprintProgressPanel` 内部从 state 注入，通过 `initial*` props 向下传，**本 spec 暂不把 engineering 数据上提到 `AutopilotRightRailProps`**；见 Requirement 5）。
8. THE `ArtifactMemoryPanel` SHALL 只接受 `{ jobId, locale }`（artifact ledger / replay / feedback 同样暂由 `BlueprintProgressPanel` 内部注入）。
9. IF 任一 `Sub_Stage_Panel` 内部出现 `useAppStore(...)`、`import { ... } from "@/lib/blueprint-api"` 或任何 `fetch(...)` 调用，THEN THE Repository SHALL 拒绝合入该 PR；现有 fetch 逻辑必须仍由 `BlueprintProgressPanel` 的 `autoLoad` 路径持有（Spec 4 再上提）。
10. WHERE 一个 `Sub_Stage_Panel` 在抽离前的 local function 使用了非窄化字段（例如原 `EffectPreviewWorkbenchPanel` 接收 `documents: BlueprintSpecDocument[]` 而不是整棵 `specTree`），THE 实现 SHALL 在 `BlueprintProgressPanel.tsx` 的组合位置派生所需字段（例如 `specTree.documents`），再作为 prop 下传，以避免面板内部重新计算。

### Requirement 3：Rendering_Parity（零行为变更）

**User Story:** 作为回归保障人，我需要抽离前后的 DOM 输出在 `data-testid`、copy 文案、className 与条目顺序上**完全一致**，这样 `/specs` 与底部折叠区的现有测试不会因为搬运产生噪声 diff。

#### Acceptance Criteria

1. THE Refactor SHALL 保持 `BlueprintProgressPanel.tsx` 在输入完全相同的 props（`initialJob / initialRouteSet / initialSelection / initialSpecTree / initialEffectPreviews / initialCapabilities / initialAgentCrew / initialCapabilityInvocations / initialCapabilityEvidence / initialClarificationSession / autoLoad = false`）时，渲染出的 DOM 顶层 `data-testid` 集合与抽离前**逐一相等**（含次序）。
2. THE Refactor SHALL 保持面板内部按钮、标签、tooltip、徽章的中英文文案 key **未被重命名**；所有文本仍通过现有 `blueprintCopy(...)` / `panelText(zh, en)` 机制产生。
3. THE Refactor SHALL 保持 className 字符串逐字相等；特别是 `cn(...)` 的参数顺序与条件不得被「顺手重写」。
4. THE Refactor SHALL 保持 `useMemo` / `useEffect` 的依赖数组长度与依赖对象集合**不变**，除非该变化源自 prop 窄化后不可避免的语义保持性调整（例如 `documents = specTree.documents` 的派生）。
5. IF 抽离引入了任何新的 `useState` 初始值或新的 `useEffect`，THEN THE 实现 SHALL 在 PR 描述中显式列出并说明为什么不可避免；默认预期是**净零新增 hook**。
6. WHEN 折叠区展开 `autopilot-advanced-workbenches` 时，THE DOM SHALL 与抽离前一字不差，包含 `data-testid="blueprint-progress-panel"`。

### Requirement 4：Shim_File 单行 re-export 固化

**User Story:** 作为既有调用方（如 `SpecCenterPage.tsx`、内部工具、外部脚手架），我希望历史的 `@/pages/specs/panels/*` import 路径**永远有效**，即使面板物理落点已迁移到 autopilot 目录。

#### Acceptance Criteria

1. THE Repository SHALL 把 `client/src/pages/specs/panels/EffectPreviewPanel.tsx`、`PromptPackagePanel.tsx`、`RuntimeCapabilityPanel.tsx`、`EngineeringLandingPanel.tsx`、`ArtifactMemoryPanel.tsx` 五个文件从「占位字符串常量」重写为**单行** re-export，指向 `client/src/pages/autopilot/right-rail/panels/` 下的规范面板。
2. THE `client/src/pages/specs/panels/SpecTreePanel.tsx` 与 `SpecDocumentsPanel.tsx` 的当前 re-export 行为 SHALL 被保留，但 re-export 的目标 SHALL 改为 `@/pages/autopilot/right-rail/panels/SpecTreePanel` / `SpecDocumentsPanel`（即新的 wrapper），而不是原始的 `../SpecTreeWorkbenchPanel` / `../SpecDocumentWorkbenchPanel`。
3. THE `client/src/pages/specs/panels/index.ts` barrel SHALL 更新为对外导出 8 个 canonical panel，而不再导出字符串占位常量；但仍可在迁移期保留 `PROGRESS_HEADER_PANEL_PLACEHOLDER` / `JOB_LEDGER_PANEL_PLACEHOLDER` 等与本 spec 无关的辅助卡占位。
4. THE Shim_File SHALL 不引入任何 adapter / wrapper 逻辑；若需要适配，则适配行为放在 `autopilot/right-rail/panels/` 下完成，`specs/panels/` 仅做 `export { X } from "..."` 单行 re-export。
5. IF 未来 Spec 4 想要删除 `specs/panels/` shim，THEN 本 spec 产生的 shim 文件 SHALL 保证删除动作为「纯删除」，无需再额外迁移调用方（换言之：本 spec 结束后，`specs/panels/*` 的唯一职责就是 re-export）。

### Requirement 5：`BlueprintProgressPanel` 组合化 + `/specs` 兼容

**User Story:** 作为 `/specs` 路由的维护者，我需要 `SpecCenterPage.tsx` → `BlueprintProgressPanel.tsx` 这条旧路径在本 spec 合入后**立即可用**，不得出现空屏、文案丢失、按钮失灵等回归。

#### Acceptance Criteria

1. THE `BlueprintProgressPanel.tsx` SHALL 在抽离后保留为一个**组合组件**：继续持有现在的 state（`specTree`、`documents`、`effectPreviews`、`promptPackages`、`capabilities`、`invocations`、`evidence`、`engineeringPlans`、`engineeringRuns`、`artifactLedger`、`artifactReplays`、`artifactFeedback` 等）与 autoLoad 路径的 fetch 调用，但把渲染部分替换为 `import { AgentCrewFabricPanel, SpecTreePanel, ... } from "@/pages/autopilot/right-rail/panels"` 后在本文件中拼装。
2. THE `SpecCenterPage.tsx` SHALL 无需修改；其对 `BlueprintProgressPanel` 的 import 路径与使用方式保持原样。
3. THE `AutopilotRoutePage.tsx` 底部的 `<details data-testid="autopilot-advanced-workbenches">` SHALL 在本 spec 中被**完全保留**，包括其内部 `<BlueprintProgressPanel autoLoad={false} ... />` 的渲染。
4. WHEN 本 spec 合入后，THE `/specs` 页面 SHALL 仍然可打开任意历史 `?jobId=xxx` 深链，并渲染与抽离前一致的 SpecTree / SpecDocuments / EffectPreview / PromptPackage / RuntimeCapability / EngineeringHandoff / ArtifactMemory 界面。
5. IF 在抽离过程中某个面板（如 `EngineeringHandoffPanel`）需要的数据当前只存在于 `BlueprintProgressPanel` 内部 state，THEN THE 实现 SHALL 通过 prop 下传，而**不得**把 state 复制到外部 store；Spec 4 负责后续统一。

### Requirement 6：`<AutopilotRightRail>` 在 `currentStage === "fabric"` 时消费 Canonical_Panel_Directory

**User Story:** 作为 Spec 1 `<AutopilotRightRail>` scaffolding 的继任者，我需要本 spec 在 fabric stage 时**真正渲染** 8 个子阶段面板，而不是 placeholder 区块；同时非-fabric 的 4 个 stage 继续不变。

#### Acceptance Criteria

1. WHEN `currentStage === "fabric"` AND `currentSubStage` 在 `RAIL_SUB_STAGE_ORDER` 之内，THE `<AutopilotRightRail>` SHALL 通过 switch/map on `currentSubStage` 渲染对应的 `Sub_Stage_Panel`，组件身份严格等于 `@/pages/autopilot/right-rail/panels` barrel 中导出的那一个。
2. WHEN `currentStage !== "fabric"`（即 `"input" | "clarification" | "routeset" | "selection"`），THE `<AutopilotRightRail>` SHALL 保留 Spec 1 冻结的 placeholder 渲染路径不变；本 spec **不触碰** `AutopilotWorkflowRail` 或 `AutopilotRoutePage.tsx` 中驱动这 4 个 stage 的左栏逻辑。
3. THE `<AutopilotRightRail>` 本体 SHALL 仍然是 presentational：不得在本 spec 中引入 `useEffect`、`fetch`、store 订阅等副作用；props 仍严格遵守 Spec 1 冻结的 `AutopilotRightRailProps`。
4. IF `resolveRailSubStage(...)` 返回 `undefined` 而 `currentStage === "fabric"`，THEN THE `<AutopilotRightRail>` SHALL 渲染 `agent_crew_fabric` 对应面板作为兜底（Spec 1 resolver 规则已保证 undefined 不会在 fabric 下出现，但此兜底避免运行时空白）。
5. THE `<AutopilotRightRail>` 在 fabric stage 下渲染的 `data-testid` 集合 SHALL 与抽离后 `BlueprintProgressPanel.tsx` 在同 jobId 下渲染出来的相应子阶段段落的 testid 集合**一致**（即：通过 `<AutopilotRightRail>` 看到的面板 DOM ≡ 通过 `BlueprintProgressPanel` 折叠区看到的对应段落）。

### Requirement 7：独立可合入、单面板 PR、回滚安全

**User Story:** 作为 reviewer，我希望每一次搬运只涉及一个面板，这样 review 成本低、冲突面小、可以单独回滚，不会把 6 个面板绑成一个巨型 PR。

#### Acceptance Criteria

1. THE Refactor SHALL 被拆分为 8 个独立 PR-ready 任务（见 `tasks.md` 中的编号 1–8，每个对应一个面板），每个任务可**单独合入 main**且不破坏构建与 `node --run check`。
2. FOR EACH 面板抽离任务 n ∈ {1..8}，WHEN 仅该任务合入 main 而其余 7 个任务尚未开始，THE Repository SHALL 通过 `node --run check` 与 `npm exec vitest run client/src/pages/specs` 的现有测试集（无论该面板是否已抽离）。
3. IF 需要回滚任一面板抽离任务，THEN THE Repository SHALL 允许 `git revert` 该 PR 而无需同时 revert 其他面板的 PR；每个面板的抽离 diff 必须自包含（包括它自己的 wrapper、shim 更新、`BlueprintProgressPanel` import 替换）。
4. THE Refactor SHALL 不使用 `git mv` 以外的巧操作；新文件用 `fsWrite` 创建，旧 local function 用 `strReplace` 删除，但每个 PR 的文件 diff 要保持**只涉及该面板 + 它的 shim + `BlueprintProgressPanel` 的 import 替换**。
5. WHEN 8 个面板全部抽离完成后，THE `BlueprintProgressPanel.tsx` SHALL 从当前约 5700 行压缩到显著更小的组合文件（具体行数不作硬指标，但不得把渲染逻辑重新内联回来）。

### Requirement 8：单向依赖与循环 import 守卫

**User Story:** 作为架构守护者，我需要保证 `autopilot/right-rail/panels/` 永远不反向依赖 `pages/specs/BlueprintProgressPanel.tsx`，否则未来 Spec 4 上提数据层时会出现循环。

#### Acceptance Criteria

1. THE Canonical_Panel_Directory SHALL 只 import 以下模块：`react`、`@/components/ui/*`、`@/lib/utils`、`@/lib/blueprint-copy`（纯函数）、`@shared/blueprint/contracts`、`lucide-react`、同目录内其他 panel（不推荐但不禁止），以及 `@/pages/specs/SpecTreeWorkbenchPanel` / `@/pages/specs/SpecDocumentWorkbenchPanel`（仅 wrapper 可用，面板实体不可）。
2. THE Canonical_Panel_Directory SHALL **不得** import `@/pages/specs/BlueprintProgressPanel`、`@/pages/specs/panels/*`、`@/lib/store`（即 `useAppStore`）、`@/lib/blueprint-api`（即任何 fetch 函数）。
3. THE `BlueprintProgressPanel.tsx` SHALL 只**单向** import `@/pages/autopilot/right-rail/panels`；不得出现 `@/pages/autopilot/right-rail/panels/...` 反向 import `BlueprintProgressPanel` 内部符号的情形。
4. WHERE 某个子阶段面板确实需要 `BlueprintProgressPanel` 内部的 helper（如 `readLatestAgentCrew`、`parseWorkbenchLines`、`BlueprintClarificationStrategySummary`），THE 实现 SHALL 把该 helper 抽到 `client/src/pages/autopilot/right-rail/panels/_shared/` 或同 panel 文件内部，而不是反向 import。
5. IF PR 的 diff 引入了 `autopilot/right-rail/panels/** → pages/specs/BlueprintProgressPanel` 的任意 import，THEN `node --run check` 或 targeted test SHALL 失败。

### Requirement 9：`SpecTreePanel` / `SpecDocumentsPanel` 纯 wrapper 约束

**User Story:** 作为 `SpecTreeWorkbenchPanel.tsx` / `SpecDocumentWorkbenchPanel.tsx` 这两个既有外部文件的维护者，我不希望它们被本 spec 重写、rename 或内部改造；本 spec 只需要在新目录提供薄 adapter 让 `AutopilotRightRailProps` 能被消费。

#### Acceptance Criteria

1. THE `client/src/pages/specs/SpecTreeWorkbenchPanel.tsx` SHALL 在本 spec 中**零改动**（不改名、不改签名、不改实现、不改 export 语义）。
2. THE `client/src/pages/specs/SpecDocumentWorkbenchPanel.tsx` SHALL 在本 spec 中**零改动**。
3. THE `client/src/pages/autopilot/right-rail/panels/SpecTreePanel.tsx` SHALL 是一个薄 wrapper：接收 `Panel_Prop_Slice` → 当 `specTree != null` 时渲染 `<SpecTreeWorkbenchPanel specTree={specTree} selection={selection} jobId={jobId} />`（同时 forward `onSpecTreeChange` / `onSpecTreeVersionsChange` 为 `undefined`，由 `BlueprintProgressPanel` 外层继续持有原回调）；当 `specTree === null` 时渲染空态 DOM。
4. THE `client/src/pages/autopilot/right-rail/panels/SpecDocumentsPanel.tsx` SHALL 是一个薄 wrapper：接收 `Panel_Prop_Slice` → 委托给 `<SpecDocumentWorkbenchPanel specTree={specTree} jobId={jobId} />`（其余 prop 同样在 `BlueprintProgressPanel` 外层注入）。
5. WHERE `BlueprintProgressPanel` 目前对 `<SpecTreeWorkbenchPanel>` / `<SpecDocumentWorkbenchPanel>` 有额外回调（如 `onSpecTreeChange`、`onSpecTreeVersionsChange`），THE 实现 SHALL 在 `BlueprintProgressPanel` 内部保留这些回调的持有与传递；本 spec **不**把这些回调纳入 `AutopilotRightRailProps`。

### Requirement 10：零后端契约变更 + 零 testid drift

**User Story:** 作为 QA 与 e2e 测试维护者，我需要本 spec 不触碰任何后端路由、DTO、Socket 事件、`data-testid`，以便我的 smoke 脚本与 e2e 断言零改动。

#### Acceptance Criteria

1. THE Refactor SHALL 不修改 `shared/blueprint/contracts.ts` 任何类型字段。
2. THE Refactor SHALL 不新增、不删除、不修改任何 `server/routes/*` 下的路由或 REST DTO。
3. THE Refactor SHALL 不新增、不删除、不修改任何 `data-testid`；特别地，`autopilot-advanced-workbenches`、`autopilot-step-input`、`autopilot-runtime-console`、`blueprint-progress-panel`、以及 8 个面板内部现有的 testid 保持原样。
4. THE Refactor SHALL 不修改 `@/lib/blueprint-api` 中任何 fetch 函数签名；所有 `fetch*` 调用仍由 `BlueprintProgressPanel.autoLoad` 持有。
5. IF 任一新文件引入了后端字段假设（例如假设 `BlueprintGenerationJob.stage` 多了一个枚举值），THEN PR SHALL 被拒绝；本 spec 的范围严格限定在前端组件结构调整。
