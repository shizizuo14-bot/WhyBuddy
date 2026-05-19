# 需求文档：Autopilot 底部高级资产工作台折叠区删除 + 右栏内联承接

## Introduction

Spec 1 `autopilot-cockpit-right-rail-convergence` 已冻结右栏契约：`AutopilotTimelineStage`、`AutopilotRailSubStage`、`RAIL_SUB_STAGE_ORDER`、`AutopilotRightRailProps`、`resolveRailSubStage` 纯函数、`<AutopilotRightRail>` scaffolding 均已就位。Spec 2 `autopilot-right-rail-stage-panels` 已把 `BlueprintProgressPanel` 中 8 个 fabric 子阶段面板物理抽离为 `client/src/pages/autopilot/right-rail/panels/` 下的独立 canonical 面板（`AgentCrewFabricPanel / SpecTreePanel / SpecDocumentsPanel / EffectPreviewPanel / PromptPackagePanel / RuntimeCapabilityPanel / EngineeringHandoffPanel / ArtifactMemoryPanel`），并在 `<AutopilotRightRail>` 的 fabric switch 中被消费；`BlueprintProgressPanel.tsx` 本身成为组合组件，`/specs` 深链（由 `SpecCenterPage` 托管）继续不变。

本 spec（Spec 3）负责兑现 Spec 1 承诺的用户侧收敛：

1. 从 `AutopilotRoutePage.tsx` **物理删除** 底部 `<details data-testid="autopilot-advanced-workbenches">` 折叠区及其内嵌的 `<BlueprintProgressPanel>` 实例。
2. 将 `<AutopilotRightRail>` **连线**到 `/autopilot` 页面现有 400px 右列，在 `currentStage === "fabric"` 时替换 `AutopilotWorkflowRail` 的 fabric 段渲染，改由 8 个 Spec 2 canonical 面板按 `resolveRailSubStage()` 派发。
3. 将 `AutopilotSpecTreeHandoffPanel` 中 `SPECS_PATH` 主 CTA 降级为次级「在独立工作台查看 / View in standalone workbench」文本链接（Spec 1 design 已冻结决策）。
4. 保留 `/specs` 深链与 `SpecCenterPage → BlueprintProgressPanel` 的承载不变，不改后端契约、DTO、Socket。
5. 更新 `AutopilotRoutePage.test.tsx`，删除 `autopilot-advanced-workbenches` / `Advanced asset workbenches` / `高级资产工作台` 等断言，新增 fabric 右栏承接 + 路线选择不导航的正向断言。
6. 新增 1 条 fast-check PBT（fabric dispatch consistency）与 2 条 edge-case 测试（route selection no-navigation、fold removal snapshot）。

本 spec **不**承担：

- 抽离或修改 Spec 2 已经完成的 8 个 canonical 面板本身（位于 `client/src/pages/autopilot/right-rail/panels/`）；
- 抽出 `useAutopilotRightRailData` 或合并双轨 fetch（Spec 4 `autopilot-right-rail-data-hook`）；
- URL `?sub=...` 参数、手动切换子阶段、自动滚动、sticky pin、键盘快捷键（Spec 5 `autopilot-step-driven-rail-navigation`）；
- 移动端抽屉化 / `<md` 堆叠布局细化（Spec 5 负责 UX 打磨）；
- 重命名任何组件、移动 `BlueprintProgressPanel.tsx`、删除 `SpecCenterPage.tsx`、修改 `/specs` 路由。

## Glossary

- **Autopilot_Cockpit**：指 `/autopilot` 路由对应的 `AutopilotRoutePage` 页面单页，当前代码位于 `client/src/pages/autopilot/AutopilotRoutePage.tsx`。
- **Advanced_Workbenches_Fold**：`AutopilotRoutePage` 底部当前挂载 `<details data-testid="autopilot-advanced-workbenches">` 的折叠区，内嵌 `<BlueprintProgressPanel autoLoad={false} .../>` 实例。Spec 3 要求对此元素进行物理删除。
- **Right_Column**：`/autopilot` 页面在 `xl` 以上断点的 400px 右列，目前通过 `xl:grid-cols-[minmax(0,1fr)_400px]` 布局与中间 `AutopilotVisualStage` 并列，内部挂载 `<AutopilotWorkflowRail>`。
- **AutopilotWorkflowRail**：`AutopilotRoutePage.tsx` 内部定义的组件，按 `currentStage` 渲染 5 阶段面板（`input / clarification / routeset / selection / fabric`）。在 Spec 3 之前其 `fabric` 分支直接内联 `AutopilotSpecTreeHandoffPanel + AgentCrewSummary`。
- **AutopilotRightRail**：Spec 1 冻结、Spec 2 扩展后的右栏组件，位于 `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`。在 `currentStage === "fabric"` 时按 `currentSubStage` 派发到 8 个 canonical 面板。
- **Rail_Sub_Stage**：Spec 1 冻结的 fabric 子阶段枚举，取值与顺序见 `RAIL_SUB_STAGE_ORDER`：`"agent_crew_fabric" | "spec_tree" | "spec_documents" | "effect_preview" | "prompt_package" | "runtime_capability" | "engineering_handoff" | "artifact_memory"`。
- **Rail_Resolver**：Spec 1 冻结的纯函数 `resolveRailSubStage(input: ResolveRailSubStageInput): AutopilotRailSubStage | undefined`，位于 `client/src/pages/autopilot/right-rail/resolve-rail-sub-stage.ts`。
- **AutopilotSpecTreeHandoffPanel**：`AutopilotRoutePage.tsx` 中 export 的组件，当前在 fabric 阶段展示 SPEC Tree handoff 文案与「进入推导工作台 / Open deduction workbench」主 CTA（`href={SPECS_PATH}`）。
- **Spec_Center_Page**：`/specs` 路由挂载的页面组件 `client/src/pages/specs/SpecCenterPage.tsx`，复用 `BlueprintProgressPanel` 作为独立工作台深链入口。
- **BlueprintProgressPanel**：`client/src/pages/specs/BlueprintProgressPanel.tsx`；Spec 2 完成后已成为组合组件，仍被 `SpecCenterPage` 使用，Spec 3 不修改该文件本身，但不再从 `AutopilotRoutePage.tsx` 内联挂载。
- **SPECS_PATH**：`client/src/components/navigation-config.ts` 导出的常量，当前为 `/specs`。

## Requirements

### Requirement 1：物理删除底部 Advanced_Workbenches_Fold

**User Story:** 作为 Autopilot 用户，我不再需要从底部折叠区展开 `BlueprintProgressPanel` 才能看到下游工作台内容；选完路线后右栏直接承接下一步动作，使 `/autopilot` 保持单屏驾驶舱形态。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 从 `client/src/pages/autopilot/AutopilotRoutePage.tsx` 中删除包含 `data-testid="autopilot-advanced-workbenches"` 的 `<details>` 元素，包括其 `<summary>` 节点、中文 `"高级资产工作台"` 与英文 `"Advanced asset workbenches"` 文案、以及其内嵌的 `<BlueprintProgressPanel .../>` 组件实例。
2. THE Autopilot_Cockpit SHALL 同步移除 `AutopilotRoutePage.tsx` 中仅被该 `<BlueprintProgressPanel>` 使用的本地变量与 props 拼装（包括 `blueprintPanelKey` 常量以及 `initialJob / initialRouteSet / initialSelection / initialSpecTree / initialEffectPreviews / initialCapabilities / initialAgentCrew / initialClarificationSession / initialCapabilityInvocations / initialCapabilityEvidence / autoLoad / showRouteGeneration / showSpecProgress / showSpecTreePreview / showSpecDocumentWorkbench / showEffectPreviewWorkbench / showPromptPackageWorkbench / showRuntimeCapabilityBridgeWorkbench / showEngineeringLandingWorkbench / showArtifactMemoryWorkbench` 等 prop 拼装路径）。
3. THE Autopilot_Cockpit SHALL 移除 `AutopilotRoutePage.tsx` 中 `import BlueprintProgressPanel from "../specs/BlueprintProgressPanel"` 这条 import 语句，若且仅若删除折叠区后该 import 不再被任何其他代码路径引用。
4. WHEN `<AutopilotRoutePage />` 在任意受支持的布局宽度下被渲染，THE Autopilot_Cockpit SHALL 不再在 DOM 中产出 `data-testid="autopilot-advanced-workbenches"` 节点，也不再产出由 Advanced_Workbenches_Fold 路径注入的 `data-testid="blueprint-progress-panel"` 节点。
5. IF 未来 Autopilot_Cockpit 需要再次承接 BlueprintProgressPanel 的组合视图，THEN 应通过显式的新 spec 与新入口实现；Spec 3 不为此保留兼容入口或折叠区占位。

### Requirement 2：将 <AutopilotRightRail> 连线到 Right_Column 的 fabric 段

**User Story:** 作为 Autopilot 用户，我在左侧时间线进入 `fabric` 阶段后，希望右侧 400px 面板立即展示当前派生的子阶段工作台，而不是看到旧版 SpecTree handoff 文案。

#### Acceptance Criteria

1. WHEN `currentStage === "fabric"`，THE Autopilot_Cockpit SHALL 在 Right_Column 内渲染 `<AutopilotRightRail>`，并传入 props 满足 `AutopilotRightRailProps` 接口的全部字段。
2. THE Autopilot_Cockpit SHALL 通过调用 Rail_Resolver 得到 `currentSubStage`，并将其作为 `<AutopilotRightRail currentSubStage>` 的传值；任何不经 Rail_Resolver 的子阶段来源在本 spec 中都不允许存在。
3. THE Autopilot_Cockpit SHALL 将下列来自 `AutopilotRoutePage` 内部 `useState` / `useMemo` 的状态原样传入 `<AutopilotRightRail>` 对应字段：`jobId`（由 `latestJob?.id ?? ""` 得到）、`job` = `latestJob`、`routeSet`、`selection`、`specTree`、`agentCrew` = `autopilotAgentCrew`、`capabilities` = `autopilotCapabilities`、`capabilityInvocations` = `autopilotCapabilityInvocations`、`capabilityEvidence` = `autopilotCapabilityEvidence`、`effectPreviews` = `autopilotEffectPreviews`、`locale`。
4. THE Autopilot_Cockpit SHALL 将 `<AutopilotRightRail onSubStageChange>` 连接到本页持有的 state setter 或在无持久化需求时连接到 no-op 占位，不得在本 spec 中引入 URL 参数或 sticky 持久化。
5. WHEN `currentStage !== "fabric"`（即 `currentStage` 为 `"input" | "clarification" | "routeset" | "selection"` 中的任一），THE Autopilot_Cockpit SHALL 继续通过 `<AutopilotWorkflowRail>` 承担 Right_Column 的渲染，其内部对这 4 个非-fabric stage 的面板渲染不得被本 spec 修改。
6. THE Autopilot_Cockpit SHALL 在 `AutopilotWorkflowRail` 的 fabric 分支中，移除原先直接内联 `AutopilotSpecTreeHandoffPanel + AgentCrewSummary` 的渲染路径，改为由上层（`AutopilotRoutePage`）决定 fabric 时渲染 `<AutopilotRightRail>` 而非 `<AutopilotWorkflowRail>`，或由 `<AutopilotWorkflowRail>` 在 fabric 分支内部直接委派给 `<AutopilotRightRail>`；最终实现路径在 `design.md` 中明确并记录理由。
7. IF `<AutopilotRightRail>` 在 `currentStage === "fabric"` 时接收到 `specTree === null`、`agentCrew === null` 或 `selection === null` 等部分缺省的快照，THEN THE Autopilot_Cockpit SHALL 不报错、不抛异常，且依赖 Rail_Resolver 返回的起始子阶段（通常为 `"agent_crew_fabric"`）来渲染对应面板。
8. THE Autopilot_Cockpit SHALL 保持现有 `xl:grid-cols-[minmax(0,1fr)_400px]` 布局不变；本 spec 不改变桌面端 400px 右列宽度，也不引入 `<md` 堆叠或 `md-xl` 抽屉的新实现。

### Requirement 3：SPECS_PATH 链接降级为次级入口

**User Story:** 作为 Autopilot 用户，我希望不再被「进入推导工作台」作为主 CTA 推向 `/specs`，但同时保留一个安静的次级入口便于对照或审阅。

#### Acceptance Criteria

1. THE AutopilotSpecTreeHandoffPanel SHALL 将原先作为主 CTA、`href={SPECS_PATH}` 的「进入推导工作台 / Open deduction workbench」链接降级为次级文本链接，中文文案为 `"在独立工作台查看"`，英文文案为 `"View in standalone workbench"`。
2. THE AutopilotSpecTreeHandoffPanel SHALL 保留 `href={SPECS_PATH}` 属性指向 `/specs`，使现有深链与外部引用路径不受影响。
3. THE AutopilotSpecTreeHandoffPanel SHALL 不再以主按钮样式（如 `Button` 主色调、`Send / ArrowRight` 等主动作图标）呈现该链接；具体视觉降级规则由 `design.md` 给出，并至少确保不与「当前路线」「下一步行动」等主 CTA 产生同级视觉冲突。
4. WHEN 用户在 Right_Column 处于 fabric 阶段时点击该次级链接，THE Autopilot_Cockpit SHALL 正常导航到 `/specs`；在 `AutopilotRoutePage` 层面不得拦截、不得改变 `navigate()` 行为、不得触发额外埋点以外的副作用（本 spec 不新增埋点）。
5. THE AutopilotSpecTreeHandoffPanel SHALL 保留现有 `data-testid="autopilot-spec-tree-handoff"` 不变，以免其他测试与观察面回归。

### Requirement 4：路线选择不触发导航

**User Story:** 作为 Autopilot 用户，我在 `selection → fabric` 的推进过程中不希望页面整页跳转到 `/specs`，以保持单页驾驶舱体验。

#### Acceptance Criteria

1. WHEN 用户在 `/autopilot` 页面调用 `selectBlueprintRoute` 并成功完成时，THE Autopilot_Cockpit SHALL 仅通过 React state 将 `currentStage` 推进到 `"fabric"`，并由 Rail_Resolver 计算新的 `currentSubStage`。
2. THE Autopilot_Cockpit SHALL 在路线选择成功路径上不调用 `window.location.assign`、`window.location.href` 写入、`window.location.replace` 或任何 `react-router` `navigate(...)` 调用；该约束含显式 `navigate(SPECS_PATH)` 调用的缺席。
3. IF 未来需要在路线选择后打开 `/specs`，THEN 应通过 Requirement 3 所定义的次级链接由用户主动点击，而非由 `AutopilotRoutePage` 代码路径自动触发。
4. THE Autopilot_Cockpit SHALL 在相应测试中断言：`selectBlueprintRoute` 成功后当前 URL pathname 仍为 `/autopilot`（或页面未触发 `navigate` mock），且 `<AutopilotRightRail>` 已在 Right_Column 呈现 fabric 子阶段内容。
5. WHILE `currentStage === "fabric"` 期间，THE Autopilot_Cockpit SHALL 不再通过任何主 CTA 诱导用户离开当前路由。

### Requirement 5：/specs 深链与 SpecCenterPage 兼容性保持

**User Story:** 作为历史深链与团队审阅用户，我希望在 `/specs?jobId=xxx` 下继续看到完整的 `BlueprintProgressPanel`，而不会因为 Autopilot 改造而出现行为漂移。

#### Acceptance Criteria

1. THE Spec_Center_Page SHALL 保留在 `/specs` 路由并继续由 `client/src/pages/specs/SpecCenterPage.tsx` 承载，`BlueprintProgressPanel` 组件文件不得被本 spec 移动、重命名或删除。
2. THE Spec_Center_Page SHALL 在渲染树中继续产出 `data-testid="blueprint-progress-panel"` 节点（由 `BlueprintProgressPanel` 内部负责）；该 testid 仅在 `/specs` 页面出现，不得再从 `/autopilot` 渲染树出现。
3. WHEN 用户以外部深链方式打开 `/specs?jobId=xxx`，THE Spec_Center_Page SHALL 按当前行为加载对应 job 的 `BlueprintProgressPanel`；本 spec 不得因 Autopilot 改造触发该页面出现可见回归。
4. THE Autopilot_Cockpit SHALL 不在 `AutopilotRoutePage.tsx` 中保留对 `BlueprintProgressPanel` 的任何 import、引用或注释依赖（删除 Advanced_Workbenches_Fold 后不需要保留兼容桥接）。
5. IF 本 spec 完成后发现 `/specs` 页面与 Autopilot 共用的任何 props 或 fetch 路径产生回归，THEN 应通过调整 `AutopilotRoutePage` 或 `AutopilotRightRail`，而非修改 `BlueprintProgressPanel` 或 `SpecCenterPage`。

### Requirement 6：Props 完整性与状态所有权

**User Story:** 作为 Spec 4 的实现方，我需要确保 Spec 3 完成后 `<AutopilotRightRail>` 消费的全部状态都来自 `AutopilotRoutePage` 当前持有的 state，不引入新的 fetch 路径或 store 读。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 将 `<AutopilotRightRail>` 需要的所有 props 来源限定为 `AutopilotRoutePage` 已有的 `useState` / `useMemo` 结果；本 spec 不得在该页面新增任何 `fetch`、`useEffect` 调用 `@/lib/blueprint-api`、或接入新的 store selector。
2. THE Autopilot_Cockpit SHALL 不在 `<AutopilotRightRail>` 内部读取 `useAppStore` 或 `useProjectStore`；Spec 1/2 已对此形成的约束（Right_Rail props-only 契约）在 Spec 3 中继续成立。
3. THE Autopilot_Cockpit SHALL 通过 `<AutopilotRightRail onSubStageChange>` 在本 spec 范围内仅接一个最小处理器（`() => {}` 或一个未被 UI 消费的 `useState` setter）；不得在本 spec 引入 sticky 持久化、URL 同步或 analytics 埋点。
4. IF 未来 Spec 4 决定把部分 props 由 hook 提供，THEN 其签名应能替换当前直接从 `AutopilotRoutePage` 传入的 props，不需要 Spec 3 额外保留桥接层。
5. THE Autopilot_Cockpit SHALL 保证本 spec 完成后，`npm exec vitest run client/src/pages/autopilot/right-rail` 已有 Spec 1/2 测试继续通过，即右栏类型契约与 resolver PBT 不被破坏。

### Requirement 7：响应式边界保持现状

**User Story:** 作为桌面端 Autopilot 用户，我希望本轮改造不引入断点回归；`<md` 与 `md-xl` 的移动端体验由后续 Spec 5 精修，本 spec 只保证 xl+ 形态可用且无新增回归。

#### Acceptance Criteria

1. WHILE viewport ≥ 1280px，THE Autopilot_Cockpit SHALL 维持 `xl:grid-cols-[minmax(0,1fr)_400px]` 布局，中间为 `<AutopilotVisualStage>`，右侧为 `<AutopilotWorkflowRail>` 或在 fabric 阶段的 `<AutopilotRightRail>`。
2. WHILE viewport < 1280px 且 ≥ 768px，THE Autopilot_Cockpit SHALL 保持现有响应式堆叠行为；本 spec 不新增抽屉态或其他布局切换。
3. WHILE viewport < 768px，THE Autopilot_Cockpit SHALL 保持现状堆叠；在 fabric 阶段移动端若出现可读性问题，由 Spec 5 `autopilot-step-driven-rail-navigation` 承接，不在本 spec 范围内。
4. THE Autopilot_Cockpit SHALL 不修改任何 Tailwind 断点或 `xl:grid-cols-*` 样式；本 spec 的改动集中在 React 渲染分支与 props 传递上。
5. IF 删除 Advanced_Workbenches_Fold 后页面底部出现 `padding` / `margin` 塌陷问题，THEN 允许在 `AutopilotRoutePage.tsx` 的外层 `grid gap-4` 容器做最小视觉修正，但不得引入新的 `data-testid`。

### Requirement 8：Testid 与选择器约束

**User Story:** 作为维护 E2E / 观察面的工程师，我需要本 spec 精确列出「必须删除」「必须保留」「新增允许」三组 `data-testid`，避免任何一条被误改影响下游自动化。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 删除以下 testid 在 `/autopilot` 渲染树中的出现：`data-testid="autopilot-advanced-workbenches"`、`data-testid="blueprint-progress-panel"`（仅删除由 Advanced_Workbenches_Fold 注入的实例；`/specs` 页面的同名 testid 不受影响）。
2. THE Autopilot_Cockpit SHALL 保留以下 testid 不变：`data-testid="autopilot-route-page"`、`data-testid="autopilot-topbar"`、`data-testid="autopilot-visual-stage"`、`data-testid="autopilot-scene-visual"`、`data-testid="autopilot-mission-hud"`、`data-testid="autopilot-workflow-rail"`、`data-testid="autopilot-workflow-steps"`、`data-testid="autopilot-step-input"`、`data-testid="autopilot-runtime-console"`、`data-testid="autopilot-fabric-step"`（若 `AutopilotWorkflowRail` 在 fabric 阶段仍保留外层容器）、`data-testid="autopilot-spec-tree-handoff"`（Requirement 3）。
3. THE Autopilot_Cockpit MAY 新增由 `<AutopilotRightRail>` 及其派发的 canonical 面板产生的 testid，典型包括 `data-testid="autopilot-right-rail"`、`data-testid={`autopilot-rail-sub-stage-${subStage}`}`；Spec 3 不硬性冻结这些新 testid 的具体字符串，但 `design.md` 必须至少列出一组作为示例，Spec 5 可在此基础上继续扩展。
4. IF 删除 `data-testid="autopilot-advanced-workbenches"` 导致旧 `AutopilotRoutePage.test.tsx` 的 `expect(markup).toContain('data-testid="autopilot-advanced-workbenches"')` 断言失败，THEN 应在本 spec 的测试修改任务中删除该断言，而非保留兼容 hack。
5. THE Autopilot_Cockpit SHALL 不在本 spec 修改任何现有的 `data-testid` 字符串（除 Requirement 8.1 列出的删除项）。

### Requirement 9：AutopilotRoutePage.test.tsx 同步更新

**User Story:** 作为测试维护者，我需要 `AutopilotRoutePage.test.tsx` 在本 spec 完成后既不产生假阳也不产生假阴，且必须新增覆盖新行为的正向断言。

#### Acceptance Criteria

1. THE AutopilotRoutePage_Test SHALL 移除下列断言：`expect(markup).toContain('data-testid="autopilot-advanced-workbenches"')`、`expect(markup).toContain('data-testid="blueprint-progress-panel"')`、`expect(markup).toContain("Advanced asset workbenches")`、以及对中文 `"高级资产工作台"` / `"展开查看 SPEC、预演、提示词、能力桥和回放"` / 英文 `"Expand for SPEC, previews, prompts, capability bridge, and replay"` 等 Advanced_Workbenches_Fold 相关文案断言。
2. THE AutopilotRoutePage_Test SHALL 新增至少一条断言，验证当 `currentStage === "fabric"`（通过 props / mock 构造或通过在默认渲染下的一个 fabric fixture）时，渲染树包含 `data-testid="autopilot-right-rail"`（或 `design.md` 中指定的等价 testid），且不包含 `data-testid="autopilot-advanced-workbenches"`。
3. THE AutopilotRoutePage_Test SHALL 新增或复用 `AutopilotSpecTreeHandoffPanel` 测试，验证其中 `SPECS_PATH` 链接的文案已变更为 `"在独立工作台查看"` / `"View in standalone workbench"`，并且 `href="/specs"` 仍存在；同时验证原主 CTA 文案 `"Open deduction workbench"` / `"进入推导工作台"` 不再在该面板中以按钮样式出现（可通过 DOM class 或 role 检查实现）。
4. THE AutopilotRoutePage_Test SHALL 继续覆盖 `autopilot-step-input`、`autopilot-runtime-console`、`autopilot-mission-hud`、`autopilot-workflow-rail` 等 Requirement 8.2 列出的保留 testid。
5. WHERE 本 spec 涉及的路由无导航断言，THE AutopilotRoutePage_Test SHALL 通过 `vi.mock("react-router-dom")` 或对 `window.location` 的 spy，断言 `selectBlueprintRoute` 成功路径不触发 `navigate(...)` 或 `window.location` 写入。

### Requirement 10：新增 PBT 与 edge-case 测试

**User Story:** 作为质量护栏维护者，我需要 Spec 3 提供至少 1 条属性测试（PBT）与 2 条 edge-case 测试，保证右栏派发一致性、路线选择不导航、以及折叠区彻底消失不被回归。

#### Acceptance Criteria

1. THE Autopilot_Cockpit_Tests SHALL 新增一条 fast-check 属性测试，位置建议为 `client/src/pages/autopilot/right-rail/__tests__/fabric-dispatch.property.test.tsx`；测试生成任意合法 `(job, selection, specTree, agentCrew)` 快照，渲染 `<AutopilotRightRail currentStage="fabric" .../>`，并断言其当前展示的 sub-stage 节点（通过 `data-testid="autopilot-right-rail-sub-stage"` 或 canonical 面板 testid）与直接调用 `resolveRailSubStage({ currentStage: "fabric", job, selection, specTree, agentCrew })` 计算出的 `currentSubStage` 严格一致。
2. THE Autopilot_Cockpit_Tests SHALL 新增一条 edge-case 测试（路线选择不导航），位置建议为 `client/src/pages/autopilot/AutopilotRoutePage.test.tsx` 内新增 `describe("selection → fabric")` 子块；在测试中 mock `selectBlueprintRoute` 成功分支，触发其回调，断言：a) `navigate` mock 未被调用；b) `window.location.assign / replace / href` 未被调用；c) 渲染树此时包含 `<AutopilotRightRail>` 且显示 fabric 子阶段内容。
3. THE Autopilot_Cockpit_Tests SHALL 新增一条 edge-case 测试（fold removal snapshot），位置建议为 `client/src/pages/autopilot/AutopilotRoutePage.test.tsx`；断言 `renderToStaticMarkup(<AutopilotRoutePage />)` 产物字符串不包含 `data-testid="autopilot-advanced-workbenches"`，也不包含由 Advanced_Workbenches_Fold 路径注入的 `data-testid="blueprint-progress-panel"`（可通过 `expect(markup).not.toContain(...)` 实现）。
4. THE Autopilot_Cockpit_Tests SHALL 确保新增的 PBT 测试在 CI 本地运行时完成时间不超过现有 Spec 1 PBT 套件的平均耗时的 3 倍（通过控制 `fc.assert` 的 `numRuns` 以及避免真实 3D 场景渲染来实现）。
5. THE Autopilot_Cockpit_Tests SHALL 不修改任何后端 fixture、Socket mock 或 DTO shape，仅在前端测试层引入 fast-check 与必要的组件 mock。

### Requirement 11：回滚与迁移边界

**User Story:** 作为 release 管理者，我需要明确 Spec 3 的回滚路径：若改造上线后发现严重回归，应可在不破坏 Spec 1/2 产物的情况下快速回退到折叠区形态。

#### Acceptance Criteria

1. THE Autopilot_Cockpit SHALL 保证 Spec 3 的所有修改均局限于 `client/src/pages/autopilot/AutopilotRoutePage.tsx`、`client/src/pages/autopilot/AutopilotRoutePage.test.tsx`、以及 `client/src/pages/autopilot/right-rail/` 目录（若新增 PBT / edge-case 测试文件）。不得修改 `BlueprintProgressPanel.tsx`、`SpecCenterPage.tsx`、`client/src/pages/autopilot/right-rail/panels/*`、`client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`（除非为接线需要扩展 Spec 1 scaffolding 的新 testid，该扩展在 `design.md` 中记录并保持最小）。
2. THE Autopilot_Cockpit SHALL 不修改后端路由、DTO、Socket payload、`shared/blueprint/contracts.ts` 字段；本 spec 是前端组装改造，不跨越契约层。
3. IF 需要回滚本 spec，THEN 回滚动作应能通过 `git revert` 覆盖 Requirement 11.1 列出的文件集合恢复旧形态，且不会破坏 Spec 1/2 已经合入的 `right-rail/` 契约与 canonical 面板。
4. THE Autopilot_Cockpit SHALL 不在本 spec 引入 feature flag 或运行时开关；折叠区的删除是一次性合入，必要时通过 Git 回滚实现回退。
5. THE Autopilot_Cockpit SHALL 在 PR 描述或本 spec 的 `design.md` 内显式声明：Spec 3 完成后 `BlueprintProgressPanel.tsx` 在 Autopilot 链路上仅通过 `/specs` 页面被调用；若后续 Spec 4 要合并 fetch 路径，`BlueprintProgressPanel` 内部 `autoLoad` 行为由 Spec 4 自行处理，Spec 3 不对其作额外承诺。
