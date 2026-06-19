# 后端 NodeJS 到 Python 迁移：evidence runtime provenance

## 执行状态

- 状态：待执行
- 目标：把 evidence retrieval（证据检索）运行时的 provenance（证据来源）和 degraded（降级）形状锁清楚
- 角色分工：Grok 负责补运行时分类和测试；Codex 负责审查是否把 fallback 伪装成 retrieved

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Python test 覆盖 retrieved / fallback / generated / degraded 四类来源
- [ ] Node proxy contract（代理契约）没有丢失 provenance 字段
- [ ] 错误路径有明确 `fallbackReason` 或 `error`
- [ ] gate 全绿
- [ ] Codex review（审查）确认来源字段没有混淆

## 目标

现在 evidence（证据）链路已经有 retrieval parity、vector contract 和 Node proxy contract。下一步要把 runtime provenance 做硬：哪些结果是真检索，哪些是 fallback，哪些是 generated（生成兜底），哪些是 degraded（降级失败），不能混在一个模糊字段里。

这个任务重点是“诚实标记”，不是提升召回质量。

## 允许修改的文件

- `tws-ai-slide-rule-python/sliderule_llm/evidence.py`
- `tws-ai-slide-rule-python/tests/test_evidence_runtime_provenance.py`
- `tws-ai-slide-rule-python/tests/test_evidence_retrieval_parity.py`
- `server/routes/__tests__/sliderule.evidence-python-proxy-contract.test.ts`
- `agent-loop/tasks/backend-python-evidence-runtime-provenance.md`

## 禁止扩大范围

- 不改生产数据库、真实 vector store 或真实 LLM key。
- 不新增模糊 provenance 值。
- 不为了过测试删除或弱化已有 evidence contract。
- 不改无关 SlideRule capability。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `evidenceRuntimeProvenanceGates`。

## 成功标准

- Python test 明确覆盖 `retrieved`、`fallback`、`generated`、`degraded` 四类结果。
- Node proxy test 确认 `provenance`、`sources`、`fallbackReason`、`evidenceProvenance` 不被吞掉。
- 错误和无命中路径不再伪装成成功检索。
- 所有 gate 通过。
