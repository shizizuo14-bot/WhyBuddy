# 迁移 SlideRule 的 task.write 到 Python 真后端

## 执行状态

- 状态：已完成（人工接管实现，`deliveryGates` 已验证）
- 目标 capability：`task.write`
- 预期 provenance：`python-llm`
- 前置：batch-2 migration queue 已完成 11/11 `DONE_REVIEWED`

### 状态清单

- [x] 已执行 AgentLoop（本片由人工按任务契约接管实现）
- [x] Python native implementation（Python 原生实现）已落地
- [x] Node delegation（Node 委托）契约已验证
- [x] `deliveryGates` 全绿
- [x] 人工 review（审查）已确认 diff 干净

## 最近执行记录

- 最近执行：2026-06-19
- 执行结果：`DONE_GATE_ONLY`
- gate 结果：Python 37 passed / Node vitest 48 passed / TypeScript OK / mojibake OK
- 说明：本片按 `document.draft` / `traceability.matrix` 的迁移模式人工接管；未让 AgentLoop 自动改代码。

## 目标

把 `task.write` 从当前 Node 侧 `ai_generated` / Python 侧 `python-rag` mapped baseline，迁到 Python-owned（Python 负责）的工程任务拆解路径。

这片只处理从目标、SPEC tree（规格树）、report（报告）或 evidence（证据）生成可执行任务清单，不顺手迁文档、矩阵、提示词包或交接包。

## 当前证据 / 背景

- Node 当前实现：`server/sliderule/delivery-exec-map.ts` 的 `task.write` 分支，生成固定工程任务骨架，provenance 为 `ai_generated`。
- Python 当前实现：`tws-ai-slide-rule-python/services/capability_maps.py` 把 `task.write` 复用到 `execute_document()`，仍走 `python-rag` mapped baseline。
- 需要把 task（任务）输出和 document.draft（文档草稿）输出区分开，避免两个 capability 返回同一类泛化内容。

## 允许修改的文件

- `tws-ai-slide-rule-python/sliderule_llm/capabilities.py`
- `tws-ai-slide-rule-python/services/capability_maps.py`
- `tws-ai-slide-rule-python/routes/sliderule_full.py`
- `tws-ai-slide-rule-python/tests/test_capabilities.py`
- `tws-ai-slide-rule-python/tests/test_v5_contract_expansion.py`
- `server/routes/__tests__/sliderule.execute-capability.test.ts`
- 如必须同步 Node 契约，可改：
  - `server/sliderule/delivery-exec-map.ts`
  - `server/sliderule/__tests__/delivery-exec-map.test.ts`
  - `shared/blueprint/__tests__/sliderule-delivery-chain.test.ts`

## 禁止扩大范围

- 不迁 `orchestrate.plan`。
- 不改 Node LLM / pool WIP，除非 gate 明确证明该 capability 的代理契约必须更新。
- 不迁其它 delivery / visual capability。
- 不删除、不弱化、不跳过测试。
- 不提交运行产物、密钥或本地数据。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `deliveryGates`。

## 成功标准

- `deliveryGates` 全部通过。
- `task.write` 在 `SLIDERULE_V5_BACKEND=python` 时委托到 Python，并返回 `provenance="python-llm"` 或等价 Python native structured output（Python 原生结构化输出）证明。
- 输出是可执行任务清单，包含 task id / title / acceptance checks / dependency 或 blocked-by 信息，不是泛泛文档段落。
- Node LLM / Node pool 不参与这个 capability 的生成。
- diff 只落在本任务允许修改的文件范围内。
