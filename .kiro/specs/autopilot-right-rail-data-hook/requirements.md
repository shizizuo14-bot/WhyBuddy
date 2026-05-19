# 需求文档：Autopilot 右栏数据层 Hook 化与合并

## Introduction

Spec 1 `autopilot-cockpit-right-rail-convergence` 冻结了 `AutopilotTimelineStage / AutopilotRailSubStage / RAIL_SUB_STAGE_ORDER`（8 个 fabric 子阶段）、`AutopilotRightRailProps`（9 个数据插槽：`job / routeSet / selection / specTree / agentCrew / capabilities / capabilityInvocations / capabilityEvidence / effectPreviews`）、`resolveRailSubStage()` 纯函数以及 `<AutopilotRightRail>` scaffolding；Spec 2 `autopilot-right-rail-stage-panels` 将 `BlueprintProgressPanel.tsx`（~5700 行）内部 6 个内联 local function + 2 个 wrapper 抽离为 `client/src/pages/autopilot/right-rail/panels/` 下的 8 个 canonical 面板，每个面板遵循 `Pick<AutopilotRightRailProps, ...>` + 面板私有字段（`initial*` / `on*Change`）的签名约定；Spec 3 `autopilot-advanced-workbench-inline` 已删除 `/autopilot` 底部 `<details data-testid="autopilot-advanced-workbenches">` 折叠区，`<AutopilotRightRail>` 在 `currentStage === "fabric"` 时接管 400px 右列，次级 `/specs` 链接作为安静入口保留。

截至 Spec 3 合入，8 个 canonical 面板内部仍然**各自持有** fetch（`fetchBlueprintEffectPreviews / fetchBlueprintPromptPackages / fetchBlueprintCapabilities + fetchBlueprintJobCapabilities + fetchBlueprintCapabilityInvocations + fetchBlueprintCapabilityEvidence / fetchBlueprintEngineeringLanding / fetchBlueprintEngineeringRuns / fetchBlueprintArtifactLedger / fetchBlueprintArtifactReplays`）、`useEffect` bootstrap 与 `useState` 缓存，并通过 `BlueprintProgressPanel` 的 `initial*` / `on*Change` 回调与顶层状态双向同步；`BlueprintProgressPanel` 顶层在 `autoLoad={true}` 场景（由 `SpecCenterPage` 托管的 `/specs` 深链路径）额外调用 `fetchLatestBlueprintGenerationJob` / `fetchBlueprintSpecsProgress`。`AutopilotRoutePage` 侧则通过 `useMemo(readAutopilotAgentCrew(latestJob), [latestJob])` 等 5 条派生规则从 `latestJob` 衍生出 `autopilotAgentCrew / autopilotCapabilities / autopilotCapabilityInvocations / autopilotCapabilityEvidence / autopilotEffectPreviews`。

这种现状带来四个具体痛点：

1. **fetch 碎片化**：9 个 fetch 调用散落在 5 个面板和 `BlueprintProgressPanel` 顶层 autoLoad 里，无法统一控制并发、去重、错误重试。
2. **懒加载失控**：在 `/specs` 路径 `autoLoad={true}` 场景下，即便用户还未真正进入 `fabric` 阶段，prompt-package / engineering-landing / artifact-ledger 等深层下游数据仍会被拉起，浪费带宽并拖慢首屏。
3. **Socket / 推进联动缺失**：`BlueprintGenerationJob.stage` 向前推进（如 `spec_tree → spec_docs → prompt_packaging`）后，下游数据不会自动刷新，需要用户手动展开面板或刷新页面；`fetchBlueprintJobEventStreamUrl` 已在 `@/lib/blueprint-api` 提供但尚未在 fabric 右栏被消费。
4. **组件测试难写**：面板同时负责 UI + fetch + cache，无法单独做 `Pick<AutopilotRightRailProps, ...>` 的 props-narrowing 测试（Spec 2 P1 PBT 已感受到这个痛点）。

本 spec（Spec 4 `autopilot-right-rail-data-hook`）的目标是新增一个**纯粹的 fetch orchestration + 局部 cache** hook `useAutopilotRightRailData(jobId, options)`，承担 9 个顶层字段 + 6 个下游字段（`promptPackages / landingPlans / engineeringRuns / artifactEntries / artifactReplays / artifactFeedback`）的统一拉取、按子阶段懒加载、per-field 错误 / 重试、以及 `jobId` / `job.stage` 变化下的 cache invalidate。Hook 的 canonical 位置固定为 `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts`；`client/src/pages/specs/hooks/use-blueprint-progress-data.ts` 从占位字符串常量改写为对 canonical hook 的 re-export shim。`AutopilotRoutePage` 与 `BlueprintProgressPanel` 以 Phase A 兼容模式接入：旧 `initial*` / `on*Change` 回调继续支持（作为 `options.initialData` 与可选的外部 setter），内部不再重复发起 fetch。

本 spec **不**承担：

- 重写 Spec 2 抽离出的 8 个 canonical 面板的内部 UI 实现；hook 只改变数据来源，面板签名保持 `Pick<AutopilotRightRailProps, ...>` + 面板私有 `initial*` / `on*Change`。
- 重写 Spec 3 的 `/autopilot` fabric 接管或 `AutopilotSpecTreeHandoffPanel` 次级链接形态。
- Spec 5 `autopilot-step-driven-rail-navigation` 的 URL `?sub=xxx` 参数、sticky pin、自动滚动、`<md` 抽屉化布局、键盘快捷键。
- 修改 `shared/blueprint/contracts.ts`、`server/routes/blueprint.ts` 等后端契约；hook 只复用现有 `@/lib/blueprint-api` 的 9 个 fetch 函数与 `fetchBlueprintJobEventStreamUrl` SSE 入口。
- 移除 `BlueprintProgressPanel.tsx` 的 `initial*` props（Phase B 工作，不在本 spec 范围；本 spec 保留向后兼容）。
- 引入 `useAppStore` 或 `useProjectStore` 订阅；hook 必须是纯粹的 React hook，不读写全局 store。

## Glossary

- **Canonical_Hook**：本 spec 引入的新权威 hook，文件位置 `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts`，默认导出 `useAutopilotRightRailData`。
- **Shim_Hook_File**：`client/src/pages/specs/hooks/use-blueprint-progress-data.ts`。Spec 1 阶段该文件只是字符串常量 `USE_BLUEPRINT_PROGRESS_DATA_PLACEHOLDER`；本 spec 末尾改写为单行 re-export，指向 Canonical_Hook。
- **Right_Rail_Data_View**：Canonical_Hook 的返回类型 `RightRailDataView`，持有 9 个顶层数据字段（与 Spec 1 `AutopilotRightRailProps` 一致）+ 6 个下游字段（`promptPackages / landingPlans / engineeringRuns / artifactEntries / artifactReplays / artifactFeedback`）+ 每个字段的 `RightRailDataFieldStatus<T>` 状态对象。
- **RightRailDataFieldStatus\<T>**：单字段状态对象，形如 `{ data: T | null; loading: boolean; error: ApiRequestError | null; retry: () => void }`。
- **Wave**：hook 内部发起的一轮并发 fetch 分组。本 spec 定义 4 个 Wave：Wave 1 顶层（`job + routeSet + selection + specTree`）、Wave 2 fabric 基础（`agentCrew + capabilities + capabilityInvocations + capabilityEvidence`）、Wave 3 fabric 中层（`effectPreviews + promptPackages + landingPlans + engineeringRuns`）、Wave 4 artifact（`artifactEntries + artifactReplays + artifactFeedback`）。
- **Lazy_Load_Gate**：按 `currentSubStage`（由 `resolveRailSubStage()` 计算）决定是否发起某字段 fetch 的条件规则；详见 `design.md` 懒加载规则表。
- **Job_Stage_Driven_Refetch**：当 `job.stage` 发生变化（如 `spec_tree → spec_docs`）时对下游相关字段的 targeted refetch；不是全量刷新。
- **Phase_A_Compatibility**：本 spec 的接入策略。`BlueprintProgressPanel.tsx` 继续暴露 `initialJob / initialRouteSet / initialSelection / initialSpecTree / initialEffectPreviews / initialCapabilities / initialAgentCrew / initialClarificationSession / initialCapabilityInvocations / initialCapabilityEvidence / autoLoad / show*` 等现有 props；内部通过 Canonical_Hook 消费数据，移除各自面板内的 autoLoad fetch 与 `useEffect` bootstrap，但保留面板外层 `initial*` / `on*Change` 转接。
- **Phase_B_Cleanup**：未来 spec（不在本 spec 范围）的工作：移除 `BlueprintProgressPanel` 的 `initial*` props，统一由 Canonical_Hook 承接。
- **Ignore_Stale_Policy**：hook 内部处理 `jobId` 变化 / `job.stage` 变化 / 快速连续 refetch 时的竞态保护策略；使用 `AbortController` 与 `ignoreStale` 标记位，保证最后一次 request 的结果 win。
- **AutopilotRoutePage_Consumer**：`client/src/pages/autopilot/AutopilotRoutePage.tsx`，在 fabric 阶段从 hook 消费数据并下传到 `<AutopilotRightRail>`。
- **BlueprintProgressPanel_Consumer**：`client/src/pages/specs/BlueprintProgressPanel.tsx`，Phase A 模式下仍为 `/specs` 路径 + 底部 fallback（Spec 3 已删 autopilot 挂载点）提供组合视图，内部改由 hook 提供 9 + 6 个字段。

## Requirements

### Requirement 1：Hook API 形状与契约

**User Story:** 作为 Spec 2 canonical 面板与 Spec 3 接线点的共同上游，我希望 `useAutopilotRightRailData` 暴露一个稳定的 `RightRailDataView`，这样无论来自 `/autopilot` 还是 `/specs`，都能消费同一套数据 + 状态。

#### Acceptance Criteria

1. THE Canonical_Hook SHALL 导出签名 `export function useAutopilotRightRailData(jobId: string, options?: UseAutopilotRightRailDataOptions): RightRailDataView;`，并从 `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts` 以 named export 形式提供。
2. THE Canonical_Hook SHALL 导出类型 `RightRailDataView`、`UseAutopilotRightRailDataOptions`、`RightRailDataFieldStatus<T>`，并在 `client/src/pages/autopilot/right-rail/index.ts` barrel 中 re-export。
3. THE RightRailDataView SHALL 为 Spec 1 冻结的 9 个数据插槽（`job / routeSet / selection / specTree / agentCrew / capabilities / capabilityInvocations / capabilityEvidence / effectPreviews`）以及本 spec 新增的 6 个下游字段（`promptPackages / landingPlans / engineeringRuns / artifactEntries / artifactReplays / artifactFeedback`）各自暴露一个 `RightRailDataFieldStatus<T>` 对象，字段名与 `@/lib/blueprint-api` 返回体中的字段名对齐。
4. THE UseAutopilotRightRailDataOptions SHALL 至少包含以下可选字段：`initialData?: Partial<{ job; routeSet; selection; specTree; agentCrew; capabilities; capabilityInvocations; capabilityEvidence; effectPreviews; promptPackages; landingPlans; engineeringRuns; artifactEntries; artifactReplays; artifactFeedback }>`、`pollingIntervalMs?: number`、`skipLazyLoad?: boolean`、`currentSubStage?: AutopilotRailSubStage`、`onJobStageChange?: (next: BlueprintGenerationJob["stage"], prev: BlueprintGenerationJob["stage"] | null) => void`、`onFieldError?: (field: keyof RightRailDataView, error: ApiRequestError) => void`。
5. WHEN `jobId` 为空字符串或仅包含空白，THE Canonical_Hook SHALL 将所有字段的 `loading` 固定为 `false`、`data` 固定为 `null`（或 `initialData` 提供的占位）、`error` 固定为 `null`，并且**不发起任何 fetch**。
6. THE Canonical_Hook SHALL 不抛出异常到 React render path；所有字段 fetch 失败应以 `RightRailDataFieldStatus<T>.error` 返回，同时保留 `data = previousCache ?? initialData ?? null`。
7. THE Canonical_Hook SHALL 不订阅 `useAppStore` 或 `useProjectStore`；不调用任何全局 store setter；不写入 `localStorage` / `sessionStorage`。
8. THE RightRailDataFieldStatus<T>.retry SHALL 是一个稳定引用（通过 `useCallback` 或等价手段），仅在 `jobId` 变化时重建；调用 retry 时 SHALL 只触发该字段的 targeted refetch，不影响其他字段的 in-flight 请求。

### Requirement 2：9 + 6 个 fetch 的并发合并与错误隔离

**User Story:** 作为维护者，我需要一次性看到 hook 怎么把现有 9 个 fetch 调用合并到 Canonical_Hook 内部，以及新增 6 个下游字段如何按 Wave 分组发起，避免 N+1 重复发起。

#### Acceptance Criteria

1. THE Canonical_Hook SHALL 内部调用以下 9 个 `@/lib/blueprint-api` fetch 函数：`fetchLatestBlueprintGenerationJob`、`fetchBlueprintSpecsProgress`、`fetchBlueprintEffectPreviews`、`fetchBlueprintPromptPackages`、`fetchBlueprintCapabilities + fetchBlueprintJobCapabilities + fetchBlueprintCapabilityInvocations + fetchBlueprintCapabilityEvidence`（capabilities 组合 fetch）、`fetchBlueprintEngineeringLanding`、`fetchBlueprintEngineeringRuns`、`fetchBlueprintArtifactLedger`、`fetchBlueprintArtifactReplays`；以及本 spec 新增的 artifactFeedback 字段使用 `artifactReplays` 响应里已有的 `artifactFeedback` 切片（`BlueprintArtifactReplaysResponse.artifactFeedback`）或由 artifact ledger 响应内派生，**不新增**任何后端路由。
2. THE Canonical_Hook SHALL 通过 `Promise.all` 以 Wave 粒度并发发起 fetch；单个 fetch 失败 SHALL 不阻塞同 Wave 内其他字段 settle；使用 `Promise.allSettled` 或等价方式收敛结果。
3. WHEN 同一 `jobId` 在同一 render cycle 被多个消费者引用（例如 `AutopilotRoutePage` 与 `BlueprintProgressPanel` 同时挂载），THE Canonical_Hook SHALL 在单次渲染内**不重复发起同字段 fetch**；这通过 hook 内部 `useRef<Map<jobId, CacheEntry>>` 或 `useSyncExternalStore` 等手段实现，具体策略在 `design.md` 中给出。
4. IF fetch 结果的 `ok === false`，THEN THE Canonical_Hook SHALL 将该字段 `error = result.error`，保留 `data = previousCache ?? initialData ?? null`，`loading = false`；下一次 retry 或 `job.stage` 变化触发 refetch 时仍可恢复。
5. THE Canonical_Hook SHALL 不在成功路径上丢弃已有数据：同字段 refetch 成功后覆盖 `data`；refetch 进行中 `loading = true` 但 `data` 保持上一次成功值（不清空为 `null`），避免 UI 闪烁。
6. WHEN `fetchBlueprintCapabilities` / `fetchBlueprintJobCapabilities` / `fetchBlueprintCapabilityInvocations` / `fetchBlueprintCapabilityEvidence` 作为 Wave 2 的一组并发 fetch 被发起，THE Canonical_Hook SHALL 把这 4 个结果合并为 `capabilities`（registry + job 合并列表）、`capabilityInvocations`、`capabilityEvidence` 三个 `RightRailDataFieldStatus`；合并规则复用 `BlueprintProgressPanel.tsx` 现有的 registry + job 合并逻辑，不改变顺序、不去重。

### Requirement 3：按子阶段懒加载

**User Story:** 作为 `/specs` 首屏性能的维护者，我希望用户还未推进到 fabric 子阶段之前，不要把 prompt-package / engineering-landing / artifact 相关的深层 fetch 拉起。

#### Acceptance Criteria

1. WHILE `options.skipLazyLoad !== true`，THE Canonical_Hook SHALL 按下表决定每个下游字段是否在当前渲染周期发起 fetch；字段未命中懒加载阈值时 SHALL 保持 `loading = false`、`data = initialData ?? null`、`error = null`。

   | 字段                    | 懒加载触发阈值（最低 `currentSubStage`）           |
   | ----------------------- | -------------------------------------------------- |
   | `job / routeSet / selection / specTree` | 始终发起（Wave 1，不受懒加载影响） |
   | `agentCrew / capabilities / capabilityInvocations / capabilityEvidence` | `currentStage === "fabric"`（即 `currentSubStage` 存在），不论具体 sub-stage |
   | `effectPreviews`        | `currentSubStage ∈ { "effect_preview", "prompt_package", "runtime_capability", "engineering_handoff", "artifact_memory" }`，或 `job.stage ∈ { "preview", "effect_preview", "prompt_packaging", "runtime_capability", "engineering_handoff", "engineering_landing" }` |
   | `promptPackages`        | `currentSubStage ∈ { "prompt_package", "runtime_capability", "engineering_handoff", "artifact_memory" }`，或 `job.stage ∈ { "prompt_packaging", "runtime_capability", "engineering_handoff", "engineering_landing" }` |
   | `landingPlans / engineeringRuns` | `currentSubStage ∈ { "engineering_handoff", "artifact_memory" }`，或 `job.stage ∈ { "engineering_handoff", "engineering_landing" }` |
   | `artifactEntries / artifactReplays / artifactFeedback` | `currentSubStage === "artifact_memory"`，或 `job.stage === "engineering_landing"` |

2. IF `options.skipLazyLoad === true`，THEN THE Canonical_Hook SHALL 忽略 `currentSubStage` / `job.stage` 判断，直接发起 Wave 1-4 全部 fetch；用于 `/specs` 路径的 legacy `autoLoad={true}` 兼容场景。
3. THE Canonical_Hook SHALL 以 `options.currentSubStage` 作为懒加载判断的首要输入；若未提供，SHALL 使用 hook 内部计算的 `resolveRailSubStage({ currentStage: "fabric" /* 或无 fabric 时的 undefined */, job, selection, specTree, agentCrew })` 兜底。
4. WHEN 用户从一个较浅的子阶段切换到更深的子阶段（如 `effect_preview → prompt_package`），THE Canonical_Hook SHALL 对新解锁的字段（此例为 `promptPackages`）发起 fetch；**不重拉**已经缓存的字段。
5. IF 某字段曾因懒加载门限未满足而未发起过 fetch，且未通过 `initialData` 提供，THEN THE Canonical_Hook SHALL 在首次触发懒加载解锁时以 `loading = true` 进入 fetch 状态，而非保持 `loading = false`。

### Requirement 4：Cache 与 jobId / stage 变化的 refetch 策略

**User Story:** 作为右栏切换多个 job 的用户，我希望切到新 jobId 时旧 job 的数据立即失效，切回旧 jobId 时若 cache 仍在 TTL 内能秒级回显。

#### Acceptance Criteria

1. THE Canonical_Hook SHALL 以 `jobId` 为主键维护 per-field cache；cache 存储结构、TTL 策略与实现形式（`useRef<Map>` vs `useReducer`）由 `design.md` 决策。
2. WHEN `jobId` 发生变化（从 `A` 变为 `B`），THE Canonical_Hook SHALL 立即 invalidate `RightRailDataView` 中**所有字段**的 `data`（重置为 `initialData?.[field] ?? null`）、`error`（重置为 `null`）、并把当前所有 in-flight `fetch*` 请求通过 `AbortController` 取消（即 Ignore_Stale_Policy 的一部分）。
3. WHEN `jobId` 从 `A` 变为 `B` 再变回 `A`，THE Canonical_Hook MAY 复用 `A` 的 cache；复用与否由 `design.md` 策略决定（推荐在本 spec Phase A 采取「切回即重拉 Wave 1 确认 job 指针，其余字段保持 cache」策略），但必须在 `design.md` 显式声明且对应 PBT P2 覆盖该决策。
4. WHEN `job.stage` 发生变化（如 `spec_tree → spec_docs → prompt_packaging`），THE Canonical_Hook SHALL 对该新 stage 对应的下游字段（按 Requirement 3.1 懒加载表映射）触发 targeted refetch；不得触发全量 refetch。
5. IF 快速连续 N 次 (`N ≥ 2`) `job.stage` 推进（例如在一次 SSE 流里收到 3 个 stage 转换事件），THEN THE Canonical_Hook SHALL 保证最后一次 stage 对应的下游字段 refetch 结果 win（Ignore_Stale_Policy）：更早的 in-flight 请求在 resolve 时其结果被 ignore。
6. THE Canonical_Hook SHALL 在 `jobId` 变化或组件 unmount 时调用 `AbortController.abort()` 取消所有 in-flight 请求，避免已 unmount 组件上触发 `setState`。

### Requirement 5：Socket / SSE 订阅与 polling 退避

**User Story:** 作为 autopilot 阶段推进用户，我希望后端 stage 推进事件能立即反映到右栏下游数据，而不是必须刷新页面。

#### Acceptance Criteria

1. THE Canonical_Hook SHALL 通过 `fetchBlueprintJobEventStreamUrl(jobId)` 获取 SSE URL，并在 `jobId` 非空且 `options.pollingIntervalMs` 未显式提供时默认**订阅** `EventSource`；订阅生命周期与 `jobId` 绑定，`jobId` 变化时 close 旧订阅、打开新订阅。
2. WHEN SSE 事件包含 `stage` 字段或 `job` 对象的 `stage` 字段变化，THE Canonical_Hook SHALL 调用 `options.onJobStageChange?.(nextStage, prevStage)` 并按 Requirement 4.4 执行 targeted refetch。
3. IF SSE 连接失败（`EventSource` `onerror` 触发且 `readyState === CLOSED`）或浏览器不支持 `EventSource`，THEN THE Canonical_Hook SHALL 降级为 polling：以 `options.pollingIntervalMs ?? 15000` 毫秒间隔重新执行 Wave 1（`fetchLatestBlueprintGenerationJob`）；polling 退避策略：连续 3 次失败后把 interval 指数放大到 `base * 2^attempt`，上限 `120_000ms`。
4. IF `options.pollingIntervalMs === 0` 或 `options.pollingIntervalMs` 为负数，THEN THE Canonical_Hook SHALL 禁用 SSE 与 polling（用于测试场景或明确需要手动触发 refetch 的场景）。
5. THE Canonical_Hook SHALL 不在 SSE / polling 路径上写入任何全局 store；只通过内部 state 管道更新 `RightRailDataView`。
6. WHEN 组件 unmount，THE Canonical_Hook SHALL 关闭 SSE `EventSource`、清除 polling timer、取消所有 in-flight fetch。

### Requirement 6：双调用点兼容性（/autopilot 与 /specs）

**User Story:** 作为 `AutopilotRoutePage` 与 `BlueprintProgressPanel` 的共同维护者，我需要 hook 在两个调用点都能无缝接入，不破坏 `autoLoad={true}` 语义，也不要求重写 Spec 2 面板签名。

#### Acceptance Criteria

1. THE AutopilotRoutePage_Consumer SHALL 在 `fabric` 阶段调用 `useAutopilotRightRailData(latestJob?.id ?? "", { initialData: { job: latestJob, routeSet, selection, specTree, agentCrew: autopilotAgentCrew, capabilities: autopilotCapabilities, capabilityInvocations: autopilotCapabilityInvocations, capabilityEvidence: autopilotCapabilityEvidence, effectPreviews: autopilotEffectPreviews }, currentSubStage })`，并用返回值装配 `<AutopilotRightRail>` 的 9 个 props（继续遵守 Spec 1 `AutopilotRightRailProps`）。
2. THE BlueprintProgressPanel_Consumer SHALL 在 Phase A 模式下调用 `useAutopilotRightRailData(effectiveJobId, { initialData: pickInitials(props), skipLazyLoad: props.autoLoad === true })`；hook 返回值驱动内部所有 canonical 面板的数据来源，移除各自面板内的 `useEffect(() => fetchBlueprint*(jobId), [jobId])` bootstrap。
3. WHEN `BlueprintProgressPanel.autoLoad === true`（即 `/specs` 深链路径或 legacy 消费者），THE Canonical_Hook SHALL 按 Requirement 3.2 跳过懒加载门限，拉齐 Wave 1-4。
4. WHEN `BlueprintProgressPanel.autoLoad === false`（即历史用法或未来仅作为组合容器），THE Canonical_Hook SHALL 按 Requirement 3.1 遵守懒加载表。
5. THE BlueprintProgressPanel_Consumer SHALL 保留当前对外暴露的 `initial*` / `on*Change` props（`initialJob`、`initialRouteSet`、`initialSelection`、`initialSpecTree`、`initialEffectPreviews`、`initialCapabilities`、`initialAgentCrew`、`initialClarificationSession`、`initialCapabilityInvocations`、`initialCapabilityEvidence`、`onSpecTreeChange`、`onSpecTreeVersionsChange`、`onLandingPlansChange`、`onEngineeringRunsChange`、`onPreviewsChange`、`onPackagesChange`、`onCapabilitiesChange`、`onAgentCrewChange`、`onInvocationsChange`、`onEvidenceChange` 等）；hook 接入后 `initial*` 映射为 `options.initialData`，`on*Change` 回调在对应字段 fetch 成功时被调用（Phase A 向后兼容）。
6. THE AutopilotRoutePage_Consumer SHALL 仅在 `fabric` 阶段调用 hook；`input / clarification / routeset / selection` 阶段继续由当前 `AutopilotRoutePage` 内部 `useState` 持有 `intake / clarificationSession / readiness / answerDrafts / routeSet / selection / latestJob` 等状态，不接入 hook。
7. THE `/specs` 页面（`SpecCenterPage` → `BlueprintProgressPanel`）在 hook 接入后 SHALL 通过 Spec 2 canonical 面板继续渲染 SpecTree / SpecDocuments / EffectPreview / PromptPackage / RuntimeCapability / EngineeringHandoff / ArtifactMemory 等工作台；`data-testid="blueprint-progress-panel"` 不变、文案不变、面板 DOM 结构与 Spec 2 Rendering_Parity 断言保持相等。

### Requirement 7：回调回写与降级路径

**User Story:** 作为 Spec 2 canonical 面板的维护者，我希望面板仍可继续消费 `initial*` / `on*Change` 私有字段，不必因为 hook 接入而改写面板签名。

#### Acceptance Criteria

1. THE Canonical_Hook SHALL 暴露 per-field `onXXXChange` 可选回调（例如 `onPromptPackagesChange` / `onLandingPlansChange` / `onEffectPreviewsChange` / `onArtifactFeedbackChange`），通过 `UseAutopilotRightRailDataOptions` 传入；每当对应字段 fetch 成功时 SHALL 调用该回调把最新值同步给消费者。
2. IF 消费者未传 `onXXXChange`，THEN THE Canonical_Hook SHALL 不抛错、不尝试读写任何外部 state；hook 内部的 cache 继续作为唯一真相源。
3. THE Canonical_Hook SHALL 不强制消费者持有 `useState<BlueprintPromptPackage[]>` 等字段级本地 state；`BlueprintProgressPanel` 在 Phase A 模式下 MAY 保留本地 state 作为向 Spec 2 canonical 面板传递 `initial*` / `on*Change` 的桥接层，但**不得**与 hook cache 形成双写循环。
4. WHEN 面板内部（如 `EffectPreviewPanel`）通过 `onPreviewsChange` 回调主动上报新值（例如用户刚生成了新 effect preview），THE `BlueprintProgressPanel_Consumer` SHALL 把该值写回到 hook 的 optional write-back 接口（`view.effectPreviews.setLocal(previews)`）或直接通过 `options.onEffectPreviewsChange` 旁路更新；具体在 `design.md` 中决策，但必须避免双写回到 fetch 层导致额外 network round-trip。
5. THE Canonical_Hook SHALL 允许 consumer 在不提供 `onXXXChange` 时正常运作；此时面板通过 `initial*` + hook-driven `data` 读取，但写回只影响内部 cache（不触发 fetch 重放）。

### Requirement 8：错误处理、重试与 stale 保护

**User Story:** 作为需要排错的工程师，我希望单字段 fetch 失败时 UI 不崩、能保留上一次的 data、能点击 retry 重新拉取，同时快速连续 retry 不会触发一串并发请求。

#### Acceptance Criteria

1. WHEN 任一字段 fetch 失败，THE Canonical_Hook SHALL 返回 `{ data: previousCache ?? initialData ?? null, loading: false, error: ApiRequestError, retry: stableRetryFn }`，并调用 `options.onFieldError?.(field, error)`。
2. WHEN `retry()` 被调用，THE Canonical_Hook SHALL 重新发起该字段 fetch（受 Requirement 3 懒加载规则约束：若当前 `currentSubStage` / `job.stage` 不满足该字段懒加载条件，retry SHALL 是 no-op 并保持 `error` 不变）。
3. IF 同一字段在 500ms 内被 retry 两次，THEN THE Canonical_Hook SHALL 只发起 1 次 fetch，后续 retry 调用在前一次请求 in-flight 期间为 no-op；可以通过「in-flight guard」或 debounce 实现。
4. THE Canonical_Hook SHALL 不在 fetch 失败时把 `data` 清空为 `null`；`data` 始终指向上一次成功值或 `initialData`，避免 UI 在错误态丢失上下文。
5. IF `jobId` 在 retry in-flight 期间变化，THEN THE Canonical_Hook SHALL 通过 `AbortController` 取消该 retry；旧 retry 的 resolve/error 被 ignore（Ignore_Stale_Policy）。
6. THE Canonical_Hook SHALL 不在 React render 阶段抛异常；所有异常应在 async 流中被 catch 并转为 `ApiRequestError` 对象存入 field status。

### Requirement 9：Shim 文件与 barrel 导出

**User Story:** 作为既有调用方（`BlueprintProgressPanel` import `../hooks/use-blueprint-progress-data`），我需要历史 import 路径继续可用；但 Canonical_Hook 的权威位置应该是 `autopilot/right-rail/hooks/`。

#### Acceptance Criteria

1. THE Shim_Hook_File（`client/src/pages/specs/hooks/use-blueprint-progress-data.ts`）SHALL 从占位字符串常量 `USE_BLUEPRINT_PROGRESS_DATA_PLACEHOLDER` 改写为单行 re-export：`export { useAutopilotRightRailData as useBlueprintProgressData } from "@/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data";` 以及对应的类型 re-export。
2. THE Shim_Hook_File SHALL 不新增任何 adapter / wrapper 逻辑；若需要命名不一致，通过 `as` 关键字重命名即可。
3. THE `client/src/pages/autopilot/right-rail/index.ts` barrel SHALL 增加 `export { useAutopilotRightRailData } from "./hooks/use-autopilot-right-rail-data";` 与类型 re-export。
4. IF 未来 Phase_B_Cleanup 要删除 `specs/hooks/use-blueprint-progress-data.ts`，THEN 本 spec 产生的 shim 文件 SHALL 保证删除动作为「纯删除」，不需要额外迁移调用方。
5. THE Canonical_Hook 实现文件 SHALL 不依赖 `@/pages/specs/BlueprintProgressPanel`；`autopilot/right-rail/hooks → pages/specs` 必须是单向禁止方向。

### Requirement 10：PBT 与 edge-case 测试要求

**User Story:** 作为回归保障者，我需要 hook 的三个核心性质（dedupe / jobId invalidate / stage race safety）被 fast-check PBT 覆盖，避免未来改动悄悄引入 bug。

#### Acceptance Criteria

1. THE Canonical_Hook_Tests SHALL 提供一条 fast-check PBT **P1 — Idempotent fetch dedupe**：生成任意合法 `jobId` 与 consumer 数量 `N ∈ [2, 5]`，在同一 render cycle 内用 `renderHook` 或等价手段挂载 N 个 `useAutopilotRightRailData(jobId)` 消费者，mock `@/lib/blueprint-api` 的 fetch 函数并计数；断言：对同一 `jobId` 每个字段的 fetch counter 最终值 `=== 1`（不允许 N+1 重复发起）。
2. THE Canonical_Hook_Tests SHALL 提供一条 fast-check PBT **P2 — Cache coherence on jobId change**：生成任意 `jobId` 序列 `seq: string[]`（长度 4-8，元素取自字母表 `{ "a", "b", "c", "d" }`），依次把 hook 的 `jobId` 切换到序列中每个值；断言：a) 每次 `jobId` 变化后同步读取 `view.job.data` 不能是上一个 `jobId` 的数据（不泄漏）；b) 切回一个历史 `jobId` 时，按 `design.md` 显式声明的 cache 复用策略（「Wave 1 重拉 + 其余 cache 复用」或「全量重拉」，二选一并在测试中断言对应行为）。
3. THE Canonical_Hook_Tests SHALL 提供一条 fast-check PBT **P3 — Race safety on rapid job.stage updates**：生成任意 `stageSeq: BlueprintGenerationJob["stage"][]`（长度 2-5，元素取自 `spec_tree / spec_docs / prompt_packaging / runtime_capability / engineering_handoff / engineering_landing`），mock SSE 流在极短时间内连续推送这些 stage；给 fetch mock 引入随机 resolve 顺序；断言：最终 `view.promptPackages.data` / `view.landingPlans.data` / `view.artifactEntries.data` 对应的值来自序列中**最后一个**满足该字段懒加载阈值的 stage 对应的 mock response（不允许被更早的 in-flight 请求覆盖）。
4. THE Canonical_Hook_Tests SHALL 提供 unit 测试覆盖：per-field retry 成功 / 失败路径、`jobId === ""` 时零 fetch、`options.skipLazyLoad === true` 时 Wave 全量发起、`options.pollingIntervalMs === 0` 时禁用 SSE/polling、fetch 失败时 `data` 保留 previousCache、unmount 时 AbortController.abort 被调用。
5. THE PBT Tests SHALL 控制 `fc.assert` 的 `numRuns` 在 50-100 范围；所有 PBT 失败时 fast-check 的 shrink 规则应能输出最小化计数示例（例如最短 jobId 序列、最少 stage 转换数）。
6. THE Tests SHALL 不依赖真实网络、不依赖真实 SSE；通过 mock `@/lib/blueprint-api` 所有 fetch 函数与 `fetchBlueprintJobEventStreamUrl`、通过 `vi.stubGlobal("EventSource", MockEventSource)` 或等价手段隔离副作用。
7. THE PBT Tests SHALL 在 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.property.test.ts` 新增文件；unit 测试在 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.test.ts`。

### Requirement 11：端到端回归与 parity

**User Story:** 作为 release 把关者，我需要 hook 接入后 `/autopilot` 与 `/specs` 的现有测试、Spec 2 parity 测试、Spec 3 fold removal / selection→fabric 测试都继续通过。

#### Acceptance Criteria

1. WHEN 本 spec 合入后，THE `npm exec vitest run client/src/pages/specs` SHALL 全部通过，包括 Spec 2 的 `props-narrowing.property.test.ts` / `shim-identity.test.ts` / `rendering-parity.test.tsx`。
2. WHEN 本 spec 合入后，THE `npm exec vitest run client/src/pages/autopilot` SHALL 全部通过，包括 Spec 3 的 `fabric-dispatch.property.test.tsx` / fold removal snapshot / selection → fabric no-navigation 断言。
3. THE `node --run check` SHALL 通过，不扩大现有 TypeScript 基线错误数；本 spec 新增文件与修改文件不引入新的类型错误。
4. THE BlueprintProgressPanel_Consumer SHALL 在 hook 接入后渲染出的 DOM `data-testid` 集合、文案、className 与 hook 接入前 `AutopilotRoutePage.test.tsx` / `BlueprintProgressPanel.test.tsx` 的快照断言保持一致。
5. THE AutopilotRoutePage_Consumer SHALL 在 `fabric` 阶段仍然通过 `<AutopilotRightRail>` 渲染 Spec 2 canonical 面板，DOM 结构与 Spec 3 完成后的状态保持一致。
6. IF 本 spec 合入后发现 `/specs` 页面或 `/autopilot` fabric 阶段出现 DOM drift，THEN 应通过调整 `BlueprintProgressPanel.tsx` 的组合逻辑或 `AutopilotRoutePage.tsx` 的 hook 调用参数，而非修改 Spec 2 canonical 面板或 Spec 1 `<AutopilotRightRail>` scaffolding。

### Requirement 12：非目标与回滚

**User Story:** 作为 release 管理者，我需要本 spec 清楚列出不做的事，以及改动的文件集合，便于回滚。

#### Acceptance Criteria

1. THE Canonical_Hook SHALL 不做乐观更新（optimistic UI）；所有 `data` 更新都来自 fetch 成功响应或 consumer 显式的 `onXXXChange` 写回。
2. THE Canonical_Hook SHALL 不做 offline 支持；离线场景下 hook 行为等同 fetch 失败（error 填充，data 保持 previousCache）。
3. THE Canonical_Hook SHALL 不做跨 `jobId` 的 request deduplication；不同 `jobId` 的并发 fetch 互不合并。
4. THE Canonical_Hook SHALL 不支持 SSR；hook 依赖 `EventSource` / `AbortController` / `window.setTimeout` 等浏览器 API。
5. THE Refactor SHALL 不修改 `shared/blueprint/contracts.ts`、`server/routes/blueprint.ts`、任何后端路由或 DTO。
6. THE Refactor SHALL 不删除 Spec 2 canonical 面板签名中的 `initial*` / `on*Change` 私有字段；这些字段将在 Phase_B_Cleanup 中移除，不在本 spec 范围。
7. THE Refactor 的文件改动 SHALL 限定在以下范围：
   - 新增 `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts`
   - 新增 `client/src/pages/autopilot/right-rail/hooks/index.ts`（barrel，可选）
   - 新增 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.test.ts`
   - 新增 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.property.test.ts`
   - 修改 `client/src/pages/autopilot/right-rail/index.ts`（新增 re-export）
   - 修改 `client/src/pages/specs/hooks/use-blueprint-progress-data.ts`（占位 → re-export shim）
   - 修改 `client/src/pages/autopilot/AutopilotRoutePage.tsx`（hook 接入 fabric 阶段）
   - 修改 `client/src/pages/specs/BlueprintProgressPanel.tsx`（Phase A 接入）
   - 按需修改相关测试文件以配合新数据来源
8. IF 需要回滚本 spec，THEN `git revert` 上述文件集合 SHALL 能恢复到 Spec 3 完成后的状态；Spec 1/2/3 的产物不受影响。
9. THE Refactor SHALL 不引入 feature flag 或运行时开关；hook 接入是一次性合入。
