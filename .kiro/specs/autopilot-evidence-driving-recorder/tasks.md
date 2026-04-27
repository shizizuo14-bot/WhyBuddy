# 任务清单：自动驾驶证据记录仪

- [x] 定义 Evidence Driving Recorder 事件视图模型。
- [x] 展示驾驶事件时间线。
- [x] 支持按 route、takeover、fleet、tool、output、audit 筛选。
- [x] 展示证据可信状态：verified、partial、unverified、redacted。
- [x] 增加证据详情 drawer。
- [x] 增加跳转 replay/audit/artifacts 的上下文参数。
- [x] 为 route.recommended / selected / locked / replanned 增加展示模板。
- [x] 为 takeover.requested / resolved 增加展示模板。
- [x] 回补 `autopilot-evidence-replay-and-trust-chain` 中前端已消费的 evidence 字段清单。
- [x] 检查 shared/server/client 对 evidence event 命名是否一致。
- [x] 修复 evidence fallback 导致事件顺序不稳定的问题。
- [x] 为证据记录仪增加组件测试和 store normalize 测试。

## Lane B completion note: fields and naming

- Backfilled the frontend-consumed evidence field list into `autopilot-evidence-replay-and-trust-chain`.
- Checked shared/server/client evidence event naming consistency for the current recorder scope.
- Frontend recorder event fields: `id`, `eventType`, `status`, `trust`, `category`, `actor`, `summary`, `occurredAt`, `detail`.
- Frontend recorder detail fields: `detail.title`, `detail.description`, `detail.attributes`, `detail.raw`.
- Frontend category and event-prefix allow list: `route`, `takeover`, `fleet`, `tool`, `output`, `audit`.
- Shared route event names align with frontend recorder labels: `route.recommended`, `route.selected`, `route.locked`, `route.replanned`.
- Compatibility boundary: shared timeline object `type` values such as `drive_state_change`, `decision`, `operator_action`, `result`, and `system` are not dotted recorder event names. Consumers should adapt them into recorder events or provide an explicit supported `category`.
