# 需求文档：Autopilot Capability Bridge — MCP GitHub Source

## 简介

`/autopilot` 的 11 节点叙事（`docs/autopilot-target-experience-architecture-2026-05-07.svg`）要求：**澄清之后的每个阶段都应由真实能力网络驱动，沙箱派生应输出真实证据**。前序 spec `autopilot-routeset-llm-generation`（`.kiro/specs/autopilot-routeset-llm-generation/requirements.md`，见其 需求 1.3 / 9.4）在明确把 RouteSet 升级为 LLM 驱动的同时，**明确把"沙箱派生本身变成真实能力调用"这件事留给独立的 capability-bridge feature**——本 spec 就是那个独立 feature 的 MCP / GitHub-source 分支，与姊妹 spec `autopilot-capability-bridge-docker`（`.kiro/specs/autopilot-capability-bridge-docker/requirements.md`）并行推进、共享同一套 scope-boundary / fallback / `executionMode` / `BlueprintServiceContext` DI / `credential-redactor` 收口模式。

当前 `server/routes/blueprint.ts` 第 **2866-3200** 行的 `createRouteGenerationSandboxDerivation()` 对 `mcp-github-source` 与其它 3 个 capability 产出的都是模板化结果：

- `adapter: "blueprint.runtime.mcp.github.simulated"`（第 ~3372 行 `getDefaultRuntimeCapabilities()` 声明）
- `durationMs = 180 + index * 30`（确定性公式 `deterministicCapabilityDuration()`）
- `outputSummary` 由 `buildCapabilityOutputSummary()` 按模板字符串拼装
- `logs` 由 `buildCapabilityInvocationLogs()` 硬编码生成
- 没有任何 MCP 调用、没有任何 HTTP fetch、没有 GitHub API 访问

另一方面，仓库里已经存在一套成熟的 MCP 主线接线（见 `.kiro/steering/web-aigc-runtime-mainline-checkpoints-2026-04-23.md` 的 MCP 检查点）：

- `McpChecker` 已注册进主权限检查引擎，对应 `mcp_tool` 检查类型
- `McpToolAdapter`（`server/tool/api/mcp-tool-adapter.ts`）已作为 `/api/mcp` 的执行适配层接入主服务
- `InternalMcpToolInvoker` 已作为 `McpToolAdapter` 的默认 invoker
- runtime `mcp` extra adapter 通过 `executeMcp: (request) => mcpToolAdapter.execute(request)` 复用同一套执行入口
- 这些组件都在 `auto-agent` / skills / guest-agents 的统一 dispatch 链上

与 Docker 能力桥的不同在于：`mcp-github-source` 的意图是**检查 `BlueprintGenerationRequest.githubUrls` 指向的 GitHub 仓库并产出元数据证据**，它可以走两条都算"真实执行"的实现路径：

- **路径 A（MCP 优先）**：通过 `BlueprintServiceContext` 注入的 MCP 适配器（复用主线 `McpToolAdapter` + `InternalMcpToolInvoker`）调用一个 GitHub 仓库检查 MCP 工具（具体工具标识由 design 阶段从已注册 MCP 工具目录中挑选），产出真实 `toolArgs` / `toolResult` / 调用时序作为 invocation 证据。
- **路径 B（HTTP 回退）**：在没有可用 MCP 工具时，通过注入的 HTTP fetcher 直接访问 `https://api.github.com/repos/{owner}/{repo}`（或等价 GitHub REST 端点），解析 JSON 响应中的 `name` / `description` / `language` / `stargazers_count` / `default_branch` / `pushed_at` / 最近一次 commit SHA 等字段，派生 `outputSummary` 与 evidence。

这两条路径**都不是 simulated**——design 阶段二选一（或按优先级尝试 A 再回退到 B），两者的 adapter 字符串都不得包含 `.simulated` 子串；只有当 MCP 不可用**且** HTTP fetch 也不可用 / 被拒绝 / 失败 / `githubUrls` 为空时，才回退到今天的模板化产出（与姊妹 Docker spec 的 Simulated Fallback 语义一致）。

本 spec 做的事非常聚焦：**只把 `mcp-github-source` 这一个 capability 在沙箱派生管线中的调用，从模板化升级为通过主线 MCP 执行入口或注入的 HTTP fetcher 真正访问 GitHub 仓库**。其它 3 个 capability（`docker-analysis-sandbox` / `aigc-spec-node` / `role-system-architecture`）的真实化由姊妹 spec 或后续独立 spec 推进；`buildRouteSet()` 本身、SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 也由各自独立 spec 推进；`createRouteGenerationSandboxDerivation()` 外层 orchestration 不在本 spec 范围内，只把其中一个 capability 的 adapter 实现替换掉。

当 MCP 不可达 / HTTP 被禁用 / `githubUrls` 为空 / 所有 URL 都命中拒绝 / fetcher 抛错 / 超时时，本 feature 必须**无缝回退到今天的模板化调用**，保证既有 `server/tests/blueprint-routes.test.ts` 中 47 条 E2E 与 48 条子域单测在默认测试装配下（未注入 MCP 适配器、未注入 HTTP fetcher → 回退）继续通过。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **MCP Capability Bridge / MCP 能力桥**：本 spec 引入的新组件，负责把 `mcp-github-source` 能力的一次调用转成一次真实 GitHub 仓库检查（MCP 工具执行 或 GitHub REST API 访问）；通过 `BlueprintServiceContext` 注入依赖，`createRouteGenerationSandboxDerivation()` 在命中该 capability 时会调它替换模板化 invocation。
- **McpToolAdapter**：`server/tool/api/mcp-tool-adapter.ts` 中已存在的 `McpToolAdapter` 类，`/api/mcp` 主线执行入口。本桥通过 `BlueprintServiceContext` 间接消费它的 `execute(request)` 能力，不得自行 `new McpToolAdapter(...)`。
- **InternalMcpToolInvoker**：`McpToolAdapter` 的默认 invoker，已进入 `server/index.ts` 主线装配。本桥通过注入路径间接复用，不直接 import 其单例。
- **HTTP fetcher / HTTP 取数器**：`BlueprintServiceContext` 上注入的、一个仅做 HTTPS GET 请求的最小接口（形态由 design 阶段确定，例如 `ctx.httpFetcher?.fetch(url, options)` 或等价签名）；它的具体实现可以是 `undici` / `node-fetch` / 全局 `fetch` 的薄包装；**本桥实现文件内 SHALL NOT 直接调用全局 `fetch()` 或 `import` `undici` 单例**。
- **Real 执行 / Real Execution**：在本 spec 中等价于"MCP Capability Bridge 成功通过注入的 MCP 适配器调用了一个真实 GitHub 检查工具，**或** 成功通过注入的 HTTP fetcher 访问了一个 allow-list 内的 GitHub REST 端点并解析出结构化元数据"。两种实现路径都视为 real。
- **Simulated Fallback / 模拟回退**：MCP 适配器未注入 / HTTP fetcher 未注入 / `githubUrls` 为空 / 所有尝试的 URL 均 fail / 超时 / 被 allow-list 拒绝时，本桥回退到今天 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 的模板化产出，结构与今天 simulated invocation 字段形态等价。
- **`adapter` 字符串**：`BlueprintRuntimeCapability.adapter` 字段。本 spec 把 real 执行路径下 `mcp-github-source` 的 adapter 从 `"blueprint.runtime.mcp.github.simulated"` 升级为 `"blueprint.runtime.mcp.github.real"`（MCP 路径）或 `"blueprint.runtime.mcp.github.http"`（HTTP 路径）；具体命名由 design 阶段选择，但**不得含子串 `.simulated`**；回退路径下保留或沿用现有 simulated 命名，并通过 `executionMode` 区分。
- **`executionMode`**：本 spec 在 `BlueprintCapabilityInvocation.provenance` 与 `BlueprintCapabilityEvidence.provenance` 中新增的**可选**字段，取值 `"real"` 或 `"simulated_fallback"`；real 路径下可附带 `repoUrl` / `commitSha` / `fetchedAt` / `defaultBranch` / `apiResponseDigest` / `mcpToolName` 等可选溯源字段，fallback 路径下必须附带 `error?: string` 说明回退原因。语义与姊妹 Docker spec 的 `executionMode` 字段一致，只是取值内容不同。
- **Allow-list / 允许清单**：本桥仅允许对一个明确的源清单（建议默认：`https://api.github.com`、可能包含 `https://github.com`）发起 HTTP fetch；任何不在清单内的 URL 请求必须被拒绝，拒绝情况按需求 4 走 Simulated Fallback。具体清单与开关策略由 design 阶段确定。
- **Redacted logs / 脱敏日志**：本桥在写入 `BlueprintCapabilityInvocation.logs` 之前，必须复用 `credential-redactor`（同姊妹 Docker spec 的 `services/lobster-executor` 已有 credential-redactor，或其在 `server/` 侧的等价实现）对 MCP 工具 args / result、HTTP 请求 headers / 响应 body 做脱敏；未脱敏原文不得进入 evidence、invocation logs 或面向用户响应。
- **Sandbox Derivation Pipeline / 沙箱派生管线**：`createRouteGenerationSandboxDerivation()` 生成 capability invocations / evidence / role events / `sandbox.job.*` 事件的这条管线。本 spec 只替换其中 `mcp-github-source` 一项的 adapter 实现，管线外层编排保持不变。
- **External HTTP Contract / 外部 HTTP 契约**：`POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 的请求与响应结构；以 `server/tests/blueprint-routes.test.ts` 中 47 条 E2E 用例锁定的行为为准。
- **Subdomain Tests / 子域单测**：`server/routes/blueprint/*/service.test.ts` 等 co-located 子域单元测试共 48 条。
- **`BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence`**：`shared/blueprint/contracts.ts` 中定义的 capability 调用记录与证据记录类型；本 spec 只允许以**追加可选字段**方式扩展它们的 `provenance`，不得修改既有字段。
- **`BlueprintEventName`**：`shared/blueprint/events.ts` 导出的事件名常量命名空间，含 `SandboxJobStarted` / `SandboxJobCompleted` / `SandboxJobFailed` / `CapabilityInvoked` / `CapabilityCompleted` / `CapabilityFailed` / `EvidenceRecorded` 等。本 spec 不新增事件名，只复用现有常量。

## 需求

### 需求 1：范围边界与独立性

**用户故事：** 作为 `/autopilot` 主线的维护者，我希望本 spec 有一条狭窄且可审核的范围边界，使它既能真正把 `mcp-github-source` 推进为真实 MCP / HTTP 调用，又不会踩到其它 spec 的地盘、也不会被迫捆绑其它 3 个 capability 的改造。

#### 验收标准

1.1 THE Feature_Scope SHALL 覆盖并且仅覆盖 `createRouteGenerationSandboxDerivation()` 中 `mcp-github-source` 这一个 capability 的 invocation / evidence 产出路径，将其从模板化升级为通过注入的 MCP 适配器（复用主线 `McpToolAdapter` + `InternalMcpToolInvoker`）或注入的 HTTP fetcher 对 GitHub 仓库的真实检查调用，并在不可达时回退到今天的模板化产出。

1.2 THE Feature_Scope SHALL NOT 修改 `docker-analysis-sandbox` 能力调用的产出路径；该项由姊妹 spec `autopilot-capability-bridge-docker` 推进。

1.3 THE Feature_Scope SHALL NOT 修改 `aigc-spec-node` 能力调用的产出路径；该项由独立 spec `autopilot-capability-bridge-aigc-node`（后续创建）推进。

1.4 THE Feature_Scope SHALL NOT 修改 `role-system-architecture` 能力调用的产出路径；该项由独立 spec `autopilot-capability-bridge-role`（后续创建）推进。

1.5 THE Feature_Scope SHALL NOT 修改 `buildRouteSet()` 本身的候选路线推导逻辑；该项由前序 spec `autopilot-routeset-llm-generation` 推进。

1.6 THE Feature_Scope SHALL NOT 修改 SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 任一阶段的生成路径；这些由各自独立 spec 推进。

1.7 THE Feature_Scope SHALL NOT 修改 `createRouteGenerationSandboxDerivation()` 外层对 capability 的选择、排序、evidence aggregation、role timeline、`sandbox.job.*` 事件总编排逻辑；本 spec 只替换其中一个 capability 的 adapter 实现。

1.8 THE Feature_Scope SHALL NOT 引入任何新的外部 HTTP 契约（新 route、新请求体字段、新响应字段）；已有 `POST /api/mcp` / `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` 保持不变。

1.9 THE Feature_Scope SHALL NOT 修改或删除 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例、48 条子域 co-located 单测或 SDK smoke 任一既有断言；本 spec 只新增用例，不改写既有用例。

1.10 THE Feature_Scope SHALL NOT 引入 Browser Runtime / GitHub Pages 相关改动；GitHub Pages 纯浏览器路径不承载执行器 / MCP / HTTP fetcher，不得从浏览器侧发起对 GitHub 的出站请求（见 `.kiro/steering/2026-04-15-runtime-current-state.md`）。

### 需求 2：通过 MCP 适配器或 HTTP fetcher 发起真实 GitHub 调用

**用户故事：** 作为审阅 `/autopilot` 沙箱证据的用户，我希望看到的 GitHub source invocation 是真的访问了目标仓库并解析了元数据，而不是永远由字符串模板拼出来的摘要。

#### 验收标准

2.1 WHEN 沙箱派生管线在 `createRouteGenerationSandboxDerivation()` 内命中 `mcp-github-source` capability 且 `BlueprintGenerationRequest.githubUrls` 含至少一条 URL，THE MCP_Capability_Bridge SHALL 通过 `BlueprintServiceContext` 注入的 MCP 适配器（对应主线 `McpToolAdapter.execute(request)` 能力）**或**注入的 HTTP fetcher（对 `https://api.github.com/repos/{owner}/{repo}` 等 allow-list 内端点发起 HTTPS GET）发起一次真实仓库检查调用，而不是调用 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 生成模板化结果。

2.2 THE MCP_Capability_Bridge SHALL 允许 design 阶段在以下两种实现之间自由选择，两者都算合法 real 路径：
  - (a) 通过注入的 MCP 适配器调用一个 GitHub 仓库检查 MCP 工具（具体 tool 名由 design 从已注册 MCP 工具目录中挑选），复用主线权限、审计与治理链路；
  - (b) 通过注入的 HTTP fetcher 直接访问 GitHub REST API（默认 `https://api.github.com/repos/{owner}/{repo}`），解析 JSON 响应中的仓库元数据；
  design 也可选择"优先 A，A 不可用时自动降级到 B，B 也不可用时再走需求 4 的 Simulated Fallback"三段式策略。

2.3 THE MCP_Capability_Bridge SHALL NOT 在实现文件内直接 `import` `McpToolAdapter` / `InternalMcpToolInvoker` 单例、直接 `new McpToolAdapter(...)`、调用模块级 `fetch()` 或 `import` `undici` 单例；所有 MCP / HTTP 能力都必须来自 `BlueprintServiceContext` 上注入的显式字段。

2.4 THE MCP_Capability_Bridge SHALL 为单次仓库检查调用设置一个明确的上限超时，该上限取值不大于 30 秒（具体数值在 design 阶段确定），超时到达仍未收到结果时触发需求 4 的 Simulated Fallback 路径。

2.5 THE MCP_Capability_Bridge SHALL 保证至少处理 `githubUrls` 中的第一条 URL；是否对额外 URL 做并行处理、顺序遍历或直接跳过由 design 阶段决定，但**不得**使用与当前 `BlueprintGenerationRequest` 无关的静态 URL。

2.6 IF `BlueprintGenerationRequest.githubUrls` 为空或未提供，THEN THE MCP_Capability_Bridge SHALL 直接进入需求 4 的 Simulated Fallback 路径，并在 `provenance.error` 中标注 `"no github url"` 之类的脱敏原因；不得构造空的 real 调用。

2.7 THE MCP_Capability_Bridge SHALL 在尚未从 MCP 工具或 HTTP 响应拿到终态结果之前，不得向 `createRouteGenerationSandboxDerivation()` 外层返回 real 路径的最终 `BlueprintCapabilityInvocation`；未到终态期间必须保持作业仍在运行中或已按需求 4 回退。

### 需求 3：真实 Invocation 与 Evidence 字段来源

**用户故事：** 作为依赖 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 做 Artifact Replay、Agent Crew 展示与运维分析的消费者，我希望这些记录在 real 路径下的每个关键字段都能指回一次真实的 GitHub 访问，而不是算法生成的常量。

#### 验收标准

3.1 WHEN MCP_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.durationMs` SHALL 等于从调用发起（MCP `execute(request)` 开始 **或** HTTP fetch 发起）、到收到终态响应为止的墙钟时间（毫秒），而不得由 `deterministicCapabilityDuration()` 这类确定性公式产出。

3.2 WHEN MCP_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.logs` SHALL 由真实调用轨迹派生：
  - MCP 路径：记录脱敏后的 `toolName` / `toolArgs` 摘要 / `toolResult` 摘要 / 耗时；
  - HTTP 路径：记录脱敏后的 HTTP 方法 / URL / 响应状态码 / 响应头关键字段 / 响应 body 摘要；
  并按 design 阶段决定的上限（建议上限为 ~50 行或 ~10KB，最终数值在 design 确定）截断；该字段 SHALL NOT 由 `buildCapabilityInvocationLogs()` 模板拼出。

3.3 WHEN MCP_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.outputSummary` SHALL 从真实仓库元数据派生而成（例如形如 `"repo {name} · {language} · {stars}★ · default branch {branch} · last pushed {date}"`），不得由 `buildCapabilityOutputSummary()` 模板字符串生成。

3.4 WHEN MCP_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation` 对应的 `BlueprintRuntimeCapability.adapter` SHALL 等于 design 阶段选定的 real adapter 字符串（建议为 `"blueprint.runtime.mcp.github.real"`（MCP 路径）或 `"blueprint.runtime.mcp.github.http"`（HTTP 路径））；real 路径下 adapter SHALL NOT 含子串 `.simulated`。

3.5 WHEN MCP_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityEvidence.summary` SHALL 由真实仓库元数据派生而成，并可在 evidence payload 中包含仓库 URL、默认分支、最近一次 commit SHA、抓取时间（`fetchedAt`）、仓库可见性、API 响应摘要（例如 SHA-256 摘要）、以及（MCP 路径下）`mcpToolName` 等真实溯源字段；这些追加字段作为可选字段存在，不得破坏既有 evidence 消费方。

3.6 WHEN MCP_Capability_Bridge 以 real 路径完成一次调用，THE `BlueprintCapabilityInvocation.logs` 与 `BlueprintCapabilityEvidence.summary` SHALL 在持久化之前已经过 `credential-redactor` 脱敏；**任何 GitHub personal access token、Authorization 头、MCP 工具认证字段、内部密钥** SHALL NOT 出现在 evidence、invocation logs、事件 payload 或面向用户的响应中。

3.7 THE MCP_Capability_Bridge SHALL 保持 real 路径产出的 `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 外层字段形态（`id` / `jobId` / `capabilityId` / `capabilityLabel` / `kind` / `status` / `securityLevel` / `safetyGate` / `routeId` / `input` / `evidenceIds` 等）与今天 simulated 路径对外可见的形态等价，以便既有 47 条 E2E + 48 条子域单测中不断言新字段的用例不会失败。

### 需求 4：真实路径不可用时的 Simulated Fallback

**用户故事：** 作为在本机没有配置 MCP 工具、或在默认测试装配下运行 CI 的工程师，我希望沙箱派生照样能在不依赖 MCP 与外网的情况下跑完，并在结果里清楚标注这次是回退产物而不是真实执行。

#### 验收标准

4.1 IF 以下任一条件成立：
  - `BlueprintServiceContext` 未注入可用的 MCP 适配器**且**未注入可用的 HTTP fetcher；
  - `BlueprintGenerationRequest.githubUrls` 为空或未提供；
  - MCP 工具调用抛出不可达 / 超时 / 权限拒绝 / 审批阻断；
  - HTTP fetcher 抛错、HTTP 响应非 2xx、或响应被 allow-list 拒绝；
  - 所有尝试过的仓库 URL 均失败；
  - 单次调用超过需求 2.4 定义的上限超时；
  THEN THE MCP_Capability_Bridge SHALL 回退到今天的模板化 invocation 产出路径（沿用 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()`）。

4.2 WHEN MCP_Capability_Bridge 走 Simulated Fallback 路径，THE `BlueprintCapabilityInvocation.provenance` SHALL 新增可选字段 `executionMode === "simulated_fallback"` 与 `error: string`（填入触发回退的**脱敏后**原因摘要，例如 `"mcp adapter missing"` / `"http fetcher missing"` / `"no github url"` / `"fetch timeout"` / `"allow-list rejected"` / `"fetch error"`）；real 路径下则 SHALL 新增可选字段 `executionMode === "real"`，可附带 `repoUrl` / `commitSha` / `fetchedAt` / `defaultBranch` / `apiResponseDigest` / `mcpToolName` 等可选溯源字段。

4.3 WHEN MCP_Capability_Bridge 走 Simulated Fallback 路径，THE `BlueprintCapabilityInvocation` / `BlueprintCapabilityEvidence` 的既有外层字段形态 SHALL 与今天 simulated 产出等价，使既有 47 条 E2E + 48 条子域单测在默认装配（MCP 未注入 + HTTP fetcher 未注入 → 回退）下继续通过。

4.4 THE MCP_Capability_Bridge SHALL 仅通过**追加可选字段**的方式扩展 `BlueprintCapabilityInvocation.provenance` 与 `BlueprintCapabilityEvidence.provenance`（即 `executionMode` / `error` / `repoUrl` / `commitSha` / `fetchedAt` / `defaultBranch` / `apiResponseDigest` / `mcpToolName`）；不得删除、不得重命名现有 provenance 字段，也不得把既有字段改为必填或变更类型。

4.5 IF `BlueprintServiceContext` 显式注入了一个总是抛错的 MCP 适配器或总是抛错的 HTTP fetcher（用于测试场景），THEN THE MCP_Capability_Bridge SHALL 按 Simulated Fallback 路径工作，且不得额外输出 noisy 日志或事件影响既有测试的稳定性。

4.6 THE MCP_Capability_Bridge SHALL 在中途首次失败、但仍在 design 阶段允许的重试窗口内时，允许做有限次数的重试或在 MCP / HTTP 两条实现之间按 design 阶段策略自动降级；`provenance.error` 仅在**最终进入 Simulated Fallback** 时被填充，中间成功重试或成功降级的情况下不得留下噪音 error。

### 需求 5：事件发射语义

**用户故事：** 作为 Artifact Replay、Agent Crew 面板、任务墙面 HUD 等事件流消费者，我希望从事件里既能看到一次沙箱派生是真的访问了 GitHub，也能清楚看到 adapter 的变化；同时不想因为 adapter 升级就被迫改订阅代码。

#### 验收标准

5.1 WHEN MCP_Capability_Bridge 开始一次 real 路径调用，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobStarted`（`"sandbox.job.started"`）事件，payload 至少携带当前 `jobId`、`capabilityId === "mcp-github-source"`、以及当前 adapter 字符串（`"blueprint.runtime.mcp.github.real"` 或 `"blueprint.runtime.mcp.github.http"`）。

5.2 WHEN MCP_Capability_Bridge 以 real 路径收到 MCP 工具或 HTTP fetcher 的成功终态，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobCompleted`（`"sandbox.job.completed"`）事件。

5.3 WHEN MCP_Capability_Bridge 以 real 路径遭遇失败且最终进入 Simulated Fallback，THE Feature SHALL 通过 `BlueprintServiceContext.eventBus` 发出 `BlueprintEventName.SandboxJobFailed`（`"sandbox.job.failed"`）事件，payload 至少携带触发失败的**脱敏后** `error` 字符串摘要。

5.4 WHERE 本 spec 需要发出 capability 级别的调用与证据事件，THE Feature SHALL 直接复用 `createRouteGenerationSandboxDerivation()` 外层已经在发的 `BlueprintEventName.CapabilityInvoked`（`"capability.invoked"`）、`BlueprintEventName.CapabilityCompleted`（`"capability.completed"`）、`BlueprintEventName.EvidenceRecorded`（`"evidence.recorded"`）等事件，而不得在子域内另发一套并行事件。

5.5 WHERE design 阶段判断有必要发射 real 调用的中间进度事件（例如 HTTP 响应分段、MCP 工具长调用心跳），THE Feature MAY 选择不发射；若最终选择发射，必须复用 `BlueprintEventName` 已有的事件名常量，而不得引入新的事件名字符串。

5.6 THE Feature SHALL NOT 在 `server/routes/blueprint/` 目录下以裸字符串字面量（例如 `"sandbox.job.started"`）方式构造事件 `type`；所有事件名必须经过 `BlueprintEventName` 常量命名空间。

5.7 THE Feature SHALL 保证事件 payload 中新增字段（例如 `adapter` / `executionMode` / `repoUrl` / `mcpToolName`）是**可选**字段，既有订阅 `sandbox.*` / `capability.*` / `evidence.*` 事件的消费者不得因字段追加而断言失败。

### 需求 6：BlueprintServiceContext 依赖注入与可测试性

**用户故事：** 作为 MCP 能力桥的单元测试作者，我希望桥的实现完全通过 `BlueprintServiceContext` 拿到 MCP 与 HTTP 能力，这样我既能在没有真实 MCP 工具目录的机器上跑测试，也能在 CI 中注入 fake 适配器模拟 happy / timeout / unreachable / fallback 四种场景。

#### 验收标准

6.1 THE MCP_Capability_Bridge SHALL 被组织为一个工厂函数（形如 `createMcpGithubCapabilityBridge(ctx)` 或等价结构），其构造签名只接收 `BlueprintServiceContext`（可能扩展为显式包含 `mcpToolAdapter` / `httpFetcher` 字段的 Context），而不接收模块级单例依赖；具体签名由 design 阶段确定。

6.2 THE MCP_Capability_Bridge SHALL 通过 `BlueprintServiceContext` 上注入的显式字段获取 MCP 与 HTTP 能力（例如 `ctx.mcpToolAdapter?.execute(request)`、`ctx.httpFetcher?.fetch(url, options)` 或 design 阶段选定的等价字段名）；实现文件内 SHALL NOT 直接 `import` `server/tool/api/mcp-tool-adapter.ts` 的 `McpToolAdapter` / `InternalMcpToolInvoker` 单例、`import` `server/index.ts` 中装配的 `mcpToolAdapter` 实例、也 SHALL NOT 调用模块级 `fetch()` 或 `import` `undici` 单例。

6.3 THE Feature SHALL 扩展 `BlueprintServiceContext` 以显式暴露 MCP 与 HTTP 依赖字段（字段具体名称与形态由 design 阶段决定，例如 `mcpToolAdapter?: { execute(request): Promise<...> }` 与 `httpFetcher?: { fetch(url, options): Promise<...> }`）；扩展必须保持向后兼容，即既有 `buildBlueprintServiceContext()` 调用在不注入新字段时依然能构造出合法 Context，并走 Simulated Fallback 路径。

6.4 THE MCP_Capability_Bridge SHALL 可以通过 `buildBlueprintServiceContext({ mcpToolAdapter: fakeMcp, httpFetcher: fakeFetcher })` 注入自定义适配器，从而在端到端测试与子域单测中被替换为：返回真实 shape 结果的 fake MCP 适配器、返回真实 shape GitHub JSON 的 fake fetcher、永远抛错的 fake MCP 适配器、永远抛错的 fake fetcher、或永远不 resolve 以触发 timeout 的 fake fetcher。

6.5 THE MCP_Capability_Bridge SHALL 支持在不实际访问外网、不依赖真实 MCP 工具目录的前提下完成所有子域单测，只要测试端提供一个满足 Context 的 mock 装配。

### 需求 7：安全策略、allow-list 与脱敏

**用户故事：** 作为 `/autopilot` 的安全负责人，我希望 real 路径执行的 GitHub 仓库检查只允许访问受控源，禁止任意 URL 出站，并且用户看不到任何凭证泄漏或内部敏感字段。

#### 验收标准

7.1 THE MCP_Capability_Bridge SHALL 维护一个明确的 HTTP allow-list（默认建议包含 `https://api.github.com`、可能包含 `https://github.com`，具体清单由 design 阶段确定）；任何不在清单内的 URL 请求 SHALL 被拒绝派发，拒绝情况按需求 4 走 Simulated Fallback。

7.2 THE MCP_Capability_Bridge SHALL 拒绝任何非 `https://` 协议的 URL（包括但不限于 `http://` / `file://` / `data:` / `javascript:` / `ftp://` / 相对 URL）；拒绝情况按需求 4 走 Simulated Fallback 并在 `provenance.error` 中记录**脱敏后**的拒绝原因。

7.3 THE MCP_Capability_Bridge SHALL 对 HTTP 请求与响应设置明确的大小上限（例如拒绝响应 body > 1MB 的返回，具体阈值由 design 阶段确定）；超过上限的响应按需求 4 走 Simulated Fallback。

7.4 THE MCP_Capability_Bridge SHALL 在任何写入 evidence、invocation logs、事件 payload 之前，让 MCP 工具 args / result、HTTP 请求 headers / 响应 body 都经过 `credential-redactor` 脱敏；脱敏覆盖范围至少包括：`Authorization` / `X-GitHub-Token` / `token` / `api_key` / 邮箱地址 / 内部 URL / GitHub personal access token 字样。

7.5 THE MCP_Capability_Bridge SHALL NOT 在面向用户可见的 `BlueprintCapabilityInvocation.outputSummary` / `BlueprintCapabilityInvocation.logs` / `BlueprintCapabilityEvidence.summary` 中包含：GitHub personal access token、Authorization 头原值、MCP 工具认证字段原值、执行器配置环境变量原文、或任何未经脱敏的凭证字符串。

7.6 IF HTTP 请求或 MCP 调用触发了安全策略拒绝（例如 allow-list 不通过、非 https 协议、响应 body 超限、MCP 权限引擎返回 `approval_required` / `blocked`），THEN THE MCP_Capability_Bridge SHALL 按需求 4 走 Simulated Fallback，并在 `provenance.error` 中填入**脱敏后**的拒绝原因摘要。

### 需求 8：向后兼容与响应结构稳定性

**用户故事：** 作为已经在消费 `/api/blueprint/jobs` / `/api/blueprint/generations` 响应、或在依赖既有 E2E + 子域单测的团队成员，我希望这次改造对我完全是"可选字段增强、既有字段无感知变化"，而不需要我改客户端或改测试。

#### 验收标准

8.1 THE External_HTTP_Contract SHALL 保持 `POST /api/mcp` / `POST /api/blueprint/jobs` / `POST /api/blueprint/generations` 的 URL、HTTP 方法、请求体结构、以及既有响应体字段完全不变。

8.2 THE Feature SHALL 保持 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例与 48 条子域 co-located 单测在默认装配（MCP 未注入 + HTTP fetcher 未注入 → Simulated Fallback）下继续通过，且 SHALL NOT 改写或删除这 95 条用例中的任一条以迁就 real 路径行为。

8.3 THE Feature SHALL 保持 `client/src/lib/blueprint-api/` 目录下 SDK smoke 现有通过状态；real 路径新增的 provenance 字段（`executionMode` / `repoUrl` / `commitSha` / `fetchedAt` / `defaultBranch` / `apiResponseDigest` / `mcpToolName`）作为可选字段存在，SDK 侧 normalizer 若需要扩展必须以追加方式实现，不得修改既有 normalizer 的输出语义。

8.4 IF 在实现过程中发现必须修改 `server/tests/blueprint-routes.test.ts` 或任一既有子域单测才能让 real 路径通过，THEN THE Feature SHALL 视该情况为违反本需求，必须调整实现而不是调整测试。

8.5 THE Feature SHALL 保持 Mission Runtime / Workflow Runtime / tasks-store / Office Task Cockpit / GitHub Pages Browser Runtime 的现有 API 与行为不变；GitHub Pages 预览仍按 browser-only 口径说明，不承载本 feature 的 MCP / HTTP fetcher 路径。

### 需求 9：测试门槛与不在范围内事项

**用户故事：** 作为代码评审人，我希望在评审阶段就能按照一组明确、可核对的测试清单判断本 spec 是否到位，以及哪些周边改动必须被排除在本 spec 之外。

#### 验收标准

9.1 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 中至少新增 2 条 E2E 用例（本需求推荐新增 3 条以自然覆盖两条 real 实现路径）：
  - **(a) Real-MCP path**：通过 `buildBlueprintServiceContext({ mcpToolAdapter: fakeMcp })` 注入一个返回真实 shape 工具响应的 fake MCP 适配器，断言响应的 `mcp-github-source` invocation 满足 `adapter` 不含子串 `.simulated`（建议断言等于 design 阶段选定的 MCP 路径 adapter 字符串，例如 `"blueprint.runtime.mcp.github.real"`）、`provenance.executionMode === "real"`、且 provenance 可见至少一个 MCP 溯源字段（例如 `mcpToolName`）；
  - **(b) Real-HTTP path**：通过 `buildBlueprintServiceContext({ httpFetcher: fakeFetcher })` 注入一个返回真实 shape GitHub API JSON body 的 fake fetcher，断言响应的 `mcp-github-source` invocation 满足 `adapter` 不含子串 `.simulated`（建议断言等于 design 阶段选定的 HTTP 路径 adapter 字符串，例如 `"blueprint.runtime.mcp.github.http"`）、`provenance.executionMode === "real"`、且 provenance 可见至少一个 HTTP 溯源字段（例如 `repoUrl` / `commitSha` / `fetchedAt`）；
  - **(c) Fallback path**：注入一个总是抛错的 fake fetcher、且不注入 MCP 适配器，断言响应的 `mcp-github-source` invocation 走 Simulated Fallback，`provenance.executionMode === "simulated_fallback"`、`provenance.error` 被填充，且 invocation / evidence 外层字段形态与 simulated 产出等价。

9.2 THE Feature SHALL 在 MCP Capability Bridge 实现文件所在目录新增至少 3 条 co-located 单元测试：happy path（fake MCP 或 fake fetcher 返回成功响应）、timeout / error（fake fetcher 抛错或永远不 resolve 直到上限超时）、unreachable / missing（context 未注入任何 MCP 或 HTTP 能力，且 `githubUrls` 为空或所有 URL 均失败）。

9.3 THE Feature SHALL NOT 引入 property-based test（PBT）；本 spec 的验收完全以 example-based test 为准。

9.4 THE Feature SHALL NOT 改动 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例、48 条子域 co-located 单测、SDK smoke 中任一既有断言；本 spec 只以新增方式补测试。

9.5 THE Feature SHALL NOT 引入 UI 改动作为验收条件；`executionMode` 是否在 `/autopilot` 或任务墙面 HUD 上可见，属于可选增强，若在实现阶段自然可落（以可选 UI 字段形式）可顺带追加，否则留给后续 UI spec 处理。

9.6 THE Feature SHALL NOT 引入 Web-AIGC runtime main line、task-autopilot Phase 1 本 spec 之外的运行时 / 治理 / observability 主线改动作为验收条件；这些主线由各自 steering 推进，本 spec 只保证不引入新的倒退。
