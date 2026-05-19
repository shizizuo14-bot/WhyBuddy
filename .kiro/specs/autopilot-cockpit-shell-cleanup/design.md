# 设计：autopilot 驾驶舱右栏外壳清理

## 基线 commit

本 spec 基于 commit `00db850` (`fix(autopilot): fix right rail scroll and metrics overlap`) 开始。

执行前请确认：
```bash
git log -1 --oneline
# 应该看到 00db850 或其 descendant
```

## 改动范围矩阵

| 文件 | 改动类型 | 关键点 |
| --- | --- | --- |
| `client/src/pages/autopilot/AutopilotRoutePage.tsx` | 编辑 | 删除 `case "fabric"` 开头的 `AutopilotSpecTreeHandoffPanel` / empty state；删除 `AutopilotWorkflowRail` 末尾的 `<RailMetricsBlock>`；清理 import |
| `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx` | 编辑 | 删除非 fabric 分支的 `<div>{label}</div>`；删除 fabric 分支顶部的 label h1 行；删除 aside 根节点末尾的 `<RailMetricsBlock>`；清理 import |

## 关键代码定位

### 位置 1：`AutopilotRoutePage.tsx` `AutopilotWorkflowRail.case "fabric"` 开头

当前约 `AutopilotRoutePage.tsx:1594-1611`（commit 00db850 的行号，可能有偏移）：

```tsx
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
        {t(
          locale,
          "先完成路线选择，AgentCrewFabric 才会展开。",
          "Complete route selection before AgentCrewFabric expands."
        )}
      </div>
    )}

    {/* Drawer tier ... */}
```

**清理后：**

```tsx
return (
  <div className="grid gap-3" data-testid="autopilot-fabric-step">
    {/* Spec 1: removed AutopilotSpecTreeHandoffPanel + empty state */}

    {/* Drawer tier ... */}
```

### 位置 2：`AutopilotRoutePage.tsx` `AutopilotWorkflowRail` 末尾的 `<RailMetricsBlock>`

当前约 `AutopilotRoutePage.tsx:1782`（commit 00db850 基线）：

```tsx
      <ApiErrorNotice error={apiError} />

      {/* Spec 5 布局校准:4 个指标卡在所有 stage 底部可见 */}
      <RailMetricsBlock
        locale={locale}
        routeSet={routeSet}
        selection={selection}
        specTree={specTree}
        agentCrew={agentCrew}
        effectPreviews={effectPreviews}
        capabilityEvidence={capabilityEvidence}
      />
    </aside>
  );
}
```

**清理后：**

```tsx
      <ApiErrorNotice error={apiError} />
    </aside>
  );
}
```

同时检查文件顶部的 import：

```tsx
import { RailMetricsBlock } from "./right-rail/rail-metrics-block";
```

如果这是此文件中唯一的消费点，移除整条 import。

### 位置 3：`AutopilotRightRail.tsx` 非 fabric 分支内部的 label

当前 `AutopilotRightRail.tsx:171-178`（commit 00db850）：

```tsx
if (!isFabric || currentStage !== "fabric") {
  return (
    <div key={stage} data-stage-placeholder={stage} data-active={isActive ? "true" : "false"}>
      <div>{label}</div>
    </div>
  );
}
```

**清理后：**

```tsx
if (!isFabric || currentStage !== "fabric") {
  return (
    <div key={stage} data-stage-placeholder={stage} data-active={isActive ? "true" : "false"} />
  );
}
```

### 位置 4：`AutopilotRightRail.tsx` fabric 分支顶部的 label

当前 `AutopilotRightRail.tsx:183-186`：

```tsx
return (
  <div key={stage} data-stage-placeholder={stage} data-active={isActive ? "true" : "false"}>
    <div className="mb-2 text-sm font-bold">{label}</div>
    <div
      ref={scrollRef}
      data-testid="autopilot-right-rail-scroll-container"
      ...
```

**清理后：**

```tsx
return (
  <div key={stage} data-stage-placeholder={stage} data-active={isActive ? "true" : "false"}>
    <div
      ref={scrollRef}
      data-testid="autopilot-right-rail-scroll-container"
      ...
```

### 位置 5：`AutopilotRightRail.tsx` aside 根节点末尾的 `<RailMetricsBlock>`

当前 `AutopilotRightRail.tsx:218-226`：

```tsx
      })}
      <RailMetricsBlock
        locale={locale}
        routeSet={routeSet}
        selection={selection}
        specTree={specTree}
        agentCrew={agentCrew}
        effectPreviews={effectPreviews}
        capabilityEvidence={capabilityEvidence}
      />
    </aside>
```

**清理后：**

```tsx
      })}
    </aside>
```

同时移除文件顶部 `import { RailMetricsBlock } from "./rail-metrics-block";`。

## 测试影响分析

### `fabric-dispatch.property.test.tsx`

所有 assertion 仍然通过：
- `data-testid="autopilot-right-rail"` ✓ aside 根节点保留
- `data-autopilot-stage` ✓ 保留
- `data-autopilot-sub-stage` ✓ 保留
- `data-sub-stage-placeholder="{active}"` ✓ fabric 分支 active section 保留
- `aria-current="step"` ✓ 保留

**该测试文件不需要修改。**

### `AutopilotRoutePage.test.tsx`

扫描现有 8 个测试的 assertion，确认无依赖已删除文本：

- `markup.toContain("AUTOPILOT")` ← 来自 header，保留
- `markup.toContain("Input") / ("RouteSet") / ("Select") / ("Fabric") / ("3D/HUD")` ← 来自顶部 Steps，保留
- `markup.toContain("Autopilot console")` ← 来自 console，保留

**该测试文件不需要修改。**

但需要扫一遍 `expect(markup).toContain(...)`：
- 如果有依赖 `AgentCrewFabric workbench` / `AgentCrewFabric 推演工作台`（fabric 分支 label）的 assertion，需要更新
- 如果有依赖 `Input stage` / `Clarification` 等 stage label 文字的 assertion，需要更新

## 验证清单

1. `npx vitest run client/src/pages/autopilot`：全过（225 个 case）
2. `node --run check`：TS error 数 == 107
3. 启动 `pnpm run dev:all`，打开 `/autopilot`：
   - fabric 阶段：无绿色摘要卡、无空态提示、无工作台大标题、无底部指标卡
   - 8 个子阶段面板仍然同时渲染（Spec 4 才会改这个）
   - 顶部 step rail、底部 console、左侧 3D 场景不变

## 回滚策略

纯删除改动，可 git revert。本 spec 改动不会破坏任何业务逻辑。

## 与后续 spec 的接口

- **Spec 4** 会重写 fabric 分支内部的 8 个子阶段渲染为 MiroFish 卡片流，本 spec 清理后留下干净的 `<div className="space-y-4 overflow-y-auto">` scrollRef 容器作为挂载点
- **Spec 2 / 3** 不依赖本 spec，可完全并行
