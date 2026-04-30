# 设计文档：Project-Scoped Composer

## 设计概述

Project-scoped Composer 是 Project-first 首页的唯一主输入。它不再表达“创建一个全局任务”，而是表达：

> 在当前项目中继续推进。

## 输入语义

旧语义：

```text
输入一个任务目标 -> 路由 -> mission / clarification / runtime upgrade
```

新语义：

```text
输入项目推进意图 -> 写入项目上下文 -> 判断下一步 -> 澄清 / spec / route / mission
```

## 提交上下文

建议提交上下文：

```ts
interface ProjectLaunchContext {
  projectId: string;
  projectName: string;
  projectGoal: string;
  projectStatus: ProjectStatus;
  currentSpec?: ProjectSpec;
  currentRoute?: ProjectRoute;
  recentMessages: ProjectMessage[];
  activeMissions: ProjectMission[];
}
```

## 路由输出

Composer 的路由判断应能输出：

- `create_project`：无项目时从输入创建项目
- `clarify_project`：信息不足，生成项目澄清
- `update_spec`：补充或演化 spec
- `plan_route`：生成路线
- `launch_mission`：创建执行任务
- `runtime_upgrade`：需要切换高级运行时
- `attach_artifact`：只上传资料或产物

## 数据回写

每次提交至少写入：

- `ProjectMessage`：用户输入
- `ProjectEvidence`：如果触发了解析、路线判断或执行建议

按结果写入：

- `ProjectSpec`
- `ProjectRoute`
- `ProjectMission`
- `ProjectArtifact`

## UI 行为

### 无项目

输入框可存在，但按钮语义是：

```text
创建项目
```

提交后创建 project，输入内容作为 `goal`。

### 有项目

按钮语义是：

```text
继续推进
```

占位文案：

```text
在「{project.name}」中继续推进...
```

### 执行中

输入框支持：

- 补充约束
- 回答接管问题
- 要求暂停 / 继续 / 调整路线
- 添加资料

## 兼容现有逻辑

现有 `UnifiedLaunchComposer` 可先增加可选 `projectContext` 参数，内部逐步接入 project store。若现有 submit API 无法承接 `projectId`，应先通过 project store 建立外部关联。

## 非目标

- 不在本 spec 中实现完整自然语言 spec 生成器。
- 不在本 spec 中实现完整 FSD planner。
- 不在本 spec 中重写任务执行协议。

