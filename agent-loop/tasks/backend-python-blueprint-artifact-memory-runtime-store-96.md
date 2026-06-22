# 后端 NodeJS 到 Python 迁移：Blueprint artifact memory runtime store 96

## 执行状态
- 状态：待执行
- 目标：把 Blueprint artifact memory 从 proxy shape 推进到 Python-owned bounded runtime store，不宣称完整 Blueprint 主系统迁移。
- 角色分工：worker 负责 Python store/service、Node bridge 映射和测试；reviewer 确认没有迁移完整 `/api/blueprint`、没有引入真实外部存储副作用。

### 状态清单
- [ ] Python runtime store 支持 write/read/list/delete 或等价最小闭环。
- [ ] Node artifact-memory service 能委托 Python runtime，并保留现有错误/envelope 字段。
- [ ] stale/missing/not-found/error 不伪装成 success。
- [ ] gate 全绿。
- [ ] Codex review 确认这是 runtime store 小切片，不是完整 Blueprint 迁移。

## 目标

当前 artifact memory 已有 proxy/contract 证据，但整体迁移进度不能把 proxy 当成 runtime 完成。本任务只做一个有边界的 Python runtime store：输入输出、session/project scope、not-found/error 语义稳定，并通过 Node 测试证明 route/service 层没有吞掉 Python 状态。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/blueprint_artifact_memory.py`
- `tws-ai-slide-rule-python/tests/test_blueprint_artifact_memory_runtime_store.py`
- `tws-ai-slide-rule-python/tests/test_blueprint_artifact_memory_proxy.py`
- `server/routes/blueprint/artifact-memory/service.ts`
- `server/routes/blueprint/artifact-memory/service.test.ts`
- `server/routes/__tests__/blueprint.artifact-memory-python-runtime.test.ts`
- `server/routes/__tests__/blueprint.artifact-memory-python-proxy.test.ts`
- `shared/blueprint/artifact-memory/types.ts`
- `agent-loop/tasks/backend-python-blueprint-artifact-memory-runtime-store-96.md`

## 禁止扩大范围
- 不迁完整 `/api/blueprint` route shell。
- 不改 Blueprint job store、event bus、diagnostics、ledger、preview 或 prompt package。
- 不接真实数据库、Qdrant、对象存储或外部服务。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintArtifactMemoryRuntimeStore96Gates`。

## 成功标准

- Python 测试覆盖 artifact write/read/list/delete、scope 隔离、missing/not-found 和 error envelope。
- Node 测试确认 Python completed/failed/not_found 状态不会被 service 误映射。
- 现有 proxy contract 继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
