# 设计文档：目的地卡片与目标锁定

## 设计概述

目的地卡片是 Task Autopilot 的“导航目的地栏”。它不仅展示目标摘要，还承载目标锁定、目标来源、目标变更和重规划触发。

## 状态模型

建议目的地锁定状态：

- `draft`
- `parsed`
- `confirmed`
- `locked`
- `changed`
- `needs_reconfirmation`

## 卡片结构

### 1. Header

- 目标一句话
- 任务类型
- 置信度
- 锁定状态

### 2. Goal Fields

- 目标
- 交付物
- 成功标准
- 约束
- 时间线
- 不做什么

### 3. Source And Confidence

- 用户输入
- 附件
- 澄清
- 系统推断
- 人工修改

### 4. Route Impact

当目标变更：

- 是否需要重规划
- 受影响路线
- 是否需要接管

## 与现有组件关系

- `TaskAutopilotPanel` 中的 Destination block 是详情态最小实现。
- `UnifiedLaunchComposer` 中的目的地预览是规划前草稿态实现。
- 三栏 cockpit 左侧应使用同一视图模型，避免重复实现。

## 回补既有缺陷方向

- 检查 `parseMissionDestination()` 输出与 UI 字段是否缺少 source/confidence。
- 修复任务详情中 sourceText 与 destination summary 不一致时的 fallback。
- 为澄清答案 merge 到 destination 增加设计与测试。
