# 需求文档：Autopilot Role Container Loader

## 简介

`/autopilot` 的叙事要求：角色（Agent Role）不仅是一个 prompt 层抽象，还应当在某个阶段被激活时能够作为一个**真实的复合代理**运行——拥有自己的容器（或 lite 模式宿主）、按需加载的 MCP 服务器集合、Skill 集合、AIGC 节点集合，并在本阶段结束时把这段上下文平滑移交给下一阶段。

本 spec 在 `autopilot-capability-runtime-enablement`（5 条 capability bridge 的默认通电与诊断）之上新增一个**组织层**：`RoleContainerLoader`。它不扩展任何 capability kind，不引入新的 HTTP 路由；它只在 `agent-crew-stage-activation` 判定某角色进入 `active` 时，按该角色声明的 `RoleCapabilityPackage` 装配一个 `(roleId, stageId, jobId)` 维度的运行时容器，并在同一维度进入 `sleeping` 时释放。

它同时扩展 `blueprint-agent-crew-fabric`：把角色目录从"静态目录 + 运行时无脚手架"推进到"静态目录 + 运行时生命周期 + 可观测诊断"。

本 spec 需要同时满足的硬约束：

- 可选（opt-in）：角色未声明 `capabilityPackage` 且默认目录未命中时，loader 使用空包，角色行为与今天的 LLM-only 路径等价
- 环境变量门禁 `BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED` 默认 off，由 `autopilot-capability-runtime-enablement` 的主 switch 驱动
- 5140+ 既有测试在未 opt-in 时零感知通过
- 不修改 `BlueprintAgentRole` / `BlueprintRolePresence` / `BlueprintAgentCrew` / `BlueprintCapabilityInvocation` 任一必填字段
- 仅在 `BlueprintAgentRole` 上追加一个**可选**字段 `capabilityPackage?`
- Docker 不可达时 loader **回退到 lite 模式**，角色仍能完成 capability invocation，向上层 LLM 路径不暴露 real / lite 差异
- 新增 4 个 `BlueprintEventName` 常量：`role.container.provisioning` / `role.container.ready` / `role.container.teardown` / `role.container.failed`，归入既有 `role` 家族
- 不新增 HTTP 路由；诊断通过扩展 `GET /api/blueprint/diagnostics` 的 `bridges` map 新增第 6 条 entry

本 spec 属于 Feature 类型，design-first（High-Level + Low-Level）工作流。

## 术语表

- **Role Capability Package（`RoleCapabilityPackage`）**：某角色在运行时声明的 MCP / Skill / AIGC 节点绑定集合，分 `alwaysBound` / `onDemand` / `shared` 三段。
- **Role Container**：针对 `(roleId, stageId, jobId)` 一次激活而装配的逻辑容器，可能是 Docker 真容器（real）或宿主进程内虚拟 sandbox（lite）。
- **Role Runtime Context（`RoleRuntimeContext`）**：角色激活期间可供 capability invocation 使用的运行时上下文，封装 MCP / Skill / AIGC 节点访问门面。
- **Stage Handoff Context（`StageHandoffContext`）**：角色在本阶段被 teardown 时输出的上下文快照，挂到 `job.artifacts[]` 供下一阶段参考。
- **Loader**：`RoleContainerLoader` 实例；本 spec 的主体。
- **Lifecycle Manager**：`RoleLifecycleManager`，负责 physical container 的 real / lite 创建、状态推进与释放。
- **Binder**：`McpBinder` / `SkillsBinder`，负责在 loader 内部把 package 中声明的 id 转换为可调用 handle。
- **Orchestrator**：`AigcNodeOrchestrator`，负责把多节点 AIGC 绑定组合成一次性复合调用。
- **Master Switch**：`AUTOPILOT_REAL_RUNTIME`（由 `autopilot-capability-runtime-enablement` 引入）；本 spec 通过它间接驱动 loader 的默认启用。
- **Loader Flag**：本 spec 新增 `BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED`；显式 `"true"` / `"false"` 永远最优先。
- **Build Target**：`BUILD_TARGET=test` 强制关闭 loader，用于保护既有测试兼容性。

## 需求

### 需求 1：`RoleCapabilityPackage` 数据模型与解析

**用户故事：** 作为 `/autopilot` 的角色定义者，我希望为某个角色声明它在运行时需要的 MCP / Skill / AIGC 节点；未声明时系统使用默认目录兜底，不破坏现有 LLM-only 路径。

#### 验收标准

1.1 THE Feature SHALL 新增 `RoleCapabilityPackage` 类型（design §4.1），包含 `alwaysBound`、`onDemand`、`shared` 三段，每段是 `Partial<{ mcps: string[]; skills: string[]; aigcNodes: string[] }>`。

1.2 THE Feature SHALL 在 `shared/blueprint/contracts.ts` 的 `BlueprintAgentRole` 上追加一个**可选**字段 `capabilityPackage?: RoleCapabilityPackage`；SHALL NOT 修改其它既有字段。

1.3 THE Feature SHALL 新增一份默认目录 `server/routes/blueprint/role-container-loader/default-role-capability-packages.json`，按 `roleId` 键给出若干示例包；该文件为静态数据，修改不影响测试。

1.4 WHEN 某 `BlueprintAgentRole` 实例未声明 `capabilityPackage`，THE Resolver SHALL 按 `roleId` 从默认目录查询；未命中时返回空包 `{ alwaysBound: {}, onDemand: {}, shared: {} }` 并 `ctx.logger.debug` 记录。

1.5 THE `RoleCapabilityPackage` SHALL 支持 `resourceBudget?`（`memoryMb` / `cpuShares` / `provisionTimeoutMs` / `networkPolicy` / `allowlistDomains`），未声明字段使用默认值。

1.6 THE `RoleCapabilityPackage.containerImage` SHALL 限定为 `"lobster-executor:default"` 或 `"lobster-executor:ai"`；未声明时按 `onDemand.aigcNodes.length > 0 ⇒ "lobster-executor:ai"`，否则 `"lobster-executor:default"`。

1.7 THE Feature SHALL NOT 修改 `BlueprintAgentRole` 既有必填字段的形态或取值；SHALL NOT 修改 `BlueprintRolePresence` / `BlueprintAgentCrew` / `BlueprintRoleCapability` 任一字段。

### 需求 2：`RoleContainerLoader` 生命周期 API

**用户故事：** 作为 `agent-crew-stage-activation` 驱动实现者，我希望有一个简单的 loader API：给我 `(roleId, stageId, jobId)`，我得到一个 `RoleRuntimeContext`；角色 sleep 时还能一个 call 释放所有资源。

#### 验收标准

2.1 THE Feature SHALL 新增接口 `RoleContainerLoader`，提供：
  - `provisionRoleContainer(input: RoleContainerKey): Promise<RoleRuntimeContext>`
  - `tearDownRoleContainer(input: RoleContainerKey): Promise<StageHandoffContext | undefined>`
  - `onStageTransitionHook(input, stageRoleStateMap): void`
  - `getDiagnostics(): RoleContainerLoaderDiagnostics`

2.2 WHEN `provisionRoleContainer(key)` 调用时 key 已有对应 `roleRuntimeCtx.lifecycle.state ∈ {ready, degrading}`，THE Loader SHALL 命中缓存直接返回已有 ctx，`executorClient.dispatchPlan` 必须**不**被再次调用，`role.container.provisioning` 事件**不**再次 emit，但 SHALL emit 一条 `role.container.ready`（含 `cached: true` payload 标记）以同步订阅者。

2.3 WHEN `tearDownRoleContainer(key)` 在 `state ∈ {torn_down, tearing_down}` 时调用，THE Loader SHALL 返回已有 handoff（或 `undefined` 如果首次即在该状态）而不重复释放容器；SHALL 保证幂等。

2.4 THE Loader SHALL 以 `(roleId, stageId, jobId)` 的规范化字符串形式为幂等主键；不同 `jobId` 下的相同 `(roleId, stageId)` 视为不同容器。

2.5 THE `provisionRoleContainer` / `tearDownRoleContainer` SHALL 永不向调用方抛异常（需求 5 硬约束）；所有错误通过诊断、事件 payload、`bindingReport` 间接反映。

2.6 THE Loader SHALL 以 fire-and-forget 方式在 driver hook 中发起 provisioning / teardown；driver 的 `role.*` 事件顺序不得因 loader 状态改变而漂移。

### 需求 3：环境变量门禁与默认装配

**用户故事：** 作为维护人员，我希望 loader 与其它 5 条 capability bridge 在开关语义上完全一致：默认 off、由主 switch 驱动、测试自动关闭、显式设置优先。

#### 验收标准

3.1 THE Feature SHALL 新增环境变量 `BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED`；语义与 `BLUEPRINT_*_CAPABILITY_BRIDGE_ENABLED` 5 兄弟严格一致：`"true"` 开启、`"false"` 关闭、`undefined` 视作 `"false"`。

3.2 THE `resolveBridgeEnablement` 解析逻辑 SHALL 对本 flag 执行与其它 5 flag 完全相同的解析路径：`BUILD_TARGET=test` 强制 `"false"`（除非显式 opt-in）、显式 env 最优先、master switch `AUTOPILOT_REAL_RUNTIME` 驱动默认。

3.3 WHEN 本 flag 经解析为 `"false"`，THE Loader SHALL 完全 no-op：`provisionRoleContainer` / `tearDownRoleContainer` 早退；SHALL NOT 调用 `executorClient` / `mcpToolAdapter` / `skillRegistry`；SHALL NOT emit `role.container.*` 事件；SHALL NOT 写入诊断。

3.4 THE Feature SHALL 在 `BlueprintServiceContext` 上追加**可选**字段 `roleContainerLoader?: RoleContainerLoader` 与 `roleRuntimeContextStore?: RoleRuntimeContextStore`；在 `BlueprintServiceContextDeps` 上追加对应可选字段。

3.5 THE `buildBlueprintServiceContext` SHALL 在 `deps.roleContainerLoader === undefined` 且本 flag 经解析为 `"true"` 时默认装配一个 loader 实例；否则保持 `undefined`。

3.6 THE Feature SHALL NOT 要求 `BUILD_TARGET=test` 环境下默认装配 loader；tests 需要时通过 `vi.stubEnv("BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED","true")` 显式打开。

3.7 THE Feature SHALL 引入可选的 `BLUEPRINT_ROLE_CONTAINER_LOADER_MODE_OVERRIDE`（`"real"` / `"lite"`）与 `BLUEPRINT_ROLE_CONTAINER_PROVISION_TIMEOUT_MS`（默认 `30000`）；前者用于测试 / 调试强制模式，后者封顶单次 provision 总时长。

### 需求 4：Real / Lite 双模式与 physical container 装配

**用户故事：** 作为角色执行者，我希望在 Docker 可用时跑真实容器获取隔离，Docker 不可用时系统自动回退而不影响我的调用路径。

#### 验收标准

4.1 WHEN loader 启用且 `ctx.executorClient` 已装配且 `assertReachable()` 通过，THE `LifecycleManager.createReal(pkg, budget)` SHALL 调用 `ctx.executorClient.dispatchPlan({ image, resources, networkPolicy, allowlistDomains })` 拉起真实 Docker 容器；成功后返回 `physicalContainer` 携带 `containerId`、`mode: "real"`。

4.2 WHEN `executorClient` 未装配、`assertReachable()` 抛错、或 `dispatchPlan` 失败，THE `LifecycleManager` SHALL 回退到 `lite` 模式，构造一个 `physicalContainer` 携带 `mode: "lite"` + `fallbackReason`（脱敏）；SHALL NOT 抛错；SHALL 以 `ctx.logger.warn` 记录 `fallbackReason`。

4.3 WHEN `BLUEPRINT_ROLE_CONTAINER_LOADER_MODE_OVERRIDE === "lite"`，THE `LifecycleManager` SHALL 无条件走 lite 路径，无视 `executorClient` 可用性；主要用于测试与调试场景。

4.4 THE `RoleRuntimeContext.mcp` / `.skill` / `.aigcNode` 门面 SHALL 在 real / lite 两种模式下接口签名与行为语义完全相同；上层 capability invocation 不得感知到模式差异。

4.5 THE real mode 容器镜像 SHALL 限定在 `pkg.containerImage` 声明的值；默认镜像选择见 1.6；`resources` / `networkPolicy` / `allowlistDomains` 完全透传给 `ExecutorClient`。

4.6 THE lite mode `physicalContainer` SHALL 不占用任何外部进程 / 容器 / 端口；它只是一个**逻辑句柄**，内部引用 `ctx.mcpToolAdapter` / `ctx.skillRegistry` / `ctx.aigcSpecNodeCapabilityBridge` 等进程级 singleton。

4.7 WHEN `budget.provisionTimeoutMs` 到期而 `dispatchPlan` 仍未返回，THE `LifecycleManager` SHALL 触发超时，降级到 lite 并设置 `fallbackReason: "provision timeout"`；SHALL 尝试 `ctx.executorClient.cancelJob(jobId)` 释放已派发但未 ready 的容器。

### 需求 5：MCP / Skill / AIGC 节点绑定的 graceful degradation

**用户故事：** 作为运营人员，我希望 loader 在绑定过程中遇到某个 MCP 不可达或 Skill 加载失败时，跳过该项并 warn，但不因此打断整个角色激活。

#### 验收标准

5.1 THE `McpBinder.bindRoleMcps(mcpIds, mcpToolAdapter, bindingReport)` SHALL 对每个 `mcpId` 独立执行 probe（`mcpToolAdapter.execute({ serverId, tool: "meta.ping", params: {}, timeoutMs: 5000 })`）；成功进入 `result` map，失败写入 `bindingReport.skippedMcps[]` + `ctx.logger.warn`；SHALL NOT 抛错。

5.2 WHEN `ctx.mcpToolAdapter === undefined`，THE `McpBinder` SHALL 把所有 `mcpIds` 标记为 `skipped` + `reason: "mcpToolAdapter missing"`；返回空 map；容器仍可 ready。

5.3 THE `SkillsBinder.bindRoleSkills(skillIds, skillRegistry, roleId, bindingReport)` SHALL 对每个 `skillId` 调 `skillRegistry.loadForRole({ roleId, skillId })`；成功进入 `result` map，失败 / null 返回均写入 `bindingReport.skippedSkills[]` + warn；SHALL NOT 抛错。

5.4 WHEN `ctx.skillRegistry === undefined`，THE `SkillsBinder` SHALL 标记所有 skills 为 skipped + reason；容器仍可 ready。

5.5 THE `AigcNodeOrchestrator.registerOnDemand(nodeIds)` SHALL 仅登记引用，不实际加载；首次 `orchestrate(nodeIds, input)` 调用时才按 `nodeIds` 调 `ctx.aigcSpecNodeCapabilityBridge` 实际执行。

5.6 THE `orchestrateAigcInvocation(nodeIds, input, ctx, runtimeCtx)` SHALL 在 `serial` 模式下串行调用每个节点；单节点失败 `partialFailures++` 但继续下一节点；在 `parallel` 模式下 `Promise.all` + 每个子 promise 自带 try/catch 保护。

5.7 WHEN `orchestrateAigcInvocation` 所有节点均失败，THE 返回值 SHALL 仍然为合法 `OrchestratedAigcResult` 对象（`success: false`、`partialFailures = nodeIds.length`），而不是抛错。

5.8 THE `bindingReport` SHALL 至少包含：`skippedMcps: Array<{id, reason}>`、`skippedSkills: Array<{id, reason}>`、`skippedAigcNodes: Array<{id, reason}>`、`boundMcps: string[]`、`boundSkills: string[]`、`registeredAigcNodes: string[]`、`hasSkipped: boolean`。

5.9 WHEN `bindingReport.hasSkipped === true` 但容器仍然创建成功，THE `roleRuntimeCtx.lifecycle.state` SHALL 为 `"degrading"` 而不是 `"ready"`；诊断端点应反映此 state 变化但仍计为成功 provision。

### 需求 6：事件总线集成与 4 条新常量

**用户故事：** 作为事件订阅者（前端驾驶舱、回放、审计），我希望能够追踪角色容器的完整生命周期，且新事件与现有 6 条 `role.*` 事件归属同一家族、不引入新的订阅路由。

#### 验收标准

6.1 THE Feature SHALL 在 `shared/blueprint/events.ts` 的 `BlueprintGenerationEventType` union 中追加 4 个字符串字面量：`"role.container.provisioning"` / `"role.container.ready"` / `"role.container.teardown"` / `"role.container.failed"`。

6.2 THE Feature SHALL 在 `BlueprintEventName` 常量表中追加对应键：`RoleContainerProvisioning` / `RoleContainerReady` / `RoleContainerTeardown` / `RoleContainerFailed`。

6.3 THE Feature SHALL NOT 扩展 `BlueprintGenerationEventFamily` union；4 条新事件全部归入既有 `role` 家族。

6.4 THE `resolveBlueprintEventFamily("role.container.ready") SHALL` 返回 `"role"`；对其它 3 条新事件名同理。

6.5 THE 事件 payload SHALL 包含但不限于：`key: RoleContainerKey`、`containerMode: "real" | "lite"`、`executionMode: "real" | "simulated_fallback"`、`bindingSummary: { mcpCount, skillCount, aigcNodeCount, skippedMcps, skippedSkills }`、`fallbackReason?`。字段为追加式，既有订阅者不得因字段追加而断言失败。

6.6 WHEN loader 幂等命中缓存，THE Loader SHALL emit `role.container.ready` 带 `cached: true` 标记；SHALL NOT emit `role.container.provisioning`。

6.7 THE 事件发射顺序 SHALL 保证单次 provision：`role.container.provisioning` → 至多一次 `role.container.failed`（致命错误时）**或** `role.container.ready`；单次 teardown：`role.container.teardown`。

6.8 THE Feature SHALL NOT 修改既有 6 条 `role.*` 事件的常量值、payload 顶层字段或发射顺序。

### 需求 7：driver 集成与 stage handoff

**用户故事：** 作为 `agent-crew-stage-activation` 的实现维护者，我希望 loader 的集成是**加性**的：driver 原有算法、事件顺序、测试一行不改。

#### 验收标准

7.1 THE Feature SHALL 在 `server/routes/blueprint/agent-crew-stage-activation/driver.ts` 的 `onStageTransition(input)` 末尾（所有 `role.*` 事件已 emit 之后）追加一段 env-gated hook：`if (ctx.roleContainerLoader && process.env.BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED === "true") { try { ctx.roleContainerLoader.onStageTransitionHook(input, stageRoleStateMap); } catch (err) { ctx.logger.warn(...); } }`。

7.2 THE Feature SHALL NOT 修改 driver 原有算法、state machine、事件 emit 顺序、幂等逻辑。

7.3 WHEN hook 触发 `onStageTransitionHook` 时某 role 的 targetState 为 `"active"`，THE Loader SHALL fire-and-forget 调 `provisionRoleContainer(key)`；`"sleeping"` 时调 `tearDownRoleContainer(key)`；其它 state 不触发 loader 动作。

7.4 THE `tearDownRoleContainer` SHALL 在释放物理容器之前调用 `handoffCapabilityContext(roleRuntimeCtx)` 生成 `StageHandoffContext` 快照，并通过 `ctx.jobStore.appendArtifact(jobId, { type: "role_runtime_handoff", payload: handoff, ... })` 挂入 `job.artifacts[]`。

7.5 THE `StageHandoffContext` SHALL 至少包含：`key`、`capabilitiesInvoked[]`、`mcpSessions[]`（含调用计数与最终状态）、`skillHandles[]`（脱敏 input/output digest）、`aigcNodeResults[]`、`warmStartHint?`、`generatedAt`。

7.6 WHEN 同一 job 在生命周期内对同一 `(roleId, stageId)` 进行 `active → sleeping → active` 循环，THE Loader SHALL 为每次 `active` 重新 provision（不同 stageAttempt）；但若 stage 不变且仅 watching ↔ reviewing 切换，SHALL 保持容器 ready 不重启。

7.7 WHEN job 进入终态 (`"completed"` / `"failed"`)，THE 外层 hook SHALL 主动调 `tearDownRoleContainer` 释放该 job 下所有未 teardown 的 role 容器；释放失败记入 `diagnostics.orphanContainerWarning` 但不阻塞 job 结束流程。

### 需求 8：诊断端点扩展（第 6 条 bridge entry）

**用户故事：** 作为运维人员，我希望 `/api/blueprint/diagnostics` 能直接看到 role container loader 的 real / lite 分布与 orphan 预警，而不需要额外端点。

#### 验收标准

8.1 THE Feature SHALL 扩展 `runtime-enablement/diagnostics-store.ts` 的 `BridgeId` union 追加 `"roleContainerLoader"`。

8.2 THE Feature SHALL 扩展 `BridgeDiagnosticEntry` 增加 loader 专属可选字段：`totalProvisions?`、`realProvisions?`、`liteProvisions?`、`teardownCount?`、`orphanContainerWarning?`；前 5 条 bridge 对应 entry 这些字段保持 `undefined`，投影对消费者向后兼容。

8.3 THE `GET /api/blueprint/diagnostics` 响应 `bridges` map SHALL 新增 key `"roleContainerLoader"`；当 loader Tier 1 off 时 `mode: "disabled"`、所有计数器 `0`、`lastInvocationAt: null`。

8.4 WHEN loader 完成一次 real provision，THE diagnostics entry SHALL `totalProvisions++`、`realProvisions++`、`lastMode: "real"`、`lastInvocationAt: <ISO>`、`mode: "real"`。

8.5 WHEN loader 完成一次 lite provision，THE diagnostics entry SHALL `totalProvisions++`、`liteProvisions++`、`lastMode: "simulated_fallback"`、`mode: "lite"`、`lastError: fallbackReason`。

8.6 WHEN loader 完成一次成功 teardown，THE diagnostics entry SHALL `teardownCount++`；释放失败时 `orphanContainerWarning++`。

8.7 THE diagnostics 订阅者（`attachDiagnosticsSubscriber`）SHALL 扩展支持 `role.container.ready` / `role.container.teardown` / `role.container.failed` 事件到 loader entry 的映射；既有 5 条 bridge 的订阅映射不得被改动。

### 需求 9：资源预算与安全边界

**用户故事：** 作为安全与成本治理人员，我希望每个角色容器能受限于明确的 CPU / 内存 / 网络策略，避免失控。

#### 验收标准

9.1 THE `RoleResourceBudget.memoryMb` SHALL 限定在 `[128, 4096]`，默认 `512`；越界值被 loader 在 merge 阶段截断到边界并 warn。

9.2 THE `RoleResourceBudget.cpuShares` SHALL 限定在 `[128, 2048]`，默认 `512`。

9.3 THE `RoleResourceBudget.provisionTimeoutMs` SHALL 限定在 `[1000, 120000]`，默认 `30000`；SHALL NOT 超过 `BLUEPRINT_ROLE_CONTAINER_PROVISION_TIMEOUT_MS` 的外层封顶。

9.4 THE `RoleResourceBudget.networkPolicy` SHALL 为 `"isolated"` / `"allowlist"` / `"open"` 之一；默认 `"allowlist"`；`"allowlist"` 时 `allowlistDomains` 非空。

9.5 THE real mode 下 `budget` 字段 SHALL 完整透传给 `ExecutorClient.dispatchPlan`；executor 是否真正实施隔离由 `services/lobster-executor` + `secure-sandbox`（L23）承载，不在本 spec 范围。

9.6 THE lite mode SHALL NOT 强制网络 / 资源隔离；`budget` 仅作为 `bindingReport.liteBudgetAdvisory` 元数据记录。

### 需求 10：不变量 —— 不改契约、不改既有测试

**用户故事：** 作为依赖 blueprint 契约与 5140+ 既有测试的团队成员，我希望本 spec 对外是纯增量：不改字段、不改事件、不改响应结构，测试不改任一断言。

#### 验收标准

10.1 THE Feature SHALL NOT 修改 `shared/blueprint/contracts.ts` 中 `BlueprintAgentRole` 既有必填字段；只以**追加可选字段 `capabilityPackage?`** 的方式扩展。

10.2 THE Feature SHALL NOT 修改 `BlueprintRolePresence` / `BlueprintAgentCrew` / `BlueprintRoleCapability` / `BlueprintStageActivationPolicy` / `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 任一字段。

10.3 THE Feature SHALL NOT 修改既有 6 条 `role.*` 事件常量或 payload 顶层字段；仅追加 4 条新常量。

10.4 THE Feature SHALL NOT 修改 `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` / `POST /api/executor/jobs` / `POST /api/executor/events` / `GET /api/blueprint/diagnostics` 任一路径的请求 schema；诊断响应只以**扩展 `bridges` map 新 key + 扩展 `BridgeDiagnosticEntry` 新可选字段**的方式兼容演进。

10.5 THE Feature SHALL NOT 改写、删除或调整 `server/tests/blueprint-routes.test.ts`、`server/routes/blueprint/agent-crew-stage-activation/driver.test.ts` 中任一既有断言；SHALL NOT 改写任一 bridge co-located 单测的断言。

10.6 WHEN 本 spec 落地后执行 `pnpm test`，5140+ 既有测试 SHALL 保持通过状态；允许**只新增**测试。

10.7 THE Feature SHALL NOT 修改任一既有 capability bridge 的内部实现文件（`docker-analysis-sandbox/` / `mcp-github-source/` / `role-system-architecture/` / `aigc-spec-node/`）；SHALL NOT 修改 `agent-crew-stage-activation/driver.ts` 的原有算法，仅在 `onStageTransition` 末尾**追加**一段 env-gated hook。

### 需求 11：测试策略

**用户故事：** 作为测试作者，我希望既有 5140 测试不改一行继续通过，同时能在新写的测试里用 `vi.stubEnv` 或显式 deps 打开 loader 路径。

#### 验收标准

11.1 THE `vitest.setup.ts` / 相关 config SHALL 保持 `autopilot-capability-runtime-enablement` 引入的 `BUILD_TARGET=test` 注入；loader flag 在 test 环境默认解析为 `"false"`。

11.2 THE Feature SHALL 在 `server/routes/blueprint/role-container-loader/` 子目录添加至少 7 组 co-located 单测：`capability-package.test.ts` / `loader.test.ts` / `lifecycle-manager.test.ts` / `mcp-binder.test.ts` / `skills-binder.test.ts` / `aigc-orchestrator.test.ts` / `handoff-context.test.ts`。

11.3 THE Feature SHALL 新增至少 4 条 E2E（可追加到 `blueprint-routes.test.ts` 或新建 `role-container-loader-e2e.test.ts`）：
  - (a) Real mode happy path；
  - (b) Lite mode fallback（executor 不可达）；
  - (c) Partial binding failure（单个 MCP probe 失败）；
  - (d) Idempotent provisioning（同 key 两次调用）。

11.4 THE Feature SHALL 添加一条 driver-hook 集成测试，验证 `driver.onStageTransition` 在 `ctx.roleContainerLoader` 存在且 flag `"true"` 时调用 hook；flag 非 `"true"` 时 **不**调用 hook；hook 抛错时被 try/catch 吞掉而 driver 原有行为不变。

11.5 THE Feature SHALL NOT 引入 property-based test（PBT）；所有新增测试为 example-based；与前序 5 桥 spec 的 §9.3 保持对齐。

11.6 THE Feature 的新增单测 SHALL 使用 fake `executorClient` / fake `mcpToolAdapter` / fake `skillRegistry` / fake `aigcSpecNodeCapabilityBridge`，不得触发真实 Docker / 真实 MCP / 真实 LLM 网络调用。

### 需求 12：文档同步

**用户故事：** 作为阅读项目文档的开发者，我希望 `.env.example`、`.kiro/steering/project-overview.md` 能反映本 spec 引入的 3 个新环境变量与 6th bridge diagnostics entry。

#### 验收标准

12.1 THE Feature SHALL 在 `.env.example` 追加 `BLUEPRINT_ROLE_CONTAINER_LOADER_ENABLED`、`BLUEPRINT_ROLE_CONTAINER_LOADER_MODE_OVERRIDE`、`BLUEPRINT_ROLE_CONTAINER_PROVISION_TIMEOUT_MS` 三个变量的中文注释示例条目；说明它们受 `AUTOPILOT_REAL_RUNTIME` 主 switch 驱动、显式设置最优先。

12.2 THE Feature SHALL 在 `.kiro/steering/project-overview.md` 的"运行时 / executor 模式"或"当前进度快照"段落追加 1-3 段中文说明：loader 的 real / lite 双模式、graceful degradation 三级、诊断端点第 6 条 entry、角色静态目录 → 运行时复合代理的语义跃迁。

12.3 THE Feature SHALL NOT 修改 `.env` 文件（运行时密钥不入仓库）；仅改 `.env.example`。

12.4 THE Feature SHALL NOT 修改与本 spec 无关的 steering 段落；修改范围限定在 autopilot / role / runtime / diagnostics 相关说明。

### 需求 13：范围边界与不在范围内事项

**用户故事：** 作为代码评审人，我希望明确本 spec 的范围边界，以及哪些相关工作必须被排除、由独立 spec 推进。

#### 验收标准

13.1 THE Feature SHALL NOT 替换、废弃或重写 `blueprint-agent-crew-fabric` 的任何静态目录或角色能力矩阵；仅作为运行时扩展。

13.2 THE Feature SHALL NOT 修改现有 capability invocation 契约（`BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence`）；role runtime context 通过**独立**的 `ctx.roleRuntimeContextStore` 暴露给需要的调用方。

13.3 THE Feature SHALL NOT 实现多租户隔离；多租户由 `secure-sandbox`（L23）承载。

13.4 THE Feature SHALL NOT 构建新的容器镜像；复用 `services/lobster-executor` 中既有 `lobster-executor:default` / `lobster-executor:ai` 镜像。

13.5 THE Feature SHALL NOT 引入 UI 改动；诊断端点 JSON 的 UI 消费由后续 UI spec 独立推进。

13.6 THE Feature SHALL NOT 新增 HTTP 路由；复用 `/api/mcp` + `/api/skills` + `/api/blueprint/diagnostics`。

13.7 THE Feature SHALL NOT 要求 Docker 在 `dev:frontend` 模式或 GitHub Pages 构建中可用；该模式下 loader flag 保持 `"false"`，无任何装配动作。

13.8 THE Feature SHALL NOT 引入节点级权限模型变更；沿用 `agent-permission-model`（L25）与 `secure-sandbox` 已有策略。

13.9 THE Feature SHALL NOT 引入跨 job 容器复用；每个 `(roleId, stageId, jobId)` 独立生命周期；跨 job 复用优化由后续独立 spec（若需要）推进。

13.10 THE Feature SHALL NOT 引入 MCP / Skill 的运行期热更新；容器 ready 后绑定集合在本次激活周期内冻结；新增绑定只能通过新一次 provision。
