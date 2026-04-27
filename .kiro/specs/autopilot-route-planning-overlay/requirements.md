# 需求文档：自动驾驶路线规划浮层

## 目标

让用户输入目的地后，像导航软件一样先看到路线规划结果，再确认执行。路线规划必须展示推荐路线、候选路线、差异解释、风险、接管点和执行入口。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 前端落地以下既有 specs：

- `route-planner-and-route-model`
- `route-recommendation-and-selection`
- `task-autopilot-levels-l1-to-l5`
- `takeover-panel-and-decision-points`
- `autopilot-runtime-orchestration`
- `autopilot-evidence-replay-and-trust-chain`

## 当前差距

- 目前已有路线候选卡片雏形，但不是强浮层/强规划态。
- 路线差异只有简短描述，缺少横向比较。
- 推荐理由、风险、接管点、成本/时长预估不够完整。
- 选择路线后的锁定与证据事件尚未完整前端化。

## 需求

### 需求 1：输入目的地后必须显示路线规划浮层或规划面板

系统必须在执行前展示路线规划结果。

验收口径：

- 至少展示推荐路线与候选路线。
- 路线面板必须在用户提交执行前可见。
- 路线为空或不可规划时必须说明原因。

### 需求 2：路线必须可比较

候选路线必须具备横向比较维度。

验收口径：

- 至少比较速度、深度、稳定性、风险、成本、接管强度。
- 每条路线必须有推荐理由。
- 当前选中路线与系统推荐路线必须明确区分。

### 需求 3：路线确认必须影响提交路径

用户选择路线后，提交必须走对应 mission、workflow 或 runtime upgrade 链路。

验收口径：

- 最快/标准路线进入 mission。
- 深度路线进入 workflow 或高级编排。
- 高级执行路线先触发 runtime upgrade。
- 不可用路线不能绕过澄清或权限限制。

### 需求 4：路线选择必须进入证据链

路线推荐、选择、锁定、重规划应形成可回放事件。

验收口径：

- 规划期路线选择应记录 `route.selected`。
- 执行前确认应记录 `route.locked`。
- 执行期改线应记录 `route.replanned`。
- 前端必须为这些事件预留展示入口。
