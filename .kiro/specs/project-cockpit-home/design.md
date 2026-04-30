# 设计文档：Project Cockpit Home

## 设计概述

Project Cockpit Home 的目标是把首页变成“当前项目下一步怎么推进”的主界面。它不是架构展示页，也不是能力市场。

首页必须优先回答：

1. 我现在在哪个项目里？
2. 这个项目目标是什么？
3. 当前推进到哪一步？
4. 系统建议下一步做什么？
5. 我在哪里输入、确认或接管？

## 页面状态

### 状态 A：无项目

首屏结构：

```text
创建你的第一个项目
[一句话描述项目目标...]

辅助入口：
- 从模板开始
- 导入已有资料
- 查看示例项目
```

隐藏或弱化：

- 任务中心大面板
- 角色节点列表
- Docker / Runtime
- Key Pool
- 复杂 HUD

### 状态 B：项目目标澄清

展示：

- 当前项目名
- 项目目标草案
- 系统缺失信息
- 2-5 个澄清问题
- 项目化输入框

### 状态 C：Spec 已形成

展示：

- Spec 版本和摘要
- 完整度
- 关键决策
- 需要确认的冲突或假设
- 生成路线按钮或自动路线建议

### 状态 D：路线规划

展示：

- 推荐路线
- 快速路线
- 深度路线
- 保守路线
- 风险 / 时间 / 成本摘要
- 用户选择入口

用户看路线，不看节点；FSD 角色和 AIGC 能力只在详情中说明。

### 状态 E：执行中

展示：

- 当前执行阶段
- 正在工作的角色
- Mission 队列摘要
- 等待用户接管的动作
- 最近证据和产物
- 进入任务中心的入口

### 状态 F：完成 / 演化

展示：

- 已交付产物
- Evidence & Replay
- Spec diff
- 下一轮建议
- 继续推进输入框

## 信息架构

建议结构：

```text
Project Header
  - Project selector
  - Project status
  - Quick actions: new / import / settings

Project Main
  - Goal summary
  - Current stage
  - Next best action
  - Stage-specific panel

Project Composer
  - Current project-scoped input
  - Attachments
  - Submit route

Project Side / Bottom Summary
  - Spec
  - Route
  - Missions
  - Artifacts
  - Evidence

3D Office / HUD
  - Status visualization only
```

## 与现有组件映射

| 现有组件 | 新定位 |
| ---- | ---- |
| `Home.tsx` | Project Cockpit page shell |
| `OfficeTaskCockpit` | 项目驾驶舱主要工作区 |
| `UnifiedLaunchComposer` | Project-scoped Composer |
| `OfficeRoom` | 项目状态空间可视化 |
| `/tasks` | Project Execution Center |

## UI 原则

- 不再把多个入口做成同权重大按钮。
- 首屏只突出一个继续推进入口。
- 任务中心入口以“查看执行明细”表达。
- 3D Office 是状态增强，不是操作主舞台。
- 阶段内容按需浮现，避免一次性展示所有模块。

## 非目标

- 不在本 spec 中实现完整 spec 编辑器。
- 不在本 spec 中实现完整路线规划算法。
- 不在本 spec 中实现 Key Pool。
- 不在本 spec 中重写任务执行 runtime。

