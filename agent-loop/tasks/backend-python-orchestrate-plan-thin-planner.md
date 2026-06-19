# 后端 NodeJS 到 Python 迁移：orchestrate.plan thin planner

## 执行状态

- 状态：待执行
- 目标：在 orchestrate.plan contract（契约）之后补 Python thin planner（薄规划器）的最小实现
- 角色分工：Grok 负责补最小 planner 和测试；Codex 负责审查是否重写 Node 主编排

### 状态清单

- [x] 已执行 AgentLoop
- [x] Python test 覆盖 thin planner 的最小 deterministic plan
- [x] Node contract test 确认仍由 Node 控制主编排，只代理规划片段
- [x] 文档边界没有把 thin planner 写成完整 orchestrator
- [x] gate 全绿
- [x] Codex review（审查）确认没有重写 `server/sliderule/orchestrate-plan.ts`

## 目标

`orchestrate.plan` 已有 Python contract 和 golden smoke。下一步可以补一个薄规划器：给定固定输入，Python 返回稳定 plan draft（计划草稿），Node 仍保留主编排、fallback、状态流和最终执行责任。

这个任务只迁“规划片段”，不迁完整 orchestrator（编排器）。

## 允许修改的文件

- `tws-ai-slide-rule-python/routes/sliderule.py`
- `tws-ai-slide-rule-python/routes/sliderule_full.py`
- `tws-ai-slide-rule-python/tests/test_orchestrate_plan_thin_planner.py`
- `tws-ai-slide-rule-python/tests/test_orchestrate_plan_contract.py`
- `server/routes/__tests__/sliderule.orchestrate-plan-python-contract.test.ts`
- `docs/backend-python-orchestrate-plan-contract.md`
- `agent-loop/tasks/backend-python-orchestrate-plan-thin-planner.md`

## 禁止扩大范围

- 不重写 `server/sliderule/orchestrate-plan.ts`。
- 不迁 Blueprint/Autopilot 主状态机。
- 不接真实 live LLM。
- 不改 pool JSON LLM 主逻辑。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `orchestratePlanThinPlannerGates`。

## 成功标准

- Python thin planner test 能从固定 request 生成稳定 plan draft。
- Node contract test 确认 Python 只负责 planner fragment（规划片段），主编排仍在 Node。
- degraded/error shape 与现有 contract 一致。
- 所有 gate 通过。
