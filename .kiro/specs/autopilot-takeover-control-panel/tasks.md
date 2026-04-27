# 任务清单：自动驾驶接管控制面板

- [x] 定义 Takeover Control Panel 的统一视图模型。
- [x] 将 DecisionPanel 接入 takeover renderer。
- [x] 将 ClarificationPanel 接入 clarification takeover。
- [x] 将 runtime upgrade 作为 runtime takeover 展示。
- [x] 展示当前、即将到来、已完成三类接管点。
- [x] 为每个接管点展示原因、风险、推荐操作、默认策略。
- [x] 提交接管后更新 drive state / route / evidence 的最小投影。
- [x] 为接管队列增加组件测试。
- [x] 回补 `takeover-panel-and-decision-points` 中实际支持的 takeover type 状态。
- [x] 修复 `TaskAutopilotPanel` 与 `DecisionPanel` 在 waiting 任务上的重复/冲突展示。
- [x] 检查 `human-in-the-loop` 与 task-autopilot takeover 术语是否一致。
- [x] 为接管事件进入 evidence recorder 预留稳定字段。
