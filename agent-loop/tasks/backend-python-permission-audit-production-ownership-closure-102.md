# 后端 NodeJS 迁 Python：Permission/Audit production ownership closure 102

## 执行状态

- 状态：待执行
- 目标：对 permission policy management/enforcement、durable counters、audit durable store、retention/export、anomaly/compliance、external audit platform 做 102 收口。
- 角色分工：worker 负责 Python ownership service、Node permission/audit bridge 和测试；reviewer 必须确认没有弱化权限链或审计链。

### 状态清单

- [ ] Python 能输出 permission/audit production ownership decision。
- [ ] Node bridge 能消费 policy/enforcement/counters/audit-store/anomaly/compliance/external-platform decision。
- [ ] 测试覆盖 `python-owned`、`node-retained`、`blocked`、`external-required`。
- [ ] gate 全绿。
- [ ] review 确认没有绕过权限或把内存审计写成生产审计。

## 背景

101 已补 policy-store / audit durable cutover readiness，但完整 policy 管理、enforcement、durable store、anomaly/compliance、外部 audit platform 仍是 node-owned-gap。102 要把这些归属变成可测试状态。

## 允许修改的文件

- `tws-ai-slide-rule-python/services/permission_audit_production_ownership_closure.py`
- `tws-ai-slide-rule-python/services/permission_audit_policy_store_cutover.py`
- `tws-ai-slide-rule-python/services/permission_audit_hooks.py`
- `tws-ai-slide-rule-python/services/audit_retention_export.py`
- `tws-ai-slide-rule-python/tests/test_permission_audit_production_ownership_closure_102.py`
- `server/permission/check-engine.ts`
- `server/permission/audit-logger.ts`
- `server/audit/audit-hooks.ts`
- `server/routes/audit.ts`
- `server/tests/permission-audit-production-ownership-closure-102.test.ts`
- `server/tests/permission-audit-policy-store-cutover-101.test.ts`
- `shared/permission/contracts.ts`
- `shared/audit/contracts.ts`
- `agent-loop/tasks/backend-python-permission-audit-production-ownership-closure-102.md`

## 禁止扩大范围

- 不绕过 permission check、policy validation、rate limit 或 audit event。
- 不把内存 store、synthetic sink、skipped external platform 写成 production-owned。
- 不提交真实外部 audit platform 密钥或响应。
- 不删除既有 permission/audit 测试。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实用户数据。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `permissionAuditProductionOwnershipClosure102Gates`。

## 成功标准

- Python service 覆盖 permission/audit 关键生产职责的 ownership 分类。
- Node 测试确认 retained/blocked/external-required 不会被误算为完成。
- 既有 permission/audit runtime 测试继续通过。
- 所有 gate 通过。

## 给 worker 的大白话

权限和审计是底线。不要为了“迁完”把内存审计或 hook 当生产审计；这次要把真正没接管的地方明牌写出来。
