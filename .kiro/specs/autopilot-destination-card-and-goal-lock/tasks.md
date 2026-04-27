# 任务清单：目的地卡片与目标锁定

- [x] 定义目的地锁定状态枚举，并与 existing Destination parser 对齐。
- [x] 在 launch 入口增加草稿目的地卡片。
- [x] 在 task detail / cockpit 中强化已确认目的地卡片。
- [x] 展示目标字段来源：用户输入、附件、澄清、系统推断、人工修改。
- [x] 增加目标变更后的路线影响提示。
- [x] 增加目标锁定、修改、重确认的最小证据事件。
- [x] 为目标锁定状态补充 shared/store/panel 测试。
- [x] 回补 `destination-card-and-goal-summary` 中已实现字段与未实现字段的审计备注。
- [x] 优化 `parseMissionDestination()` 对交付物、成功标准、约束的识别缺陷。
- [x] 检查 `mission-model-to-autopilot-model-mapping` 中 Mission -> Destination 的 fallback 是否过宽。
- [x] 为目标变更触发 route replan 增加 TODO 或最小实现切口。
- [x] 更新 README 示例，展示目标锁定后的用户体验。

## Lane 6 回补说明（2026-04-26）

- 本轮仅在前端目标卡片范围内补强直证，不调整总勾选数。
- `AutopilotDestinationGoalCard` 现有 helper 测试已覆盖：confirmed destination 自动进入 `locked`、missing info 自动进入 `needs-reconfirm`、route-replan / route-confirmation 影响提示、显式 `lockState: "locked"` 在附带 route confirmation note 时仍保持锁定，以及 `destination.locked / destination.modified / destination.reconfirm_requested` 最小 evidence event。
- 已落地字段包括 `goal / request / subGoals / constraints / successCriteria / deliverables / fieldSources / lockState / routeImpact`。
- 仍未在本 lane 内落地的边界包括 shared/store 的目标锁定持久化、route planner 自动 replan 触发，以及 README 级用户流程示例；这些仍应保持未勾，避免把前端 helper 测试外推为端到端锁定机制。

## Lane F 文档回补说明（2026-04-26）

- README / README.zh-CN 已说明目标锁定后的用户体验边界：桌面驾驶舱可在左栏展示 Destination / Route，目标卡片以 `lockState`、字段来源和 `routeImpact` 解释锁定或重确认状态。
- steering 已明确已落地 goal card 字段为 `goal / request / subGoals / constraints / successCriteria / deliverables / fieldSources / lockState / routeImpact`。
- 仍未完成 shared/store 的目标锁定持久化、planner 自动 replan 触发、Mission -> Destination fallback 收窄和跨层测试闭环。

## Worker lane A 回补说明（2026-04-26）

- cockpit model 已透出已确认目的地卡片所需的 `lockState / confirmedAt / modifiedAt / subGoals / constraints / successCriteria / deliverables`，并补充了 confirmed destination 与 parser-backed 字段测试。
- frontend planning model 已在存在 `lockedRouteId` 或 locked candidate 时默认进入 `locked` 状态，并补充最小锁态测试。
- 本轮未改 shared/store、实际 `parseMissionDestination()`、Mission -> Destination 映射或 route planner，因此这些 checklist 项继续保持未勾选。

## Lane A/B/C 实现收口说明（2026-04-27）

- `parseMissionDestination()` 已补齐中英文稳定标签、`deliverables / successCriteria / constraints`、数组/对象 payload、`decision.payload`、`decisionHistory.payload`、planner/review/runtimeGovernance 结构化路径，并通过 shared mission autopilot 回归测试覆盖。
- `mission-model-to-autopilot-model-mapping` 已明确 `destination.goal` 不再被 `summary / sourceText / decision prompt / option description / event message` 等宽泛文本覆盖，shared 测试锁定 `mission.title -> goal` 边界。
- 前端 autopilot view model 已提供目标锁定后变更触发 `route-replan`、`replanNeeded`、`replanReason` 与 warning 的最小切口，并通过 `autopilot-frontend-model` 测试覆盖。

## Lock State Test Closeout (2026-04-27)

- Store normalization now preserves projected `destination.lockState / confirmedAt / modifiedAt` aliases from shared autopilot summaries into both task summary and detail records.
- `TaskAutopilotPanel` renders destination lock state and lock timestamps inside the cockpit destination detail.
- Shared parser, store projection, destination goal card, and panel tests now cover the lock / modified / reconfirm path instead of relying on a single component-only assertion.
