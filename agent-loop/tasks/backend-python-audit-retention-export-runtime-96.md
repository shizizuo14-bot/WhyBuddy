# 后端 NodeJS 到 Python 迁移：Audit retention/export runtime 96

## 执行状态
- 状态：待执行
- 目标：把 audit retention/export 从 Node-owned 缺口推进到 Python runtime boundary，保留现有 audit event/query/sink 语义。
- 角色分工：worker 负责 Python audit retention/export service、Node audit 映射和测试；reviewer 确认没有宣称完整外部审计平台接管。

### 状态清单
- [x] Python runtime 支持 retention decision/export manifest/minimal query envelope。
- [x] Node audit route 或 audit service 能映射 Python retained/exported/denied/degraded/error。
- [x] denied/degraded/error 不伪装成 exported。
- [x] gate 全绿。
- [x] Codex review 确认没有调用真实外部审计平台或改 compliance 结论。

## 目标

当前 audit event/query/sink 已有部分 contract/runtime/production smoke，但 retention/export/anomaly/compliance 仍是整体后端 95 的阻塞项。本任务只做 retention/export 最小 runtime boundary，为后续 anomaly/compliance 拆片留边界。

## 允许修改的文件
- `slide-rule-python/services/audit_sink.py`
- `slide-rule-python/services/audit_retention_export.py`
- `slide-rule-python/tests/test_audit_retention_export_runtime.py`
- `slide-rule-python/tests/test_audit_production_sink.py`
- `slide-rule-python/tests/test_audit_event_runtime_boundary.py`
- `server/routes/audit.ts`
- `server/audit/audit-retention.ts`
- `server/audit/audit-export.ts`
- `server/audit/python-sink.ts`
- `server/tests/audit-retention-export-python-runtime.test.ts`
- `server/tests/audit-production-sink.test.ts`
- `server/tests/audit-event-python-runtime.test.ts`
- `shared/audit/contracts.ts`
- `agent-loop/tasks/backend-python-audit-retention-export-runtime-96.md`

## 禁止扩大范围
- 不迁完整 audit platform、anomaly detector、compliance mapper 或 verifier。
- 不调用真实外部 SIEM、APM、billing、audit platform。
- 不改审计保留生产策略默认值，除非测试中显式覆盖。
- 不提交真实用户审计数据或日志产物。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `auditRetentionExportRuntime96Gates`。

## 成功标准

- Python 测试覆盖 retention keep/drop、export manifest、denied/degraded/error 和 event metadata 保留。
- Node 测试确认 audit route/service 对 Python retained/exported/failed 映射稳定。
- 现有 audit production sink 和 event runtime 测试继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
