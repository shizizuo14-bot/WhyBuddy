# 设计文档：Project-First 产品架构

## 设计概述

该 spec 定义 Project-first 改造的总设计。它不直接实现页面或 store，而是给后续 spec 提供统一边界：

- `Project` 是产品第一对象。
- `Spec` 是项目推进的稳定骨架。
- `FSD Route` 是用户可理解的执行路径。
- `Mission / Workflow / Runtime` 是工程承载层。
- `Evidence / Artifact / Replay` 是信任和沉淀层。

当前架构图参考：`docs/entry-execution-architecture.svg`。后续可新增 Project-first 专用图，但该图已明确 `50+ AIGC 节点` 内嵌于 FSD 角色，不再作为独立节点层。

## 核心对象

| 对象 | 用户心智 | 工程承接 |
| ---- | ---- | ---- |
| Project | 我正在推进的项目 | project store / projectId |
| Conversation | 项目上下文和澄清历史 | project messages |
| Spec | 项目规格和演化记录 | project specs / versions |
| Route | 主路线、备选路线、保守路线 | route plan / fsd plan |
| Mission | 一次执行单元 | existing task / mission store |
| Workflow | 执行编排承载 | existing workflow runtime |
| Role | Planner / Researcher / Builder / Reviewer 等 | FSD role state |
| AIGC Capability | 角色内部能力，不暴露为入口 | embedded node capability |
| Artifact | 文档、图、代码、报告、原型 | project artifacts |
| Evidence | 日志、来源、决策、执行轨迹 | evidence / replay store |

## 产品主线

```text
Project
  -> Clarification
  -> Spec Center
  -> FSD Route Planner
  -> Role Execution
  -> Runtime Carrier
  -> Evidence / Artifact / Replay
  -> Project Memory
```

用户看到的是项目、阶段、路线和结果；系统内部调度角色、节点、workflow、docker 和 key。

## 页面定位

### 首页：Project Cockpit

首页负责回答：

- 当前项目是什么？
- 当前阶段是什么？
- 系统建议下一步做什么？
- 用户在哪里继续推进？
- 是否有路线、接管或执行状态需要确认？

首页不应展示所有底层能力，也不应把任务中心、节点列表、运行时配置当作同级入口。

### 任务中心：Project Execution Center

任务中心负责项目下的执行明细：

- mission 队列
- 执行状态
- agent / role 轨迹
- operator action
- 终止、重试、接管
- 日志、证据和 replay

### 设置与集成

设置负责 API key、runtime、数据源、权限等系统配置。Key Pool 和 Agent Pool 是支撑层能力，不作为第一阶段的首页主对象。

## 阶段化策略

### 第一阶段：项目主线最小闭环

打通：

`Project -> Project Cockpit -> Project-scoped Composer -> Project Mission -> Project Execution Center`

### 第二阶段：Spec 中枢

打通：

`Conversation / Clarification -> Spec Version -> Spec Diff -> Spec Source`

### 第三阶段：路线规划

打通：

`Spec -> Main Route / Alternative Route / Conservative Route -> User Selection -> Mission Plan`

### 第四阶段：深度执行

打通：

`FSD Role -> Runtime Carrier -> Docker / Browser / Native -> Evidence / Artifact`

### 第五阶段：资源调度

打通：

`Key Pool -> Agent Pool -> Lease -> Quota -> Parallel Worker`

## 设计原则

1. 用户看项目，不看节点。
2. 用户看路线，不看 DAG。
3. 用户看下一步，不看完整系统能力。
4. 首页克制，架构完整。
5. 先 projectId 贯穿，再做复杂资源池。
6. 50+ AIGC 节点只作为 FSD 角色能力，不直接产品化暴露。

## 非目标

- 第一阶段不重做登录和多人权限。
- 第一阶段不强制后端化所有项目数据。
- 第一阶段不把 50+ AIGC 节点做成用户可选节点市场。
- 第一阶段不要求完成 Key Pool / Agent Pool。
- 第一阶段不要求替换现有 mission / workflow runtime。

