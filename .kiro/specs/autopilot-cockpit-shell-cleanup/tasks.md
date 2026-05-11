# 任务：autopilot 驾驶舱右栏外壳清理

## 前置状态

本 spec 基于 commit `00db850`（`fix(autopilot): fix right rail scroll and metrics overlap`）开始。请确认：

```bash
git log --oneline -5
# 应能看到 00db850
```

## 任务清单

- [x] 1. 删除 `AutopilotWorkflowRail.case "fabric"` 分支开头的 `AutopilotSpecTreeHandoffPanel` 与 dashed 空态
  - 定位 `client/src/pages/autopilot/AutopilotRoutePage.tsx` 中 `case "fabric":` 分支
  - 删除整段 `{selection ? <AutopilotSpecTreeHandoffPanel ... /> : <div ... 空态 />}`
  - 保留 `<div className="grid gap-3" data-testid="autopilot-fabric-step">` 外壳
  - 保留后续的 `tier === "drawer"` / `tier === "side-collapsible"` / railElement 渲染逻辑
  - **不删除** `AutopilotSpecTreeHandoffPanel` 组件定义（`/specs` 可能仍需）

- [x] 2. 删除 `AutopilotWorkflowRail` return 块末尾的 `<RailMetricsBlock>`
  - 定位 `AutopilotWorkflowRail` 组件 return 块的末尾（`</aside>` 之前）
  - 删除整段 `<RailMetricsBlock locale={locale} routeSet={routeSet} ... />`
  - 检查 `AutopilotRoutePage.tsx` 顶部的 `import { RailMetricsBlock } from "./right-rail/rail-metrics-block"`
  - 如果没有其他消费者，移除该 import

- [x] 3. 清空 `AutopilotRightRail` 非 fabric 分支内部的 label 文本
  - 定位 `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx` 的 `TIMELINE_STAGE_ORDER.map(stage => …)` 的非 fabric 分支
  - 把 `<div>{label}</div>` 行删除
  - 保留外层 `<div data-stage-placeholder data-active />` 空节点壳
  - 自闭合写法（`<div … />`）优先

- [x] 4. 清空 `AutopilotRightRail` fabric 分支顶部的 label 文本
  - 定位 fabric 分支内部的 `<div className="mb-2 text-sm font-bold">{label}</div>`
  - 删除该行
  - 保留外层 `<div data-stage-placeholder="fabric" data-active={...}>` 与内部的 scrollRef div

- [x] 5. 删除 `AutopilotRightRail` aside 根节点末尾的 `<RailMetricsBlock>` 与对应 import
  - 定位 aside 根节点末尾的 `<RailMetricsBlock locale={locale} ... />`
  - 删除整段
  - 移除文件顶部 `import { RailMetricsBlock } from "./rail-metrics-block";`

- [x] 6. 执行验证
  - 运行 `npx vitest run client/src/pages/autopilot`：应看到 **225 passed**
  - 运行 `node --run check`：TS error 数应保持 **107**
  - 启动 dev 服务器并打开 `/autopilot`，手动验证：
    - fabric 阶段：无绿色 RouteSet 摘要卡、无 dashed 空态、无「AgentCrewFabric 推演工作台」大标题、无底部指标卡
    - 非 fabric 分支 stage 标签层在 DOM 中但无可见文字
    - 顶部 step rail 仍在
    - 底部 console 仍在
    - 8 个子阶段面板仍按现有方式渲染（Spec 4 才会改）

- [x] 7. 提交
  - commit message: `refactor(autopilot): remove redundant summary/metrics blocks from right rail shell`
  - stage 文件：
    - `client/src/pages/autopilot/AutopilotRoutePage.tsx`
    - `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`
  - **禁止** stage `.kiro/blueprint-assets/jobs.json` 或任何其他不相关文件
  - 若有测试断言依赖了删除的文字（如 `AgentCrewFabric workbench`），更新并在 commit message 中加一行说明
