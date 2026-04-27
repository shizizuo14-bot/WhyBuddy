# 设计文档：驾驶状态时间线与重规划

## 设计概述

Drive State Timeline 是任务自动驾驶的“仪表盘”。它不取代执行日志，而是提供高层状态理解。

## 时间线结构

### 1. Primary State Rail

- understanding
- clarifying
- planning
- fleet-forming
- executing
- reviewing
- delivered

### 2. Exception Branch

- blocked
- takeover-required
- replanning
- failed

### 3. Replan Banner

展示：

- 原路线
- 新路线
- 触发方
- 原因
- 是否需要接管

## 数据来源

- `MissionAutopilotSummary.driveState`
- `route.replan`
- `explanation.currentState`
- `explanation.remainingSteps`
- `recovery`
- `takeover`

## 回补既有缺陷方向

- 检查 `drive-state-and-replan-state-machine` 中状态枚举与前端本地化是否一致。
- 修复 remaining steps fallback 与 route stages 之间的不一致。
- 为 replan event 增加稳定投影字段。
