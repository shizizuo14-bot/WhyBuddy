# 需求文档：自动驾驶接管控制面板

## 目标

把澄清、路线选择、审批、权限、预算、风险确认、人工操作统一成一个“接管控制面板”，让用户知道什么时候必须介入、为什么介入、怎么介入。

## 与现有 18 份 task-autopilot specs 的引用关系

本 spec 前端落地：

- `takeover-panel-and-decision-points`
- `autopilot-recovery-and-human-takeover-governance`
- `task-autopilot-levels-l1-to-l5`
- `autopilot-runtime-orchestration`
- `autopilot-evidence-replay-and-trust-chain`

## 当前差距

- `DecisionPanel`、ClarificationPanel、runtime upgrade、operator actions 分散。
- 用户不清楚哪些是必需接管，哪些是建议接管。
- 接管后对路线和证据链的影响不明显。

## 需求

### 需求 1：系统必须统一展示接管队列

接管队列至少包括当前待处理、即将到来、已完成三类。

### 需求 2：每个接管点必须解释原因

必须展示触发原因、风险、推荐选择、默认策略。

### 需求 3：接管操作必须影响运行态

用户确认后必须能恢复、重规划、继续、降级或终止。

### 需求 4：接管必须进入证据链

每次接管都必须记录 actor、decision、reason、timestamp。
