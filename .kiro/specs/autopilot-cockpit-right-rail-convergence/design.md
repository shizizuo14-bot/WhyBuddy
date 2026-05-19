# 设计文档：Autopilot 驾驶舱右栏收敛

## 设计概述

本 spec 冻结一份「Autopilot 驾驶舱右栏收敛」的导航 / 契约 / 类型骨架，使后续的组件抽离（Spec 2）、底部折叠区删除（Spec 3）、数据层合并（Spec 4）、步骤驱动 UX（Spec 5）都能在同一套规则下并行推进。

本 spec 的交付范围 **只包含**：

1. 5 阶段时间线 → 右栏子面板契约
2. `AutopilotRightRailProps` TypeScript 接口
3. `resolveRailSubStage` 纯函数与其属性测试
4. 导航与 `/specs` 兼容性规则
5. 响应式断点策略
6. 现有状态所有权盘点与数据源收敛要求
7. 可访问性与 i18n 合同
8. 迁移 / 回滚 / testid 冻结约束

本 spec **不包含**：

- 实际搬运 `BlueprintProgressPanel` 内联的 6-7 个工作台面板（Spec 2）
- 删除 `<details data-testid="autopilot-advanced-workbenches">`（Spec 3）
- `useAutopilotRightRailData` hook 与 fetch 合并（Spec 4）
- 步骤驱动动画、自动滚动、快捷键（Spec 5）

## 现状对照

### 当前 `/autopilot` 布局（`client/src/pages/autopilot/AutopilotRoutePage.tsx`）

```
┌───────────────────────────────────────────────────────────────────────┐
│ header（语言切换 + 当前项目）                                           │
├──────────────────────────────┬────────────────────────────────────────┤
│                              │                                        │
│  AutopilotVisualStage        │  AutopilotWorkflowRail                 │
│  （3D 场景 + Runtime Console）│  （5 阶段 Step + 当前 stage 面板）      │
│  minmax(0, 1fr)              │  固定 400px（xl 及以上）                │
│                              │                                        │
├──────────────────────────────┴────────────────────────────────────────┤
│ <details data-testid="autopilot-advanced-workbenches">                │
│   └─ <BlueprintProgressPanel /> （SPEC tree / SPEC docs / Effect /    │
│        Prompt / Runtime capability / Artifact memory）                │
│ </details>                                                             │
└───────────────────────────────────────────────────────────────────────┘
```

`AutopilotWorkflowRail` 当前按 `flowSteps[].id` 渲染，5 个 step id 为 `"input" | "clarification" | "routeset" | "selection" | "fabric"`（外加一个 `"projection"` 视觉展示 step，但并不进入 `AutopilotWorkflowStage` 判定）。Fabric step 内部目前直接内联 `AutopilotSpecTreeHandoffPanel + AgentCrewSummary`，并在 `AutopilotSpecTreeHandoffPanel` 中暴露「进入推导工作台 / Open deduction workbench」链接（`href={SPECS_PATH}`）。

`/specs` 由 `SpecCenterPage` 托管，同样复用 `BlueprintProgressPanel`。

### `BlueprintGenerationJob.stage` 枚举（`shared/blueprint/contracts.ts`）

```ts
export type BlueprintGenerationStage =
  | "input"
  | "clarification"
  | "route_generation"
  | "route_selection"
  | "agent_crew_fabric"
  | "spec_tree"
  | "spec_docs"
  | "preview"
  | "effect_preview"
  | "prompt_packaging"
  | "runtime_capability"
  | "engineering_handoff"
  | "engineering_landing";
```

## 架构示意

### 目标布局

```
┌───────────────────────────────────────────────────────────────────────┐
│ header                                                                │
├─────────────┬──────────────────────────────────┬──────────────────────┤
│             │                                  │                      │
│ 5 阶段      │  AutopilotVisualStage            │  AutopilotRightRail  │
│ 时间线      │  （3D 场景 + Runtime Console）    │  （固定 400px）       │
│  input      │                                  │                      │
│  clarify    │                                  │  currentStage=fabric │
│  routeset   │                                  │   └ subStage steps   │
│  selection  │                                  │      1 agent_crew... │
│  fabric ▸   │                                  │      2 spec_tree     │
│             │                                  │      3 spec_documents│
│             │                                  │      4 effect_preview│
│             │                                  │      5 prompt_package│
│             │                                  │      6 runtime_cap.. │
│             │                                  │      7 eng. handoff  │
│             │                                  │      8 artifact_mem. │
│             │                                  │                      │
└─────────────┴──────────────────────────────────┴──────────────────────┘
        （底部 details 折叠区在 Spec 3 删除；本 spec 仅标记为「待移除」）
```

左侧时间线仍然是 5 阶段；当 `currentStage === "fabric"` 时，右栏内部展开 8 个 `Rail_Sub_Stage` 子步骤，由 `resolveRailSubStage()` 依据 `BlueprintGenerationJob.stage / selection / specTree / agentCrew` 驱动。

## Stage 与 Sub-Stage 映射表

### 顶层 5 阶段对应的右栏内容

| Timeline_Stage   | 右栏内容（抽象）                                                      | 当前承接 (AutopilotWorkflowRail)                                |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `input`          | Intake 表单 / GitHub 入料 / project context                           | `autopilot-step-input` 面板                                     |
| `clarification`  | Clarification 问答 + readiness 指示                                   | 澄清问答区                                                      |
| `routeset`       | RouteSet 候选展示 + 生成动作                                          | `autopilot-generate-routeset-button` + 等待提示                 |
| `selection`      | 主路线 + 备选路线 + `selectBlueprintRoute` CTA                        | `autopilot-selection-step`                                      |
| `fabric`         | 由 `currentSubStage` 决定的 8 个子工作台之一                          | `autopilot-fabric-step`（本 spec 扩展为 sub-stage 驱动）        |

### Fabric 内部 8 个 Rail_Sub_Stage

| 顺序 | Rail_Sub_Stage         | 右栏内容（抽象）                                                                | 关联的 `BlueprintGenerationJob.stage`                          | 关联数据源                                                                     |
| ---- | ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | `agent_crew_fabric`    | AgentCrew 角色矩阵、活跃 / 评审角色数、能力绑定摘要                             | `agent_crew_fabric`                                            | `agentCrew`、`capabilities`                                                    |
| 2    | `spec_tree`            | SPEC Tree 节点导览 + 版本指针 + handoff 说明                                    | `spec_tree`                                                    | `specTree`、`job.handoffState`                                                 |
| 3    | `spec_documents`       | Requirements / Design / Tasks 三档 SPEC 文档编辑与查看                          | `spec_docs`                                                    | `specTree.documents`                                                           |
| 4    | `effect_preview`       | Effect preview 快照 + 3D / HUD 运行投影摘要                                     | `preview`、`effect_preview`                                    | `effectPreviews`、`capabilityEvidence`                                         |
| 5    | `prompt_package`       | Prompt packaging 输出 + 目标平台                                                | `prompt_packaging`                                             | 由 `BlueprintProgressPanel` 现有 prompt package 拉取承接                       |
| 6    | `runtime_capability`   | Runtime capability bridge 调用记录与证据                                        | `runtime_capability`                                           | `capabilities`、`capabilityInvocations`、`capabilityEvidence`                  |
| 7    | `engineering_handoff`  | Engineering handoff 计划与下发                                                  | `engineering_handoff`                                          | engineering landing plan 列表                                                  |
| 8    | `artifact_memory`      | Artifact ledger / replay / diff / feedback 回溯                                 | `engineering_landing`（或之后的稳定态）                        | artifact ledger / replay 接口                                                  |

顺序通过 `RAIL_SUB_STAGE_ORDER` 常量冻结：

```ts
export const RAIL_SUB_STAGE_ORDER = [
  "agent_crew_fabric",
  "spec_tree",
  "spec_documents",
  "effect_preview",
  "prompt_package",
  "runtime_capability",
  "engineering_handoff",
  "artifact_memory",
] as const;
```

## 组件树

```
AutopilotRoutePage
├─ <AutopilotWorkflowRail>          // 左：5 阶段时间线（不变）
├─ <AutopilotVisualStage>           // 中：3D 场景 + Runtime Console（不变）
└─ <AutopilotRightRail>             // 右：本 spec 新增 scaffolding
   ├─ props: AutopilotRightRailProps
   ├─ 由 resolveRailSubStage() 计算 currentSubStage
   ├─ currentStage === "fabric" ? <FabricSubStageNav /> : null
   └─ switch(currentStage) {
        case "input":        <InputRailPanel />
        case "clarification":<ClarificationRailPanel />
        case "routeset":     <RouteSetRailPanel />
        case "selection":    <SelectionRailPanel />
        case "fabric":       <FabricRailPanel currentSubStage={…} />
      }
```

> 本 spec 阶段，`<AutopilotRightRail>` 仅作为 **最小 scaffolding**：导出类型、挂载 resolver、渲染 5 个 placeholder 面板与 8 个子阶段 placeholder 区块；真实内容仍由现有 `AutopilotWorkflowRail` + 底部 `BlueprintProgressPanel` 承接。Spec 2 负责把内容从 `BlueprintProgressPanel` 迁进 `FabricRailPanel`。

## Props 接口（TypeScript）

建议位置：`client/src/pages/autopilot/right-rail/types.ts`。

```ts
import type { AppLocale } from "@/lib/locale";
import type {
  BlueprintAgentCrewSnapshot,
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintEffectPreviewSnapshot,
  BlueprintGenerationJob,
  BlueprintRouteSelection,
  BlueprintRouteSet,
  BlueprintRuntimeCapability,
  BlueprintSpecTree,
} from "@shared/blueprint/contracts";

export type AutopilotTimelineStage =
  | "input"
  | "clarification"
  | "routeset"
  | "selection"
  | "fabric";

export type AutopilotRailSubStage =
  | "agent_crew_fabric"
  | "spec_tree"
  | "spec_documents"
  | "effect_preview"
  | "prompt_package"
  | "runtime_capability"
  | "engineering_handoff"
  | "artifact_memory";

export const RAIL_SUB_STAGE_ORDER: readonly AutopilotRailSubStage[] = [
  "agent_crew_fabric",
  "spec_tree",
  "spec_documents",
  "effect_preview",
  "prompt_package",
  "runtime_capability",
  "engineering_handoff",
  "artifact_memory",
] as const;

export interface AutopilotRightRailProps {
  /** 当前 blueprint generation job id；没有 job 时仍需提供空字符串占位 */
  jobId: string;
  /** 左侧时间线当前激活阶段 */
  currentStage: AutopilotTimelineStage;
  /** 仅当 currentStage === "fabric" 时才应为有值，其它阶段必须为 undefined */
  currentSubStage?: AutopilotRailSubStage;
  /** 主数据对象 */
  job: BlueprintGenerationJob | null;
  routeSet: BlueprintRouteSet | null;
  selection: BlueprintRouteSelection | null;
  specTree: BlueprintSpecTree | null;
  agentCrew: BlueprintAgentCrewSnapshot | null;
  /** 下游数据插槽（命名与 BlueprintProgressPanel 现有 props 对齐） */
  capabilities: BlueprintRuntimeCapability[];
  capabilityInvocations: BlueprintCapabilityInvocation[];
  capabilityEvidence: BlueprintCapabilityEvidence[];
  effectPreviews: BlueprintEffectPreviewSnapshot[];
  /** i18n */
  locale: AppLocale;
  /** 用户点击子阶段导航时由父组件处理 */
  onSubStageChange: (next: AutopilotRailSubStage) => void;
}

export interface ResolveRailSubStageInput {
  currentStage: AutopilotTimelineStage;
  job: BlueprintGenerationJob | null;
  selection: BlueprintRouteSelection | null;
  specTree: BlueprintSpecTree | null;
  agentCrew: BlueprintAgentCrewSnapshot | null;
}

export function resolveRailSubStage(
  input: ResolveRailSubStageInput
): AutopilotRailSubStage | undefined;
```

## Resolver 规则

```
function resolveRailSubStage(input): Rail_Sub_Stage | undefined {
  if (input.currentStage !== "fabric") return undefined;

  const jobStage = input.job?.stage ?? "agent_crew_fabric";

  switch (jobStage) {
    case "input":
    case "clarification":
    case "route_generation":
    case "route_selection":
    case "agent_crew_fabric":
      return "agent_crew_fabric";
    case "spec_tree":
      return "spec_tree";
    case "spec_docs":
      return "spec_documents";
    case "preview":
    case "effect_preview":
      return "effect_preview";
    case "prompt_packaging":
      return "prompt_package";
    case "runtime_capability":
      return "runtime_capability";
    case "engineering_handoff":
      return "engineering_handoff";
    case "engineering_landing":
      return "artifact_memory";
    default:
      return "agent_crew_fabric"; // 保底落到起始子阶段
  }
}
```

几个关键性质：

- `currentStage !== "fabric"` 时严格返回 `undefined`，避免泄漏 fabric 内部语义到其他时间线。
- `job === null` 或 `job.stage` 处于上游时，fabric 的起始子阶段恒为 `agent_crew_fabric`；这保证用户一旦进入 fabric tab 总能看到一个起点面板，而不是空白。
- Resolver 是纯函数：不读取 store、不 `Date.now()`、不发网络请求；这使得后续 Spec 5 的自动滚动可以放心以同一 resolver 计算目标 step。

## 导航与 `/specs` 兼容性

### `/autopilot` 单页驾驶舱

- `selectBlueprintRoute` 成功后，`AutopilotRoutePage` 仅通过内部 state 推进 `currentStage` 与 `currentSubStage`，**不调用 `navigate()`**；`SPECS_PATH` 的跳转不再作为主 CTA。
- `AutopilotSpecTreeHandoffPanel` 内 `href={SPECS_PATH}` 的链接在本 spec 内的最终决策：**保留为次级「在独立工作台查看 / View in standalone workbench」文本链接**。
  - 理由：`/specs` 仍是合法深链，团队在历史审阅 / 调试场景会用到；彻底移除会让历史链接 404。降级为次级链接能保留该能力，但不再误导用户「这是主路径」。
  - 具体文案本 spec 不冻结；Spec 5 负责 UX 微调。
- 本 spec 不引入 `/autopilot/fabric/spec-tree` 这类子路由；子阶段导航通过内部 state（以及 Spec 5 可选的 `?sub=spec_tree` URL 参数）实现。

### `/specs` 深链

- 继续挂在 `/specs`，`SpecCenterPage` 内的 `BlueprintProgressPanel` 使用行为不变。
- 后端 REST 合同零变更：`BlueprintGenerationJob`、`BlueprintRouteSet`、`BlueprintRouteSelection`、`BlueprintSpecTree` 的字段与语义保持当前版本。

## 响应式断点策略

| 断点区间        | Right Rail 形态                                    | 时间线                          | 主场景                       |
| --------------- | -------------------------------------------------- | ------------------------------- | ---------------------------- |
| ≥ 1280px (`xl`) | 固定 400px 右栏（沿用现有 grid-cols）              | 左侧常驻                        | 中间 3D + Runtime Console    |
| 768px – 1279px  | 右侧滑出抽屉（复用 `HoloDrawer`）；默认收起        | 左侧常驻                        | 中间 3D + Runtime Console    |
| < 768px         | 子阶段面板按 `RAIL_SUB_STAGE_ORDER` 垂直堆叠于场景下 | 横向可滑或折叠                  | 中间 3D 占用全宽，高度压缩   |

- 抽屉态与固定态使用完全相同的 `AutopilotRightRailProps`，不得引入 props 变体。
- 抽屉关闭时，左侧时间线的 `fabric` step 需显示「展开右栏」入口（UX 细节由 Spec 5 完善）。
- 本 spec 不改动当前的 `xl:grid-cols-[minmax(0,1fr)_400px]` 实现；只冻结契约，实际断点切换 UI 的落地由 Spec 2 与 Spec 5 分别补齐。

## 现状与数据源收敛

### 现状盘点（来自真实代码，不假设）

- `AutopilotRoutePage.tsx` 在 `useState` / `useEffect` 链路上持有：`targetText / githubInput / intake / projectContext / clarificationSession / readiness / answerDrafts / routeSet / selection / specTree / latestJob / autopilotAgentCrew / autopilotCapabilities / autopilotCapabilityInvocations / autopilotCapabilityEvidence / autopilotEffectPreviews / consoleLines / apiError / creatingIntake / generatingClarifications / savingAnswers / generatingRouteSet / selectingRouteId` 等状态（行区间约 380-450 与 680-830，具体行数随未来改动可能漂移）。
- 这些状态目前通过 `AutopilotWorkflowRail` props 下传到左侧时间线，同时以 `initialJob / initialRouteSet / initialSelection / initialSpecTree / initialEffectPreviews / initialCapabilities / initialAgentCrew / initialClarificationSession / initialCapabilityInvocations / initialCapabilityEvidence` 下传到底部 `BlueprintProgressPanel`。
- `BlueprintProgressPanel` 在 `autoLoad` 开启场景下独立调用 `fetchLatestBlueprintGenerationJob / fetchBlueprintSpecsProgress / fetchBlueprintEngineeringRuns / fetchBlueprintArtifactLedger` 等接口。在 `/autopilot` 上下文中 `autoLoad={false}`，但它在 `/specs` 仍保留独立 fetch 层，形成两条并行路径。

### 本 spec 的硬性要求

1. 将来的右栏组件 **只通过 `AutopilotRightRailProps` 接收数据**，不得在组件内直接 `useAppStore` 或调用 `@/lib/blueprint-api`。
2. 数据源合并（即 `useAutopilotRightRailData` hook）不在本 spec 实施，由 Spec 4 单独承接。
3. 本 spec 的 scaffolding 组件只导出类型与占位实现，不新增任何 fetch。

## 迁移 / 兼容性记录

| 变更项                                                        | 本 spec                 | 由谁承接                                         |
| ------------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| 删除 `<details data-testid="autopilot-advanced-workbenches">` | ❌ 不做                 | Spec 3 `autopilot-advanced-workbench-inline`     |
| 搬运 `BlueprintProgressPanel` 内部 6-7 个工作台到独立文件     | ❌ 不做                 | Spec 2 `autopilot-right-rail-stage-panels`       |
| `useAutopilotRightRailData` hook / fetch 合并                 | ❌ 不做                 | Spec 4 `autopilot-right-rail-data-hook`          |
| 子阶段 URL 参数、自动滚动、动画、快捷键                       | ❌ 不做                 | Spec 5 `autopilot-step-driven-rail-navigation`   |
| `AutopilotRightRailProps` / `resolveRailSubStage` / 常量      | ✅ 本 spec              | —                                                |
| 次级 `/specs` 链接降级                                        | 🟨 冻结决策，不动代码   | Spec 5（UX 文案 / 样式），Spec 2（实际删除位置） |
| `data-testid` 冻结                                            | ✅ 冻结，现状保留不删   | Spec 3 在删除折叠区时一并规划 testid 迁移        |

## 正确性性质（PBT 候选）

以下 3 条性质将在 Tasks 2.x 中实现为 fast-check 属性测试：

1. **P1 — Total function**：对任意合法 `ResolveRailSubStageInput`（包括 `job = null`、`selection = null`、全部枚举的 `currentStage` 与 `job.stage`），`resolveRailSubStage()` 必然返回 `undefined`（`currentStage !== "fabric"` 时）或 `RAIL_SUB_STAGE_ORDER` 中的一员（`currentStage === "fabric"` 时）。不抛异常、不返回 `null`、不返回枚举外字符串。
2. **P2 — Monotonicity**：给定一串按 `BlueprintGenerationStage` 自然顺序（`spec_tree → spec_docs → preview → effect_preview → prompt_packaging → runtime_capability → engineering_handoff → engineering_landing`）推进的 `job.stage` 序列，`resolveRailSubStage()` 返回的 `Rail_Sub_Stage` 在 `RAIL_SUB_STAGE_ORDER` 上的索引单调不递减。
3. **P3 — Idempotence**：对相同的 `(job, selection, specTree, agentCrew, currentStage)` 快照，`resolveRailSubStage()` 重复调用返回值完全一致。

以上 3 条性质不依赖浏览器、不依赖网络、不依赖 store，是典型的纯函数 PBT 对象。

## 非目标

- 本 spec 不决定每一个子阶段面板的视觉样式与动效细节。
- 本 spec 不重新设计左侧 5 阶段时间线的视觉（`AutopilotWorkflowRail` 保持现状）。
- 本 spec 不引入新的后端路由或 DTO。
- 本 spec 不为移动端提供驾驶舱体验保证；`sm` 以下形态仅作为兜底堆叠。
- 本 spec 不承诺某个子阶段对应的后端接口完备性；具体 API 拼装由 Spec 2/4 完成。

