# 后端 NodeJS 到 Python 迁移：permission rate-limit runtime boundary 89

## 执行状态
- 状态：待执行
- 目标：把 permission rate-limit 从 contract-only 推进到最小 Python runtime boundary，不改变现有 Node 权限策略。
- 角色分工：worker 负责 Python runtime boundary、Node Python-mode 测试和错误语义；reviewer 确认 deny/rate-limit/conflict 没有被放宽。

### 状态清单
- [ ] Python runtime boundary 覆盖 allow、deny、invalid limit、reset/retry-after 语义。
- [ ] Node 测试覆盖 Python mode 下 rate-limit decision 映射。
- [ ] deny、invalid_limit、rate_limit_exceeded 不伪装成 success。
- [ ] gate 全绿。
- [ ] Codex review 确认没有绕开 permission check engine 或管理面权限。

## 目标

permission check engine 和 permission route management 已有边界证据，但 rate-limit 仍主要是 contract-only。本任务只补最小 runtime boundary，让 Python 可以表达同样的 rate-limit decision envelope。Node 仍拥有生产路由、真实存储和策略编排。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/permission_rate_limit.py`
- `tws-ai-slide-rule-python/tests/test_permission_rate_limit_runtime_boundary.py`
- `tws-ai-slide-rule-python/tests/test_permission_rate_limit_contract.py`
- `server/permission/rate-limiter-python-runtime.ts`
- `server/permission/rate-limiter-python-runtime.test.ts`
- `server/permission/rate-limiter-python-contract.test.ts`
- `server/permission/rate-limiter.test.ts`
- `server/permission/rate-limiter.ts`
- `shared/permission/contracts.ts`
- `agent-loop/tasks/backend-python-permission-rate-limit-runtime-boundary-89.md`

## 禁止扩大范围
- 不改默认权限策略。
- 不改 role/policy/token 管理 schema。
- 不引入真实外部缓存或数据库依赖。
- 不绕过 Node permission check engine。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `permissionRateLimitRuntimeBoundary89Gates`。

## 成功标准

- Python 测试覆盖 allowed、rate_limit_exceeded、invalid_limit、reset/retry-after。
- Node 测试确认 Python runtime 返回的 deny/error 不会被映射成 allow。
- 现有 rate-limiter 行为不回退。
- TypeScript、pytest、mojibake gate 通过。
