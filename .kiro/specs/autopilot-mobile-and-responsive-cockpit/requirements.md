# 需求文档：自动驾驶移动端与响应式驾驶舱

## 目标

保证任务自动驾驶体验在桌面、平板、窄屏和移动端都能使用，不因为三栏驾驶舱、路线浮层或接管面板导致拥挤、遮挡、不可操作。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 是以下 specs 的响应式落地补充：

- `autopilot-cockpit-information-architecture`
- `destination-card-and-goal-summary`
- `route-recommendation-and-selection`
- `fleet-status-and-live-execution-view`
- `takeover-panel-and-decision-points`

## 当前差距

- 三栏模型主要面向桌面。
- bottom dock 与 route planning overlay 容易挤压。
- 移动端没有明确“目的地 / 路线 / 执行 / 接管 / 证据”的导航方式。

## 需求

### 需求 1：系统必须定义响应式层级

至少支持 desktop、tablet、mobile 三档。

### 需求 2：移动端必须保留自动驾驶主对象

移动端不能只退化成普通任务列表，仍需可访问目的地、路线、车队、接管、证据。

### 需求 3：路线规划浮层必须适配窄屏

路线卡片在窄屏下应变成纵向列表或 bottom sheet。

### 需求 4：接管操作必须优先可达

当有阻塞接管点时，移动端必须优先展示接管入口。
