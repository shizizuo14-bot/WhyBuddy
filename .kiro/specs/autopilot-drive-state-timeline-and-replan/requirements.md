# 需求文档：驾驶状态时间线与重规划

## 目标

把任务执行过程呈现为可理解的驾驶状态时间线，让用户知道当前处于理解、澄清、规划、编队、执行、复核、交付、阻塞、接管或重规划中的哪一步。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 前端落地：

- `drive-state-and-replan-state-machine`
- `autopilot-recovery-and-human-takeover-governance`
- `autopilot-explainability-and-telemetry`
- `route-planner-and-route-model`
- `autopilot-evidence-replay-and-trust-chain`

## 当前差距

- Drive State 有字段，但不是强时间线。
- 重规划、偏航、恢复缺少主视觉。
- 用户不知道下一步是什么。

## 需求

### 需求 1：系统必须展示驾驶状态时间线

至少展示 understanding、clarifying、planning、fleet-forming、executing、reviewing、delivered。

### 需求 2：系统必须展示异常状态

blocked、takeover-required、replanning、failed 必须有明显视觉。

### 需求 3：系统必须展示下一步

当前状态旁必须展示 next step 或 remaining steps。

### 需求 4：重规划必须可解释

发生重规划时，必须展示原因、前路线、后路线、触发方和影响。
