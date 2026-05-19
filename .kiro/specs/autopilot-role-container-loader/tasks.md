# 实施任务：Autopilot Role Container Loader

## 概述

本任务清单把 design 文档的改造点收敛为 22 个可验证的代码任务，覆盖：

- `shared/blueprint/events.ts` 追加 4 个 `role.container.*` 事件常量
- `shared/blueprint/contracts.ts` 在 `BlueprintAgentRole` 追加可选 `capabilityPackage?`
- `server/routes/blueprint/role-container-loader/` 新建目录，承载 7 个子模块（capability-package / loader / lifecycle-manager / mcp-binder / skills-binder / aigc-orchestrator / handoff-context）及其 co-located 单测
- `default-role-capability-packages.json` 静态目录数据
- `server/routes/blueprint/context.ts` 追加 `roleContainerLoader?` / `roleRuntimeContextStore?` DI 字段与默认装配
- `server/routes/blueprint/runtime-enablement/diagnostics-store.ts` 扩展 `BridgeId` + `BridgeDiagnosticEntry` 新字段
- `server/routes/blueprint/runtime-enablement/subscriber.ts` 扩展订阅映射
- `server/routes/blueprint/agent-crew-stage-activation/driver.ts` 在 `onStageTransition` 末尾追加 env-gated hook
- `server/index.ts` composition root 解析新 flag 并传入 loader DI
- `.env.example` / `.kiro/steering/project-overview.md` 文档同步
- `server/tests/blueprint-routes.test.ts`（或新建 `role-container-loader-e2e.test.ts`）追加 4 条 E2E
- 最终全量回归

依赖顺序：1（events 常量）→ 2（contracts 可选字段）→ 3（capability-package）→ 4（lifecycle-manager）→ 5（mcp-binder）→ 6（skills-binder）→ 7（aigc-orchestrator）→ 8（handoff-context）→ 9（loader 主体）→ 10（默认目录 JSON）→ 11（checkpoint 子域回归）→ 12（context 装配）→ 13（diagnostics 扩展）→ 14（subscriber 扩展）→ 15（driver hook）→ 16（server/index 装配）→ 17（.env.example）→ 18（steering 同步）→ 19（E2E 追加）→ 20（driver hook 集成测试）→ 21（既有测试回归）→ 22（最终验收）。

需求 11.5 明确**不引入 PBT**；所有新增测试均为 example-based。

## 任务列表

- [x] 1. 在 `shared/blueprint/events.ts` 追加 4 条 `role.container.*` 事件
  - [x] 1.1 在 `BlueprintGenerationEventType` union 中按 `role` 家族顺序追加 `"role.container.provisioning" | "role.container.ready" | "role.container.teardown" | "role.container.failed"`
  - [x] 1.2 在 `BlueprintEventName` 常量表中追加 `RoleContainerProvisioning` / `RoleContainerReady` / `RoleContainerTeardown` / `RoleContainerFailed` 四个键，值与字面量严格一致
  - [x] 1.3 不扩展 `BlueprintGenerationEventFamily`；保持 12 家族不变
  - [x] 1.4 追加 `shared/blueprint/__tests__/events.test.ts` 用例断言新常量归入 `role` 家族（`resolveBlueprintEventFamily("role.container.ready") === "role"`）
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 2. 在 `shared/blueprint/contracts.ts` 的 `BlueprintAgentRole` 追加可选 `capabilityPackage?`
  - [x] 2.1 定义并在同一文件导出 `RoleCapabilityPackage` / `RoleCapabilityPackageBinding` / `RoleResourceBudget` 类型（或在 `shared/blueprint/role-container/types.ts` 新建专用子模块）
  - [x] 2.2 `BlueprintAgentRole` 只追加 `capabilityPackage?: RoleCapabilityPackage`；其它 9 个字段保持严格不变
  - [x] 2.3 补一条 `shared/blueprint/__tests__/index-barrel.test.ts` 断言 `RoleCapabilityPackage` 能从 barrel 导出
  - [x] 2.4 `agent-crew/types.ts` / `role-architecture.ts` 若有对应视图 re-export，同步补一行（不修改既有 re-export 语义）
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 10.1, 10.2_

- [x] 3. 新建 `server/routes/blueprint/role-container-loader/capability-package.ts`
  - [x] 3.1 定义 `RoleContainerKey` / `RoleCapabilityPackage` / `RoleResourceBudget` 类型（若在任务 2 已定义于 shared，本文件 `import type`）
  - [x] 3.2 实现 `resolveCapabilityPackage(roleId, role, defaultsCatalog)`：优先级为 `role.capabilityPackage > defaultsCatalog[roleId] > 空包`；未命中时 `ctx.logger.debug` 记录
  - [x] 3.3 实现 `mergeBudget(partial, defaults)`：按 `RoleResourceBudget` 默认值合并；越界值截断到边界并 warn（需求 9.1-9.4）
  - [x] 3.4 实现 `resolveContainerImage(pkg)`：`pkg.containerImage ?? (pkg.onDemand.aigcNodes?.length ?? 0 > 0 ? "lobster-executor:ai" : "lobster-executor:default")`
  - [x] 3.5 导出 `createDefaultRoleResourceBudget()` 工厂
  - [x] 3.6 添加 co-located `capability-package.test.ts` 覆盖 6 场景：(a) role 显式 package 优先；(b) role 未声明时按 id 命中默认目录；(c) 未命中返回空包；(d) budget 越界截断 + warn；(e) 未声明镜像 + 无 aigcNodes → default；(f) 未声明镜像 + 有 aigcNodes → ai
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 9.1, 9.2, 9.3, 9.4, 11.2_

- [x] 4. 新建 `server/routes/blueprint/role-container-loader/lifecycle-manager.ts`
  - [x] 4.1 定义 `RoleContainerLifecycle` / `RoleContainerLifecycleState` / `PhysicalContainer` 接口
  - [x] 4.2 实现 `createRealContainer(executorClient, image, budget, allowlistDomains)`：调 `assertReachable` → `dispatchPlan({ image, resources, networkPolicy, allowlistDomains })`；成功返回 `{ mode: "real", containerId, ... }`
  - [x] 4.3 实现 `createLiteContainer(fallbackReason)`：同步返回 `{ mode: "lite", fallbackReason }`
  - [x] 4.4 实现 `createWithFallback(executorClient, pkg, budget, override?)`：尊重 `BLUEPRINT_ROLE_CONTAINER_LOADER_MODE_OVERRIDE`；override 为 `"lite"` 时直接 lite；override 为 `"real"` 时若 assertReachable 抛错则回 lite + warn；override 未设时按可达性二选一
  - [x] 4.5 实现 provision 超时控制：以 `budget.provisionTimeoutMs` 包一层 `Promise.race`；超时抛 `"provision timeout"` 给调用方 `createWithFallback` 降级；捕获 → lite + `cancelJob` 尝试释放
  - [x] 4.6 实现 `destroyPhysicalContainer(container)`：real 模式调 `executorClient.cancelJob(containerId)`；lite 模式 no-op；抛错时不传播，仅 logger.warn（由 loader 捕获并计入 orphan）
  - [x] 4.7 添加 co-located `lifecycle-manager.test.ts` 覆盖：(a) real 成功；(b) real unreachable → lite；(c) dispatchPlan 超时 → lite + cancelJob 被调；(d) override=lite 强制 lite；(e) destroy real 成功；(f) destroy real 抛错不传播
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.2, 5.4, 11.2, 11.6_

- [x] 5. 新建 `server/routes/blueprint/role-container-loader/mcp-binder.ts`
  - [x] 5.1 导出 `bindRoleMcps(mcpIds, mcpToolAdapter, bindingReport, logger)` 异步函数
  - [x] 5.2 实现 design §4.7 算法：`mcpToolAdapter` 缺失时标记全部 skipped；对每个 id 串行 probe（`execute({ serverId, tool: "meta.ping", params: {}, timeoutMs: 5000 })`）
  - [x] 5.3 probe 失败（`success:false` / throw）统一进入 `bindingReport.skippedMcps.push({ id, reason: truncate(msg, 400) })` + `logger.warn`
  - [x] 5.4 函数永不抛错；返回 `Map<mcpId, McpSessionHandle>`
  - [x] 5.5 添加 co-located `mcp-binder.test.ts` 覆盖：(a) 正常绑定 2 项；(b) 单项 probe 失败跳过；(c) `mcpToolAdapter === undefined` 全部跳过；(d) probe throw 不传播；(e) 空列表返回空 map
  - _Requirements: 5.1, 5.2, 5.8, 11.2, 11.6_

- [x] 6. 新建 `server/routes/blueprint/role-container-loader/skills-binder.ts`
  - [x] 6.1 导出 `bindRoleSkills(skillIds, skillRegistry, roleId, bindingReport, logger)` 异步函数
  - [x] 6.2 实现 design §4.8 算法：`skillRegistry` 缺失 → 全部跳过；对每个 skillId 调 `loadForRole({ roleId, skillId })`；null / throw 均计入 `bindingReport.skippedSkills`
  - [x] 6.3 函数永不抛错；返回 `Map<skillId, SkillHandle>`
  - [x] 6.4 添加 co-located `skills-binder.test.ts` 覆盖：(a) 正常加载；(b) registry 缺失全部跳过；(c) 单项 null 跳过；(d) 单项 throw 跳过；(e) 空列表
  - _Requirements: 5.3, 5.4, 5.8, 11.2, 11.6_

- [x] 7. 新建 `server/routes/blueprint/role-container-loader/aigc-orchestrator.ts`
  - [x] 7.1 定义 `OrchestratedAigcResult` 接口（`success / nodeResults[] / mergedOutputSummary / partialFailures`）
  - [x] 7.2 实现 `registerOnDemand(nodeIds, aigcSpecNodeBridge)`：仅登记引用，不实际加载；返回 `Map<nodeId, AigcNodeHandle>`（handle 中保留懒加载闭包）
  - [x] 7.3 实现 `orchestrateAigcInvocation(nodeIds, input, ctx, runtimeCtx)`：按 `pkg.resourceBudget?.orchestrationMode` 选 serial / parallel；单节点失败 `partialFailures++` 但继续；全部失败仍返回合法 result
  - [x] 7.4 实现 `buildMergedSummary(results)` 把多节点输出合并为 ≤ 800 字符的人可读摘要
  - [x] 7.5 函数永不抛错到调用方；单节点错误只反映在 `nodeResults[i].success = false` + `error`
  - [x] 7.6 添加 co-located `aigc-orchestrator.test.ts` 覆盖：(a) serial 三节点全成功；(b) serial 中间节点失败 `partialFailures=1` 后续继续；(c) parallel 全失败 `success=false`；(d) 空 nodeIds 返回 `success: true, nodeResults: []`；(e) bridge 抛错被吞
  - _Requirements: 5.5, 5.6, 5.7, 5.8, 11.2, 11.6_

- [x] 8. 新建 `server/routes/blueprint/role-container-loader/handoff-context.ts`
  - [x] 8.1 导出 `buildStageHandoffContext(roleRuntimeCtx, now)` 返回 `StageHandoffContext`
  - [x] 8.2 实现 design §4.11 算法：从 `roleRuntimeCtx.tracker` 抽取 capabilitiesInvoked；遍历 mcp/skill/aigcNode bindings 生成摘要；input / output 摘要通过 `sha256` + `.slice(0,16)` 脱敏
  - [x] 8.3 `deriveWarmStartHint(ctx)`：基于 bindings 使用计数给出一句话 hint（可返回 `undefined` 若无有价值 hint）
  - [x] 8.4 返回值为**深拷贝**，调用方后续修改 runtime ctx 不影响 handoff
  - [x] 8.5 添加 co-located `handoff-context.test.ts` 覆盖：(a) 典型 ready ctx 快照字段完整；(b) 空 bindings 返回空数组；(c) 深拷贝验证；(d) input/output digest 稳定（相同输入同 digest）
  - _Requirements: 7.4, 7.5, 11.2_

- [x] 9. 新建 `server/routes/blueprint/role-container-loader/loader.ts`（主模块）
  - [x] 9.1 定义 `RoleContainerLoader` 接口与工厂 `createRoleContainerLoader(ctx): RoleContainerLoader`
  - [x] 9.2 定义 `RoleRuntimeContextStore` 接口（`get(key) / put(key, ctx) / delete(key) / snapshot()`）；ctx 上挂 `roleRuntimeContextStore` 可选字段；工厂默认装配 in-memory `Map<serializedKey, RoleRuntimeContext>`
  - [x] 9.3 实现 `provisionRoleContainer(input)`：完整执行 design §4.6 的结构化伪代码——Tier 1 gate → 幂等命中检查 → resolve package → emit `role.container.provisioning` → lifecycle manager 决定 mode → 并行 bindings → 组装 ctx → 写入 store → diagnostics record → emit `role.container.ready`
  - [x] 9.4 实现 `tearDownRoleContainer(input)`：完整执行 design §4.10 伪代码——Tier 1 gate → 幂等检查 → `buildStageHandoffContext` → append artifact → `destroyPhysicalContainer` 并捕获 orphan → state → `torn_down` → emit `role.container.teardown`
  - [x] 9.5 实现 `onStageTransitionHook(input, stageRoleStateMap)`：遍历 stageRoleStateMap；`"active"` 走 provisioning（fire-and-forget `.catch(warn)`）；`"sleeping"` 走 teardown；其它 state 不触发
  - [x] 9.6 实现 `getDiagnostics()`：返回 loader 当前 real / lite 分布、teardown 与 orphan 计数（delegation 到 `ctx.runtimeDiagnostics.snapshot` 的 `roleContainerLoader` entry）
  - [x] 9.7 所有 public API 用 try/catch 整体包围，保证**永不抛错到调用方**；catch 内 `ctx.logger.warn` + 返回合理降级值（provision 返回 stub ctx / teardown 返回 undefined）
  - [x] 9.8 添加 co-located `loader.test.ts` 覆盖：(a) Tier 1 off 完全 no-op；(b) 幂等 provision（同 key 两次）；(c) 幂等 teardown（同 key 两次）；(d) provision 下游 lifecycle 抛错降级 lite 不传播；(e) teardown destroy 抛错计入 orphan 且事件仍 emit；(f) driver hook：active→provision 触发、sleeping→teardown 触发、其它 state 无触发
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.3, 4.1, 4.2, 5.9, 6.5, 6.6, 6.7, 7.3, 7.7, 10.7, 11.2_

- [x] 10. 新建 `server/routes/blueprint/role-container-loader/default-role-capability-packages.json`
  - [x] 10.1 以若干示例角色 id（对齐 `blueprint-agent-crew-fabric` 中已有静态角色目录的 `id` 字段）填写代表性 package；至少覆盖每个 `AgentRoleGroup` 一个示例（决策 / 规划 / 执行 / 审计 / 表现 / 记忆）
  - [x] 10.2 每个示例包含 `alwaysBound` / `onDemand` / `shared` 三段 + `resourceBudget` + `containerImage`
  - [x] 10.3 文件为静态数据，不引入运行时导入副作用；由 `capability-package.ts` 的 resolver 通过相对路径读取或通过 esbuild json import 静态 bundle
  - _Requirements: 1.3, 1.4_

- [x] 11. Checkpoint — 跑通 role-container-loader 子域单测
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/role-container-loader/capability-package.test.ts server/routes/blueprint/role-container-loader/loader.test.ts server/routes/blueprint/role-container-loader/lifecycle-manager.test.ts server/routes/blueprint/role-container-loader/mcp-binder.test.ts server/routes/blueprint/role-container-loader/skills-binder.test.ts server/routes/blueprint/role-container-loader/aigc-orchestrator.test.ts server/routes/blueprint/role-container-loader/handoff-context.test.ts`；确认 35+ 条 co-located 单测全部通过；失败必须修复对应模块后再继续。同步 `node --run check` 确认无新增 TS 类型错误
  - _Requirements: 11.2, 11.5_

- [x] 12. 扩展 `server/routes/blueprint/context.ts`
  - [x] 12.1 在 `BlueprintServiceContext` 追加可选字段：`roleContainerLoader?: RoleContainerLoader`、`roleRuntimeContextStore?: RoleRuntimeContextStore`、`skillRegistry?: SkillRegistry`（类型由 `plugin-skill-system` / L12 提供）
  - [x] 12.2 在 `BlueprintServiceContextDeps` 追加同名可选字段
  - [x] 12.3 在 `buildBlueprintServiceContext(deps)` 内装配：若 `deps.roleRuntimeContextStore === undefined` 默认装配 in-memory Map store；若 `deps.roleContainerLoader === undefined` 且 `resolvedRoleContainerLoaderEnabled === "true"` 默认装配 `createRoleContainerLoader(ctx)`
  - [x] 12.4 默认装配 `skillRegistry` 的接线由 `server/index.ts` 主线负责（ctx 仅 type-level 声明）；`deps.skillRegistry` 未传时 `ctx.skillRegistry` 保持 `undefined`，skills-binder 则走"全部跳过"路径
  - [x] 12.5 保证 `buildBlueprintServiceContext({})` 在 test 环境（BUILD_TARGET=test）下 `ctx.roleContainerLoader === undefined`；不触发 dispatchPlan / probe 等任何副作用
  - _Requirements: 3.4, 3.5, 3.6, 11.1_

- [x] 13. 扩展 `server/routes/blueprint/runtime-enablement/diagnostics-store.ts`
  - [x] 13.1 `BridgeId` union 追加 `"roleContainerLoader"`
  - [x] 13.2 `BridgeDiagnosticEntry` 追加 loader 专属可选字段：`totalProvisions?: number`、`realProvisions?: number`、`liteProvisions?: number`、`teardownCount?: number`、`orphanContainerWarning?: number`；前 5 条 bridge 对应字段保持 `undefined`
  - [x] 13.3 扩展 `recordBridgeInvocation` 的处理：当 `bridgeId === "roleContainerLoader"` 时，依 `mode` 字段分别递增 `realProvisions` / `liteProvisions` 与 `totalProvisions`
  - [x] 13.4 追加 `recordTeardown(bridgeId, { key, mode })` 与 `noteOrphanContainer(bridgeId, { key, err })` 两个 loader 专属方法
  - [x] 13.5 `snapshot()` 输出新增的 loader entry；默认 `mode: "unknown"`，loader Tier 1 off 时由外层 `recordBridgeConfiguration` 改写为 `"disabled"`
  - [x] 13.6 补 co-located `diagnostics-store.test.ts` 新用例 3 条：(a) 无 loader 事件时 loader entry 为空；(b) real provision + teardown 计数正确；(c) orphan 事件递增 `orphanContainerWarning`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 14. 扩展 `server/routes/blueprint/runtime-enablement/subscriber.ts`
  - [x] 14.1 扩展 `attachDiagnosticsSubscriber` 的事件映射：`role.container.ready` → `recordBridgeInvocation("roleContainerLoader", { mode: payload.executionMode === "real" ? "real" : "simulated_fallback" })`；`role.container.failed` → 同上但 `mode: "simulated_fallback"` + `error`
  - [x] 14.2 `role.container.teardown` → `recordTeardown("roleContainerLoader", { key: payload.key, mode: payload.containerMode })`；同时若 `payload.orphan === true` 调 `noteOrphanContainer`
  - [x] 14.3 既有 5 条 bridge 的订阅路径不得被改动；新 case 仅**追加**
  - [x] 14.4 补 co-located `subscriber.test.ts` 3 条：(a) `role.container.ready` mode=real 被正确记录；(b) `role.container.teardown` 触发 teardownCount++；(c) 事件 payload 非法不抛错
  - _Requirements: 8.7, 10.7_

- [x] 15. 在 `agent-crew-stage-activation/driver.ts` 追加 env-gated hook
  - [x] 15.1 在 `onStageTransition(input)` 函数末尾（所有 role.* 事件已 emit、jobCompleted 判定已完成之后）追加一段 env-gated try/catch：`if (ctx.roleContainerLoader && process.env.BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED === "true") { try { ctx.roleContainerLoader.onStageTransitionHook(input, stageRoleStateMap); } catch (err) { ctx.logger.warn("role container loader hook threw, ignored", { err: String(err).slice(0, 400) }); } }`
  - [x] 15.2 不修改 driver 其它任一行代码；不修改 state machine / 事件顺序 / 幂等逻辑
  - [x] 15.3 driver.test.ts **不改写**任一既有断言；若断言与新 hook 交互需要隔离，改为通过 ctx 不注入 loader 即可（新 hook 在 `ctx.roleContainerLoader === undefined` 时自动短路）
  - _Requirements: 7.1, 7.2, 7.3, 10.5, 10.7_

- [x] 16. 改造 `server/index.ts` composition root
  - [x] 16.1 在现有 5 条 bridge resolver 调用旁追加一行解析：`const resolvedRoleContainerLoaderEnabled = resolveBridgeEnablement({ envFlag: "BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED", explicitEnvValue: process.env.BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED, masterSwitch: process.env.AUTOPILOT_REAL_RUNTIME, buildTarget: process.env.BUILD_TARGET });`
  - [x] 16.2 把解析结果写回 `process.env`（与 `resolveAllBridgeEnablement` 同风格），使 loader 的 Tier 1 gate 能读到最终值
  - [x] 16.3 当 `resolvedRoleContainerLoaderEnabled === "true"` 时，把主线已装配的 `mcpToolAdapter` + `skillRegistry`（来自 L12 plugin-skill-system 的主线 singleton；若未装配 ctx.skillRegistry 保持 undefined）以 `skillRegistry` / `mcpToolAdapter` deps 传入 `buildBlueprintServiceContext`
  - [x] 16.4 在同一位置调 `blueprintServiceContext.runtimeDiagnostics.recordBridgeConfiguration("roleContainerLoader", { enabledByConfig: resolvedRoleContainerLoaderEnabled === "true", dependencyReady: Boolean(blueprintServiceContext.roleContainerLoader) })`
  - [x] 16.5 job 终态回收 hook：在既有 job `completed` / `failed` 事件的终点处（或 `jobStore.save(job)` 后的已有终态 branch）追加一段调用：遍历 `ctx.roleRuntimeContextStore.snapshot()` 中属于该 jobId 的未 torn_down 条目，逐一 `tearDownRoleContainer(key)`；失败时 `noteOrphanContainer` 继续；不阻塞 job 流程
  - _Requirements: 3.1, 3.2, 3.5, 7.7, 8.3_

- [x] 17. 更新 `.env.example`
  - [x] 17.1 在 `autopilot-capability-runtime-enablement` 引入的"── Autopilot Capability Runtime ──"段落下方追加新区段：
    ```
    # ── Autopilot Role Container Loader ────────────────────────────
    # Runtime loader for per-role composite agents: each active role receives
    # a Docker container (or lite-mode process sandbox) with its declared
    # MCPs / Skills / AIGC nodes bound. Driven by AUTOPILOT_REAL_RUNTIME
    # unless explicitly set. "test" BUILD_TARGET always forces "false".
    BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED=true
    # Force a specific container mode for testing / debugging. Leave unset
    # for automatic real→lite fallback when executor is unreachable.
    # BLUEPRINT_ROLE_CONTAINER_LOADER_MODE_OVERRIDE=real|lite
    BLUEPRINT_ROLE_CONTAINER_PROVISION_TIMEOUT_MS=30000
    ```
  - [x] 17.2 不修改其它已存在的环境变量
  - _Requirements: 12.1, 12.3_

- [x] 18. 更新 `.kiro/steering/project-overview.md`
  - [x] 18.1 在"运行时 / executor 模式"或"当前进度快照"附近追加 1-3 段中文说明：
    - `autopilot-role-container-loader` 把角色从静态目录推进为运行时复合代理：active 时装配容器并绑定 MCP / Skill / AIGC 节点，sleeping 时释放并生成 stage handoff
    - Real / Lite 双模式：Docker 可达时真实容器，否则 lite mode 宿主进程内执行，向上层 LLM 路径透明
    - 三级 graceful degradation：Tier 1 env gate / Tier 2 依赖缺失 / Tier 3 运行期错误均不抛错，单项跳过整体仍 ready
    - 诊断端点扩展：`GET /api/blueprint/diagnostics` 新增第 6 条 entry `roleContainerLoader`，含 real / lite / teardown / orphan 计数
  - [x] 18.2 不修改与本 spec 无关的段落
  - _Requirements: 12.2, 12.4_

- [x] 19. 在 E2E 测试文件追加 4 条场景
  - [x] 19.1 **Real mode happy path**：`vi.stubEnv("BUILD_TARGET","production")` + `vi.stubEnv("AUTOPILOT_REAL_RUNTIME","true")` + `vi.stubEnv("BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED","true")` + 注入 fake executor / fake mcpToolAdapter / fake skillRegistry；触发 `driver.onStageTransition` 使某 role 进入 `active`；断言：`dispatchPlan` 被调一次、事件序列 `role.container.provisioning` → `role.container.ready`（后者 `executionMode: "real"`）、`roleRuntimeCtx.lifecycle.state === "ready"`、`GET /api/blueprint/diagnostics` 返回 `roleContainerLoader.mode === "real"`、`realProvisions === 1`
  - [x] 19.2 **Lite mode fallback**：同上但 `fakeExecutor.assertReachable` 抛 `ExecutorClientError("down","unavailable")`；断言 `mode === "lite"`、`fallbackReason` 非空、其它 MCP / Skill 绑定成功、诊断 `liteProvisions === 1`
  - [x] 19.3 **Partial binding failure**：real mode 打开，注入 fake mcpToolAdapter 让 `github` probe 返回 `{ success: false, error: "server_unavailable" }`，其它 MCP 正常；断言 `bindingReport.skippedMcps` 含 `github`、其它 MCP 正常绑定、容器仍 ready、`roleRuntimeCtx.lifecycle.state === "degrading"`
  - [x] 19.4 **Idempotent provision + teardown**：同 key 两次 `provisionRoleContainer`；断言 `dispatchPlan` 只调一次、两次都 emit `role.container.ready`（第二次带 `cached: true`）、`role.container.provisioning` 只 emit 一次；随后两次 `tearDownRoleContainer`，断言 destroy 只调一次、`role.container.teardown` 只 emit 一次
  - [x] 19.5 共用一份 test helper 构造 fake executor / fake mcpToolAdapter / fake skillRegistry / fake aigcBridge；若已有同类 helper 复用，不重建；每个用例 `beforeEach` 做 `vi.unstubAllEnvs()` + 清理 diagnostics store
  - [x] 19.6 **不改写**任一既有 E2E 用例断言；只以追加方式补这 4 条
  - _Requirements: 2.2, 3.1, 3.3, 4.1, 4.2, 5.1, 5.9, 6.5, 6.6, 8.4, 8.5, 10.5, 11.3, 11.6_

- [x] 20. driver hook 集成测试
  - [x] 20.1 在 `agent-crew-stage-activation/driver.test.ts` 追加一组 `describe("role container loader hook")` 用例：(a) ctx 未注入 loader → hook 不触发、原断言不变；(b) 注入 loader + flag="true" → `onStageTransitionHook` 被调一次且 payload 等于 driver 的 `input + stageRoleStateMap`；(c) 注入 loader + flag 未设 → hook 不触发；(d) hook 抛错 → driver 自身行为（role.* 事件序列、返回值）完全不受影响
  - [x] 20.2 `describe("existing behaviors unaffected")`：保留一个 sentinel 测试明确跑一次原有 driver 典型用例，断言 loader 相关的 spy 全未被触发
  - [x] 20.3 使用 `vi.stubEnv("BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED","true")` 显式 opt-in；测试完毕 `vi.unstubAllEnvs()`
  - _Requirements: 7.1, 7.2, 7.3, 10.5, 11.4_

- [x] 21. Checkpoint — 既有 5140+ 测试全量回归
  - [x] 21.1 运行 `pnpm run test`（或 workspace 等价命令）；确认**不修改任一既有测试文件**的前提下全部通过
  - [x] 21.2 若有既有测试失败，**必须调整本 spec 实现**而不是调整测试（需求 10.6）；常见原因：hook 未正确 env-gate、context.ts 默认装配误触发、事件订阅映射误读既有 bridge 事件
  - [x] 21.3 同步 `node --run check` 确认无新增 TypeScript 类型错误（可选字段追加不应引发既有文件错误）
  - _Requirements: 10.5, 10.6, 11.1_

- [x] 22. 最终验收
  - [x] 22.1 全量跑 `pnpm run test`、`node --run check`、`pnpm run build`（若适用）；确认全部通过
  - [x] 22.2 diff 检查：
    - `shared/blueprint/contracts.ts` 仅在 `BlueprintAgentRole` 末尾追加一行可选字段
    - `shared/blueprint/events.ts` 仅追加 4 行常量 + 4 行 union 成员
    - `BlueprintRolePresence` / `BlueprintAgentCrew` / `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 字段集严格不变
    - `docker-analysis-sandbox/` / `mcp-github-source/` / `role-system-architecture/` / `aigc-spec-node/` 内部文件未被修改
    - `agent-crew-stage-activation/driver.ts` 仅在函数末尾追加 env-gated hook，其它代码一行不改
    - 既有 5 条 bridge diagnostics entry 投影向后兼容
  - [x] 22.3 更新 spec 目录下的 `tasks.md` 全部勾选；在 PR 描述中引用需求编号 1.1-13.10 的覆盖矩阵
  - [x] 22.4 验证本 spec **不新增 HTTP 路由**；`GET /api/blueprint/diagnostics` 是唯一对外可见的新数据来源，通过扩展既有端点实现
  - _Requirements: 1.7, 6.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_
