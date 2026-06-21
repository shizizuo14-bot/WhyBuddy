# 后端 NodeJS 到 Python 迁移：audit production sink 88

## 执行状态
- 状态：待执行
- 目标：为 audit event 补最小 Python production sink 证据，覆盖 store failure、retention/export 降级语义。
- 角色分工：worker 负责 sink boundary 和测试；reviewer 确认不接外部审计平台、不提交密钥。

### 状态清单
- [ ] Python audit sink 支持 write/failure/degraded envelope。
- [ ] Node audit route 或 collector 测试覆盖 Python sink mode。
- [ ] retention/export/anomaly/compliance 未迁部分保持明确 Node-owned。
- [ ] gate 全绿。
- [ ] Codex review 确认 audit failure 没被吞掉。

## 目标

audit 现在有 contract/query proxy/runtime boundary 证据，但 production sink 仍是短板。本任务只补一个最小 sink：写入成功、写入失败、降级状态、来源字段稳定。不接真实外部审计平台。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/audit_sink.py`
- `tws-ai-slide-rule-python/tests/test_audit_production_sink.py`
- `tws-ai-slide-rule-python/tests/test_audit_event_runtime_boundary.py`
- `server/audit/python-sink.ts`
- `server/tests/audit-production-sink.test.ts`
- `server/tests/audit-event-python-runtime.test.ts`
- `shared/audit/contracts.ts`
- `agent-loop/tasks/backend-python-audit-production-sink-88.md`

## 禁止扩大范围
- 不接外部审计平台。
- 不提交 token、key 或真实审计 endpoint。
- 不迁 anomaly/compliance/retention/export 全链路。
- 不把 sink degraded 写成 healthy。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `auditProductionSink88Gates`。

## 成功标准

- Python 测试覆盖 write success、store failure、degraded、missing config。
- Node 测试确认 audit failure 能被观察和上报，不被静默吞掉。
- shared audit contract 字段稳定。
- gate 全绿。
