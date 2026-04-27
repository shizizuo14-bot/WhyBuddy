# 任务清单：自动驾驶路线规划浮层

- [x] 将现有路线候选面板抽成独立 `RoutePlanningOverlay` 或等价组件。
- [x] 补齐路线卡片字段：推荐理由、取舍说明、风险、成本、时长、接管强度。
- [x] 增加路线横向比较视图，至少覆盖速度、稳定性、深度、风险、成本、接管点。
- [x] 增加“恢复系统推荐路线”交互。
- [x] 增加“确认路线并执行”状态，区分规划期选择与执行期重规划。
- [x] 将 `selectedRouteId` 透传到提交协调器并补齐异常场景测试。
- [x] 为不可用路线补充禁用原因和可执行的下一步。
- [x] 为 route planning overlay 增加组件测试，覆盖推荐路线、切换路线、禁用路线。
- [x] 回补 `route-recommendation-and-selection` 中尚未形成代码闭环的“用户主动改线 / 系统降级改线 / 系统重规划”三类路径。
- [x] 对齐 `LaunchRouteCandidate` 与 shared `CandidateRoute` 字段，减少长期双模型风险。
- [x] 检查路线选择事件是否能进入 evidence/replay 投影，缺失时补 TODO 或最小事件。
- [x] 更新驾驶舱 IA 文档，明确路线浮层与三栏 cockpit 的挂载关系。

Lane B notes:
- Aligned `LaunchRouteCandidate` with shared `CandidateRoute` fields via the frontend route-plan projection.
- Added a minimal route-selection evidence event for replay/evidence projection.
