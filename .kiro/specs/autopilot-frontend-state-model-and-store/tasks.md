# 任务清单：自动驾驶前端状态模型与 Store

- [x] 梳理 launch、tasks-store、TaskAutopilotPanel 当前 autopilot 状态来源。
- [x] 定义 Autopilot Frontend View Model。
- [x] 区分 destination draft、route planning、mission projection 三层状态。
- [x] 明确 selectedRouteId 从规划期到执行期的生命周期。
- [x] 抽出 `useAutopilotRoutePlan` 或等价 hook，减少组件内逻辑。
- [x] 抽出 `useAutopilotCockpitModel` 或等价 selector。
- [x] 审计 tasks-store autopilot normalize 的 alias fallback，标出应保留和应收敛的字段。
- [x] 为 store normalize 增加缺字段、旧字段、新字段混用测试。
- [x] 回补 `mission-model-to-autopilot-model-mapping` 中前端状态映射说明。
- [x] 检查 `LaunchRouteCandidate`、shared `CandidateRoute`、panel route block 是否存在长期双模型风险。
- [x] 补齐 selected route、locked route、replanned route 的测试覆盖。
- [x] 形成前端状态迁移清单，指导后续实现批次。
