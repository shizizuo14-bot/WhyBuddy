# 后端 NodeJS 到 Python 迁移：Task route lifecycle runtime 96

## 执行状态
- 状态：待执行
- 目标：把 `/api/tasks` 的 create/status/cancel/error/event replay 最小生命周期推进到 Python runtime bridge，补 executor bridge 之外的 route lifecycle 缺口。
- 角色分工：worker 负责 Python task lifecycle runtime、Node route/mission bridge 和测试；reviewer 确认 project/resource auth 语义没有被绕过。

### 状态清单
- [x] Python runtime 支持 create/status/cancel/error/event replay envelope。
- [x] Node `/api/tasks` 或 mission runtime 能委托 Python 小切片，并保留 project/resource/auth metadata。
- [x] cancelled/failed/error 不伪装成 completed。
- [x] gate 全绿。
- [x] Codex review 确认没有迁完整任务调度器或真实 executor worker。

## 目标

当前 task executor 已有 runtime bridge，但 `/api/tasks` route、mission store、event replay 和 cancel/error lifecycle 仍主要是 Node-owned。本任务只迁有边界的 lifecycle decision envelope，让整体后端迁移有真实 runtime 增量。

## 允许修改的文件
- `slide-rule-python/services/task_lifecycle_runtime.py`
- `slide-rule-python/tests/test_task_lifecycle_runtime_boundary.py`
- `server/routes/tasks.ts`
- `server/tasks/mission-runtime.ts`
- `server/tasks/mission-store.ts`
- `server/tasks/mission-projection.ts`
- `server/tests/task-lifecycle-python-runtime.test.ts`
- `server/tests/mission-routes.test.ts`
- `server/tests/mission-cancel.test.ts`
- `shared/mission/contracts.ts`
- `shared/mission/api.ts`
- `agent-loop/tasks/backend-python-task-route-lifecycle-runtime-96.md`

## 禁止扩大范围
- 不启动真实 executor worker、CrewAI、LangGraph 或外部 agent。
- 不迁完整任务调度器、任务队列持久化 schema 或 mission UI。
- 不降低 project/resource auth 校验。
- 不改 executor callback ingress 的生产语义。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `taskRouteLifecycleRuntime96Gates`。

## 成功标准

- Python 测试覆盖 create/status/cancel/error/event replay、project/resource metadata 和 invalid transition。
- Node 测试确认 `/api/tasks` lifecycle 能正确映射 Python completed/failed/cancelled/error。
- 现有 executor runtime bridge 继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
