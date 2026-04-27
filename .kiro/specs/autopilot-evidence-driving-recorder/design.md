# 设计文档：自动驾驶证据记录仪

## 设计概述

Evidence Driving Recorder 是右栏可信性组件。它把底层 evidence/replay/audit 事件投影成任务驾驶时间线。

## 事件类型

- destination.parsed
- destination.locked
- route.recommended
- route.selected
- route.locked
- route.replanned
- takeover.requested
- takeover.resolved
- fleet.role.started
- tool.called
- output.generated
- review.completed
- audit.recorded
- delivery.completed

## 组件结构

### 1. Evidence Timeline

- 时间
- 事件类型
- 摘要
- actor
- trust state

### 2. Evidence Filters

- route
- takeover
- fleet
- tool
- output
- audit

### 3. Evidence Detail Drawer

- 原始事件
- 相关对象
- 链接到 replay/audit/artifacts

## 回补既有缺陷方向

- 检查 route evidence 与 audit chain 字段是否重复或缺失。
- 修复 TaskAutopilotPanel 当前 evidence 展示过摘要的问题。
- 为 evidence event 增加统一本地化词典。
