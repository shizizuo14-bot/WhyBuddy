# 后端 NodeJS 到 Python 迁移：orchestrate.plan golden smoke

## 执行状态

- 状态：待执行
- 目标：在 contract（契约）之后补一个 golden smoke（黄金样例冒烟），验证 Python 规划输出可被 Node 消费
- 角色分工：Grok 负责补最小 golden fixture（黄金样例）和测试；Codex 负责审查是否越界迁主编排

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] 已新增 Python golden smoke 测试
- [ ] 已新增或更新 Node 消费 Python plan 的契约测试
- [ ] golden fixture 不依赖真实 LLM key
- [ ] gate 全绿
- [ ] Codex review（审查）已确认没有把 smoke 当成完整 orchestrator 迁移

## 目标

在 `backend-python-orchestrate-plan-contract` 之后，用一个固定输入和固定输出样例，证明 Python 侧的 plan shape（计划形状）能被 Node 当前链路消费或安全降级。

这是推进整体后端迁移比例的关键中间层：不是完整编排迁移，但已经从“纯文档契约”进入“可运行黄金样例”。

## 允许修改的文件

- `tws-ai-slide-rule-python/tests/test_orchestrate_plan_golden_smoke.py`
- `tws-ai-slide-rule-python/tests/fixtures/orchestrate_plan_golden.json`
- `server/routes/__tests__/sliderule.orchestrate-plan-python-contract.test.ts`
- `docs/backend-python-orchestrate-plan-contract.md`
- `agent-loop/tasks/backend-python-orchestrate-plan-golden-smoke.md`

## 禁止扩大范围

- 不重写 Node `orchestrate-plan.ts`。
- 不改真实 prompt。
- 不发 live LLM。
- 不迁 Blueprint/Autopilot 主状态机。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `orchestratePlanGoldenSmokeGates`。

## 成功标准

- golden fixture 可稳定复跑。
- Python smoke test 能输出可消费 plan shape。
- Node contract test 能接受该 shape 或明确降级。
- 所有 gate 通过，且不依赖真实 key。
