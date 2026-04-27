# 需求文档：自动驾驶三栏驾驶舱布局

## 目标

把任务自动驾驶从“任务详情里的增强面板”升级为主界面信息架构：左侧目的地与路线，中间执行主视图，右侧接管与证据。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 是 `autopilot-cockpit-information-architecture` 的前端实现补充，并引用：

- `autopilot-cockpit-information-architecture`
- `destination-card-and-goal-summary`
- `route-recommendation-and-selection`
- `fleet-status-and-live-execution-view`
- `takeover-panel-and-decision-points`
- `autopilot-evidence-replay-and-trust-chain`

## 当前差距

- `OfficeTaskCockpit` 仍偏任务工作台布局。
- `TaskAutopilotPanel` 是详情中的块，不是主布局骨架。
- 接管、证据、成本、审计仍散在多个 tab 或组件。

## 需求

### 需求 1：驾驶舱必须具备三栏主布局

桌面端默认采用左中右三栏。

### 需求 2：左栏必须承载目的地与路线

左栏展示目的地卡片、当前路线、候选路线、路线进度、风险偏航。

### 需求 3：中栏必须承载执行主视图

中栏展示 Drive State、Fleet、Live Execution、Outputs。

### 需求 4：右栏必须承载接管与证据

右栏展示 Takeover Queue、Decision Panel、Evidence Recorder、Cost/Risk summary。

### 需求 5：布局必须兼容现有任务工作台

不能破坏现有 `/tasks`、TaskDetailView、OfficeTaskCockpit 的基本可用性。
