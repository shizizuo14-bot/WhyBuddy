# 设计：autopilot 右栏 MiroFish 式流式卡片布局

## 依赖关系

本 spec 依赖：
- Spec 1 `autopilot-cockpit-shell-cleanup`（清理完毕的外壳）
- Spec 2 `autopilot-sub-stage-card-primitive`（`SubStageCard` / `StatusCapsule` / `MetricsRow` 原语）
- Spec 3 `autopilot-sub-stage-metrics-extractor`（`deriveSubStageSummary()` 派生器）

必须等 Spec 1 / 2 / 3 合入 main 后才能开始编码本 spec。

## 入口文件重构对比

### 当前 `AutopilotRightRail.tsx`（~540 行）

```
import { CompletedSubStageRow, readSubStageMetric, isSubStageDataReady, ... }
...
return (
  <aside>
    {TIMELINE_STAGE_ORDER.map(stage => (
      <div data-stage-placeholder>
        {!isFabric || currentStage !== "fabric" ? (
          <div>{label}</div>
        ) : (
          <>
            <Fabric eyebrow />
            <scroll container>
              {completed.map(sub => <CompletedSubStageRow>)}
              {expanded && <ExpandedPanel>}
              {active && <Active section with LIVE/PENDING>}
              <Remaining steps hint />
            </scroll container>
          </>
        )}
      </div>
    ))}
    <RailMetricsBlock />
  </aside>
);
```

### 重构后 `AutopilotRightRail.tsx`（目标 ~260 行）

```
import { SubStageCard, StatusCapsule, MetricsRow } from "./primitives";
import { deriveSubStageSummary } from "./sub-stage-summary";
import { renderSubStagePanel } from "./render-sub-stage-panel";  // 从原文件抽出
...
return (
  <aside className="mirofish-rail" {...rootAttrs}>
    {TIMELINE_STAGE_ORDER.map(stage => (
      stage !== "fabric"
        ? <div data-stage-placeholder={stage} data-active={isActive} />
        : currentStage === "fabric"
          ? <FabricCardStream {...} />
          : <div data-stage-placeholder="fabric" data-active="false" />
    ))}
  </aside>
);

function FabricCardStream({ activeSubStage, ... }) {
  const [expanded, setExpanded] = useState<Partial<Record<AutopilotRailSubStage, boolean>>>({});
  const completed = activeSubStage ? RAIL_SUB_STAGE_ORDER.slice(0, activeIndex) : [];

  return (
    <div data-stage-placeholder="fabric" data-active="true" className="bg-[#FAFAFA] px-5 py-5 space-y-4">
      {completed.map(sub => <CompletedCard sub={sub} />)}
      {activeSubStage && <ActiveCard sub={activeSubStage} />}
    </div>
  );
}

function CompletedCard({ sub, props, locale, expanded, onToggle }) {
  const summary = deriveSubStageSummary(sub, props, locale);
  return (
    <SubStageCard
      index={RAIL_SUB_STAGE_ORDER.indexOf(sub)}
      title={summary.title}
      apiPath={summary.apiPath}
      summary={summary.summary}
      status="completed"
      expanded={expanded}
      onToggleExpanded={onToggle}
      locale={locale}
    >
      <MetricsRow metrics={summary.metrics} columns={3} />
      {expanded ? renderSubStagePanel({ subStage: sub, ...panelProps }) : null}
    </SubStageCard>
  );
}

function ActiveCard({ sub, props, locale }) {
  const summary = deriveSubStageSummary(sub, props, locale);
  return (
    <SubStageCard
      index={RAIL_SUB_STAGE_ORDER.indexOf(sub)}
      title={summary.title}
      apiPath={summary.apiPath}
      summary={summary.summary}
      status={summary.dataReady ? "active" : "pending"}
      anchorAttr={{ name: "data-sub-stage-placeholder", value: sub }}
      ariaCurrentStep
      locale={locale}
    >
      <MetricsRow metrics={summary.metrics} columns={3} />
      {summary.dataReady
        ? renderSubStagePanel({ subStage: sub, ...panelProps })
        : <PendingInlineState locale={locale} title={summary.title} />}
    </SubStageCard>
  );
}
```

## `SubStageCard` 根节点的属性通道

本 spec 需要 Spec 2 的 `SubStageCard` 支持把测试契约所需的 attribute 放到根节点。推荐在 Spec 2 的 primitive 定义里新增：

```ts
export interface SubStageCardProps {
  // ... existing
  anchorAttr?: { name: string; value: string };
  ariaCurrentStep?: boolean;
}
```

Spec 2 实现时在根节点 `<article>` spread：

```tsx
<article
  data-testid="autopilot-sub-stage-card"
  data-sub-stage-status={status}
  {...(anchorAttr ? { [anchorAttr.name]: anchorAttr.value } : {})}
  {...(ariaCurrentStep ? { "aria-current": "step" } : {})}
  className={...}
>
```

**⚠️ 注意**：本约束必须同步写入 Spec 2 的 requirements / design / tasks。我会在 Spec 2 文档中补一条。

## `renderSubStagePanel` 的抽离

当前 `AutopilotRightRail.tsx` 内部有 `renderSubStagePanel` 函数（~80 行），本 spec 应把它抽到独立文件 `client/src/pages/autopilot/right-rail/render-sub-stage-panel.tsx`，导出：

```ts
export function renderSubStagePanel(params: {
  subStage: AutopilotRailSubStage;
  jobId: string;
  job: AutopilotRightRailProps["job"];
  agentCrew: ...;
  capabilities: ...;
  ...
  locale: AppLocale;
}): ReactNode;
```

抽离后：
- `AutopilotRightRail.tsx` 只 import 并传参
- 后续 Spec 5 `autopilot-sub-stage-panel-wrapping` 只需修改这一个文件，不碰 rail 主文件

## PendingInlineState 组件

```tsx
function PendingInlineState({ locale, title }: { locale: AppLocale; title: string }) {
  return (
    <div className="mx-5 my-4 border border-dashed border-[#CCC] bg-white px-4 py-6 text-center">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#999]">
        {locale === "zh-CN" ? "· 等待上游数据 ·" : "· AWAITING UPSTREAM DATA ·"}
      </div>
      <div className="mt-2 font-mono text-[11px] leading-5 text-[#666]">
        {locale === "zh-CN"
          ? `${title} 面板将在数据到达后渲染。`
          : `${title} panel will render once data arrives.`}
      </div>
    </div>
  );
}
```

放在 `AutopilotRightRail.tsx` 内部的私有 helper，不对外导出。

## 测试更新

### `fabric-dispatch.property.test.tsx`

检查点变化：
- `data-autopilot-stage="fabric"` 仍在根 aside（不变）
- `data-autopilot-sub-stage="{active}"` 仍在根 aside（不变）
- `data-sub-stage-placeholder="{active}"` 现在出现在 `<article>` 而不是 `<section>`（不影响正则匹配）
- `aria-current="step"` 出现在同一 `<article>`
- 顺序：`data-sub-stage-placeholder` 在 `aria-current` 之前 — 由 Spec 2 的 `{...(anchorAttr ? ...)}` 早于 `{...(ariaCurrentStep ? ...)}` 保证

如果 React 的 JSX spread 顺序不稳定（理论上稳定），测试可能脆弱。应在 Spec 2 实现时用**单条件表达式**内联合并两个 attribute：

```tsx
<article
  data-testid="autopilot-sub-stage-card"
  data-sub-stage-status={status}
  {...(anchorAttr ? { [anchorAttr.name]: anchorAttr.value } : {})}
  aria-current={ariaCurrentStep ? "step" : undefined}
  ...
>
```

React 的 `aria-current` 在 JSX 中一定会渲染在 spread 之后。测试契约满足。

### 新增 `autopilot-right-rail-cards.test.tsx`

```ts
describe("AutopilotRightRail MiroFish cards", () => {
  it("renders a completed card + an active card when activeSubStage='spec_tree'", () => {
    const markup = renderToStaticMarkup(<AutopilotRightRail
      currentStage="fabric"
      currentSubStage="spec_tree"
      // ... props with specTree data ready
    />);
    expect(markup).toContain('data-sub-stage-status="completed"');
    expect(markup).toContain('data-sub-stage-status="active"');
  });

  it("renders an active pending card when dataReady=false", () => {
    const markup = renderToStaticMarkup(<AutopilotRightRail
      currentStage="fabric"
      currentSubStage="spec_tree"
      specTree={null}
      // ...
    />);
    expect(markup).toContain('data-sub-stage-status="pending"');
    expect(markup).toContain("AWAITING UPSTREAM DATA");
  });

  it("does not render future sub-stages past activeSubStage", () => {
    const markup = renderToStaticMarkup(<AutopilotRightRail
      currentStage="fabric"
      currentSubStage="agent_crew_fabric"
      // ...
    />);
    // 后 7 个子阶段不应出现在 markup 中
    expect(markup).not.toContain('data-sub-stage-status="pending"'); // except none
    // 精确地：spec_tree / spec_documents 等都不存在
  });
});
```

## 视觉验收标准

操作演示阶段 → job.stage 推进 `agent_crew_fabric` → `spec_tree` → `spec_documents`：

1. 首次进入 fabric：只看到 **1 张活跃卡**（agent_crew_fabric，橙边 + 橙胶囊 + 大号数字指标 + 完整面板）
2. job.stage → spec_tree：
   - **1 张完成卡**（agent_crew_fabric，灰边 + 绿胶囊 + 数字指标 + 「展开 ↓」）
   - **1 张活跃卡**（spec_tree，橙边 + 橙胶囊 + 数字指标 + 完整面板）
3. job.stage → spec_documents：
   - 2 张完成卡 + 1 张活跃卡
4. 点击 agent_crew_fabric 完成卡 `展开 ↓`：下方展开完整面板
5. 再次点击：折叠

## 回滚策略

本 spec 改动集中在 `AutopilotRightRail.tsx` 与新增一个 `render-sub-stage-panel.tsx`。如需回滚：

```
git revert <commit-sha>
```

即可。primitive / summary 文件不受影响。

## 与 Spec 5 的接口

Spec 5 `autopilot-sub-stage-panel-wrapping` 会修改 8 个 panel wrapper 的外层样式（去掉自带 card chrome）。Spec 5 不修改 `AutopilotRightRail.tsx` 或 `render-sub-stage-panel.tsx`，所以本 spec 完成后 Spec 5 的工作边界清晰。
