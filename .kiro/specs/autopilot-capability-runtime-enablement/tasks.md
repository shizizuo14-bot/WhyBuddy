# 实施任务：Autopilot Capability Runtime Enablement

## 概述

本任务清单把 design 文档的改造点收敛为 20 个可验证的代码任务，覆盖：

- `server/routes/blueprint/runtime-enablement/` 下 4 个新模块（resolver / executor-factory / diagnostics-store / subscriber）及其 co-located 单测
- `server/routes/blueprint/context.ts` 与 `server/routes/blueprint.ts` 的装配层改造
- `server/index.ts` composition root 改造（master switch 解析 + mcp deps 条件注入 + 事件订阅挂载）
- `vitest` setup 注入 `BUILD_TARGET=test`
- `scripts/dev/dev-all.js` 注入 master switch
- `.env.example` / `.kiro/steering/project-overview.md` 文档同步
- `server/tests/blueprint-routes.test.ts` 追加 3 条 E2E
- 最终全量回归

依赖顺序：1（resolver）→ 2（resolver 单测）→ 3（executor-factory）→ 4（executor-factory 单测）→ 5（diagnostics-store）→ 6（diagnostics-store 单测）→ 7（subscriber）→ 8（subscriber 单测）→ 9（checkpoint）→ 10（context.ts 装配）→ 11（blueprint.ts diagnostics 路由）→ 12（server/index.ts composition root）→ 13（vitest setup）→ 14（scripts/dev 注入）→ 15（.env.example）→ 16（project-overview steering）→ 17（blueprint-routes.test.ts 追加 E2E）→ 18（既有测试回归）→ 19（端到端真实提交 smoke 或手测说明）→ 20（最终验收）。

需求 8.5 明确**不引入 PBT**；所有单测均为 example-based。

## 任务列表

- [x] 1. 新建 `server/routes/blueprint/runtime-enablement/resolver.ts`
  - [x] 1.1 定义 `BridgeEnablementKey` union 枚举（含 5 个桥级 env 变量名字面量）、`ResolveBridgeEnablementInput` 接口、`resolveBridgeEnablement(input)` 纯函数
  - [x] 1.2 实现算法（design §4.1 步骤 1-4）：`BUILD_TARGET === "test"` → 除非 explicit === "true" 否则返回 `"false"`；explicit 非空 → 返回 explicit 原值；master switch 为 `"true"` / `"false"` → 相应返回；其它 → 返回 `undefined`
  - [x] 1.3 导出 `resolveAllBridgeEnablement(env: NodeJS.ProcessEnv): ResolvedBridgeEnablement`：一次性解析 5 个桥级 flag，把解析结果写回 env（需求 1.5 幂等性保证：若写回值与 env 当前值相同则 no-op）
  - [x] 1.4 函数签名与 JSDoc 引用 design §4.1 / §4.2 与需求 1.4 / 1.5
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. 新建 `server/routes/blueprint/runtime-enablement/resolver.test.ts`
  - [x] 2.1 覆盖 `resolveBridgeEnablement` 的 10 个场景：(a) BUILD_TARGET=test + explicit=undefined → `"false"`；(b) BUILD_TARGET=test + explicit=`"true"` → `"true"`；(c) BUILD_TARGET=test + explicit=`"false"` → `"false"`；(d) BUILD_TARGET=undefined + explicit=`"true"` → `"true"`；(e) BUILD_TARGET=undefined + masterSwitch=`"true"` → `"true"`；(f) BUILD_TARGET=undefined + masterSwitch=`"false"` → `"false"`；(g) explicit=`""` 等价于 undefined；(h) explicit=`"True"`（非小写 true）原样返回；(i) 同 input 多次调用返回相同值；(j) 函数不读 `process.env`（mock process.env 观察未被读）
  - [x] 2.2 覆盖 `resolveAllBridgeEnablement`：幂等（调两次 env 不再变化）；第一次写入后返回值快照与 env 状态一致；传入冻结 env 对象时也不抛错（或按策略决定——只写入允许的 key）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.5_

- [x] 3. 新建 `server/routes/blueprint/runtime-enablement/executor-factory.ts`
  - [x] 3.1 定义 `ResolveExecutorClientInput` 接口（`dockerEnabled` / `baseUrl` / `callbackUrl` / 可选 `logger` / 可选 `onProbeResult`）
  - [x] 3.2 导出 `resolveDefaultExecutorClient(input): ExecutorClient | undefined` 纯函数（除 probe 副作用外）
  - [x] 3.3 实现 design §4.3 算法：`dockerEnabled !== "true"` → undefined；baseUrl 空 → warn + undefined；构造失败 → warn + undefined；成功 → 返回 client + 通过 `queueMicrotask` 调度 `assertReachable().then/catch` 回调 `onProbeResult`
  - [x] 3.4 `import type { ExecutorClient } from "../../../core/executor-client.js"`；实际构造时动态 `await import` 或直接 `new ExecutorClient({ baseUrl, callbackUrl })`（保持与 execution-bridge.ts 一致的构造签名）
  - _Requirements: 2.1, 2.4, 2.5, 2.6_

- [x] 4. 新建 `server/routes/blueprint/runtime-enablement/executor-factory.test.ts`
  - [x] 4.1 覆盖 6 个场景：(a) dockerEnabled=undefined → undefined 且无 probe；(b) dockerEnabled=`"false"` → undefined；(c) dockerEnabled=`"true"` + baseUrl=`""` → undefined + logger.warn 被调用；(d) dockerEnabled=`"true"` + baseUrl 合法 → 返回 `ExecutorClient` 实例；(e) 成功构造后 `onProbeResult` 在 microtask 后被调用一次；(f) 构造抛错时 warn + undefined
  - [x] 4.2 使用 `vi.fn()` 作为 onProbeResult spy；`vi.waitFor` 验证 probe 回调确实被异步调用；用 `vi.mock` 替换 `ExecutorClient` 构造器+`assertReachable` 避免真实 HTTP
  - _Requirements: 2.1, 2.4, 2.5, 2.6, 8.5_

- [x] 5. 新建 `server/routes/blueprint/runtime-enablement/diagnostics-store.ts`
  - [x] 5.1 定义 `BridgeId` union、`BridgeDiagnosticEntry` / `BlueprintRuntimeDiagnosticsSnapshot` 接口、`BlueprintRuntimeDiagnosticsStore` 接口（含 `recordBridgeInvocation` / `recordBridgeConfiguration` / `snapshot`）
  - [x] 5.2 导出 `createBlueprintRuntimeDiagnosticsStore(): BlueprintRuntimeDiagnosticsStore` 工厂；内部 `Map<BridgeId, BridgeDiagnosticEntry>`
  - [x] 5.3 `recordBridgeInvocation`：更新 `lastInvocationAt`（调用 `now()`）、`lastMode`、`lastError`（经脱敏+截断 400）、`totalInvocations++`、根据 mode 对 `realInvocations` / `fallbackInvocations` 累加；同时更新 `mode` 字段为 `"real"` 或 `"fallback"`
  - [x] 5.4 `recordBridgeConfiguration`：写入 `enabledByConfig` / `dependencyReady`；同时若从未 invoke 过，`mode` 字段取 `enabledByConfig ? "enabled" : "disabled"`
  - [x] 5.5 `snapshot(now)`：返回深拷贝 `BlueprintRuntimeDiagnosticsSnapshot`，包含 `masterSwitch` / `buildTarget` 从 `process.env` 读取（唯一读 env 的位置）、`bridges` 5 项（缺省项以"未知"状态填充）、`generatedAt`
  - [x] 5.6 复用 `applyAgentCrewRedaction` 或等价脱敏函数；`import { applyAgentCrewRedaction } from "../agent-crew-stage-activation/policy.js"` 或就地定义一个最小脱敏函数（优先复用既有）
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_

- [x] 6. 新建 `server/routes/blueprint/runtime-enablement/diagnostics-store.test.ts`
  - [x] 6.1 覆盖 5 场景：(a) 空 store snapshot 返回 5 桥的 `mode === "unknown"` 且所有计数器为 0；(b) recordBridgeConfiguration 后 snapshot 反映 `enabledByConfig` + `mode === "enabled"` 或 `"disabled"`；(c) recordBridgeInvocation("docker", {mode:"real"}) 后 `realInvocations === 1` + `lastMode === "real"` + `mode === "real"`；(d) 连续两次 invocation 计数器正确累加；(e) `lastError` 超 400 字符被截断、API key 子串被脱敏
  - [x] 6.2 使用固定 `now = () => new Date("2026-05-12T03:45:00Z")` 断言 ISO 时间正确填入
  - _Requirements: 5.3, 5.5, 5.7, 8.5_

- [x] 7. 新建 `server/routes/blueprint/runtime-enablement/subscriber.ts`
  - [x] 7.1 导出 `attachDiagnosticsSubscriber(eventBus: BlueprintEventBus, store: BlueprintRuntimeDiagnosticsStore): () => void` 函数
  - [x] 7.2 实现 design §4.6 映射：`capability.completed` / `capability.failed` 事件的 `payload.capabilityId` 映射到 bridgeId（`"docker-analysis-sandbox" → "docker"` / `"mcp-github-source" → "mcpGithub"` / `"role-system-architecture" → "role"` / `"aigc-spec-node" → "aigcNode"`）；读 `payload.provenance.executionMode` / `payload.provenance.error`，调用 `store.recordBridgeInvocation`
  - [x] 7.3 `role.*` 家族事件（`role.activated` / `role.watching` / `role.reviewing` / `role.sleeping`）：读 `activationDriverExecutionMode`，若非 undefined → `store.recordBridgeInvocation("agentCrewStageActivation", { mode: ... })`
  - [x] 7.4 订阅回调整体包 `try { ... } catch { /* swallow */ }`；异常不传播；logger 可选
  - [x] 7.5 返回 unsubscribe 函数
  - _Requirements: 5.6, 6.5, 7.2_

- [x] 8. 新建 `server/routes/blueprint/runtime-enablement/subscriber.test.ts`
  - [x] 8.1 覆盖 6 场景：(a) capability.completed + capabilityId=docker-analysis-sandbox + executionMode=real → recordBridgeInvocation("docker",{mode:"real"}) 被调一次；(b) 同上但 executionMode=simulated_fallback → 映射为 fallback；(c) 未知 capabilityId 不记录；(d) role.activated + activationDriverExecutionMode=real → record("agentCrewStageActivation")；(e) 事件 payload 非法 / 字段缺失 → 不抛错；(f) recordBridgeInvocation 抛错时订阅本身吞掉不传播
  - [x] 8.2 使用 fake eventBus（就地实现 `EventEmitter`）与 spy 过的 store
  - _Requirements: 5.6, 6.5, 8.5_

- [x] 9. Checkpoint — 跑通 runtime-enablement 子域单测
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/runtime-enablement/resolver.test.ts server/routes/blueprint/runtime-enablement/executor-factory.test.ts server/routes/blueprint/runtime-enablement/diagnostics-store.test.ts server/routes/blueprint/runtime-enablement/subscriber.test.ts`，确认 20+ 条单测全部通过；失败必须修复对应模块后再继续。同步跑 `node --run check` 确认无新增 TS 错误
  - _Requirements: 8.4, 8.5_

- [x] 10. 改造 `server/routes/blueprint/context.ts`
  - [x] 10.1 在 `BlueprintServiceContext` 追加必填字段 `runtimeDiagnostics: BlueprintRuntimeDiagnosticsStore`；在 `BlueprintServiceContextDeps` 追加可选字段 `runtimeDiagnostics?` 与 `autoResolveExecutorClient?: boolean`（默认 true）
  - [x] 10.2 在 `buildBlueprintServiceContext(deps)` 内部装配 `runtimeDiagnostics ← deps.runtimeDiagnostics ?? createBlueprintRuntimeDiagnosticsStore()`
  - [x] 10.3 若 `deps.executorClient === undefined` 且 `deps.autoResolveExecutorClient !== false`：调用 `resolveDefaultExecutorClient({ dockerEnabled: process.env.BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED, baseUrl: process.env.LOBSTER_EXECUTOR_BASE_URL, callbackUrl: deriveCallbackUrl(), logger, onProbeResult })`；否则沿用现有 `deps.executorClient` 透传
  - [x] 10.4 在 ctx 完全装配后（所有 bridge late-bind 完成后）调用 `attachDiagnosticsSubscriber(ctx.eventBus, ctx.runtimeDiagnostics)`；把 unsubscribe 保存到 ctx 的一个可选私有字段（或忽略，因为 ctx 生命周期就是进程）
  - [x] 10.5 callback URL 派生：复用既有 `server/core/execution-bridge.ts` 的 `buildCallbackUrl(serverBaseUrl)`；`serverBaseUrl` 从 `process.env.SERVER_BASE_URL ?? "http://localhost:3001"` 派生
  - [x] 10.6 保证 `buildBlueprintServiceContext({})` 在 test 环境（BUILD_TARGET=test）下：`ctx.executorClient === undefined`、`ctx.runtimeDiagnostics` 非空、不发起 probe（因为 dockerEnabled 被 resolver 固定为 false）
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 4.6, 5.1, 5.6, 7.1_

- [x] 11. 在 `server/routes/blueprint.ts` 新增 `GET /diagnostics` 路由
  - [x] 11.1 在 `createBlueprintRouter()` 内部现有 router 上追加 `router.get("/diagnostics", handleDiagnostics)`
  - [x] 11.2 实现 `handleDiagnostics(ctx)`：try/catch 调用 `ctx.runtimeDiagnostics.snapshot(ctx.now)` 返回 200 + JSON；catch 返回 500 + `{ error: "diagnostics unavailable" }`
  - [x] 11.3 放在 `/capabilities` 或 `/specs` 等只读端点旁；不加任何鉴权中间件（本 spec 不引入新鉴权）
  - _Requirements: 5.1, 5.4, 5.9, 7.4_

- [x] 12. 改造 `server/index.ts` composition root
  - [x] 12.1 在现有 `buildBlueprintServiceContext({})` 之前插入 `const { resolveAllBridgeEnablement } = await import("./routes/blueprint/runtime-enablement/resolver.js"); const resolvedEnablement = resolveAllBridgeEnablement(process.env);`
  - [x] 12.2 修改原 `const mcpBridgeEnabled = process.env.BLUEPRINT_MCP_CAPABILITY_BRIDGE_ENABLED === "true";` 行：改为 `const mcpBridgeEnabled = resolvedEnablement.mcpGithub === "true";`（保持 if 分支逻辑不变）
  - [x] 12.3 在 `mcpBridgeEnabled === true` 分支后追加一条 `blueprintServiceContext.runtimeDiagnostics.recordBridgeConfiguration("mcpGithub", { enabledByConfig: true, dependencyReady: true });`；else 分支追加 `recordBridgeConfiguration("mcpGithub", { enabledByConfig: false, dependencyReady: false });`
  - [x] 12.4 类似地为其他 4 桥在合适位置补一条启动期 `recordBridgeConfiguration`：docker 桥由 executor-factory 的 probe 异步回调填充，这里同步补一次初始 configuration；role / aigcNode 根据 `resolvedEnablement.role` / `.aigcNode` 是否 "true" + `ctx.llm.getConfig().apiKey` 是否非空写入 `enabledByConfig` / `dependencyReady`；agentCrewStageActivation 根据 `resolvedEnablement.agentCrewStageActivation === "true"` 写入
  - [x] 12.5 保持原有 5140 测试行为：test 环境下 resolvedEnablement 全部为 "false" → 与今天行为完全等价
  - _Requirements: 1.1, 2.1, 2.3, 3.1, 3.2, 3.5, 6.1, 7.7_

- [x] 13. 改造或新建 `vitest.setup.ts`（或等价 `setupFiles`）
  - [x] 13.1 若已有 setup 文件：在文件末尾追加 `if (!process.env.BUILD_TARGET) { process.env.BUILD_TARGET = "test"; }`
  - [x] 13.2 若无 setup 文件：新建并在 `vitest.config.ts` / `vitest.config.server.ts` 的 `test.setupFiles` 字段指向它
  - [x] 13.3 验证：执行既有任一测试，`process.env.BUILD_TARGET === "test"` 在测试中可见
  - _Requirements: 1.2, 7.6, 8.1_

- [x] 14. 改造 `scripts/dev/dev-all.js`（或 dev-all 等价 js/mjs）
  - [x] 14.1 找到 spawn 子进程的位置；在 env 构造处追加 `AUTOPILOT_REAL_RUNTIME: process.env.AUTOPILOT_REAL_RUNTIME ?? "true"`
  - [x] 14.2 若项目使用 `concurrently` / `npm-run-all` 等多进程 orchestrator，选择在被 spawn 的服务端命令前加 `cross-env AUTOPILOT_REAL_RUNTIME=true node server/index.ts`（且使用 `??:-` shell 语义保留用户显式值）；或在顶层 `package.json` 的 scripts 中增加一个 shell snippet
  - [x] 14.3 保证用户 `AUTOPILOT_REAL_RUNTIME=false pnpm run dev:all` 时其显式值不被覆盖
  - _Requirements: 1.6_

- [x] 15. 改造 `.env.example`
  - [x] 15.1 在 `.env.example` 顶部 "基础运行" 区段后、LLM 配置前新增区段：
    ```
    # ── Autopilot Capability Runtime ──────────────────────────────
    # Master switch for autopilot capability bridges.
    # "true"  → 5 bridges (docker / mcp / role / aigc-node / stage activation)
    #           default to real execution when their dependencies are available
    # "false" → all 5 bridges run in simulated fallback (template output)
    # unset   → preserves legacy opt-in semantics (same as "false" today)
    # Explicit BLUEPRINT_*_CAPABILITY_BRIDGE_ENABLED below always wins over this switch.
    AUTOPILOT_REAL_RUNTIME=true
    ```
  - [x] 15.2 在现有 `# Lobster executor` 区段下方追加（或就近）一段中文 + 英文注释，说明 5 个 `BLUEPRINT_*_ENABLED` flag 通常不需单独设置，由 master switch 驱动；显式设置仍最优先
  - [x] 15.3 不修改其它已存在的环境变量
  - _Requirements: 9.1, 9.4_

- [x] 16. 更新 `.kiro/steering/project-overview.md`
  - [x] 16.1 在"运行时 / executor 模式"或"当前进度快照"段落附近新增 1-3 段中文说明：
    - Autopilot 5 条 capability bridge 默认装配已从 opt-in off 翻转为 opt-out on，由 `AUTOPILOT_REAL_RUNTIME` 驱动
    - `BUILD_TARGET=test` 保留既有 5140 测试兼容性
    - `GET /api/blueprint/diagnostics` 提供每条桥的 real / fallback / enabled / disabled 状态摘要
    - Docker 不可达 / MCP 初始化失败 / apiKey 缺失时一致走 simulated fallback，不影响服务器启动
  - [x] 16.2 不修改与本 spec 无关的段落
  - _Requirements: 9.2, 9.3_

- [x] 17. 在 `server/tests/blueprint-routes.test.ts` 追加 3 条 E2E
  - [x] 17.1 **(a) Master switch on + 5 桥 real path**：setup `vi.stubEnv("BUILD_TARGET", "production")` + `vi.stubEnv("AUTOPILOT_REAL_RUNTIME", "true")` + `buildBlueprintServiceContext({ executorClient: fakeExecutor, llm: { callJson: fakeCallJson, getConfig: () => ({ apiKey: "fake" }) } })` + 注入 fake `mcpToolAdapter`；`POST /api/blueprint/jobs` with `githubUrls: ["https://github.com/example/demo"]`；断言 docker / mcp / role / aigc-node invocation 的 `provenance.executionMode === "real"`；`GET /api/blueprint/diagnostics` 返回 5 桥 `mode === "real"` 或 `"enabled"`
  - [x] 17.2 **(b) Master switch off → 5 桥 fallback**：setup `vi.stubEnv("BUILD_TARGET", "production")` + `vi.stubEnv("AUTOPILOT_REAL_RUNTIME", "false")`；不注入 fake；`POST /api/blueprint/jobs`；断言所有 invocation 为 `simulated_fallback`；`GET /api/blueprint/diagnostics` 返回 `mode === "disabled"` 或 `"fallback"`
  - [x] 17.3 **(c) Graceful degradation**：master switch on，但注入的 `fakeExecutor.assertReachable` 抛 `ExecutorClientError("executor down", "unavailable")`；其余桥的 fake 正常；断言 docker invocation 为 `simulated_fallback`、`lastError` 匹配 `/executor unreachable/`；其余桥仍为 `real`；服务器响应仍为 2xx
  - [x] 17.4 三条用例 setup / teardown 清理 `vi.unstubAllEnvs()` 与 fake 依赖；共用一份 test helper 构造 fake executor / fake mcpToolAdapter / fake callJson（若已有同类 helper 复用，不重建）
  - [x] 17.5 **不改写**原有 E2E 用例任一断言；只以追加方式补 3 条
  - _Requirements: 2.2, 3.1, 3.4, 4.1, 4.2, 4.3, 5.3, 5.5, 6.1, 6.2, 7.5, 8.3_

- [x] 18. Checkpoint — 既有 5140+ 测试全量回归
  - [x] 18.1 运行 `pnpm run test`（或 workspace 等价命令）；确认**不修改任一既有测试文件**的前提下，全部通过
  - [x] 18.2 若有任一既有测试失败，**必须调整本 spec 实现**而不是调整测试（需求 7.6）；常见原因：`BUILD_TARGET=test` 未正确注入、resolver 在测试 env 下未强制 false、context.ts 的默认 executor 构造未正确条件化
  - [x] 18.3 同步跑 `node --run check` 确认无新增 TypeScript 类型错误
  - _Requirements: 7.5, 7.6, 8.1_

- [x] 19. 端到端真实提交手测说明
  - [x] 19.1 在 spec 目录新建 `manual-verification.md`（或附录节）说明：在一台装有 Docker + 配置了 `LLM_API_KEY` 的开发机上执行 `pnpm run dev:all`、打开 `/autopilot` 页面、提交 `https://github.com/666ghj/MiroFish`、观察 server 日志是否出现真实 executor 派发 + MCP 调用 + LLM 调用；通过 `curl http://localhost:3001/api/blueprint/diagnostics` 验证 5 桥 `mode` 字段；关闭 Docker 后重跑验证 docker 单独 fallback 其余 real
  - [x] 19.2 本任务不要求自动化；作为 reviewer checklist 的一部分
  - _Requirements: 6.1, 6.2, 10.6_

- [x] 20. 最终验收
  - [x] 20.1 全量跑 `pnpm run test`、`node --run check`、`pnpm run build`（若适用）；确认全部通过
  - [x] 20.2 diff 检查：`shared/blueprint/contracts.ts` 未被修改；`server/routes/blueprint/docker-analysis-sandbox/bridge.ts` / `mcp-github-source/bridge.ts` / `role-system-architecture/bridge.ts` / `aigc-spec-node/bridge.ts` / `agent-crew-stage-activation/driver.ts` 文件内容未被修改；`client/src/lib/blueprint-api/` SDK 未被修改
  - [x] 20.3 更新 spec 目录下的 `tasks.md` 全部勾选；在 PR 描述中引用需求编号 1.1-10.6 的覆盖矩阵
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
