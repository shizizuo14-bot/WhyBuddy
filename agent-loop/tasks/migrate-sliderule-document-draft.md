# 迁移 SlideRule 的 document.draft 到 Python 真后端

## 执行状态

- 状态：已完成 - `document.draft` 走 Python native LLM，`deliveryGates` 全绿
- 目标 capability：`document.draft`
- 预期 provenance：`python-llm`
- 前置：batch-2 migration queue 已完成 11/11 `DONE_REVIEWED`

### 状态清单

- [x] 已执行 AgentLoop（真实运行停在 `HALT_NO_CHANGES`，原因是 baseline gate 已绿但审查要求补迁移证据）
- [x] Python native implementation（Python 原生实现）已落地
- [x] Node delegation（Node 委托）契约已验证
- [x] `deliveryGates` 全绿
- [x] 人工 review（审查）已确认 diff 干净

## 最近执行记录

- 最近执行：2026-06-19
- AgentLoop run id：`2026-06-19T04-26-11-106Z`
- AgentLoop 结果：`HALT_NO_CHANGES`（Grok 未产生迁移 diff；人工接手完成）
- 人工补充结果：`DONE_GATE_ONLY`
- gate 结果：Python 35 passed / Node vitest 46 passed / TypeScript OK / mojibake OK

## 目标

把 `document.draft` 从当前 Node 侧 `ai_generated` / Python 侧 `python-rag` mapped baseline，迁到 Python-owned（Python 负责）的结构化文档生成路径。

这片只处理规格或说明文档草稿，不顺手迁 `traceability.matrix`、`task.write`、`instruction.package`、`outcome.visualize` 或 `handoff.package`。

## 当前证据 / 背景

- Node 当前实现：`server/sliderule/delivery-exec-map.ts` 的 `document.draft` 分支，输出 requirements / design / tasks 骨架，provenance 为 `ai_generated`。
- Python 当前实现：`slide-rule-python/services/capability_maps.py` 的 `execute_document()`，仍走 `python-rag` mapped baseline。
- Python contract（契约）当前在 `tests/test_v5_contract_expansion.py` 里把 delivery caps 作为 expanded mapped capability 验证。

## 允许修改的文件

- `slide-rule-python/sliderule_llm/capabilities.py`
- `slide-rule-python/services/capability_maps.py`
- `slide-rule-python/routes/sliderule_full.py`
- `slide-rule-python/tests/test_capabilities.py`
- `slide-rule-python/tests/test_v5_contract_expansion.py`
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
- 不提交 `.agent-loop/`、`.worktrees/`、`tmp/`、`.env`、日志、cache、`slide-rule-python/data/`。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `deliveryGates`。

## 成功标准

- `deliveryGates` 全部通过。
- `document.draft` 在 `SLIDERULE_V5_BACKEND=python` 时委托到 Python，并返回 `provenance="python-llm"` 或等价的 Python native structured output（Python 原生结构化输出）证明。
- 输出包含可用的 requirements、design、tasks / acceptance criteria 信息，不是泛泛模板，也不是旧 `python-rag` mapped fallback。
- Node LLM / Node pool 不参与这个 capability 的生成。
- diff 只落在本任务允许修改的文件范围内。
