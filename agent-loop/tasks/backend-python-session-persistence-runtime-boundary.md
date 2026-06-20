# 后端 NodeJS 到 Python 迁移：Session persistence runtime boundary

## 执行状态
- 状态：待执行
- 目标：把 session persistence 从 contract 推进到 Python runtime boundary，先覆盖读写/恢复/错误语义，不替换整个存储系统。
- 角色分工：worker 负责 Python persistence boundary、Node sessions store 测试；reviewer 确认不改生产 schema 和 auth session 主链路。

### 状态清单
- [ ] Python persistence boundary 支持 save/load/list/delete 或等价最小接口。
- [ ] Node sessions store 能在 Python mode 下验证恢复行为。
- [ ] missing/corrupt/error 状态不伪装成空成功。
- [ ] gate 全绿。
- [ ] Codex review 确认没有扩大到 auth/session 全链路。

## 目标

session persistence 是后续 auth、audit、Blueprint runtime 的底座之一。先把 runtime boundary 做硬，避免后续任务用 fallback 假装已迁移。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/persistence.py`
- `tws-ai-slide-rule-python/tests/test_session_persistence_contract.py`
- `server/routes/__tests__/sliderule.sessions-store.test.ts`
- `agent-loop/tasks/backend-python-session-persistence-runtime-boundary.md`

## 禁止扩大范围
- 不改生产数据库 schema。
- 不迁 auth session 主链路。
- 不做全局 session store 替换。
- 不提交 `.agent-loop` 运行产物。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `sessionPersistenceContractGates`。

## 成功标准

- Python 测试覆盖 session save/load/list/delete 或等价最小接口。
- Node 测试覆盖 Python mode 的恢复与错误映射。
- missing/corrupt/error 不被当作空成功。
- 所有 gate 通过。
