# 后端 NodeJS 到 Python 迁移：Web AIGC transaction-flow runtime 96

## 执行状态
- 状态：待执行
- 目标：把 `/api/transaction-flow` 从 node-only 推进到 Python runtime bridge，覆盖流程分析/决策 envelope，同时保留 permission/audit metadata。
- 角色分工：worker 负责 Python transaction-flow adapter、Node adapter/route 映射和测试；reviewer 确认没有迁真实交易执行器。

### 状态清单
- [ ] Python runtime 支持 flow analysis、decision envelope、permission/audit metadata。
- [ ] Node transaction-flow adapter/route 能映射 Python approved/rejected/degraded/error。
- [ ] rejected/degraded/error 不伪装成 approved。
- [ ] gate 全绿。
- [ ] Codex review 确认没有执行真实交易、支付、外部 workflow 或数据库写入。

## 目标

transaction-flow 是 Web AIGC long-tail 里对整体后端迁移影响较大的 node-only 路由。本任务只迁 Python 决策边界：解析步骤、返回决策、保留 permission/audit metadata，并确保失败语义不被吞掉。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/web_aigc_transaction_flow_adapter.py`
- `tws-ai-slide-rule-python/tests/test_web_aigc_transaction_flow_runtime.py`
- `server/routes/transaction-flow.ts`
- `server/routes/node-adapters/transaction-flow-node-adapter.ts`
- `server/tests/transaction-flow-python-runtime.test.ts`
- `server/tests/transaction-flow-routes.test.ts`
- `server/tests/transaction-flow-node-adapter.test.ts`
- `shared/web-aigc-transaction-flow.ts`
- `agent-loop/tasks/backend-python-web-aigc-transaction-flow-runtime-96.md`

## 禁止扩大范围
- 不执行真实交易、支付、订单、数据库写入或外部 workflow。
- 不迁其它 Web AIGC 路由。
- 不降低 permission check 或 audit logging 语义。
- 不提交真实用户交易数据、token 或运行产物。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `webAigcTransactionFlowRuntime96Gates`。

## 成功标准

- Python 测试覆盖 approved/rejected/degraded/error、permission metadata、audit metadata。
- Node 测试确认 route/adapter 对 Python 状态映射稳定。
- 现有 transaction-flow route/adapter 测试继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
