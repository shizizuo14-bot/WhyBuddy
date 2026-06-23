# 后端 NodeJS 迁 Python：Blueprint production ownership closure 102

## 执行状态

- 状态：待执行
- 目标：对 Blueprint 主系统最后的 production-owned / node-owned-gap 做 102 收口。优先补 Python-owned runtime / bridge；如果不能安全接管，必须产出可测试的 retained / blocked decision，不能把 readiness 写成完整迁移。
- 角色分工：worker 负责 Python closure service、Node bridge/route 消费和测试；reviewer 必须确认没有把 shell/state/job handoff 夸大成完整 `/api/blueprint` 生产接管。

### 状态清单

- [x] Python 能输出 Blueprint production ownership closure decision。
- [x] Node bridge 能消费 state/job/event bus/ledger/replan/prompt/preview 的 ownership decision。
- [x] 测试能区分 `python-owned`、`node-retained`、`blocked`、`unsupported`。
- [x] gate 全绿。
- [x] review 确认没有虚写整体 Blueprint 100%。

## 背景

101 阶段已经补了 shell/state/job handoff readiness，但状态表仍然明确：Blueprint 主 route shell、state machine、job store、event bus、diagnostics、ledger、replan、prompt package、preview 仍是主要 node-owned-gap。102 这一刀只做最后判定：能安全交给 Python 的就补 runtime 证据；不能交的要写清楚为什么仍由 Node 保留。

## 允许修改的文件

- `tws-ai-slide-rule-python/services/blueprint_production_ownership_closure.py`
- `tws-ai-slide-rule-python/services/blueprint_shell_state_cutover.py`
- `tws-ai-slide-rule-python/services/blueprint_main_runtime_closure.py`
- `tws-ai-slide-rule-python/tests/test_blueprint_production_ownership_closure_102.py`
- `server/routes/blueprint/production-ownership-closure-python.ts`
- `server/routes/blueprint/shell-state-cutover-python.ts`
- `server/routes/blueprint/main-runtime-closure-python.ts`
- `server/routes/__tests__/blueprint.production-ownership-closure-102.test.ts`
- `server/routes/__tests__/blueprint.shell-state-cutover-101.test.ts`
- `shared/blueprint/**`
- `agent-loop/tasks/backend-python-blueprint-production-ownership-closure-102.md`

## 禁止扩大范围

- 不重写完整 `/api/blueprint` 大路由。
- 不迁移真实 job store、event bus、ledger、diagnostics、prompt package 的持久化实现，除非测试能证明 Python 真的接管。
- 不删除既有 Blueprint 100/101 测试。
- 不把 `node-retained`、`blocked`、`unsupported` 写成 `python-owned`。
- 不提交 `.agent-loop`、`.worktrees`、日志、缓存或真实用户数据。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `blueprintProductionOwnershipClosure102Gates`。

## 成功标准

- Python closure service 覆盖 state/job/event bus/ledger/replan/prompt/preview 的 ownership 分类。
- Node 测试证明 bridge 会消费分类，并且保留 Node-owned production 边界时不会误报完成。
- 产生真实代码 diff，不能只勾选任务或只改文档。
- 所有 gate 通过。

## 给 worker 的大白话

这不是让你一口气重写 Blueprint。你要做的是把最后几块到底谁负责说死：能交给 Python 就拿出代码和测试；不能交，就让系统用 decision 明确写着 Node 继续保留，别靠状态文档猜。
