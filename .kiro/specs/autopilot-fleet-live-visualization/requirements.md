# 需求文档：自动驾驶车队实时可视化

## 目标

把底层节点、Agent、执行器与治理角色包装成用户能理解的“车队”，让用户看到当前有哪些角色正在工作、阻塞、等待或完成。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 前端落地：

- `fleet-organization-and-role-packaging`
- `fleet-status-and-live-execution-view`
- `autopilot-runtime-orchestration`
- `autopilot-explainability-and-telemetry`
- `mission-model-to-autopilot-model-mapping`

## 当前差距

- Fleet 多为摘要文本，不够“活”。
- 并行执行、角色状态、当前动作没有形成强视觉。
- 底层节点到角色的映射对用户不可见。

## 需求

### 需求 1：系统必须展示当前车队角色

至少支持 Planner、Clarifier、Researcher、Generator、Reviewer、Auditor、Operator。

### 需求 2：系统必须展示每个角色状态

状态至少包括 idle、running、waiting、blocked、done、failed。

### 需求 3：系统必须展示角色当前动作

每个活跃角色应展示当前动作、输入、输出或等待原因。

### 需求 4：系统必须展示并行执行关系

当多个角色并行工作时，UI 必须体现并行，而不是串成一条日志。
