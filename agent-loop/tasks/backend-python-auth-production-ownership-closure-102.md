# 后端 NodeJS 迁 Python：Auth production ownership closure 102

## 执行状态

- 状态：待执行
- 目标：对 auth 的真实 user repository、email mailer、password policy、session repository、token issuance 做 102 收口。优先补 Python-owned runtime；不能安全接管的必须输出 node-retained / blocked decision。
- 角色分工：worker 负责 Python ownership service、Node auth bridge 和测试；reviewer 必须确认没有弱化登录、注册、session、token 或邮件安全边界。

### 状态清单

- [ ] Python 能输出 auth production ownership decision。
- [ ] Node bridge 能消费 user repo、mailer、password policy、session repo、token issuance 的 decision。
- [ ] 测试覆盖真实接管、Node 保留、配置缺失、blocked。
- [ ] gate 全绿。
- [ ] review 确认没有提交密钥、绕过安全策略或虚写 100%。

## 背景

100/101 已经补了 login/register、refresh/logout、session persistence、token/mailer/session readiness。但状态表仍明确：真实 user 库、email-mailer、password policy、session repository、token issuance 仍是 node-owned-gap。102 要把这些生产所有权最后判清楚。

## 允许修改的文件

- `tws-ai-slide-rule-python/services/auth_production_ownership_closure.py`
- `tws-ai-slide-rule-python/services/auth_token_mailer_session_cutover.py`
- `tws-ai-slide-rule-python/services/auth_audit_production_closure.py`
- `tws-ai-slide-rule-python/tests/test_auth_production_ownership_closure_102.py`
- `server/routes/auth.ts`
- `server/auth/session-service.ts`
- `server/auth/email-code-service.ts`
- `server/tests/auth-production-ownership-closure-102.test.ts`
- `server/tests/auth-token-mailer-session-cutover-101.test.ts`
- `shared/auth.ts`
- `agent-loop/tasks/backend-python-auth-production-ownership-closure-102.md`

## 禁止扩大范围

- 不提交真实邮件服务密钥、token、密码或用户数据。
- 不绕过 password policy、session hashing、CSRF/cookie 安全边界。
- 不把 mock mailer、内存 session 或 synthetic token 写成 production-owned。
- 不删除既有 auth 安全测试。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实用户数据。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `authProductionOwnershipClosure102Gates`。

## 成功标准

- Python 和 Node 都能表达 auth 生产所有权分类。
- 测试证明 retained/blocked 不会被计入 Python 完成。
- 既有 auth runtime / persistence 测试继续通过。
- 所有 gate 通过。

## 给 worker 的大白话

Auth 不能为了进度数字冒险。能接管就拿测试证明；不能接管就明确写 Node 继续保留哪些真实安全职责。
