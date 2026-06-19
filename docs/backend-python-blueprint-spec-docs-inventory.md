# Backend Python Blueprint Spec-Docs Inventory

## 结论

这一步只做 inventory（盘点），不迁业务代码。

大白话结论：

> Blueprint/spec-docs（蓝图规格文档）现在仍是 Node 侧主导。Node 已经有比较成熟的 prompt（提示词）、schema（结构校验）、fallback（回退）、progress events（进度事件）和 artifact（产物）落盘链路。Python 下一步最适合先做一个很小的 proxy contract（代理契约），只承接“单份文档生成”，不要一口气迁整个 Blueprint。

最小可迁切片是：

> Python 提供 `/api/blueprint/spec-documents/generate-one` 这类单文档接口；Node 仍负责 batch loop（批量循环）、SPEC tree（规格树）、artifact 落盘、事件流、fallback/template（模板回退）。

这样风险最低，因为 Node 现在最复杂、最有价值的部分不是“调用一次 LLM”，而是调用前后的 orchestration（编排）和降级闭环。

## Node 侧入口

| 入口 | 文件 | 作用 |
|---|---|---|
| `POST /api/blueprint/jobs/:jobId/spec-documents` | `server/routes/blueprint.ts` | 触发 spec-docs 阶段生成。 |
| `GET /api/blueprint/jobs/:jobId/spec-documents` | `server/routes/blueprint.ts` | 读取已生成文档。 |
| `GET /api/blueprint/jobs/:jobId/spec-documents/export` | `server/routes/blueprint.ts` | 导出单文档或整树文档包。 |
| `POST /api/blueprint/jobs/:jobId/spec-documents/:documentId/review` | `server/routes/blueprint.ts` | 文档 review（审查）状态推进。 |

## Node 侧核心实现

### 单文档 LLM service

核心文件：

- `server/routes/blueprint/spec-documents/service.ts`
- `server/routes/blueprint/spec-documents/prompt.ts`
- `server/routes/blueprint/spec-documents/schema.ts`
- `server/routes/blueprint/spec-documents/render.ts`
- `server/routes/blueprint/spec-documents/policy.ts`

这条路径的形状是单文档：

- 输入：`jobId`、`job`、`request`、`specTreeNode`、`targetDocumentType`、`primaryRoute`、clarification（澄清信息）、domain context（领域上下文）、upstream evidence（上游证据）。
- 文档类型：`requirements` / `design` / `tasks`。
- LLM 输出：`title`、`summary`、`sections[]`、可选 `status`。
- 渲染：`renderSectionsToMarkdown()` 把 sections 渲染成 Markdown。
- 产物来源：`generationSource="llm" | "llm_fallback" | "template"`。
- 安全：`policy.ts` 负责 timeout、section 上限、error 脱敏、API key / token / email 脱敏。

### 批量 spec-docs 生成工厂

核心文件：

- `server/routes/blueprint/spec-docs-llm-generation.ts`
- `server/routes/blueprint/assemble-spec-documents-from-llm-cache.ts`

这条路径更大：

- 按 SPEC tree 节点 root-first DFS（根优先深度遍历）处理。
- 每个节点可能生成三份 Markdown：`requirements`、`design`、`tasks`。
- 支持 lite agent runtime（轻量 agent 运行时）或 direct LLM call（直接大模型调用）。
- 支持 key pool（密钥池）并发，但默认更偏向主 LLM 串行路径。
- 每个节点独立 timeout（超时）、独立 fallback（回退）。
- 生成完成后由 Node 继续组装 artifact、progress event、provenance（来源记录）。

## Prompt / Response Shape

### Prompt

`buildSpecDocumentsPrompt()` 目前已经是纯函数：

- 固定 prompt id：`blueprint.spec-documents.v1`。
- 支持 `zh-CN` / `en-US`。
- 按目标文档类型分支：requirements / design / tasks。
- user payload 字段顺序固定，便于 prompt fingerprint（提示词指纹）稳定。
- 上游输入包括 intake、clarification、primaryRoute、projectContext、upstreamEvidence、outputSchema。

### Response

`SpecDocumentsLlmResponseSchema` 当前要求：

- `title`: string，1 到 200。
- `summary`: string，1 到 500。
- `sections`: 2 到 20 个。
- `section.id`: lowercase kebab-case（小写短横线格式），最长 64。
- `section.title`: 1 到 200。
- `section.summary`: 1 到 500。
- `section.body`: 1 到 8000。
- 可选 `status`: `draft` / `reviewing` / `accepted` / `rejected`。

未知字段会被 zod strip（静默丢弃）。这对 Python proxy 很重要：Python 返回的字段不能依赖 Node 未声明字段。

## 现有测试资产

| 测试 | 文件 | 覆盖点 |
|---|---|---|
| 单文档 service | `server/routes/blueprint/spec-documents/service.test.ts` | happy path、非 JSON、schema fail、apiKey missing、not enabled、timeout、redaction、per-document isolation。 |
| prompt | `server/routes/blueprint/spec-documents/prompt.test.ts` | prompt determinism（确定性）、locale、字段排序、三类文档分支。 |
| schema | `server/routes/blueprint/spec-documents/schema.test.ts` | zod shape、边界长度、重复 section id、status enum、ReDoS 哨兵。 |
| render | `server/routes/blueprint/spec-documents/render.test.ts` | sections 到 Markdown。 |
| route integration | `server/routes/blueprint/__tests__/spec-docs-generate-integration.test.ts` | event stream（事件流）、fast path assembly（快速组装）、template fallback。 |
| resilience | `server/routes/blueprint/__tests__/spec-docs-batch-resilience*.test.ts` | 批量生成失败隔离、进度稳定性。 |

这些测试说明：后续 Python proxy 不能只测“返回了 200”。必须测 schema、fallback、事件不乱、Node 不重复调用旧 service。

## Python 可承接边界

### 适合第一刀迁到 Python 的

只迁“单份文档生成”：

```text
输入：targetDocumentType + specTreeNode + request/context
输出：generationSource + title + summary + content/status + provenance
```

Python 侧可以先新增：

- `tws-ai-slide-rule-python/routes/blueprint_spec_docs.py`
- `tws-ai-slide-rule-python/sliderule_llm/blueprint_spec_docs.py`
- `tws-ai-slide-rule-python/tests/test_blueprint_spec_docs_proxy.py`

### 暂时不该迁到 Python 的

这些仍留在 Node 更稳：

- `generateSpecDocuments()` 的 batch loop（批量循环）。
- progress event（进度事件）和前端实时状态。
- artifact/job store（产物/任务存储）。
- export/review/version 路由。
- template fallback（模板回退）最终组装。
- 和现有 Blueprint UI 的联动。

原因很简单：这些不是单次 LLM 调用，而是应用级状态机。现在迁它们，风险会远大于收益。

## 建议的最小 Proxy Contract

### Python endpoint

建议后续切片提供：

```text
POST /api/blueprint/spec-documents/generate-one
```

请求体建议：

```json
{
  "jobId": "job-1",
  "targetDocumentType": "requirements",
  "specTreeNode": {
    "id": "node-1",
    "title": "Authentication Module",
    "summary": "Handles login and session management",
    "type": "route_step",
    "priority": 1,
    "dependencies": [],
    "outputs": []
  },
  "request": {
    "targetText": "Build a user authentication system",
    "githubUrls": []
  },
  "primaryRoute": {
    "id": "route-1",
    "title": "Main Route",
    "summary": "Primary execution path",
    "steps": []
  },
  "locale": "zh-CN"
}
```

响应建议：

```json
{
  "generationSource": "llm",
  "title": "Requirements: Authentication Module",
  "summary": "Requirement summary",
  "content": "# Requirements: Authentication Module\n\n...",
  "status": "draft",
  "promptId": "blueprint.spec-documents.v1",
  "model": "gpt-5.5",
  "promptFingerprint": "sha256:...",
  "responseDigest": "sha256:..."
}
```

失败时：

```json
{
  "generationSource": "llm_fallback",
  "error": "schema validation failed: ...",
  "promptId": "blueprint.spec-documents.v1",
  "model": "gpt-5.5",
  "promptFingerprint": "sha256:..."
}
```

### Node integration

Node 后续只做一层可开关代理：

- 默认仍走现有 Node `createSpecDocumentsLlmService()`。
- `BLUEPRINT_SPEC_DOCS_PYTHON_PROXY=true` 时，单文档 service 内调用 Python。
- Python 返回 `llm` 才进入 Node 的 LLM fast path。
- Python 返回 `llm_fallback` 或请求失败时，Node 沿用现有 fallback/template 语义。
- Node 仍做 zod schema 或等价 shape 校验，不能盲信 Python。

## Gate 建议

### 当前 inventory gate

```powershell
if (!(Test-Path docs/backend-python-blueprint-spec-docs-inventory.md)) { throw 'missing docs/backend-python-blueprint-spec-docs-inventory.md' }; node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-blueprint-spec-docs-inventory.md docs/backend-python-blueprint-spec-docs-inventory.md
```

### 下一片 proxy contract gate

建议使用 queue 里的 `blueprintProxyGates`：

```powershell
cd tws-ai-slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_blueprint_spec_docs_proxy.py tests/test_config.py -q --tb=short
pnpm exec vitest run --config vitest.config.server.ts server/routes/__tests__/blueprint.spec-docs-python-proxy.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
node agent-loop/src/check-mojibake.js agent-loop/tasks/backend-python-blueprint-spec-docs-proxy-contract.md tws-ai-slide-rule-python/routes/blueprint_spec_docs.py server/routes/__tests__/blueprint.spec-docs-python-proxy.test.ts
```

## 风险

- **状态机风险**：spec-docs 不是简单 LLM 调用，Node 还负责 job/artifact/event/review/export。第一刀不应迁这些。
- **双路径风险**：Node 当前有 `specDocumentsLlmService` 和 `specDocsLlmGeneration` 两条 LLM 相关路径，后续 proxy 必须选清楚接在哪一层。
- **schema 风险**：Python 如果直接返回 Markdown 而不保留 title/summary/status/provenance，会破坏 Node 现有 provenance 和 review 语义。
- **fallback 风险**：Python 失败不能让 Node 整个 batch 崩；必须映射成现有 `llm_fallback` / template fallback。
- **密钥风险**：Node 现在有成熟 redaction（脱敏）策略；Python 返回错误前也要脱敏，Node 仍要二次兜底。

## 推荐下一步

1. 执行 `backend-python-blueprint-spec-docs-proxy-contract`。
2. 只新增 Python 单文档 endpoint 和 Node 代理测试。
3. 不迁 batch loop、不迁 artifact store、不迁 UI。
4. 等单文档 proxy gate 全绿后，再做 `backend-python-blueprint-spec-docs-smoke-gate`。

## 本次任务状态

- 本任务是 audit/inventory（审计/盘点）任务。
- 没改 Blueprint/Autopilot 业务代码。
- 没改 UI。
- 没发 live LLM。
- 下一步建议执行 `backend-python-blueprint-spec-docs-proxy-contract`。
