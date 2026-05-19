# 需求文档：Autopilot Capability Runtime Enablement

## 简介

`/autopilot` 的 11 节点叙事要求：一次真实 GitHub 提交应触发真实执行链——Docker 沙箱拉代码、MCP 抓取仓库元数据、LLM 推理角色与子系统、stage-driven 状态机发出 `role.*` 事件。

当前问题：5 条 capability bridge（`docker-analysis-sandbox` / `mcp-github-source` / `role-system-architecture` / `aigc-spec-node` / `agent-crew-stage-activation`）已全部落地，但全被 `BLUEPRINT_*_CAPABILITY_BRIDGE_ENABLED` 默认关闭。默认部署、默认 `dev:all`、默认 `/autopilot` 下 5 条桥都走模板化 fallback：

| 环境变量 | 当前默认 | 实际 "true" 的位置 |
| --- | --- | --- |
| `BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED` | unset → fallback | 仅测试用 `vi.stubEnv` |
| `BLUEPRINT_MCP_CAPABILITY_BRIDGE_ENABLED` | unset → fallback | 仅测试 |
| `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED` | unset → fallback | 仅测试 |
| `BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED` | unset → no-op | 仅测试 |
| `BLUEPRINT_AIGC_NODE_CAPABILITY_BRIDGE_ENABLED` | unset → fallback | 仅测试 |

叠加 `buildBlueprintServiceContext` 对 `deps.executorClient` 只做透传，即便 env 翻成 "true" docker bridge 仍会因 `ctx.executorClient === undefined` 走 fallback。

本 spec 做的事：**把 5 条桥在默认部署下通电，保留显式 opt-out 与测试兼容路径，提供可观测诊断端点**。

- 新增单一 master switch `AUTOPILOT_REAL_RUNTIME`（`dev:all` 默认注入 "true"，`BUILD_TARGET=test` 强制 "false"）。
- 改造 `buildBlueprintServiceContext` 在 docker bridge 启用时默认构造 `ExecutorClient`（非阻塞 health probe）。
- 改造 `server/index.ts` 在 MCP bridge 启用时默认注入 `mcpToolAdapter` + `createDefaultBlueprintHttpFetcher`。
- 新增 `GET /api/blueprint/diagnostics` 只读端点，报告每条桥的 `real` / `fallback` / `enabled` / `disabled`。
- executor 不可达 / apiKey 缺失 / MCP 初始化失败时一致走 simulated fallback——服务器不崩、请求不 5xx、诊断如实报告。

本 spec **不引入任何新 capability、不修改任何共享 contract、不新增 `BlueprintEventName`、不改写 5140+ 既有测试的任一断言**。

本 spec 属于 Feature 类型，design-first 工作流（High-Level + Low-Level）。

## 术语表

- **Master Switch**：新增 `AUTOPILOT_REAL_RUNTIME`，驱动 5 条桥默认启用状态。
- **Bridge-Level Flag**：既有 5 个 `BLUEPRINT_*_ENABLED` 环境变量；保持原名、原语义。开发者显式设置永远最优先。
- **Build Target**：`process.env.BUILD_TARGET`，`"test"` 时强制关闭默认启用，保护既有测试。
- **Env Resolver**：新增纯函数 `resolveBridgeEnablement` / `resolveAllBridgeEnablement`，把 master switch + buildTarget + 桥级 flag 解析为最终启用状态并写回 `process.env`。
- **Default Executor Factory**：新增纯函数 `resolveDefaultExecutorClient`，docker 桥启用且 `LOBSTER_EXECUTOR_BASE_URL` 有值时构造默认 `ExecutorClient`。
- **Diagnostics Store**：新增 ctx 级内存对象，聚合 5 条桥的最近执行模式、计数器、错误原因（脱敏）。
- **Diagnostics Endpoint**：新增只读路由 `GET /api/blueprint/diagnostics`。
- **Graceful Degradation**：桥 3 层早退链（env gate / dependency missing / runtime error）失败统一走 `simulated_fallback`；服务器启动与请求处理不因任一依赖失败而 5xx。
- **Composition Root**：`server/index.ts` 的 `createServer()` 启动流程。
- **Existing 5140+ Tests**：本 spec 提交前全集，所有 `autopilot-capability-bridge-*` E2E + 子域单测均在内。

## 需求

### 需求 1：Master Switch 语义与默认行为

**用户故事：** 作为 `/autopilot` 维护者，我希望通过单一开关切换"真跑能力桥"和"走 fallback"，而不必管 5 个桥级 flag；同时既有测试对默认 off 的依赖必须保留。

#### 验收标准

1.1 THE Feature SHALL 新增环境变量 `AUTOPILOT_REAL_RUNTIME`：`"true"` → 默认开启 5 条桥、`"false"` → 默认关闭、`undefined` → 保留今天"未启用"语义。

1.2 THE Feature SHALL 使用环境变量 `BUILD_TARGET`，当为 `"test"` 时 Env Resolver 必须把所有**未显式设置**的桥级 flag 强制解析为 `"false"`；其它取值按 master switch 语义解析。

1.3 WHEN 开发者显式设置某桥级 flag（`process.env[flag]` 为非空字符串），THE Env Resolver SHALL 使用该显式值，无视 master switch 与 BUILD_TARGET；唯一例外：显式 `"true"` + BUILD_TARGET=`"test"` 仍放行（允许单测显式 opt-in）。

1.4 THE Env Resolver SHALL 为**纯函数**，接收 envFlag 名、explicitEnvValue、masterSwitch、buildTarget 四个字符串参数（或 `undefined`），返回 `"true"` / `"false"` / `undefined`；SHALL NOT 读 `process.env`、SHALL NOT 有副作用；对相同入参多次调用返回相同值。

1.5 THE `resolveAllBridgeEnablement(env)` SHALL **幂等**：第一次调用把决策写回 env 对象的桥级 flag；第二次调用（同一 env）不产生新写入、返回相同快照。

1.6 THE `scripts/dev/dev-all.js` SHALL 默认向子进程注入 `AUTOPILOT_REAL_RUNTIME=true`；若外层 shell 已显式设置（`"true"` 或 `"false"`），SHALL 保留外层值而不覆盖。

1.7 THE `scripts/dev/dev-frontend.js`（若存在）SHALL NOT 注入 `AUTOPILOT_REAL_RUNTIME`；该模式只启动 Vite dev server，本 spec 的默认装配改动对其不生效。

1.8 THE GitHub Pages 构建路径（`npm run build:pages`）SHALL NOT 加载 `server/index.ts`，也不触发 Env Resolver；`/autopilot` GitHub Pages 预览保持 browser-only。

### 需求 2：Docker Capability Bridge 默认通电

**用户故事：** 作为提交 `https://github.com/666ghj/MiroFish` 的 /autopilot 用户，我希望默认部署下 Docker 沙箱真的跑一个容器去拉我的代码，而不是返回模板化摘要。

#### 验收标准

2.1 WHEN `BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED` 经 Env Resolver 解析为 `"true"` 且 `LOBSTER_EXECUTOR_BASE_URL` 非空，THE `buildBlueprintServiceContext({})` SHALL 默认构造 `ExecutorClient` 并挂在 `ctx.executorClient`，使 docker bridge 的 `isBridgeConfigured(ctx)` 检查通过。

2.2 WHEN 上述条件成立且 `assertReachable()` 通过，THE docker bridge SHALL 通过 `dispatchPlan()` 派发真实 Docker 作业，产出 invocation 的 `provenance.executionMode === "real"`、`containerId` / `artifactUrl` / `durationMs` 为真实值。

2.3 WHEN `BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED` 经 Env Resolver 解析为 `"false"`（含 `BUILD_TARGET=test` 未显式 opt-in），THE `buildBlueprintServiceContext({})` SHALL NOT 构造默认 `ExecutorClient`；`ctx.executorClient` 保持 `undefined`；docker bridge 走 simulated fallback。

2.4 WHEN master switch 为 `"true"` 但 `LOBSTER_EXECUTOR_BASE_URL` 未设或为空，THE Default Executor Factory SHALL 返回 `undefined` 而不是抛错；`ctx.logger.warn` 记录原因；docker bridge 走 fallback。

2.5 THE 启动期默认 `ExecutorClient` 构造 SHALL NOT 做同步 `assertReachable()`；延迟到 bridge 首次调用时。启动期 MAY 调度一次**非阻塞** fire-and-forget probe 把结果写入 Diagnostics Store，但 SHALL NOT 阻塞 `createServer()`。

2.6 THE 默认 `ExecutorClient` 构造 SHALL 使用与 `server/core/execution-bridge.ts` 对齐的构造签名（`new ExecutorClient({ baseUrl, callbackUrl })`）；callback URL 派生方式 SHALL 与既有 `buildCallbackUrl()` 一致。

### 需求 3：MCP GitHub Bridge 默认通电

**用户故事：** 作为提交 GitHub 仓库的 /autopilot 用户，我希望默认 MCP adapter 真去抓仓库元数据（默认分支、最近 commit），而不是返回固定模板。

#### 验收标准

3.1 THE `server/index.ts` composition root SHALL 将原 `if (mcpBridgeEnabled)` 改为：读取 Env Resolver 对 `BLUEPRINT_MCP_CAPABILITY_BRIDGE_ENABLED` 的解析结果，若为 `"true"` 则把主线 `mcpToolAdapter` + `createDefaultBlueprintHttpFetcher()` 作为 deps 传入 `createBlueprintRouter`。

3.2 WHEN 解析为 `"false"` 或 `undefined`，THE composition root SHALL 以原有 deps 形态挂载 blueprint router（不传 `mcpToolAdapter` / `httpFetcher`）；mcp-github bridge 走 simulated fallback。

3.3 THE `createDefaultBlueprintHttpFetcher` 调用 SHALL 保持原参数（`maxResponseBodyBytes: 1_048_576`、`defaultTimeoutMs: 30_000`）；本 spec **不引入**新 fetcher 参数。

3.4 WHEN 默认注入的 `mcpToolAdapter.execute(...)` 运行期抛错（MCP 不可达、tool 未注册、超时），THE mcp-github bridge SHALL 走 simulated fallback（既有 HTTP 降级路径保留），`provenance.error` 填入脱敏摘要；服务器 SHALL NOT 返回 5xx。

3.5 THE `/api/mcp` 主路由 SHALL 不受本 spec 影响；`mcpToolAdapter` 单例启动期仍始终构造，仅"是否传给 blueprint router"随 Env Resolver 决策而变。

### 需求 4：Role / AIGC Node / Stage Activation 桥默认通电

**用户故事：** 作为 /autopilot 用户，我希望默认部署下系统真的调用 LLM 去推理仓库涉及哪些角色、有哪些子系统，以及驱动 role 状态机生成阶段化事件。

#### 验收标准

4.1 WHEN `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED` 解析为 `"true"` 且 `ctx.llm.getConfig().apiKey` 非空，THE role bridge SHALL 走 real，通过 `ctx.llm.callJson` 发一次 `blueprint.role-architecture.v1` 调用，产出 `provenance.executionMode === "real"` + `structuredRoles` 非空。

4.2 WHEN `BLUEPRINT_AIGC_NODE_CAPABILITY_BRIDGE_ENABLED` 解析为 `"true"` 且 `apiKey` 非空，THE aigc-spec-node bridge SHALL 走 real，通过 `ctx.llm.callJson` 发一次 `blueprint.aigc-spec-node.v1` 调用，产出 `provenance.executionMode === "real"` + `structuredPayload` 非空。

4.3 WHEN `BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED` 解析为 `"true"` 且 role bridge 本次产出了 `structuredRoles.payload`，THE stage activation driver SHALL 按 `onStageTransition` 钩子调用产出真实 `role.*` 事件，每条携带 `activationDriverExecutionMode === "real"`。

4.4 WHEN `apiKey` 为空或 `undefined`，THE role / aigc-spec-node bridge SHALL 保持既有 tier-2 早退：不调 callJson、产出 simulated fallback、`ctx.logger.debug` 记录 "apiKey missing"；本 spec SHALL NOT 修改该早退路径。

4.5 WHEN `ctx.llm.callJson` 运行期抛错、返回非 JSON、schema 校验失败，THE role / aigc-spec-node bridge SHALL 保持既有 tier-3 早退：走 simulated fallback、`provenance.error` 填入脱敏 reason；本 spec SHALL NOT 修改该早退路径。

4.6 THE role / aigc-spec-node / stage activation 三桥 SHALL NOT 因本 spec 修改任何内部实现代码；仅 env flag 的默认解析路径变化。

### 需求 5：Diagnostics 端点

**用户故事：** 作为运维或排障人员，我希望快速判断当前部署里 5 条桥哪条真跑、哪条 fallback，以及 fallback 原因。

#### 验收标准

5.1 THE Feature SHALL 新增只读路由 `GET /api/blueprint/diagnostics`，返回 Diagnostics Store snapshot，HTTP 200。

5.2 THE snapshot SHALL 包含顶层字段：`masterSwitch: string | null`、`buildTarget: string | null`、`bridges: Record<BridgeId, BridgeDiagnosticEntry>`、`generatedAt: string`（ISO 时间）。

5.3 THE `bridges` 字段 SHALL 至少包含 5 个 key：`docker` / `mcpGithub` / `role` / `aigcNode` / `agentCrewStageActivation`；每个 entry 包含：`bridgeId`、`mode`（`"real" | "fallback" | "enabled" | "disabled" | "unknown"`）、`enabledByConfig: boolean`、`dependencyReady: boolean`、`lastInvocationAt: string | null`、`lastMode: "real" | "simulated_fallback" | null`、`lastError: string | null`、`totalInvocations: number`、`realInvocations: number`、`fallbackInvocations: number`。

5.4 WHEN 服务器启动完成但尚未处理任何 `POST /api/blueprint/jobs`，THE diagnostics 端点 SHALL 仍返回 200 + 合法 snapshot；每个桥的 `enabledByConfig` / `dependencyReady` 来自启动期记录的 configuration，`totalInvocations` 为 0、`lastInvocationAt` 为 null。

5.5 WHEN 处理过至少一条 invocation，THE snapshot 中对应桥的 `lastInvocationAt` / `lastMode` / `totalInvocations` / `realInvocations` / `fallbackInvocations` SHALL 正确反映最近一次与累计状态。

5.6 THE Diagnostics Store SHALL 通过订阅 `ctx.eventBus` 的 `capability.completed` / `capability.failed` / `role.*` 事件完成记录，SHALL NOT 要求修改任一 bridge 的内部实现。

5.7 THE Diagnostics Store 写入 `lastError` SHALL 经既有脱敏路径（复用 `applyAgentCrewRedaction` / `applyAigcNodeCapabilityRedaction`）并截断不超过 400 字符；SHALL NOT 原样保留 API key / Token / PAT / 邮件 / Authorization。

5.8 THE Diagnostics Store SHALL 为纯内存、进程重启即丢失、不持久化、不发 socket、不写 audit。

5.9 THE diagnostics handler 内部抛错时 SHALL 返回 HTTP 500 + `{ error: "diagnostics unavailable" }`；SHALL NOT 让错误传到 Express 默认错误处理。

### 需求 6：优雅降级与启动健壮性

**用户故事：** 作为维护部署的工程师，我希望即便 Docker 没起、MCP 初始化抛错、LLM key 错、executor URL 不可达，服务器都能正常启动，`/api/blueprint/jobs` 都能正常返回 2xx。

#### 验收标准

6.1 THE Feature SHALL 保证在以下任一场景下 `server/index.ts` 的 `createServer()` 均成功启动并监听 HTTP：Docker daemon 未启动、`LOBSTER_EXECUTOR_BASE_URL` 未设或不可达、`LLM_API_KEY` 未设或错、`McpToolAdapter` 构造抛错、任一 bridge 工厂构造抛错。

6.2 THE Feature SHALL 保证上述任一场景下对 `POST /api/blueprint/jobs` 的请求返回 HTTP 2xx（既有的成功 accepted 响应形态保持不变），而不是 5xx。受影响的 capability 按 simulated fallback 产出 invocation。

6.3 THE Default Executor Factory / Env Resolver / Diagnostics Store 在内部抛错时 SHALL 被 `server/index.ts` 的 try/catch 兜底，降级为"全部桥 disabled / fallback"；SHALL NOT 让启动崩溃。

6.4 THE Feature SHALL NOT 在任一 bridge 外部添加抛错路径；bridge 本身已有的 3 层早退（env gate / dependency missing / runtime error）继续为唯一真相源。

6.5 WHERE 桥内部运行期错误需要写入 Diagnostics Store，订阅函数 SHALL 用 try/catch 包裹；`recordBridgeInvocation` 自身若抛错 SHALL 被吞掉且 `ctx.logger.warn` 记录。

### 需求 7：不变量——不改契约、不改既有测试

**用户故事：** 作为依赖 blueprint 契约与 5140+ 既有测试的团队成员，我希望本 spec 对外是纯增量：不改字段、不改事件、不改响应结构，测试不改任一断言。

#### 验收标准

7.1 THE Feature SHALL NOT 修改 `shared/blueprint/contracts.ts` 中任一既有字段；可选字段只能以**追加**方式存在，且本 spec 不依赖任何新可选字段。

7.2 THE Feature SHALL NOT 新增、重命名或删除 `BlueprintEventName` 常量。

7.3 THE Feature SHALL NOT 修改 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` / `BlueprintAgentCrew` / `BlueprintRolePresence` 的形态。

7.4 THE Feature SHALL NOT 修改 `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` / `POST /api/executor/jobs` / `POST /api/executor/events` 的请求或响应 schema；只以新增方式引入 `GET /api/blueprint/diagnostics`。

7.5 THE Feature SHALL NOT 改写、删除或调整 `server/tests/blueprint-routes.test.ts` 中任一 E2E 用例的断言；SHALL NOT 改写任一 bridge co-located 单测的断言；SHALL NOT 改写 `client/src/lib/blueprint-api/` 下任一 SDK smoke 的断言。

7.6 WHEN 本 spec 落地后执行 `pnpm test`（或 workspace 等价），所有 5140+ 既有测试 SHALL 保持通过状态；允许**只新增**测试。

7.7 THE Feature SHALL NOT 修改任一既有 bridge 的内部实现文件（`server/routes/blueprint/docker-analysis-sandbox/bridge.ts` / `mcp-github-source/bridge.ts` / `role-system-architecture/bridge.ts` / `aigc-spec-node/bridge.ts` / `agent-crew-stage-activation/driver.ts`）的实现逻辑；仅允许**新增**文件或改装配层文件（`context.ts` / `server/index.ts`）。

### 需求 8：测试策略——`BUILD_TARGET=test` 自动关闭 + 显式 opt-in 打开

**用户故事：** 作为测试作者，我希望既有的 5140 测试不改一行继续通过，同时仍能在新写的测试里用 `vi.stubEnv` 或显式 deps 打开真实路径。

#### 验收标准

8.1 THE `vitest.config.server.ts` / `vitest.config.ts`（或共用的 setup 文件 `vitest.setup.ts`）SHALL 在测试执行前注入 `process.env.BUILD_TARGET = "test"`（若未设置）；使 Env Resolver 强制所有未显式 opt-in 的桥级 flag 返回 `"false"`。

8.2 WHEN 新写测试希望启用某桥，SHALL 使用既有 `vi.stubEnv("BLUEPRINT_XXX_ENABLED", "true")` 模式；本 spec SHALL NOT 引入新的 test helper 破坏该模式。

8.3 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 新增至少 3 条 E2E（详见 tasks），覆盖：
  - (a) master switch on + fake 依赖 → 5 桥均走 real；
  - (b) master switch off → 5 桥均 fallback；
  - (c) master switch on + executor unreachable → docker fallback 其余 real + diagnostics 端点响应正确。

8.4 THE Feature SHALL 在新增模块所在目录添加至少 4 组 co-located 单测：`resolver.test.ts`（resolver 纯函数的 10+ 场景）、`executor-factory.test.ts`（默认 executor 构造 6 场景）、`diagnostics-store.test.ts`（record / snapshot / 脱敏截断）、`subscriber.test.ts`（event → store 映射）。

8.5 THE Feature SHALL NOT 引入 property-based test（PBT）；所有新增测试为 example-based。

### 需求 9：文档同步

**用户故事：** 作为阅读项目文档的开发者，我希望 `.env.example`、`.kiro/steering/project-overview.md`、README 的 runtime 说明反映本 spec 引入的默认装配变化。

#### 验收标准

9.1 THE Feature SHALL 在 `.env.example` 顶部新增带中文注释的 `AUTOPILOT_REAL_RUNTIME` 条目，说明 master switch 语义；同时在现有 `BLUEPRINT_*_CAPABILITY_BRIDGE_ENABLED` 相关注释旁加一行"通常无需单独设置，由 master switch 驱动；显式值最优先"。

9.2 THE Feature SHALL 在 `.kiro/steering/project-overview.md` 的"运行时 / executor 模式"或"当前进度快照"段落新增 1-3 段中文说明：默认装配已进入 real 模式、5 条桥默认启用、`GET /api/blueprint/diagnostics` 已提供、`BUILD_TARGET=test` 保护测试兼容性。

9.3 THE Feature SHALL NOT 修改 `project-overview.md` 中与本 spec 无关的段落；修改范围限定在 runtime / executor / autopilot 相关说明。

9.4 THE Feature SHALL NOT 修改 `.env` 文件（该文件为运行时配置、含开发者本地密钥）；仅改 `.env.example`。

9.5 IF 实现过程中发现需要新增其它 steering 文档，THE Feature MAY 添加一份独立 steering 说明本 spec 的口径边界，但 SHALL NOT 扩大本 spec 的作用范围。

### 需求 10：范围边界与不在范围内事项

**用户故事：** 作为代码评审人，我希望明确本 spec 的范围边界，以及哪些相关工作必须被排除、由独立 spec 推进。

#### 验收标准

10.1 THE Feature SHALL NOT 引入新的 capability kind 或新的 bridge；只默认通电已有 5 条。

10.2 THE Feature SHALL NOT 实现"Dynamic loading of MCP servers and Skills into Docker containers per role"、"Role-to-container binding"、"Role-scoped AIGC node orchestration"、"Custom container image per role"；这些由后续独立 spec `autopilot-role-container-loader` 推进。

10.3 THE Feature SHALL NOT 引入 UI 改动作为验收条件；`/autopilot` 驾驶舱是否展示 diagnostics 端点信息属于可选增强、由后续 UI spec 处理。

10.4 THE Feature SHALL NOT 引入新的持久化存储、跨进程广播、新的 socket 事件、新的 audit 记录通道。

10.5 THE Feature SHALL NOT 改动 Web-AIGC runtime、Mission Runtime、Workflow Runtime、tasks-store、Office Task Cockpit 任一既有能力；这些由各自主线推进。

10.6 THE Feature SHALL NOT 要求 Docker 在 `dev:frontend` 模式或 GitHub Pages 构建中可用。
