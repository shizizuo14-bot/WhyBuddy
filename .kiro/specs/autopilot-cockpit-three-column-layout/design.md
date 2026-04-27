# 设计文档：自动驾驶三栏驾驶舱布局

## 设计概述

三栏布局是 Task Autopilot 的主屏骨架。它不要求一次性重写所有任务页面，而是先引入 `AutopilotCockpitLayout` 作为组合层，逐步把现有组件迁入明确区域。

## 区域定义

### 左栏：Destination & Route

组件来源：

- Destination Card
- Route Planning / Route Card
- Route Progress
- Risk & Deviation

### 中栏：Live Drive View

组件来源：

- Drive State Timeline
- Fleet Live View
- Current Execution
- Outputs Preview

### 右栏：Takeover & Evidence

组件来源：

- Takeover Control Panel
- DecisionPanel
- Evidence Driving Recorder
- Cost / Audit Summary

## 迁移策略

第一步：

- 保留 `TaskDetailView` tabs。
- 在 cockpit variant 中增加三栏容器。
- 复用 `TaskAutopilotPanel` 的投影逻辑。

第二步：

- 拆出 Destination、Route、Fleet、Takeover、Evidence 独立组件。
- 将 `DecisionPanel` 接入右栏。

第三步：

- `/tasks` 主视图默认进入三栏驾驶舱。

## 回补既有缺陷方向

- 检查 `TaskAutopilotPanel` 是否过度承担所有展示逻辑。
- 逐步把解析函数和展示块拆为可复用组件。
- 修复 Desktop/Mobile 下 cockpit bottom dock 与详情面板互相挤压的问题。
