# 后端 NodeJS 到 Python 迁移：Node route cutover audit 100

## 执行状态

- 状态：待执行
- 目标：在 100% 候选代码任务之后，审计 Node routes（Node 路由）是否只剩 thin proxy（薄代理）、compat shell（兼容壳）或明确保留的 Node-owned 边界。
- 角色分工：worker 负责编写审计报告和更新任务状态；reviewer 确认没有把 docs-only 当作业务迁移，也没有漏掉仍 Node-owned 的真实大分母。

### 状态清单

- [ ] 盘点 `server/routes`、`server/core`、`server/auth`、`server/tasks`、`server/permission`、`server/audit`、`server/routes/node-adapters`。
- [ ] 每个剩余 Node-owned 点必须标成 thin-proxy、compat-shell、production-owned、node-owned-gap 或 intentionally-retained。
- [ ] 输出 `docs/backend-python-node-route-cutover-audit-100.md`。
- [ ] gate 全绿。
- [ ] Codex review 确认审计报告没有虚高整体 100%。

## 目标

100% 之前必须有最后一次 route cutover audit。这个任务不改业务代码，不新增迁移分子；它只判断前面 100% 候选任务之后，Node 侧剩余代码是否已经退化成薄代理、兼容壳、明确的生产边界，还是仍然存在必须继续迁移的大块 Node-owned 逻辑。

## 允许修改的文件

- `docs/backend-python-node-route-cutover-audit-100.md`
- `agent-loop/tasks/backend-python-node-route-cutover-audit-100.md`

## 允许读取和引用的证据

- `agent-loop/scripts/migration-queue.json`
- `agent-loop/tasks/sliderule-python-migration-status.md`
- `docs/backend-python-node-route-inventory-90.md`
- `docs/backend-python-runtime-depth-audit-90.md`
- `docs/backend-python-production-wiring-reality-95.md`
- `server/routes/**`
- `server/core/**`
- `server/auth/**`
- `server/tasks/**`
- `server/permission/**`
- `server/audit/**`
- `server/routes/node-adapters/**`
- `tws-ai-slide-rule-python/services/**`
- `tws-ai-slide-rule-python/tests/**`

## 禁止扩大范围

- 不改业务代码。
- 不提交 `.agent-loop` 运行产物。
- 不把本任务计入业务迁移分子。
- 不把 fake/synthetic/degraded/skipped 写成 production takeover。
- 不把 SlideRule V5 子系统百分比外推成整体 backend 百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `nodeRouteCutoverAudit100Gates`。

## 成功标准

- 报告列出剩余 Node route/core/auth/task/permission/audit/web-aigc adapter 的最终分类。
- 报告明确哪些可以接受为 thin proxy/compat shell，哪些仍阻止整体 100%。
- 如果仍有阻塞项，必须写清楚不能宣布 100%。
- mojibake 扫描通过。
