# 需求：autopilot 右栏 MiroFish 式流式卡片布局（Wave 2 / Spec 4）

## 背景

当前 `AutopilotRightRail.tsx` 在 fabric 阶段用「已完成 slim 行 + 当前活跃 section + 后续 N 步提示」的 terminal-log 风格。这个方案在流式节奏上对了，但：

1. 已完成段的 slim 单行摘要太简陋，MiroFish 原图中每张卡都是**完整独立卡片**，承载数字指标
2. 活跃段的 header 重复了"审计者 审计中 audit"等冗余标签
3. 未开始段用「后续 N 步等待推进」dim 文本，不符合 MiroFish 的 pending 状态卡
4. 整体未消费 Spec 2 的卡片 primitive + Spec 3 的摘要派生，导致视觉一致性缺失

## 核心目标

重写 `AutopilotRightRail.tsx` 的 fabric 分支渲染逻辑，消费 Wave 1 产物 `SubStageCard` / `StatusCapsule` / `MetricsRow` 原语与 `deriveSubStageSummary()` 派生器，形成按时间流式 append 的卡片栈：

- 每个子阶段 = 一张独立的 MiroFish 式卡片
- 已完成卡片 = 灰描边 + 绿色「构建完成」胶囊 + 3 大号数字指标 + 可折叠展开详情
- 活跃卡片 = 橙色加粗描边 + 橙色「执行中 ●」胶囊 + 3 大号数字 + 默认展开详情
- 未开始卡片 = 不渲染（本 spec 默认）

## 需求

### 需求 1：主渲染函数重写

- 入口：`client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`
- fabric 分支（`data-stage-placeholder="fabric" data-active="true"`）的内部应重写为如下结构：

```
{completedSubStages.map(sub => (
  <SubStageCard
    key={sub}
    index={order.indexOf(sub)}
    title={summary.title}
    apiPath={summary.apiPath}
    summary={summary.summary}
    status="completed"
    expanded={expanded[sub] === true}
    onToggleExpanded={() => toggle(sub)}
    locale={locale}
  >
    <MetricsRow metrics={summary.metrics} columns={3} />
    {expanded[sub] && <ExpandedSlot sub={sub} {...panelProps} />}
  </SubStageCard>
))}

{activeSubStage && (
  <SubStageCard
    data-sub-stage-placeholder={activeSubStage}
    aria-current="step"
    index={order.indexOf(activeSubStage)}
    title={summary.title}
    apiPath={summary.apiPath}
    summary={summary.summary}
    status={dataReady ? "active" : "pending"}
    locale={locale}
  >
    <MetricsRow metrics={summary.metrics} columns={3} />
    {dataReady && <ExpandedSlot sub={activeSubStage} {...panelProps} />}
  </SubStageCard>
)}
```

### 需求 2：消费 Wave 1 产物

- 必须 `import { SubStageCard, StatusCapsule, MetricsRow } from "./primitives"`
- 必须 `import { deriveSubStageSummary } from "./sub-stage-summary"`
- 不再需要 `CompletedSubStageRow` 内部组件（删除）
- 不再需要 `readSubStageMetric` 内部函数（删除，逻辑已归并到 summary）
- 不再需要 `isSubStageDataReady` 内部函数（删除，由 summary 返回）

### 需求 3：卡片间距与容器

- 卡片之间 gap 16px（用 `space-y-4` 或类似 tailwind 语义）
- 容器外层 padding 20px（`px-5 py-5`）
- 容器背景 `bg-white` 或 `bg-[#FAFAFA]` 都可，建议 `bg-[#FAFAFA]` 让白色卡片有区分
- 容器本身不设 max-height / overflow，滚动交给外层 main 容器

### 需求 4：保留测试契约

- `data-testid="autopilot-right-rail"` 根节点保留
- `data-autopilot-stage="{currentStage}"` 保留
- `data-autopilot-sub-stage="{activeSubStage}"` 保留
- `data-sub-stage-placeholder="{activeSubStage}"` 必须出现在活跃卡片上
- `aria-current="step"` 必须出现在同一元素，且顺序：`data-sub-stage-placeholder` 在 `aria-current` 之前

为满足测试中的 `data-sub-stage-placeholder` + `aria-current` 顺序正则，`SubStageCard` 组件需要通过 prop 传入自定义 HTML 属性。具体做法：

- `SubStageCard` 新增可选 prop `anchorAttr?: { name: string; value: string }` 与 `ariaCurrentStep?: boolean`
- 或者：rail 主文件在 `SubStageCard` 外面包一个 div，但由于 SubStageCard 的根节点是 `<article>`，这种包裹会破坏语义；更推荐的做法是让 `SubStageCard` 根节点 spread 额外 attributes

本 spec 选择：`SubStageCard` 根节点 `<article>` 接受 `data-sub-stage-placeholder` / `aria-current` 额外属性。Spec 2 中应预留这个 spread 通道。

### 需求 5：已完成卡片的展开交互

- 使用 local state `useState<Record<AutopilotRailSubStage, boolean>>({})`
- 点击 `SubStageCard` 的 toggle 按钮切换展开状态
- 展开时在 `MetricsRow` 下面渲染完整的 `renderSubStagePanel(...)` 结果（复用现有的 panel wrapper）
- 折叠时只显示 `MetricsRow`

### 需求 6：活跃卡片的展开策略

- 活跃卡片**默认展开**完整面板（不显示 toggle 按钮）
- 如果 `dataReady === false`：status 为 `"pending"`，不渲染面板内容，只显示一段 mono 文案 "等待上游数据"
- 如果 `dataReady === true`：status 为 `"active"`，渲染完整面板

### 需求 7：删除旧逻辑

- 删除 `CompletedSubStageRow`、`readSubStageMetric`、`isSubStageDataReady`（移到 sub-stage-summary.ts 里）
- 删除 `LIVE / PENDING` 的顶部橙色提示条逻辑（胶囊统一由 `StatusCapsule` 负责）
- 删除 `Fabric eyebrow` 块（现在顶部 step rail 已足够指示当前进度）

### 需求 8：`onSubStageChange` 契约

- 保持 prop 签名不变
- 当用户点击展开某个**已完成**子阶段时，不触发 `onSubStageChange`（展开仅影响本组件内部 state）
- `onSubStageChange` 仍然保留给 URL 同步等外部消费者

### 需求 9：单元测试更新

- 更新 `fabric-dispatch.property.test.tsx`（如果 markup 改变）：
  - 断言点不变：placeholder 属性、aria-current、stage / substage 属性
- 新增 `autopilot-right-rail-cards.test.tsx`：
  - fabric 阶段渲染 `<SubStageCard>` 数量 = 已完成 + 活跃
  - 活跃卡片的 status 属性是 `"active"` 或 `"pending"` 之一
  - 已完成卡片的 status 属性是 `"completed"`
  - 点击 toggle 会切换 expanded 状态（通过 data-expanded 属性或 SubStagePanel 是否渲染）

## 非目标

- 不重写任何 8 个 panel wrapper（交给 Spec 5）
- 不重写 `resolveRailSubStage` 纯函数
- 不修改顶部 step rail / 底部 console / 左侧 3D 场景
- 不处理 rail 的 viewport tier / drawer / collapse 逻辑（已在 AutopilotWorkflowRail 外层处理）

## 完成判定

- `npm run check` TS error 数保持 107 不增长
- `npx vitest run client/src/pages/autopilot` 全过（含新增 `autopilot-right-rail-cards.test.tsx`）
- 人工目视：
  - fabric 阶段：卡片流可见，完成卡灰边 + 绿胶囊，活跃卡橙边 + 橙胶囊
  - 中间无多余灰字 stage / 后续 N 步提示 / 悬浮指标卡（依赖 Spec 1 已完成）
- Wave 3 的 `autopilot-sub-stage-panel-wrapping` 可以挂接到本 spec 产出的展开 slot 上
