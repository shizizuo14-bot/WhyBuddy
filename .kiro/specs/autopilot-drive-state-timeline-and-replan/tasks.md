# 任务清单：驾驶状态时间线与重规划

- [x] 定义 Drive State Timeline 组件。
- [x] 展示主状态 rail，并高亮当前状态。
- [x] 展示 blocked、takeover-required、replanning、failed 异常分支。
- [x] 展示 next step 和 remaining steps。
- [x] 增加 replan banner，展示前后路线、原因、触发方、影响。
- [x] 将 replan banner 与 Route Evidence 事件关联。
- [x] 为状态本地化补充中英文测试。
- [x] 回补 `drive-state-and-replan-state-machine` 中前端已支持/未支持状态清单。
- [x] 优化 `TaskAutopilotPanel` 对 `driveState` 的 fallback，避免未知状态显示为原始 key。
- [x] 检查 server projection 是否稳定输出 `replan.fromRouteId / toRouteId / triggeredBy`。
- [x] 为 runtime_replanned、system_downgraded、user_selected 三类状态预留测试。
- [x] 确保状态时间线在移动端可压缩为横向滚动或分段卡片。

## 前端状态支持清单

- 已支持主状态：`understanding`、`clarifying`、`planning`、`fleet-forming`、`executing`、`reviewing`、`delivered`。
- 已支持异常状态：`blocked`、`takeover-required`、`replanning`、`failed`。
- 已支持重规划类型：`runtime_replanned`、`system_downgraded`、`user_selected`。
- 已支持轻量证据关联：`evidenceEventId`、`evidenceHref`、`routeEvidenceLabel`。
- 未显式建模的 drive state 会先格式化为可读标签，避免直接展示原始 key；后续若 server 固化新状态，应补入显式本地化映射。
