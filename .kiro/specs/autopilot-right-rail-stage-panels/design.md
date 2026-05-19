# 设计文档：Autopilot 右栏子阶段面板物理抽离

## 设计概述

本 spec 把 `client/src/pages/specs/BlueprintProgressPanel.tsx`（~5700 行）中 6 个 **local function** 形式的工作台面板，以及外部已存在但未被驾驶舱右栏直接持有的 `SpecTreeWorkbenchPanel` / `SpecDocumentWorkbenchPanel`，全部以**逐面板、独立 PR** 的方式抽离到 `client/src/pages/autopilot/right-rail/panels/`。

关键约束：

1. `BlueprintProgressPanel.tsx` 在 8 次抽离全部结束后仍然是一个**可工作的组合组件**，`/specs` 页面（`SpecCenterPage.tsx`）与 `AutopilotRoutePage.tsx` 底部折叠区继续复用它。
2. Spec 1 冻结的 `AutopilotRightRailProps` / `resolveRailSubStage` / `<AutopilotRightRail>` scaffolding 在本 spec 中**被消费**：`<AutopilotRightRail>` 在 `currentStage === "fabric"` 时按 `currentSubStage` dispatch 到 8 个 canonical panel。
3. 零后端契约变更、零 `data-testid` drift、零重命名。

本 spec **不**承担：

- 删除 `<details data-testid="autopilot-advanced-workbenches">`（Spec 3）
- 抽出 `useAutopilotRightRailData` hook（Spec 4）
- 自动滚动 / URL 参数 / 键盘快捷键（Spec 5）
- 触碰 `input / clarification / routeset / selection` 四个非-fabric stage 的 rail（仍由 `AutopilotWorkflowRail` 承接）
- 重写 `SpecTreeWorkbenchPanel.tsx` / `SpecDocumentWorkbenchPanel.tsx` 的内部实现

## 现状对照

### 当前 `BlueprintProgressPanel.tsx` 内嵌的 local function 面板

通过 `grepSearch` 可以确认以下 6 个 local function（行号随未来改动会漂移，但函数名已冻结）：

| 函数名                                | 大致行区间     | 签名中引用的 props                                                                                                                        |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `EffectPreviewWorkbenchPanel`         | ~2084–2500     | `{ specTree, jobId, documents, initialPreviews, agentCrew, onPreviewsChange }`                                                              |
| `PromptPackageWorkbenchPanel`         | ~2503–2970     | `{ specTree, jobId, documents, effectPreviews, initialPackages, onPackagesChange }`                                                         |
| `RuntimeCapabilityBridgeWorkbenchPanel` | ~2973–3658   | `{ specTree, jobId, initialCapabilities, initialAgentCrew, initialInvocations, initialEvidence, onCapabilitiesChange / ...Change 系列 }`    |
| `EngineeringLandingWorkbenchPanel`    | ~3661–4418     | `{ jobId, promptPackages, initialPlans, initialRuns, onLandingPlansChange, onEngineeringRunsChange }`                                       |
| `ArtifactMemoryWorkbenchPanel`        | ~4421–5269     | `{ jobId, initialEntries, initialReplays, initialFeedback }`                                                                                |
| `BlueprintAgentCrewSurface`           | ~1794–2083     | `{ agentCrew, capabilities, invocations, evidence, roleEventProjection }`（对应 `agent_crew_fabric` sub-stage）                             |

### 当前外部已存在的两个面板

`client/src/pages/specs/SpecTreeWorkbenchPanel.tsx` 与 `client/src/pages/specs/SpecDocumentWorkbenchPanel.tsx` 已经是独立文件。本 spec **不触碰它们**，只在 `autopilot/right-rail/panels/` 下新增 `SpecTreePanel.tsx` / `SpecDocumentsPanel.tsx` 两个**薄 wrapper**，用来把 `AutopilotRightRailProps` 的窄化 slice 转接到既有面板。

### 当前 `client/src/pages/specs/panels/` 占位文件

- `EffectPreviewPanel.tsx` → 字符串常量 `EFFECT_PREVIEW_PANEL_PLACEHOLDER`
- `PromptPackagePanel.tsx` → `PROMPT_PACKAGE_PANEL_PLACEHOLDER`
- `RuntimeCapabilityPanel.tsx` → `RUNTIME_CAPABILITY_PANEL_PLACEHOLDER`
- `EngineeringLandingPanel.tsx` → `ENGINEERING_LANDING_PANEL_PLACEHOLDER`
- `ArtifactMemoryPanel.tsx` → `ARTIFACT_MEMORY_PANEL_PLACEHOLDER`
- `SpecTreePanel.tsx` → 已经 re-export `../SpecTreeWorkbenchPanel.js`
- `SpecDocumentsPanel.tsx` → 已经 re-export `../SpecDocumentWorkbenchPanel.js`
- `index.ts` → 当前 barrel，导出 SpecTree/SpecDocument 与几个占位常量

本 spec 结束后，这些文件统一变为对 `autopilot/right-rail/panels/` 的 **re-export**。

## 目标架构

```
client/src/pages/autopilot/right-rail/
├── AutopilotRightRail.tsx           # Spec 1 scaffolding，本 spec 扩展 switch
├── types.ts                          # Spec 1 冻结，本 spec 只读
├── resolve-rail-sub-stage.ts        # Spec 1 冻结，本 spec 只读
├── index.ts                          # Spec 1 barrel，本 spec 不改
└── panels/                           # 🆕 本 spec 创建
    ├── index.ts                      # 🆕 barrel
    ├── AgentCrewFabricPanel.tsx      # 🆕 从 BlueprintProgressPanel 抽离
    ├── SpecTreePanel.tsx             # 🆕 wrap SpecTreeWorkbenchPanel
    ├── SpecDocumentsPanel.tsx        # 🆕 wrap SpecDocumentWorkbenchPanel
    ├── EffectPreviewPanel.tsx        # 🆕 从 BlueprintProgressPanel 抽离
    ├── PromptPackagePanel.tsx        # 🆕 从 BlueprintProgressPanel 抽离
    ├── RuntimeCapabilityPanel.tsx    # 🆕 从 BlueprintProgressPanel 抽离
    ├── EngineeringHandoffPanel.tsx   # 🆕 从 BlueprintProgressPanel 抽离
    ├── ArtifactMemoryPanel.tsx       # 🆕 从 BlueprintProgressPanel 抽离
    └── _shared/                      # 🆕（按需）
        └── workbench-helpers.ts      # 容纳 parseWorkbenchLines / readLatestAgentCrew 等被抽离共享的纯函数
```

```
client/src/pages/specs/
├── BlueprintProgressPanel.tsx        # 组合化：持有 state + fetch + 渲染 panels
├── SpecTreeWorkbenchPanel.tsx        # 零改动
├── SpecDocumentWorkbenchPanel.tsx    # 零改动
└── panels/                           # 改为 re-export shim
    ├── index.ts                      # 更新为 re-export 8 个 canonical panel
    ├── AgentCrewFabricPanel.tsx      # 🆕 shim（本 spec 可选；历史无此占位，新增为 re-export）
    ├── SpecTreePanel.tsx             # 改为 re-export 新 wrapper
    ├── SpecDocumentsPanel.tsx        # 改为 re-export 新 wrapper
    ├── EffectPreviewPanel.tsx        # 改为 re-export（删除字符串常量）
    ├── PromptPackagePanel.tsx        # 改为 re-export
    ├── RuntimeCapabilityPanel.tsx    # 改为 re-export
    ├── EngineeringLandingPanel.tsx   # 改为 re-export（函数名从 EngineeringLanding → EngineeringHandoff，shim 内 re-export 两个名字以兼容旧 import）
    ├── ArtifactMemoryPanel.tsx       # 改为 re-export
    ├── JobLedgerPanel.tsx            # 本 spec 不动
    ├── ProgressHeaderPanel.tsx       # 本 spec 不动
    ├── RouteCandidateCard.tsx        # 本 spec 不动
    └── RuntimeProjectionCard.tsx     # 本 spec 不动
```

## 面板抽离总表（8 行）

| # | Canonical 新路径                                                     | 旧 local function 位置                                                              | 新 narrowed props 类型                                                                                                                                               | 消费的 `AutopilotRightRailProps` 字段                                                                |
| - | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1 | `autopilot/right-rail/panels/AgentCrewFabricPanel.tsx`                | `BlueprintProgressPanel.tsx::BlueprintAgentCrewSurface` (~行 1794–2083)             | `AgentCrewFabricPanelProps = Pick<AutopilotRightRailProps, "jobId" \| "job" \| "agentCrew" \| "capabilities" \| "capabilityInvocations" \| "capabilityEvidence" \| "locale">` | `jobId, job, agentCrew, capabilities, capabilityInvocations, capabilityEvidence, locale`              |
| 2 | `autopilot/right-rail/panels/SpecTreePanel.tsx`                       | 无内联实现（wrap `specs/SpecTreeWorkbenchPanel.tsx`）                               | `SpecTreePanelProps = Pick<AutopilotRightRailProps, "jobId" \| "specTree" \| "selection" \| "locale">`                                                              | `jobId, specTree, selection, locale`                                                                  |
| 3 | `autopilot/right-rail/panels/SpecDocumentsPanel.tsx`                  | 无内联实现（wrap `specs/SpecDocumentWorkbenchPanel.tsx`）                           | `SpecDocumentsPanelProps = Pick<AutopilotRightRailProps, "jobId" \| "specTree" \| "locale">`                                                                        | `jobId, specTree, locale`                                                                             |
| 4 | `autopilot/right-rail/panels/EffectPreviewPanel.tsx`                  | `BlueprintProgressPanel.tsx::EffectPreviewWorkbenchPanel` (~行 2084–2502)           | `EffectPreviewPanelProps = Pick<AutopilotRightRailProps, "jobId" \| "job" \| "specTree" \| "effectPreviews" \| "agentCrew" \| "capabilityEvidence" \| "locale">`     | `jobId, job, specTree, effectPreviews, agentCrew, capabilityEvidence, locale`                         |
| 5 | `autopilot/right-rail/panels/PromptPackagePanel.tsx`                  | `BlueprintProgressPanel.tsx::PromptPackageWorkbenchPanel` (~行 2503–2972)           | `PromptPackagePanelProps = Pick<AutopilotRightRailProps, "jobId" \| "specTree" \| "effectPreviews" \| "locale">`                                                    | `jobId, specTree, effectPreviews, locale`                                                             |
| 6 | `autopilot/right-rail/panels/RuntimeCapabilityPanel.tsx`              | `BlueprintProgressPanel.tsx::RuntimeCapabilityBridgeWorkbenchPanel` (~行 2973–3660) | `RuntimeCapabilityPanelProps = Pick<AutopilotRightRailProps, "jobId" \| "specTree" \| "capabilities" \| "capabilityInvocations" \| "capabilityEvidence" \| "agentCrew" \| "locale">` | `jobId, specTree, capabilities, capabilityInvocations, capabilityEvidence, agentCrew, locale`         |
| 7 | `autopilot/right-rail/panels/EngineeringHandoffPanel.tsx`             | `BlueprintProgressPanel.tsx::EngineeringLandingWorkbenchPanel` (~行 3661–4420)      | `EngineeringHandoffPanelProps = Pick<AutopilotRightRailProps, "jobId" \| "locale">`                                                                                 | `jobId, locale`（promptPackages / plans / runs 由 `BlueprintProgressPanel` 内 state 经 extra props 下传） |
| 8 | `autopilot/right-rail/panels/ArtifactMemoryPanel.tsx`                 | `BlueprintProgressPanel.tsx::ArtifactMemoryWorkbenchPanel` (~行 4421–5270)          | `ArtifactMemoryPanelProps = Pick<AutopilotRightRailProps, "jobId" \| "locale">`                                                                                     | `jobId, locale`（ledger / replays / feedback 同样由 `BlueprintProgressPanel` 内 state 经 extra props 下传） |

### 关于 `extra props` 与 `callback` 的处理规则

Engineering / Artifact / RuntimeCapability / EffectPreview / PromptPackage 几个面板在 local function 形式下，**不仅**接收 `initialXxx` 初始数据，还接收一组 `onXxxChange` 回调（用于 `BlueprintProgressPanel` 内 state 的回写）。本 spec 的处理方式是：

- 把 `initialXxx` 与 `onXxxChange` **保留在面板 props 里**，但**不纳入** `AutopilotRightRailProps`；
- 面板 props 类型 = `Pick<AutopilotRightRailProps, ...>` + 一组**面板私有字段**（`initial*` / `on*Change`）；
- `BlueprintProgressPanel.tsx` 在组合时注入这些私有字段（这些 state 继续由它持有）；
- `<AutopilotRightRail>` 在 fabric stage 调用这些面板时，`initial*` / `on*Change` 可保持 `undefined`（面板内部对 undefined 有现成的降级路径，参见 local function 的当前实现）。

由此：

- `AutopilotRightRailProps` 保持 Spec 1 冻结契约；
- Spec 4 未来把 `initial* / on*Change` 上提到 `useAutopilotRightRailData` 时，只需要改 `BlueprintProgressPanel` 与 `<AutopilotRightRail>` 两处组合点，面板签名无需重写。

## 单面板抽离的标准套路

以 `EffectPreviewPanel` 为例，其他 5 个内联面板与之同构：

1. **创建新文件** `client/src/pages/autopilot/right-rail/panels/EffectPreviewPanel.tsx`：
   - 粘贴 `BlueprintProgressPanel.tsx` 中 `EffectPreviewWorkbenchPanel` 的完整函数体；
   - 重命名为 `EffectPreviewPanel`；
   - 把签名改为 `EffectPreviewPanelProps`（见上表）+ 面板私有字段（`initialPreviews?`, `onPreviewsChange?`, `documents?`）；
   - 在函数体第一行派生 `const documents = props.documents ?? props.specTree?.documents ?? [];`，保持与原 local function 内部 `documents` 的语义一致；
   - 保留所有 `useMemo`、`useState`、`useEffect`、`useCallback` 的依赖数组与语义；
   - 保留所有 className / testid / 文案 key。
2. **更新 barrel** `autopilot/right-rail/panels/index.ts`：新增 `export { EffectPreviewPanel, type EffectPreviewPanelProps } from "./EffectPreviewPanel";`。
3. **替换 `BlueprintProgressPanel.tsx`**：
   - 删除 local function `EffectPreviewWorkbenchPanel` 定义；
   - 在顶部添加 `import { EffectPreviewPanel } from "@/pages/autopilot/right-rail/panels";`；
   - 把原调用处 `<EffectPreviewWorkbenchPanel documents={...} specTree={...} .../>` 替换为 `<EffectPreviewPanel specTree={...} job={...} jobId={...} effectPreviews={...} agentCrew={...} capabilityEvidence={...} locale={...} initialPreviews={...} onPreviewsChange={...} documents={...} />`。
4. **更新 shim** `client/src/pages/specs/panels/EffectPreviewPanel.tsx`：
   - 删除 `EFFECT_PREVIEW_PANEL_PLACEHOLDER` 常量；
   - 写入 `export { EffectPreviewPanel } from "@/pages/autopilot/right-rail/panels/EffectPreviewPanel";`；
   - 同时在 `specs/panels/index.ts` 中把原 `EFFECT_PREVIEW_PANEL_PLACEHOLDER` 改为 `export { EffectPreviewPanel } from "./EffectPreviewPanel";`。
5. **扩展 `<AutopilotRightRail>`**：在 fabric stage switch 的 `case "effect_preview"` 分支里渲染 `<EffectPreviewPanel jobId={...} job={...} specTree={...} effectPreviews={...} agentCrew={...} capabilityEvidence={...} locale={...} />`；`initial* / on*Change` 留空。
6. **跑定向测试**：
   - `node --run check`
   - `npm exec vitest run client/src/pages/specs`
   - `npm exec vitest run client/src/pages/autopilot/right-rail`
   - 新增（见下文 PBT 与 parity 策略）。

### `SpecTreePanel` / `SpecDocumentsPanel` 特例

这两个 panel **不抽离现有实现**，只是 wrapper：

```tsx
// client/src/pages/autopilot/right-rail/panels/SpecTreePanel.tsx
import SpecTreeWorkbenchPanel from "@/pages/specs/SpecTreeWorkbenchPanel";
import type { AutopilotRightRailProps } from "@/pages/autopilot/right-rail/types";
import type {
  BlueprintSpecTree,
  BlueprintSpecTreeVersionSnapshot,
} from "@shared/blueprint/contracts";

export type SpecTreePanelProps = Pick<
  AutopilotRightRailProps,
  "jobId" | "specTree" | "selection" | "locale"
> & {
  versions?: BlueprintSpecTreeVersionSnapshot[] | null;
  onSpecTreeChange?: (specTree: BlueprintSpecTree) => void;
  onSpecTreeVersionsChange?: (versions: BlueprintSpecTreeVersionSnapshot[]) => void;
};

export function SpecTreePanel({
  jobId,
  specTree,
  selection,
  locale: _locale, // 保留字段以满足 narrowing；现有 SpecTreeWorkbenchPanel 不消费
  versions,
  onSpecTreeChange,
  onSpecTreeVersionsChange,
}: SpecTreePanelProps) {
  if (!specTree) {
    return /* 与 BlueprintProgressPanel 当前在 specTree===null 时的 DOM 完全一致 */;
  }
  return (
    <SpecTreeWorkbenchPanel
      specTree={specTree}
      selection={selection}
      jobId={jobId ?? undefined}
      versions={versions ?? undefined}
      onSpecTreeChange={onSpecTreeChange}
      onSpecTreeVersionsChange={onSpecTreeVersionsChange}
    />
  );
}
```

`SpecDocumentsPanel` 同构：wrap `SpecDocumentWorkbenchPanel`。

## 兼容性矩阵

| 消费入口                                              | 本 spec 前                                                               | 本 spec 过程中                                                                             | 本 spec 完成后                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `/specs`（`SpecCenterPage.tsx` → `BlueprintProgressPanel`） | 完整工作台 DOM，由 6 个 local function + 2 个外部 panel 组成             | 每一次单面板抽离合入后，`BlueprintProgressPanel` 改为 import 新 canonical panel，DOM 保持不变 | `BlueprintProgressPanel` 成为组合组件，DOM 与本 spec 前**逐字符相等**                       |
| `AutopilotRoutePage.tsx` 底部 `autopilot-advanced-workbenches` 折叠区 | 展开后渲染完整 `<BlueprintProgressPanel autoLoad={false} .../>`        | 同上                                                                                       | 完全保留；`<details>` 与 testid 不删除                                                     |
| `<AutopilotRightRail>`（Spec 1 scaffolding）          | 在 fabric stage 下渲染 placeholder 区块                                  | 每抽离一个面板，该面板对应 sub-stage 从 placeholder 切换为真实面板                          | 在 fabric stage 下 switch 到 8 个 canonical panel，DOM 与 `BlueprintProgressPanel` 相应段一致 |
| `AutopilotWorkflowRail`（左栏）                        | 5 个 stage 步骤条                                                        | 不变                                                                                       | 不变                                                                                       |
| `SpecTreeWorkbenchPanel.tsx` 原有外部消费者（如果有） | 直接 import `@/pages/specs/SpecTreeWorkbenchPanel`                       | 不变                                                                                       | 不变（wrapper 只是新增入口，原入口继续可用）                                               |
| `SpecDocumentWorkbenchPanel.tsx` 原有外部消费者        | 直接 import `@/pages/specs/SpecDocumentWorkbenchPanel`                   | 不变                                                                                       | 不变                                                                                       |
| `@/pages/specs/panels/*` 历史 import 路径              | 返回字符串常量或 SpecTree/Document 旧 re-export                          | 随每次抽离逐步转为 canonical re-export                                                     | 全部为单行 re-export，调用方零改动                                                         |
| `@/lib/blueprint-api` fetch 签名                       | 由 `BlueprintProgressPanel.autoLoad` 调用                                | 不变                                                                                       | 不变（Spec 4 负责上提）                                                                    |
| 后端 REST / Socket / `BlueprintGenerationJob` 字段     | 当前契约                                                                 | 不变                                                                                       | 不变                                                                                       |

## 迁移顺序（单面板独立 PR）

建议顺序（每个任务对应 `tasks.md` 中一个独立任务）：

1. `AgentCrewFabricPanel` — 纯 UI，无 fetch 回调，最安全，作为样板
2. `SpecTreePanel` — wrapper，逻辑最轻
3. `SpecDocumentsPanel` — wrapper，同上
4. `EffectPreviewPanel` — 有 `onPreviewsChange` 回调，但数据相对独立
5. `PromptPackagePanel` — 依赖 `effectPreviews`（已抽离），降风险
6. `RuntimeCapabilityPanel` — 回调最多，但数据与 agentCrew 关联清晰
7. `EngineeringHandoffPanel` — 依赖 `promptPackages`（已抽离）与 `runs / plans`
8. `ArtifactMemoryPanel` — 独立，但需要注意 diff / feedback 子状态较多

每个 PR 的边界：

- **新增**：`autopilot/right-rail/panels/<Name>Panel.tsx`、更新 `autopilot/right-rail/panels/index.ts`
- **修改**：`BlueprintProgressPanel.tsx`（删 local function + 加 import + 改调用点）
- **修改**：`specs/panels/<Name>Panel.tsx`（字符串占位 → 单行 re-export）、`specs/panels/index.ts`（barrel 更新）
- **扩展**：`autopilot/right-rail/AutopilotRightRail.tsx`（switch 中对应 case 从 placeholder 改为真实面板）

合入任意一个 PR 后，main 必须保持：

- `node --run check` 通过
- `npm exec vitest run client/src/pages/specs` 通过
- `npm exec vitest run client/src/pages/autopilot/right-rail` 通过

## 正确性性质（PBT 候选）

本 spec 的面板抽离本质是**行为等价重构**，PBT 的重点是守护「重构期间不引入语义漂移」。3 条候选：

### P1 — Props slice narrowing（property）

对任意合法的 `AutopilotRightRailProps` 对象（由 fast-check arbitrary 生成），对于每一个 canonical panel `P ∈ {AgentCrewFabricPanel, SpecTreePanel, SpecDocumentsPanel, EffectPreviewPanel, PromptPackagePanel, RuntimeCapabilityPanel, EngineeringHandoffPanel, ArtifactMemoryPanel}`：

- `Object.keys(narrowPropsFor(P, fullProps))` **严格等于** 设计文档「面板抽离总表」中列出的字段集；
- `narrowPropsFor(P, fullProps)` 中每个字段的值 `===` `fullProps` 中对应字段（引用相等）；
- 不存在 `undefined` 泄漏（即若原 props 中该字段为 `null`，narrow 后仍为 `null`，不变为 `undefined`）；
- 不存在额外字段（即 narrow 结果不含 `onSubStageChange` 等非该 panel 字段）。

实现形式：在 `autopilot/right-rail/panels/__tests__/props-narrowing.property.test.ts` 中定义一个纯函数 `narrowPropsFor(panelKey, fullProps)`（供测试内部使用，不进 barrel），并对其做 `fast-check` 断言。

### P2 — Shim identity（edge-case）

对每一个 8 个面板，断言 `specs/panels/<Name>Panel.tsx` re-export 的组件**引用相等**于 `autopilot/right-rail/panels/<Name>Panel.tsx` 原始导出：

```ts
import * as shim from "@/pages/specs/panels/EffectPreviewPanel";
import * as canonical from "@/pages/autopilot/right-rail/panels/EffectPreviewPanel";

expect(shim.EffectPreviewPanel).toBe(canonical.EffectPreviewPanel);
```

这条测试**不是** PBT，但用来阻止未来有人在 shim 里「顺手包一层」导致 identity 漂移。

### P3 — Rendering parity（edge-case / snapshot）

在 `autopilot/right-rail/panels/__tests__/rendering-parity.test.tsx` 中：

1. 准备一组固定 fixture（`job`, `routeSet`, `selection`, `specTree`, `agentCrew`, `capabilities`, `capabilityInvocations`, `capabilityEvidence`, `effectPreviews`）。
2. 分别渲染：
   - `<BlueprintProgressPanel autoLoad={false} initialJob={job} initialSpecTree={specTree} .../>`
   - `<AutopilotRightRail jobId={job.id} currentStage="fabric" currentSubStage={sub} job={job} .../>` 遍历 8 个 `sub`。
3. 提取两边 DOM 中所有 `[data-testid]` 节点的 testid 列表，断言：`AutopilotRightRail` 在 `sub === X` 下的 testid 集合 **⊆** `BlueprintProgressPanel` 展开对应段时的 testid 集合，并且没有**新增** testid（集合 ⊇）。
4. 同时断言两边对应 testid 节点的 `className` 与 `textContent` 逐字符相等（对 `EngineeringHandoffPanel` / `ArtifactMemoryPanel` 可选放宽为 `className` 相等）。

> 定位为 **edge-case / snapshot**，不是通用 property；因为 fixture 需要贴近真实数据才能触达面板各分支，不适合由 fast-check 随机生成。

## 决策记录

1. **为什么不直接把 `SpecTreeWorkbenchPanel` / `SpecDocumentWorkbenchPanel` 迁移到 `autopilot/right-rail/panels/`？**
   - 这两个文件已经是外部独立文件，不是内联 local function，搬运它们会带来大量 import 路径迁移（测试、history、其他消费者），本 spec 的价值是「物理抽离 local function」，不承担「重新组织已有外部组件的目录归属」。
   - wrapper 模式让 `AutopilotRightRailProps` 的窄化 slice 可以优雅转接，同时保留既有外部消费路径零改动。

2. **为什么 `EngineeringHandoffPanel` / `ArtifactMemoryPanel` 的窄化 slice 只保留 `{ jobId, locale }`？**
   - 这两个面板的数据（`plans`, `runs`, `ledger`, `replays`, `feedback`, `promptPackages`）当前**只存在于** `BlueprintProgressPanel` 的 state 中，没有被上提到 `AutopilotRightRailProps`。
   - 本 spec 的硬约束是「不扩 `AutopilotRightRailProps`」；Spec 4 `useAutopilotRightRailData` 负责把它们上提。
   - 因此在组合期，`BlueprintProgressPanel` 继续通过**面板私有 prop**（`initialPlans`, `initialRuns`, `onLandingPlansChange`, ...）注入，`<AutopilotRightRail>` 在 fabric stage 调用时传 `undefined`，面板内部对 undefined 降级逻辑保留。

3. **为什么 `EngineeringLandingPanel` 改名 `EngineeringHandoffPanel`？**
   - `AutopilotRailSubStage` 的枚举值是 `"engineering_handoff"`（Spec 1 冻结），本 spec 统一组件命名到契约；
   - `specs/panels/EngineeringLandingPanel.tsx` shim 中同时 re-export 新旧命名（`EngineeringLandingPanel` 作为 alias），避免历史 import 失效。

4. **为什么不一次性抽 8 个面板？**
   - 每个 local function 行数在 300~900 行，合并为一个巨型 PR 会导致 review 难度指数级上升；
   - 单面板 PR 的 diff 清晰：`BlueprintProgressPanel` 删除一个函数 + 加一个 import + 改一个调用点，外部 panel 新增一个文件 + 一个 shim 改动；
   - 单面板 PR 可独立 `git revert`，回滚成本可控。

5. **为什么 `_shared/` 目录可选？**
   - 大部分 local function 使用的 helper（`parseWorkbenchLines`, `readLatestAgentCrew`, `blueprintCopy`, `panelText`）已经在文件顶层或外部模块中；
   - 只有少数 helper（如 `BlueprintClarificationStrategySummary` local component）可能被多个面板引用，届时放入 `_shared/` 避免跨面板 import；
   - 若 8 次抽离过程中发现没有共享，则 `_shared/` 目录不创建。

## 可访问性与 i18n

本 spec **不引入新的 a11y 或 i18n 合同**；所有文案仍通过现有 `blueprintCopy(...)` / `panelText(zh, en)` 产生，`aria-*` / `role` 属性逐字保留。

Spec 1 已冻结 `<AutopilotRightRail>` 本体的 `aria-label` 规则，本 spec 不修改。

## 非目标

- 本 spec 不优化任何面板的视觉、动效、空态。
- 本 spec 不改写面板内部的 fetch / state 语义。
- 本 spec 不为移动端提供新布局。
- 本 spec 不新增 e2e 测试；仅补充 PBT 与 parity edge-case 测试。
- 本 spec 不修改 `AutopilotWorkflowRail` 的左栏 step 渲染。

## 迁移完成后的文件大小预估（仅供参考）

- `BlueprintProgressPanel.tsx`：从 ~5700 行压缩到 ~1500~2000 行（保留 state + fetch + 组合渲染）。
- `autopilot/right-rail/panels/` 合计：~3500~4000 行，每个面板 300~900 行，与当前 local function 行数匹配。
- `specs/panels/*` shim：每个文件 1~5 行。
