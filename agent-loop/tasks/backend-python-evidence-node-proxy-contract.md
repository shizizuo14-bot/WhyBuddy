# 后端 NodeJS 到 Python 迁移：evidence retrieval Node proxy contract

## 执行状态

- 状态：已完成
- 目标：锁住 Node 调 Python evidence retrieval（证据检索）的代理契约
- 角色分工：Grok 负责补最小 Node/Python contract test；Codex 负责审查是否越界改大路由

### 状态清单

- [x] 已执行 AgentLoop
- [x] Python evidence contract 测试全绿
- [x] Node route/proxy contract 测试全绿
- [x] degraded/fallback provenance（降级/回退来源）有明确测试
- [x] gate 全绿
- [x] Codex review（审查）已确认没有把 fallback 当作生产 retrieval 成功

## 目标

在 Python evidence retrieval 已有契约之后，补 Node 到 Python 的薄代理边界：Node 在 Python mode 下调用 Python evidence retrieval 时，必须保留 provenance（来源）、sources（来源列表）、fallback reason（回退原因）和错误形状。

这个任务不做真实检索接线，只锁住跨进程契约，避免后续迁移时 Node 把 Python fallback 误当作真实 RAG 成功。

## 允许修改的文件

- `server/sliderule/python-delegation.ts`
- `server/routes/sliderule.ts`
- `server/routes/__tests__/sliderule.evidence-python-proxy-contract.test.ts`
- `slide-rule-python/tests/test_evidence_retrieval_parity.py`
- `agent-loop/tasks/backend-python-evidence-node-proxy-contract.md`

## 禁止扩大范围

- 不改 `server/sliderule/orchestrate-plan.ts`。
- 不改 UI。
- 不接真实 Qdrant 或真实 embedding provider。
- 不改非 evidence capability。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `evidenceNodeProxyContractGates`。

## 成功标准

- Node proxy test 能验证 `provenance`、`sources`、`fallbackReason` 被原样保留。
- Python evidence parity test 仍然通过。
- Python 服务失败时 Node 返回明确 degraded/error shape，不制造假成功。
- TypeScript / mojibake gate 通过。
