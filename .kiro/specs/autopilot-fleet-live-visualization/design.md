# 设计文档：自动驾驶车队实时可视化

## 设计概述

Fleet Live View 是中间执行主视图的重要组件。它把内部 Agent / Node / Adapter 的运行态转成角色卡片和 lane。

## 组件结构

### 1. Fleet Summary

- 活跃角色数
- 阻塞角色数
- 等待接管数
- 当前主导角色

### 2. Role Card

- 角色名称
- 状态
- 当前动作
- 绑定 Agent / Executor
- 最近产物
- 等待原因

### 3. Parallel Lanes

- 规划 lane
- 执行 lane
- 复核 lane
- 审计 lane

## 数据映射

- Web-AIGC 节点不直接暴露给用户。
- 多个底层节点可以合并为一个 Fleet Role。
- 一个 Fleet Role 可以绑定多个 executor 或 agent。

## 回补既有缺陷方向

- 检查 `MissionAutopilotSummary.fleet` 字段是否足够支持 live view。
- 修复 role status fallback 过于宽泛导致所有角色看起来一样的问题。
- 将 role mapping 与 `fleet-organization-and-role-packaging` 的定义保持一致。
