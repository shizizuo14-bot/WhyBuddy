# 设计文档：自动驾驶前端状态模型与 Store

## 设计概述

前端状态分为三层：

1. Draft Layer：输入目的地时的临时状态
2. Planning Layer：路线候选与选择状态
3. Mission Projection Layer：任务创建后的 autopilot summary

## 状态分层

### Draft Layer

归属：`useNLCommandStore` 或 launch local state

- `destinationDraft`
- `attachments`
- `runtimeMode`
- `missingFields`

### Planning Layer

归属：短期可在 launch local state，中期应抽出 hook

- `routePlan`
- `recommendedRouteId`
- `selectedRouteId`
- `routeSelectionStatus`

### Mission Projection Layer

归属：`useTasksStore`

- `autopilotSummary.destination`
- `autopilotSummary.route`
- `autopilotSummary.driveState`
- `autopilotSummary.fleet`
- `autopilotSummary.takeover`
- `autopilotSummary.evidence`

## Hook 建议

- `useAutopilotDestinationDraft`
- `useAutopilotRoutePlan`
- `useAutopilotCockpitModel`
- `useAutopilotTakeoverQueue`

## 回补既有缺陷方向

- 检查 launch-router 与 shared autopilot summary 的字段割裂。
- 修复 normalize 中别名过多导致真实缺陷被吞掉的问题。
- 为 selectedRouteId 生命周期建立清晰边界。
