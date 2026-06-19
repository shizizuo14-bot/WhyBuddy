# 迁移 SlideRule 的 ux.preview 到 Python 真后端

## 执行状态

- 状态：已完成 — Python native implementation 与 Node delegation 契约已验证
- 目标 capability：`ux.preview`
- 预期 provenance：`python-llm`
- 前置：`outcome.visualize` 已迁到 Python native LLM；本任务只处理 `ux.preview`

- 最近执行：2026-06-19
- 最近确认：2026-06-19
- 执行方式：Codex 直接小切片实现，未发 live LLM
- gate 结果：`uxPreviewGates` 全绿

### 状态清单

- [x] 已执行本地实现与验证
- [x] Python native implementation（Python 原生实现）已落地
- [x] Node delegation（Node 委托）契约已验证
- [x] `uxPreviewGates` 全绿
- [x] 人工 review（审查）已确认 diff 干净

## 目标

把 `ux.preview` 从当前 Node visual executor（可视化执行器）/ Python mapped baseline，迁到 Python-owned（Python 负责）的 UX preview（界面预览）生成路径。

本任务不迁 `outcome.visualize`，它已经完成；也不改前端 UI，只迁 capability 生成路径和契约。

## 允许修改的文件

- `tws-ai-slide-rule-python/sliderule_llm/capabilities.py`
- `tws-ai-slide-rule-python/tests/test_capabilities.py`
- `tws-ai-slide-rule-python/tests/test_v5_contract_expansion.py`
- `server/routes/__tests__/sliderule.execute-capability.test.ts`
- `server/sliderule/__tests__/visual-exec-map.test.ts`（仅当 Node 契约必须同步）
- `agent-loop/tasks/migrate-sliderule-ux-preview.md`

## 禁止扩大范围

- 不迁其它 visual / delivery capability。
- 不改真实前端页面。
- 不删除、不弱化、不跳过测试。
- 不提交运行产物、密钥或本地数据。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `uxPreviewGates`。

## 成功标准

- `ux.preview` 在 `SLIDERULE_V5_BACKEND=python` 时委托到 Python，并返回 `provenance="python-llm"`。
- 输出包含 UX preview（界面预览）结构、source/provenance（来源/出处）提示、至少一个可验证的 screen/state（页面/状态）描述。
- Node LLM / Node pool 不参与这个 capability 的生成。
- diff 只落在允许文件范围内。
