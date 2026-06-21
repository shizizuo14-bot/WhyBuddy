# 后端 NodeJS 到 Python 迁移：auth session production persistence 88

## 执行状态
- 状态：待执行
- 目标：为 auth/session 补最小生产持久化边界证据，覆盖 session read/write/delete、refresh/logout 错误语义。
- 角色分工：worker 负责 Python persistence boundary 和 Node Python mode 测试；reviewer 确认不改 schema、不接真实 OAuth/IAM。

### 状态清单
- [x] Python session persistence 覆盖 read/write/delete/refresh/logout 最小语义。
- [x] Node auth/session 测试确认 Python mode 下错误不伪装成功。
- [x] 不改变数据库 schema 和认证策略。
- [x] gate 全绿。
- [x] Codex review 确认安全失败语义保留。

## 目标

auth/session 是整体后端分母，当前证据主要是 contract 或 session persistence boundary。本任务只补最小 production persistence 证据：可配置、可失败、可诊断，不迁 email code、OAuth、IAM 或完整用户系统。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/auth_session_persistence.py`
- `tws-ai-slide-rule-python/tests/test_auth_session_production_persistence.py`
- `tws-ai-slide-rule-python/tests/test_auth_session_runtime_boundary.py`
- `server/auth/session-service.ts`
- `server/tests/auth-session-production-persistence.test.ts`
- `server/tests/auth-session-runtime-boundary.test.ts`
- `server/tests/auth-session-python-contract.test.ts`
- `agent-loop/tasks/backend-python-auth-session-production-persistence-88.md`

## 禁止扩大范围
- 不改生产数据库 schema。
- 不接真实 OAuth/IAM provider。
- 不迁 email-code mailer。
- 不放宽 login/refresh/logout 失败语义。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `authSessionProductionPersistence88Gates`。

## 成功标准

- Python 测试覆盖 session create/read/delete、missing config、store failure。
- Node 测试覆盖 Python mode 下 refresh/logout/session error mapping。
- 安全失败不会映射成 authenticated。
- gate 全绿。
