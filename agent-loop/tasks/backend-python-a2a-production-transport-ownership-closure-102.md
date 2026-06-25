# 后端 NodeJS 迁 Python：A2A production transport ownership closure 102

## 执行状态

- 状态：待执行
- 目标：对 A2A registry、session、stream transport、cancel、chat、report、analytics 的 production ownership 做 102 收口。优先补 Python-owned runtime；不能接管的必须输出 retained / blocked decision。
- 角色分工：worker 负责 Python ownership service、Node A2A bridge 和测试；reviewer 必须确认没有把 bounded invoke/stream envelope 写成完整 A2A 生产接管。

### 状态清单

- [x] Python 能输出 A2A production transport ownership decision。
- [x] Node bridge 能消费 registry/session/stream/cancel/chat/report/analytics decision。
- [x] 测试覆盖 `python-owned`、`node-retained`、`blocked`、`external-agent-required`。
- [x] gate 全绿。
- [x] review 确认未破坏 A2A 协议兼容和 stream safe failure。

## 背景

101 已补 core route cutover decision，但 A2A registry/sessions/stream/cancel + chat/reports/analytics 仍多为 node-owned-gap 或 production-owned。102 要把 production transport 的真实归属和阻塞原因固化。

## 允许修改的文件

- `slide-rule-python/services/a2a_production_transport_ownership_closure.py`
- `slide-rule-python/services/a2a_core_route_cutover.py`
- `slide-rule-python/services/a2a_runtime.py`
- `slide-rule-python/tests/test_a2a_production_transport_ownership_closure_102.py`
- `server/routes/a2a-python-runtime.ts`
- `server/routes/__tests__/a2a-production-transport-ownership-closure-102.test.ts`
- `server/routes/__tests__/a2a-core-route-cutover-101.test.ts`
- `server/core/a2a-client.ts`
- `server/core/a2a-server.ts`
- `shared/a2a/contracts.ts`
- `shared/a2a-protocol.ts`
- `agent-loop/tasks/backend-python-a2a-production-transport-ownership-closure-102.md`

## 禁止扩大范围

- 不把 bounded stream/invoke 测试写成完整 production transport 接管。
- 不删除既有 A2A protocol、route、stream 测试。
- 不发起不可控外部 agent 调用。
- 不把 `external-agent-required` 写成 `python-owned`。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实外部响应。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `a2aProductionTransportOwnershipClosure102Gates`。

## 成功标准

- Python service 输出 A2A production transport ownership 分类。
- Node 测试确认 bridge 消费分类并保持协议兼容。
- stream/cancel/chat/report/analytics 不能接管时有明确 retained/blocked 证据。
- 所有 gate 通过。

## 给 worker 的大白话

A2A 不是只有 invoke 和 stream envelope。最后要看 registry、session、transport、cancel、chat/report 这些生产路径到底归谁；不能接就写清楚，不要装作接了。
