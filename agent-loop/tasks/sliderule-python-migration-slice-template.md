# SlideRule Python 迁移切片模板

## 执行状态

- 状态：模板文件，不代表某个能力已经执行完成
- 用途：创建新的 SlideRule V5 小切片迁移任务
- 规则：每个具体任务都要有自己的“执行状态”和 checklist
- 运行产物：`.agent-loop/` 是运行记录，不提交

目标：把一个很窄的 SlideRule V5 能力、路由或契约切片，从 Node 实现逐步迁到 Python 后端。

使用这个模板创建 AgentLoop 迁移任务。每个任务都要小到可以一次看完 diff。

## 范围规则

- 只改具体任务点名的文件。
- 不使用 `git add -A`。
- 不自动提交。
- 默认角色分工：Grok 负责按任务落地实现；Codex 负责审查边界、证据、进度口径和是否能放行。
- Grok 不负责决定“是否扩大迁移范围”。如果当前任务边界不够清楚，应输出 blocked，交还给 Codex/人补边界。
- Codex 审查时必须检查：是否越界、是否把 fallback/proxy 当完整迁移、是否把某个子系统百分比误报成整体 Node backend 百分比。
- 除非具体任务明确点名，不要修改无关 LLM 路由 WIP：
  - `client/`
  - `server/core/`
  - `server/sliderule/orchestrate-plan.ts`
  - `server/sliderule/pool-json-llm.ts`
  - `shared/blueprint/`
  - `scripts/`
- 不提交运行产物或生成数据：
  - `.agent-loop/`
  - `tmp/`
  - `probes/`
  - `.env`
  - 日志
  - Python cache
  - `tws-ai-slide-rule-python/data/`
- 不加入密钥、真实 API key、数据库密码、Qdrant key、Bearer token。

## 具体任务必须写清楚

每个具体迁移任务都要说明：

- 要迁移的具体 capability 或 endpoint。
- 当前 Node 行为：哪些必须保留，哪些要有意替换。
- Python 行为：要调用什么、测试什么。
- 任务属于哪一层：Node thin proxy、Python baseline、LLM infra、RAG/vector/evidence、Blueprint/Autopilot、runtime config。
- 不能夸大的口径：例如 smoke gate 不等于完整迁移，proxy contract 不等于业务已迁完，generated/fallback evidence 不等于真实 retrieval。
- 允许修改的文件列表。
- 必跑 gate。
- 预期 diff 边界。
- 人工复查点。
- 执行状态：未执行、已实现待验证、已执行 gate-only、已实现并验证通过。

## 硬边界任务优先级

这些方向不要直接写成“大迁移”任务，要先拆成 audit / contract / smoke：

- `mcp.call` / `skill.invoke`：先审计哪些是真 runtime（运行时），哪些只是 fallback（回退）。
- real vector retrieval（真实向量检索）：先证明 vector client、retriever、sources provenance（来源证据）真实接线。
- `orchestrate.plan`：先定输入输出、错误恢复、Python/Node 责任边界，再迁编排。
- Blueprint/spec-docs：先迁单文档生成 proxy contract，不要把 batch loop、artifact store、review/export/UI 一起塞进同一任务。

## 推荐 AgentLoop 参数

迁移任务默认用保守参数：

```powershell
--pause-before-fix `
--pause-after-iteration `
--guard-tests `
--max-iterations 1
```

只有第一轮运行证明任务边界干净后，才考虑提高 `--max-iterations`。

## 基线 gate

SlideRule V5 切片至少使用这些 gate：

```powershell
cd tws-ai-slide-rule-python; .\.venv\Scripts\python.exe -m pytest tests/test_config.py tests/test_v5_smoke.py tests/test_v5_contract_expansion.py -q --tb=short
```

```powershell
pnpm exec vitest run --config vitest.config.server.ts server/routes/__tests__/sliderule.execute-capability.test.ts --reporter=dot
```

```powershell
pnpm exec tsc --noEmit --pretty false
```

如果要做 Node 到 Python live 验证，先单独启动 Python 服务，再加：

```powershell
$env:LIVE_NODE_TO_PYTHON_SLIDERULE="1"
pnpm exec vitest run --config vitest.config.server.ts server/routes/__tests__/sliderule.live-delegation.test.ts --reporter=dot
Remove-Item Env:\LIVE_NODE_TO_PYTHON_SLIDERULE
```

## 成功标准

- 目标切片有清楚的 Python 委托测试或 parity 测试。
- 所有 gate 通过。
- 最终 diff 只包含预期文件。
- 没有引入运行产物或密钥。
- 迁移进度按层报告，不用一个全局百分比糊住真实状态。
- Codex review 已确认：Grok 只做了任务内实现，没有越界扩大迁移，也没有把 proxy/fallback/smoke 夸大成完整能力。
