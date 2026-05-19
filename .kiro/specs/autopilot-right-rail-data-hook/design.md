# 设计文档：Autopilot 右栏数据层 Hook 化与合并

## 设计概述

本 spec 新增一个 React hook `useAutopilotRightRailData(jobId, options): RightRailDataView`，把当前散落在 `AutopilotRoutePage.tsx`（5 条 `useMemo(readAutopilot*(latestJob), [latestJob])` 派生）、`BlueprintProgressPanel.tsx`（顶层 autoLoad `fetchLatestBlueprintGenerationJob + fetchBlueprintSpecsProgress`）、以及 Spec 2 已抽离的 8 个 canonical 面板内部 `useEffect(fetchBlueprint*(jobId), [jobId])` bootstrap 合并为一处 fetch orchestration + 局部 cache。hook 的 canonical 位置是 `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts`；`client/src/pages/specs/hooks/use-blueprint-progress-data.ts` 改写为对 canonical hook 的单行 re-export shim。

接入策略采用 **Phase A 向后兼容**：`AutopilotRoutePage` 直接消费 hook 并把返回值拼装成 `<AutopilotRightRail>` 的 9 个 props；`BlueprintProgressPanel` 保留 `initial*` / `on*Change` / `autoLoad` / `show*` 等历史 props，内部移除 per-面板的 autoLoad fetch 与 `useEffect` bootstrap，改由 hook 统一驱动，但仍把结果以 `initial*` 形态传递给 Spec 2 canonical 面板（canonical 面板签名 `Pick<AutopilotRightRailProps, ...>` + 面板私有字段完全不变）。

关键硬约束：

1. **不修改 Spec 1 冻结的 `AutopilotRightRailProps` 9 字段契约**。hook 的 `RightRailDataView` 扩展 6 个下游字段（`promptPackages / landingPlans / engineeringRuns / artifactEntries / artifactReplays / artifactFeedback`），但 `<AutopilotRightRail>` 的 props 仍然是 Spec 1 的 9 个字段。
2. **不修改 Spec 2 canonical 面板签名**。面板仍然只接收 `Pick<AutopilotRightRailProps, ...>` + 面板私有字段（`initial*` / `on*Change` / `documents`），hook 作为数据源出现在调用点（`AutopilotRoutePage` 与 `BlueprintProgressPanel`）。
3. **不修改 Spec 3 的 fabric 接管结论**。`<AutopilotRightRail>` 仍在 `currentStage === "fabric"` 时接管 400px 右列，`AutopilotSpecTreeHandoffPanel` 次级 `/specs` 链接不变；本 spec 不触碰 Spec 3 的 `AutopilotWorkflowRail` fabric 分支 DOM 结构。
4. **不读写 `useAppStore` / `useProjectStore`**。hook 是纯粹 React hook + AbortController + 可选 `EventSource`。
5. **不新增后端契约**。hook 只复用 `@/lib/blueprint-api` 现有 9 个 fetch 函数与 `fetchBlueprintJobEventStreamUrl` SSE URL；`artifactFeedback` 从 `BlueprintArtifactReplaysResponse.artifactFeedback` 切片派生（已经是 `@/lib/blueprint-api` 中 `FetchBlueprintArtifactReplaysResult` 的字段）。
6. **不做 Spec 5 的工作**：URL `?sub=xxx`、sticky pin、自动滚动、键盘快捷键、`<md` 抽屉化由 Spec 5 处理。

---

## 当前架构 vs 目标架构

### Before（Spec 3 完成后、Spec 4 启动前）

```text
AutopilotRoutePage.tsx (fabric 分支)
├── useState<BlueprintGenerationJob | null> latestJob
├── useState<BlueprintRouteSet | null>      routeSet
├── useState<BlueprintRouteSelection | null> selection
├── useState<BlueprintSpecTree | null>      specTree
├── useMemo(() => readAutopilotAgentCrew(latestJob), [latestJob])           autopilotAgentCrew
├── useMemo(() => readAutopilotCapabilities(latestJob), [latestJob])        autopilotCapabilities
├── useMemo(() => readAutopilotCapabilityInvocations(latestJob), [...])     autopilotCapabilityInvocations
├── useMemo(() => readAutopilotCapabilityEvidence(latestJob), [...])        autopilotCapabilityEvidence
├── useMemo(() => readAutopilotEffectPreviews(latestJob), [latestJob])      autopilotEffectPreviews
└── 传给 AutopilotWorkflowRail → fabric 分支 → <AutopilotRightRail />

BlueprintProgressPanel.tsx
├── props.initialJob/initialRouteSet/...
├── props.autoLoad (/specs 路径=true)
├── useEffect(
│     if (autoLoad) Promise.all([
│       fetchBlueprintSpecsProgress(),
│       fetchLatestBlueprintGenerationJob(),
│     ])
│   , [autoLoad])
├── per-面板内部（Spec 2 后仍在 panel 层）
│   ├── EffectPreviewPanel  → useEffect(() => fetchBlueprintEffectPreviews(jobId))
│   ├── PromptPackagePanel  → useEffect(() => fetchBlueprintPromptPackages(jobId))
│   ├── RuntimeCapabilityPanel → useEffect(() => Promise.all([
│   │    fetchBlueprintCapabilities(),
│   │    fetchBlueprintJobCapabilities(jobId),
│   │    fetchBlueprintCapabilityInvocations(jobId),
│   │    fetchBlueprintCapabilityEvidence(jobId),
│   │  ]))
│   ├── EngineeringHandoffPanel → useEffect(() => Promise.all([
│   │    fetchBlueprintEngineeringLanding(jobId),
│   │    fetchBlueprintEngineeringRuns(jobId),
│   │  ]))
│   └── ArtifactMemoryPanel → useEffect(() => Promise.all([
│        fetchBlueprintArtifactLedger(jobId),
│        fetchBlueprintArtifactReplays(jobId),
│      ]))
└── render 8 个 canonical panel，通过 initial* / on*Change 桥接
```

问题：

- fetch 分布在至少 3 处（`BlueprintProgressPanel` 顶层 autoLoad、5 个 panel 内部 bootstrap、`AutopilotRoutePage` 的 `useMemo` 派生），无并发合并、无 dedupe、无 stage-driven refetch。
- `AutopilotRoutePage` 的 `useMemo(readAutopilot*(latestJob))` 只是把 `latestJob` 结构字段派生出来；它不是 fetch，而是**结构展开**。合并到 hook 后应当由 hook 返回 `job` + 派生 `agentCrew / capabilities / ...` 字段。

### After（Spec 4 完成后）

```text
client/src/pages/autopilot/right-rail/hooks/
├── use-autopilot-right-rail-data.ts    ← Canonical_Hook（本 spec 新增）
└── __tests__/
    ├── use-autopilot-right-rail-data.test.ts               ← unit
    └── use-autopilot-right-rail-data.property.test.ts      ← fast-check PBT

client/src/pages/specs/hooks/
└── use-blueprint-progress-data.ts       ← Shim，单行 re-export Canonical_Hook

AutopilotRoutePage.tsx (fabric 分支)
├── const view = useAutopilotRightRailData(latestJob?.id ?? "", {
│     initialData: { job: latestJob, routeSet, selection, specTree, ... },
│     currentSubStage,
│     onJobStageChange: handleStageChange,
│   })
├── 用 view.job.data / view.agentCrew.data / ... 装配
└── <AutopilotRightRail jobId={view.job.data?.id ?? ""} job={view.job.data} ... />

BlueprintProgressPanel.tsx
├── Phase A: const view = useAutopilotRightRailData(effectiveJobId, {
│     initialData: pickInitials(props),
│     skipLazyLoad: props.autoLoad === true,
│     onEffectPreviewsChange: props.onPreviewsChange,
│     onPromptPackagesChange: props.onPackagesChange,
│     ...
│   })
├── 删除 per-面板 useEffect fetch bootstrap
├── 删除顶层 autoLoad useEffect（fetchBlueprintSpecsProgress / fetchLatest...）
├── 保留 initial* / on*Change / show* props 以兼容外部
└── render 8 个 canonical panel，传入 view.XXX.data + initial*/on*Change 桥接
```

---

## 接线点详细说明

### AutopilotRoutePage 接入点

位于 `client/src/pages/autopilot/AutopilotRoutePage.tsx`。当前文件 ~2200 行左右持有 `latestJob / routeSet / selection / specTree / autopilotAgentCrew / autopilotCapabilities / autopilotCapabilityInvocations / autopilotCapabilityEvidence / autopilotEffectPreviews` 的 state/memo。

Phase A 接入策略：

1. **保留** 现有 `useState` / `useEffect` 链路负责 `input / clarification / routeset / selection` 四阶段（`createBlueprintIntake / createBlueprintClarificationSession / saveBlueprintClarificationAnswers / createBlueprintGenerationJob / selectBlueprintRoute` 等写请求仍在本文件）。
2. **新增** 在 `fabric` 阶段的「派生层」调用 hook：

   ```tsx
   const currentSubStage = useMemo(
     () =>
       resolveRailSubStage({
         currentStage: "fabric",
         job: latestJob,
         selection,
         specTree,
         agentCrew: autopilotAgentCrew,
       }),
     [latestJob, selection, specTree, autopilotAgentCrew],
   );

   const view = useAutopilotRightRailData(latestJob?.id ?? "", {
     initialData: {
       job: latestJob,
       routeSet,
       selection,
       specTree,
       agentCrew: autopilotAgentCrew,
       capabilities: autopilotCapabilities,
       capabilityInvocations: autopilotCapabilityInvocations,
       capabilityEvidence: autopilotCapabilityEvidence,
       effectPreviews: autopilotEffectPreviews,
     },
     currentSubStage,
     onJobStageChange: (next) => {
       // 可选：根据新 stage 推进 flowSteps 高亮，本 spec 不强制实现
     },
   });
   ```

3. **替换** `<AutopilotRightRail>` 的 9 个 props 来源：

   ```tsx
   <AutopilotRightRail
     jobId={view.job.data?.id ?? ""}
     currentStage="fabric"
     currentSubStage={currentSubStage}
     job={view.job.data}
     routeSet={view.routeSet.data}
     selection={view.selection.data}
     specTree={view.specTree.data}
     agentCrew={view.agentCrew.data}
     capabilities={view.capabilities.data ?? []}
     capabilityInvocations={view.capabilityInvocations.data ?? []}
     capabilityEvidence={view.capabilityEvidence.data ?? []}
     effectPreviews={view.effectPreviews.data ?? []}
     locale={locale}
     onSubStageChange={() => {}} // Spec 5 会替换为 URL 同步
   />
   ```

4. **弃用** 5 条 `useMemo(readAutopilot*(latestJob))` 派生规则（由 hook 返回值替代），或保留这些 helper 函数作为 hook 内部实现的一部分（见下文「hook 内部实现」）。

### BlueprintProgressPanel 接入点

位于 `client/src/pages/specs/BlueprintProgressPanel.tsx`。Spec 2 完成后该文件 ~1500-2000 行，作为组合组件继续由 `SpecCenterPage`（`/specs` 路径）调用。

Phase A 接入策略：

1. **保留** 现有 props 接口不变：`initialJob / initialRouteSet / initialSelection / initialSpecTree / initialEffectPreviews / initialCapabilities / initialAgentCrew / initialClarificationSession / initialCapabilityInvocations / initialCapabilityEvidence / autoLoad / show*` + 一组 `onXXXChange` 回调。
2. **新增** 在组件顶部调用 hook：

   ```tsx
   const effectiveJobId = initialJob?.id ?? "";
   const view = useAutopilotRightRailData(effectiveJobId, {
     initialData: pickInitialsFromProps(props), // 把 initial* 映射到 initialData
     skipLazyLoad: autoLoad === true,
     currentSubStage: undefined, // /specs 不走懒加载 gate
     onEffectPreviewsChange: onPreviewsChange,
     onPromptPackagesChange: onPackagesChange,
     onLandingPlansChange: onLandingPlansChange,
     onEngineeringRunsChange: onEngineeringRunsChange,
     onArtifactEntriesChange: onLedgerEntriesChange, // 若原组件有此回调
     onArtifactReplaysChange: onReplaysChange,
     onArtifactFeedbackChange: onFeedbackChange,
   });
   ```

3. **删除** 以下原有 `useEffect` 及其伴随 state：
   - 顶层 `autoLoad` 路径的 `Promise.all([fetchBlueprintSpecsProgress, fetchLatestBlueprintGenerationJob])`（~行 5380-5450）。
   - 各面板内部的 `useEffect(() => fetchBlueprint*(jobId), [jobId])`（已由 Spec 2 抽到 canonical 面板签名外部的「面板私有字段 `initial*`」桥接，Spec 4 把这些桥接由 hook 直接驱动）。
4. **保留** canonical 面板调用处的 props 形态；把 hook 返回的 data 映射到原 `initialXxx` + `onXxxChange` 对：

   ```tsx
   <EffectPreviewPanel
     jobId={effectiveJobId}
     job={view.job.data}
     specTree={view.specTree.data}
     effectPreviews={view.effectPreviews.data ?? []}
     agentCrew={view.agentCrew.data}
     capabilityEvidence={view.capabilityEvidence.data ?? []}
     locale={locale}
     // 面板私有字段
     initialPreviews={view.effectPreviews.data ?? undefined}
     onPreviewsChange={(p) => {
       onPreviewsChange?.(p);
       // hook 不强制写回，允许通过 options.onEffectPreviewsChange 自动同步
     }}
     documents={view.specTree.data?.documents}
   />
   ```

5. **不改变** 8 个 canonical 面板本身（Spec 2 冻结）。

---

## 完整 TypeScript 类型定义

建议位置：`client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts`（或拆分为 `types.ts` 并 barrel re-export，具体看实现偏好）。

```ts
import type {
  BlueprintAgentCrewSnapshot,
  BlueprintArtifactFeedback,
  BlueprintArtifactLedgerEntry,
  BlueprintArtifactReplay,
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintEffectPreviewSnapshot,
  BlueprintEngineeringLandingPlan,
  BlueprintEngineeringRun,
  BlueprintGenerationJob,
  BlueprintPromptPackage,
  BlueprintRouteSelection,
  BlueprintRouteSet,
  BlueprintRuntimeCapability,
  BlueprintSpecTree,
} from "@shared/blueprint/contracts";
import type { ApiRequestError } from "@/lib/api-client";
import type { AutopilotRailSubStage } from "@/pages/autopilot/right-rail/types";

/** 单字段状态 */
export interface RightRailDataFieldStatus<T> {
  data: T | null;
  loading: boolean;
  error: ApiRequestError | null;
  retry: () => void;
}

/** Hook 返回值 */
export interface RightRailDataView {
  // Wave 1：顶层
  job: RightRailDataFieldStatus<BlueprintGenerationJob>;
  routeSet: RightRailDataFieldStatus<BlueprintRouteSet>;
  selection: RightRailDataFieldStatus<BlueprintRouteSelection>;
  specTree: RightRailDataFieldStatus<BlueprintSpecTree>;

  // Wave 2：fabric 基础
  agentCrew: RightRailDataFieldStatus<BlueprintAgentCrewSnapshot>;
  capabilities: RightRailDataFieldStatus<BlueprintRuntimeCapability[]>;
  capabilityInvocations: RightRailDataFieldStatus<BlueprintCapabilityInvocation[]>;
  capabilityEvidence: RightRailDataFieldStatus<BlueprintCapabilityEvidence[]>;

  // Wave 3：fabric 中层
  effectPreviews: RightRailDataFieldStatus<BlueprintEffectPreviewSnapshot[]>;
  promptPackages: RightRailDataFieldStatus<BlueprintPromptPackage[]>;
  landingPlans: RightRailDataFieldStatus<BlueprintEngineeringLandingPlan[]>;
  engineeringRuns: RightRailDataFieldStatus<BlueprintEngineeringRun[]>;

  // Wave 4：artifact
  artifactEntries: RightRailDataFieldStatus<BlueprintArtifactLedgerEntry[]>;
  artifactReplays: RightRailDataFieldStatus<BlueprintArtifactReplay[]>;
  artifactFeedback: RightRailDataFieldStatus<BlueprintArtifactFeedback[]>;
}

/** Hook options */
export interface UseAutopilotRightRailDataOptions {
  /** 初始 / 回退数据（来自 AutopilotRoutePage 现有 state 或 BlueprintProgressPanel initial* props） */
  initialData?: Partial<{
    job: BlueprintGenerationJob | null;
    routeSet: BlueprintRouteSet | null;
    selection: BlueprintRouteSelection | null;
    specTree: BlueprintSpecTree | null;
    agentCrew: BlueprintAgentCrewSnapshot | null;
    capabilities: BlueprintRuntimeCapability[];
    capabilityInvocations: BlueprintCapabilityInvocation[];
    capabilityEvidence: BlueprintCapabilityEvidence[];
    effectPreviews: BlueprintEffectPreviewSnapshot[];
    promptPackages: BlueprintPromptPackage[];
    landingPlans: BlueprintEngineeringLandingPlan[];
    engineeringRuns: BlueprintEngineeringRun[];
    artifactEntries: BlueprintArtifactLedgerEntry[];
    artifactReplays: BlueprintArtifactReplay[];
    artifactFeedback: BlueprintArtifactFeedback[];
  }>;

  /** 当前 fabric 子阶段；驱动懒加载 gate。若 undefined，hook 内部调用 resolveRailSubStage 兜底 */
  currentSubStage?: AutopilotRailSubStage;

  /** true 时跳过懒加载门限，Wave 1-4 全量发起（供 /specs 路径 autoLoad=true 使用） */
  skipLazyLoad?: boolean;

  /** SSE 不可用或显式禁用时的 polling 间隔；0 或负数禁用 SSE+polling */
  pollingIntervalMs?: number;

  /** job.stage 变化回调（SSE 或 polling 检测到） */
  onJobStageChange?: (
    next: BlueprintGenerationJob["stage"],
    prev: BlueprintGenerationJob["stage"] | null,
  ) => void;

  /** per-field fetch 失败时的回调 */
  onFieldError?: (field: keyof RightRailDataView, error: ApiRequestError) => void;

  /** per-field 写回回调（当 fetch 成功或 consumer 旁路写回时触发） */
  onJobChange?: (next: BlueprintGenerationJob | null) => void;
  onRouteSetChange?: (next: BlueprintRouteSet | null) => void;
  onSelectionChange?: (next: BlueprintRouteSelection | null) => void;
  onSpecTreeChange?: (next: BlueprintSpecTree | null) => void;
  onAgentCrewChange?: (next: BlueprintAgentCrewSnapshot | null) => void;
  onCapabilitiesChange?: (next: BlueprintRuntimeCapability[]) => void;
  onCapabilityInvocationsChange?: (next: BlueprintCapabilityInvocation[]) => void;
  onCapabilityEvidenceChange?: (next: BlueprintCapabilityEvidence[]) => void;
  onEffectPreviewsChange?: (next: BlueprintEffectPreviewSnapshot[]) => void;
  onPromptPackagesChange?: (next: BlueprintPromptPackage[]) => void;
  onLandingPlansChange?: (next: BlueprintEngineeringLandingPlan[]) => void;
  onEngineeringRunsChange?: (next: BlueprintEngineeringRun[]) => void;
  onArtifactEntriesChange?: (next: BlueprintArtifactLedgerEntry[]) => void;
  onArtifactReplaysChange?: (next: BlueprintArtifactReplay[]) => void;
  onArtifactFeedbackChange?: (next: BlueprintArtifactFeedback[]) => void;
}

export function useAutopilotRightRailData(
  jobId: string,
  options?: UseAutopilotRightRailDataOptions,
): RightRailDataView;
```

---

## Fetch orchestration 细节

### Wave 分组与初始触发

hook 在 `jobId` 非空且未被 `skipLazyLoad === false` 规则 gate 掉时，按以下 Wave 并发发起 fetch：

| Wave | 字段 | 对应 `@/lib/blueprint-api` fetch | 触发条件 |
| ---- | ---- | ---------------------------------- | -------- |
| W1 | `job` | `fetchLatestBlueprintGenerationJob()` 若 `initialData.job` 缺失；否则跳过首次 fetch，仅建立 cache 指针 | `jobId` 非空；始终 |
| W1 | `routeSet` | 从 `job.routeSet` 派生（`readAutopilotRouteSet(job)`），**不发起独立 fetch**（后端语义上 routeSet 是 job 的子字段） | 始终 |
| W1 | `selection` | 从 `job.selection` 派生 | 始终 |
| W1 | `specTree` | 从 `job.specTree` 派生 | 始终 |
| W2 | `agentCrew` | 从 `job.agentCrew` 派生（`readAutopilotAgentCrew(job)`） | `currentSubStage` 存在（即 fabric 阶段） |
| W2 | `capabilities` | `Promise.all([fetchBlueprintCapabilities(), fetchBlueprintJobCapabilities(jobId)])`，合并 registry + job 列表（规则复用 `BlueprintProgressPanel` 现有的 registry-first 合并） | `currentSubStage` 存在 |
| W2 | `capabilityInvocations` | `fetchBlueprintCapabilityInvocations(jobId)` | `currentSubStage` 存在 |
| W2 | `capabilityEvidence` | `fetchBlueprintCapabilityEvidence(jobId)` | `currentSubStage` 存在 |
| W3 | `effectPreviews` | `fetchBlueprintEffectPreviews(jobId)` | `currentSubStage ∈ { effect_preview, prompt_package, runtime_capability, engineering_handoff, artifact_memory }` 或 `job.stage` 满足对应条件 |
| W3 | `promptPackages` | `fetchBlueprintPromptPackages(jobId)` | `currentSubStage ∈ { prompt_package, runtime_capability, engineering_handoff, artifact_memory }` 或 `job.stage ∈ { prompt_packaging, runtime_capability, engineering_handoff, engineering_landing }` |
| W3 | `landingPlans` | `fetchBlueprintEngineeringLanding(jobId)` | `currentSubStage ∈ { engineering_handoff, artifact_memory }` 或 `job.stage ∈ { engineering_handoff, engineering_landing }` |
| W3 | `engineeringRuns` | `fetchBlueprintEngineeringRuns(jobId)` | 同上 |
| W4 | `artifactEntries` | `fetchBlueprintArtifactLedger(jobId)` | `currentSubStage === "artifact_memory"` 或 `job.stage === "engineering_landing"` |
| W4 | `artifactReplays` | `fetchBlueprintArtifactReplays(jobId)` | 同上 |
| W4 | `artifactFeedback` | 从 `fetchBlueprintArtifactReplays(jobId)` 响应的 `artifactFeedback` 切片派生；或独立 key 指向 `artifactReplays` 同次响应中的 feedback 列表 | 同上 |

> `routeSet / selection / specTree / agentCrew` 不发起独立 fetch，而是从 `job` 响应派生。这与当前 `AutopilotRoutePage` 的 `useMemo(readAutopilot*(latestJob))` 语义一致；hook 内部把这些 helper 函数封装为派生规则，字段的 `loading = job.loading`、`error = job.error`、`retry = job.retry`（它们共享 W1 job 的生命周期）。

### Wave 并发实现

hook 内部采用分 Wave `Promise.allSettled`：

```ts
// 伪代码
useEffect(() => {
  if (!jobId) return;
  const ctrl = new AbortController();

  // Wave 1
  void runWave1(jobId, ctrl.signal);

  // Wave 2-4 按 Lazy_Load_Gate 触发（通过 jobStageOrSubStage 变化触发）

  return () => ctrl.abort();
}, [jobId]);

useEffect(() => {
  if (!jobId || !job) return;
  const ctrl = new AbortController();

  // Wave 2 gate
  if (shouldLoadWave2(currentSubStage, job.stage)) {
    void runWave2(jobId, ctrl.signal);
  }
  // Wave 3 gate
  if (shouldLoadWave3(currentSubStage, job.stage)) {
    void runWave3(jobId, ctrl.signal);
  }
  // Wave 4 gate
  if (shouldLoadWave4(currentSubStage, job.stage)) {
    void runWave4(jobId, ctrl.signal);
  }

  return () => ctrl.abort();
}, [jobId, job?.stage, currentSubStage, skipLazyLoad]);
```

每个 `runWaveN` 内部用 `Promise.allSettled` 收敛：

```ts
async function runWave3(jobId: string, signal: AbortSignal) {
  const results = await Promise.allSettled([
    shouldLoadWave3Field("effectPreviews") ? fetchBlueprintEffectPreviews(jobId) : null,
    shouldLoadWave3Field("promptPackages") ? fetchBlueprintPromptPackages(jobId) : null,
    shouldLoadWave3Field("landingPlans") ? fetchBlueprintEngineeringLanding(jobId) : null,
    shouldLoadWave3Field("engineeringRuns") ? fetchBlueprintEngineeringRuns(jobId) : null,
  ]);
  if (signal.aborted) return;
  applyFieldResult("effectPreviews", results[0]);
  applyFieldResult("promptPackages", results[1]);
  applyFieldResult("landingPlans", results[2]);
  applyFieldResult("engineeringRuns", results[3]);
}
```

### `jobId` 变化时的 cancel + reset

```ts
useEffect(() => {
  return () => {
    // 组件 unmount 或 jobId 变化时
    currentControllers.abort();
    closeSSE();
    clearPollingTimer();
  };
}, [jobId]);
```

`jobId` 变化时：

1. 所有 in-flight 请求通过 `AbortController.abort()` 取消。
2. 所有字段 `data` 立即重置为 `initialData?.[field] ?? null`（Requirement 4.2）。
3. 新 `jobId` 触发 W1 再运行。

### `jobId` 切回策略（P2 行为声明）

本 spec **显式声明**：在 `jobId` 序列 `[a, b, a]` 中，切回 `a` 时：

- **W1 `job` 始终重新发起**（确认最新 job 指针）。
- **W2-W4 的字段 cache 被复用**：如果在切离 `a` 之前已成功拉取过该字段，切回 `a` 时先以 cache 数据回显（`loading = false`, `data = cachedValue`），然后等待 W1 新 job 响应确认 stage 是否变化；若 stage 变化则触发 targeted refetch；若 stage 未变则保持 cache。
- 缓存 TTL：hook 不设置绝对过期时间；缓存生命周期与 hook 挂载生命周期绑定（`useRef<Map<jobId, CacheEntry>>` 在 hook 范围内存活）。组件 unmount 即清空。

此策略在 PBT P2 中被断言。

---

## Cache 内部实现：`useRef<Map>` vs `useReducer`

### 选项 A：`useRef<Map<jobId, CacheEntry>>` + `useState<RightRailDataView>`

```ts
const cacheRef = useRef<Map<string, RightRailDataCacheEntry>>(new Map());
const [view, setView] = useState<RightRailDataView>(buildInitialView(options.initialData));
```

- 优点：cache 与 React state 解耦；切换 `jobId` 时读 cache 快；cache 不随 state 变化触发 re-render。
- 缺点：`setView` 需要按字段 merge，代码路径分散。

### 选项 B：`useReducer<RightRailDataState, RightRailDataAction>`

```ts
const [state, dispatch] = useReducer(rightRailDataReducer, options.initialData, buildInitialState);
```

- 优点：字段 merge 规则集中在 reducer；Ignore_Stale_Policy 通过 action 的 `jobId` 比较实现；便于测试。
- 缺点：cache 必须放在 state 内，切换 `jobId` 时 cache 读写也走 dispatch，增加 1 次 render。

### 决策：选项 B（`useReducer`）

选项 B 的优势在本 spec 场景下更重要：

1. reducer 内部可以把「应用 fetch 结果」与「检查 stale `jobId`」集中表达：
   ```ts
   case "FETCH_FULFILLED": {
     if (action.jobId !== state.currentJobId) return state; // ignore stale
     return { ...state, fields: { ...state.fields, [action.field]: { ...action.result } } };
   }
   ```
2. PBT P3 (Race safety) 的断言逻辑在 reducer 测试中可以直接验证，无需 mount React。
3. `initialData` 可通过 reducer `init` 函数初始化，避免 `useState` + `useEffect` 双写。

使用 `useRef<Map>` 的场景退化为：存放 per-jobId 的历史 cache（用于 Requirement 4.3 切回 jobId 的复用），reducer 处理当前 `jobId` 的 state；切换 `jobId` 时 reducer 从 `cacheRef.current.get(newJobId)` 读取并 init。

两者共存的方案如下：

```ts
interface RightRailDataReducerState {
  currentJobId: string;
  fields: Record<keyof RightRailDataView, InternalFieldState<unknown>>;
}

interface InternalFieldState<T> {
  data: T | null;
  loading: boolean;
  error: ApiRequestError | null;
  pendingRequestId: number | null;  // 用于 Ignore_Stale_Policy
}

// reducer:
function rightRailDataReducer(state: RightRailDataReducerState, action: RightRailDataAction): RightRailDataReducerState {
  switch (action.type) {
    case "JOB_CHANGED": {
      // action.cachedFields 来自 cacheRef，可能是 partial
      return {
        currentJobId: action.jobId,
        fields: mergeInitialFields(action.initialData, action.cachedFields),
      };
    }
    case "FETCH_STARTED": {
      if (action.jobId !== state.currentJobId) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...state.fields[action.field],
            loading: true,
            pendingRequestId: action.requestId,
          },
        },
      };
    }
    case "FETCH_FULFILLED": {
      if (action.jobId !== state.currentJobId) return state;
      const field = state.fields[action.field];
      if (field.pendingRequestId !== action.requestId) return state; // ignore stale
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            data: action.data,
            loading: false,
            error: null,
            pendingRequestId: null,
          },
        },
      };
    }
    case "FETCH_REJECTED": {
      if (action.jobId !== state.currentJobId) return state;
      const field = state.fields[action.field];
      if (field.pendingRequestId !== action.requestId) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            data: field.data, // 保留 previousCache
            loading: false,
            error: action.error,
            pendingRequestId: null,
          },
        },
      };
    }
    // ...
  }
}
```

---

## 懒加载规则实现

```ts
function shouldLoadField(
  field: Exclude<keyof RightRailDataView, "job" | "routeSet" | "selection" | "specTree">,
  params: {
    currentSubStage: AutopilotRailSubStage | undefined;
    jobStage: BlueprintGenerationJob["stage"] | null;
    skipLazyLoad: boolean;
  },
): boolean {
  if (params.skipLazyLoad) return true;
  const { currentSubStage, jobStage } = params;
  switch (field) {
    case "agentCrew":
    case "capabilities":
    case "capabilityInvocations":
    case "capabilityEvidence":
      return Boolean(currentSubStage); // fabric 阶段即触发
    case "effectPreviews":
      return (
        currentSubStage === "effect_preview" ||
        currentSubStage === "prompt_package" ||
        currentSubStage === "runtime_capability" ||
        currentSubStage === "engineering_handoff" ||
        currentSubStage === "artifact_memory" ||
        (jobStage !== null && stagesAllowingEffectPreviews.has(jobStage))
      );
    case "promptPackages":
      return (
        currentSubStage === "prompt_package" ||
        currentSubStage === "runtime_capability" ||
        currentSubStage === "engineering_handoff" ||
        currentSubStage === "artifact_memory" ||
        (jobStage !== null && stagesAllowingPromptPackages.has(jobStage))
      );
    case "landingPlans":
    case "engineeringRuns":
      return (
        currentSubStage === "engineering_handoff" ||
        currentSubStage === "artifact_memory" ||
        (jobStage !== null && stagesAllowingEngineering.has(jobStage))
      );
    case "artifactEntries":
    case "artifactReplays":
    case "artifactFeedback":
      return currentSubStage === "artifact_memory" || jobStage === "engineering_landing";
    default:
      return false;
  }
}

const stagesAllowingEffectPreviews = new Set<BlueprintGenerationJob["stage"]>([
  "preview",
  "effect_preview",
  "prompt_packaging",
  "runtime_capability",
  "engineering_handoff",
  "engineering_landing",
]);
const stagesAllowingPromptPackages = new Set<BlueprintGenerationJob["stage"]>([
  "prompt_packaging",
  "runtime_capability",
  "engineering_handoff",
  "engineering_landing",
]);
const stagesAllowingEngineering = new Set<BlueprintGenerationJob["stage"]>([
  "engineering_handoff",
  "engineering_landing",
]);
```

---

## SSE / polling 实现

```ts
useEffect(() => {
  if (!jobId) return;
  if (options.pollingIntervalMs !== undefined && options.pollingIntervalMs <= 0) return;

  const url = fetchBlueprintJobEventStreamUrl(jobId);
  const source = new EventSource(url);
  let closed = false;
  let pollingTimer: number | undefined;
  let attempt = 0;

  source.addEventListener("message", (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      const nextStage = payload?.job?.stage ?? payload?.stage;
      if (nextStage && typeof nextStage === "string") {
        dispatch({ type: "JOB_STAGE_SSE", jobId, nextStage });
        // onJobStageChange 在 reducer 副作用之外通过 effect 触发
      }
    } catch {
      // ignore malformed payload
    }
  });

  source.addEventListener("error", () => {
    if (closed) return;
    if (source.readyState === EventSource.CLOSED) {
      source.close();
      startPolling();
    }
  });

  function startPolling() {
    const base = options.pollingIntervalMs ?? 15000;
    const interval = Math.min(base * Math.pow(2, attempt), 120000);
    pollingTimer = window.setTimeout(async () => {
      const result = await fetchLatestBlueprintGenerationJob();
      if (!result.ok) {
        attempt += 1;
        startPolling();
        return;
      }
      attempt = 0;
      // 以 job 刷新驱动后续 Wave
      dispatch({ type: "JOB_POLLED", jobId, job: result.data.job });
      startPolling();
    }, interval);
  }

  return () => {
    closed = true;
    source.close();
    if (pollingTimer) window.clearTimeout(pollingTimer);
  };
}, [jobId, options.pollingIntervalMs]);
```

---

## 与 BlueprintProgressPanel 的渐进式迁移

### Phase A（本 spec 范围）

| 文件 | 变更 |
| ---- | ---- |
| `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts` | 新增：Canonical_Hook 实现 |
| `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.test.ts` | 新增：unit 测试 |
| `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.property.test.ts` | 新增：fast-check PBT |
| `client/src/pages/autopilot/right-rail/index.ts` | 修改：新增 `export { useAutopilotRightRailData } from "./hooks/use-autopilot-right-rail-data";` |
| `client/src/pages/specs/hooks/use-blueprint-progress-data.ts` | 修改：占位字符串 → re-export shim |
| `client/src/pages/autopilot/AutopilotRoutePage.tsx` | 修改：fabric 阶段改为从 hook 消费；保留 input/clarification/routeset/selection 本地 state |
| `client/src/pages/specs/BlueprintProgressPanel.tsx` | 修改：顶部新增 hook 调用；删除 autoLoad `useEffect` + 各面板 bootstrap；保留 `initial*` / `on*Change` / `show*` props |
| `client/src/pages/autopilot/AutopilotRoutePage.test.tsx` | 按需修改：mock hook 以断言 props 线路；保留 Spec 3 已新增的 fold removal / selection→fabric 断言 |
| `client/src/pages/specs/BlueprintProgressPanel.test.tsx` | 按需修改：mock hook；保留 Spec 2 rendering-parity 断言 |

### Phase B（未来 spec，不在本 spec 范围）

- 移除 `BlueprintProgressPanel` 的 `initial*` props
- 让 8 个 canonical 面板直接从 hook 消费（而不是通过 `BlueprintProgressPanel` 作为中间层）
- 若 Spec 5 引入 `?sub=xxx` URL 同步，把 `onSubStageChange` 从 no-op 升级为实际写入

---

## 占位 Shim 升级

`client/src/pages/specs/hooks/use-blueprint-progress-data.ts`：

**Before**：

```ts
export const USE_BLUEPRINT_PROGRESS_DATA_PLACEHOLDER =
  "see client/src/pages/specs/BlueprintProgressPanel.tsx for the current fetch wiring";
```

**After**：

```ts
/**
 * Shim：historically `BlueprintProgressPanel` 内部聚合了 9 条 blueprint fetch 调用，
 * 自本 spec 起统一改由 `useAutopilotRightRailData` 承接。此文件保留为单行 re-export，
 * 兼容历史 import 路径；详细语义与类型请见：
 *   `@/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data`
 */
export {
  useAutopilotRightRailData as useBlueprintProgressData,
  type RightRailDataView,
  type RightRailDataFieldStatus,
  type UseAutopilotRightRailDataOptions,
} from "@/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data";
```

---

## 正确性性质（PBT 候选）

### P1 — Idempotent fetch dedupe（fast-check PBT）

**文件**：`client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.property.test.ts`

**生成器**：
- `jobId`: `fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)`
- `consumerCount`: `fc.integer({ min: 2, max: 5 })`

**策略**：
- 在 `beforeEach` 中 mock `@/lib/blueprint-api` 的 9 个 fetch 函数，每个 mock 用一个 `vi.fn()` 记录调用次数。
- 用 `@testing-library/react` 的 `renderHook` 配合一个包装组件，在同一 render cycle 内挂载 N 个 `useAutopilotRightRailData(jobId)` 消费者（通过循环 N 次 render 子组件实现）。
- 等待所有 `Promise.allSettled` settle（可通过 `act(async () => {})` + `waitFor`）。

**断言**：对每个 mock fetch counter，`counter.mock.calls.length === 1`（同一 jobId 在 Wave 内只发起一次）。

**numRuns**：`{ numRuns: 50 }`。

**失败样本最小化**：fast-check 默认 shrink；若失败，最小化会把 `consumerCount` 收到 `2`、`jobId` 收到单字符非空字符串，便于人工复现。

### P2 — Cache coherence on jobId change（fast-check PBT）

**文件**：同上

**生成器**：
- `jobIdSeq`: `fc.array(fc.constantFrom("a", "b", "c", "d"), { minLength: 4, maxLength: 8 })`

**策略**：
- mock 每个 `jobId` 的 fetch 响应为 `{ jobId, timestamp: incrementingCounter() }`（每次响应内容随调用时间变化）。
- 循环切换 hook 的 `jobId` 到序列中每个值，每次切换后 `await waitFor(() => expect(view.job.data?.id).toBe(currentJobId))`。
- 对每次切换，记录切换前后的 `view.job.data` / `view.specTree.data` 等。

**断言**：
- **不泄漏**：切换后首次 render 时 `view.job.data` 严格不等于上一个 `jobId` 的数据（可能为 `null` 或新 `jobId` 的 initial/cached data）。
- **cache 复用策略**：切回一个历史 `jobId`（假设 `a → b → a`）时：
  - `view.job.data.id === "a"` 最终 settle（W1 每次切换都会重拉 job，确认指针）。
  - 若 W2-W4 cache 仍在 hook 挂载生命周期内，`view.capabilities.data` 等 cache 字段的 fetch mock counter **没有增加**（即切回复用 cache，不重拉）。
  - 若 stage 在 cache 期间变化（通过 SSE mock 推进），则对应下游字段 counter +1。

**numRuns**：`{ numRuns: 50 }`。

### P3 — Race safety on rapid job.stage updates（fast-check PBT）

**文件**：同上

**生成器**：
- `stageSeq`: `fc.array(fc.constantFrom("spec_tree", "spec_docs", "prompt_packaging", "runtime_capability", "engineering_handoff", "engineering_landing"), { minLength: 2, maxLength: 5 })`
- `fetchDelays`: `fc.array(fc.integer({ min: 0, max: 100 }), { minLength: N, maxLength: N })`（N 对应 stage 转换次数 × 下游字段数，用于给 fetch mock 加随机延迟）

**策略**：
- mock SSE `EventSource`，在短时间内（`vi.useFakeTimers`）连续推送 `stageSeq` 中每个 stage 对应的 `{ job: { stage: ... } }` 事件。
- 给每个下游字段 fetch mock 加随机 `fetchDelays[i]` 延迟（通过 `Promise.all([sleep, mockResponse])`）。
- 快进 fake timer 到所有事件推完 + 所有 fetch settle。

**断言**：
- 最终 `view.promptPackages.data` 等字段的值来自 `stageSeq` 中**最后一个**使该字段满足懒加载阈值的 stage 对应的 mock 响应。
- reducer 的 `pendingRequestId` 机制保证：更早的 in-flight fetch resolve 时若 `pendingRequestId` 不匹配当前 state，action 被 ignore（reducer 内部 early return）。
- 通过检查 fetch mock 的 `call[i].args`（包含触发时的 `stage` 或 `requestId` 标签）与最终 `data` 的来源 stage 一致性，断言最后一次 win。

**numRuns**：`{ numRuns: 30 }`（由于涉及 fake timer + async settle，单次 run 较慢）。

---

## 非目标

- 不做乐观更新（optimistic UI）。
- 不做 offline 支持。
- 不做跨 `jobId` 的 request deduplication。
- 不支持 SSR。
- 不自动持久化 cache 到 `localStorage` / `sessionStorage`。
- 不处理 Spec 5 的 URL `?sub=xxx` 参数、sticky pin、自动滚动、键盘快捷键。
- 不处理 Spec 5 的 `<md` 抽屉化布局。
- 不修改 `shared/blueprint/contracts.ts`、`server/routes/blueprint.ts` 或任何后端 DTO。
- 不修改 Spec 1 冻结的 `AutopilotRightRailProps`。
- 不修改 Spec 2 canonical 面板签名。
- 不修改 Spec 3 fabric 接管结构或 `AutopilotSpecTreeHandoffPanel` 次级链接。

---

## 回滚

本 spec 所有改动局限于以下文件集合（Requirement 12.7）：

- 新增：
  - `client/src/pages/autopilot/right-rail/hooks/use-autopilot-right-rail-data.ts`
  - `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.test.ts`
  - `client/src/pages/autopilot/right-rail/hooks/__tests__/use-autopilot-right-rail-data.property.test.ts`
  - 可选：`client/src/pages/autopilot/right-rail/hooks/index.ts`（barrel）
- 修改：
  - `client/src/pages/autopilot/right-rail/index.ts`
  - `client/src/pages/specs/hooks/use-blueprint-progress-data.ts`
  - `client/src/pages/autopilot/AutopilotRoutePage.tsx`
  - `client/src/pages/specs/BlueprintProgressPanel.tsx`
  - 相关测试文件（`AutopilotRoutePage.test.tsx` / `BlueprintProgressPanel.test.tsx`）

回滚方式：`git revert` 本 spec 的合入 commit。Spec 1/2/3 的产物（`right-rail/` 契约、canonical 面板、fabric 接管、fold 删除）不受影响，`BlueprintProgressPanel` 会恢复为顶层 autoLoad + per-面板 bootstrap 的旧形态。

---

## 与后续 spec 的衔接

- **Spec 5 `autopilot-step-driven-rail-navigation`**：
  - Spec 4 的 `onSubStageChange: () => {}` no-op 会被 Spec 5 替换为 URL `?sub=xxx` 写入 + sticky pin。
  - Spec 5 可通过 `view.job.data.stage` 与 `currentSubStage` 驱动左侧时间线动画与自动滚动。
  - Spec 5 的 `<md` 抽屉化布局不影响 hook API，只是在 consumer 处改变渲染容器。

- **Phase_B_Cleanup（未来 spec）**：
  - 移除 `BlueprintProgressPanel` 的 `initial*` props 与面板私有字段（`initial*` / `on*Change`）。
  - 让 8 个 canonical 面板直接从 hook 消费，而不是通过 `BlueprintProgressPanel` 作为中间层。
  - 若 `/specs` 未来需要独立 URL 状态，Phase_B 会处理 URL 同步。
