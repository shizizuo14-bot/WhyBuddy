# 需求文档：Autopilot 右栏步骤驱动导航与响应式收口

## Introduction

Spec 1 `autopilot-cockpit-right-rail-convergence` 冻结了 `AutopilotTimelineStage / AutopilotRailSubStage / RAIL_SUB_STAGE_ORDER`（8 个 fabric 子阶段）、`AutopilotRightRailProps`（9 个数据插槽）、`resolveRailSubStage()` 纯函数与 `<AutopilotRightRail>` scaffolding，并把 `onSubStageChange: (next: AutopilotRailSubStage) => void` 作为 props 契约冻结。Spec 2 `autopilot-right-rail-stage-panels` 将 `BlueprintProgressPanel` 内部 8 个 fabric 子阶段面板物理抽离为 `client/src/pages/autopilot/right-rail/panels/` 下的 canonical 面板并挂进 fabric switch。Spec 3 `autopilot-advanced-workbench-inline` 删除了 `/autopilot` 底部 `<details data-testid="autopilot-advanced-workbenches">` 折叠区，并在 `currentStage === "fabric"` 时让 `<AutopilotRightRail>` 接管 400px 右列，次级 `/specs` 链接作为安静入口保留。Spec 4 `autopilot-right-rail-data-hook` 新增 `useAutopilotRightRailData(jobId, options)` hook，把 9 + 6 个 fetch 合并为一处统一 orchestration，通过 `options.currentSubStage` 作为懒加载 gate、通过 `options.onJobStageChange` 回调驱动 targeted refetch。

截至 Spec 4 合入，`<AutopilotRightRail>` 的 fabric 子阶段由 `resolveRailSubStage()` 从 `job.stage` 自动派生，`onSubStageChange` 仍以 `() => {}` no-op 占位。这种形态遗留了 5 个用户可感知的 UX 缺口：

1. **URL 无法承载子阶段状态**：直接访问 `/autopilot?sub=spec_tree` 不会打开到对应子阶段，用户在子阶段之间导航后刷新页面会丢失阅读位置。
2. **用户无法手动覆盖自动派生**：如果用户想在 `spec_tree` 子阶段停留阅读，即便 `job.stage` 继续向前推进到 `prompt_packaging`，右栏也会被 `resolveRailSubStage()` 拉走，没有「暂停跟随」的能力。
3. **步骤推进时右栏无自动滚动**：`currentSubStage` 变化时右栏内容区不会滚到对应子阶段 anchor，用户必须手动滚动定位。
4. **无键盘快捷键**：8 个子阶段之间切换只能靠鼠标点击 tab；没有 `[` / `]` 前后切换、`Esc` 关闭抽屉、`Shift + P` toggle 跟随的体感。
5. **`<md` 断点下 400px 右列挤压 3D 场景**：Spec 3 让 `<AutopilotRightRail>` 在 fabric 阶段接管 400px 右列，但 `<768px` 屏幕上 `<AutopilotVisualStage>` 被挤到几乎不可用；`md-xl`（768-1279px）断点也没有允许用户折叠的开关。

本 spec（Spec 5 `autopilot-step-driven-rail-navigation`）的目标是在不重写 Spec 1 契约、不改动 Spec 2 canonical 面板签名、不修改 Spec 3 fabric 接管结论、不触及 Spec 4 hook 签名的前提下，补上这五层交互控制：

- 让 `currentSubStage` 成为一个可被 URL / 用户 / `job.stage` 三方共同驱动的 state（而不是永远由 `resolveRailSubStage()` 派生），权威归属在 `AutopilotRoutePage`（或等价 parent scope）层。
- 引入一个新的 hook `useRightRailSubStageState({ jobStage, resolvedSubStage })`（canonical 位置 `client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts`），集中维护「URL `?sub` 值 + sticky pin + 派生值」三层合并规则，返回 `{ effectiveSubStage, pinnedSubStage, setPinnedSubStage, resetPin }`。
- 在 `<AutopilotRightRail>` 内部实现步骤驱动的自动滚动（尊重 `prefers-reduced-motion`）、键盘快捷键（`[` / `]` / `Esc` / `Shift + P`）与响应式 drawer 模式（通过 `<HoloDrawer>` 承接 `<md` 断点渲染）。
- 把 `onSubStageChange` 从 Spec 3/4 的 no-op 升级为真实回调：`(next) => { setPinnedSubStage(next); writeURL(next); /* scroll 由 effect 派生触发 */ }`。

本 spec **不**承担：

- 修改 Spec 1 冻结的 `AutopilotRightRailProps` 9 字段契约与 `AutopilotRailSubStage` 枚举。
- 修改 Spec 2 canonical 面板签名 `Pick<AutopilotRightRailProps, ...>` + 面板私有字段（`initial*` / `on*Change` / `documents`）。
- 修改 Spec 3 的 `/autopilot` fabric 接管结构或 `AutopilotSpecTreeHandoffPanel` 次级 `/specs` 链接形态。
- 修改 Spec 4 `useAutopilotRightRailData(jobId, options)` 的 hook 签名；本 spec 只通过 `options.currentSubStage = effectiveSubStage` 把本 spec 产出的 state 喂回去。
- 新增后端 REST / Socket / DTO / 任何 `shared/blueprint/contracts.ts` 改动。
- 重做 `AutopilotWorkflowRail`（左栏 5 阶段时间线）、`AutopilotVisualStage`（3D 场景 + Runtime Console），或 `SpecCenterPage`（`/specs` 页面）。
- 持久化 `pinnedSubStage` 到 `localStorage` / `sessionStorage`；持久化只在 URL 层（session scope）。
- 引入 feature flag 或运行时开关。

本 spec 必须复用的真实资产：

- 路由：`wouter` 的 `useLocation()`（项目中已在 `client/src/pages/Home.tsx` / `client/src/pages/tasks/TaskDetailPage.tsx` 使用）。URL query 同步必须通过 `useLocation()` + `new URLSearchParams(window.location.search)` 手动读写，**不**假设存在 `useSearchParams`。
- 抽屉：`client/src/components/HoloDrawer.tsx`，现有 `HoloDrawerProps` 已支持 `{ open; onClose; title; width?; children }`；本 spec 不重新实现 drawer 容器。
- 动效：`framer-motion`（项目中已在 `HoloDrawer.tsx` / `TelemetryDashboard.tsx` / `TaskOperationsHero.tsx` 使用）。
- Spec 1 冻结的 `AutopilotRailSubStage` / `RAIL_SUB_STAGE_ORDER` / `resolveRailSubStage()` / `AutopilotRightRailProps` / `<AutopilotRightRail>`。
- Spec 4 合入的 `useAutopilotRightRailData(jobId, { currentSubStage, onJobStageChange, ... })` hook。

## Glossary

- **Sub_Stage_State_Hook**：本 spec 新增的 React hook，canonical 位置 `client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts`，默认导出 `useRightRailSubStageState`。Hook 返回 `{ effectiveSubStage, pinnedSubStage, setPinnedSubStage, resetPin, isPinned, setFromKeyboard, setFromUrl }`（最终形态由 `design.md` 锁定）。
- **Effective_Sub_Stage**：`effectiveSubStage = pinnedSubStage ?? resolveRailSubStage(...)`。它是 `<AutopilotRightRail>` 实际展示的子阶段，也是喂给 Spec 4 `useAutopilotRightRailData(... , { currentSubStage: effectiveSubStage })` 的懒加载 gate 输入。
- **Pinned_Sub_Stage**：`pinnedSubStage: AutopilotRailSubStage | null`。`null` 表示「跟随自动派生」；非 `null` 表示「用户已手动固定在此子阶段」。
- **URL_Sub_Param**：URL query 参数 `?sub=<AutopilotRailSubStage>`。合法值为 `RAIL_SUB_STAGE_ORDER` 中的 8 个字符串之一；其他值（包括空字符串、未知字符串、大小写不匹配）视为非法。
- **Viewport_Tier**：三档响应式断点：`<md`（`<768px`）→ `drawer` 模式；`md-xl`（`768-1279px`）→ `side-collapsible` 模式（默认展开，用户可折叠）；`≥xl`（`≥1280px`）→ `side-fixed` 模式（Spec 3 现状，不可折叠）。
- **Drawer_Mode**：`<md` 断点下右栏降级为全屏 drawer，由 `<HoloDrawer>` 承接；在 3D 场景顶部或 `AutopilotSpecTreeHandoffPanel` 附近暴露一个触发按钮（`data-testid="autopilot-right-rail-drawer-trigger"`）。
- **Sticky_Toggle**：sticky pin 的可视化开关；UI 上同时作为「当前跟随状态」指示与「暂停 / 恢复跟随」动作入口，`data-testid="autopilot-right-rail-sticky-toggle"`。
- **Scroll_Anchor**：`<AutopilotRightRail>` 内容区中每个子阶段内容块的 anchor，通过 `data-sub-stage-anchor="${subStage}"` 属性标记；`effectiveSubStage` 变化时通过 `scrollIntoView` 触发滚动到对应 anchor。
- **Reduced_Motion**：`window.matchMedia("(prefers-reduced-motion: reduce)").matches`。当为 `true` 时所有由本 spec 触发的 scroll / drawer / pin toggle 动画降级为 `behavior: "auto"` 或直接跳过入场动画。
- **Key_Input_Focus_Guard**：键盘快捷键处理函数的一段早退逻辑；若 `event.target` 是 `<input>` / `<textarea>` / `contenteditable="true"` 或其子孙，则跳过本 spec 注册的 `[` / `]` / `Shift + P` / `Esc` 逻辑，把按键留给原控件。
- **Session_Scope_Persistence**：`pinnedSubStage` 仅在当前浏览器会话（页面存活期 + 刷新经 URL 恢复）内有效；不写 `localStorage`，不跨 tab 同步。

## Requirements

### Requirement 1：URL `?sub=xxx` 同步

**User Story:** 作为希望把当前阅读位置作为链接分享给同事的 autopilot 用户，我希望右栏的 `currentSubStage` 写入 URL query、打开 `/autopilot?sub=spec_tree` 时初始化到对应子阶段，而且刷新页面不会丢失我停留的位置。

#### Acceptance Criteria

1. WHEN `effectiveSubStage` 从一个 `AutopilotRailSubStage` 变化为另一个 `AutopilotRailSubStage`（由用户交互或由 `resolveRailSubStage()` 派生结果变化触发），THE Sub_Stage_State_Hook SHALL 使用 `window.history.replaceState(null, "", nextUrl)` 把 URL query 更新为 `?sub=<nextSubStage>`；保留 URL 中除 `sub` 之外的其他 query 参数不变；不新增 browser back/forward 堆栈条目。
2. WHEN 页面首次挂载且 URL 中 `?sub=<value>` 的 `value` ∈ `RAIL_SUB_STAGE_ORDER`，THE Sub_Stage_State_Hook SHALL 在 hook 初始化阶段把 `pinnedSubStage` 设置为 `value`；`effectiveSubStage = pinnedSubStage`；不在挂载时触发 scroll 动效（详见 Requirement 3.4）。
3. IF URL `?sub=<value>` 的 `value` 不在 `RAIL_SUB_STAGE_ORDER` 中（包括空字符串、未知字符串、大小写不匹配、`undefined`），THEN THE Sub_Stage_State_Hook SHALL 在初始化时把 `pinnedSubStage` 设置为 `null`，`effectiveSubStage` 落回 `resolveRailSubStage()` 派生值，并在一次 `useEffect` 中调用 `history.replaceState` 把非法 `sub` 参数从 URL 中**清除**（保留其他 query 参数），不抛错、不产生用户可见提示。
4. WHEN URL 不含 `?sub` 参数，THE Sub_Stage_State_Hook SHALL 把 `pinnedSubStage` 初始化为 `null`；`effectiveSubStage` 由 `resolveRailSubStage()` 派生；hook 不在挂载阶段主动写入 `?sub`（URL 首次写入发生在用户手动触发或 `resolveRailSubStage()` 结果变化时，参见 AC-1.1）。
5. WHEN 非 `fabric` 阶段（`currentStage !== "fabric"`）时，THE Sub_Stage_State_Hook SHALL 不写入 `?sub` 参数；若 URL 中已存在 `?sub`，MAY 保留（不主动清除），以便用户返回 `fabric` 时自动恢复位置；具体策略由 `design.md` 锁定并对应 PBT 覆盖。
6. THE URL 写入 SHALL 使用 `history.replaceState` 而非 `history.pushState`；若未来需要把每次手动切换都记入 browser 历史，需新建 spec 单独承接，不在本 spec 范围。
7. THE Sub_Stage_State_Hook SHALL 不依赖 `useLocation()` 的 navigate 函数写 URL；URL 写入通过 `window.history.replaceState` + 手动构造 `URLSearchParams` 完成，避免与 `wouter` 的路由匹配产生副作用（如重复触发 `Route` 组件 remount）。

### Requirement 2：Sticky pin（用户手动覆盖 + 跟随 toggle）

**User Story:** 作为想在 `spec_tree` 子阶段停留阅读的 autopilot 用户，即便 `job.stage` 继续向前推进到 `prompt_packaging`，我希望右栏不会自动跳离 `spec_tree`；同时希望有一个明显的开关可以恢复「跟随 `job.stage` 推进」的行为。

#### Acceptance Criteria

1. WHEN 用户通过点击 `<AutopilotRightRail>` 内子阶段 tab（`data-testid` 前缀 `autopilot-right-rail-sub-stage-tab-<subStage>`）、使用 `[` / `]` 快捷键或通过 URL 直接打开 `?sub=<x>`，THE Sub_Stage_State_Hook SHALL 把 `pinnedSubStage` 设置为用户选择的目标子阶段。
2. WHILE `pinnedSubStage !== null`，THE Sub_Stage_State_Hook SHALL 使 `effectiveSubStage` 始终等于 `pinnedSubStage`，不随 `resolvedSubStage` 派生值变化而改变；Spec 4 `useAutopilotRightRailData` 只通过 `options.onJobStageChange` 拉取新数据，不影响 `effectiveSubStage`。
3. WHEN 用户点击 Sticky_Toggle（`data-testid="autopilot-right-rail-sticky-toggle"`）或按 `Shift + P` 快捷键，THE Sub_Stage_State_Hook SHALL toggle `pinnedSubStage`：若当前非 `null` 则设置为 `null`（恢复跟随派生）；若当前为 `null` 则设置为 `resolvedSubStage`（即把当前自动派生的子阶段固定为 pin）。
4. THE Sticky_Toggle SHALL 以可见的方式（如图标 + 文案）指示当前状态：`pinnedSubStage !== null` 时文案为「已暂停跟随 / Pinned」；`pinnedSubStage === null` 时文案为「跟随进度 / Following progress」；`aria-pressed` 同步为 `"true"` / `"false"`。
5. THE Sticky_Toggle 的可见性 SHALL 在 `currentStage === "fabric"` 且 `effectiveSubStage` 存在时满足：`≥md` 断点下可见于右栏顶部（紧邻 8 子阶段 tab 栏）；`<md` Drawer_Mode 下可见于 drawer header（`<HoloDrawer title>` 右侧）。
6. THE Pinned_Sub_Stage 持久化范围 SHALL 仅为 session scope：同 tab 内存活且通过 URL `?sub=` 参数在刷新后恢复；不写入 `localStorage` / `sessionStorage`；不跨 tab 同步。
7. IF 用户从 `pinnedSubStage = "spec_tree"` 状态切到非 `fabric` 阶段（例如 `currentStage` 被 `<AutopilotWorkflowRail>` 改回 `"routeset"`），THEN THE Sub_Stage_State_Hook SHALL 保留 `pinnedSubStage` 值不变（session 内），使用户在重新进入 `fabric` 时仍然看到被固定的子阶段；`effectiveSubStage` 在非 `fabric` 阶段依然通过 `resolveRailSubStage()` 返回 `undefined`（由 Spec 1 resolver 保证）。

### Requirement 3：步骤驱动自动滚动

**User Story:** 作为用户切换到新子阶段后，我希望右栏内容区自动把对应子阶段 anchor 滚到可视区域，无需手动滚动定位。

#### Acceptance Criteria

1. WHEN `effectiveSubStage` 变化为一个新 `AutopilotRailSubStage`，THE `<AutopilotRightRail>` SHALL 在 `useEffect([effectiveSubStage])` 中查找 `container.querySelector(\`[data-sub-stage-anchor="${effectiveSubStage}"]\`)` 并调用 `.scrollIntoView({ behavior, block: "start" })`；`behavior` 取值见 AC-3.2。
2. WHEN Reduced_Motion 生效（`window.matchMedia("(prefers-reduced-motion: reduce)").matches === true`），THE `<AutopilotRightRail>` SHALL 使用 `behavior: "auto"`；否则使用 `behavior: "smooth"`。该判断 SHALL 在每次 scroll 触发时读取最新值，支持用户运行时切换偏好。
3. WHEN 找不到 `[data-sub-stage-anchor="${effectiveSubStage}"]`（例如对应子阶段面板尚未渲染或已被删除），THE `<AutopilotRightRail>` SHALL 以 no-op 结束，不抛错、不 fallback 到别的 anchor。
4. WHEN 组件首次挂载（`useRef<boolean>` flag 标记），THE `<AutopilotRightRail>` SHALL 跳过 smooth scroll 动效：若 URL `?sub` 或派生 `effectiveSubStage` 已经指向非起点子阶段，首次 scroll 使用 `behavior: "auto"`（即使 `prefers-reduced-motion` 为 `reduce` 也不变），避免首次渲染出现视觉跳变。
5. THE 自动滚动 SHALL 只作用于右栏内容 scroll container（`data-testid="autopilot-right-rail-scroll-container"`），不改动 `document.scrollingElement` 或 `<main>` 的滚动位置。
6. IF `<AutopilotRightRail>` 处于 Drawer_Mode（`<md` 断点），THEN 自动滚动 SHALL 作用于 drawer 内的内容区；不影响页面主滚动；drawer 关闭时 scroll 位置无需保留。
7. THE 自动滚动 SHALL 在 `pinnedSubStage` toggle、URL `?sub` 初始化、键盘快捷键切换、tab 点击四种触发路径下表现一致，实现 sample：所有路径最终都更新 `effectiveSubStage` → 触发同一条 `useEffect([effectiveSubStage])` → 执行相同的 scroll 逻辑。

### Requirement 4：键盘快捷键（`[` / `]` / `Esc` / `Shift + P`）

**User Story:** 作为希望用键盘快速在子阶段之间切换的 power user，我希望 `[` / `]` 前后切换、`Esc` 在 drawer 模式下关闭抽屉、`Shift + P` toggle sticky pin；在输入框 focus 内这些快捷键应该被禁用，避免打扰正在打字的用户。

#### Acceptance Criteria

1. WHEN 用户按下 `[` 键，THE `<AutopilotRightRail>` SHALL 把 `effectiveSubStage` 切换为 `RAIL_SUB_STAGE_ORDER[indexOf(effectiveSubStage) - 1]`；若当前已是 `RAIL_SUB_STAGE_ORDER[0]`（`agent_crew_fabric`），`[` 为 no-op（不循环、不越界）。切换通过调用 hook 的 `setPinnedSubStage(next)` 实现（即每次键盘切换都 pin 到新子阶段）。
2. WHEN 用户按下 `]` 键，THE `<AutopilotRightRail>` SHALL 把 `effectiveSubStage` 切换为 `RAIL_SUB_STAGE_ORDER[indexOf(effectiveSubStage) + 1]`；若当前已是 `RAIL_SUB_STAGE_ORDER[RAIL_SUB_STAGE_ORDER.length - 1]`（`artifact_memory`），`]` 为 no-op。
3. WHEN 用户按下 `Escape` 键且当前 `<AutopilotRightRail>` 处于 Drawer_Mode 且 drawer 为打开状态，THE `<AutopilotRightRail>` SHALL 触发 `<HoloDrawer>` 的 `onClose` 关闭抽屉；否则（`<md` 之外、drawer 已关闭、或非 fabric 阶段）`Escape` 为 no-op（不影响 `<HoloDrawer>` 自带的 Escape 关闭逻辑；避免重复注册造成行为叠加）。
4. WHEN 用户按下 `Shift + P` 组合键（`event.shiftKey === true` 且 `event.key === "P"`），THE `<AutopilotRightRail>` SHALL 调用 hook 的 sticky toggle（等价于 Requirement 2.3）。
5. IF 按键事件的 `event.target` 是 `<input>` / `<textarea>` / `contenteditable="true"` 元素或其子孙，THEN THE Key_Input_Focus_Guard SHALL 使 hook 本 spec 注册的所有快捷键（`[` / `]` / `Esc` / `Shift + P`）早退为 no-op；原控件的按键行为（如在 input 中输入 `[`）不受影响。
6. THE 键盘快捷键 SHALL 注册在 `document.addEventListener("keydown", handler)` 层（而非单个组件 DOM element），生命周期与 `<AutopilotRightRail>` 挂载一致；组件 unmount 时 `document.removeEventListener` 必须被调用。
7. IF `currentStage !== "fabric"`，THEN `[` / `]` / `Shift + P` SHALL 为 no-op（非 fabric 阶段下没有子阶段语义）；`Esc` 在 drawer 关闭时仍为 no-op。
8. WHEN `event.metaKey` / `event.ctrlKey` / `event.altKey` 中任一为 `true`（例如 `Cmd + [` 浏览器后退），THE Key_Input_Focus_Guard SHALL 使 hook 注册的快捷键早退为 no-op，避免拦截浏览器或 OS 级快捷键。

### Requirement 5：响应式 drawer（`<md` / `md-xl` / `≥xl` 三档）

**User Story:** 作为在平板或手机上访问 `/autopilot` 的用户，我不希望 400px 右列把 3D 场景挤到无法使用；希望在 `<md` 断点下右栏降级为全屏 drawer，在 `md-xl` 断点下可以手动折叠右栏。

#### Acceptance Criteria

1. THE Viewport_Tier SHALL 由 hook 内部（或 `<AutopilotRightRail>` 内部）监听 `window.matchMedia("(min-width: 768px)")` 与 `window.matchMedia("(min-width: 1280px)")` 实时计算，支持运行时（resize）切换。
2. WHILE Viewport_Tier === `"drawer"`（`<md`，即 `<768px`），THE `<AutopilotRightRail>` SHALL 不在 grid 右列渲染 400px 面板；改为：a) 在 3D 场景顶部或 `AutopilotSpecTreeHandoffPanel` 旁边渲染一个触发按钮（`data-testid="autopilot-right-rail-drawer-trigger"`），文案「展开右栏 / Expand rail」或等价 i18n；b) 点击触发按钮时以 `<HoloDrawer open={true} onClose={...} title={...} width={400}>` 包裹 `<AutopilotRightRail>` 的内部内容；drawer 宽度由 `<HoloDrawer>` 内部 clamp 到 ≤420px；c) drawer 内**不**渲染左栏 `<AutopilotWorkflowRail>` 5 阶段时间线（避免内容密度爆炸）。
3. WHILE Viewport_Tier === `"side-collapsible"`（`768-1279px`），THE `<AutopilotRightRail>` SHALL 在右列保留 400px 面板，但在面板顶部渲染一个折叠开关（`data-testid="autopilot-right-rail-collapse-toggle"`），`aria-expanded` 同步为 `"true"` / `"false"`；折叠态下 3D 场景 grid 列从 `minmax(0,1fr)_400px` 切换为 `minmax(0,1fr)`；展开时恢复 Spec 3 现状。
4. WHILE Viewport_Tier === `"side-fixed"`（`≥1280px`），THE `<AutopilotRightRail>` SHALL 保持 Spec 3 现状：400px 右列不可折叠、不显示折叠开关、也不显示 drawer 触发按钮。
5. WHEN Viewport_Tier 在运行时从 `"drawer"` 切换到 `"side-collapsible"` 或 `"side-fixed"`（例如用户把窗口从 700px 拉宽到 1200px），THE `<AutopilotRightRail>` SHALL 自动关闭 drawer（如果打开），并在右列以展开态渲染；反向切换时同理。
6. THE Drawer_Mode SHALL 复用 `client/src/components/HoloDrawer.tsx` 的 `HoloDrawerProps`，不重新实现 drawer 容器；本 spec 只在 consumer 侧传 `open / onClose / title / width / children`，不扩展 `HoloDrawer` 签名。
7. IF `currentStage !== "fabric"`，THEN drawer 触发按钮 SHALL 不可见；折叠开关 SHALL 不可见；Viewport_Tier 下的右列渲染逻辑 SHALL 仍沿用 Spec 3 现状（`<AutopilotRightRail>` 本身在非 fabric 阶段不渲染）。

### Requirement 6：Hook 集成与 Parent 所有权

**User Story:** 作为维护者，我需要明确 `pinnedSubStage` / URL 同步 state 的所有权归属，避免 `<AutopilotRightRail>` 与 `AutopilotRoutePage` 之间出现双写。

#### Acceptance Criteria

1. THE Sub_Stage_State_Hook（`useRightRailSubStageState`）SHALL 在 `AutopilotRoutePage.tsx` 的 fabric 分支中调用（或等价 parent scope，具体由 `design.md` 锁定），而**不**在 `<AutopilotRightRail>` 内部调用；因为 `<AutopilotRightRail>` 的 `currentSubStage` / `onSubStageChange` 是 Spec 1 冻结 props，内部不应持有权威 state。
2. THE `AutopilotRoutePage.tsx` SHALL 把 hook 返回的 `effectiveSubStage` 作为 `<AutopilotRightRail currentSubStage={...}>` props 下传，把 hook 返回的 `setPinnedSubStage` 包装为 `onSubStageChange={(next) => setPinnedSubStage(next)}` 下传给 `<AutopilotRightRail>`。
3. THE `AutopilotRoutePage.tsx` SHALL 把同一个 `effectiveSubStage` 作为 Spec 4 `useAutopilotRightRailData(latestJob?.id ?? "", { currentSubStage: effectiveSubStage, onJobStageChange: ..., ... })` 的 `options.currentSubStage` 入参，实现 URL / pin / scroll / 数据懒加载共用一个 state 口径。
4. THE Sub_Stage_State_Hook SHALL 接收 `{ jobStage, resolvedSubStage }` 作为输入参数（`jobStage` 用于 URL 写入时机判断、`resolvedSubStage` 用于 toggle 回 pin 时的种子值）；hook 内部不重复调用 `resolveRailSubStage()`；解析规则仍由 Spec 1 的 resolver 统一。
5. THE Sub_Stage_State_Hook SHALL 不订阅 `useAppStore` / `useProjectStore`；不调用任何全局 store setter；不写入 `localStorage` / `sessionStorage`。
6. THE Sub_Stage_State_Hook SHALL 暴露一个稳定引用的 `setPinnedSubStage(next: AutopilotRailSubStage | null): void`（通过 `useCallback` 实现），调用时同时负责：a) 更新内部 state；b) 写入 URL `?sub`；不负责 scroll（scroll 由 `<AutopilotRightRail>` 的 `useEffect([effectiveSubStage])` 派生触发）。
7. THE Sub_Stage_State_Hook 的 `resetPin()` SHALL 等价于 `setPinnedSubStage(null)`，并同步清除 URL `?sub` 参数（保留其他 query 参数）。

### Requirement 7：与 `job.stage` 推进的互动

**User Story:** 作为跟随工作流推进的用户，我希望 `job.stage` 推进（如 `spec_tree → spec_docs`）时，若我没有手动 pin 子阶段，右栏自动跳到对应下一个子阶段；若我已经 pin 在某个子阶段，`job.stage` 推进只影响 Spec 4 hook 的 targeted refetch（数据会更新），但 `effectiveSubStage` 不变。

#### Acceptance Criteria

1. WHILE `pinnedSubStage === null` 且 `currentStage === "fabric"`，WHEN `job.stage` 变化导致 `resolveRailSubStage()` 返回的新 `resolvedSubStage` 与上一次不同，THE Sub_Stage_State_Hook SHALL 使 `effectiveSubStage` 立即反映 `resolvedSubStage`；这将触发 `<AutopilotRightRail>` 的自动滚动（Requirement 3）与 URL 写入（Requirement 1）。
2. WHILE `pinnedSubStage !== null`，WHEN `job.stage` 变化，THE Sub_Stage_State_Hook SHALL 保持 `effectiveSubStage = pinnedSubStage`；但 Spec 4 `useAutopilotRightRailData` 仍会通过 `options.onJobStageChange` 回调被触发 targeted refetch（由 Spec 4 hook 自身决定），`<AutopilotRightRail>` 对应子阶段面板的数据会更新但不会切换可见子阶段。
3. WHILE `pinnedSubStage !== null`，IF 用户通过 Sticky_Toggle / `Shift + P` 手动 resetPin，THEN `pinnedSubStage` 变为 `null`；下一次 React render 中 `effectiveSubStage` 立即跳到当前 `resolvedSubStage`（可能是一个与之前 pin 不同的子阶段，因为 `job.stage` 期间可能已推进）；这次跳转遵守 Requirement 3 的 scroll 规则。
4. WHEN `job.stage` 在短时间内快速连续推进（例如 `spec_tree → spec_docs → prompt_packaging` 连续 3 次 SSE 推送），THE Sub_Stage_State_Hook SHALL 只在最后一次推进结果上把 `effectiveSubStage` 落到对应子阶段（由 React reconciliation 自然保证；hook 不引入 debounce / throttle）。
5. THE Sub_Stage_State_Hook SHALL 不直接订阅 SSE 或 polling；`job.stage` 变化通过 `resolvedSubStage` 参数被动反映（上游 `AutopilotRoutePage` 在 job 更新时自然触发 re-render，hook 内部的 `useMemo` / `useEffect` 依赖 `resolvedSubStage` 即可）。

### Requirement 8：可访问性 A11y

**User Story:** 作为依赖屏幕阅读器或键盘操作的用户，我希望子阶段切换被 aria 标记、drawer 作为 modal 暴露、焦点在 drawer 打开/关闭时合理流转。

#### Acceptance Criteria

1. THE 8 个子阶段 tab（`data-testid="autopilot-right-rail-sub-stage-tab-<subStage>"`）SHALL 在当前激活的子阶段上设置 `aria-current="location"`；非激活 tab 不设置或设置 `aria-current="false"`。
2. THE Sticky_Toggle SHALL 设置 `aria-pressed="true"` / `"false"` 对应 `pinnedSubStage !== null` / `=== null`；`aria-label` 提供人类可读描述（如「已暂停跟随进度 / Currently pinned」/「跟随进度推进 / Following progress」）。
3. WHEN Drawer_Mode 下 drawer 打开，THE `<HoloDrawer>` 内部 DOM 根节点 SHALL 具有 `role="dialog"` 与 `aria-modal="true"` 属性（`<HoloDrawer>` 现有实现已具备或通过本 spec 补上）；drawer 打开后首个可聚焦元素 SHALL 接收焦点；drawer 关闭后焦点返回触发按钮。
4. WHEN 子阶段切换（由任一路径触发，包括 URL / tab click / 键盘 / job.stage 推进），THE `<AutopilotRightRail>` SHALL 通过 `aria-live="polite"` 区域 announce 新子阶段名称（i18n 化文案），让屏幕阅读器用户感知切换；announce 区 `data-testid="autopilot-right-rail-sr-announcer"`，视觉上通过 `sr-only` class 隐藏。
5. THE 键盘快捷键提示 SHALL 通过 `data-testid="autopilot-right-rail-keyboard-hint"` 元素在右栏某处静默展示（非 toast、非 modal），文案包含 `[` / `]` / `Esc` / `Shift + P` 的作用说明；提示可通过一个 dismiss 按钮关闭（session scope，不持久化）。
6. THE 折叠开关（`autopilot-right-rail-collapse-toggle`）SHALL 设置 `aria-expanded="true"` / `"false"` 同步当前折叠状态；`aria-controls` 指向面板容器 id。
7. WHEN 快捷键 `[` / `]` / `Shift + P` 被 Key_Input_Focus_Guard 跳过（因为焦点在 input 内），THE `<AutopilotRightRail>` SHALL **不**通过 announce 区或 toast 打扰用户；静默跳过即可。

### Requirement 9：Testid 冻结与扩展

**User Story:** 作为回归保障者，我需要本 spec 仅新增明确列出的 testid，不得修改 Spec 1-4 已有 testid。

#### Acceptance Criteria

1. THE 本 spec SHALL 新增以下 testid（不删除、不重命名）：`autopilot-right-rail-sticky-toggle`、`autopilot-right-rail-keyboard-hint`、`autopilot-right-rail-drawer-trigger`、`autopilot-right-rail-drawer`（或 `<HoloDrawer>` 渲染的 drawer 外层元素带此 testid）、`autopilot-right-rail-collapse-toggle`、`autopilot-right-rail-scroll-container`、`autopilot-right-rail-sr-announcer`、`autopilot-right-rail-sub-stage-tab-<subStage>`（8 个，`subStage` ∈ `RAIL_SUB_STAGE_ORDER`）。
2. THE 本 spec SHALL **不**修改 Spec 1-4 冻结的 testid，包括但不限于：`autopilot-right-rail`（若 Spec 1 scaffolding 已设置）、`blueprint-progress-panel`、`autopilot-open-specs-link`、`autopilot-generate-routeset-button`、`autopilot-selection-step`、`autopilot-fabric-step` 等。
3. IF 需要在 Spec 2 canonical 面板内部添加 anchor（`data-sub-stage-anchor="${subStage}"`），THEN 本 spec SHALL 把 anchor 加在 `<AutopilotRightRail>` scaffolding 层（如每个子阶段内容块的外层 `<section>`），而**不**修改 canonical 面板内部 DOM 结构。
4. THE `autopilot-right-rail-drawer` testid SHALL 标记 drawer 外层容器（可在 `<HoloDrawer>` 外再包一层带 testid 的 `<div>`，或通过 `<HoloDrawer>` 已有 props 注入）；具体实现由 `design.md` 锁定。
5. THE 所有新增 testid SHALL 在至少一个测试文件中被断言（unit 或 PBT），确保未来修改时能快速定位是否破坏契约。

### Requirement 10：PBT 与 edge-case 测试要求

**User Story:** 作为回归保障者，我需要 hook 的三个核心性质（URL ⇔ state idempotent / pin semantics / keyboard boundaries）被 fast-check PBT 覆盖，避免未来改动悄悄引入 bug。

#### Acceptance Criteria

1. THE Sub_Stage_State_Hook_Tests SHALL 提供一条 fast-check PBT **P1 — URL ⇔ State idempotent**：生成任意合法 `subStage ∈ RAIL_SUB_STAGE_ORDER` 的序列 `seq`（长度 2-6），依次调用 hook 的 `setPinnedSubStage` 写入每个值；每次写入后读回 URL `?sub` 并再次 parse 为 `AutopilotRailSubStage`；断言：最终 URL 中的 `?sub` 等于 `seq[seq.length - 1]`；且「写 → 读回 → 再写相同值」是幂等（不产生 history 条目、不多次触发 state update）。`numRuns: 50`。
2. THE Sub_Stage_State_Hook_Tests SHALL 提供一条 fast-check PBT **P2 — Pin semantics**：生成任意 `jobStageSeq: BlueprintGenerationJob["stage"][]`（模拟 `job.stage` 推进，长度 2-8，取自 Spec 1 枚举）与任意 `userActions: Array<{ type: "click-tab" | "key-[" | "key-]" | "toggle-pin"; target?: AutopilotRailSubStage }>`（长度 0-10）；交错执行两个序列（如先若干 jobStage 变化、再若干 userActions、再若干 jobStage）；断言最终状态满足：若 `pinnedSubStage !== null` 则 `effectiveSubStage === pinnedSubStage`；若 `pinnedSubStage === null` 则 `effectiveSubStage === resolveRailSubStage({ currentStage: "fabric", job: { stage: lastJobStage }, ... })`。`numRuns: 50`。
3. THE Sub_Stage_State_Hook_Tests SHALL 提供一条 fast-check PBT **P3 — Keyboard shortcut boundaries**：生成任意 `keySeq: Array<"[" | "]">`（长度 0-30），从初始 `effectiveSubStage = RAIL_SUB_STAGE_ORDER[0]` 开始执行 keySeq；断言：任意时刻 `RAIL_SUB_STAGE_ORDER.indexOf(effectiveSubStage)` 满足 `0 ≤ index ≤ RAIL_SUB_STAGE_ORDER.length - 1`（不越界、不循环、边界到达时对应方向的快捷键 no-op）。`numRuns: 100`。
4. THE Sub_Stage_State_Hook_Tests SHALL 提供 unit 测试覆盖：a) URL 非法值初始化降级到 `null`；b) URL 首次挂载不触发 scroll 动效；c) `prefers-reduced-motion` 切换为 `reduce` 时 scroll 使用 `behavior: "auto"`；d) `[` / `]` 在 `<input>` focus 内被跳过；e) Shift + P 在非 fabric 阶段 no-op；f) Drawer_Mode 下 Esc 关闭 drawer；g) Viewport_Tier 运行时切换（resize）时 drawer 自动关闭；h) `setPinnedSubStage(null)` 清除 URL `?sub`。
5. THE PBT Tests SHALL 控制 `fc.assert` 的 `numRuns` 在 50-100 范围；失败时 fast-check 的 shrink 规则应能输出最小化计数示例（例如最短 keySeq、最少 jobStage 转换、最小 userActions 组合）。
6. THE Tests SHALL 不依赖真实 `window.history` 写入跨测试泄漏；通过 `beforeEach` 重置 `window.history.replaceState(null, "", "/autopilot")` 与 `window.matchMedia` mock 隔离。
7. THE PBT Tests 文件 SHALL 为 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.property.test.ts`；unit 测试在 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.test.ts`；drawer / scroll / keyboard 的 DOM 级集成测试可放在 `client/src/pages/autopilot/right-rail/__tests__/rail-navigation.integration.test.tsx`（具体组织由 `design.md` 锁定）。

### Requirement 11：端到端回归与 parity

**User Story:** 作为 release 把关者，我需要 Spec 5 合入后 `/autopilot` 与 `/specs` 的 Spec 1-4 已有测试、fabric 接管、canonical 面板 parity 全部继续通过。

#### Acceptance Criteria

1. WHEN 本 spec 合入后，THE `npm exec vitest run client/src/pages/specs` SHALL 全部通过，包含 Spec 2 的 `props-narrowing.property.test.ts` / `shim-identity.test.ts` / `rendering-parity.test.tsx`。
2. WHEN 本 spec 合入后，THE `npm exec vitest run client/src/pages/autopilot` SHALL 全部通过，包含 Spec 1 `resolve-rail-sub-stage.property.test.ts`、Spec 3 `fabric-dispatch.property.test.tsx` / fold removal snapshot / selection → fabric no-navigation、Spec 4 的 3 条 PBT + unit 测试、以及本 spec 新增的 3 条 PBT + unit + 集成测试。
3. THE `node --run check` SHALL 通过，不扩大现有 TypeScript 基线错误数；本 spec 新增文件与修改文件不引入新的类型错误。
4. THE `/specs` 页面（`SpecCenterPage` → `BlueprintProgressPanel`）行为 SHALL 与 Spec 4 完成后一致：URL `?sub` 同步、sticky pin、自动滚动、键盘快捷键、drawer 模式均**不**在 `/specs` 路径启用（本 spec 的 hook 只在 `AutopilotRoutePage` 的 fabric 分支接入；`BlueprintProgressPanel` 不引入新 hook）。
5. THE `<AutopilotRightRail>` 的 `AutopilotRightRailProps` 契约 SHALL 保持 Spec 1 冻结形态不变；本 spec 只在 consumer 侧改变 `currentSubStage` / `onSubStageChange` 两个 props 的值来源。
6. IF 本 spec 合入后发现 `/autopilot` fabric 阶段或 `/specs` 页面出现 DOM drift，THEN 应通过调整 `AutopilotRoutePage.tsx` 的 hook 接线或 `<AutopilotRightRail>` scaffolding 的新增 DOM 层，而**不**修改 Spec 2 canonical 面板或 Spec 1 `<AutopilotRightRail>` scaffolding 已有 DOM 结构。

### Requirement 12：非目标、回滚与边界

**User Story:** 作为 release 管理者，我需要本 spec 清楚列出不做的事与改动文件范围，便于回滚。

#### Acceptance Criteria

1. THE 本 spec SHALL **不**持久化 `pinnedSubStage` 到 `localStorage` / `sessionStorage`；持久化范围仅 session scope（URL 参数）。
2. THE 本 spec SHALL **不**引入 feature flag 或运行时开关；Spec 5 的改动是一次性合入，通过 `git revert` 回退。
3. THE 本 spec SHALL **不**新增后端 REST / Socket / DTO / `shared/blueprint/contracts.ts` 字段。
4. THE 本 spec SHALL **不**修改 Spec 1 冻结的 `AutopilotRightRailProps` / `AutopilotRailSubStage` / `RAIL_SUB_STAGE_ORDER` / `resolveRailSubStage()`。
5. THE 本 spec SHALL **不**修改 Spec 2 canonical 面板（`client/src/pages/autopilot/right-rail/panels/*`）的签名或内部 DOM；anchor 加在 scaffolding 层。
6. THE 本 spec SHALL **不**修改 Spec 3 的 fabric 接管结论或 `AutopilotSpecTreeHandoffPanel` 次级链接形态。
7. THE 本 spec SHALL **不**修改 Spec 4 `useAutopilotRightRailData(jobId, options)` 的 hook 签名；本 spec 只通过 `options.currentSubStage = effectiveSubStage` 把 state 喂回去。
8. THE 本 spec SHALL **不**做 analytics 埋点、**不**做 `<xs` 极小屏（`<360px`）专门优化、**不**支持多 job 并存、**不**做 deep link 到某个 testid（只 `?sub=<subStage>` 粒度）。
9. THE 本 spec 的文件改动 SHALL 限定在以下范围：
   - 新增 `client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts`
   - 新增 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.test.ts`
   - 新增 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.property.test.ts`
   - 可选新增 `client/src/pages/autopilot/right-rail/__tests__/rail-navigation.integration.test.tsx`
   - 修改 `client/src/pages/autopilot/right-rail/index.ts`（新增 re-export）
   - 修改 `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`（scroll container、anchor、tab `aria-current`、键盘快捷键注册、drawer 触发按钮、折叠开关、sticky toggle UI、sr-announcer、Viewport_Tier 三档渲染）
   - 修改 `client/src/pages/autopilot/AutopilotRoutePage.tsx`（接入 hook，把 `effectiveSubStage` 同时下传给 `<AutopilotRightRail currentSubStage>` 与 Spec 4 `useAutopilotRightRailData(..., { currentSubStage })`；把 `onSubStageChange` 从 no-op 升级为 `setPinnedSubStage`）
   - 按需修改相关测试文件（`AutopilotRoutePage.test.tsx` 等）以配合新交互
10. IF 需要回滚本 spec，THEN `git revert` 上述文件集合 SHALL 能恢复到 Spec 4 完成后的状态；Spec 1/2/3/4 的产物不受影响；`onSubStageChange` 回退为 no-op、`currentSubStage` 回退为 `resolveRailSubStage()` 直接派生。
