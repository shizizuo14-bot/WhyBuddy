# 后端 NodeJS 到 Python 迁移：telemetry route contract

## 执行状态
- 状态：待执行
- 目标：为 telemetry/cost/monitoring 后端路由建立 Python contract，锁定 metrics/event/cost/error 形状。
- 角色分工：worker 负责 contract；reviewer 确认不伪造真实账单或监控数据。

### 状态清单
- [x] Python 侧有 telemetry contract。
- [x] Node 侧测试覆盖 metrics/events/cost/errors。
- [x] cost 和用量字段明确 synthetic/estimated/actual。
- [x] gate 全绿。
- [x] Codex review 确认没有真实账单数据。

## 目标

telemetry、cost、monitoring 是整体后端运行观测的重要分母。此任务先迁 contract，不迁完整观测系统。

## 允许修改的文件
- `agent-loop/tasks/backend-python-telemetry-route-contract.md`
- `slide-rule-python/services/telemetry_runtime.py`
- `slide-rule-python/tests/test_telemetry_route_contract.py`
- `server/routes/telemetry.ts`
- `server/routes/cost.ts`
- `server/routes/aigc-monitoring.ts`
- `server/core/telemetry-store.ts`
- `server/core/cost-monitor.ts`
- `server/core/cost-tracker.ts`
- `server/routes/__tests__/telemetry-python-route-contract.test.ts`
- `shared/telemetry/*.ts`
- `shared/cost*.ts`

## 禁止扩大范围
- 不写真实账单数据。
- 不发监控外部请求。
- 不改 dashboard UI。
- 不把 estimated cost 写成 actual cost。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `telemetryRouteContractGates`。

## 成功标准

- Python contract 覆盖 metrics/events/cost/error。
- Node 测试确认 actual/estimated/synthetic 字段不混淆。
- telemetry error 不影响主业务成功语义。
- gate 全绿。
