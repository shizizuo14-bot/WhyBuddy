# 设计文档：Autopilot 底部高级资产工作台折叠区删除 + 右栏内联承接

## 设计概述

本 spec 是 `autopilot-cockpit-right-rail-convergence`（Spec 1）与 `autopilot-right-rail-stage-panels`（Spec 2）的**用户可见收口**。

Spec 1 冻结了右栏契约与 `<AutopilotRightRail>` scaffolding；Spec 2 把 `BlueprintProgressPanel` 内部 8 个 fabric 子阶段面板物理抽离为 `client/src/pages/autopilot/right-rail/panels/` 下的 canonical 面板，并在 `<AutopilotRightRail>` 的 fabric switch 中消费。此时用户在 `/autopilot` 上还看不到任何变化：5 阶段时间线仍由 `<AutopilotWorkflowRail>` 承接 4 个非-fabric stage 与 fabric 阶段的旧 `AutopilotSpecTreeHandoffPanel + AgentCrewSummary`，完整下游工作台依旧隐藏在底部 `<details data-testid="autopilot-advanced-workbenches">` 折叠区里。

Spec 3 做三件事，**仅**三件事：

1. **删除底部 Advanced_Workbenches_Fold**（`<details>` + `<summary>` + 其内嵌的 `<BlueprintProgressPanel>`）。
2. **把 `<AutopilotRightRail>` 连到现有 400px 右列的 fabric 分支**，由 Spec 1 的 `resolveRailSubStage()` 派发到 Spec 2 的 8 个 canonical 面板。
3. **把 `AutopilotSpecTreeHandoffPanel` 内 `SPECS_PATH` 主 CTA 降级为次级文本链接**，保留 `/specs` 深链可达。

本 spec 的硬约束：

- 零后端契约变更、零 DTO 变更、零 Socket 变更。
- 不修改 `BlueprintProgressPanel.tsx`、`SpecCenterPage.tsx` 与 `client/src/pages/autopilot/right-rail/panels/*`。
- 不新增 / 不删除任何现有 `data-testid`（除明确列出的 `autopilot-advanced-workbenches` 与 Advanced_Workbenches_Fold 注入的 `blueprint-progress-panel`）。
- 不引入 URL 参数、sticky pin、自动滚动、快捷键（Spec 5）。
- 不抽 hook、不合并 fetch（Spec 4）。
- 不触碰 4 个非-fabric stage 的面板内容（仍由 `<AutopilotWorkflowRail>` 原样渲染）。

---

## 现状对照

### Before（Spec 3 实施前，即 Spec 2 完成后的状态）

```
/autopilot (AutopilotRoutePage)
├── <header>                                       // topbar
└── <div className="grid gap-4 px-0 py-4">
    ├── <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
    │   ├── <AutopilotVisualStage />               // 3D + Scene HUD + Runtime Console
    │   └── <AutopilotWorkflowRail flowSteps={flowSteps} currentStage={...}>
    │         switch(currentStage) {
    │           case "input":         // intake + GitHub + project context
    │           case "clarification":  // Q&A
    │           case "routeset":       // RouteSet 候选
    │           case "selection":      // 主路线 + 备选 + selectBlueprintRoute CTA
    │           case "fabric":
    │             <AutopilotSpecTreeHandoffPanel ... />  ← ★ 本 spec 要改
    │             <AgentCrewSummary ... />               ← ★ 本 spec 要移除/替换
    │         }
    │       </AutopilotWorkflowRail>
    ├── <details data-testid="autopilot-advanced-workbenches">  ← ★ 物理删除
    │   <summary>高级资产工作台 / Advanced asset workbenches</summary>
    │   <div>
    │     <BlueprintProgressPanel                          ← ★ 物理删除此挂载
    │       key={blueprintPanelKey}
    │       initialJob={latestJob}
    │       initialRouteSet={routeSet}
    │       initialSelection={selection}
    │       initialSpecTree={specTree}
    │       initialEffectPreviews={autopilotEffectPreviews}
    │       initialCapabilities={autopilotCapabilities}
    │       initialAgentCrew={autopilotAgentCrew}
    │       initialClarificationSession={clarificationSession}
    │       initialCapabilityInvocations={autopilotCapabilityInvocations}
    │       initialCapabilityEvidence={autopilotCapabilityEvidence}
    │       autoLoad={false}
    │       showRouteGeneration={false}
    │       showSpecProgress={false}
    │       showSpecTreePreview
    │       showSpecDocumentWorkbench
    │       showEffectPreviewWorkbench
    │       showPromptPackageWorkbench
    │       showRuntimeCapabilityBridgeWorkbench
    │       showEngineeringLandingWorkbench={false}
    │       showArtifactMemoryWorkbench
    │     />
    │   </div>
    └── </details>
```

同时注意：

- `AutopilotSpecTreeHandoffPanel` 当前在 fabric 分支以 `<Button asChild className="bg-slate-950 ... text-white">` 包裹 `<a href={SPECS_PATH} data-testid="autopilot-open-specs-link">进入推导工作台 / Open deduction workbench</a>` 作为主 CTA。
- `AutopilotRoutePage.tsx` 顶部存在 `import BlueprintProgressPanel from "../specs/BlueprintProgressPanel"`。
- `AutopilotRoutePage.test.tsx` 中包含以下断言（Spec 3 将全部删除或修改）：
  - `expect(markup).toContain('data-testid="autopilot-advanced-workbenches"')`
  - `expect(markup).toContain('data-testid="blueprint-progress-panel"')`
  - `expect(markup).toContain("Advanced asset workbenches")`
  - 中文 `"高级资产工作台"`、英文 `"Expand for SPEC, previews, prompts, capability bridge, and replay"` 等文案断言
  - `AutopilotSpecTreeHandoffPanel` 的 `'href="/specs"'` 与 `"Open deduction workbench"` 文案断言（保留 `href="/specs"`，降级 CTA 文案）

### After（Spec 3 实施后）

```
/autopilot (AutopilotRoutePage)
├── <header>                                       // topbar（不变）
└── <div className="grid gap-4 px-0 py-4">
    └── <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        ├── <AutopilotVisualStage />               // 不变
        └── {currentStage === "fabric"
              ? <AutopilotRightRail
                  jobId={latestJob?.id ?? ""}
                  currentStage="fabric"
                  currentSubStage={resolveRailSubStage({
                    currentStage: "fabric",
                    job: latestJob,
                    selection,
                    specTree,
                    agentCrew: autopilotAgentCrew,
                  })}
                  job={latestJob}
                  routeSet={routeSet}
                  selection={selection}
                  specTree={specTree}
                  agentCrew={autopilotAgentCrew}
                  capabilities={autopilotCapabilities}
                  capabilityInvocations={autopilotCapabilityInvocations}
                  capabilityEvidence={autopilotCapabilityEvidence}
                  effectPreviews={autopilotEffectPreviews}
                  locale={locale}
                  onSubStageChange={noop}
                />
              : <AutopilotWorkflowRail ... />      // 4 非-fabric stage 不变
            }
```

底部 `<details>` 块整体消失；不再保留注释占位或 hidden sibling。

---

## 两种接线路径对比与决策

Spec 3 需要在 `currentStage === "fabric"` 时让 `<AutopilotRightRail>` 接管 Right_Column，有两条可行路径。

### 路径 A：在 `AutopilotWorkflowRail` 内部 fabric 分支委派到 `<AutopilotRightRail>`

```tsx
// AutopilotWorkflowRail.tsx (伪代码)
case "fabric":
  return (
    <AutopilotRightRail
      jobId={latestJob?.id ?? ""}
      currentStage="fabric"
      currentSubStage={resolveRailSubStage({ currentStage: "fabric", job: latestJob, selection, specTree, agentCrew: autopilotAgentCrew })}
      job={latestJob}
      routeSet={routeSet}
      selection={selection}
      specTree={specTree}
      agentCrew={autopilotAgentCrew}
      capabilities={autopilotCapabilities}
      capabilityInvocations={autopilotCapabilityInvocations}
      capabilityEvidence={autopilotCapabilityEvidence}
      effectPreviews={autopilotEffectPreviews}
      locale={locale}
      onSubStageChange={noop}
    />
  );
```

- 优点：`AutopilotRoutePage` 的外层 grid 结构完全不动；`AutopilotWorkflowRail` 继续是 Right_Column 的唯一容器。
- 代价：需要把 `AutopilotRoutePage` 当前持有的 `latestJob / selection / specTree / autopilotAgentCrew / autopilotCapabilities / autopilotCapabilityInvocations / autopilotCapabilityEvidence / autopilotEffectPreviews / locale` 作为新 props 传入 `AutopilotWorkflowRail`；当前签名已经传了 `agentCrew / capabilities / capabilityInvocations / capabilityEvidence / effectPreviews / specTree / selection / latestJob / locale`，因此**不需要新增 props**，只是让 fabric 分支消费它们时委派到 `<AutopilotRightRail>`。

### 路径 B：在 `AutopilotRoutePage` 层做三元分流

```tsx
{currentStage === "fabric"
  ? <AutopilotRightRail {...rightRailProps} />
  : <AutopilotWorkflowRail {...workflowRailProps} />}
```

- 优点：`AutopilotWorkflowRail` 的 fabric 分支代码可以直接删除或置空；分流逻辑暴露在主页面中，可读性更高。
- 代价：`AutopilotRoutePage` 需要计算 `currentStage`，目前 `currentStage` 是 `AutopilotWorkflowRail` 内部推导（基于 `flowSteps[].status` 与 `latestJob.stage`），需要把推导规则上提或在 `AutopilotRoutePage` 中复算一次。这会引入**两条**互相独立的 `currentStage` 推导路径，容易出现漂移。

### 决策：采用路径 A

选择路径 A 的原因：

1. `currentStage` 的权威来源是 `AutopilotWorkflowRail` 内部（`activeStep.id`），上提会复制规则；路径 A 让 `AutopilotWorkflowRail` 继续持有 stage 判断权。
2. `AutopilotWorkflowRail` 当前已经接收了 `<AutopilotRightRail>` 所需的全部 props（`latestJob / routeSet / selection / specTree / agentCrew / capabilities / capabilityInvocations / capabilityEvidence / effectPreviews / locale`），零新增 props。
3. 回滚成本低：回退只需把 `case "fabric"` 恢复为 `<AutopilotSpecTreeHandoffPanel> + <AgentCrewSummary>`。
4. 与 Spec 4 兼容：未来 `useAutopilotRightRailData` 上提后，`<AutopilotRightRail>` 的 props 改为由 hook 提供，接线点依然在 `AutopilotWorkflowRail` 的 fabric 分支内部，改动局部。

因此 Spec 3 的接线点**限定在** `AutopilotWorkflowRail.case "fabric"` 与 `AutopilotRoutePage.tsx` 底部 `<details>` 块两处。

---

## AutopilotRoutePage.tsx 变更 Delta

### 删除：底部 `<details>` 折叠区

定位：`AutopilotRoutePage.tsx` 内 `<main>` 的 `<div className="grid w-full gap-4 px-0 py-4">` 容器下、紧跟 `xl:grid-cols-[minmax(0,1fr)_400px]` 外层 grid 之后的整个 `<details>` 节点（现状约 2564–2614 行）。

删除内容：

```tsx
<details
  className="rounded-[14px] border border-slate-200 bg-white"
  data-testid="autopilot-advanced-workbenches"
>
  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-900">
    <span className="flex items-center gap-2">
      <Layers3 className="size-4 text-slate-500" aria-hidden="true" />
      {t(locale, "高级资产工作台", "Advanced asset workbenches")}
    </span>
    <span className="text-xs font-semibold text-slate-500">
      {t(
        locale,
        "展开查看 SPEC、预演、提示词、能力桥和回放",
        "Expand for SPEC, previews, prompts, capability bridge, and replay"
      )}
    </span>
  </summary>
  <div className="border-t border-slate-200 p-4">
    <BlueprintProgressPanel
      key={blueprintPanelKey}
      className="relative z-10"
      projectId={currentProjectId}
      initialJob={latestJob}
      initialRouteSet={routeSet}
      initialSelection={selection}
      initialSpecTree={specTree}
      initialEffectPreviews={autopilotEffectPreviews}
      initialCapabilities={autopilotCapabilities}
      initialAgentCrew={autopilotAgentCrew}
      initialClarificationSession={clarificationSession}
      initialCapabilityInvocations={autopilotCapabilityInvocations}
      initialCapabilityEvidence={autopilotCapabilityEvidence}
      autoLoad={false}
      showRouteGeneration={false}
      showSpecProgress={false}
      showSpecTreePreview
      showSpecDocumentWorkbench
      showEffectPreviewWorkbench
      showPromptPackageWorkbench
      showRuntimeCapabilityBridgeWorkbench
      showEngineeringLandingWorkbench={false}
      showArtifactMemoryWorkbench
    />
  </div>
</details>
```

连带删除：

- 顶部 `import BlueprintProgressPanel from "../specs/BlueprintProgressPanel";`（若删除后无其他引用）。
- `const blueprintPanelKey = \`${latestJob?.id ?? "autopilot-blueprint-progress"}:${selection?.id ?? "route-unselected"}:${specTree?.id ?? "spec-tree-pending"}\`;`（仅被 Advanced_Workbenches_Fold 使用，删除后无其他引用）。
- `Layers3` 图标 import（若仅用于 `<summary>`）——**先 grep 确认**是否被其他段落引用（例如底部演示按钮），不被引用时一并删除。

### 修改：`AutopilotWorkflowRail.case "fabric"`

定位：`AutopilotRoutePage.tsx` 内 `AutopilotWorkflowRail` 组件内部的 `case "fabric":` 分支（现状约 1627–1659 行）。

**替换**：

```tsx
case "fabric":
  return (
    <div className="grid gap-3" data-testid="autopilot-fabric-step">
      {selection ? (
        <AutopilotSpecTreeHandoffPanel
          locale={locale}
          job={latestJob}
          selection={selection}
          specTree={specTree}
          embedded
        />
      ) : (
        <div className="rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-semibold leading-5 text-slate-500">
          {t(locale, "先完成路线选择，AgentCrewFabric 才会展开。", "Complete route selection before AgentCrewFabric expands.")}
        </div>
      )}
      <AgentCrewSummary
        locale={locale}
        agentCrew={agentCrew}
        capabilities={capabilities}
        capabilityInvocations={capabilityInvocations}
        capabilityEvidence={capabilityEvidence}
        effectPreviews={effectPreviews}
      />
    </div>
  );
```

**替换为**：

```tsx
case "fabric":
  return (
    <div className="grid gap-3" data-testid="autopilot-fabric-step">
      {selection ? (
        // 保留 handoff 面板作为顶部说明区 + 次级 /specs 链接承载
        <AutopilotSpecTreeHandoffPanel
          locale={locale}
          job={latestJob}
          selection={selection}
          specTree={specTree}
          embedded
        />
      ) : (
        <div className="rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-semibold leading-5 text-slate-500">
          {t(locale, "先完成路线选择，AgentCrewFabric 才会展开。", "Complete route selection before AgentCrewFabric expands.")}
        </div>
      )}
      <AutopilotRightRail
        jobId={latestJob?.id ?? ""}
        currentStage="fabric"
        currentSubStage={resolveRailSubStage({
          currentStage: "fabric",
          job: latestJob,
          selection,
          specTree,
          agentCrew,
        })}
        job={latestJob}
        routeSet={routeSet}
        selection={selection}
        specTree={specTree}
        agentCrew={agentCrew}
        capabilities={capabilities}
        capabilityInvocations={capabilityInvocations}
        capabilityEvidence={capabilityEvidence}
        effectPreviews={effectPreviews}
        locale={locale}
        onSubStageChange={() => {}}
      />
    </div>
  );
```

说明：

- **`AgentCrewSummary` 被移除**：其 `agent_crew_fabric` 语义已由 Spec 2 的 `<AgentCrewFabricPanel>`（`<AutopilotRightRail>` 在 `currentSubStage === "agent_crew_fabric"` 时派发）完整承接。移除 `AgentCrewSummary` 调用不删除 `AgentCrewSummary` 组件本身（它可能被其他地方引用；删除前 grep 确认，如无其他引用则一并删除）。
- **保留 `AutopilotSpecTreeHandoffPanel`**：它继续承载「当前路线 + SPEC 节点数 + 次级 `/specs` 链接」摘要，是 Requirement 3 次级链接的落点。只在 `job.stage === "spec_tree"` 时渲染；其他 fabric 子阶段（`effect_preview / prompt_package / runtime_capability / engineering_handoff / artifact_memory`）自动隐藏（`return null`），与现状一致。
- **新增 imports**：
  ```tsx
  import { AutopilotRightRail } from "./right-rail";
  import { resolveRailSubStage } from "./right-rail";
  ```
  或合并为 `import { AutopilotRightRail, resolveRailSubStage } from "./right-rail";`。

### 修改：`AutopilotSpecTreeHandoffPanel` 主 CTA 降级

定位：`AutopilotRoutePage.tsx` 内 `export function AutopilotSpecTreeHandoffPanel` 函数体中的 `<Button asChild ...>` 段落（现状约 2084–2094 行）。

**替换**：

```tsx
<Button
  asChild
  className="gap-2 rounded-[8px] bg-slate-950 px-4 font-black text-white hover:bg-slate-800"
>
  <a href={SPECS_PATH} data-testid="autopilot-open-specs-link">
    {t(locale, "进入推导工作台", "Open deduction workbench")}
    <ArrowRight className="size-4" aria-hidden="true" />
  </a>
</Button>
```

**替换为**：

```tsx
<a
  href={SPECS_PATH}
  data-testid="autopilot-open-specs-link"
  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 underline decoration-slate-300 decoration-dotted underline-offset-[3px] hover:text-slate-700 hover:decoration-slate-500"
>
  {t(locale, "在独立工作台查看", "View in standalone workbench")}
  <Link2 className="size-3" aria-hidden="true" />
</a>
```

说明：

- **文案**：中文 `"在独立工作台查看"`、英文 `"View in standalone workbench"`，与 Spec 1 design 冻结的决策一致（Requirement 3.1）。
- **视觉**：从主色 `Button` 降级为次级文本链接，图标改为 `Link2`（`lucide-react` 中表示「外链 / 独立查看」更恰当，且已在文件顶部引用）；移除 `ArrowRight` 图标避免视觉上暗示「主动作」。
- **属性**：`href={SPECS_PATH}` 保留（Requirement 3.2、Requirement 5.1）；`data-testid="autopilot-open-specs-link"` 保留（避免下游测试大面积回归；如果 Spec 5 后续想替换 testid 可以另议）。
- **外层 `<div className="flex flex-wrap items-start justify-between gap-4">` 的 `justify-between`**：因次级链接宽度显著变小，视觉上不再与左侧标题占据对等空间。为避免链接被挤到奇怪位置，需要将该容器改为 `<div className="flex flex-wrap items-start gap-4">`，并把次级链接放在标题下方（或保留右侧但改为 `items-center`，具体实现细节在 PR 中确定；不影响 requirement 合规）。

---

## Props 线路图

`<AutopilotRightRail>` 在 `AutopilotWorkflowRail` fabric 分支中接收的 props 线路如下：

| AutopilotRightRail prop       | 值来源                                          | 来自哪个 `useState` / `useMemo`（位于 `AutopilotRoutePage`） | AutopilotRightRailProps 中类型                        |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `jobId`                       | `latestJob?.id ?? ""`                           | `useState<BlueprintGenerationJob \| null>`                     | `string`                                               |
| `currentStage`                | 常量 `"fabric"`                                 | 无（静态）                                                     | `AutopilotTimelineStage`                               |
| `currentSubStage`             | `resolveRailSubStage({ currentStage, job, selection, specTree, agentCrew })` | 纯函数，由 Spec 1 冻结                        | `AutopilotRailSubStage \| undefined`                   |
| `job`                         | `latestJob`                                     | `useState<BlueprintGenerationJob \| null>`                     | `BlueprintGenerationJob \| null`                       |
| `routeSet`                    | `routeSet`                                      | `useState<BlueprintRouteSet \| null>`                          | `BlueprintRouteSet \| null`                            |
| `selection`                   | `selection`                                     | `useState<BlueprintRouteSelection \| null>`                    | `BlueprintRouteSelection \| null`                      |
| `specTree`                    | `specTree`                                      | `useState<BlueprintSpecTree \| null>`                          | `BlueprintSpecTree \| null`                            |
| `agentCrew`                   | `autopilotAgentCrew`                            | `useMemo(readAutopilotAgentCrew(latestJob), [latestJob])`     | `BlueprintAgentCrewSnapshot \| null`                   |
| `capabilities`                | `autopilotCapabilities`                         | `useMemo(readAutopilotCapabilities(latestJob), [latestJob])`  | `BlueprintRuntimeCapability[]`                         |
| `capabilityInvocations`       | `autopilotCapabilityInvocations`                | `useMemo(readAutopilotCapabilityInvocations(latestJob), ...)` | `BlueprintCapabilityInvocation[]`                      |
| `capabilityEvidence`          | `autopilotCapabilityEvidence`                   | `useMemo(readAutopilotCapabilityEvidence(latestJob), ...)`    | `BlueprintCapabilityEvidence[]`                        |
| `effectPreviews`              | `autopilotEffectPreviews`                       | `useMemo(readAutopilotEffectPreviews(latestJob), [latestJob])`| `BlueprintEffectPreviewSnapshot[]`                     |
| `locale`                      | `locale`                                        | `useAppStore(state => state.locale)`                          | `AppLocale`                                            |
| `onSubStageChange`            | `() => {}`（no-op）                             | 无（Spec 3 不需要持久化；Spec 5 接入 URL 参数或 sticky pin）  | `(next: AutopilotRailSubStage) => void`                |

注意：

- 所有值已经是 `AutopilotWorkflowRail` 当前 props 的子集；`AutopilotWorkflowRail` 签名无需新增。
- `onSubStageChange` 在 Spec 3 中是 no-op；若 `<AutopilotRightRail>` 内部强制要求非空回调，则提供 `() => {}`；若允许为空，保持现状。
- 本 spec 不读取任何新的 store slice、不新增 `fetch`、不新增 `useEffect`（Requirement 6.1、6.2）。

---

## 测试 Delta 表

### AutopilotRoutePage.test.tsx 断言变更

| 编号 | 旧断言（Spec 3 前） | 新断言（Spec 3 后） | 动作 |
| ---- | -------------------- | -------------------- | ---- |
| T01  | `expect(markup).toContain('data-testid="autopilot-advanced-workbenches"')` | — | **删除** |
| T02  | `expect(markup).toContain('data-testid="blueprint-progress-panel"')` | — | **删除** |
| T03  | `expect(markup).toContain("Advanced asset workbenches")`（en-US 场景） | — | **删除** |
| T04  | 中文场景 `"高级资产工作台"` / `"展开查看 SPEC、预演、提示词、能力桥和回放"` | — | **删除** |
| T05  | en-US 场景 `"Expand for SPEC, previews, prompts, capability bridge, and replay"` | — | **删除** |
| T06  | `AutopilotSpecTreeHandoffPanel` 测试中 `expect(markup).toContain("Open deduction workbench")` | `expect(markup).toContain("View in standalone workbench")` | **改写** |
| T07  | `AutopilotSpecTreeHandoffPanel` 测试中 `expect(markup).toContain('href="/specs"')` | 同名 | **保留** |
| T08  | —（新增） | `expect(markup).toContain('data-testid="autopilot-right-rail"')`（当 `currentStage === "fabric"`） | **新增** |
| T09  | —（新增） | `expect(markup).not.toContain('data-testid="autopilot-advanced-workbenches"')` | **新增**（fold removal snapshot） |
| T10  | —（新增） | `expect(markup).not.toContain('data-testid="blueprint-progress-panel"')`（在 `/autopilot` 渲染产物中） | **新增**（fold removal snapshot） |
| T11  | —（新增） | 路线选择不导航：mock `selectBlueprintRoute` 成功，断言 `navigate` mock 未调用 & `window.location.assign/replace/href` 未写入 | **新增** |

### 新增 PBT

| 编号 | 文件位置 | 性质 | 断言摘要 |
| ---- | -------- | ---- | -------- |
| P1   | `client/src/pages/autopilot/right-rail/__tests__/fabric-dispatch.property.test.tsx` | PBT（fast-check） | 对任意合法 `(job, selection, specTree, agentCrew)`，`<AutopilotRightRail currentStage="fabric" ...>` 展示的 sub-stage 与 `resolveRailSubStage(...)` 计算结果一致 |

### 新增 edge-case 测试

| 编号 | 文件位置 | 性质 | 断言摘要 |
| ---- | -------- | ---- | -------- |
| E1   | `client/src/pages/autopilot/AutopilotRoutePage.test.tsx` | edge-case | `selection → fabric` 转换不触发 `navigate()` / `window.location` 写入（Requirement 4、Requirement 10.2） |
| E2   | `client/src/pages/autopilot/AutopilotRoutePage.test.tsx` | edge-case / snapshot | 静态渲染 `<AutopilotRoutePage />` 产物字符串不含 `autopilot-advanced-workbenches` 与 `blueprint-progress-panel`（Requirement 10.3） |

### 复用 Spec 1/2 已有测试

Spec 3 不修改：

- Spec 1 的 `resolve-rail-sub-stage.property.test.ts`（P1/P2/P3 三条 PBT）继续通过。
- Spec 2 的 `props-narrowing.property.test.ts`、`shim-identity.test.ts`、`rendering-parity.test.tsx` 继续通过。
- `/specs` 相关测试（`SpecCenterPage` / `BlueprintProgressPanel`）继续通过，因为 Spec 3 不修改这两个文件。

---

## 迁移兼容性矩阵

| 消费入口 | 本 spec 前（Spec 2 完成后） | 本 spec 完成后 |
| -------- | --------------------------- | -------------- |
| `/autopilot` 5 阶段时间线（左栏） | 5 个 step 由 `AutopilotWorkflowRail` 渲染 | 不变 |
| `/autopilot` 中间 3D 场景 + Runtime Console | `AutopilotVisualStage` 渲染 | 不变 |
| `/autopilot` 右列 400px - 非-fabric stage | `AutopilotWorkflowRail` 内部 switch 渲染 `input / clarification / routeset / selection` | 不变 |
| `/autopilot` 右列 400px - fabric stage | `AutopilotSpecTreeHandoffPanel + AgentCrewSummary` 直接内联 | `AutopilotSpecTreeHandoffPanel`（保留为摘要 / 次级链接承载）+ `<AutopilotRightRail currentStage="fabric" />`（由 8 个 canonical 面板按 `currentSubStage` 派发） |
| `/autopilot` 底部折叠区 | `<details data-testid="autopilot-advanced-workbenches">` 内嵌完整 `BlueprintProgressPanel` | **完全消失** |
| `AutopilotSpecTreeHandoffPanel` 主 CTA | `<Button bg-slate-950 text-white>` 进入推导工作台 | 次级文本链接「在独立工作台查看 / View in standalone workbench」 |
| `SPECS_PATH` (`/specs`) 深链 | 由 `SpecCenterPage → BlueprintProgressPanel` 承载 | 不变；`AutopilotSpecTreeHandoffPanel` 次级链接继续指向此路径 |
| `/specs` 页面 DOM 中 `blueprint-progress-panel` testid | 存在 | 存在（不受 Spec 3 影响） |
| `BlueprintProgressPanel.tsx` 源文件 | 组合组件，5700 行压缩到 ~1500–2000 行（Spec 2 完成） | 文件本身不被 Spec 3 修改 |
| `shared/blueprint/contracts.ts` 字段 | Spec 1 冻结 | 不变 |
| 后端 REST / Socket / DTO | 不变 | 不变 |
| 历史外部 import `@/pages/specs/panels/*` | Spec 2 完成后为 re-export shim | 不变 |
| Spec 1 `AutopilotRightRailProps` 契约 | 冻结 | 不变 |
| Spec 2 canonical 面板 | `autopilot/right-rail/panels/*` | 不变 |

---

## 决策记录

### D1：为什么保留 `AutopilotSpecTreeHandoffPanel` 而不是彻底移除？

- Requirement 3 要求 `SPECS_PATH` 链接降级为次级入口，而不是移除。该面板承担两件事：a) 「已选路线 + SPEC 节点数 + 下一站」摘要；b) 「在独立工作台查看」次级链接。
- 如果直接移除整个面板，摘要信息会消失；这超出 Spec 3 范围（Spec 5 才决定是否统一摘要承载）。
- 保留面板、只降级 CTA，改动最小、回滚最容易。

### D2：为什么选择「次级文本链接」而不是「完全移除 `/specs` 入口」？

- Spec 1 `design.md` 的「导航与 `/specs` 兼容性」段已明确冻结了「保留为次级文本链接」方案，并给出理由：`/specs` 仍是合法深链，历史审阅 / 调试场景会用到。
- 完全移除会让历史链接或书签丢失通向独立工作台的入口，违反 Requirement 5.3 的「/specs 深链行为不得回归」约束。

### D3：为什么选择路径 A（在 `AutopilotWorkflowRail` 内部委派）？

见前文「两种接线路径对比与决策」。核心理由：`currentStage` 的权威源已在 `AutopilotWorkflowRail` 内部，路径 A 避免漂移；`AutopilotWorkflowRail` 已持有全部所需 props，零新增 props。

### D4：为什么 `onSubStageChange` 在本 spec 是 no-op？

- Spec 3 的目标是「用户可见的收敛」：fabric 右栏自动展示当前派生的子阶段。让用户手动切换其他子阶段属于 Spec 5 的能力（URL `?sub=xxx` + 手动覆盖 + sticky pin）。
- `<AutopilotRightRail>` 的当前实现（Spec 1/2）中 `onSubStageChange` 可能在某些内部 UI（例如 sub-stage tabs）中被触发，但 Spec 3 不暴露手动切换入口；即使内部触发，其影响也不持久化。
- 若 Spec 1 的 scaffolding 在 `onSubStageChange` 是 `undefined` 时渲染 read-only sub-stage 指示器，则直接省略该 prop；若要求非空，提供 `() => {}`。具体由实现时读取 `AutopilotRightRail.tsx` 现有签名决定（Spec 1 冻结类型为必填 `(next: AutopilotRailSubStage) => void`，故 Spec 3 提供 `() => {}`）。

### D5：为什么不在本 spec 做 `<md` 移动端抽屉 / 堆叠精修？

- Requirement 7 显式排除移动端精修；Spec 5 `autopilot-step-driven-rail-navigation` 会在同轮处理 URL 参数、键盘快捷键与抽屉态。
- 本 spec 范围若扩大到移动端，会同时触碰 Tailwind 断点、`<AutopilotRightRail>` 的 responsive 容器、`<AutopilotWorkflowRail>` 的 sub-stage 导航，风险陡增。

### D6：为什么 fold removal snapshot 是 edge-case 而不是 PBT？

- 该测试只需一次静态 `renderToStaticMarkup()` 快照，不随输入变化；不适合 fast-check 随机生成。
- PBT 在 Requirement 10.1 已经承接「fabric dispatch consistency」—— 这是真正随 `(job, selection, specTree, agentCrew)` 变化的性质，更适合 fast-check。

### D7：为什么不引入 feature flag 控制折叠区删除？

- Requirement 11.4 明确不引入 feature flag；折叠区删除是一次性合入，回滚通过 `git revert` 实现。
- Feature flag 会同时在 `AutopilotRoutePage.tsx` 中保留旧渲染路径，与 Spec 3 的「物理删除」语义冲突，且会让 Spec 4 的状态所有权分析更复杂。

---

## PBT / edge-case 属性详述

### P1 — Fabric dispatch consistency（PBT，fast-check）

**位置**：`client/src/pages/autopilot/right-rail/__tests__/fabric-dispatch.property.test.tsx`。

**生成规则**：

- `job`: 任一 `BlueprintGenerationJob` 对象（`id: fc.string()`, `stage: fc.constantFrom(...BLUEPRINT_GENERATION_STAGE_VALUES)`, 其他字段用最小 fixture 填充）或 `null`。
- `selection`: `null` 或一个 minimal `BlueprintRouteSelection`（`id`, `routeTitle` 随机字符串）。
- `specTree`: `null` 或最小 `BlueprintSpecTree`（`id`, `nodes: []`, `documents: []`）。
- `agentCrew`: `null` 或最小 `BlueprintAgentCrewSnapshot`。

**断言**：

```ts
fc.assert(
  fc.property(jobArb, selectionArb, specTreeArb, agentCrewArb, (job, selection, specTree, agentCrew) => {
    const expected = resolveRailSubStage({ currentStage: "fabric", job, selection, specTree, agentCrew });
    const { getByTestId, queryByTestId } = render(
      <AutopilotRightRail
        jobId={job?.id ?? ""}
        currentStage="fabric"
        currentSubStage={expected}
        job={job}
        routeSet={null}
        selection={selection}
        specTree={specTree}
        agentCrew={agentCrew}
        capabilities={[]}
        capabilityInvocations={[]}
        capabilityEvidence={[]}
        effectPreviews={[]}
        locale="zh-CN"
        onSubStageChange={() => {}}
      />
    );
    // 假设 Spec 1 scaffolding 在当前 sub-stage 区块上挂 data-testid=`autopilot-rail-sub-stage-${expected}`
    // 或者从 currentSubStage 对应的 canonical panel testid 校验
    if (expected) {
      expect(getByTestId(`autopilot-rail-sub-stage-${expected}`)).toBeInTheDocument();
    } else {
      // currentStage="fabric" 下 resolver 理论不会返回 undefined（会返回 agent_crew_fabric 兜底）
      expect(queryByTestId(/autopilot-rail-sub-stage-/)).toBeInTheDocument();
    }
  }),
  { numRuns: 50 }  // 控制在 Spec 1 PBT 套件平均耗时的 3x 内
);
```

**退避策略**：若 `<AutopilotRightRail>` 当前 scaffolding 不挂 `autopilot-rail-sub-stage-*` testid，退而对组件内部状态做 prop spy（通过 mock 8 个 canonical 面板来验证哪个被渲染）。

### E1 — Route selection no-navigation（edge-case）

**位置**：`client/src/pages/autopilot/AutopilotRoutePage.test.tsx` 新增 `describe("selection → fabric")`。

**实现**：

```ts
it("does not navigate when selectBlueprintRoute succeeds", async () => {
  const navigateSpy = vi.fn();
  vi.mock("react-router-dom", async (orig) => ({
    ...(await orig<typeof import("react-router-dom")>()),
    useNavigate: () => navigateSpy,
  }));
  const assignSpy = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  const replaceSpy = vi.spyOn(window.location, "replace").mockImplementation(() => {});
  
  // Mock selectBlueprintRoute 成功分支
  vi.spyOn(blueprintApi, "selectBlueprintRoute").mockResolvedValueOnce({
    selection: mockSelection,
    job: { ...mockJob, stage: "spec_tree" },
  });
  
  // 渲染 + 触发路线选择
  const { getByTestId } = render(<AutopilotRoutePage />);
  // ... 触发 onSelectRoute ...
  await waitFor(() => {
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
  // 断言 fabric 右栏已经出现
  expect(getByTestId("autopilot-right-rail")).toBeInTheDocument();
});
```

### E2 — Fold removal snapshot（edge-case）

**位置**：`client/src/pages/autopilot/AutopilotRoutePage.test.tsx` 复用既有 `describe("AutopilotRoutePage")` 块。

**实现**：

```ts
it("no longer renders the advanced workbenches fold", () => {
  const markup = renderToStaticMarkup(<AutopilotRoutePage />);
  expect(markup).not.toContain('data-testid="autopilot-advanced-workbenches"');
  expect(markup).not.toContain('data-testid="blueprint-progress-panel"');
  expect(markup).not.toContain("高级资产工作台");
  expect(markup).not.toContain("Advanced asset workbenches");
});
```

---

## 非目标

- 不抽 `useAutopilotRightRailData` hook（Spec 4）。
- 不引入 URL `?sub=...` 参数、sticky pin、自动滚动、键盘快捷键（Spec 5）。
- 不重做 `<md` 堆叠 / `md-xl` 抽屉（Spec 5）。
- 不合并 `BlueprintProgressPanel.autoLoad` fetch 路径（Spec 4）。
- 不修改 `BlueprintProgressPanel.tsx`、`SpecCenterPage.tsx`、`client/src/pages/autopilot/right-rail/panels/*`。
- 不改变 `shared/blueprint/contracts.ts`、后端 REST、Socket、DTO。
- 不删除 `SpecCenterPage.tsx` 或 `/specs` 路由。
- 不移动 `BlueprintProgressPanel.tsx`。
- 不重命名任何组件。
- 不新增 analytics 埋点或 feature flag。

---

## 回滚

本 spec 所有改动局限于以下 2 个源码文件 + 测试文件（Requirement 11.1）：

- `client/src/pages/autopilot/AutopilotRoutePage.tsx`
- `client/src/pages/autopilot/AutopilotRoutePage.test.tsx`
- （新增）`client/src/pages/autopilot/right-rail/__tests__/fabric-dispatch.property.test.tsx`

回滚方式：`git revert` 本 spec 的合入 commit，即可恢复底部折叠区形态。Spec 1/2 的产物（`right-rail/`、`right-rail/panels/`）不受影响。

---

## 与后续 spec 的衔接

- **Spec 4 `autopilot-right-rail-data-hook`**：
  - Spec 3 完成后，`<AutopilotRightRail>` 的全部 props 来自 `AutopilotRoutePage` 内部 state。Spec 4 可以把这些 state 抽到 `useAutopilotRightRailData()` hook 内，并让 `<AutopilotRightRail>` 从 hook 消费。Spec 3 不为此保留接口，但 props 契约（Spec 1 冻结）保证了 drop-in 替换的可行性。
- **Spec 5 `autopilot-step-driven-rail-navigation`**：
  - Spec 3 完成后 `onSubStageChange` 是 no-op。Spec 5 会把它连到 URL 参数 / sticky pin / 自动滚动。
  - Spec 5 也会精修 `<md` 移动端抽屉 / 堆叠布局，精修 `AutopilotSpecTreeHandoffPanel` 次级链接的文案与图标（若需要进一步简化）。
