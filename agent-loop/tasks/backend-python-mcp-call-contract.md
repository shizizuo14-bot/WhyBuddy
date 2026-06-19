# 后端 NodeJS 到 Python 迁移：mcp.call runtime contract

## 执行状态

- 状态：待执行
- 目标：在 mcp.call boundary audit（边界审计）之后，补 runtime contract（运行时契约），仍不直接接生产 MCP
- 角色分工：Grok 负责补契约测试；Codex 负责审查是否把 fake runtime 说成真实 MCP

### 状态清单

- [ ] 已执行 AgentLoop
- [ ] contract test 覆盖 toolName/serverId/arguments/provenance/error shape
- [ ] fake adapter 可证明成功与失败边界
- [ ] 没有接生产 MCP server
- [ ] gate 全绿
- [ ] Codex review（审查）已确认没有把 `python-rag` 或 fake MCP 当成真实 runtime

## 目标

当前审计已经确认 `mcp.call` 不是真实 MCP runtime。下一步不是直接接生产，而是先补最小 runtime contract：输入字段、成功 provenance、失败 shape、权限/不可用时怎么表达。

这个任务为后续真正桥接 Node `McpToolAdapter` 或 Python MCP client 做准备。

## 允许修改的文件

- `tws-ai-slide-rule-python/tests/test_mcp_call_contract.py`
- `tws-ai-slide-rule-python/services/capability_maps.py`
- `tws-ai-slide-rule-python/services/slide_rule_executor.py`
- `server/routes/__tests__/sliderule.mcp-call-contract.test.ts`
- `docs/backend-python-mcp-call-boundary-audit.md`
- `agent-loop/tasks/backend-python-mcp-call-contract.md`

## 禁止扩大范围

- 不接真实 MCP server。
- 不改权限系统。
- 不改 `server/tool/api/mcp-tool-adapter.ts` 的生产行为，除非测试暴露明确契约 bug。
- 不把 fake adapter 说成 production runtime。
- 不更新全局迁移百分比。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `mcpCallContractGates`。

## 成功标准

- Python contract test 覆盖成功、tool unavailable、permission/degraded 三类 shape。
- Node contract test 确认不会把 fallback 误标为 real MCP。
- provenance 不再混淆 `python-rag`、`mcp:*` 和 degraded。
- 所有 gate 通过。
