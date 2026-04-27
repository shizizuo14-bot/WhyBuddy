# 需求文档：自动驾驶视觉语言与动效系统

## 目标

定义任务自动驾驶前端的视觉语言，使目的地、路线、车队、驾驶状态、接管、证据在 UI 上形成一致且可识别的产品心智。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 为以下 specs 提供视觉落地层：

- `task-autopilot-core-concepts`
- `task-autopilot-levels-l1-to-l5`
- `autopilot-cockpit-information-architecture`
- `drive-state-and-replan-state-machine`
- `autopilot-explainability-and-telemetry`

## 当前差距

- 自动驾驶目前主要靠文案表达，视觉符号不足。
- 路线、偏航、重规划、接管、证据没有统一颜色和动效。
- 容易退回普通 dashboard 风格。

## 需求

### 需求 1：系统必须定义自动驾驶视觉 token

至少包含颜色、状态、路线线条、风险、接管、证据可信度。

### 需求 2：系统必须定义关键动效

至少包含路线生成、路线切换、状态推进、接管阻塞、证据记录。

### 需求 3：视觉语言必须服务状态理解

动效和颜色不能只做装饰，必须帮助用户理解当前状态。

### 需求 4：必须兼容现有 workspace 视觉系统

不能另起一套完全割裂的风格。
