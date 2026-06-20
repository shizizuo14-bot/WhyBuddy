# 后端 NodeJS 到 Python 迁移：Task executor runtime bridge

## 执行状态
- 状态：待执行
- 目标：把 task executor 从已验证的 proxy contract 推进到 Python runtime bridge，覆盖 start/status/cancel/read/error 的最小闭环。
- 角色分工：worker 负责 Python runtime bridge、Node executor client 映射和测试；reviewer 确认没有启动真实 executor worker 或扩大到完整任务系统。

### 状态清单
- [x] Python runtime bridge 支持 start/status/cancel/read envelope。
- [x] Node executor client 能映射 completed/failed/cancelled/error。
- [x] timeout/cancel/error 不伪装成 success。
- [x] gate 全绿。
- [x] Codex review 确认没有启动真实 executor。

## 目标

executor/tasks 是整体 NodeJS 后端迁移的大块之一。上一批 proxy contract 容易卡在 HALT_NO_CHANGES，这次要用最小 runtime bridge 产生真实迁移 diff，并把错误状态语义固定下来。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/task_executor_runtime.py`
- `tws-ai-slide-rule-python/tests/test_task_executor_runtime_bridge.py`
- `tws-ai-slide-rule-python/tests/test_task_executor_proxy_contract.py`
- `server/core/executor-client.ts`
- `server/tests/executor-client-python-runtime.test.ts`
- `server/tests/executor-client-python-proxy-contract.test.ts`
- `shared/blueprint/jobs/types.ts`
- `agent-loop/tasks/backend-python-task-executor-runtime-bridge.md`

## 禁止扩大范围
- 不启动真实 executor、CrewAI、LangGraph 或外部 worker。
- 不迁完整任务队列调度器。
- 不改持久化 schema。
- 不提交 `.agent-loop` 运行产物。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `taskExecutorRuntimeBridgeGates`。

## 成功标准

- Python 侧有 start/status/cancel/read/error runtime bridge 测试。
- Node 侧确认 cancel/error/timeout 不会被映射成 success。
- 产生有效迁移 diff，不再以 HALT_NO_CHANGES 收口。
- 所有 gate 通过。
