# 需求：autopilot 驾驶舱右栏外壳清理（Wave 1 / Spec 1）

## 背景

当前 autopilot `/autopilot` 页面右栏在 fabric 阶段同时渲染下列冗余元素，需要清理干净以腾出干净的挂载位给 Wave 2 `autopilot-right-rail-streaming-layout`：

1. `AutopilotWorkflowRail.case "fabric"` 分支顶部：
   - `selection != null` 时渲染 `<AutopilotSpecTreeHandoffPanel embedded>` 绿色摘要块（需删除）
   - `selection == null` 时渲染 dashed 空态提示块（需删除）
2. `AutopilotWorkflowRail` return 块末尾的 `<RailMetricsBlock>`（需删除）
3. `AutopilotRightRail` 非 fabric 分支内部的 `<div>{label}</div>` 4 个 stage label 占位文本（需删除，保留 `data-stage-placeholder` / `data-active` 属性壳）
4. `AutopilotRightRail` fabric 分支顶部的 `<div className="mb-2 text-sm font-bold">{label}</div>` AgentCrewFabric 工作台 label 文本（需删除）
5. `AutopilotRightRail` aside 根节点末尾的 `<RailMetricsBlock>`（需删除）

## 核心目标

把右栏外壳里这些冗余装饰清理干净，给 Wave 2 的流式卡片布局腾出干净的挂载位。

## 需求

### 需求 1：删掉 fabric 分支开头的 `AutopilotSpecTreeHandoffPanel` / dashed 空态

- `AutopilotRoutePage.tsx` 的 `AutopilotWorkflowRail.case "fabric"` 分支当前会先渲染 `selection ? <AutopilotSpecTreeHandoffPanel embedded /> : <dashed empty state />`
- 本 spec 应把这两条分支整段移除，fabric 阶段不再展示该摘要块或空态
- `AutopilotSpecTreeHandoffPanel` 组件本身保留，避免破坏 `/specs` 页面与 rendering parity 测试

### 需求 2：删掉 `AutopilotWorkflowRail` 末尾的 `<RailMetricsBlock>`

- 定位 `AutopilotRoutePage.tsx` 中 `AutopilotWorkflowRail` 组件 return 块末尾的 `<RailMetricsBlock>` 调用
- 整段移除
- 如果 `RailMetricsBlock` 的 import 在本文件中已无其他消费者，同步移除该 import

### 需求 3：清空 `AutopilotRightRail` 非 fabric 分支内部的 label 文本

- `AutopilotRightRail.tsx` 内部 `TIMELINE_STAGE_ORDER.map(stage => …)` 对非 fabric stage 会渲染：
  ```tsx
  <div key={stage} data-stage-placeholder={stage} data-active={...}>
    <div>{label}</div>   ← 删这行
  </div>
  ```
- 本 spec 应把内部 `<div>{label}</div>` 行删除，保留外层 `<div>` 空节点壳
- 必须保留 `data-stage-placeholder` 与 `data-active` 属性（测试契约）

### 需求 4：清空 `AutopilotRightRail` fabric 分支顶部的 label 文本

- 当前代码：
  ```tsx
  <div key={stage} data-stage-placeholder={stage} data-active={...}>
    <div className="mb-2 text-sm font-bold">{label}</div>   ← 删这行
    <div ref={scrollRef} ...>
      {RAIL_SUB_STAGE_ORDER.map(...)}
    </div>
  </div>
  ```
- 本 spec 应把 `<div className="mb-2 text-sm font-bold">{label}</div>` 行删除
- 保留外层 div 与 scrollRef div 及其内部的 8 个子阶段渲染（交给 Spec 4 重写）

### 需求 5：删掉 `AutopilotRightRail` 底部的 `<RailMetricsBlock>`

- 定位 `AutopilotRightRail.tsx` aside 根节点末尾的 `<RailMetricsBlock>` 调用
- 整段移除
- 同步移除 `import { RailMetricsBlock } from "./rail-metrics-block"`

### 需求 6：保留顶部 step rail 与底部 console

- 顶部 antd `Steps`（5 个步骤指示器）必须完整保留
- 底部 `AutopilotConsolePanel`（自动驾驶控制台）必须完整保留
- 左侧 3D 场景 `AutopilotVisualStage` 不做任何改动

### 需求 7：测试契约守恒

- `client/src/pages/autopilot/right-rail/__tests__/fabric-dispatch.property.test.tsx` 的 assertion 必须继续通过：
  - `data-testid="autopilot-right-rail"` 存在
  - `data-autopilot-stage="fabric"` 存在
  - `data-autopilot-sub-stage="{active}"` 存在
  - `data-sub-stage-placeholder="{active}"` 存在
  - 同元素上有 `aria-current="step"`
  - 顺序：`data-sub-stage-placeholder` 必须在 `aria-current` 之前
- `AutopilotRoutePage.test.tsx` 当前 8 个测试必须继续通过
- 若删除 `<div>{label}</div>` 导致某测试依赖其文本，允许修改该测试断言，但必须在 commit message 中说明

### 需求 8：零 rendering parity drift

- 本 spec 不修改任何 8 个子阶段 panel 组件的内部实现
- 本 spec 不修改 `resolveRailSubStage`、`RAIL_SUB_STAGE_ORDER`、`AutopilotRightRailProps` 契约
- 本 spec 不修改 `/specs` 页面（`BlueprintProgressPanel` 及其消费者）
- 本 spec 不修改 fabric 分支内部的 8 个子阶段面板渲染逻辑（那部分属于 Spec 4 的范围）

### 需求 9：`rail-metrics-block.tsx` 处理

- 移除其所有消费者后，`rail-metrics-block.tsx` 成为 dead code
- 本 spec **不要求**删除该文件（Spec 4 会决定最终去留）
- 仅要求移除所有 import 与 JSX 调用点

## 非目标

- 不引入 MiroFish 式的新卡片样式（交给 Spec 2 `autopilot-sub-stage-card-primitive`）
- 不重写 fabric 分支内部的子阶段渲染逻辑（交给 Spec 4 `autopilot-right-rail-streaming-layout`）
- 不调整子阶段面板内部的头部 / 指标行（交给 Spec 5 `autopilot-sub-stage-panel-wrapping`）
- 不新增流式 / 分段 / 已完成卡 / 活跃卡的任何逻辑

## 完成判定

- `node --run check` 的 TS error 数保持 107 不增长
- `npx vitest run client/src/pages/autopilot` 全部 225 测试通过
- 人工目视：
  - fabric 阶段不再显示绿色 RouteSet 摘要卡 / dashed 空态
  - 非 fabric 4 行 stage label 文字消失（stage 标签层仍在 DOM 中但无文字）
  - AgentCrewFabric 工作台 label 文字消失
  - 悬浮 / 底部指标卡消失
- 顶部 step rail、底部 console、左侧 3D 场景不变
