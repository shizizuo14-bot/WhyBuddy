# 任务清单:输入步骤流式时间线重构

## Phase 1:时间线骨架

- [x] 1.1 在 `AutopilotRoutePage.tsx` 新建 `InputTimeline` 内联组件,接收现有 input 阶段所有 props
- [x] 1.2 实现 `resolveInputActiveSubStage()` 纯函数,根据 intake / clarification / routeSet / selection 状态判定当前活跃子阶段
- [x] 1.3 为 5 个输入子阶段构造 `SubStageSummary`(title / apiPath / summary / metrics / dataReady)
- [x] 1.4 用 `TimelineNode` 渲染 5 个子阶段的三态时间线
- [x] 1.5 把 `renderActiveStepBody()` 的 `case "input"` 替换为 `<InputTimeline>`

## Phase 2:活跃节点交互内容

- [x] 2.1 `target_input` 活跃节点:嵌入目标 textarea + GitHub textarea + "创建输入记录"按钮
- [x] 2.2 `intake` 活跃节点:嵌入 IntakeSummary + ProjectContextSummary
- [x] 2.3 `clarification` 活跃节点:嵌入 ClarificationPanel + 就绪度 badge + "生成澄清"按钮
- [x] 2.4 `route_generation` 活跃节点:嵌入"正在生成路线..."进度提示
- [x] 2.5 `route_selection` 活跃节点:嵌入 RouteOption 卡片列表

## Phase 3:已完成节点摘要

- [x] 3.1 `target_input` 完成摘要:目标前 50 字 + GitHub 链接数
- [x] 3.2 `intake` 完成摘要:来源数 / 重复数 / 上下文状态
- [x] 3.3 `clarification` 完成摘要:就绪度 % + 已回答数/总数
- [x] 3.4 `route_generation` 完成摘要:候选路线数
- [x] 3.5 `route_selection` 完成摘要:已选路线标题

## Phase 4:自动推进增强

- [x] 4.1 intake 创建成功后自动触发澄清生成(如果尚未生成)
- [x] 4.2 确保澄清就绪后自动触发路线生成(已有逻辑,验证不冲突)

## Phase 5:测试与回归

- [x] 5.1 更新 `AutopilotRoutePage.test.tsx` 适配新的输入时间线 DOM
- [x] 5.2 确保 TS 基线不扩大
- [x] 5.3 确保 270 autopilot 测试通过
