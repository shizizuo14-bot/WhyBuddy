# 需求文档：Project-Scoped Composer

## 目标

将 `UnifiedLaunchComposer` 从全局任务发起器升级为当前项目的继续推进入口。用户输入不再是孤立任务，而是带项目上下文、可生成澄清、spec、路线或 mission 的项目推进动作。

## 需求

### 需求 1：必须感知当前项目

Composer 应接收或读取 `currentProjectId`。存在当前项目时，提交内容必须关联该项目。

### 需求 2：无项目时引导创建

当没有当前项目时，Composer 不应直接发起复杂任务，而应引导用户先创建项目或将输入转化为新项目目标。

### 需求 3：项目化占位文案

Composer 应根据当前项目显示项目化文案，例如 `在「权限管理系统」中继续推进...`。

### 需求 4：输入进入项目消息

用户提交内容应写入 `ProjectMessage`，作为后续澄清、spec 生成和路线规划的来源。

### 需求 5：附件进入项目上下文

附件应挂到当前项目，并可作为 spec source、route input 或 mission artifact。

### 需求 6：路由判断结合项目上下文

`buildLaunchRoutePlan / evaluateLaunchRoute` 应结合当前项目状态、spec 状态、澄清状态和执行状态判断下一步动作。

### 需求 7：任务创建带 projectId

当 Composer 创建 mission / task 时，应把 `projectId` 传入可承接的接口，并在项目 store 中写入 `ProjectMission`。

### 需求 8：澄清回写项目

当信息不足进入 clarification 时，问题、回答和最终合并结果应写回项目，而不是只保存在临时对话状态。

### 需求 9：路线选择回写项目

当输入触发 FSD route plan 或路线选择时，路线应写入 `ProjectRoute` 并可被 Project Cockpit 展示。

### 需求 10：兼容现有统一发起逻辑

Composer 改造应兼容现有 `submitUnifiedLaunch`、运行时升级、附件、补问、任务创建和错误反馈。

