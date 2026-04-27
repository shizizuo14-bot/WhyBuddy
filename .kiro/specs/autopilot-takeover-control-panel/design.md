# 设计文档：自动驾驶接管控制面板

## 设计概述

Takeover Control Panel 是右栏的主组件。它把多种 HITL 形式折叠成统一体验。

## 接管类型

- clarification
- route-selection
- approval
- permission
- budget
- risk-acceptance
- delivery-review
- exception
- operator

## 面板结构

### 1. Current Takeover

- 标题
- 触发原因
- 风险说明
- 推荐操作
- 选项
- 提交按钮

### 2. Upcoming Takeovers

- 即将需要确认的事项
- 预计阶段
- 是否阻塞

### 3. Resolved Takeovers

- 已完成记录
- 用户选择
- 对路线的影响

## 与现有组件关系

- `DecisionPanel` 应成为 takeover panel 的一种内容 renderer。
- `ClarificationPanel` 应成为 clarification takeover 的 renderer。
- operator actions 应成为 operator takeover 的快捷操作。

## 回补既有缺陷方向

- 检查 `DecisionPanel` 与 takeover summary 的字段重复。
- 修复等待状态下接管点和 route selection 互相割裂的问题。
- 补齐接管后 evidence event 的前端展示。
