# 后端 NodeJS 到 Python 迁移：Blueprint main state contract

## 执行状态
- 状态：待执行
- 目标：把 Blueprint 主状态机的最小状态契约投影到 Python，而不是只迁 spec-docs 或单个 proxy。
- 角色分工：worker 负责 contract 和测试；reviewer 确认没有吞掉完整 Blueprint/Autopilot 主流程。

### 状态清单
- [ ] Python 侧有 Blueprint main state contract。
- [ ] Node 侧测试能验证 Python state projection 的兼容形状。
- [ ] pending/running/done/failed/stale 基本状态形状稳定。
- [ ] gate 全绿。
- [ ] Codex review 确认没有伪装成完整 Blueprint 主状态机迁移。

## 目标

当前已经迁了 spec-docs、artifact-memory、agent-crew、brainstorm 等边界，但整体 NodeJS 后端的大分母里，Blueprint 主状态机仍是大块。此任务只锁定最小 state contract（状态契约），为后续 staged migration（分阶段迁移）铺路。

## 允许修改的文件
- `agent-loop/tasks/backend-python-blueprint-main-state-contract.md`
- `tws-ai-slide-rule-python/models/blueprint_state.py`
- `tws-ai-slide-rule-python/services/blueprint_state.py`
- `tws-ai-slide-rule-python/tests/test_blueprint_main_state_contract.py`
- `shared/blueprint/*.ts`
- `server/routes/__tests__/blueprint.main-state-python-contract.test.ts`

## 禁止扩大范围
- 不迁完整 Blueprint/Autopilot 状态机。
- 不改 UI。
- 不改真实 job store 持久化策略。
- 不把状态投影写成执行器。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintMainStateContractGates`。

## 成功标准

- Python contract 能表达 job id、stage、status、artifacts、errors、stale 标记。
- Node 测试能验证 Python contract 与现有 shared Blueprint 类型兼容。
- 错误状态不能伪装成成功。
- gate 全绿，mojibake 检查通过。
