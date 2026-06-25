# 后端 NodeJS 到 Python 迁移：evidence retrieval parity

## 执行状态

- 状态：已完成 — evidence retrieval 诚实来源边界已落地
- 目标：让 Python evidence retrieval（证据检索）从“LLM 生成说明”升级到“可接真实检索结果或诚实 fallback”
- 前置：`backend-python-vector-client-parity.md` 建议先完成

### 状态清单

- [x] 已执行本地实现
- [x] Python evidence retrieval 接口已建立
- [x] sources（来源）字段有真实/诚实来源
- [x] fallback（回退）时不会伪装成真实 RAG
- [x] gate 全绿
- [x] 人工 review（审查）已确认 diff 干净

## 最近执行

- 最近执行：2026-06-19
- 执行方式：Codex 本地实现，测试使用 fake vector client / fake embedding，不连接真实检索服务
- 新增实现：`slide-rule-python/sliderule_llm/evidence.py`
- 关键行为：`sources[].provenance` 可区分 `retrieved` / `fallback` / `generated`
- gate 结果：`evidenceRetrievalGates` 通过

## 目标

补齐 Python 侧证据检索接口，让 `evidence.search` 等能力能消费检索结果；如果当前没有真实检索，也必须明确 provenance（来源）和 fallback 状态，不能假装有 RAG 命中。

## 允许修改的文件

- `slide-rule-python/sliderule_llm/evidence.py`
- `slide-rule-python/sliderule_llm/vector.py`
- `slide-rule-python/sliderule_llm/capabilities.py`
- `slide-rule-python/tests/test_evidence_retrieval_parity.py`
- `slide-rule-python/tests/test_capabilities.py`
- `agent-loop/tasks/backend-python-evidence-retrieval-parity.md`

## 禁止扩大范围

- 不连接真实生产检索服务。
- 不迁非 evidence capability。
- 不提交 data/log/cache。
- 不制造假 sources。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `evidenceRetrievalGates`。

## 成功标准

- `tests/test_evidence_retrieval_parity.py` 全绿。
- `evidence.search` 的 sources 字段能区分 retrieved / fallback / generated。
- 没有真实检索命中时，provenance 不夸大。
