# 后端 NodeJS 到 Python 迁移：real vector retrieval smoke

## 执行状态

- 状态：已完成
- 目标：把 Python evidence retrieval（证据检索）从 contract（契约）推进到可测的 real vector retrieval smoke（真实向量检索冒烟）
- 角色分工：Grok 负责补最小可测实现与测试；Codex 负责审查是否夸大成生产级 RAG

### 状态清单

- [x] 已执行 AgentLoop
- [x] 已新增或更新 `slide-rule-python/tests/test_real_vector_retrieval_smoke.py`
- [x] fake/in-memory vector store 能跑通 retrieved 路径
- [x] fallback 路径仍然诚实标记，不伪装成 retrieved
- [x] gate 全绿
- [x] Codex review（审查）已确认没有接真实 Qdrant、真实 embedding key 或真实 LLM key

## 目标

在 `backend-python-evidence-vector-contract` 之后，补一个更接近真实链路的 smoke gate（冒烟门禁）：查询能经过 embedding provider（向量生成器）和 vector client（向量客户端）拿到 retrieved source（真实检索来源），但实现仍然使用 fake/in-memory 组件，不连接生产 Qdrant。

这个任务的价值是把“sources 字段契约”往“真实检索链路雏形”推进一步，为整体 NodeJS 后端迁 Python 冲到 20%+ 打底。

## 允许修改的文件

- `slide-rule-python/sliderule_llm/evidence.py`
- `slide-rule-python/sliderule_llm/vector.py`
- `slide-rule-python/tests/test_real_vector_retrieval_smoke.py`
- `slide-rule-python/tests/test_evidence_vector_contract.py`
- `agent-loop/tasks/backend-python-real-vector-retrieval-smoke.md`

## 禁止扩大范围

- 不连接真实 Qdrant。
- 不提交 embedding 数据、缓存、日志或 `.env`。
- 不发真实 LLM 请求。
- 不把 fake/in-memory smoke 说成生产级 RAG。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `realVectorRetrievalSmokeGates`。

## 成功标准

- 新 smoke test 能证明 retrieved 路径经过 fake embedding + fake vector client。
- retrieved source 保留 `provenance="retrieved"`、`score`、`sourceId`。
- vector 不可用或无命中时仍然返回 `fallback`，不能伪装成 retrieved。
- 所有 gate 通过，且不依赖外部服务和真实 key。
