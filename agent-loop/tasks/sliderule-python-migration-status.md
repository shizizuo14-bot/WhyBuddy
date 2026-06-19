# SlideRule Python 迁移任务状态

这个文件是给人看的迁移总表，用来回答“哪一片已经执行完、哪一片还没做”。详细的机器运行记录仍然放在 `.agent-loop/latest/` 和 `.agent-loop/runs/`，这些目录是运行产物，不提交。

## 分层进度口径

这些比例只用于把范围说清楚，不要把它们混成一个总数。尤其不能把 SlideRule 某条链路的高进度，误报成整个 NodeJS 后端的迁移进度。

| 范围 | 当前判断 | 进度条 | 说明 |
|---|---:|---|---|
| 整体 NodeJS 后端迁 Python | 约 18-22% | `[██░░░░░░░░]` | 大分母仍是整个 NodeJS backend。SlideRule V5 能力覆盖、LLM infra、RAG/vector/evidence、Blueprint/spec-docs proxy、`mcp.call`/`skill.invoke`/`orchestrate.plan` contract（契约）边界继续推进；但 Blueprint/Autopilot 主状态机、auth/admin/audit/permission、executor/tasks 等大块仍在 Node。 |
| SlideRule V5 子系统迁移 | 约 88-91% | `[█████████░]` | 对话、审议、结构化报告、delivery chain（交付链）、`outcome.visualize`、`ux.preview`、evidence provenance（证据来源）、runtime config（运行配置）和一批深水区 contract gate（契约门禁）已成片通过；剩余重点是真实 `mcp.call`/`skill.invoke` runtime（运行时）、完整 `orchestrate.plan` 迁移、真实 vector retrieval（向量检索）生产接线和部署观测。 |
| SlideRule V5 Node 到 Python 薄代理链路 | 约 96-98% | `[██████████]` | Python mode、delegation helper、timeout（超时）、health check（健康检查）、contract smoke、delivery/visual/artifact capability 白名单已比较完整；仍需继续守住 live smoke、部署配置和非 capability 编排边界。 |
| Python V5 可运行基线 | 约 85-89% | `[█████████░]` | Python 服务、核心 smoke、contract expansion、native LLM capability 路径、vector client、evidence provenance、runtime config、real vector retrieval smoke（真实向量检索冒烟测试）和 orchestrate golden smoke（编排黄金样例冒烟测试）已稳定；生产级检索、部署策略和运行观测仍要继续补。 |
| LLM infra 迁移 | 约 50-58% | `[██████░░░░]` | Python `sliderule_llm` 已支撑 chat、JSON hardening、基础 pool、provider/model fallback、telemetry metadata、vector client、stream contract（流式契约）和 pool resilience（池子韧性）；多模态、真实成本计算、完整并发/熔断/观测等全后端底座仍未完全对齐 Node。 |
| 能力覆盖 | 高 | `[████████░░]` | 当前已记录的主要 SlideRule V5 `python-llm` 能力包括对话、审议、report、structure、risk/evidence、delivery chain、`outcome.visualize`、`ux.preview`；未审计边界仍不能自动视为完成。 |

## 重要口径

2026-06-19 的 15 项 migration queue（迁移队列）已经收尾并分片提交，但这批主要是 **Codex 人工接管实现 + gate 验证**，不是 Grok 自动批量干活的证明。

2026-06-20 的 8 项 backend migration push（后端迁移推进队列）也已收尾并分片提交：real vector retrieval smoke（真实向量检索冒烟测试）、evidence Node proxy contract（证据 Node 代理契约）、`orchestrate.plan` contract（编排计划契约）、`orchestrate.plan` golden smoke（黄金样例冒烟测试）、`mcp.call` contract、`skill.invoke` contract、LLM stream contract（流式契约）和 LLM pool resilience（池子韧性）都已经通过对应 gate（门禁）。

这代表：

- 这些迁移切片本身已经有代码、测试、文档和 commit。
- AgentLoop 的任务拆分、gate、review 边界逐步变清楚了。
- 但还不能说“Grok 已经能稳定自动迁移”。下一批应该继续验证 `Grok worker（工人） + Codex boundary review（边界审查）` 这条真实闭环。
- 也不能把 contract（契约）完成宣传成 runtime（运行时）完成。`mcp.call`、`skill.invoke` 和 `orchestrate.plan` 现在是边界更硬了，不是完整运行时都迁到 Python 了。

## 状态规则

- `[x]`：已经实现并通过当前记录的 gate 或 live 验证。
- `[ ]`：还没有迁移，或没有足够验证证据。
- `provenance="python-llm"`：Python 真 LLM 输出，不是旧 RAG 罐头。
- `provenance="python-rag"`：仍走旧 Python mapped/RAG 路径，后续需要按能力逐片替换。

## 能力迁移清单

- [x] `intent.clarify`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `gap.ask`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `question.expand`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `critique.generate`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `synthesis.merge`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `rebuttal.resolve`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `counter.argue`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `structure.decompose`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `report.write`：已迁到 Python native JSON LLM（Python 原生 JSON 大模型）路径，返回 `python-llm`。
- [x] `risk.analyze`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `evidence.search`：已迁到 Python 真脑子，返回 `python-llm`，并保留 sources（来源）形状。
- [x] `document.draft`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `traceability.matrix`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `task.write`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `instruction.package`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `outcome.visualize`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `ux.preview`：已迁到 Python 真脑子，返回 `python-llm`。
- [x] `handoff.package`：已迁到 Python 真脑子，返回 `python-llm`。
- [ ] 其它未建任务/未审计的 SlideRule V5 能力：不能按已迁移处理。

## 最近验证记录

### `gap.ask`

- 最近执行：`loop` 结束时会自动回写；也可手动执行 `npm run sync:task-status -- --task agent-loop/tasks/migrate-sliderule-gap-ask.md --include-migration-status`

- AgentLoop 报告：`.agent-loop/latest/final-report.md`
- 预期结果：`DONE_GATE_ONLY` / `runMode=gate-only`

已记录通过的 gate：

- [x] Python pytest：`tests/test_capabilities.py tests/test_config.py tests/test_v5_smoke.py tests/test_v5_contract_expansion.py`
- [x] Node vitest：`sliderule.execute-capability.test.ts` 和 `sliderule.live-delegation.test.ts`
- [x] TypeScript：`pnpm exec tsc --noEmit --pretty false`
- [x] mojibake：`node agent-loop/src/check-mojibake.js ...`
- [x] 手工 live smoke：隔离端口验证 `intent.clarify` / `gap.ask` 返回 `python-llm`

### `intent.clarify`

- 状态：已实现并验证通过
- 结果：Node 在 Python mode 下委托 Python，Python 返回 `python-llm`
- 这条也是 gate-only 验证闭环，不代表 AgentLoop 这轮做了 Grok 自动修复。
- 注意：旧文档里的 `python-rag` 说法已经过时；真脑子路径应记录为 `python-llm`

### `question.expand`

- 状态：已实现并验证通过
- AgentLoop run id：`2026-06-17T02-07-11-436Z`
- AgentLoop 结果：`DONE_GATE_ONLY`
- 运行模式：`gate-only`
- Grok 已运行：`false`
- Codex 已运行：`false`
- 结果：Node 在 Python mode 下委托 Python，Python 返回 `python-llm`
- 说明：这条是对话类能力，沿用 markdown 输出策略；不是结构化 JSON 能力迁移模板。

已记录通过的 gate：

- [x] Python pytest：`tests/test_capabilities.py tests/test_config.py tests/test_v5_smoke.py tests/test_v5_contract_expansion.py`
- [x] Node vitest：`sliderule.execute-capability.test.ts` 和 `sliderule.live-delegation.test.ts` 默认 gate
- [x] TypeScript：`pnpm exec tsc --noEmit --pretty false`
- [x] mojibake：`node agent-loop/src/check-mojibake.js ...`

### RAG/vector 当前结论

2026-06-19 已完成 `backend-python-rag-inventory` 盘点，报告见 `docs/backend-python-rag-inventory.md`。

大白话结论：Node 侧已经有比较完整的 RAG/vector（检索/向量）基础设施；Python SlideRule 侧当前已经有 18 个 `python-llm`（Python 真大模型）能力，但真实 retrieval（检索）还没有接上 vector store（向量库）。现有 `services/rag_service.py` 主要是 keyword RAG（关键词检索）和内置 knowledge base（知识库）兜底，不能把它宣传成生产级 vector RAG。

2026-06-20 已补 `backend-python-real-vector-retrieval-smoke`，把 real vector retrieval（真实向量检索）的最小 smoke（冒烟）路径锁住。注意：这代表检索链路有了可测入口和契约，不代表生产级 RAG（检索增强生成）已经完整接好。

因此接下来顺序应是：

1. 继续把真实 vector retrieval（向量检索）从 smoke（冒烟）推进到 production wiring（生产接线），明确 vector store（向量库）、fallback（回退）和 evidence provenance（证据来源）的运行时行为。
2. `mcp.call` / `skill.invoke`：已经完成 contract（契约）边界锁定，下一步才是真 runtime（运行时）迁移。
3. `orchestrate.plan`：已经完成 Python contract（Python 契约）和 golden smoke（黄金样例冒烟），下一步才是更大编排迁移，不混入 native LLM 完成数。

### Blueprint/spec-docs 当前结论

2026-06-19 已完成 `backend-python-blueprint-spec-docs-inventory` 盘点，报告见 `docs/backend-python-blueprint-spec-docs-inventory.md`。

大白话结论：Blueprint/spec-docs（蓝图规格文档）仍是 Node 侧主导。Node 已有 prompt（提示词）、schema（结构校验）、fallback（回退）、progress events（进度事件）和 artifact（产物）落盘链路。Python 下一步最适合先承接“单份文档生成”的 proxy contract（代理契约），不要一口气迁整个 Blueprint 状态机。

已完成的边界：

1. `backend-python-blueprint-spec-docs-proxy-contract`：Python 已提供单文档生成 endpoint，Node 已支持开关式 proxy（代理）。
2. `backend-python-blueprint-spec-docs-smoke-gate`：已补默认安全 smoke gate（冒烟门禁），不依赖真实 LLM key。
3. `backend-python-runtime-config-boundary`：已固化 Node 调 Python 的 base URL、timeout（超时）、proxy（代理）规则、health check（健康检查）和错误分类。

仍然不能过度宣传：Blueprint batch loop（批量循环）、artifact store（产物存储）、review/export/UI 仍留在 Node。当前完成的是“单文档生成代理边界”，不是整个 Blueprint 迁移。

## 整体迁移进度

### 当前结论

Phase 0 盘点之后，batch-2、batch-3、15 项 migration queue 和 8 项 backend migration push 已继续推进：**整体 NodeJS 后端迁 Python 当前按约 18-22% 口径记录**。这是整体后端的大分母口径，不是 SlideRule 单子系统口径；SlideRule V5 单子系统已经明显高于这个比例。

关键原因：

- `server/` 和 `shared/` 的主要资产仍在 Node/TypeScript，尤其是 Blueprint/Autopilot、LLM infra、RAG/vector、auth/admin/audit/permission、executor/tasks、web-aigc 工具路由。
- `tws-ai-slide-rule-python/` 当前主要覆盖 SlideRule V5 baseline 和一批 native LLM capability（原生大模型能力），不是整个后端的 Python 替代服务。
- `intent.clarify`、`gap.ask`、`question.expand`、审议族、`report.write`、`structure.decompose`、`risk.analyze`、`evidence.search`、batch-3 delivery chain（交付链）已是真 LLM 或 Python native JSON LLM。
- 最近 batch-3、15 项 migration queue 和 8 项 backend migration push 里，多数实现由 Codex 人工接管完成，并且每片跑过对应 gate；这代表迁移切片本身前进，不代表 Grok 自动修复能力或整个后端迁移完成。
- 8 项 backend migration push 的价值主要是把深水区边界变硬：真实检索 smoke、evidence proxy、`mcp.call`、`skill.invoke`、`orchestrate.plan`、LLM stream、LLM pool resilience 都有了更明确的测试和契约。

Phase 0 盘点任务文档：`agent-loop/tasks/backend-python-phase0-inventory.md`

LLM infra 审计任务文档：`agent-loop/tasks/backend-python-llm-infra-audit.md`

LLM config parity 任务文档：`agent-loop/tasks/backend-python-llm-config-parity.md`

### LLM infra 当前结论

`tws-ai-slide-rule-python/sliderule_llm/` 已经是真实现，不是旧 `services/*.py` 那类罐头 stub。它能做主 LLM 配置、基础 chat/responses 调用、基础 JSON 解析和基础 pool 调用，因此可以支撑当前几片 SlideRule 对话类能力。

2026-06-17 已完成 **LLM config parity 第一片**：

- Python `LlmConfig` 已补 `router_model`、`model_fallbacks`、`max_context`、`max_concurrent`、`provider_name`、`chat_thinking_type`。
- Python 已新增 `FallbackLlmConfig` / `get_fallback_llm_config()`，并已接入 provider/model fallback 链路。
- Python `PoolConfig` 已补 `wire_api`，并对齐 Blueprint pool 的 base/model/timeout 默认值和 gpt-5 pool wire 推断。
- `pool.py` 已修复旧 `LlmConfig(...)` 构造路径，避免新增字段导致 pool 运行时报错。
- AgentLoop run：`2026-06-17T02-51-25-969Z`，结果 `DONE_GATE_ONLY`，`20 passed, 1 skipped` + mojibake gate 通过。

2026-06-20 已继续补上两片 LLM infra 边界：

- `backend-python-llm-stream-contract`：Python 已有 SSE / stream（服务端事件/流式）解析的最小 contract，锁住 chunk/done/error 形状。
- `backend-python-llm-pool-resilience`：Python pool 已补失败记录和韧性覆盖，并保留 504 penalty / circuit breaker（惩罚窗口/熔断）语义。

但它还不能作为整个后端的 Python LLM 底座。Node 侧仍有这些关键能力没有 Python 等价实现：

- provider cooldown、global cooldown、完整 retry/backoff、并发限制。
- live stream runtime（真实流式运行时）、多模态 content parts、vision/fallback 配置。
- 真实 cost 计算和更完整 telemetry 汇聚。
- `SLIDERULE_JSON_LLM_MAX_TOKENS` 等 Node env 细节的完整对齐。
- `BLUEPRINT_SPEC_DOCS_LLM_POOL_WIRE_API`、更完整 pool metadata、spec-doc markdown 形状校验。
- 代理环境下的 `NO_PROXY` / `LLM_PROXY_THROUGH` 等 Node 侧运行细节。

所以 LLM infra 单层可以记为 **约 50-58%**；整体后端仍只按 **约 18-22%** 记录。不要因为 SlideRule V5 的 capability 覆盖提升，就把整个 Node backend 的迁移比例一起抬高。

`agent-loop` 可以用于 NodeJS 到 Python 迁移，而且方向合适。但它的定位应该是：

> NodeJS 到 Python 迁移的切片执行器、gate runner、自动修复工作单元。

不要把它当成：

> 一键把整个 Node 后端迁到 Python 的全自动迁移器。

整体迁移任务太大，边界、测试、架构决策、数据兼容、部署策略都不够单一。如果直接给 AgentLoop “把整个 NodeJS 后端迁到 Python” 这种任务，自动循环很容易改到不该改的地方。

### 适合交给 AgentLoop 的迁移单位

- 一个 endpoint。
- 一个 `capabilityId`。
- 一个 Node 到 Python delegation 白名单扩展。
- 一个 Python parity test。
- 一个 live smoke gate。
- 一个数据、密钥、运行产物清理任务。

### 不适合交给 AgentLoop 的任务

- 把整个 NodeJS 后端迁移到 Python。
- 一次迁多个无关子系统。
- 同时改业务逻辑、部署策略、密钥配置和 UI。
- 没有明确 allowed files、gate、成功标准的开放式迁移。

### 推荐迁移节奏

1. 先跑 audit-only 基线。
   - 不让它改代码。
   - 只跑 gate，确认当前迁移切片是否健康。
   - 用来检查 Python baseline、Node thin proxy、TypeScript、mojibake。

2. 再按 capability 或 route 做小步迁移。
   - 一次只迁一个 capability。
   - 或者只迁一组强相关 capability。
   - 每片都要有独立任务文件。

3. 每个切片必须绑定 gate。
   - Python pytest。
   - Node vitest。
   - TypeScript。
   - 必要时加 live Node 到 Python smoke。
   - 文档或中文报告改动加 mojibake 扫描。

4. 每轮保留人工暂停点。
   - `--pause-before-fix`
   - `--pause-after-iteration`
   - `--guard-tests`
   - `--max-iterations 1` 或 `2`

### 第一批任务建议

| 顺序 | 任务 | 状态 | 原因 |
|---|---|---|---|
| 1 | 建立迁移切片模板 | 已完成 | 固定任务格式，避免每次任务描述漂移。 |
| 2 | 建立 audit-only gate 任务 | 已完成 | 让 AgentLoop 先成为迁移体检工具。 |
| 3 | 迁移 `intent.clarify` | 已完成 | 低风险对话类能力，适合先接 Python 真 LLM。 |
| 4 | 迁移 `gap.ask` | 已完成 | 同属对话类能力，已验证 `python-llm`。 |
| 5 | 迁移 `question.expand` | 已完成 | 同属对话类能力，沿用 markdown 输出策略。 |
| 6 | 迁移 `critique.generate` | 已完成 | 审议族第一片。 |
| 7 | 队列 batch-2（infra + 审议族 + 结构化） | 已完成 | 11/11 `DONE_REVIEWED`，但只代表这些切片通过当前 gate，不代表整个 Node backend 迁移完成。 |
| 8 | 队列 batch-3（delivery + visual + artifact capabilities） | 已完成 | 6/6 已人工接手完成并通过 `deliveryGates`；不代表整个 Node backend 迁移完成。 |
| 9 | 队列 backend migration push（8 项硬边界） | 已完成 | 8/8 `DONE_REVIEWED`，覆盖 real vector retrieval smoke、evidence proxy、`mcp.call`、`skill.invoke`、`orchestrate.plan`、LLM stream、LLM pool resilience；这是边界和契约推进，不代表 runtime 全迁。 |

### batch-3 任务

这批不提前打勾。每个任务都必须跑过 `deliveryGates` 后，才能把对应 capability（能力）标为迁移完成。

- [x] `document.draft`：`agent-loop/tasks/migrate-sliderule-document-draft.md`（2026-06-19，人工接手完成，`deliveryGates` 全绿）
- [x] `traceability.matrix`：`agent-loop/tasks/migrate-sliderule-traceability-matrix.md`（2026-06-19，AgentLoop `DONE_REVIEWED` 为空 diff 假完成，人工接手完成，`deliveryGates` 全绿）
- [x] `task.write`：`agent-loop/tasks/migrate-sliderule-task-write.md`（2026-06-19，人工接手完成，`deliveryGates` 全绿）
- [x] `instruction.package`：`agent-loop/tasks/migrate-sliderule-instruction-package.md`（2026-06-19，人工接手完成，`deliveryGates` 全绿）
- [x] `outcome.visualize`：`agent-loop/tasks/migrate-sliderule-outcome-visualize.md`（2026-06-19，人工接手完成，`deliveryGates` 全绿；未迁 `ux.preview`）
- [x] `handoff.package`：`agent-loop/tasks/migrate-sliderule-handoff-package.md`（2026-06-19，人工接手完成，`deliveryGates` 全绿；batch-3 delivery chain 收束）

### 推荐 AgentLoop 命令形态

示例以单个 SlideRule capability 迁移为单位：

```powershell
node agent-loop/src/loop.js `
  --cwd C:\Users\wangchunji\Documents\cube-pets-office `
  --fix-cwd C:\Users\wangchunji\Documents\cube-pets-office `
  --task agent-loop/tasks/migrate-sliderule-question-expand.md `
  --gate "cd tws-ai-slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_capabilities.py tests/test_config.py tests/test_v5_smoke.py tests/test_v5_contract_expansion.py -q --tb=short" `
  --gate "pnpm exec vitest run --config vitest.config.server.ts server/routes/__tests__/sliderule.execute-capability.test.ts server/routes/__tests__/sliderule.live-delegation.test.ts --reporter=dot" `
  --gate "pnpm exec tsc --noEmit --pretty false" `
  --gate "node agent-loop/src/check-mojibake.js agent-loop/tasks tws-ai-slide-rule-python server/routes/__tests__" `
  --pause-before-fix `
  --pause-after-iteration `
  --guard-tests `
  --max-iterations 1 `
  --auto-fix
```

这条命令的意图是：可以自动修，但每轮都要有 gate 和人工暂停点，不让它一路狂奔。

## 下一步候选

batch-3 delivery chain（交付链）、15 项 migration queue（迁移队列）和 8 项 backend migration push 都已跑完并分片提交。注意：这些批次里不少关键修复仍是 Codex 人工推进，下一批如果目标是让 Grok 真干活，就应该把任务设计成“小而真”的 worker 任务，让 Grok 负责改，Codex 只审边界。

下一片建议不要继续堆“看起来很大”的迁移口号，而是把已经锁住的 contract（契约）往 runtime（运行时）推进：真实 vector retrieval（向量检索）生产接线、`mcp.call`/`skill.invoke` 真工具运行时、`orchestrate.plan` 更大编排迁移。

| 顺序 | 建议任务 | 目标 |
|---|---|---|
| 1 | `backend-python-llm-config-parity.md` | 已完成第一片：Python 能读懂 router/fallback/model fallback/max context/chat thinking/pool wire 等 env 契约。 |
| 2 | `backend-python-llm-client-parity.md` | 已建任务 + 红灯测试，在队列第 1 项。 |
| 3 | `backend-python-llm-pool-parity.md` | 已建任务 + 红灯测试，在队列第 2 项。 |
| 4 | `backend-python-llm-json-hardening.md` | 已建任务 + 红灯测试，在队列第 3 项。 |
| 5 | `ux.preview` 审计/迁移任务 | 已完成：Python native LLM + Node Python-mode delegation gate 全绿。 |
| 6 | `backend-python-rag-inventory.md` | 已完成：确认 Python 还不是生产级 vector RAG。 |
| 7 | `backend-python-vector-client-parity.md` | 已完成：Python vector client（向量客户端）最小契约已补。 |
| 8 | `backend-python-evidence-retrieval-parity.md` | 已完成：evidence provenance（证据来源）已拆成 `retrieved` / `fallback` / `generated`。 |
| 9 | `backend-python-blueprint-spec-docs-*` 三片 | 已完成：inventory、proxy contract、smoke gate、runtime config boundary 已补齐。 |
| 10 | `backend-python-real-vector-retrieval-smoke.md` | 已完成：真实 vector retrieval（向量检索）最小 smoke（冒烟）已锁住；下一步是 production wiring（生产接线）。 |
| 11 | `backend-python-evidence-node-proxy-contract.md` | 已完成：Node evidence proxy（证据代理）成功/失败形状已锁住。 |
| 12 | `backend-python-mcp-call-contract.md` | 已完成：`mcp.call` 当前仍是 fallback/mapped path（回退/映射路径）的边界已锁住；下一步才是真 runtime（运行时）。 |
| 13 | `backend-python-skill-invoke-contract.md` | 已完成：`skill.invoke` 当前仍是 fallback/mapped path 的边界已锁住；下一步才是真 runtime。 |
| 14 | `backend-python-orchestrate-plan-contract.md` | 已完成：`orchestrate.plan` Python contract（Python 契约）已锁住。 |
| 15 | `backend-python-orchestrate-plan-golden-smoke.md` | 已完成：`orchestrate.plan` golden smoke（黄金样例冒烟）已锁住。 |
| 16 | `backend-python-llm-stream-contract.md` | 已完成：LLM stream contract（流式契约）最小形状已锁住。 |
| 17 | `backend-python-llm-pool-resilience.md` | 已完成：LLM pool resilience（池子韧性）测试已补。 |
| 18 | 下一批：real vector retrieval production wiring | 建议：把 smoke 推进到真实 vector store 接线、fallback 和 provenance 运行时。 |
| 19 | 下一批：mcp/skill runtime migration | 建议：让 Grok 做小而真的 runtime 迁移，Codex 审查不能伪装 provenance。 |
| 20 | 下一批：orchestrate.plan staged migration | 建议：先迁输入输出、错误恢复和 Python/Node 责任边界，不一口气吞主编排。 |

结构化 JSON 类能力不要直接套 `question.expand` 的散文策略。`report.write` 已先迁成 Python native JSON LLM，`orchestrate.plan` 现在也已有 contract + golden smoke，但更大的主编排迁移仍要按 staged migration（分阶段迁移）推进。

## 提交前检查

- [ ] 只暂存本次任务相关文件，绝不使用 `git add -A`。
- [ ] 不暂存 `.agent-loop/`、`tmp/`、`probes/`、`.env`、日志、缓存、`tws-ai-slide-rule-python/data/`。
- [ ] 不提交真实密钥、数据库密码、Qdrant key、Bearer token。
- [ ] 如果只改文档，至少跑 `node agent-loop/src/check-mojibake.js agent-loop/tasks`。
- [ ] 如果改代码，重新跑对应 Python、Node、TypeScript gate。
