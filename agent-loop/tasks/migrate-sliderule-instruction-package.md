# 迁移 SlideRule 的 instruction.package 到 Python 真后端

## 执行状态

- 状态：待执行
- 目标 capability：`instruction.package`
- 预期 provenance：`python-llm`
- 前置：batch-2 migration queue 已完成 11/11 `DONE_REVIEWED`

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Python native implementation（Python 原生实现）已落地
- [ ] Node delegation（Node 委托）契约已验证
- [ ] `deliveryGates` 全绿
- [ ] 人工 review（审查）已确认 diff 干净

## 目标

把 `instruction.package` 从当前 Node 侧 `ai_generated` / Python 侧 `python-rag` mapped baseline，迁到 Python-owned（Python 负责）的 prompt pack（提示词包）生成路径。

这片只处理 operator prompt、engineering prompt、evidence prompt、verification prompt 等可执行指令包，不顺手迁 handoff.package。

## 当前证据 / 背景

- Node 当前实现：`server/sliderule/delivery-exec-map.ts` 的 `instruction.package` 分支调用 `buildPromptPackContent()`，provenance 为 `ai_generated`。
- Python 当前实现：`tws-ai-slide-rule-python/services/capability_maps.py` 的 `execute_prompt_pack()`，先走 RAG，再追加固定 Prompt Pack 段落，provenance 为 `python-rag`。
- Python contract（契约）当前只检查几个 section name（段名），还没有证明输出来自 Python native LLM。

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
- `instruction.package` 在 `SLIDERULE_V5_BACKEND=python` 时委托到 Python，并返回 `provenance="python-llm"` 或等价 Python native structured output（Python 原生结构化输出）证明。
- 输出包含 operator prompt、engineering prompt、evidence prompt、verification prompt，并且每段有具体约束和验收方式。
- Node LLM / Node pool 不参与这个 capability 的生成。
- diff 只落在本任务允许修改的文件范围内。
