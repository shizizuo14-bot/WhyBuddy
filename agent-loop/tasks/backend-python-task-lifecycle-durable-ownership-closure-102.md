# 后端 NodeJS 迁 Python：Task lifecycle durable ownership closure 102

## 执行状态

- 状态：待执行
- 目标：对 task lifecycle 的 durable mission store、project/resource auth、scheduler、event replay、cancel/error 处理做 102 收口。优先补 Python-owned runtime；不能安全接管的必须输出 retained / blocked decision。
- 角色分工：worker 负责 Python ownership service、Node route/mission bridge 和测试；reviewer 必须确认没有把 101 decision envelope 写成完整 task lifecycle 生产接管。

### 状态清单

- [ ] Python 能输出 task lifecycle durable ownership decision。
- [ ] Node bridge 能消费 mission store、project/resource auth、scheduler、event replay、cancel/error 的 ownership decision。
- [ ] 测试覆盖 `python-owned`、`node-retained`、`blocked`、`degraded`。
- [ ] gate 全绿。
- [ ] review 确认没有绕过项目/资源权限或任务状态语义。

## 背景

101 已经补了 mission store / auth / scheduler readiness，但状态表仍说完整 mission store、project/resource auth、scheduler、event replay、cancel/error 处理仍主要由 Node 拿着。102 要把这些点变成可执行决策，而不是继续停留在 readiness 描述。

## 允许修改的文件

- `tws-ai-slide-rule-python/services/task_lifecycle_durable_ownership_closure.py`
- `tws-ai-slide-rule-python/services/task_store_auth_scheduler_cutover.py`
- `tws-ai-slide-rule-python/services/task_lifecycle_production_closure.py`
- `tws-ai-slide-rule-python/tests/test_task_lifecycle_durable_ownership_closure_102.py`
- `server/routes/tasks.ts`
- `server/tasks/mission-store.ts`
- `server/tasks/mission-runtime.ts`
- `server/tasks/mission-projection.ts`
- `server/tests/task-lifecycle-durable-ownership-closure-102.test.ts`
- `server/tests/task-store-auth-scheduler-cutover-101.test.ts`
- `shared/mission/**`
- `agent-loop/tasks/backend-python-task-lifecycle-durable-ownership-closure-102.md`

## 禁止扩大范围

- 不把 fake scheduler、单次 replay 或内存 mission store 写成生产接管。
- 不绕过 project/resource auth。
- 不删除既有 mission store、mission route、cancel/error 测试。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实用户数据。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `taskLifecycleDurableOwnershipClosure102Gates`。

## 成功标准

- Python service 能清晰表达 durable store/auth/scheduler/replay/cancel/error 的 ownership。
- Node 测试确认 bridge 消费 decision，并且 retained/blocked 状态不会被当成完成。
- 关键 task lifecycle 既有测试继续通过。
- 所有 gate 通过。

## 给 worker 的大白话

任务系统最怕“看起来能跑，其实权限和持久化还在 Node”。这次要把 durable store、auth、scheduler、replay、cancel/error 的归属写成机器能测的结果。
