# 需求文档：自动驾驶前端状态模型与 Store

## 目标

定义前端如何管理目的地草稿、路线计划、已选路线、驾驶状态、接管队列、证据时间线，避免每个组件各自维护一套临时状态。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 是前端状态层对以下 specs 的落地补充：

- `mission-model-to-autopilot-model-mapping`
- `destination-model-and-parser`
- `route-planner-and-route-model`
- `drive-state-and-replan-state-machine`
- `autopilot-evidence-replay-and-trust-chain`
- `task-autopilot-success-metrics`

## 当前差距

- launch route plan、TaskAutopilotPanel projection、tasks-store normalize 存在多处状态投影。
- selectedRouteId 只在入口局部状态中存在，后续锁定/证据链仍需深化。
- 前端缺少统一 autopilot view model。

## 需求

### 需求 1：系统必须定义 Autopilot Frontend View Model

至少包含 destinationDraft、routePlan、selectedRoute、driveState、fleet、takeoverQueue、evidenceTimeline。

### 需求 2：系统必须区分 draft 与 persisted

规划前草稿状态不能与 mission 已持久化状态混淆。

### 需求 3：系统必须定义 store 归属

明确哪些状态属于 NL command store，哪些属于 tasks-store，哪些属于组件局部状态。

### 需求 4：系统必须提供 normalize / fallback 策略

服务端字段缺失时，前端必须稳定降级，不得崩溃或展示误导信息。
