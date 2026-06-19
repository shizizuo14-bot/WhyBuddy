# Backend Python RAG / Vector Inventory

## 结论

这一步只做盘点，不做迁移实现。当前事实可以用一句大白话概括：

> Node 侧已经有一套比较完整的 RAG/vector（检索/向量）基础设施；Python SlideRule 侧已经有不少 `python-llm`（Python 真大模型）能力，但真实 retrieval（检索）还没有接上 vector store（向量库）。

所以后续不能把 Python 现在的 `python-rag` 直接宣传成“真实向量检索已经完成”。它目前更多是 keyword RAG（关键词检索）和固定 knowledge base（知识库）兜底。

## Node 侧资产

### RAG 管线

Node 侧核心目录是 `server/rag/` 和 `shared/rag/`。

| 模块 | 代表文件 | 当前能力 |
|---|---|---|
| 配置 | `server/rag/config.ts` | 读取 `RAG_*` 环境变量，支持 embedding（向量化）、vector store（向量库）、retrieval mode（检索模式）、chunking（分块）、quota（配额）等配置。 |
| 契约 | `shared/rag/contracts.ts`, `shared/rag/api.ts` | 定义 ingestion（摄入）、chunk（分块）、retrieval（检索结果）、augmentation log（增强日志）、feedback（反馈）等数据形状。 |
| 初始化 | `server/rag/index.ts` | 组装 chunker、embedding provider、Qdrant adapter、metadata store、retriever、augmentation pipeline、feedback、lifecycle、health。 |
| 摄入 | `server/rag/ingestion/ingestion-pipeline.ts` | 清洗、去重、分块、embedding、写入 vector store。 |
| 分块 | `server/rag/chunking/*` | 支持 code、conversation、document、task result、mission log 等 source type（来源类型）。 |
| embedding | `server/rag/embedding/*` | 支持批量向量化、失败拆分重试、provider 抽象。 |
| vector store | `server/rag/store/qdrant-adapter.ts` | 用 Qdrant HTTP API 创建 collection、upsert、search、delete、health check。 |
| retrieval | `server/rag/retrieval/rag-retriever.ts` | 支持 semantic（语义）、keyword（关键词）、hybrid（混合）检索；semantic 失败时 hybrid 可降级到 keyword。 |
| augmentation | `server/rag/augmentation/rag-pipeline.ts` | 检索、rerank、token budget 分配、注入上下文、记录日志。 |
| feedback / lifecycle / observability | `server/rag/feedback/*`, `server/rag/lifecycle/*`, `server/rag/observability/*` | 反馈、冷热/清理、健康检查、指标、配额。 |

### REST 入口

| 路由 | 文件 | 用途 |
|---|---|---|
| `/api/rag/ingest` | `server/routes/rag.ts` | 单条摄入。 |
| `/api/rag/ingest/batch` | `server/routes/rag.ts` | 批量摄入。 |
| `/api/rag/search` | `server/routes/rag.ts` | 查询检索结果。 |
| `/api/rag/web-aigc/document-search` | `server/routes/rag.ts` | Web AIGC 文档搜索适配。 |
| `/api/rag/web-aigc/fragment-search` | `server/routes/rag.ts` | Web AIGC 片段搜索适配。 |
| `/api/rag/feedback` | `server/routes/rag.ts` | 记录检索反馈。 |
| `/api/rag/admin/*` | `server/routes/rag.ts` | health、metrics、purge、dead letter retry 等管理接口。 |
| `/api/vector-update` | `server/routes/vector-update.ts` | 更新 vector metadata（向量元数据）。 |
| `/api/vector-delete` | `server/routes/vector-delete.ts` | 删除 vector 记录。 |
| `/api/rag/risk-actions/vector-*` | `server/routes/web-aigc-risk-actions.ts` | Web AIGC risk action（风险动作）里的 vector insert/update/delete。 |

## Python 侧现状

### 已经是真 LLM 的 SlideRule 能力

`tws-ai-slide-rule-python/sliderule_llm/capabilities.py` 里当前 `is_python_native_capability()` 覆盖 18 个 SlideRule V5 capability（能力）。这些能力返回 `provenance="python-llm"`，意思是：它们是 Python 真 LLM 路径，不是旧 `python-rag` 罐头。

代表能力包括：

- `intent.clarify`
- `gap.ask`
- `question.expand`
- `critique.generate`
- `synthesis.merge`
- `rebuttal.resolve`
- `counter.argue`
- `structure.decompose`
- `document.draft`
- `traceability.matrix`
- `task.write`
- `instruction.package`
- `outcome.visualize`
- `ux.preview`
- `handoff.package`
- `risk.analyze`
- `evidence.search`
- `report.write`

这里要特别小心：`evidence.search` 现在是 `python-llm`，它会保留 `sources`（来源）形状，但 sources 是从模型输出文本里抽出的引用片段，不等于真实 vector retrieval（向量检索）。

### 仍是 keyword RAG / mapped path 的路径

Python 侧旧 RAG 基线主要在：

- `tws-ai-slide-rule-python/services/rag_service.py`
- `tws-ai-slide-rule-python/services/slide_rule_executor.py`
- `tws-ai-slide-rule-python/services/capability_maps.py`
- `tws-ai-slide-rule-python/routes/sliderule_full.py`

这些路径的特点：

- `rag_service.py` 里是内置 `KNOWLEDGE_BASE`。
- `retrieve_evidence()` 做的是 keyword overlap（关键词命中）和少量规则加分。
- 没有调用 Qdrant。
- 没有 embedding。
- 没有真实 collection / point / vector search 生命周期。
- `generate_with_rag()` 更像稳定生成器和证据格式兜底，不是生产级 RAG。

当前可视为 `python-rag` 的典型能力：

| capability | 当前路径 | 风险 |
|---|---|---|
| `mcp.call` | Node 会委托 Python，但 Python native LLM 列表不包含它；fallback 到 mapped/RAG 路径。 | 不应计入 `python-llm` 完成数。 |
| `skill.invoke` | 同上。 | 不应计入 `python-llm` 完成数。 |
| 非 native LLM 的其它 mapped capability | `execute_mapped_capability()` / `slide_rule_executor.py` | 结果稳定，但 evidence 来源仍是 keyword/stub baseline。 |
| `orchestrate.plan` | Python route 存在，但它是编排接口，不是 native LLM capability。 | 需要单独审计，不应混入 capability 计数。 |

### Python 配置已有但能力未接实

`tws-ai-slide-rule-python/config/settings.py` 已有：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION`
- `QWEN_EMBEDDING_MODEL`

但这些配置目前没有形成一条完整的 Python vector client（向量客户端）和 retrieval pipeline（检索管线）。所以它们是迁移入口，不是完成证据。

## 边界判断

### 可以放心说已经完成的

- Python SlideRule V5 已有一批 native LLM capability（原生大模型能力）。
- Node `SLIDERULE_V5_BACKEND=python` 的 thin proxy（薄代理）和 capability 委托链路已经比较成熟。
- Node 侧 RAG/vector 基础设施本身有比较完整的模块拆分和测试资产。

### 不能现在就说完成的

- 不能说 Python 已完成真实 vector RAG。
- 不能说 `python-rag` 等于真实外部检索。
- 不能把 `mcp.call`、`skill.invoke`、`orchestrate.plan` 算进 Python native LLM 完成数。
- 不能把 SlideRule V5 的高覆盖误报成整个 Node 后端迁移完成。

## 建议迁移顺序

### 1. `backend-python-vector-client-parity`

目标：先在 Python 建最小 vector client（向量客户端）契约，不接业务。

建议范围：

- 新增 `tws-ai-slide-rule-python/sliderule_llm/vector.py`。
- 支持配置读取：Qdrant URL、API key、collection、timeout、dimension。
- 支持最小方法：`health_check()`、`upsert()`、`search()`、`delete()`。
- 先用 fake HTTP / injectable transport 写测试，不要求本地真的起 Qdrant。

适合 AgentLoop：是。边界清楚，gate 可客观判断。

### 2. `backend-python-evidence-retrieval-parity`

目标：把 Python evidence retrieval（证据检索）从 keyword baseline 拆成明确的 retrieval service。

建议范围：

- 新增 `tws-ai-slide-rule-python/sliderule_llm/evidence.py`。
- 定义 `EvidenceSource` / `EvidenceResult` 形状。
- 支持 vector client 注入。
- vector 不可用时允许显式 fallback 到 keyword baseline，但 provenance（来源标记）必须说清楚。
- `evidence.search` 是否继续走 `python-llm` 要单独决定：可以先让它生成 brief（简报），但检索 sources 应来自 retrieval service。

适合 AgentLoop：是，但必须有很窄的 allowed files 和测试。

### 3. `mcp.call` / `skill.invoke` 真实边界审计

目标：确认它们到底应该是 tool execution（工具执行）、RAG retrieval（检索）、还是 LLM synthesis（大模型综合）。

建议范围：

- 不建议直接自动迁。
- 先做设计文档或 contract test（契约测试）。
- 明确是否允许无外部工具时 fallback。

适合 AgentLoop：只适合 audit-only（只审计）或补测试，不适合一上来让它自动实现。

### 4. `orchestrate.plan`

目标：编排计划能力比较大，应等 vector/evidence 底座更稳后再迁。

建议范围：

- 先审 Node 和 Python plan 输出契约。
- 再决定是否 native LLM、规则编排、或 RAG assisted planning（检索增强规划）。

适合 AgentLoop：暂时不适合自动实现。适合先做 inventory / proxy contract / smoke gate。

## Gate 建议

### 当前 inventory gate

本任务只要求文档存在和 mojibake（乱码）检查通过：

```powershell
if (!(Test-Path docs/backend-python-rag-inventory.md)) { throw 'missing docs/backend-python-rag-inventory.md' }; node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-rag-inventory.md docs/backend-python-rag-inventory.md
```

### 下一片 vector client gate

建议：

```powershell
cd tws-ai-slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_vector_client_parity.py tests/test_config.py -q --tb=short
node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-vector-client-parity.md tws-ai-slide-rule-python/sliderule_llm/vector.py tws-ai-slide-rule-python/tests/test_vector_client_parity.py
```

### 下一片 evidence retrieval gate

建议：

```powershell
cd tws-ai-slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_evidence_retrieval_parity.py tests/test_capabilities.py -q --tb=short
node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-evidence-retrieval-parity.md tws-ai-slide-rule-python/sliderule_llm/evidence.py tws-ai-slide-rule-python/tests/test_evidence_retrieval_parity.py
```

## 风险清单

- **命名风险**：`python-rag` 这个名字会让人误以为真实向量检索已完成，但当前很多路径只是 keyword/stub baseline。
- **provenance 风险**：`sources` 字段存在不代表 source 来自 vector retrieval。`python-llm` 的 sources 可能只是模型文本片段。
- **配置风险**：Python 有 Qdrant 配置字段，但配置存在不等于客户端已接入。
- **scope 风险**：Node RAG/vector 是全后端级资产，SlideRule V5 只是其中一个消费方；不能只按 SlideRule 能力覆盖估算整体迁移。
- **自动化风险**：vector/evidence 涉及数据、密钥、外部服务，不适合让 AgentLoop 在没有 fake transport 和 strict gate 的情况下直接接真实环境。

## 本次任务状态

- 本任务是 audit/inventory（审计/盘点）任务。
- 没改业务代码。
- 没创建 vector 数据。
- 没写入 Qdrant key、数据库密码或真实环境配置。
- 下一步建议执行 `backend-python-vector-client-parity`，再执行 `backend-python-evidence-retrieval-parity`。
