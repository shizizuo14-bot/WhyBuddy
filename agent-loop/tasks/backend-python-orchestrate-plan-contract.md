# 后端 NodeJS 到 Python 迁移：orchestrate.plan contract

## 执行状态

- 状态：待执行
- 目标：先定义 `orchestrate.plan` 的 Python/Node 输入输出契约，不直接迁完整编排器
- 角色分工：Grok 负责补 contract test（契约测试）与最小 schema；Codex 负责审查是否把契约误写成完整迁移

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] Python 侧 contract test 已覆盖 plan input/output
- [ ] Node 侧 route/proxy contract test 已覆盖 degraded shape
- [ ] 明确哪些字段属于 Python 负责，哪些仍由 Node orchestration（编排）负责
- [ ] gate 全绿
- [ ] Codex review（审查）已确认没有迁整个 `orchestrate-plan.ts`

## 目标

`orchestrate.plan` 是深水区，不能一口气迁。第一步只锁契约：输入是什么，输出最小字段是什么，失败/降级怎么表达，哪些状态仍留在 Node。

这个任务的产出应该让下一步 Grok 能在明确边界内实现 Python thin planner（薄规划器），而不是直接重写 Node 主编排。

## 允许修改的文件

- `tws-ai-slide-rule-python/routes/sliderule.py`
- `tws-ai-slide-rule-python/routes/sliderule_full.py`
- `tws-ai-slide-rule-python/tests/test_orchestrate_plan_contract.py`
- `server/routes/__tests__/sliderule.orchestrate-plan-python-contract.test.ts`
- `docs/backend-python-orchestrate-plan-contract.md`
- `agent-loop/tasks/backend-python-orchestrate-plan-contract.md`

## 禁止扩大范围

- 不重写 `server/sliderule/orchestrate-plan.ts`。
- 不改 `server/sliderule/pool-json-llm.ts`。
- 不迁 Blueprint/Autopilot 主状态机。
- 不接真实 live LLM。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `orchestratePlanContractGates`。

## 成功标准

- Python contract test 覆盖最小 request/response/degraded shape。
- Node contract test 确认 proxy/delegation 边界，不改变现有主编排行为。
- 文档明确 Node/Python 责任边界。
- 所有 gate 通过。
