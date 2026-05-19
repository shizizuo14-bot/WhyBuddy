# Autopilot Capability Runtime Enablement — 端到端真实提交手测说明

> 本文档为 spec `autopilot-capability-runtime-enablement` Task 19 的交付物，
> 不要求自动化；作为 reviewer checklist 与发版前的可观测性 smoke。

## 适用场景

在一台满足以下条件的开发机上验证：

- 已安装 Docker Desktop（或等价 docker daemon），且 `docker ps` 可正常执行。
- 已配置 `.env`，至少设置 `LLM_API_KEY`（真实或 fallback 模型均可）。
- 已启动 `services/lobster-executor`（由 `pnpm run dev:all` 自动拉起）。
- 网络可访问目标 GitHub 仓库（若无代理则测试仓库必须是 public）。

## 测试一：Docker 可达 + master switch 默认 on → 5 桥走真实执行

### 步骤

1. 清理历史装配：`rm -rf data/blueprint/*`（可选，保证 jobStore 干净）。
2. 启动完整开发栈：

   ```bash
   pnpm run dev:all
   ```

   `scripts/dev-all.mjs` 已在 Task 14 接线默认注入 `AUTOPILOT_REAL_RUNTIME=true`；
   若本地需要显式关闭可 `AUTOPILOT_REAL_RUNTIME=false pnpm run dev:all`。
3. 打开浏览器访问 `http://localhost:3000/autopilot`。
4. 在 intake 面板提交目标仓库 URL，例如：

   ```text
   https://github.com/666ghj/MiroFish
   ```

5. 观察 server 终端输出：

   - 应看到 `docker-analysis-sandbox` 派发 Docker job 并回流 HMAC callback。
   - 应看到 `mcp-github-source` 调用 MCP adapter（非模板化 fallback）。
   - 应看到 `role-system-architecture` / `aigc-spec-node` 走 `callLLMJson`。
   - 应看到 `role.*` 事件（`role.activated` / `role.watching` / `role.reviewing` / `role.sleeping`）。

6. 调用诊断端点：

   ```bash
   curl http://localhost:3001/api/blueprint/diagnostics
   ```

   期望响应：

   - `masterSwitch === "true"`
   - `buildTarget === "development"` 或 `null`（视 dev:all 环境）
   - `bridges.docker.mode === "real"`，`realInvocations >= 1`
   - `bridges.mcpGithub.mode === "real"`
   - `bridges.role.mode === "real"`
   - `bridges.aigcNode.mode === "real"`
   - `bridges.agentCrewStageActivation.mode === "real"` 或 `"enabled"`

### 通过判据

- 所有 capability invocation 的 `provenance.executionMode === "real"`。
- `artifacts` 中包含真实 containerId / repo metadata / structured roles。
- 无 5xx 错误；HTTP 201 创建 job。

## 测试二：Docker 关闭 → docker 单独 fallback，其余 real

### 步骤

1. 停止 Docker Desktop（或 `docker daemon`）。
2. 保持 `pnpm run dev:all` 运行（或重启）。
3. 重复测试一的 POST 流程。

### 通过判据

- HTTP 仍返回 201（服务器启动不失败、job 不阻塞）。
- `docker-analysis-sandbox` invocation：`provenance.executionMode === "simulated_fallback"`，
  `error` 匹配 `/executor unreachable/`。
- `mcp-github-source` / `role-system-architecture` / `aigc-spec-node` 仍为 `"real"`。
- `GET /api/blueprint/diagnostics`：

  - `bridges.docker.mode === "fallback"`，`lastError` 包含 `executor unreachable`。
  - `bridges.mcpGithub.mode === "real"`。
  - 其余桥仍为 `"real"` 或 `"enabled"`。

## 测试三：显式 opt-out → 全体 fallback

### 步骤

1. 停止 dev:all。
2. 显式关闭 master switch：

   ```bash
   AUTOPILOT_REAL_RUNTIME=false pnpm run dev:all
   ```

3. 重复测试一的 POST 流程。

### 通过判据

- 所有 5 条桥 invocation 均为 `simulated_fallback`。
- `GET /api/blueprint/diagnostics`：

  - `masterSwitch === "false"`
  - 所有 `bridges.*.mode` 为 `"disabled"`、`"fallback"` 或 `"unknown"`。

## 测试四（可选）：LLM apiKey 缺失 → role / aigcNode fallback

### 步骤

1. 临时清空 `.env` 中的 `LLM_API_KEY`，或 `LLM_API_KEY= pnpm run dev:all`。
2. 保持 Docker 可用。
3. POST 测试仓库。

### 通过判据

- `docker-analysis-sandbox` / `mcp-github-source` 仍 real。
- `role-system-architecture` / `aigc-spec-node` 走 fallback（tier-2 dependency
  check：apiKey 为空 → `executionMode === "simulated_fallback"`）。
- `lastError` 提示 apiKey / LLM config 缺失。

## 回滚说明

- 本 spec 只改 bridge 的外层装配与默认值；若需临时恢复旧默认（opt-in off），
  只需在部署环境显式 `AUTOPILOT_REAL_RUNTIME=false`。
- 5 条 `BLUEPRINT_*_ENABLED` flag 仍保留原名、原语义，显式设置永远最优先。
- 所有 bridge 内部三层 early-exit（env gate / dependency / runtime error）未
  改动；既有单测（5140+）默认 `BUILD_TARGET=test` 强制全桥 fallback，保持
  完全兼容。

## 相关 requirements

- 6.1 / 6.2：graceful degradation
- 10.6：端到端真实提交 smoke
- 1.6：dev:all 默认 `AUTOPILOT_REAL_RUNTIME=true`
- 5.1 / 5.4 / 5.9：`GET /api/blueprint/diagnostics` 可用性与无鉴权
