# 需求文档：Project FSD Route Planner

## 目标

将自动驾驶路线规划从任务级 route plan 升级为项目级 FSD Route Planner。它基于项目 spec、上下文、风险和执行能力生成用户可理解的主路线、备选路线和保守路线。

## 需求

### 需求 1：基于项目和 Spec 规划

Route Planner 应以当前项目、当前 spec、澄清结果、执行历史和用户约束作为输入。

### 需求 2：输出用户可理解路线

路线应用用户可理解的方式表达目标、步骤、风险、时间、成本和需要确认的点，而不是暴露底层 DAG 或 50+ 节点。

### 需求 3：主路线和备选路线

系统应至少支持推荐路线、快速路线、深度路线、保守路线四类路线。

### 需求 4：用户选择路线

用户应能选择路线、调整路线或要求重新规划，选择结果写入项目。

### 需求 5：路线转 Mission

被选中的路线应能转成一个或多个 mission / workflow 执行单元，并带 `projectId`、`specId`、`routeId`。

### 需求 6：FSD 角色编排

路线应选择合适的 FSD 角色，例如 Planner、Researcher、Builder、Reviewer、Spec Writer。角色内部可调用 50+ AIGC 能力，但不直接暴露给用户。

### 需求 7：风险和接管点

路线应标出关键风险、需要用户确认的节点、可自动执行的部分和必须接管的部分。

### 需求 8：路线可回放

路线选择、调整、执行进度和偏离原因应成为 project evidence，可用于 replay。

### 需求 9：支持重新规划

当 spec 更新、执行失败、用户改变目标或证据显示路线不可靠时，系统应支持 replan。

### 需求 10：兼容现有 launch-router

改造应复用现有 `launch-router`、`unified-launch-coordinator` 和 autopilot route planning 基础，逐步提升为项目级路线。

