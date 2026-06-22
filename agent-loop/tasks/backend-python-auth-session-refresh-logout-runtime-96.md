# 后端 NodeJS 到 Python 迁移：Auth session refresh/logout runtime 96

## 执行状态
- 状态：待执行
- 目标：把 auth session 的 refresh/logout 小闭环推进到 Python runtime/production boundary，不迁完整注册、登录、邮件码体系。
- 角色分工：worker 负责 Python session runtime、Node auth 映射和测试；reviewer 确认没有绕过现有 auth middleware 和 repository 约束。

### 状态清单
- [x] Python runtime 支持 refresh/logout/session invalidation envelope。
- [x] Node auth route/session service 能映射 Python refreshed/logged_out/expired/invalid/error。
- [x] expired/invalid/error 不伪装成 authenticated。
- [x] gate 全绿。
- [x] Codex review 确认没有迁完整用户系统、邮件码或数据库 schema。

## 目标

当前 auth/session 有 contract 和 persistence evidence，但 refresh/logout 仍是整体后端生产闭环的关键缺口。本任务只做最小 runtime boundary：续期、失效、登出、过期和错误语义稳定。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/auth_session_persistence.py`
- `tws-ai-slide-rule-python/tests/test_auth_session_refresh_logout_runtime.py`
- `tws-ai-slide-rule-python/tests/test_auth_session_runtime_boundary.py`
- `tws-ai-slide-rule-python/tests/test_auth_session_production_persistence.py`
- `server/routes/auth.ts`
- `server/auth/session-service.ts`
- `server/auth/middleware.ts`
- `server/tests/auth-session-refresh-logout-python-runtime.test.ts`
- `server/tests/auth-session-runtime-boundary.test.ts`
- `server/tests/auth-session-production-persistence.test.ts`
- `agent-loop/tasks/backend-python-auth-session-refresh-logout-runtime-96.md`

## 禁止扩大范围
- 不迁完整 register/login/email-code。
- 不改用户表、session 表或 repository schema。
- 不降低 auth middleware 的拒绝语义。
- 不提交真实密钥、token、cookie 或会话数据。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `authSessionRefreshLogoutRuntime96Gates`。

## 成功标准

- Python 测试覆盖 refresh success、logout invalidation、expired session、invalid token、repository failure。
- Node 测试确认 refresh/logout 对 Python 状态映射稳定，并且错误不变成 authenticated。
- 现有 auth session runtime/persistence 测试继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
