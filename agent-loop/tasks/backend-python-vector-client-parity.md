# 后端 NodeJS 到 Python 迁移：vector client parity

## 执行状态

- 状态：已完成 — Python vector client 最小契约已落地
- 目标：建立 Python vector client（向量客户端）最小等价能力
- 前置：`backend-python-rag-inventory.md` 建议先完成
- 注意：用 fake/in-memory client 或 mock Qdrant，不连真实生产向量库。

### 状态清单

- [x] 已执行本地实现
- [x] Python vector config（向量配置）可读取
- [x] query/search（查询/搜索）接口有最小实现
- [x] timeout/error handling（超时/错误处理）可测
- [x] gate 全绿
- [x] 人工 review（审查）已确认 diff 干净

## 最近执行

- 最近执行：2026-06-19
- 执行方式：Codex 本地实现，测试使用 fake transport，不连接真实 Qdrant
- 新增实现：`slide-rule-python/sliderule_llm/vector.py`
- 新增测试：`slide-rule-python/tests/test_vector_client_parity.py`
- gate 结果：`vectorGates` 通过

## 目标

为 Python evidence retrieval（证据检索）补最小 vector client 抽象，先锁住接口和错误语义，不追求完整生产检索效果。

## 允许修改的文件

- `slide-rule-python/sliderule_llm/vector.py`
- `slide-rule-python/sliderule_llm/config.py`
- `slide-rule-python/tests/test_vector_client_parity.py`
- `slide-rule-python/tests/test_config.py`
- `agent-loop/tasks/backend-python-vector-client-parity.md`

## 禁止扩大范围

- 不连接真实 Qdrant / 生产数据库。
- 不提交向量数据。
- 不改 Node vector/RAG 实现。
- 不迁业务 capability。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `vectorGates`。

## 成功标准

- `tests/test_vector_client_parity.py` 全绿。
- Python vector client 支持配置读取、mock query、timeout/error 分类。
- 不破坏现有 config 测试。
