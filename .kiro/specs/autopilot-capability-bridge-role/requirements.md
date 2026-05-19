# 需求文档：Autopilot Capability Bridge — Role System Architecture

## 简介

`/autopilot` 的 11 节点叙事（`docs/autopilot-target-experience-architecture-2026-05-07.svg`）要求：**澄清之后的每个阶段都应由真实能力网络驱动，沙箱派生应输出真实证据**。前序 spec `autopilot-routeset-llm-generation`（`.kiro/specs/autopilot-routeset-llm-generation/requirements.md`，见其 需求 1.3 / 9.4）在明确把 RouteSet 升级为 LLM 驱动的同时，**明确把“沙箱派生本身变成真实能力调用”这件事留给独立的 capability-bridge feature**——本 spec 就是那 4 个独立 capability-bridge feature 中的**第 4 块也是最后一块**：`role-system-architecture` 角色架构能力桥，与姊妹 spec `autopilot-capability-bridge-docker`（`.kiro/specs/autopilot-capability-bridge-docker/requirements.md`）、`autopilot-capability-bridge-mcp`（`.kiro/specs/autopilot-capability-bridge-mcp/requirements.md`）、`autopilot-capability-bridge-aigc-node`（`.kiro/specs/autopilot-capability-bridge-aigc-node/requirements.md`）并行推进、共享同一套 scope-boundary / Simulated Fallback / `executionMode` / `BlueprintServiceContext` DI / `credential-redactor` / adapter 字符串不含 `.simulated` 子串 / 复用既有 `BlueprintEventName` / R9 测试门槛的收口模式。

当前 `server/routes/blueprint.ts` 第 **2866-3200** 行的 `createRouteGenerationSandboxDerivation()` 对 `role-system-architecture` 与其它 3 个 capability 产出的都是模板化结果：

- `adapter: "blueprint.runtime.role.simulated"` 或等价 `.simulated` 字面量（第 ~3372 行 `getDefaultRuntimeCapabilities()` 声明，该 capability 的 `kind: "role"`）
- `durationMs = 180 + index * 30`（确定性公式 `deterministicCapabilityDuration()`）
- `outputSummary` 由 `buildCapabilityOutputSummary()` 按模板字符串拼装
- `logs` 由 `buildCapabilityInvocationLogs()` 硬编码生成
- 没有任何 LLM 调用、没有任何角色架构推理、也没有针对当前 RouteSet steps / stages 的结构化分析

`role-system-architecture` 的产品语义与姊妹 `aigc-spec-node` 能力**明显不同**：`aigc-spec-node` 做的是 spec-shape 领域推理（识别领域子系统、数据流、风险注记），回答“当前目标涉及哪些领域子系统”；`role-system-architecture` 做的是**角色架构推理**，回答“完成当前 RouteSet 需要组建什么样的 Agent 角色车队、每个角色在哪些阶段活跃、负责什么职责、拥有什么权限”。根据架构 SVG，该能力应识别并勾勒出诸如 Planner / Clarifier / Researcher / Generator / Reviewer / Auditor / Operator 等角色（与 `shared/blueprint/contracts.ts` 中 `BlueprintAgentRole[]` 的 9 角色分类体系对齐），描述它们的职责、协作模式、在 RouteSet 各阶段的 activation 状态（active / watching / reviewing / sleeping）以及权限边界。

这份结构化角色架构证据**不仅仅是给当前沙箱派生展示用**——它还将成为**下一个独立 sibling spec `autopilot-agent-crew-stage-activation`（后续创建）的直接输入**：该后续 spec 将消费本桥产出的角色架构 JSON，驱动 `/autopilot` Agent Crew 面板的真实按阶段角色激活事件（而非当前的模板化 role timeline）。因此本 spec 的 evidence 必须**可被下游子系统通过 `jobId` / `routeSetId` / `primaryRouteId` 从 evidence store 可靠检索到**，而不只是打印到日志。这条"evidence → 下游消费"路径是本 spec 与姊妹 aigc-node spec 最本质的语义差异。

仓库里已经存在一套成熟的 LLM 主线接线：前序 spec `autopilot-routeset-llm-generation`（D1 需求 2）已经把 RouteSet 生成升级为 `ctx.llm.callJson` + zod 严格 schema + fallback + `generationSource` 的主线模式；`server/routes/blueprint/context.ts` 的 `BlueprintServiceContext` 已经暴露 `ctx.llm.callJson` 与 `ctx.llm.getConfig`（在 `buildBlueprintServiceContext()` 内已有默认装配），`server/routes/blueprint.ts` ~13102 行的 clarification questions 生成链路也是同一模式。本桥直接复用同一条 `ctx.llm.callJson` 原语，但换一份**不同的 prompt** 和**不同的 response schema**，以匹配本 capability 在产品叙事中"角色架构规划"的角色。

本 spec 做的事非常聚焦：**只把 `role-system-architecture` 这一个 capability 在沙箱派生管线中的调用，从模板化升级为通过 `BlueprintServiceContext.llm.callJson` 发起的一次真实角色架构推理，产出结构化的角色声明 JSON 证据，并让它能被 `jobId` / `routeSetId` / `primaryRouteId` 作为 key 在 evidence store 中稳定回取，以便下游 `autopilot-agent-crew-stage-activation` spec 直接消费**。其它 3 个 capability 的真实化由姊妹 spec 推进；`buildRouteSet()` 本身、SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 也由各自独立 spec 推进；`autopilot-agent-crew-stage-activation` 作为下游消费方由其自己的 spec 推进，本 spec 只保证把结构化角色 JSON 以可被 key-by-jobId 检索的方式写入 evidence，不负责实现 stage activation 的驱动逻辑；`createRouteGenerationSandboxDerivation()` 外层 orchestration 不在本 spec 范围内，只把其中一个 capability 的 adapter 实现替换掉。

当 LLM 不可用（`apiKey` 缺失 / 未注入 / `callJson` 抛错 / 响应非 JSON / schema 校验失败 / 上限超时）时，本 feature 必须**无缝回退到今天的模板化调用**，保证既有 `server/tests/blueprint-routes.test.ts` 中 47 条 E2E 与 48 条子域单测在默认测试装配下（LLM 未 mock → 回退）继续通过。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **Role System Architecture Capability Bridge / 角色架构能力桥**：本 spec 引入的新组件，负责把 `role-system-architecture` 能力的一次调用转成一次真实 LLM 驱动的角色架构推理；通过 `BlueprintServiceContext` 注入依赖，`createRouteGenerationSandboxDerivation()` 在命中该 capability 时会调它替换模板化 invocation。建议的工厂函数命名为 `createRoleSystemArchitectureCapabilityBridge(ctx)` 或 `createRoleArchitectureCapabilityBridge(ctx)`，具体命名由 design 阶段确定。
- **`ctx.llm.callJson`**：`server/routes/blueprint/context.ts` 中 `BlueprintServiceContext.llm.callJson` 已暴露的 LLM 调用原语，封装了 `callLLMJson` 的底层能力。本桥复用这一原语，不得在实现内 `import { callLLMJson } from "../../core/llm-client.js"`。
- **`ctx.llm.getConfig`**：`BlueprintServiceContext.llm.getConfig` 已暴露的 LLM 配置访问器（封装 `getAIConfig()`）；本桥通过它获取当前 `model` 等配置，不得在实现内硬编码模型名或 `import { getAIConfig } from "../../core/ai-config.js"`。
- **Prompt ID / `promptId`**：本 spec 为 Role Architecture LLM prompt 分配的稳定字符串标识（建议 `blueprint.role-architecture.v1`，具体命名由 design 阶段确定），用于 provenance 追溯 prompt 版本。
- **Structured Role Architecture Payload / 结构化角色架构载荷**：本桥从 LLM 响应中解析并经 zod 严格校验得到的结构化 JSON 对象，用于描述完成当前 RouteSet 所需的角色车队。至少包含 `roles: Array<{ id: string, label: string, responsibilities: string[], activationStages: string[], permissions?: string[] }>`，其中 `roles` 数组长度约束 `.min(1).max(9)`（与 `shared/blueprint/contracts.ts` 中 `BlueprintAgentRole[]` 的 9 角色分类体系对齐），其余嵌套字段的详细 `.min()` / `.max()` / 枚举约束由 design 阶段确定。该 payload 应尽可能向现有 `BlueprintAgentRole` / `BlueprintRolePresence` 类型形态靠拢，以便下游 `autopilot-agent-crew-stage-activation` spec 能以最小转换成本消费，但本 spec **不要求**也**不应该**修改 `BlueprintAgentRole` / `BlueprintRolePresence` 类型定义本身。
- **Real 执行 / Real Execution**：在本 spec 中等价于"本桥成功通过 `ctx.llm.callJson` 发起一次 LLM 调用、收到响应、完成 zod 严格 schema 校验并得到合法的 Structured Role Architecture Payload"。
- **Simulated Fallback / 模拟回退**：LLM 不可用 / `apiKey` 缺失 / `callJson` 抛错 / 响应非 JSON / schema 校验失败 / 上限超时时，本桥回退到今天 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 的模板化产出，结构与今天 simulated invocation 字段形态等价。
- **`adapter` 字符串**：`BlueprintRuntimeCapability.adapter` 字段。本 spec 把 real 执行路径下 `role-system-architecture` 的 adapter 从含 `.simulated` 子串的字符串升级为 `"blueprint.runtime.role.llm"`（或 design 阶段选定的等价命名，例如 `"blueprint.runtime.role.architecture.llm"`）；real 路径下 adapter **不得**含子串 `.simulated`；回退路径下保留或沿用现有 simulated 命名，并通过 `executionMode` 区分。
- **`executionMode`**：本 spec 在 `BlueprintCapabilityInvocation.provenance` 与 `BlueprintCapabilityEvidence.provenance` 中新增的**可选**字段，取值 `"real"` 或 `"simulated_fallback"`；real 路径下可附带 `promptId` / `model` / `responseDigest` / `tokenCount` / `structuredRolesDigest` 等可选溯源字段，fallback 路径下必须附带 `error?: string` 说明回退原因。语义与姊妹 Docker / MCP / AIGC-node spec 的 `executionMode` 字段一致，只是取值内容与溯源字段命名不同。
- **Redacted logs / 脱敏日志**：本桥在写入 `BlueprintCapabilityInvocation.logs` 之前，必须复用 `credential-redactor`（同姊妹 spec 使用的 `services/lobster-executor` 已有实现，或其在 `server/` 侧的等价实现）对 prompt 指纹、响应摘要、模型标识与（若 design 选择记录）token 计数等做脱敏；原始 prompt 全文、原始 LLM 响应体、API Key、Authorization 头、内部密钥等不得进入 evidence、invocation logs、事件 payload 或面向用户响应。
- **Strict zod schema / 严格 zod 校验**：本桥对 LLM 响应执行的 zod schema 校验，采用与前序 spec `autopilot-routeset-llm-generation` 需求 D1 同一模式；至少对 `roles` 数组、每个 role 的 `id` / `label` / `responsibilities` / `activationStages` / `permissions` 字段做 `.min()` / `.max()` 数组长度与字符串长度约束；未知多余字段被 zod 默认行为静默丢弃，不得通过额外 normalize / coerce 将非法结构"救活"为合法结构。
- **Sandbox Derivation Pipeline / 沙箱派生管线**：`createRouteGenerationSandboxDerivation()` 生成 capability invocations / evidence / role events / `sandbox.job.*` 事件的这条管线。本 spec 只替换其中 `role-system-architecture` 一项的 adapter 实现，管线外层编排保持不变。
- **External HTTP Contract / 外部 HTTP 契约**：`POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 的请求与响应结构；以 `server/tests/blueprint-routes.test.ts` 中 47 条 E2E 用例锁定的行为为准。
- **Subdomain Tests / 子域单测**：`server/routes/blueprint/*/service.test.ts` 等 co-located 子域单元测试共 48 条。
- **`BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence`**：`shared/blueprint/contracts.ts` 中定义的 capability 调用记录与证据记录类型；本 spec 只允许以**追加可选字段**方式扩展它们的 `provenance`，不得修改既有字段。结构化角色架构 JSON 的承载方式由 design 阶段决定：要么作为 `BlueprintCapabilityEvidence.provenance.structuredRoles`（或等价可选字段）附加，要么产出一条独立的 `BlueprintCapabilityEvidence` 条目专门承载该 JSON。
- **`BlueprintAgentRole` / `BlueprintRolePresence`**：`shared/blueprint/contracts.ts` 中已定义的角色与角色存在态类型（见需求 3 术语表注解）。本 spec 的结构化角色架构载荷形态应**尽可能靠拢**这两个类型，以便下游 `autopilot-agent-crew-stage-activation` spec 能以最小转换成本消费，但本 spec **不得**修改这两个类型本身。
- **`BlueprintEventName`**：`shared/blueprint/events.ts` 导出的事件名常量命名空间，含 `SandboxJobStarted` / `SandboxJobCompleted` / `SandboxJobFailed` / `CapabilityInvoked` / `CapabilityCompleted` / `CapabilityFailed` / `EvidenceRecorded` 等。本 spec 不新增事件名，只复用现有常量。
- **Evidence Key / 证据检索键**：用于下游子系统（首先是后续 spec `autopilot-agent-crew-stage-activation`）通过 `jobId` / `routeSetId` / `primaryRouteId` 等稳定标识从 evidence store 回取本桥写入的结构化角色 JSON 的一组语义化键。具体键名由 design 阶段确定，但"以 `jobId` / `routeSetId` / `primaryRouteId` 为 key 可检索"这一性质不可省略。
- **Downstream Consumer Spec / 下游消费方 spec**：本 spec 产出的结构化角色 JSON 的主要消费方 spec，即后续独立 spec `autopilot-agent-crew-stage-activation`（后续创建），它将消费本桥的 evidence 驱动真实按阶段角色激活事件。本 spec 只保证 evidence 的写入与可检索性，不实现该消费方的驱动逻辑。

## 需求

### 需求 1：范围边界与独立性

**用户故事：** 作为 `/autopilot` 主线的维护者，我希望本 spec 有一条狭窄且可审核的范围边界，使它既能真正把 `role-system-architecture` 推进为真实 LLM 驱动的角色架构推理、又能为下游 `autopilot-agent-crew-stage-activation` 提供可检索的结构化角色 JSON 证据，又不会踩到其它 spec 的地盘、也不会被迫捆绑其它 3 个 capability 的改造。

#### 验收标准

1.1 THE Feature_Scope SHALL 覆盖并且仅覆盖 `createRouteGenerationSandboxDerivation()` 中 `role-system-architecture` 这一个 capability 的 invocation / evidence 产出路径，将其从模板化升级为通过 `BlueprintServiceContext.llm.callJson` 发起的真实 LLM 角色架构推理调用，并在不可用时回退到今天的模板化产出。

1.2 THE Feature_Scope SHALL NOT 修改 `docker-analysis-sandbox` 能力调用的产出路径；该项由姊妹 spec `autopilot-capability-bridge-docker` 推进。

1.3 THE Feature_Scope SHALL NOT 修改 `mcp-github-source` 能力调用的产出路径；该项由姊妹 spec `autopilot-capability-bridge-mcp` 推进。

1.4 THE Feature_Scope SHALL NOT 修改 `aigc-spec-node` 能力调用的产出路径；该项由姊妹 spec `autopilot-capability-bridge-aigc-node` 推进。

1.5 THE Feature_Scope SHALL NOT 修改 `buildRouteSet()` 本身的候选路线推导逻辑；该项由前序 spec `autopilot-routeset-llm-generation` 推进。

1.6 THE Feature_Scope SHALL NOT 修改 SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 任一阶段的生成路径；这些由各自独立 spec 推进。

1.7 THE Feature_Scope SHALL NOT 修改 `createRouteGenerationSandboxDerivation()` 外层对 capability 的选择、排序、evidence aggregation、role timeline、`sandbox.job.*` 事件总编排逻辑；本 spec 只替换其中一个 capability 的 adapter 实现。

1.8 THE Feature_Scope SHALL NOT 实现下游 `autopilot-agent-crew-stage-activation` spec 的驱动逻辑（即按阶段 role activation 事件的实际产生、面板订阅、timeline 渲染等）；本 spec 只负责把结构化角色 JSON 以可检索方式写入 evidence，**不**负责让它驱动任何 Agent Crew 面板 UI 行为。

1.9 THE Feature_Scope SHALL NOT 修改 `shared/blueprint/contracts.ts` 中 `BlueprintAgentRole` / `BlueprintRolePresence` 类型定义本身；本 spec 的结构化角色 JSON 可以在字段形态上向这两类类型靠拢，但不得添加、删除、重命名或修改它们的字段。

1.10 THE Feature_Scope SHALL NOT 引入任何新的外部 HTTP 契约（新 route、新请求体字段、新响应字段）；已有 `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` 保持不变。

1.11 THE Feature_Scope SHALL NOT 修改或删除 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例、48 条子域 co-located 单测或 SDK smoke 任一既有断言；本 spec 只新增用例，不改写既有用例。

1.12 THE Feature_Scope SHALL NOT 引入 Browser Runtime / GitHub Pages 相关改动；GitHub Pages 纯浏览器路径不承载服务端 LLM 调用，不得从浏览器侧发起本桥的 LLM 请求（见 `.kiro/steering/2026-04-15-runtime-current-state.md`）。

1.13 THE Feature_Scope SHALL NOT 要求 LLM 必须可用作为产品功能的前置条件；LLM 可选，不可用时按需求 5 走 Simulated Fallback。

### 需求 2：通过 `ctx.llm.callJson` 发起真实 LLM 角色架构推理

**用户故事：** 作为审阅 `/autopilot` 沙箱证据的用户，以及作为未来 Agent Crew 面板的设计者，我希望看到的 Role System Architecture invocation 真的基于当前目标、澄清答案与 RouteSet 各阶段 steps 做了一次结构化角色架构推理，能明确识别出哪些角色在哪些阶段做什么事，而不是永远由字符串模板拼出来的摘要。

#### 验收标准

2.1 WHEN 沙箱派生管线在 `createRouteGenerationSandboxDerivation()` 内命中 `role-system-architecture` capability，THE Role_Architecture_Capability_Bridge SHALL 通过 `BlueprintServiceContext.llm.callJson` 发起一次真实 LLM 调用，输入 prompt 由 `BlueprintGenerationRequest.targetText`、`clarificationSession.answers` 摘要、**所选主路线（primary route）的 steps / stages 摘要**、以及（若 design 选择纳入）`projectContext` 中的可选领域上下文确定性拼装而成，而不是调用 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 生成模板化结果。

2.2 THE Role_Architecture_Capability_Bridge SHALL 在 prompt 中明确要求 LLM 对当前 RouteSet 产出**结构化的角色声明**，回答"完成这条路线需要组建哪些 Agent 角色车队、每个角色在哪些 stage 活跃、各自负责什么职责、拥有什么权限"，而不是一段开放式自然语言描述。

2.3 THE Role_Architecture_Capability_Bridge SHALL 为本 capability 分配一个稳定的 prompt 标识（建议 `blueprint.role-architecture.v1`，具体命名由 design 阶段确定），并在 real 路径的 provenance 中以 `promptId` 字段记录该标识，用于 prompt 版本回溯。

2.4 THE Role_Architecture_Capability_Bridge SHALL 通过 `ctx.llm.getConfig()` 读取当前 LLM 配置中的 `model`（以及 design 阶段认为需要的其它配置项），并在 real 路径的 provenance 中以 `model` 字段记录实际生效的模型标识；实现文件内 SHALL NOT 硬编码任何模型名、provider 名、temperature 默认值等 LLM 参数。

2.5 THE Role_Architecture_Capability_Bridge SHALL 为单次 LLM 调用设置一个明确的上限超时，该上限取值不大于 30 秒（具体数值在 design 阶段确定），超时到达仍未收到合法 JSON 响应时触发需求 5 的 Simulated Fallback 路径。

2.6 THE Role_Architecture_Capability_Bridge SHALL 根据 `clarificationSession.locale` 选择 prompt 语言：当 `locale === "zh-CN"` 时使用中文 prompt；其余情况使用英文 prompt。该行为与前序 spec `autopilot-routeset-llm-generation` 的 locale-aware prompt 策略保持一致。

2.7 THE Role_Architecture_Capability_Bridge SHALL 在尚未从 LLM 拿到终态结果、或尚未完成 zod schema 校验之前，不得向 `createRouteGenerationSandboxDerivation()` 外层返回 real 路径的最终 `BlueprintCapabilityInvocation`；未到终态期间必须保持作业仍在运行中或已按需求 5 回退。

2.8 THE Role_Architecture_Capability_Bridge SHALL 保证发送给 LLM 的 prompt 载荷只包含当前 `BlueprintGenerationRequest` 已有的 intake / clarification / primary route steps / domain-context 内容，不得注入与当前请求无关的静态示例、外部机密或调试占位字符串。

### 需求 3：严格 zod schema 校验与结构化角色架构载荷

**用户故事：** 作为下游 `autopilot-agent-crew-stage-activation` spec 的消费方，以及作为 Artifact Replay、Agent Crew 面板的消费者，我希望能放心地消费 Role System Architecture 节点的结构化输出，知道它要么是合法的、形态与 `BlueprintAgentRole[]` 对齐的结构化 payload、要么显式走了 fallback；不希望它偷偷用一份无效 JSON 伪装成合法响应。

#### 验收标准

3.1 THE Role_Architecture_Capability_Bridge SHALL 定义并使用一份严格 zod schema 对 LLM 响应进行校验，该 schema 的最小字段集至少包含：
  - `roles: Array<{ id: string, label: string, responsibilities: string[], activationStages: string[], permissions?: string[] }>`，其中：
    - `roles` 数组长度约束 `.min(1).max(9)`（与 `shared/blueprint/contracts.ts` 中 `BlueprintAgentRole[]` 的 9 角色分类体系对齐）；
    - `id` 字符串约束 `.min(1).max(64)`，且在同一响应的 `roles` 内唯一；
    - `label` 字符串约束 `.min(1).max(80)`；
    - `responsibilities` 数组长度约束 `.min(1).max(10)`，每条元素 `.min(1).max(200)`；
    - `activationStages` 数组长度约束 `.min(1).max(10)`，每条元素为非空字符串 `.min(1).max(64)`；
    - `permissions` 可选数组，长度约束 `.min(0).max(10)`，每条元素 `.min(1).max(120)`；
  - design 阶段选定的其它补充字段（例如 `collaborationNotes: string[]` / `handoffMatrix: Record<string, string[]>`），每一项都必须附带显式 `.min()` / `.max()` / 枚举约束，而不得接受无界字符串或无界数组。

3.2 THE Role_Architecture_Capability_Bridge SHALL 在 schema 校验失败（字段缺失、类型不符、长度越界、枚举不匹配、`id` 重复）时，直接进入需求 5 的 Simulated Fallback 路径，而不得对响应执行 coerce / normalize / 自动补全默认值以将非法结构"救活"为合法结构。

3.3 THE Role_Architecture_Capability_Bridge SHALL 依赖 zod 的默认行为静默丢弃响应中的未知多余字段，既不报错，也不把这些字段透传到 evidence / invocation 的对外可见字段中。

3.4 THE Role_Architecture_Capability_Bridge SHALL 复用前序 spec `autopilot-routeset-llm-generation` 需求 D1 所确立的"strict schema + fallback on validation failure"模式；若本 feature 与 routeset LLM 子域、aigc-node 桥子域存在共享 zod schema 工具模块，design 阶段可以自行决定是否抽取，但本需求只约束行为一致性。

3.5 THE Role_Architecture_Capability_Bridge SHALL 将通过 schema 校验的结构化角色架构 payload 视为**一类一等 capability 证据**，并在 real 路径下将其要么附加为 `BlueprintCapabilityEvidence.provenance.structuredRoles`（或 design 阶段选定的等价可选字段），要么产出一条独立的 `BlueprintCapabilityEvidence` 条目专门承载结构化角色 JSON；具体承载方式由 design 阶段决定，但承载本身不可省略，并且必须满足需求 4 中关于可被 `jobId` / `routeSetId` / `primaryRouteId` 检索的要求。

3.6 THE Role_Architecture_Capability_Bridge SHALL 使结构化角色架构 payload 的字段形态**尽可能向 `shared/blueprint/contracts.ts` 中 `BlueprintAgentRole` / `BlueprintRolePresence` 类型靠拢**（例如 role `id` 命名风格、`activationStages` 与 `BlueprintGenerationStage` 的语义对齐、`permissions` 的粒度），以便下游 `autopilot-agent-crew-stage-activation` spec 能以最小转换成本消费该 JSON；但本 spec **不得**修改 `BlueprintAgentRole` / `BlueprintRolePresence` 类型定义本身。

### 需求 4：真实 Invocation 与 Evidence 字段来源（含下游可检索性）

**用户故事：** 作为依赖 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 做 Artifact Replay、Agent Crew 展示与运维分析的消费者，以及作为下游 `autopilot-agent-crew-stage-activation` spec 的实现者，我希望这些记录在 real 路径下的每个关键字段都能指回一次真实的 LLM 角色架构推理，而不是算法生成的常量；我也希望结构化角色 JSON 能被我通过 `jobId` / `routeSetId` / `primaryRouteId` 稳定地回取到，而不是只能在控制台日志里翻一遍。

#### 验收标准

4.1 WHEN Role_Architecture_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.durationMs` SHALL 等于从 `ctx.llm.callJson` 发起、到其返回（或超时）为止的墙钟时间（毫秒），而不得由 `deterministicCapabilityDuration()` 这类确定性公式产出。

4.2 WHEN Role_Architecture_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.logs` SHALL 由真实调用轨迹派生，至少包含（以脱敏摘要形式）prompt 指纹、响应摘要、`model` 标识、以及（design 选择记录且 LLM 响应可用时的）token 计数；按 design 阶段决定的上限（建议上限为 ~50 行或 ~10KB，最终数值在 design 确定）截断；该字段 SHALL NOT 由 `buildCapabilityInvocationLogs()` 模板拼出。

4.3 WHEN Role_Architecture_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.outputSummary` SHALL 从结构化角色架构 payload 派生而成（例如形如 `"proposed {N} roles across {K} stages"` 或 `"组建 {N} 个角色，覆盖 {K} 个阶段"`），不得由 `buildCapabilityOutputSummary()` 模板字符串生成。

4.4 WHEN Role_Architecture_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation` 对应的 `BlueprintRuntimeCapability.adapter` SHALL 等于 design 阶段选定的 real adapter 字符串（建议为 `"blueprint.runtime.role.llm"` 或 `"blueprint.runtime.role.architecture.llm"`）；real 路径下 adapter SHALL NOT 含子串 `.simulated`。

4.5 WHEN Role_Architecture_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityEvidence.summary` SHALL 由结构化角色架构 payload 派生而成，并通过需求 3.5 选定的承载方式（`provenance.structuredRoles` 可选字段 **或** 独立 evidence 条目）提供对结构化角色 JSON 的可追溯引用；这些追加内容作为可选字段 / 可选条目存在，不得破坏既有 evidence 消费方。

4.6 THE Role_Architecture_Capability_Bridge SHALL 使结构化角色架构 JSON 以一种可被下游子系统（首先是后续 spec `autopilot-agent-crew-stage-activation`）通过 `jobId`、`routeSetId` 与 `primaryRouteId`（或 design 阶段选定的语义等价键集合）作为 key 从 evidence store 稳定检索到的方式写入（而不仅仅是打印到日志）；具体检索键的命名、是否归一化到单一 `evidenceId` 索引、是否写入额外的关联索引，由 design 阶段决定，但"以 `jobId` / `routeSetId` / `primaryRouteId` 为 key 可检索"这一性质不可省略。

4.7 WHEN Role_Architecture_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.logs` 与 `BlueprintCapabilityEvidence.summary` SHALL 在持久化之前已经过 `credential-redactor` 脱敏；**任何 API Key、Authorization 头、内部密钥、原始 prompt 全文、原始 LLM 响应体** SHALL NOT 出现在 evidence、invocation logs、事件 payload 或面向用户的响应中。

4.8 THE Role_Architecture_Capability_Bridge SHALL 保持 real 路径产出的 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 外层字段形态（`id` / `jobId` / `capabilityId` / `capabilityLabel` / `kind` / `status` / `securityLevel` / `safetyGate` / `routeId` / `input` / `evidenceIds` 等）与今天 simulated 路径对外可见的形态等价，以便既有 47 条 E2E + 48 条子域单测中不断言新字段的用例不会失败。

### 需求 5：LLM 不可用时的 Simulated Fallback

**用户故事：** 作为在本机没有配置 LLM API Key、或在默认测试装配下运行 CI 的工程师，我希望沙箱派生照样能在不依赖 LLM 的情况下跑完，并在结果里清楚标注这次是回退产物而不是真实执行。

#### 验收标准

5.1 IF 以下任一条件成立：
  - `BlueprintServiceContext.llm.callJson` 未注入、返回 `undefined`、或被 mock 成永远抛错；
  - 当前 LLM 配置缺少可用 `apiKey`；
  - `callJson` 抛出任意异常；
  - LLM 响应不是合法 JSON；
  - 响应 JSON 未通过需求 3.1 定义的严格 zod schema 校验；
  - 单次调用超过需求 2.5 定义的上限超时；
  THEN THE Role_Architecture_Capability_Bridge SHALL 回退到今天的模板化 invocation 产出路径（沿用 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()`）。

5.2 WHEN Role_Architecture_Capability_Bridge 走 Simulated Fallback 路径，THE `BlueprintCapabilityInvocation.provenance` SHALL 新增可选字段 `executionMode === "simulated_fallback"` 与 `error: string`（填入触发回退的**脱敏后**原因摘要，例如 `"llm apiKey missing"` / `"llm callJson threw"` / `"non-json response"` / `"schema validation failed"` / `"llm timeout"`）；real 路径下则 SHALL 新增可选字段 `executionMode === "real"`，可附带 `promptId` / `model` / `responseDigest` / `tokenCount` / `structuredRolesDigest` 等可选溯源字段。

5.3 WHEN Role_Architecture_Capability_Bridge 走 Simulated Fallback 路径，THE `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 的既有外层字段形态 SHALL 与今天 simulated 产出等价，使既有 47 条 E2E + 48 条子域单测在默认装配（LLM 未 mock → 回退）下继续通过。

5.4 THE Role_Architecture_Capability_Bridge SHALL 仅通过**追加可选字段**的方式扩展 `BlueprintCapabilityInvocation.provenance` 与 `BlueprintCapabilityEvidence.provenance`（即 `executionMode` / `error` / `promptId` / `model` / `responseDigest` / `tokenCount` / `structuredRolesDigest` 及需求 3.5 选定的结构化角色 payload 承载字段）；不得删除、不得重命名现有 provenance 字段，也不得把既有字段改为必填或变更类型。

5.5 IF `BlueprintServiceContext` 显式注入了一个总是抛错的 `callJson`、或总是返回无效 JSON 的 `callJson`（用于测试场景），THEN THE Role_Architecture_Capability_Bridge SHALL 按 Simulated Fallback 路径工作，且不得额外输出 noisy 日志或事件影响既有测试的稳定性。

5.6 THE Role_Architecture_Capability_Bridge SHALL 在中途首次失败、但仍在 design 阶段允许的重试窗口内时，允许做有限次数的重试；`provenance.error` 仅在**最终进入 Simulated Fallback** 时被填充，中间成功重试的情况下不得留下噪音 error。

### 需求 6：事件发射语义

**用户故事：** 作为 Artifact Replay、Agent Crew 面板、任务墙面 HUD 等事件流消费者，我希望从事件里既能看到一次沙箱派生是真的发起了 LLM 角色架构推理，也能清楚看到 adapter 的变化；同时不想因为 adapter 升级就被迫改订阅代码。

#### 验收标准

6.1 WHEN Role_Architecture_Capability_Bridge 开始一次 real 路径调用，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobStarted`（`"sandbox.job.started"`）事件，payload 可选携带当前 `jobId`、`capabilityId === "role-system-architecture"`、当前 adapter 字符串（建议 `"blueprint.runtime.role.llm"`）、`executionMode === "real"`、以及可选的 `promptId` / `model`。

6.2 WHEN Role_Architecture_Capability_Bridge 以 real 路径收到 LLM 合法响应并通过 zod schema 校验，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobCompleted`（`"sandbox.job.completed"`）事件，payload 可选携带 `roleCount`（即本次响应中 `roles.length`）。

6.3 WHEN Role_Architecture_Capability_Bridge 以 real 路径遭遇失败且最终进入 Simulated Fallback，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobFailed`（`"sandbox.job.failed"`）事件，payload 至少携带触发失败的**脱敏后** `error` 字符串摘要。

6.4 WHERE 本 spec 需要发出 capability 级别的调用与证据事件，THE Feature SHALL 直接复用 `createRouteGenerationSandboxDerivation()` 外层已经在发的 `BlueprintEventName.CapabilityInvoked`（`"capability.invoked"`）、`BlueprintEventName.CapabilityCompleted`（`"capability.completed"`）、`BlueprintEventName.EvidenceRecorded`（`"evidence.recorded"`）等事件，而不得在子域内另发一套并行事件。

6.5 WHERE design 阶段判断有必要发射 real 调用的中间进度事件（例如 LLM 长调用心跳），THE Feature MAY 选择不发射；若最终选择发射，必须复用 `BlueprintEventName` 已有的事件名常量，而不得引入新的事件名字符串。

6.6 THE Feature SHALL NOT 在 `server/routes/blueprint/` 目录下以裸字符串字面量（例如 `"sandbox.job.started"`）方式构造事件 `type`；所有事件名必须经过 `BlueprintEventName` 常量命名空间。

6.7 THE Feature SHALL 保证事件 payload 中新增字段（例如 `adapter` / `executionMode` / `promptId` / `model` / `roleCount`）是**可选**字段，既有订阅 `sandbox.*` / `capability.*` / `evidence.*` 事件的消费者不得因字段追加而断言失败。

### 需求 7：`BlueprintServiceContext` 依赖注入与可测试性

**用户故事：** 作为角色架构能力桥的单元测试作者，我希望桥的实现完全通过 `BlueprintServiceContext` 拿到 LLM 能力与 evidence store 访问能力，这样我既能在没有 LLM API Key 的机器上跑测试，也能在 CI 中注入 fake 适配器模拟 happy / malformed-json / schema-fail / missing-apiKey 四种场景，并能验证结构化角色 JSON 确实被以 `jobId` / `routeSetId` / `primaryRouteId` 为 key 写入了 evidence。

#### 验收标准

7.1 THE Role_Architecture_Capability_Bridge SHALL 被组织为一个工厂函数（建议 `createRoleSystemArchitectureCapabilityBridge(ctx)` 或 `createRoleArchitectureCapabilityBridge(ctx)`，具体命名由 design 阶段确定），其构造签名只接收 `BlueprintServiceContext`，而不接收模块级单例依赖。

7.2 THE Role_Architecture_Capability_Bridge SHALL 通过 `BlueprintServiceContext.llm.callJson` 与 `BlueprintServiceContext.llm.getConfig` 获取 LLM 能力；实现文件内 SHALL NOT 直接 `import` `callLLMJson` / `getAIConfig` 的模块级实现，也 SHALL NOT 调用模块级 `fetch()` 或绕过 Context 自行装配 LLM 客户端。

7.3 THE Role_Architecture_Capability_Bridge SHALL 通过 `BlueprintServiceContext` 已经暴露的 logger / evidence store 访问能力（具体接入点由 design 阶段确定，但必须落在 Context 内）实现结构化角色 JSON 的可检索写入，而不得在实现内 `import` 模块级 evidence store 单例或 `import` 文件系统 / 数据库客户端。

7.4 THE Role_Architecture_Capability_Bridge SHALL 可以通过 `buildBlueprintServiceContext({ llm: { callJson, getConfig } })` 注入自定义 LLM 适配器，从而在端到端测试与子域单测中被替换为：返回合法 structured role payload 的 fake `callJson`、返回非 JSON 字符串的 fake `callJson`、返回合法 JSON 但违反 schema 的 fake `callJson`、永远抛错的 fake `callJson`、或 `getConfig` 返回无 apiKey 的 fake 配置。

7.5 THE Role_Architecture_Capability_Bridge SHALL 支持在不实际访问外部 LLM 服务、不读取 `.env` 中真实 API Key 的前提下完成所有子域单测，只要测试端提供一个满足 Context 的 mock 装配。

7.6 THE Role_Architecture_Capability_Bridge SHALL 保持与姊妹 spec 一致的依赖注入风格：`BlueprintServiceContext` 上 `llm` 字段的形态保持现状（`callJson` / `getConfig`），本 spec 不要求扩展该字段；若 design 阶段发现确有扩展必要（例如新增可选 `logger` 或 `evidenceStore`），任何扩展都必须保持向后兼容，即既有 `buildBlueprintServiceContext()` 调用在不注入新字段时依然能构造出合法 Context。

### 需求 8：向后兼容与响应结构稳定性

**用户故事：** 作为已经在消费 `/api/blueprint/jobs` / `/api/blueprint/generations` 响应、或在依赖既有 E2E + 子域单测的团队成员，我希望这次改造对我完全是"可选字段增强、既有字段无感知变化"，而不需要我改客户端或改测试。

#### 验收标准

8.1 THE External_HTTP_Contract SHALL 保持 `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` 的 URL、HTTP 方法、请求体结构、以及既有响应体字段完全不变。

8.2 THE Feature SHALL 保持 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例与 48 条子域 co-located 单测在默认装配（LLM 未 mock → Simulated Fallback，即 `callJson` 默认实现在无 apiKey 时抛错 / 返回 undefined）下继续通过，且 SHALL NOT 改写或删除这 95 条用例中的任一条以迁就 real 路径行为。

8.3 THE Feature SHALL 保持 `client/src/lib/blueprint-api/` 目录下 SDK smoke 现有通过状态；real 路径新增的 provenance 字段（`executionMode` / `promptId` / `model` / `responseDigest` / `tokenCount` / `structuredRolesDigest` 及结构化角色 payload 承载字段）作为可选字段存在，SDK 侧 normalizer 若需要扩展必须以追加方式实现，不得修改既有 normalizer 的输出语义。

8.4 IF 在实现过程中发现必须修改 `server/tests/blueprint-routes.test.ts` 或任一既有子域单测才能让 real 路径通过，THEN THE Feature SHALL 视该情况为违反本需求，必须调整实现而不是调整测试。

8.5 THE Feature SHALL 保持 Mission Runtime / Workflow Runtime / tasks-store / Office Task Cockpit / GitHub Pages Browser Runtime 的现有 API 与行为不变；GitHub Pages 预览仍按 browser-only 口径说明，不承载本 feature 的 LLM 调用路径。

### 需求 9：测试门槛与不在范围内事项

**用户故事：** 作为代码评审人，我希望在评审阶段就能按照一组明确、可核对的测试清单判断本 spec 是否到位，以及哪些周边改动必须被排除在本 spec 之外；我尤其希望能看到一个专门的测试证明结构化角色 JSON 确实能被以 `jobId` / `routeSetId` / `primaryRouteId` 作为 key 从 evidence 侧回取到——这关系到下游 `autopilot-agent-crew-stage-activation` spec 能否顺利承接。

#### 验收标准

9.1 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 中至少新增 2 条 E2E 用例：
  - **(a) Real LLM path**：通过 `buildBlueprintServiceContext` 注入 fake `llmMocks.callLLMJson.mockResolvedValueOnce({ roles: [ ... ], ... })`（roles 内至少 1 条合法条目），断言响应的 `role-system-architecture` invocation 满足 `adapter` 不含子串 `.simulated`（建议断言等于 design 阶段选定的 real adapter 字符串，例如 `"blueprint.runtime.role.llm"`）、`provenance.executionMode === "real"`、provenance 可见至少 `promptId` 与 `model` 两个真实溯源字段；并断言结构化角色 JSON 确实可以通过 `jobId` / `routeSetId` / `primaryRouteId` 在响应 payload（或其携带的 evidence 引用）中被稳定回取到；
  - **(b) Fallback path**：通过 `llmMocks.callLLMJson.mockRejectedValueOnce(...)` 注入一个总是抛错的 fake `callJson`，断言响应的 `role-system-architecture` invocation 走 Simulated Fallback，`provenance.executionMode === "simulated_fallback"`、`provenance.error` 被填充，且 invocation / evidence 外层字段形态与 simulated 产出等价。

9.2 THE Feature SHALL 在 Role System Architecture Capability Bridge 实现文件所在目录新增至少 4 条 co-located 单元测试：
  - **Happy path**：fake `callJson` 返回合法结构化 role payload，断言产出 real invocation / evidence 字段、`promptId` / `model` / `structuredRoles`（或等价字段）可见；
  - **Malformed JSON**：fake `callJson` 返回非 JSON 字符串（或抛出 parse 错误），断言走 Simulated Fallback 且 `provenance.error` 反映"non-json response"脱敏摘要；
  - **Schema validation fails**：fake `callJson` 返回合法 JSON 但缺字段 / 越界 / `roles.length === 0` / role `id` 重复 / 类型错误，断言 zod 校验失败后走 Simulated Fallback 且 `provenance.error` 反映"schema validation failed"脱敏摘要；
  - **ApiKey missing**：fake `getConfig` 返回不含 apiKey 的配置（或 fake `callJson` 显式拒绝发起调用），断言直接走 Simulated Fallback 且 `provenance.error` 反映"llm apiKey missing"脱敏摘要。

9.3 THE Feature SHALL 在 Role System Architecture Capability Bridge 实现文件所在目录新增至少 1 条 co-located 单元测试，专门断言：当 real 路径成功时，结构化角色 JSON 已经以 `jobId` / `routeSetId` / `primaryRouteId`（或 design 阶段选定的语义等价键集合）为 key 写入 evidence store，并可通过该键集合稳定回取到同一份 JSON 内容；该测试为下游 `autopilot-agent-crew-stage-activation` spec 的消费可行性提供显式证据。

9.4 THE Feature SHALL NOT 引入 property-based test（PBT）；本 spec 的验收完全以 example-based test 为准。

9.5 THE Feature SHALL NOT 改动 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例、48 条子域 co-located 单测、SDK smoke 中任一既有断言；本 spec 只以新增方式补测试。

9.6 THE Feature SHALL NOT 引入 UI 改动作为验收条件；`executionMode` / `structuredRoles` / `promptId` / `roleCount` 是否在 `/autopilot` 或任务墙面 HUD / Agent Crew 面板上可见，属于可选增强；Agent Crew 面板的真实按阶段 role activation UI 行为明确由下游 spec `autopilot-agent-crew-stage-activation` 承担，不在本 spec 范围内。

9.7 THE Feature SHALL NOT 引入 Web-AIGC runtime main line、task-autopilot Phase 1 本 spec 之外的运行时 / 治理 / observability 主线改动作为验收条件；这些主线由各自 steering 推进，本 spec 只保证不引入新的倒退。
