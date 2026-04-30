# 设计文档：Project Execution Center

## 设计概述

Project Execution Center 是 Project-first 体系中的执行明细页。它回答：

- 当前项目有哪些任务在跑？
- 哪些任务需要我接管？
- 执行证据在哪里？
- 失败后怎么恢复？

它不回答：

- 我该从哪里开始一个新项目？
- 我要输入什么目标？

这些问题属于 Project Cockpit。

## 页面结构

```text
Project Filter / Current Project
  - current project selector
  - unassigned tasks entry

Execution Queue
  - queued
  - running
  - waiting for decision
  - completed
  - failed

Task Detail
  - mission summary
  - route source
  - role execution
  - runtime events
  - operator actions
  - evidence
  - artifacts

Replay / History
  - timeline
  - decisions
  - logs
  - outputs
```

## 任务关联

任务详情优先显示：

- `projectId`
- project name
- `routeId`
- `specId`
- source message
- mission id
- workflow id

如果缺失 `projectId`：

- 显示“未归档”
- 允许归入当前项目
- 允许保持未归档

## Operator Action 回写

每次操作写入：

- task store 原有状态
- `ProjectMessage(kind: "decision" | "status")`
- `ProjectEvidence(type: "decision" | "runtime")`

示例：

```text
用户终止 mission-123，原因：路线偏离项目目标。系统建议回到 Spec v0.3 重新规划。
```

## 任务中心入口策略

从首页进入任务中心的按钮文案：

- `查看执行明细`
- `处理待接管`
- `查看运行证据`

避免：

- `新建任务`
- `发起执行`
- `开始自动驾驶`

## 非目标

- 不在本 spec 中做完整任务运行时重写。
- 不在本 spec 中实现 Key Pool。
- 不在本 spec 中把 FSD 节点作为用户可选列表。

