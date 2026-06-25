# 后端 NodeJS 到 Python 迁移：Blueprint stage edit runtime bridge 88

## 执行状态
- 状态：待执行
- 目标：把 Blueprint stage edit 从 proxy-only 推进到最小 Python runtime bridge，保留 Node staleness/invalidation 边界。
- 角色分工：worker 负责 accepted/rejected/conflict/noop runtime 语义和测试；reviewer 确认不迁完整 Blueprint 状态机。

### 状态清单
- [x] Python runtime 覆盖 selected stage edit validate/preview/apply envelope。
- [x] Node 测试覆盖 accepted/rejected/conflict/noop/stale 语义。
- [x] Node 继续拥有 invalidation 和主状态提交。
- [x] gate 全绿。
- [x] Codex review 确认没有扩大到完整 Blueprint route。

## 目标

当前 stage edit 证据偏 proxy/contract。本任务只补一个有边界的 runtime bridge，让 Python 能执行最小编辑判断并返回稳定 envelope，Node 仍决定是否写入主状态。

## 允许修改的文件
- `slide-rule-python/services/blueprint_stage_edit.py`
- `slide-rule-python/tests/test_blueprint_stage_edit_runtime_bridge.py`
- `slide-rule-python/tests/test_blueprint_stage_edit_proxy_contract.py`
- `server/routes/blueprint/stage-edit-python-runtime.ts`
- `server/routes/__tests__/blueprint.stage-edit-python-runtime.test.ts`
- `server/routes/__tests__/blueprint.stage-edit-python-proxy.test.ts`
- `agent-loop/tasks/backend-python-blueprint-stage-edit-runtime-bridge-88.md`

## 禁止扩大范围
- 不改完整 Blueprint state machine。
- 不迁 event bus、job store、preview rendering。
- 不改变 Node staleness/invalidation 的最终所有权。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintStageEditRuntimeBridge88Gates`。

## 成功标准

- Python 测试覆盖 accepted/rejected/conflict/noop/stale/error。
- Node 测试确认 Python bridge 不绕开 Node invalidation。
- 错误 envelope 稳定，不能把 conflict/stale 写成 success。
- gate 全绿。
