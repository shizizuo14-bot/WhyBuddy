# 设计：autopilot 子阶段面板内容化包裹

## 依赖

- Spec 1 / 2 / 3 / 4 已全部合入 main
- `AutopilotRightRail.tsx` 已重写为 MiroFish 卡片流式（Spec 4 产物）
- `renderSubStagePanel` 已抽到 `render-sub-stage-panel.tsx`（Spec 4 产物）

## 面板改造模板

### 可改的 6 个面板通用模板

**改造前**（以 `AgentCrewFabricPanel` 为例）：

```tsx
return (
  <div
    className="mt-4 rounded-[20px] border border-slate-200 bg-white px-4 py-4"
    data-testid="blueprint-agent-crew-surface"
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
          <Layers3 className="size-3.5" aria-hidden="true" />
          智能体团队
        </div>
        <h3 className="mt-2 text-lg font-black text-slate-950">协作角色面板</h3>
        <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
          ...
        </p>
      </div>
      <Badge>...</Badge>
    </div>

    {/* ...数据主体... */}
  </div>
);
```

**改造后**：

```tsx
return (
  <div
    className="grid gap-3"
    data-testid="blueprint-agent-crew-surface"
  >
    {/* Header chrome removed: SubStageCard 已提供标题 / apiPath / summary / 状态胶囊 */}

    {/* ...数据主体保留，但内部嵌套 rounded 改直角 / 去彩色... */}
  </div>
);
```

### 每个面板的改造 checklist

对 6 个可改面板逐个执行：

1. 根节点 className 只保留 `grid gap-3`（或 `space-y-3` / `flex flex-col gap-3` 都可）
2. 移除根节点的 `rounded-[20px] / bg-white / px-4 py-4 / border`
3. 删除文件顶部的 `Layers3` / `Badge` / icon header 相关 import（如果 header 整块被删除）
4. 删除开头的 eyebrow + h3 + p + Badge 整段
5. 把内部所有 `rounded-[14px]` / `rounded-[12px]` / `rounded-full`（Badge 胶囊除外）替换为 `rounded-none`
6. 把所有 `bg-slate-50 / bg-emerald-50 / bg-sky-50 / bg-amber-50` 替换为 `bg-white`
7. 把所有 `border-slate-200 / border-emerald-200 / border-sky-200 / border-amber-200` 替换为 `border-[#EAEAEA]`
8. 把所有 `text-slate-500 / text-emerald-700 / text-sky-700 / text-amber-700` 替换为 `text-[#666]`
9. 若内部有彩色状态 Badge（如 agent state tag），改为 `border-[#CCCCCC] bg-white text-black font-mono uppercase`

## SpecTree / SpecDocuments 适配层

### 在 `render-sub-stage-panel.tsx` 中添加 adapter wrapper

```tsx
export function renderSubStagePanel(params: ...): ReactNode {
  const { subStage, ... } = params;

  if (subStage === "spec_tree") {
    return (
      <div className="autopilot-panel-adapter" data-panel-adapter="spec-tree">
        <SpecTreePanel ... />
      </div>
    );
  }

  if (subStage === "spec_documents") {
    return (
      <div className="autopilot-panel-adapter" data-panel-adapter="spec-documents">
        <SpecDocumentsPanel ... />
      </div>
    );
  }

  // 其他 6 个面板不需要 adapter
  // ...
}
```

### 在 `client/src/index.css` 中添加 CSS override

在 `.mirofish-rail` scope 的末尾（现有 MiroFish 规则下方）追加：

```css
/* Adapter for non-modifiable panels (SpecTree / SpecDocuments) */
.mirofish-rail .autopilot-panel-adapter > * {
  border-radius: 0 !important;
  background: transparent !important;
}

.mirofish-rail .autopilot-panel-adapter [class*="rounded-"] {
  border-radius: 0 !important;
}

.mirofish-rail .autopilot-panel-adapter [class*="bg-slate-50"],
.mirofish-rail .autopilot-panel-adapter [class*="bg-slate-100"] {
  background-color: white !important;
}

.mirofish-rail .autopilot-panel-adapter [class*="border-slate-200"] {
  border-color: #EAEAEA !important;
}
```

这些规则仅在 `.mirofish-rail` scope + `.autopilot-panel-adapter` 内部生效，不影响 `/specs` 页面或其他地方。

## 面板逐个改造细节

### 1. `AgentCrewFabricPanel.tsx`

- 根节点 chrome 剥离
- 移除 Layers3 icon + "智能体团队" + "协作角色面板" h3 + subtitle + Badge 计数
- 4 列 SummaryTile（active / watching / reviewing / sleeping）保留但改直角 + 去彩色
- 角色卡（`rounded-[16px] bg-slate-50`）改直角 + 去彩色
- 每个角色卡内部的「能力 / 资产 / 证据 / 日志」4 列小卡（`rounded-[12px]`）改直角

### 2. `EffectPreviewPanel.tsx`

- 根节点 chrome 剥离
- 移除头部「效果预演 / Effect preview」eyebrow
- 预演卡片（`rounded-[14px]`）改直角
- `RuntimeProjectionCard` 内部的多层 rounded 改直角

### 3. `PromptPackagePanel.tsx`

- 根节点 chrome 剥离
- 移除头部 PackageCheck icon + 标题
- `PROMPT_PLATFORM_OPTIONS` chips 保持逻辑不变，视觉改直角
- 内容预览区保留（长文本），外框改直角

### 4. `RuntimeCapabilityPanel.tsx`

- 根节点 chrome 剥离
- 移除头部 ListChecks / Sparkles / Terminal / Clipboard 相关 eyebrow
- 4 列 SummaryTile 改直角 + 去彩色
- Agent 角色行改直角

### 5. `EngineeringHandoffPanel.tsx`

- 根节点 chrome 剥离
- 移除头部 FileCheck2 / CheckCircle2 相关 eyebrow
- 落地计划列表 / 运行状态 / 平台选择器 改直角

### 6. `ArtifactMemoryPanel.tsx`

- 根节点 chrome 剥离
- 移除头部 GitBranch / Layers3 / PlayCircle eyebrow
- Summary tile / RouteMetric / feedback 列表改直角

## 测试策略

### `shim-identity.test.ts` 更新

原测试可能断言 `rounded-[20px]`，需要检查并更新为允许变化：

```ts
// 旧
expect(markup).toContain('rounded-[20px]');

// 新
expect(markup).toContain('data-testid="blueprint-agent-crew-surface"');
// 不再对具体 class 字面量做强约束，允许视觉重构
```

### 新增 `panel-chrome-strip.test.ts`

```ts
describe("sub-stage panel chrome strip", () => {
  const PANELS_WITH_STRIPPED_CHROME = [
    "AgentCrewFabricPanel",
    "EffectPreviewPanel",
    "PromptPackagePanel",
    "RuntimeCapabilityPanel",
    "EngineeringHandoffPanel",
    "ArtifactMemoryPanel",
  ];

  it.each(PANELS_WITH_STRIPPED_CHROME)("%s: no rounded-[20px] wrapper", (name) => {
    // 动态 import 对应 panel
    // renderToStaticMarkup
    // 断言 markup 不含 rounded-[20px]
  });

  it.each(PANELS_WITH_STRIPPED_CHROME)("%s: no Badge counter header", (name) => {
    // 断言 markup 不含 "N 角色 / M 事件" 或 "N roles / M events" 文案
  });
});
```

## 风险与缓解

- **风险 1**：面板内部测试断言具体 class 字面量（如 `rounded-[20px]`）
  - 缓解：发现后更新测试，允许视觉重构
- **风险 2**：SpecTreeWorkbenchPanel 内部用了 `!important` 样式，导致 adapter CSS 无效
  - 缓解：如果发现，用更高优先级选择器或把 `!important` 加到 adapter 规则
- **风险 3**：`/specs` 页面被意外影响
  - 缓解：所有 CSS override 都在 `.mirofish-rail` scope 内，`/specs` 页面不会有这个 class

## 回滚策略

按文件 git revert。每个面板独立改造，互相独立可分批回滚。
