# 后端 NodeJS 到 Python 迁移：Knowledge admin runtime bridge

## 执行状态
- 状态：待执行
- 目标：把 knowledge admin 从 proxy contract 推进到 Python runtime bridge，覆盖 list/get/upsert/delete 的最小管理面。
- 角色分工：worker 负责 Python runtime、Node route/client 映射和测试；reviewer 确认不触碰真实生产知识库或外部存储。

### 状态清单
- [ ] Python runtime bridge 支持 list/get/upsert/delete。
- [ ] Node route 能在 Python mode 下转发并保留错误 envelope。
- [ ] validation/error 不伪装成成功。
- [ ] gate 全绿。
- [ ] Codex review 确认没有真实生产数据副作用。

## 目标

knowledge admin 是 RAG/知识库迁移的管理入口。先做可测试的 runtime bridge，不把 ingestion、embedding、真实索引重建混进来。

## 允许修改的文件
- `tws-ai-slide-rule-python/services/knowledge_admin_runtime.py`
- `tws-ai-slide-rule-python/tests/test_knowledge_admin_runtime_bridge.py`
- `tws-ai-slide-rule-python/tests/test_knowledge_admin_proxy_contract.py`
- `server/routes/knowledge-admin.ts`
- `server/routes/__tests__/knowledge-admin-python-runtime.test.ts`
- `server/routes/__tests__/knowledge-admin-python-proxy.test.ts`
- `agent-loop/tasks/backend-python-knowledge-admin-runtime-bridge.md`

## 禁止扩大范围
- 不接真实生产知识库。
- 不做大规模 ingestion 或 embedding 重建。
- 不修改鉴权/权限主逻辑。
- 不提交 `.agent-loop` 运行产物。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `knowledgeAdminRuntimeBridgeGates`。

## 成功标准

- Python 测试覆盖 list/get/upsert/delete 和错误 envelope。
- Node 测试覆盖 Python mode runtime 转发。
- validation/error 不被吞掉或伪装成成功。
- 所有 gate 通过。
