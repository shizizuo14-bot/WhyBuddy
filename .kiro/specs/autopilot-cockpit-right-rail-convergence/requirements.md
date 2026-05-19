# 需求文档：Autopilot 驾驶舱右栏收敛

## Introduction

`/autopilot` 当前已经具备左侧 5 阶段工作流时间线（`input / clarification / routeset / selection / fabric`）、中间 3D 场景与 Runtime Console、右侧 400px 辅助栏、底部折叠的「高级资产工作台」。路线选择完成后，用户想要继续推进下游的 AgentCrewFabric、SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Runtime Capability、Engineering Handoff、Artifact Memory 等阶段时，当前只有两条路径：

1. 留在 `/autopilot`，手动展开底部 `data-testid="autopilot-advanced-workbenches"` 折叠区，使用内嵌的 `BlueprintProgressPanel`；
2. 点击「进入推导工作台」外链，跳转到 `/specs`（`SpecCenterPage` 托管 `BlueprintProgressPanel + SpecTreeWorkbenchPanel`）。

前者把下一步动作藏进折叠区，后者打断了「单页驾驶舱」的心智。本 spec 的目标是**冻结一个稳定的契约**：路线选择完成后，AgentCrewFabric、SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Runtime Capability、Engineering Handoff、Artifact Memory 全部通过**右栏的子阶段面板**在 `/autopilot` 单页内承接；底部折叠区被删除；`/specs` 仅作为历史/调试深链保留。

本 spec **只定义契约、导航规则、props 接口与子阶段解析器**，实际的组件抽离、底部折叠区删除、数据层合并、步骤驱动导航 UX 分别由 Spec 2/3/4/5 承接。代码变更量控制在最小，只落 1 个子阶段解析器 + 其属性测试 + 类型定义 + 1 个最小 scaffolding 文件。

## Glossary

- **Autopilot_Cockpit**：指 `/autopilot` 路由对应的 `AutopilotRoutePage`，即桌面端 Autopilot 驾驶舱单页。
- **Timeline_Stage**：左侧 5 阶段工作流时间线的阶段 ID，取值 `"input" | "clarification" | "routeset" | "selection" | "fabric"`。
- **Right_Rail**：`/autopilot` 页面右侧驾驶舱栏；在 `xl` 以上固定 400px，md-xl 折叠为抽屉，sm 以下堆叠。
- **Rail_Sub_Stage**：当 `Timeline_Stage === "fabric"` 时，`Right_Rail` 内部展开的子阶段枚举，覆盖下游 8 个工作台：`"agent_crew_fabric" | "spec_tree" | "spec_documents" | "effect_preview" | "prompt_package" | "runtime_capability" | "engineering_handoff" | "artifact_memory"`。
- **Advanced_Workbenches_Fold**：`AutopilotRoutePage` 底部当前挂载 `<details data-testid="autopilot-advanced-workbenches">` 的折叠区，内嵌 `BlueprintProgressPanel`。
- **Spec_Center_Page**：`/specs` 路由托管的 `SpecCenterPage`，复用 `BlueprintProgressPanel` 展示同一 `BlueprintGenerationJob`。
- **Rail_Resolver**：子阶段解析器 `resolveRailSubStage(input): Rail_Sub_Stage | undefined`，输入为当前 `BlueprintGenerationJob`、`BlueprintRouteSelection`、`BlueprintSpecTree`、`BlueprintAgentCrewSnapshot` 与 `Timeline_Stage`，输出右栏应激活的子阶段。
- **Blueprint_Generation_Stage**：`shared/blueprint/contracts.ts` 中 `BlueprintGenerationJob.stage` 的枚举，取值包括 `"input" | "clarification" | "route_generation" | "route_selection" | "agent_crew_fabric" | "spec_tree" | "spec_docs" | "preview" | "effect_preview" | "prompt_packaging" | "runtime_capability" | "engineering_handoff" | "engineering_landing"`。

## Requirements

### Requirement 1：5 阶段时间线到右栏子面板映射合同

**User Story:** 作为 Autopilot 用户，我希望左侧时间线的每一个阶段都对应右栏一个明确的子面板，这样我不用在折叠区和外链之间切换就能理解「现在该做什么」。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 为 5 个 Timeline_Stage 各定义一个稳定的右栏内容契约：`input` 对应 intake/GitHub 输入，`clarification` 对应澄清问答流，`routeset` 对应 RouteSet 候选展示，`selection` 对应路线选择器与 `selectBlueprintRoute` 动作，`fabric` 对应 Rail_Sub_Stage 驱动的下游工作台序列。
2. WHEN Timeline_Stage 为 `"fabric"`，THE Autopilot_Cockpit SHALL 在 Right_Rail 内按固定顺序显示 8 个 Rail_Sub_Stage：`agent_crew_fabric → spec_tree → spec_documents → effect_preview → prompt_package → runtime_capability → engineering_handoff → artifact_memory`。
3. WHEN Timeline_Stage 不为 `"fabric"`，THE Autopilot_Cockpit SHALL 不暴露 Rail_Sub_Stage 枚举值，即 `currentSubStage` 为 `undefined`。
4. THE Autopilot_Cockpit SHALL 保持左侧时间线始终为 5 个一级阶段，不得因 fabric 子阶段扩展而破坏用户既有心智模型。
5. IF `BlueprintGenerationJob.stage` 推进到下游阶段（如 `spec_tree`、`effect_preview`），THEN THE Rail_Resolver SHALL 返回对应的 Rail_Sub_Stage 值，使右栏自动前进。

### Requirement 2：Rail_Resolver 纯函数解析语义

**User Story:** 作为前端实现方，我希望 `resolveRailSubStage` 是一个可被属性测试约束的纯函数，这样后续的 UI 自动滚动、Step 高亮、deep-link 都可以共享同一套解析规则。

#### Acceptance Criteria

1. THE Rail_Resolver SHALL 对所有合法输入组合返回一个明确的值：当 Timeline_Stage 为 `"fabric"` 时返回 Rail_Sub_Stage，否则返回 `undefined`；不允许返回 `null`、抛异常或返回枚举外的字符串。
2. WHEN 多次以完全相同的 `(job, selection, specTree, agentCrew, currentStage)` 快照调用 Rail_Resolver，THE Rail_Resolver SHALL 返回完全相同的 Rail_Sub_Stage（幂等性）。
3. WHILE `BlueprintGenerationJob.stage` 按 `spec_tree → spec_docs → effect_preview → prompt_packaging → runtime_capability → engineering_handoff → engineering_landing` 正向推进，THE Rail_Resolver SHALL 返回按 Rail_Sub_Stage 声明顺序单调不后退的值。
4. IF `BlueprintGenerationJob.stage` 为 `"agent_crew_fabric"` 或 job 还未产出 `specTree`，THEN THE Rail_Resolver SHALL 返回 `"agent_crew_fabric"`（即 fabric 的起始子阶段）。
5. THE Rail_Resolver SHALL 不执行任何副作用操作，包括不得发起网络请求、不得读取或写入全局 store、不得依赖 `Date.now` 等非确定性输入。

### Requirement 3：右栏组件 props 契约

**User Story:** 作为 Spec 2/3/4 的实现方，我希望有一个稳定的 `AutopilotRightRailProps` TypeScript 接口，这样组件抽离、折叠区删除、数据层合并可以并行推进而不产生契约漂移。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 在 `client/src/pages/autopilot/right-rail/types.ts`（或等价位置）导出 `AutopilotRightRailProps` 接口，字段至少包括 `jobId: string`、`currentStage: Timeline_Stage`、`currentSubStage?: Rail_Sub_Stage`、`job: BlueprintGenerationJob | null`、`routeSet: BlueprintRouteSet | null`、`selection: BlueprintRouteSelection | null`、`specTree: BlueprintSpecTree | null`、`agentCrew: BlueprintAgentCrewSnapshot | null`、`locale: AppLocale`、`onSubStageChange: (next: Rail_Sub_Stage) => void`。
2. THE Autopilot_Cockpit SHALL 在同一模块导出 `Rail_Sub_Stage` 类型别名与 `RAIL_SUB_STAGE_ORDER` 只读数组常量，作为 UI 渲染与测试共享的顺序源。
3. THE AutopilotRightRailProps 接口 SHALL 为 effect preview、prompt package、runtime capability invocation、evidence 等下游数据保留命名一致的类型化插槽（例如 `effectPreviews`、`capabilities`、`capabilityInvocations`、`capabilityEvidence`），字段命名与 `BlueprintProgressPanel` 当前 props 对齐以降低迁移成本。
4. THE Autopilot_Cockpit SHALL 在该模块导出 `resolveRailSubStage` 纯函数与其参数类型 `ResolveRailSubStageInput`，使属性测试与组件可共享同一签名。
5. WHERE 任一消费方需要在 `currentStage !== "fabric"` 时渲染子阶段指示器，THE AutopilotRightRailProps SHALL 允许 `currentSubStage` 为 `undefined` 而不触发类型错误。

### Requirement 4：导航与 `/specs` 兼容性规则

**User Story:** 作为 Autopilot 用户，我在 `/autopilot` 点击「选择路线」后不应被强制跳转到 `/specs`；同时我仍希望能通过 `/specs` 深链查看历史 job。

#### Acceptance Criteria

1. WHEN 用户在 `/autopilot` 调用 `selectBlueprintRoute` 成功，THE Autopilot_Cockpit SHALL 仅在同一页面内推进 Timeline_Stage 与 Rail_Sub_Stage，不得触发 `window.location` 变更或 `navigate(SPECS_PATH)` 调用。
2. THE Spec_Center_Page SHALL 保留在 `/specs` 路由，作为只读历史与调试深链入口，且继续复用同一个 `BlueprintProgressPanel`。
3. THE Autopilot_Cockpit SHALL 不再把「进入推导工作台」作为主要 CTA：`AutopilotSpecTreeHandoffPanel` 内的 `/specs` 链接应降级为次级「在独立工作台查看 / View in standalone workbench」文本链接或被整体移除，具体取舍在 `design.md` 中确定并记录理由。
4. THE Autopilot_Cockpit SHALL 不引入后端 REST 合同变更，`BlueprintGenerationJob`、`BlueprintSpecTree`、`BlueprintRouteSet`、`BlueprintRouteSelection` 的字段与语义保持不变。
5. IF 用户以外部深链方式打开 `/specs?jobId=xxx`，THEN THE Spec_Center_Page SHALL 按当前行为渲染该 job 的 `BlueprintProgressPanel`，不得因本 spec 的改动出现回归。

### Requirement 5：响应式断点策略

**User Story:** 作为桌面端 Autopilot 用户，我希望在 1280px 以上看到固定 400px 的右栏，在更小窗口下不被右栏挤占中间场景。

#### Acceptance Criteria

1. WHILE viewport 宽度 ≥ 1280px，THE Right_Rail SHALL 以固定 400px 宽度始终可见，且与中间 3D 场景并列布局（沿用当前 `xl:grid-cols-[minmax(0,1fr)_400px]`）。
2. WHILE viewport 宽度介于 768px 与 1279px 之间，THE Right_Rail SHALL 折叠为右侧滑出抽屉（复用 `HoloDrawer` 或等价实现），左侧 5 阶段时间线与中间 3D 场景保持可见。
3. WHILE viewport 宽度 < 768px，THE Right_Rail SHALL 在中间 3D 场景下方按子阶段垂直堆叠；此为可接受的移动端妥协，`/autopilot` 主目标为桌面端。
4. THE Right_Rail SHALL 在抽屉态下保持与固定态相同的 props 契约与子阶段切换语义，不得在不同断点下暴露不同的数据字段。
5. IF 抽屉被关闭，THEN THE Autopilot_Cockpit SHALL 在 5 阶段时间线上显示一个明确的「展开右栏」入口，避免用户失去对当前子阶段的感知。

### Requirement 6：现有状态所有权与数据源收敛

**User Story:** 作为 Spec 4 的实现方，我需要提前知道右栏在重构后只应从单一数据源读取状态，避免现有 `AutopilotRoutePage` 与 `BlueprintProgressPanel` 双轨 fetch 的重复拉取。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 明确记录现状：`AutopilotRoutePage.tsx` 目前在 `handleCreateIntake / handleGenerateClarifications / handleSaveAnswers / handleGenerateRouteSet / handleSelectRoute` 链路上持有 `intake / clarificationSession / readiness / routeSet / selection / specTree / autopilotAgentCrew / autopilotCapabilities / autopilotCapabilityInvocations / autopilotCapabilityEvidence / autopilotEffectPreviews` 等 job 相关状态（`AutopilotRoutePage.tsx` 行区间约 380-450 与 680-830），而 `BlueprintProgressPanel` 目前在 `fetchLatestBlueprintGenerationJob / fetchBlueprintSpecsProgress / fetchBlueprintEngineeringRuns / fetchBlueprintArtifactLedger` 等接口上维护自己的 fetch 与缓存层。
2. THE Autopilot_Cockpit SHALL 指定：重构后的右栏组件 MUST 从单一数据源消费（由 `AutopilotRoutePage` 持有或 Spec 4 新增的 `useAutopilotRightRailData` hook），不得在组件内部再次重复 fetch 同一个 job。
3. THE Autopilot_Cockpit SHALL 在本 spec 阶段**不实施**数据层合并，只冻结契约；实际的 hook 抽离与双轨去重由 Spec 4 `autopilot-right-rail-data-hook` 承接。
4. IF 未来 Spec 4 选择在组件内部再次发起 fetch，THEN 必须显式在 `AutopilotRightRailProps` 以外的数据层扩展里记录该行为，本 spec 不为此保留入口。
5. THE Autopilot_Cockpit SHALL 要求 Spec 2 在抽离右栏组件时，仅通过 props 接收数据，不得在新组件内部 `useAppStore` 或直接调用 `@/lib/blueprint-api`。

### Requirement 7：可访问性与国际化

**User Story:** 作为依赖键盘与读屏的用户，我希望右栏作为一个稳定的 landmark 被识别，并按 `zh-CN / en-US` 提供一致标签。

#### Acceptance Criteria

1. THE Right_Rail SHALL 使用 `<aside>` 元素或 `role="complementary"`，并绑定 `aria-label` 属性，值由当前 locale 决定（例如 `zh-CN` 下 `"Autopilot 右栏工作台"`，`en-US` 下 `"Autopilot right rail workbench"`）。
2. THE Right_Rail SHALL 在子阶段切换时更新 `aria-current="step"` 或等价语义，使读屏用户能感知「现在在第几步」。
3. WHEN locale 在 `zh-CN` 与 `en-US` 之间切换，THE Right_Rail SHALL 仅替换文案，不重置 `currentSubStage` 或丢失当前 job 数据。
4. THE Right_Rail SHALL 保留对 `prefers-reduced-motion` 的尊重：子阶段推进动画在该偏好下降级为静态切换。
5. IF 用户通过键盘焦点移入右栏，THEN THE Right_Rail SHALL 将焦点锚定到当前 `currentSubStage` 对应的区块起始位置，而不是跳到第一个子阶段头部。

### Requirement 8：迁移与回滚约束

**User Story:** 作为 Spec 3 的实现方，我希望本 spec 清楚列出哪些旧入口会消失、哪些会降级、哪些被新合同替代，避免删除折叠区时遗漏历史依赖。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 在 `design.md` 中列出「契约实施后必然消失的入口」，至少包括底部 `<details data-testid="autopilot-advanced-workbenches">` 折叠区与其内嵌 `BlueprintProgressPanel`。
2. THE Autopilot_Cockpit SHALL 在 `design.md` 中明确 `AutopilotSpecTreeHandoffPanel` 中 `SPECS_PATH` 链接的最终形态（保留为次级链接或删除），并记录决策理由。
3. THE Autopilot_Cockpit SHALL 要求所有现有 `data-testid`（包括 `autopilot-step-input / autopilot-runtime-console / autopilot-advanced-workbenches / blueprint-progress-panel`）在本 spec 阶段**不被删除或重命名**；折叠区删除与 testid 迁移由 Spec 3 承接。
4. THE Autopilot_Cockpit SHALL 保证本 spec 的最小 scaffolding（types + resolver + 占位组件）通过 `tsc`，且不触发现有 `AutopilotRoutePage.test.tsx` 的断言失败。
5. IF 未来决定撤销本合同，THEN 回滚动作应仅涉及删除 `client/src/pages/autopilot/right-rail/` 目录与 `resolveRailSubStage` 测试文件，不应残留运行时副作用。

