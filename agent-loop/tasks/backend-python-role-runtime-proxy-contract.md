# 后端 NodeJS 到 Python 迁移：role runtime proxy contract

## 执行状态
- 状态：待执行
- 目标：为 `server/routes/blueprint/role-agent-runtime` 建立 Python role runtime proxy contract。
- 角色分工：worker 负责最小 runtime 契约；reviewer 确认不执行真实 agent/工具副作用。

### 状态清单
- [x] Python 侧有 role runtime invoke/progress/callback contract。
- [x] Node 侧测试覆盖 success/progress/error/schema_invalid。
- [x] trace sanitizer（轨迹脱敏）语义保留。
- [x] gate 全绿。
- [x] Codex review 确认没有泄漏 prompt/key/tool output。

## 目标

role runtime 是 Node 后端大块之一。此任务只让 Python 接住最小 contract 和 schema，不迁完整 role-agent-runtime。

## 允许修改的文件
- `agent-loop/tasks/backend-python-role-runtime-proxy-contract.md`
- `slide-rule-python/services/role_runtime.py`
- `slide-rule-python/tests/test_role_runtime_proxy_contract.py`
- `server/routes/blueprint/role-agent-runtime/**/*.ts`
- `server/routes/__tests__/blueprint.role-runtime-python-proxy.test.ts`
- `shared/blueprint/role-container/types.ts`

## 禁止扩大范围
- 不执行真实本地命令。
- 不调用真实外部工具。
- 不泄漏 prompt、API key 或 trace 原文。
- 不改 role registry 的真实加载策略。

## 必跑 gate

使用 `agent-loop/scripts/migration-queue.json` 里的 `roleRuntimeProxyContractGates`。

## 成功标准

- Python contract 覆盖 invoke/progress/callback/error。
- Node 测试确认 trace sanitizer 仍生效。
- schema_invalid 不能伪装成 success。
- gate 全绿。
