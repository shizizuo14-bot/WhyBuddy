# 设计文档：自动驾驶路线规划浮层

## 设计概述

路线规划浮层是 Task Autopilot 的“导航路线选择器”。它不展示底层 DAG，而是把 Planner 输出转成用户能比较的路线卡片。

当前已有 `buildLaunchRoutePlan()` 和 `RouteCandidateCard` 雏形，本 spec 将其产品化为可扩展的 `Route Planning Overlay`。

## 组件结构

### 1. Route Planning Overlay

包括：

- 标题：自动驾驶路线规划
- 推荐路线 badge
- 候选路线卡片
- 横向比较入口
- 当前路线摘要
- 确认执行按钮

### 2. Route Candidate Card

字段建议：

- `title`
- `summary`
- `recommendationReason`
- `tradeoffNotes`
- `estimatedDuration`
- `estimatedCost`
- `riskLevel`
- `takeoverLoad`
- `stages`
- `available`
- `disabledReason`

### 3. Route Comparison Drawer

用于展开对比：

- 速度
- 稳定性
- 深度
- 成本
- 时长
- 接管点
- 风险

### 4. Route Confirm Bar

用于执行前确认：

- 当前选中路线
- 是否偏离推荐
- 是否需要接管确认
- 执行入口

## 数据来源

短期：

- `client/src/lib/launch-router.ts`
- `client/src/lib/unified-launch-coordinator.ts`

中期：

- `shared/mission/autopilot.ts`
- `server/tasks/mission-projection.ts`
- Mission Runtime route planner 输出

## 回补既有缺陷方向

- 将 `LaunchRouteCandidate` 与 `MissionAutopilotSummary.route.candidateRoutes` 字段差异整理成兼容映射。
- 避免前端 route candidate 与 shared CandidateRoute 形成两套长期模型。
- 修复已选路线按钮文案仍按 base decision 显示的问题。
- 检查 route selection 是否写入后续 evidence/replay 所需字段。
