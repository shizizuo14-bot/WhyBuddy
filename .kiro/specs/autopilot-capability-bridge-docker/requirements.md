# 需求文档：Autopilot Capability Bridge — Docker Analysis Sandbox

## 简介

`/autopilot` 的 11 节点叙事（`docs/autopilot-target-experience-architecture-2026-05-07.svg`）要求：**澄清之后的每个阶段都应由真实能力网络驱动，沙箱派生应输出真实证据**。前序 spec `autopilot-routeset-llm-generation`（`.kiro/specs/autopilot-routeset-llm-generation/requirements.md`，见其 需求 1.3 / 9.4）在明确把 RouteSet 升级为 LLM 驱动的同时，**明确把“沙箱派生本身变成真实能力调用”这件事留给独立的 capability-bridge feature**——本 spec 就是那个独立 feature 的第一块：`docker-analysis-sandbox` 能力桥。

当前 `server/routes/blueprint.ts` 第 **2866-3200** 行的 `createRouteGenerationSandboxDerivation()` 对 4 个 capability（`docker-analysis-sandbox` / `mcp-github-source` / `aigc-spec-node` / `role-system-architecture`）产出的都是模板化结果：

- `adapter: "blueprint.runtime.docker.simulated"`（第 ~3372 行 `getDefaultRuntimeCapabilities()` 声明）
- `durationMs = 180 + index * 30`（确定性公式，见 `deterministicCapabilityDuration()`）
- `outputSummary` 由 `buildCapabilityOutputSummary()` 按模板字符串拼装
- `logs` 由 `buildCapabilityInvocationLogs()` 硬编码生成
- 无 Docker / MCP / HTTP / LLM 调用

另一方面，仓库里已经存在一套成熟的真实 Docker 执行链路：`services/lobster-executor/`（`docker-runner.ts` 基于 dockerode、`mock-runner.ts`、`security-policy.ts` 的 seccomp/AppArmor 策略、HMAC 签名回调、实时终端与截图流），以及 `server/core/executor-client.ts` 中的 `ExecutorClient`（`dispatchPlan()` → `POST /api/executor/jobs`，回调走 `POST /api/executor/events`）。`.kiro/steering/2026-04-15-runtime-current-state.md` 也确认 `dev:all` 在 Docker 可用时自动选 `real`，不可用时回退 `native`，GitHub Pages 纯前端不含执行器。

本 spec 做的事非常聚焦：**只把 `docker-analysis-sandbox` 这一个 capability 在沙箱派生管线中的调用，从模板化升级为通过 `ExecutorClient` 真正派发给 `services/lobster-executor` 的 Docker 调用**。其它 3 个 capability（`mcp-github-source` / `aigc-spec-node` / `role-system-architecture`）的真实化由后续独立 spec 推进；`buildRouteSet()` 本身、SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 也由各自独立 spec 推进；`createRouteGenerationSandboxDerivation()` 外层 orchestration 不在本 spec 范围内，只把其中一个 capability 的 adapter 实现替换掉。

当执行器不可达（`dev:all` 选到 native、Docker Daemon 宕机、health check 失败、callback 超时）时，本 feature 必须**无缝回退到今天的模板化调用**，保证既有 `server/tests/blueprint-routes.test.ts` 中 45 条 E2E 与 48 条子域单测在默认测试装配下（执行器不可达 → 回退）继续通过。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **Docker Capability Bridge / Docker 能力桥**：本 spec 引入的新组件，负责把 `docker-analysis-sandbox` 能力的一次调用转成一次真实 Docker 执行；通过 `BlueprintServiceContext` 注入依赖，`createRouteGenerationSandboxDerivation()` 在命中该 capability 时会调它替换模板化 invocation。
- **Lobster Executor**：`services/lobster-executor/` 目录下的现有 Docker 执行器（`docker-runner.ts` / `mock-runner.ts` / `security-policy.ts` 等），通过 `POST /api/executor/jobs` 接单、通过 HMAC 签名的 `POST /api/executor/events` 回调事件。本 spec 复用它，不新增执行器进程。
- **ExecutorClient**：`server/core/executor-client.ts` 中已存在的 `ExecutorClient` 类及其 `dispatchPlan()` 方法；本桥必须通过它派发作业，而不得直接 `import` `services/lobster-executor` 的 dockerode 或 runner 单例。
- **Real 执行 / Real Execution**：LLM 或产品叙事里的“真实能力执行”，在本 spec 中等价于“通过 `ExecutorClient.dispatchPlan()` 向 Lobster Executor 派发一个 Docker 作业并接收 HMAC 签名回调”。
- **Simulated Fallback / 模拟回退**：执行器不可达 / 超时 / health check 失败 / 当前运行模式为 native 等情况下，本桥回退到今天 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 产出的模板化结果；产出结构与今天 simulated invocation 字段形态等价。
- **`adapter` 字符串**：`BlueprintRuntimeCapability.adapter` 字段。本 spec 把 real 执行路径下 `docker-analysis-sandbox` 的 adapter 从 `"blueprint.runtime.docker.simulated"` 升级为 `"blueprint.runtime.docker.lobster-executor"`；回退路径下保留或沿用现有 simulated 命名，并通过 `executionMode` 区分。
- **`executionMode`**：本 spec 在 `BlueprintCapabilityInvocation.provenance` 与 `BlueprintCapabilityEvidence.provenance` 中新增的**可选**字段，取值 `"real"` 或 `"simulated_fallback"`；real 路径下可附带 `containerId` / `artifactUrl` / `logDigest` 等真实溯源信息，fallback 路径下必须附带 `error?: string` 说明回退原因。
- **HMAC callback / HMAC 回调**：Lobster Executor 完成或失败时通过 `POST /api/executor/events` 回传的事件，签名头为 `EXECUTOR_CALLBACK_HEADERS.executorId` / `timestamp` / `signature`（`services/lobster-executor` 与 `server/core/executor-client.ts` 已约定）。本桥消费该回调以收集真实 `durationMs`、日志、产物地址等。
- **Redacted logs / 脱敏日志**：Lobster Executor 侧已有的 `credential-redactor` 负责把容器 stdout/stderr 中的 API Key、Token 等凭证掩码；本桥消费它的输出作为 `BlueprintCapabilityInvocation.logs` 的最终形态，再做长度截断。
- **Sandbox Derivation Pipeline / 沙箱派生管线**：`createRouteGenerationSandboxDerivation()` 生成 capability invocations / evidence / role events / `sandbox.job.*` 事件的这条管线。本 spec 只替换其中 `docker-analysis-sandbox` 一项的 adapter 实现，管线外层编排保持不变。
- **External HTTP Contract / 外部 HTTP 契约**：`POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 的请求与响应结构；以 `server/tests/blueprint-routes.test.ts` 中 45 条 E2E 用例锁定的行为为准。
- **Subdomain Tests / 子域单测**：`server/routes/blueprint/*/service.test.ts` 等 co-located 子域单元测试共 48 条。
- **`BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence`**：`shared/blueprint/contracts.ts` 中定义的 capability 调用记录与证据记录类型；本 spec 只允许以**追加可选字段**方式扩展它们的 `provenance`，不得修改既有字段。
- **`BlueprintEventName`**：`shared/blueprint/events.ts` 导出的事件名常量命名空间，含 `SandboxJobStarted` / `SandboxJobCompleted` / `SandboxJobFailed` / `CapabilityInvoked` / `CapabilityCompleted` / `CapabilityFailed` / `EvidenceRecorded` 等。本 spec 不新增事件名，只复用现有常量。

## 需求

### 需求 1：范围边界与独立性

**用户故事：** 作为 `/autopilot` 主线的维护者，我希望本 spec 有一条狭窄且可审核的范围边界，使它既能真正把 `docker-analysis-sandbox` 推进为真实 Docker 调用，又不会踩到其它 spec 的地盘、也不会被迫捆绑其它 3 个 capability 的改造。

#### 验收标准

1.1 THE Feature_Scope SHALL 覆盖并且仅覆盖 `createRouteGenerationSandboxDerivation()` 中 `docker-analysis-sandbox` 这一个 capability 的 invocation / evidence 产出路径，将其从模板化升级为通过 `ExecutorClient` 派发给 Lobster Executor 的真实 Docker 调用，并在不可达时回退到今天的模板化产出。

1.2 THE Feature_Scope SHALL NOT 修改 `mcp-github-source` 能力调用的产出路径；该项由独立 spec `autopilot-capability-bridge-mcp`（后续创建）推进。

1.3 THE Feature_Scope SHALL NOT 修改 `aigc-spec-node` 能力调用的产出路径；该项由独立 spec `autopilot-capability-bridge-aigc-node`（后续创建）推进。

1.4 THE Feature_Scope SHALL NOT 修改 `role-system-architecture` 能力调用的产出路径；该项由独立 spec `autopilot-capability-bridge-role`（后续创建）推进。

1.5 THE Feature_Scope SHALL NOT 修改 `buildRouteSet()` 本身的候选路线推导逻辑；该项由前序 spec `autopilot-routeset-llm-generation` 推进。

1.6 THE Feature_Scope SHALL NOT 修改 SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 任一阶段的生成路径；这些由各自独立 spec 推进。

1.7 THE Feature_Scope SHALL NOT 修改 `createRouteGenerationSandboxDerivation()` 外层对 capability 的选择、排序、evidence aggregation、role timeline、`sandbox.job.*` 事件总编排逻辑；本 spec 只替换其中一个 capability 的 adapter 实现。

1.8 THE Feature_Scope SHALL NOT 引入任何新的外部 HTTP 契约（新 route、新请求体字段、新响应字段）；已有 `POST /api/executor/jobs` / `POST /api/executor/events` 与 `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` 保持不变。

1.9 THE Feature_Scope SHALL NOT 修改或删除 `server/tests/blueprint-routes.test.ts` 中原有 45 条 E2E 用例、48 条子域 co-located 单测或 SDK smoke 任一既有断言；本 spec 只新增用例，不改写既有用例。

1.10 THE Feature_Scope SHALL NOT 引入 Browser Runtime / GitHub Pages 相关改动；GitHub Pages 纯浏览器路径不含执行器，不是本 spec 的承接对象（见 `.kiro/steering/2026-04-15-runtime-current-state.md`）。

### 需求 2：通过 ExecutorClient 发起真实 Docker 调用

**用户故事：** 作为审阅 `/autopilot` 沙箱证据的用户，我希望看到的 Docker 分析沙箱 invocation 是真的跑了一个 Docker 容器，而不是永远由字符串模板拼出来的摘要。

#### 验收标准

2.1 WHEN 沙箱派生管线在 `createRouteGenerationSandboxDerivation()` 内命中 `docker-analysis-sandbox` capability，THE Docker_Capability_Bridge SHALL 通过 `BlueprintServiceContext` 注入的 `ExecutorClient`（或等价 DI 适配器）发起一次真实 Docker 作业派发，而不是调用 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 生成模板化结果。

2.2 THE Docker_Capability_Bridge SHALL 通过 `ExecutorClient.dispatchPlan()` 向 Lobster Executor 派发作业，作业派发最终对应 `POST /api/executor/jobs`，执行结果通过 HMAC 签名的 `POST /api/executor/events` 回调接收；本桥 SHALL NOT 在内部直接 `import` `services/lobster-executor` 的 dockerode、`DockerRunner`、`MockRunner` 或任何 runner 单例。

2.3 THE Docker_Capability_Bridge SHALL 在派发前完成执行器健康检查（复用 `ExecutorClient` 现有的 `/health` 或 capabilities 探测能力），若健康检查失败则直接进入需求 4 的 Simulated Fallback 路径而不派发。

2.4 THE Docker_Capability_Bridge SHALL 为单次 Docker 调用设置一个明确的上限超时，该上限取值不大于 60 秒（具体数值在 design 阶段确定），超时到达仍未收到完成回调时触发需求 4 的 Simulated Fallback 路径。

2.5 THE Docker_Capability_Bridge SHALL 保证派发作业时传递的执行载荷来源可追溯到当前 `BlueprintGenerationRequest.targetText` / `githubUrls` / `projectId` / 当前 route 的 `id` / `title`，不得使用与当前请求无关的静态输入。

2.6 THE Docker_Capability_Bridge SHALL 在从 HMAC 签名回调收到 `succeeded` / `failed` 终态之前，不得向 `createRouteGenerationSandboxDerivation()` 外层返回 real 路径的最终 `BlueprintCapabilityInvocation`；未到终态期间必须保持作业仍在运行中或已按需求 4 回退。

### 需求 3：真实 Invocation 与 Evidence 字段来源

**用户故事：** 作为依赖 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 做 Artifact Replay、Agent Crew 展示与运维分析的消费者，我希望这些记录在 real 路径下的每个关键字段都能指回一次真实的 Docker 执行，而不是算法生成的常量。

#### 验收标准

3.1 WHEN Docker_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.durationMs` SHALL 等于从 `ExecutorClient.dispatchPlan()` 派发开始、到收到 HMAC 签名的完成回调为止的墙钟时间（毫秒），而不得由 `deterministicCapabilityDuration()` 这类确定性公式产出。

3.2 WHEN Docker_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.logs` SHALL 来源于容器的 stdout/stderr，经过 Lobster Executor 侧 `credential-redactor` 脱敏，再按 design 阶段决定的上限（建议上限为 ~50 行或 ~10KB，最终数值在 design 确定）截断；该字段 SHALL NOT 由 `buildCapabilityInvocationLogs()` 模板拼出。

3.3 WHEN Docker_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.outputSummary` SHALL 从容器真实输出（stdout / 结构化产物 / 回调事件 payload）派生而成，不得由 `buildCapabilityOutputSummary()` 模板字符串生成。

3.4 WHEN Docker_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation` 对应的 `BlueprintRuntimeCapability.adapter` SHALL 等于字符串 `"blueprint.runtime.docker.lobster-executor"`；real 路径下 adapter SHALL NOT 含子串 `.simulated`。

3.5 WHEN Docker_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityEvidence.summary` SHALL 由容器真实产出派生而成，并可在 evidence payload 中包含容器 ID、产物 URL、日志摘要（例如 SHA-256 摘要）等真实溯源字段；这些追加字段作为可选字段存在，不得破坏既有 evidence 消费方。

3.6 WHEN Docker_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.logs` SHALL 在持久化之前已经过 `credential-redactor` 脱敏；未脱敏的原始日志 SHALL NOT 出现在 evidence 或面向用户的响应中。

3.7 THE Docker_Capability_Bridge SHALL 保持 real 路径产出的 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 外层字段形态（`id` / `jobId` / `capabilityId` / `capabilityLabel` / `kind` / `status` / `securityLevel` / `safetyGate` / `routeId` / `input` / `evidenceIds` 等）与今天 simulated 路径对外可见的形态等价，以便既有 45 条 E2E + 48 条子域单测中不断言新字段的用例不会失败。

### 需求 4：执行器不可达时的 Simulated Fallback

**用户故事：** 作为在本机没有 Docker 的开发者、或在默认测试装配下运行 CI 的工程师，我希望沙箱派生照样能在不依赖 Docker 的情况下跑完，并在结果里清楚标注这次是回退产物而不是真实执行。

#### 验收标准

4.1 IF `ExecutorClient` 不可达（例如 `ExecutorClientError` 带 `kind === "unavailable"`）、health check 失败、作业派发超时、HMAC 回调超时、当前运行模式为 native 或 mock、或 `BlueprintServiceContext` 未注入可用的 executor 适配器，THEN THE Docker_Capability_Bridge SHALL 回退到今天的模板化 invocation 产出路径（沿用 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()`）。

4.2 WHEN Docker_Capability_Bridge 走 Simulated Fallback 路径，THE `BlueprintCapabilityInvocation.provenance` SHALL 新增可选字段 `executionMode === "simulated_fallback"` 与 `error: string`（填入触发回退的原因摘要，例如 `"executor unavailable"` / `"dispatch timeout"` / `"callback timeout"` / `"native mode"`）；real 路径下则 SHALL 新增可选字段 `executionMode === "real"`，可附带 `containerId` / `artifactUrl` / `logDigest` 等可选溯源字段。

4.3 WHEN Docker_Capability_Bridge 走 Simulated Fallback 路径，THE `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 的既有外层字段形态 SHALL 与今天 simulated 产出等价，使既有 45 条 E2E + 48 条子域单测在默认装配（executor 不可达 → 回退）下继续通过。

4.4 THE Docker_Capability_Bridge SHALL 仅通过**追加可选字段**的方式扩展 `BlueprintCapabilityInvocation.provenance` 与 `BlueprintCapabilityEvidence.provenance`（即 `executionMode` / `error` / `containerId` / `artifactUrl` / `logDigest`）；不得删除、不得重命名现有 provenance 字段，也不得把既有字段改为必填或变更类型。

4.5 IF `BlueprintServiceContext` 显式注入了一个总是抛错或总是返回不可达的 executor 适配器（用于测试场景），THEN THE Docker_Capability_Bridge SHALL 按 Simulated Fallback 路径工作，且不得额外输出 noisy 日志或事件影响既有测试的稳定性。

4.6 THE Docker_Capability_Bridge SHALL 在执行器中途首次失败、但仍在 design 阶段允许的重试窗口内时，允许做有限次数的重试；`provenance.error` 仅在**最终进入 Simulated Fallback** 时被填充，中间成功重试的情况下不得留下噪音 error。

### 需求 5：事件发射语义

**用户故事：** 作为 Artifact Replay、Agent Crew 面板、任务墙面 HUD 等事件流消费者，我希望从事件里既能看到一次沙箱派生是真的跑了 Docker，也能清楚看到 adapter 的变化；同时不想因为 adapter 升级就被迫改订阅代码。

#### 验收标准

5.1 WHEN Docker_Capability_Bridge 开始一次 real 路径调用，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobStarted`（`"sandbox.job.started"`）事件，payload 至少携带当前 `jobId`、`capabilityId === "docker-analysis-sandbox"`、以及当前 adapter 字符串 `"blueprint.runtime.docker.lobster-executor"`。

5.2 WHEN Docker_Capability_Bridge 以 real 路径收到 Lobster Executor 的成功完成回调，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobCompleted`（`"sandbox.job.completed"`）事件。

5.3 WHEN Docker_Capability_Bridge 以 real 路径收到 Lobster Executor 的失败回调且最终进入 Simulated Fallback，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobFailed`（`"sandbox.job.failed"`）事件，payload 至少携带触发失败的摘要 `error` 字符串。

5.4 WHERE 本 spec 需要发出 capability 级别的调用与证据事件，THE Feature SHALL 直接复用 `createRouteGenerationSandboxDerivation()` 外层已经在发的 `BlueprintEventName.CapabilityInvoked`（`"capability.invoked"`）、`BlueprintEventName.CapabilityCompleted`（`"capability.completed"`）、`BlueprintEventName.EvidenceRecorded`（`"evidence.recorded"`）等事件，而不得在子域内另发一套并行事件。

5.5 WHERE design 阶段判断有必要发射沙箱作业中间进度事件（例如长任务心跳），THE Feature MAY 选择不发射；若最终选择发射，必须复用 `BlueprintEventName` 已有的事件名常量，而不得引入新的事件名字符串。

5.6 THE Feature SHALL NOT 在 `server/routes/blueprint/` 目录下以裸字符串字面量（例如 `"sandbox.job.started"`）方式构造事件 `type`；所有事件名必须经过 `BlueprintEventName` 常量命名空间。

5.7 THE Feature SHALL 保证新增事件字段（例如 adapter、`executionMode`、`containerId`）是**可选**字段，既有订阅 `sandbox.*` / `capability.*` / `evidence.*` 事件的消费者不得因字段追加而断言失败。

### 需求 6：BlueprintServiceContext 依赖注入与可测试性

**用户故事：** 作为 Docker 能力桥的单元测试作者，我希望桥的实现完全通过 `BlueprintServiceContext` 拿到执行器能力，这样我既能在没有 Docker 的机器上跑测试，也能在 CI 中注入 fake 适配器模拟 happy / timeout / unreachable 三种场景。

#### 验收标准

6.1 THE Docker_Capability_Bridge SHALL 被组织为一个工厂函数（形如 `createDockerCapabilityBridge(ctx)` 或等价结构），其构造签名只接收 `BlueprintServiceContext`（可能扩展为显式包含 `executorClient` / `executorAdapter` 字段的 Context），而不接收模块级单例依赖；具体签名由 design 阶段确定。

6.2 THE Docker_Capability_Bridge SHALL 通过 `BlueprintServiceContext` 上注入的 executor 适配器（例如 `ctx.executorClient` 或等价字段）获取执行器能力；实现文件内 SHALL NOT 直接 `import` `services/lobster-executor` 的 `DockerRunner` / `MockRunner` / dockerode 单例，也 SHALL NOT 在实现内 `new ExecutorClient(...)` 自己装配执行器。

6.3 THE Feature SHALL 扩展 `BlueprintServiceContext` 以显式暴露 executor 依赖字段（字段具体名称与形态由 design 阶段决定，例如 `executorClient?: ExecutorClient`）；扩展必须保持向后兼容，即既有 `buildBlueprintServiceContext()` 调用在不注入新字段时依然能构造出合法 Context，并走 Simulated Fallback 路径。

6.4 THE Docker_Capability_Bridge SHALL 可以通过 `buildBlueprintServiceContext({ executorClient: fakeClient })` 注入自定义 executor 适配器，从而在端到端测试与子域单测中被替换为：返回固定回调的 fake client、抛 `ExecutorClientError({ kind: "unavailable" })` 的 fake client、或永远不回调以触发 timeout 的 fake client。

6.5 THE Docker_Capability_Bridge SHALL 支持在不实际运行 Docker Daemon、不实际发起 HTTP 请求的前提下完成所有子域单测，只要测试端提供一个满足 Context 的 mock 装配。

### 需求 7：安全策略、资源限制与脱敏

**用户故事：** 作为 `/autopilot` 的安全负责人，我希望 real 路径执行的 Docker 分析沙箱只允许跑受控镜像，资源受限、网络受限，并且用户看不到任何凭证泄漏或主机路径暴露。

#### 验收标准

7.1 THE Docker_Capability_Bridge SHALL 仅允许使用一个明确 allow-list 中的容器镜像（具体镜像清单在 design 阶段确定）；任何不在 allow-list 中的镜像请求 SHALL 被拒绝派发，拒绝情况按需求 4 走 Simulated Fallback。

7.2 THE Docker_Capability_Bridge SHALL 让 real 路径下的容器受到 Lobster Executor 侧 `security-policy.ts` 已有 seccomp / AppArmor / 能力裁剪策略的约束，并显式配置内存上限、CPU 上限与网络策略；具体数值由 design 阶段确定，但 SHALL NOT 小于 Lobster Executor 现有默认策略的限制强度。

7.3 THE Docker_Capability_Bridge SHALL 在任何写入 evidence、invocation logs、事件 payload 之前，让容器 stdout/stderr 经过 `services/lobster-executor` 已有的 `credential-redactor` 脱敏。

7.4 THE Docker_Capability_Bridge SHALL NOT 在面向用户可见的 `BlueprintCapabilityInvocation.outputSummary` / `BlueprintCapabilityInvocation.logs` / `BlueprintCapabilityEvidence.summary` 中包含：容器内原始文件系统绝对路径、宿主机路径、执行器配置环境变量原文、执行器 HMAC 签名密钥、或任何未经脱敏的凭证字符串。

7.5 IF 派发任务触发了安全策略拒绝（例如 allow-list 不通过、seccomp 拒绝、超限被杀），THEN THE Docker_Capability_Bridge SHALL 按需求 4 走 Simulated Fallback，并在 `provenance.error` 中填入**脱敏后**的拒绝原因摘要。

### 需求 8：向后兼容与响应结构稳定性

**用户故事：** 作为已经在消费 `/api/blueprint/jobs` / `/api/blueprint/generations` 响应、或在依赖既有 E2E + 子域单测的团队成员，我希望这次改造对我完全是“可选字段增强、既有字段无感知变化”，而不需要我改客户端或改测试。

#### 验收标准

8.1 THE External_HTTP_Contract SHALL 保持 `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` / `POST /api/executor/events` / `POST /api/executor/jobs` 的 URL、HTTP 方法、请求体结构、以及既有响应体字段完全不变。

8.2 THE Feature SHALL 保持 `server/tests/blueprint-routes.test.ts` 中原有 45 条 E2E 用例与 48 条子域 co-located 单测在默认装配（executor 不可达 → Simulated Fallback）下继续通过，且 SHALL NOT 改写或删除这 93 条用例中的任一条以迁就 real 路径行为。

8.3 THE Feature SHALL 保持 `client/src/lib/blueprint-api/` 目录下 SDK smoke 现有通过状态；real 路径新增的 provenance 字段（`executionMode` / `containerId` / `artifactUrl` / `logDigest`）作为可选字段存在，SDK 侧 normalizer 若需要扩展必须以追加方式实现，不得修改既有 normalizer 的输出语义。

8.4 IF 在实现过程中发现必须修改 `server/tests/blueprint-routes.test.ts` 或任一既有子域单测才能让 real 路径通过，THEN THE Feature SHALL 视该情况为违反本需求，必须调整实现而不是调整测试。

8.5 THE Feature SHALL 保持 Mission Runtime / Workflow Runtime / tasks-store / Office Task Cockpit / GitHub Pages Browser Runtime 的现有 API 与行为不变；GitHub Pages 预览仍按 browser-only 口径说明，不承载本 feature 的 executor 路径。

### 需求 9：测试门槛与不在范围内事项

**用户故事：** 作为代码评审人，我希望在评审阶段就能按照一组明确、可核对的测试清单判断本 spec 是否到位，以及哪些周边改动必须被排除在本 spec 之外。

#### 验收标准

9.1 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 中至少新增 2 条 E2E 用例：
  - **(a) Real-Docker mock path**：通过 `buildBlueprintServiceContext({ executorClient: fakeClient })` 注入返回真实 shape 回调的 fake ExecutorClient，断言响应的 `docker-analysis-sandbox` invocation 满足 `adapter !== "blueprint.runtime.docker.simulated"`（建议断言等于 `"blueprint.runtime.docker.lobster-executor"`）、`durationMs !== 180 + index * 30`、`provenance.executionMode === "real"`；
  - **(b) Fallback path**：注入总是抛 `ExecutorClientError({ kind: "unavailable" })` 的 fake ExecutorClient，断言响应的 `docker-analysis-sandbox` invocation 走 Simulated Fallback，`provenance.executionMode === "simulated_fallback"`、`provenance.error` 被填充，且 invocation / evidence 外层字段形态与 simulated 产出等价。

9.2 THE Feature SHALL 在 Docker Capability Bridge 实现文件所在目录新增至少 3 条 co-located 单元测试：happy path（fake client 返回成功回调）、timeout（fake client 永远不回调直到上限超时）、unreachable（fake client 抛 `ExecutorClientError({ kind: "unavailable" })`）。

9.3 THE Feature SHALL NOT 引入 property-based test（PBT）；本 spec 的验收完全以 example-based test 为准。

9.4 THE Feature SHALL NOT 改动 `server/tests/blueprint-routes.test.ts` 中原有 45 条 E2E 用例、48 条子域 co-located 单测、SDK smoke 中任一既有断言；本 spec 只以新增方式补测试。

9.5 THE Feature SHALL NOT 引入 UI 改动作为验收条件；`executionMode` 是否在 `/autopilot` 或任务墙面 HUD 上可见，属于可选增强，若在实现阶段自然可落（以可选 UI 字段形式）可顺带追加，否则留给后续 UI spec 处理。

9.6 THE Feature SHALL NOT 引入 Web-AIGC runtime main line、task-autopilot Phase 1 本 spec 之外的运行时 / 治理 / observability 主线改动作为验收条件；这些主线由各自 steering 推进，本 spec 只保证不引入新的倒退。
