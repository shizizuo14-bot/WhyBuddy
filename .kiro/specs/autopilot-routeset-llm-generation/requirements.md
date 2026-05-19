# 需求文档：Autopilot RouteSet LLM 驱动生成

## 简介

`/autopilot` 的 11 节点叙事（见 `docs/autopilot-target-experience-architecture-2026-05-07.svg`）要求：**澄清结束之后的每一个阶段，都应由 LLM / Docker / MCP / AIGC-node 能力网络真正驱动，沙箱派生产出真实证据，再由这些证据推导出 RouteSet 候选路径**。当前 `server/routes/blueprint.ts` 里：

- **澄清阶段已经接通**：`callLLMJson` 已经承担 clarification questions 生成，并通过 `generationSource: "llm" | "llm_fallback" | "template"` + provenance 记录 LLM 入参与 fallback 原因（见 `server/routes/blueprint.ts` 第 13102 行附近）。
- **RouteSet 阶段仍是模板化**：`buildRouteSet()`（第 2425 行）硬编码 3 条候选路线（primary SPEC asset / documentation-first conservative / preview-first exploratory）；只把 clarification 的答案塞进 `provenance`，**从不作为 LLM prompt 去推导真实路线**。
- **沙箱派生也是模板化**：`createRouteGenerationSandboxDerivation()`（第 2866 行）遍历 4 个 capability（`docker-analysis-sandbox` / `mcp-github-source` / `aigc-spec-node` / `role-system-architecture`），使用字符串模板拼 `outputSummary`、固定日志与 `durationMs = 180 + index * 30`；adapter 命名为 `blueprint.runtime.docker.simulated` / `blueprint.runtime.mcp.github.simulated`，**实际上既不调用 Docker，也不调用 MCP，也不发起 HTTP fetch，更不调用 LLM**。
- **Agent Crew 角色事件也是模板化快照**：`role.capability_invoked` / `role.review_completed` 在 RouteSet 构造期间被静态生成一次，而不是由真实能力执行过程驱动。

本 spec 针对 `/autopilot` 中 **RouteSet 生成路径** 这一片工程债，按照澄清阶段已经验证过的 LLM 驱动模式（`callLLMJson` → schema 校验 → fallback → provenance + `generationSource`）把 3 条硬编码候选路线升级为 LLM 产出，使 RouteSet 成为真正由澄清答案、GitHub / 领域上下文推导出的结构化结果。**本 spec 严格限定在 RouteSet 这一阶段的 LLM 驱动**；SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 的 LLM 驱动都由各自独立 spec 推进；让 `docker-analysis-sandbox` 真正跑 Docker、让 `mcp-github-source` 真正调 MCP 也由独立的 capability-bridge feature 推进。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **RouteSet**：`BlueprintRouteSet` 对象，包含 `id`、`requestId`、`primaryRouteId`、`routes: BlueprintRouteCandidate[]`、`nextAsset`、`provenance`。由 `buildRouteSet()` 在 `POST /api/blueprint/jobs` 与 `POST /api/blueprint/generations` 的响应中返回。
- **RouteSet LLM Generator / RouteSet 生成器**：本 spec 引入的新组件，位于 `server/routes/blueprint/routeset/` 目录下，接收 `(intake, clarificationSession.answers, githubUrls, domainContext)`，通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，返回结构化 `routes: BlueprintRouteCandidate[]`。
- **`generationSource`**：沿用 clarification 子域现有语义的字符串枚举 `"llm" | "llm_fallback" | "template"`，挂在事件与 provenance 上，表达当前 RouteSet 是 LLM 直接产出、LLM 失败回退到模板、还是从未走过 LLM。
- **Templated RouteSet / 模板化 RouteSet**：现状实现，即 `buildRouteSet()` 硬编码的 3 条候选路线（primary SPEC asset / documentation-first conservative / preview-first exploratory）。
- **Fallback / 回退路径**：当 LLM 调用失败（网络错误、超时、返回无效 JSON、schema 校验不通过、`routes` 为空、缺少 primary route）时，生成器必须回退到模板化 RouteSet，并在 provenance 中记录原因。
- **Prompt ID / `promptId`**：本 spec 为 RouteSet LLM prompt 分配的稳定字符串标识（例如 `blueprint.routeset.v1`），用于 provenance 追溯 prompt 版本。
- **External HTTP Contract / 外部 HTTP 契约**：`POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 的请求与响应结构，以及它们返回的 `routeSet.routes[*]` 已有字段（`id`、`kind`、`title`、`summary`、`rationale`、`riskLevel`、`costLevel`、`complexity`、`estimatedEffort`、`capabilities`、`steps` 等），以 `server/tests/blueprint-routes.test.ts` 中 45 个 E2E 用例所锁定的行为为准。
- **Subdomain Tests / 子域单测**：指 `server/routes/blueprint/*/service.test.ts` 等目录下共 48 个 co-located 子域单元测试。
- **SDK Smoke**：`client/src/lib/blueprint-api/` 目录下 SDK 的 happy-path 断言。
- **`BlueprintServiceContext`**：`server/routes/blueprint/context.ts` 中定义的依赖注入容器，包含 `llm.callJson`、`llm.getConfig`、`now`、`jobStore` 等。RouteSet LLM Generator 必须通过 `ctx.llm.callJson` 调用 LLM，而不得在实现内 `import { callLLMJson } from "../../core/llm-client.js"`。
- **Sandbox Derivation Pipeline / 沙箱派生管线**：`createRouteGenerationSandboxDerivation()` 生成的 capability invocations / evidence / role events / `sandbox.job.*` 事件管线。本 spec 要求 LLM 产出的路线继续被送入这套管线，以保持 Agent Crew 与事件面下游消费者的观察口径不变。

## 需求

### 需求 1：目标与范围对齐

**用户故事：** 作为 `/autopilot` 模块的主要维护者，我希望本 spec 有一个明确、可审核的范围边界，以便 design / tasks 阶段与后续跨 spec 协作都围绕同一条边界推进。

#### 验收标准

1.1 THE Feature_Scope SHALL 覆盖并且仅覆盖 RouteSet 这一阶段的 LLM 驱动：即 `server/routes/blueprint.ts` 中 `buildRouteSet()` 当前硬编码 3 条路线的推导路径，以及 `createRouteGenerationSandboxDerivation()` 之前、`BlueprintGenerationRequest` 到 `BlueprintRouteSet` 之间的数据派生环节。

1.2 THE Feature_Scope SHALL 将新增实现物理落地到 `server/routes/blueprint/routeset/` 目录下（例如新增 `route-llm-generator.ts` / `route-schema.ts` 之类文件），并把对应 co-located 单元测试放在同目录下。

1.3 THE Feature_Scope SHALL NOT 修改 `createRouteGenerationSandboxDerivation()` 当前的模板化 capability / evidence 派生逻辑，也不要求 `docker-analysis-sandbox` 真正执行 Docker、不要求 `mcp-github-source` 真正执行 MCP、不要求 `skill-svg-architecture` 或 `role-system-architecture` 执行真实能力调用；这些项目留给后续独立的 capability-bridge feature。

1.4 THE Feature_Scope SHALL NOT 修改 SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 各自的生成路径；这些阶段的 LLM 驱动由各自独立 spec 推进。

1.5 THE Feature_Scope SHALL NOT 在本 spec 范围内变更 Clarification 子域的 LLM 调用方式；它作为参考实现被复用其模式（`generationSource` 命名、provenance 字段形态、失败回退策略），但不被本 spec 重新实现。

### 需求 2：LLM 驱动的 RouteSet 生成契约

**用户故事：** 作为 `/autopilot` 的用户，我希望我填写的 intake 目标、clarification 答案、GitHub 仓库链接和领域上下文真正影响到系统推荐给我的候选路线，而不是无论我怎么回答都得到相同的 3 条模板路线。

#### 验收标准

2.1 THE RouteSet_Generator SHALL 以 `(intake, clarificationSession.answers, githubUrls, domainContext)` 为 LLM 输入，通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，推导并返回用于构造 `BlueprintRouteSet.routes` 的 `BlueprintRouteCandidate[]`。

2.2 THE RouteSet_Generator SHALL 保证返回的候选路线中恰好存在一条 `kind === "primary"` 路线，并支持一条或多条 `kind === "alternative"` 路线；`routes` 数组长度上下界由 design 阶段确定，但至少包含 1 条 primary 路线。

2.3 THE RouteSet_Generator SHALL 为每一条返回的候选路线填充以下字段：`id`、`kind`、`title`、`summary`、`rationale`、`riskLevel`、`costLevel`、`complexity`、`estimatedEffort`，以及一份 `capabilities: BlueprintCapabilityUsage[]` 能力使用清单；这些字段必须与现有 `BlueprintRouteCandidate` 类型在 `server/tests/blueprint-routes.test.ts` 的 45 条用例中所锁定的字段含义保持兼容。

2.4 WHEN LLM 成功返回符合契约的候选路线，THE RouteSet_Generator SHALL 使用 LLM 输出替换现有 `buildRouteSet()` 模板化的 3 条候选路线，而不是与模板化输出并列或合并。

2.5 THE RouteSet_Generator SHALL 保证最终返回给 `buildRouteSet()` 的结构可以直接用于构造 `BlueprintRouteSet.routes` 与 `BlueprintRouteSet.primaryRouteId`，不引入需要调用方在 `buildRouteSet()` 之外再做一轮合成的新中间态。

### 需求 3:Prompt 与响应 schema 约束

**用户故事：** 作为负责 RouteSet 生成器的实现者与评审者，我希望 prompt 输入与 LLM 响应有稳定、可校验的 schema，以便既能让下游代码放心消费，也能在 LLM 偶发异常输出时快速诊断。

#### 验收标准

3.1 THE RouteSet_Generator SHALL 使用一个稳定字符串 `promptId`（例如 `blueprint.routeset.v1`）标识 RouteSet LLM prompt 的当前版本；`promptId` 的确切形态与命名由 design 阶段确定。

3.2 THE RouteSet_Generator SHALL 构造确定性的 prompt payload，其内容至少包含：`promptId`、`intake.targetText`、`intake.githubUrls`、`clarificationSession` 的 `strategyId` / `templateId` / `answers` 摘要，以及可选的 `domainContext`。Prompt 的完整 schema 在 design 阶段给出，但必须保证同一组 `(intake, clarificationSession.answers, githubUrls, domainContext)` 产生的 prompt payload 可被复现（用于回归测试）。

3.3 THE RouteSet_Generator SHALL 对 LLM 返回的 JSON 做 schema 校验，至少要求：`routes` 是数组；每一项含 `id` / `kind` / `title` / `summary` / `rationale` / `riskLevel` / `costLevel` / `complexity` / `estimatedEffort` / `capabilities`（或它们对应的 LLM 原始字段名，由 design 阶段的严格 schema 或 lenient schema 口径决定）；至少含有一条 `kind === "primary"` 的路线。

3.4 IF LLM 返回的 JSON 解析失败、schema 校验失败、缺少 primary route、`routes` 为空、或调用超时 / 网络错误，THEN THE RouteSet_Generator SHALL 触发需求 4 定义的回退路径，而不是把不完整的 LLM 输出塞进 `BlueprintRouteSet.routes`。

3.5 THE RouteSet_Generator SHALL 在 schema 校验通过后，对 LLM 返回字段做必要的规范化（例如裁剪过长字符串、强制枚举值落回受支持集合），以保证下游 `buildRouteSet()` 消费的候选路线满足 `BlueprintRouteCandidate` 的既有类型期望。

### 需求 4：回退路径与 provenance 语义

**用户故事：** 作为在生产环境 triage 问题的维护者，我希望 RouteSet 在 LLM 不可用时仍能给出一份可展示的候选路线，并且能从响应或事件里一眼看出这份 RouteSet 是如何产出的。

#### 验收标准

4.1 WHEN LLM 调用失败（网络错误、超时、无效 JSON、schema 校验失败、空 routes、缺少 primary route 等），THE RouteSet_Generator SHALL 退回到现有模板化 3 条路线的产出路径，并使返回的 `BlueprintRouteSet.routes` 与不走 LLM 的历史行为在字段结构上等价。

4.2 THE RouteSet_Generator SHALL 在 `BlueprintRouteSet.provenance` 中新增 LLM 相关追溯信息，至少包括：`generationSource: "llm" | "llm_fallback" | "template"`、`promptId`（当调用过 LLM 时）、`model`（当调用过 LLM 时）、clarification session 快照标识（例如答案 hash 或 sessionId），以及触发回退时的 `error` 原因；这些字段在响应中作为**可选**字段存在，历史消费者不应因缺少它们而失败。

4.3 THE RouteSet_Generator SHALL 让 `generationSource` 与 provenance 上的 `promptId`、`model`、`error` 字段与 clarification 子域已有 LLM provenance 的命名口径对齐（`server/routes/blueprint.ts` 中 clarification 生成器当前已经产出 `generationSource: "llm" | "llm_fallback" | "template"` 与 `promptId` / `model` / `error`），而不是另立一套命名。

4.4 IF 在 LLM 调用前就判定无需走 LLM（例如未来通过 feature flag 显式关闭），THEN THE RouteSet_Generator SHALL 标记 `generationSource === "template"`，并省略 `promptId` / `model` / `error`。

4.5 WHERE 存在多轮重试，THE RouteSet_Generator SHALL 保证 `provenance.error` 仅在**最终进入回退路径**时被填充；中间重试成功的情况下不得在 provenance 中写入噪音 error。

### 需求 5：向后兼容与响应结构稳定性

**用户故事：** 作为 `/autopilot` 已经上线的前端页面、SDK 与集成测试的维护者，我希望本 spec 对我完全是"可选字段增强、既有字段无感知变化"的——不改 URL、不改请求结构、不让 45 个 E2E 与 48 个子域单测因为字段差异而失败。

#### 验收标准

5.1 THE HTTP_Contract SHALL 保持 `POST /api/blueprint/jobs` 与 `POST /api/blueprint/generations` 的 URL、HTTP 方法、请求体结构、以及既有响应体字段（含 `routeSet.routes[*]` 的 `id` / `kind` / `title` / `summary` / `rationale` / `riskLevel` / `costLevel` / `complexity` / `estimatedEffort` / `capabilities` 等）完全不变。

5.2 THE RouteSet_Generator SHALL 仅通过**追加可选字段**的方式扩展 `BlueprintRouteSet.provenance`（如需求 4 所列字段）；不得删除、不得重命名现有 provenance 字段，也不得把既有字段改为必填或变更类型。

5.3 THE Feature SHALL 保持 `server/tests/blueprint-routes.test.ts` 中原有 45 条端到端 E2E 用例与 48 条子域 co-located 单测继续通过，且这 93 条用例不得被改写或删除以迁就新行为。

5.4 THE Feature SHALL 保持 `client/src/lib/blueprint-api/` 目录下 SDK smoke 现有的通过状态；若新增 provenance 字段需要在 SDK 侧补 normalizer，必须以追加方式实现，不得修改既有 normalizer 的输出语义。

5.5 IF 在实现过程中发现必须修改 `server/tests/blueprint-routes.test.ts` 或任一既有子域单测才能让 LLM 路径通过，THEN THE Feature SHALL 视该情况为违反本需求，必须调整实现而不是调整测试。

### 需求 6：`BlueprintServiceContext` 注入与可测试性

**用户故事：** 作为 RouteSet LLM Generator 的单元测试作者，我希望生成器完全通过 `BlueprintServiceContext` 拿到 LLM 能力，以便我可以在测试里注入 mock LLM、可控时间与可控 jobStore，验证生成器在 happy / fallback / schema-mismatch 三条路径下的行为。

#### 验收标准

6.1 THE RouteSet_Generator SHALL 通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，并通过 `BlueprintServiceContext.llm.getConfig` 读取模型配置；实现文件内 SHALL NOT 直接 `import { callLLMJson } from "../../core/llm-client.js"` 或 `import { getAIConfig } from "../../core/ai-config.js"`。

6.2 THE RouteSet_Generator SHALL 被组织为一个工厂函数（形如 `createRouteSetLlmGenerator(ctx)` 或等价结构），其构造签名只接收 `BlueprintServiceContext`，而不接收模块级单例依赖。具体签名由 design 阶段确定。

6.3 THE RouteSet_Generator SHALL 可以通过 `buildBlueprintServiceContext({ llm: { callJson, getConfig } })` 注入自定义 LLM 适配器，从而在端到端测试中被替换为返回固定 JSON、返回错误、抛超时等 mock 实现。

6.4 THE RouteSet_Generator SHALL 支持在不实际发起 HTTP / LLM 请求的前提下完成子域单测，只要测试端提供一个满足 `BlueprintServiceContext` 的 mock 装配。

### 需求 7：事件家族与 `generationSource` 广播

**用户故事：** 作为 Artifact Replay、Agent Crew 面板与运维监控的消费者，我希望从事件流里能直接读出"这份 RouteSet 是 LLM 产出的还是模板回退的"，而不是反推响应字段。

#### 验收标准

7.1 THE RouteSet_Generator SHALL 在 RouteSet 生成完成时，经由 `BlueprintServiceContext.eventBus` 发出一个 `route.generated`（或已有等价的 `route.*` 事件，由 design 阶段确定），其 payload 至少携带 `generationSource: "llm" | "llm_fallback" | "template"`、`promptId`（当 `generationSource === "llm" | "llm_fallback"` 时）、`model`（当调用过 LLM 时）。

7.2 WHERE 现有 `clarification.*` 事件已经在 payload 里携带 `generationSource`，THE RouteSet_Generator SHALL 采用与之命名、字段形态一致的结构，而不是在 `route.*` 事件上另立命名。

7.3 THE RouteSet_Generator SHALL 继续沿用 `shared/blueprint/` 下的 `BlueprintEventName` 常量来源；新增或扩展的事件名不得以裸字符串字面量出现在 `server/routes/blueprint/routeset/` 以外的其它文件。

7.4 THE Feature SHALL 保证新增的事件字段是**可选**字段；既有依赖 `route.*` 事件的消费者（含 Artifact Replay、Agent Crew 面板、`blueprint-routes.test.ts` 中所有断言 `route.*` 的用例）不得因为字段追加而断言失败。

### 需求 8：沙箱派生管线继续运行

**用户故事：** 作为依赖 Agent Crew 存在事件（`role.capability_invoked` / `role.review_completed`）与 `sandbox.job.*` 事件流的下游（含任务墙面 HUD、角色时间线面板），我希望 RouteSet 升级为 LLM 产出之后，我订阅的事件流不会突然失去能力调用事件。

#### 验收标准

8.1 WHEN LLM 产出 RouteSet 成功，THE Feature SHALL 把 LLM 产出的候选路线继续送入既有 `createRouteGenerationSandboxDerivation()` 管线，使其照常生成 capability invocations、capability evidence、`role.*` 事件与 `sandbox.job.*` 事件。

8.2 WHEN LLM 失败并回退到模板化 RouteSet，THE Feature SHALL 让沙箱派生管线按与当前行为等价的方式工作（即与今天不走 LLM 的执行路径保持一致）。

8.3 THE Feature SHALL 允许 `createRouteGenerationSandboxDerivation()` 在本 spec 范围内继续保持其模板化实现（即 `outputSummary`、固定日志、`durationMs = 180 + index * 30`、`blueprint.runtime.docker.simulated` / `blueprint.runtime.mcp.github.simulated` 等 adapter 命名不变），将"让沙箱派生本身也变成真实能力调用"留给独立的 capability-bridge feature。

### 需求 9：测试口径与不在范围内事项

**用户故事：** 作为代码评审人，我希望在评审阶段就能按照一组明确、可核对的测试清单判断本 spec 是否到位，以及哪些"周边改动"必须放到后续 spec。

#### 验收标准

9.1 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 中至少新增 2 条 E2E 用例：
  - **(a) Happy path**：mock LLM 返回结构化 routes，断言响应的 `routeSet.routes` 来自 LLM，`routeSet.provenance.generationSource === "llm"`、`routeSet.provenance.promptId` 被写入；
  - **(b) Fallback path**：mock LLM 抛错或返回非法 JSON，断言响应的 `routeSet.routes` 退回到模板化 3 条路线，`routeSet.provenance.generationSource === "llm_fallback"`、`routeSet.provenance.error` 被填充。

9.2 THE Feature SHALL 在 `server/routes/blueprint/routeset/` 下新增 co-located 单元测试，至少验证：
  - schema 校验拒绝 `routes` 缺失 / 缺 primary / `kind` 非法 / 关键字段缺失等 malformed 输入；
  - fallback 返回与当前 `buildRouteSet()` 3 条路线结构一致；
  - 在 happy / fallback 两条路径下 `provenance` 都被正确填充（happy 含 `promptId` / `model`、fallback 含 `error` 且 `generationSource === "llm_fallback"`）。

9.3 THE Feature SHALL NOT 在本轮引入 property-based test（PBT）；若 tasks 阶段出现任何被标注为 PBT 的任务，必须显式写出要验证的不变量（invariant），否则应当改为 example-based test。

9.4 THE Feature SHALL NOT 要求修改 `docker-analysis-sandbox`、`mcp-github-source`、`skill-svg-architecture`、`aigc-spec-node`、`role-system-architecture` 任一 capability adapter 的实际行为（让它们从 simulated 升级为真实执行由独立 capability-bridge feature 推进）。

9.5 THE Feature SHALL NOT 要求改造 SPEC Tree、SPEC Documents、Effect Preview、Prompt Package、Engineering Handoff 的生成逻辑；LLM 驱动这些阶段由各自独立 spec 推进，不作为本 spec 的验收前提。

9.6 THE Feature SHALL NOT 改动 `server/tests/blueprint-routes.test.ts` 中原有 45 条 E2E 用例、48 条子域 co-located 单测或 SDK smoke 既有断言；本 spec 只新增用例，不改写或删除既有用例。

9.7 THE Feature SHALL NOT 进行非本 spec 必要的 UI 改动；`generationSource` 是否在 `/autopilot` 既有页面上可见，属于可选增强，如果在实现阶段发现自然落点可以顺带追加（以可选 UI 字段形式），否则留作后续 UI spec 处理。

9.8 THE Feature SHALL NOT 引入 Web-AIGC runtime main line、task-autopilot Phase 1 或 blueprint 模块以外的运行时 / 治理 / observability 主线改动作为验收条件；这些主线由各自 steering 推进，本 spec 只保证不引入新的倒退。
