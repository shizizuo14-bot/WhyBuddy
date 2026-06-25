# 后端 NodeJS 到 Python 迁移：Blueprint job runtime boundary 89

## 执行状态
- 状态：待执行
- 目标：把 Blueprint job 从 proxy-only 推进到最小 Python runtime boundary，不迁完整 job store/event bus。
- 角色分工：worker 负责 job lifecycle envelope 和测试；reviewer 确认 Node 仍拥有 job store、event stream、diagnostics。

### 状态清单
- [x] Python runtime boundary 覆盖 selected job start/status/complete/fail/cancel envelope。
- [x] Node 测试覆盖 Python mode 下 job runtime boundary。
- [x] failed/cancelled 不伪装成 completed。
- [x] gate 全绿。
- [x] Codex review 确认没有迁完整 `/api/blueprint` job store。

## 目标

Blueprint jobs 目前有 proxy 证据，但 job lifecycle、event streams、diagnostics 和 store 仍是 Node-owned。本任务只补最小 Python runtime boundary，让 selected job 状态 envelope 能被 Python 表达和 Node 校验。完整 job store 和 event bus 不在本任务范围内。

## 允许修改的文件
- `slide-rule-python/services/blueprint_job_runtime.py`
- `slide-rule-python/tests/test_blueprint_job_runtime_boundary.py`
- `slide-rule-python/tests/test_blueprint_job_runtime_proxy.py`
- `server/routes/blueprint/jobs/service.ts`
- `server/routes/__tests__/blueprint.job-runtime-python-boundary.test.ts`
- `server/routes/__tests__/blueprint.job-runtime-python-proxy.test.ts`
- `shared/blueprint/jobs/types.ts`
- `agent-loop/tasks/backend-python-blueprint-job-runtime-boundary-89.md`

## 禁止扩大范围
- 不迁完整 `/api/blueprint`。
- 不改 job store schema。
- 不迁 event bus、socket relay、diagnostics、ledger、preview、prompt package。
- 不改前端 UI。
- 不提交 `.agent-loop` 运行产物。
- 不更新总迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintJobRuntimeBoundary89Gates`。

## 成功标准

- Python 测试覆盖 job started/running/completed/failed/cancelled/error。
- Node 测试确认 Python boundary 不绕过 Node job store 所有权。
- 错误 envelope 稳定，failed/cancelled 不写成 success。
- TypeScript、pytest、mojibake gate 通过。
