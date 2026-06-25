# 后端 NodeJS 到 Python 迁移：Blueprint main runtime closure 100

## 执行状态

- 状态：待执行
- 目标：把 Blueprint 主流程最后一层 Node-owned runtime（运行时）收口到 Python-owned bounded runtime（有边界运行时），为整体 NodeJS 后端迁 Python 的 100% 候选闭环提供真实代码证据。
- 角色分工：worker 负责 Python runtime、Node bridge（桥接层）和测试；reviewer 必须确认没有把局部 bridge 夸大成完整 Blueprint 全系统迁移。

### 状态清单

- [x] Python runtime 覆盖 Blueprint main state、job lifecycle、event stream、prompt preview、review/export、artifact memory 的闭环组合语义。
- [x] Node bridge 可以消费 Python closure summary，并保留 jobId、projectId、stageId、actor、causation、diagnostic metadata。
- [x] diagnostics（诊断）、ledger（账本）、event bus（事件总线）边界必须明确：Python 只接管本任务声明的 runtime decision，不假装接管所有持久化。
- [x] gate 全绿。
- [x] Codex review 确认这是 100% 候选闭环的一片真实 runtime 代码，不是 status/doc-only。

## 目标

97 阶段已经补了 Blueprint job/event stream 和 prompt/preview，但 Blueprint 主流程仍有 route shell（路由壳）、state machine（状态机）、job store（任务存储）、event bus、diagnostics、ledger、preview、prompt package 多个混合所有权点。本任务只做最后的可审计 runtime closure（运行时闭环）切片：让 Python 能输出一个可被 Node 消费的 Blueprint closure summary，并让 Node 保留仍属于自己的 persistence/transport 边界。

## 允许修改的文件

- `slide-rule-python/services/blueprint_main_runtime_closure.py`
- `slide-rule-python/services/blueprint_state_runtime.py`
- `slide-rule-python/services/blueprint_job_runtime.py`
- `slide-rule-python/services/blueprint_job_event_stream.py`
- `slide-rule-python/services/blueprint_prompt_preview.py`
- `slide-rule-python/services/blueprint_review_export.py`
- `slide-rule-python/services/blueprint_artifact_memory.py`
- `slide-rule-python/tests/test_blueprint_main_runtime_closure_100.py`
- `server/routes/blueprint/main-runtime-closure-python.ts`
- `server/routes/__tests__/blueprint.main-runtime-closure-100.test.ts`
- `server/routes/blueprint/main-state-python-runtime.ts`
- `server/routes/blueprint/jobs/service.ts`
- `server/routes/blueprint/event-bus.ts`
- `server/routes/blueprint/review-export-python-runtime.ts`
- `shared/blueprint/jobs/types.ts`
- `shared/blueprint/events.ts`
- `agent-loop/tasks/backend-python-blueprint-main-runtime-closure-100.md`

## 禁止扩大范围

- 不重写完整 `/api/blueprint` route shell。
- 不迁移完整数据库 schema、真实 durable job store、真实 event bus transport。
- 不接管 UI、客户端流程、完整 prompt package 生产执行、effect preview 图片生成或外部 LLM provider。
- 不删除既有 Blueprint 测试。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实用户数据。
- 不在本任务直接刷新整体迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintMainRuntimeClosure100Gates`。

## 成功标准

- Python 测试覆盖 closure summary 的 success、partial、degraded、failed、diagnostic-only 五类输出。
- Node 测试确认 bridge 能稳定映射 Python closure summary，并且不会把 diagnostic-only 当成 production takeover。
- 既有 Blueprint job/event/prompt/review/artifact runtime 测试继续通过。
- 产生真实业务代码 diff，不能以 `HALT_NO_CHANGES` 收口。
- 所有 gate 通过。
