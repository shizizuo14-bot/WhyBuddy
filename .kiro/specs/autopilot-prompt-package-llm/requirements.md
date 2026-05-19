# 需求文档：Autopilot Prompt Package LLM 驱动生成

## 简介

`/autopilot` 的 11 节点叙事（见 `docs/autopilot-target-experience-architecture-2026-05-07.svg`）要求：**澄清结束之后的每一个阶段，都应由 LLM / Docker / MCP / AIGC-node 能力网络真正驱动，沙箱派生产出真实证据，再由这些证据推导出下游产物**。前序 spec `autopilot-routeset-llm-generation` 已经在 RouteSet 阶段把 3 条硬编码候选路线升级为 LLM 产出；`autopilot-spec-tree-llm` 把 SPEC Tree 节点集合升级为 LLM 产出；`autopilot-spec-documents-llm` 把 Requirements / Design / Tasks 文档内容升级为 LLM 产出；`autopilot-effect-preview-llm` 把 Effect Preview 的 HUD / console / log timeline / runtime projection 升级为 LLM 产出。它们共同确立了这条流水线的标准模式：

- `BlueprintServiceContext.llm.callJson` 注入；
- `promptId` / `model` / `error` + `generationSource: "llm" | "llm_fallback" | "template"` 写入 `provenance`；
- 严格 zod schema 校验，任何失败都回退到今天的模板化实现；
- locale-aware prompt（zh-CN / en-US）；
- 事件 payload 以可选字段方式追加 `generationSource` / `promptId` / `model`；
- 不改既有 HTTP 契约、不修既有 E2E / 子域单测。

本 spec 把同一模式应用到 **Prompt Package 生成阶段**。当前 `server/routes/blueprint.ts` 里的 `generateImplementationPromptPackages()`（约第 8846 行）与其内部调用的 `buildImplementationPromptPackage()`（约第 10526 行）仍然是模板化实现：

- 标题、摘要、`content`（最终打包文本）、`sections` 都由固定字符串模板与 SPEC 文档 / Effect Preview 字段拼接推导；
- 每个目标平台（`BlueprintImplementationPromptTargetPlatform`）以统一模板骨架套娃，不真正作为 prompt 去让 LLM 推导系统提示词 / 用户提示词 / 变量 / 示例；
- 节点、源文档、源预演 ID 由代码遍历 `sourceDocuments` / `sourcePreviews` 填充，但**每份 prompt 的 `systemPrompt` / `userPrompt` / `variables` / `examples` 等一等对象从未作为 LLM prompt 去推导**；
- 从未调用 `ctx.llm.callJson`，也从未在 provenance 中写入 `generationSource` / `promptId` / `model`；
- 当前路径上已 emit `BlueprintEventName.PromptPackaged`（`prompt.packaged`）事件，但 payload 上没有 LLM provenance 扩展点。

本 spec 针对 `/autopilot` 中 **Prompt Package 生成路径** 这一片工程债，按照 RouteSet / SPEC Tree / SPEC Documents / Effect Preview 已经验证过的 LLM 驱动模式（`callLLMJson` → 严格 zod schema → fallback → provenance + `generationSource`），把硬编码 Prompt Package 升级为由 intake、澄清答案、选中路线、SPEC Tree 节点集合、SPEC 文档内容、Effect Preview 产物与可选上游证据共同推导出的结构化可复用 prompt 资产。**本 spec 严格限定在 Prompt Package 这一阶段的 LLM 驱动**；RouteSet、SPEC Tree、SPEC Documents、Effect Preview 已有独立 spec，Engineering Handoff 的 LLM 驱动由独立 spec 推进；让 `docker-analysis-sandbox` 真正跑 Docker、让 `mcp-github-source` 真正调 MCP、让 `aigc-spec-node` 真正调 AIGC 节点、让 `role-system-architecture` 真正执行角色能力都由独立的 capability-bridge feature 推进。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **Prompt Package / `BlueprintImplementationPromptPackage`**：`shared/blueprint/contracts.ts` 中定义的实现 prompt 打包对象（约第 1179 行），字段包含 `id`、`jobId`、`treeId`、`nodeIds`、`sourceDocumentIds`、`sourcePreviewIds`、`targetPlatform`、`target`、`title`、`summary`、`content`、`sections: BlueprintImplementationPromptSection[]`、`createdAt`、`updatedAt?`，以及嵌套的 `provenance`（含 `jobId`、`projectId?`、`sourceId?`、`targetText?`、`githubUrls`、`treeVersion`、`nodeIds`、`sourceDocumentIds`、`sourcePreviewIds`、`targetPlatform`、`sourceDocumentStatus`、`sourcePreviewStatus`、`includeDrafts`、`includePreviewDrafts`、`sourceDocumentStatuses`、`sourcePreviewStatuses`）。
- **Prompt Package LLM Generator / Prompt Package 生成器**：本 spec 引入的新组件，落点在 `server/routes/blueprint/prompt-package/` 目录下（具体文件组织由 design 阶段确定），接收 `(intake, clarificationSession.answers, selectedRoute, specTreeNodes, sourceDocuments, sourcePreviews, targetPlatform, upstreamEvidence?)`，通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，返回可以直接用于构造 `BlueprintImplementationPromptPackage.title` / `summary` / `content` / `sections` 与新增的 prompt 资产清单（`prompts: Array<{ id, title, systemPrompt, userPrompt, variables, examples? }>`）的结构化结果。
- **`generationSource`**：沿用 RouteSet / SPEC Tree / SPEC Documents / Effect Preview / Clarification 子域现有语义的字符串枚举 `"llm" | "llm_fallback" | "template"`，挂在相关事件与 `BlueprintImplementationPromptPackage.provenance` 上，表达当前 Prompt Package 是 LLM 直接产出、LLM 失败回退到模板、还是从未走过 LLM。
- **Templated Prompt Package / 模板化 Prompt Package**：现状实现，即 `generateImplementationPromptPackages()` 调用 `buildImplementationPromptPackage()` 等一系列函数联合产出的硬编码 `BlueprintImplementationPromptPackage`。
- **Fallback / 回退路径**：当 LLM 调用失败（网络错误、超时、返回无效 JSON、zod schema 校验不通过、`prompts` / `sections` 为空、`id` 重复、字符串越界等）时，生成器必须回退到模板化 Prompt Package，并在 provenance 中记录原因。
- **Prompt ID / `promptId`**：本 spec 为 Prompt Package LLM prompt 分配的稳定字符串标识（固定为 `blueprint.prompt-package.v1`），用于 provenance 追溯 prompt 版本。此处的 `promptId` 指的是 **LLM 生成器本身使用的 meta-prompt 版本标识**；与生成器最终产出的、供下游工程落地使用的 `prompts[*].id` 是两个不同层面的概念。
- **External HTTP Contract / 外部 HTTP 契约**：`POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 以及相关 `/prompt-packages/*` 路由的请求与响应结构，以及它们返回的 `promptPackages[*]` 字段中 `BlueprintImplementationPromptPackage` 的既有字段（`id` / `targetPlatform` / `target` / `title` / `summary` / `content` / `sections` / `nodeIds` / `sourceDocumentIds` / `sourcePreviewIds` / `provenance.*` 等），以 `server/tests/blueprint-routes.test.ts` 中 47 条 E2E 用例所锁定的行为为准。
- **Subdomain Tests / 子域单测**：指 `server/routes/blueprint/*/service.test.ts` 等目录下共 48 条 co-located 子域单元测试。
- **SDK Smoke**：`client/src/lib/blueprint-api/` 目录下 SDK 的 happy-path 断言。
- **`BlueprintServiceContext`**：`server/routes/blueprint/context.ts` 中定义的依赖注入容器，包含 `llm.callJson`、`llm.getConfig`、`now`、`jobStore`、`eventBus` 等。Prompt Package LLM Generator 必须通过 `ctx.llm.callJson` 调用 LLM，而不得在实现内 `import { callLLMJson } from "../../core/llm-client.js"`。
- **Upstream Evidence / 上游证据**：可选输入，包含但不限于 RouteSet 沙箱派生管线产出的 capability invocations / capability evidence、AIGC-node 证据等。本 spec 不要求这些 capability 先行落地；上游证据在本 spec 范围内作为**可选输入**存在，若为空，Prompt Package 生成器照常工作，只是 prompt 中缺少相应上下文块。
- **Adapter String / adapter 命名**：若 Prompt Package 相关运行时路径在 provenance 或事件中携带 `adapter` 字段，需遵循与 RouteSet / SPEC Tree / SPEC Documents / Effect Preview spec 对齐的命名约定：LLM 真实路径 `adapter` 不得包含 `.simulated`，默认建议为 `blueprint.prompt-package.llm`；模板回退路径保留原有 `adapter` 命名不变。

## 需求

### 需求 1：目标与范围对齐

**用户故事：** 作为 `/autopilot` 模块的主要维护者，我希望本 spec 有一个明确、可审核的范围边界，以便 design / tasks 阶段与后续跨 spec 协作都围绕同一条边界推进。

#### 验收标准

1.1 THE Feature_Scope SHALL 覆盖并且仅覆盖 Prompt Package 这一阶段的 LLM 驱动：即 `server/routes/blueprint.ts` 中 `generateImplementationPromptPackages()` / `buildImplementationPromptPackage()` 当前硬编码 prompt 内容的推导路径，以及从 `(BlueprintGenerationJob, BlueprintSpecTree, BlueprintSpecTreeNode[], BlueprintSpecDocument[], BlueprintEffectPreview[], BlueprintGenerateImplementationPromptPackagesRequest)` 到 `BlueprintImplementationPromptPackage` 之间的数据派生环节。

1.2 THE Feature_Scope SHALL 将新增实现物理落地到 `server/routes/blueprint/prompt-package/` 目录下（例如新增 `prompt-package-llm-generator.ts` / `prompt-package-schema.ts` 之类文件），并把对应 co-located 单元测试放在同目录下；具体文件命名与组织由 design 阶段确定。

1.3 THE Feature_Scope SHALL NOT 修改 `createRouteGenerationSandboxDerivation()`、`docker-analysis-sandbox`、`mcp-github-source`、`aigc-spec-node`、`role-system-architecture` 等 capability adapter 的实际行为，也不要求它们从 simulated 升级为真实执行；这些项目留给独立的 capability-bridge feature。

1.4 THE Feature_Scope SHALL NOT 修改 RouteSet（已由 `autopilot-routeset-llm-generation` 覆盖）、SPEC Tree（已由 `autopilot-spec-tree-llm` 覆盖）、SPEC Documents（已由 `autopilot-spec-documents-llm` 覆盖）、Effect Preview（已由 `autopilot-effect-preview-llm` 覆盖）、Engineering Handoff 各自的生成路径；这些阶段的 LLM 驱动由各自独立 spec 推进。

1.5 THE Feature_Scope SHALL NOT 变更 Clarification 子域、RouteSet 子域、SPEC Tree 子域、SPEC Documents 子域、Effect Preview 子域或 Agent Crew 阶段事件子域的 LLM 调用方式；它们作为参考实现被复用其模式（`generationSource` 命名、provenance 字段形态、失败回退策略），但不被本 spec 重新实现。

1.6 THE Feature_Scope SHALL NOT 修改前端 Prompt Package 相关工作台 UI 组件；`generationSource` 在前端是否可见属于可选增强，落点与时机由独立 UI spec 决定，不作为本 spec 的验收前提。

1.7 THE Feature_Scope SHALL NOT 改动 GitHub Pages 静态预览（browser-only）或浏览器端 runtime；本 spec 仅作用于服务端 `server/routes/blueprint/*` 与 `shared/blueprint/*` 的兼容追加。

### 需求 2：LLM 驱动的 Prompt Package 生成契约

**用户故事：** 作为工程落地环节的承接者，我希望拿到的 Prompt Package 是真正结合了我的目标、澄清答案、路线、SPEC 文档与效果预演推导出来的可复用 prompt 资产，而不是无论输入如何都得到同一套模板 prompt 骨架。

#### 验收标准

2.1 THE PromptPackage_Generator SHALL 以 `(intake, clarificationSession.answers, selectedRoute, specTreeNodes, sourceDocuments, sourcePreviews, targetPlatform, upstreamEvidence?)` 为 LLM 输入，通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，推导并返回用于构造 `BlueprintImplementationPromptPackage.title` / `summary` / `content` / `sections` 与新增的可复用 prompt 资产清单的结构化结果。

2.2 THE PromptPackage_Generator SHALL 以**每份 Prompt Package**（即 `(nodeIds, targetPlatform, includeDrafts, includePreviewDrafts)` 组合）为一次独立的 LLM 调用单位：当 `generateImplementationPromptPackages()` 在一次请求中为 M 个目标平台生成 M 份 Prompt Package 时，每一份 Package 各自独立走 LLM 路径或 fallback 路径，互不影响。

2.3 THE PromptPackage_Generator SHALL 保证返回的 LLM 结果至少包含以下字段：顶层 `title: string`、`summary: string`、`prompts: Array<{ id: string, title: string, systemPrompt: string, userPrompt: string, variables: Array<{ name: string, description: string, required: boolean }>, examples?: Array<{ title?: string, input?: string, output?: string }> }>`、`sections: Array<{ heading: string, body: string }>`；具体 schema 细节由 design 阶段给出，但必须满足需求 3 的 schema 约束。

2.4 THE PromptPackage_Generator SHALL 在构造 `BlueprintImplementationPromptPackage` 时，把 LLM 返回的 `prompts` 与 `sections` 渲染为稳定的 `content`（例如按 `# ${title}` + 每份 prompt 的 `systemPrompt` / `userPrompt` / `variables` / `examples` + 按序输出 `sections[*]` 的 `## ${heading}` + `body`）与既有 `sections: BlueprintImplementationPromptSection[]` 字段结构兼容的对象，并保留一条可复现的渲染规则，以便下游 Engineering Landing Plan 生成、Artifact Replay 与外部落地消费。

2.5 THE PromptPackage_Generator SHALL 根据设计阶段的 locale 读取策略（例如 `ctx.llm.getConfig()` 暴露的 locale 或 intake / request 上携带的 locale），以 zh-CN 或 en-US 产出 `title` / `summary` / `sections[*].heading` / `sections[*].body` / `prompts[*].title` / `prompts[*].systemPrompt` / `prompts[*].userPrompt` / `prompts[*].variables[*].description` / `prompts[*].examples[*]` 等，保持与前序 LLM Generator locale-aware 行为的一致性。

2.6 WHEN LLM 成功返回符合契约的结果，THE PromptPackage_Generator SHALL 使用 LLM 输出替换现有 `buildImplementationPromptPackage()` 产出的硬编码字段，而不是与模板化输出并列或合并。

2.7 THE PromptPackage_Generator SHALL 保证最终返回给 `generateImplementationPromptPackages()`（或其等价装配点）的结构可以直接用于构造 `BlueprintImplementationPromptPackage`，不引入需要调用方在 `generateImplementationPromptPackages()` 之外再做一轮合成的新中间态；也不得改变 `BlueprintImplementationPromptPackage` 中由 job / treeId / nodeIds / sourceDocumentIds / sourcePreviewIds / targetPlatform / provenance 派生的既有字段的含义。

2.8 THE PromptPackage_Generator SHALL 在发起 LLM 调用时，将超时时间上限控制在 30 秒以内；超时即视为失败并触发需求 5 定义的回退路径。

### 需求 3：Prompt 与响应 schema 约束

**用户故事：** 作为负责 Prompt Package 生成器的实现者与评审者，我希望 prompt 输入与 LLM 响应有稳定、可校验的 schema，以便既能让下游 Engineering Landing Plan 生成与外部落地放心消费，也能在 LLM 偶发异常输出时快速诊断。

#### 验收标准

3.1 THE PromptPackage_Generator SHALL 使用一个稳定字符串 `promptId`（本 spec 固定为 `blueprint.prompt-package.v1`）标识 Prompt Package LLM prompt 的当前版本；此处的 `promptId` 与生成器最终产出的 `prompts[*].id` 是两个不同层面的概念。

3.2 THE PromptPackage_Generator SHALL 构造确定性的 prompt payload，其内容至少包含：`promptId`、`targetPlatform`、`intake.targetText`、`intake.githubUrls`、`clarificationSession` 的 `strategyId` / `templateId` / `answers` 摘要、`selectedRoute` 的 `id` / `title` / `summary` / `rationale` / `steps` / `capabilities`、`specTreeNodes` 的 `id` / `type` / `title` / `summary` / `dependencies` / `outputs` 摘要、`sourceDocuments` 的 `id` / `type` / `title` / `summary` / `content` 摘要、`sourcePreviews` 的 `id` / `nodeId` / `summary` / `architectureNotes` / `prototypeNotes` / `progressPlan` / `runtimeProjection.hudState` 摘要、可选的 `upstreamEvidence` 摘要。Prompt 的完整 schema 在 design 阶段给出，但必须保证同一组输入产生的 prompt payload 可被复现（用于回归测试）。

3.3 THE PromptPackage_Generator SHALL 使用 zod 严格 schema 校验 LLM 返回的 JSON，至少要求：
  - 顶层字段为 `title: string`、`summary: string`、`prompts: Array<...>`、`sections: Array<...>`；
  - 每个 prompt 含 `id: string`、`title: string`、`systemPrompt: string`、`userPrompt: string`、`variables: Array<{ name: string, description: string, required: boolean }>`，可选 `examples: Array<{ title?: string, input?: string, output?: string }>`；
  - 每个 section 含 `heading: string`、`body: string`；
  - `prompts` 数组长度 `.min(1).max(20)`；
  - 每个 prompt 的 `variables` 数组长度 `.min(0).max(30)`；
  - 每个 prompt 的 `examples` 数组长度 `.max(10)`；
  - `sections` 数组长度 `.min(1).max(20)`；
  - 单个 `systemPrompt` / `userPrompt` / `body` 的长度上界由 design 阶段在更紧口径内确定（建议 `systemPrompt ≤ 4000`、`userPrompt ≤ 4000`、`body ≤ 5000`），但必须在 schema 中显式表达；
  - `title` / `summary` / `prompts[*].title` / `prompts[*].id` / `sections[*].heading` / `variables[*].name` / `variables[*].description` 的长度上界由 design 阶段在更紧口径内确定（建议 `title ≤ 200`、`summary ≤ 500`、`prompts[*].title ≤ 200`、`id ≤ 128`、`heading ≤ 200`、`variables[*].name ≤ 64`、`variables[*].description ≤ 500`），必须在 schema 中显式表达。

3.4 THE PromptPackage_Generator SHALL 在 zod schema 中使用 `.refine()`（或等价结构）断言以下 package 级不变量：
  - `prompts` 数组中所有 `prompts[*].id` 在同一份 Package 内唯一；
  - 每个 prompt 内 `variables[*].name` 在该 prompt 内唯一（不区分大小写与前后空白）；
  - `sections` 中所有 `heading` 在同一份 Package 内唯一（不区分大小写与前后空白）；
  - `title` / `summary` / `prompts[*].title` / `prompts[*].systemPrompt` / `prompts[*].userPrompt` / `sections[*].body` trim 后非空；
  - `prompts[*].variables[*].required` 必须是布尔值，不接受 string `"true"` / `"false"`。

3.5 IF LLM 返回的 JSON 解析失败、zod schema 校验失败、`prompts` 为空、`sections` 为空、某个 `id` 重复、`variable.name` 重复、字符串越界、枚举值不可解析、或调用超时 / 网络错误，THEN THE PromptPackage_Generator SHALL 触发需求 5 定义的回退路径，而不是把不完整的 LLM 输出塞进 `BlueprintImplementationPromptPackage`。

3.6 THE PromptPackage_Generator SHALL 在 schema 校验通过后，对 LLM 返回字段做必要的规范化（例如裁剪过长字符串至 schema 允许的上界、trim 首尾空白、对 `prompts[*].id` 做 slug 化 / 去重补数字后缀、去重 `variables[*].name` 与 `sections[*].heading`、为缺失的 `examples` 补齐空数组），以保证下游 `BlueprintImplementationPromptPackage` 的字段形态仍与现有类型期望一致。

### 需求 4：Prompt Package 真实产物与 provenance 扩展

**用户故事：** 作为在生产环境 triage 问题的维护者，我希望 Prompt Package 最终落盘的对象明确记录"这份 Prompt Package 是 LLM 推导出的、LLM 失败回退的、还是从未走过 LLM"，以及 prompt 版本与模型标识，便于事后对账。

#### 验收标准

4.1 THE PromptPackage_Generator SHALL 在 `BlueprintImplementationPromptPackage.provenance` 中新增 LLM 相关追溯信息，至少包括：
  - `generationSource: "llm" | "llm_fallback" | "template"`；
  - `promptId`（当 `generationSource` 为 `"llm"` 或 `"llm_fallback"` 时，指的是 LLM 生成器本身使用的 meta-prompt 版本标识）；
  - `model`（当调用过 LLM 时，从 `ctx.llm.getConfig()` 读取）；
  - 触发回退时的 `error` 原因（字符串或结构化对象，由 design 阶段确定）。

4.2 THE PromptPackage_Generator SHALL 将上述新字段作为**可选**字段追加到 `BlueprintImplementationPromptPackage.provenance`，不得删除、重命名或重定类型现有 `provenance` 字段（`jobId` / `projectId` / `sourceId` / `targetText` / `githubUrls` / `treeVersion` / `nodeIds` / `sourceDocumentIds` / `sourcePreviewIds` / `targetPlatform` / `sourceDocumentStatus` / `sourcePreviewStatus` / `includeDrafts` / `includePreviewDrafts` / `sourceDocumentStatuses` / `sourcePreviewStatuses`）。

4.3 THE PromptPackage_Generator SHALL 让 `generationSource` 与 provenance 上的 `promptId` / `model` / `error` 字段与 RouteSet / SPEC Tree / SPEC Documents / Effect Preview 子域已有 LLM provenance 的命名口径严格对齐，而不是另立一套命名。

4.4 WHERE Prompt Package 相关运行时路径在 provenance 或事件中携带 `adapter` 字段，THE PromptPackage_Generator SHALL 保证 LLM 真实路径的 `adapter` 不包含 `.simulated`（建议默认为 `blueprint.prompt-package.llm`），而模板回退路径保留原有 `adapter` 命名不变。

4.5 IF 在 LLM 调用前就判定无需走 LLM（例如未来通过 feature flag 或 `ctx.llm.getConfig().apiKey` 为空时显式关闭），THEN THE PromptPackage_Generator SHALL 标记 `generationSource === "template"`，并省略 `promptId` / `model` / `error`。

4.6 WHERE 存在多轮重试，THE PromptPackage_Generator SHALL 保证 `provenance.error` 仅在**最终进入回退路径**时被填充；中间重试成功的情况下不得在 provenance 中写入噪音 error。

4.7 WHERE 一次 `generateImplementationPromptPackages()` 请求同时产出多份 `BlueprintImplementationPromptPackage`（即 targetPlatforms 多于 1 个），THE PromptPackage_Generator SHALL 保证每份 Package 的 `provenance.generationSource` / `promptId` / `model` / `error` 彼此独立，不会因为其中一份走 fallback 而把其他走 LLM 成功的 Package 污染为 `"llm_fallback"`。

### 需求 5：回退路径与模板化等价性

**用户故事：** 作为 `/autopilot` 的运维者，我希望 Prompt Package 在 LLM 不可用时仍能给出一份结构等价、下游 Engineering Landing Plan 可继续消费、前端可直接展示的产物，而不是让整个 Prompt Package 生成流程直接失败。

#### 验收标准

5.1 WHEN 某一份 Package 的 LLM 调用失败（网络错误、超时、无效 JSON、zod schema 校验失败、`prompts` / `sections` 为空、`id` 重复、字符串越界、枚举值不可解析、规范化后仍不满足类型期望等），THE PromptPackage_Generator SHALL 退回到今天 `buildImplementationPromptPackage()` 的模板化产出路径，并使返回的单份 `BlueprintImplementationPromptPackage` 与不走 LLM 的历史行为在字段结构上等价。

5.2 THE Feature SHALL 保留现有 `buildImplementationPromptPackage()` 与其所有子辅助函数的模板化实现路径，不得在本 spec 范围内删除或改写它们；生成器在 fallback 时必须复用同一段代码作为产出来源。

5.3 WHEN fallback 被触发，THE PromptPackage_Generator SHALL 在返回的 `BlueprintImplementationPromptPackage.provenance` 中设置 `generationSource === "llm_fallback"`，并按需求 4 规定填充 `promptId` / `model` / `error`。

5.4 THE Feature SHALL 保证 fallback 路径下的 `BlueprintImplementationPromptPackage.id` / `jobId` / `treeId` / `targetPlatform` / `target` / `title` / `summary` / `content` / `sections` / `nodeIds` / `sourceDocumentIds` / `sourcePreviewIds` / `createdAt` / `updatedAt` 与今天不走 LLM 的行为逐字段一致；在既有 47 条 E2E 与 48 条子域单测使用默认（未注入 LLM mock）的 `BlueprintServiceContext` 时，响应不应因为本 spec 的接入而发生结构变化。

5.5 THE PromptPackage_Generator SHALL 保证 fallback 路径下被送入下游 Engineering Landing Plan 生成（`generateEngineeringLandingPlans()` 中对 `selectEngineeringLandingPromptPackages()` 与 `extractImplementationPromptPackages(job)` 的消费）、Artifact Replay 与任务墙面 HUD 的 Prompt Package 数据与今天的行为等价，不因 fallback 改变任何下游消费者看到的字段形态。

5.6 WHERE 一次 `generateImplementationPromptPackages()` 请求中部分 Package 走 LLM 成功、部分 Package 走 fallback，THE Feature SHALL 保证响应体 `promptPackages[*]` 数组顺序、长度、`targetPlatform` 覆盖集合与今天的历史行为一致，既有依赖该顺序的断言不因为混合 provenance 而失败。

### 需求 6：事件家族与 `generationSource` 广播

**用户故事：** 作为 Artifact Replay、Agent Crew 面板与运维监控的消费者，我希望从事件流里能直接读出"这份 Prompt Package 是 LLM 产出的还是模板回退的"，而不是反推响应字段。

#### 验收标准

6.1 WHERE `BlueprintEventName` 中已存在与 Prompt Package 生命周期语义匹配的事件（当前为 `PromptPackaged` 对应 `prompt.packaged`），AND 既有实现在 Prompt Package 生成主路径上 emit 这些事件（`generateImplementationPromptPackages()` 当前已 emit `BlueprintEventName.PromptPackaged`），THE PromptPackage_Generator SHALL 在这些事件的 payload 上以**可选**字段追加 `generationSource: "llm" | "llm_fallback" | "template"`、`promptId`（当 `generationSource` 为 `"llm"` 或 `"llm_fallback"` 时）、`model`（当调用过 LLM 时）、可选 `error`（当 `generationSource === "llm_fallback"` 时）。

6.2 THE Feature SHALL NOT 为本 spec 单独新增事件名；Prompt Package 生成器仅复用既有 `prompt.packaged` 事件上的可选字段位置暴露 `generationSource` 等信息。

6.3 WHERE 任何事件被用于承载 Prompt Package 的 `generationSource`，THE PromptPackage_Generator SHALL 采用与 RouteSet 子域 `route.generated` 事件、SPEC Tree 子域 `spec.tree.*` 事件、SPEC Documents 子域 `spec.document.*` 事件、Effect Preview 子域 `preview.*` 事件以及 clarification 子域 `clarification.*` 事件一致的命名、字段形态与语义，而不是在 `prompt.*` 事件上另立命名。

6.4 THE PromptPackage_Generator SHALL 继续沿用 `shared/blueprint/events.ts` 中的 `BlueprintEventName` 常量来源；对事件名的任何引用 SHALL NOT 以裸字符串字面量出现在 `server/routes/blueprint/prompt-package/` 以外的文件。

6.5 THE Feature SHALL 保证任何新增的事件字段都是**可选**字段；既有依赖 `prompt.packaged` 事件的消费者（含 Artifact Replay、Agent Crew 面板、`blueprint-routes.test.ts` 中所有断言 `prompt.*` 的用例）不得因为字段追加而断言失败。

### 需求 7：`BlueprintServiceContext` 注入与可测试性

**用户故事：** 作为 Prompt Package LLM Generator 的单元测试作者，我希望生成器完全通过 `BlueprintServiceContext` 拿到 LLM 能力，以便我可以在测试里注入 mock LLM、可控时间与可控 jobStore，验证生成器在 happy / fallback / schema-mismatch / api-key-missing 四条路径下的行为。

#### 验收标准

7.1 THE PromptPackage_Generator SHALL 通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，并通过 `BlueprintServiceContext.llm.getConfig` 读取模型配置与 locale；实现文件内 SHALL NOT 直接 `import { callLLMJson } from "../../core/llm-client.js"` 或 `import { getAIConfig } from "../../core/ai-config.js"`。

7.2 THE PromptPackage_Generator SHALL 被组织为一个工厂函数 `createPromptPackageLlmGenerator(ctx)`（或等价命名，由 design 阶段确认），其构造签名只接收 `BlueprintServiceContext`，而不接收模块级单例依赖。

7.3 THE PromptPackage_Generator SHALL 可以通过 `buildBlueprintServiceContext({ llm: { callJson, getConfig } })` 注入自定义 LLM 适配器，从而在端到端测试中被替换为返回固定 JSON、返回错误、抛超时等 mock 实现。

7.4 THE PromptPackage_Generator SHALL 支持在不实际发起 HTTP / LLM 请求的前提下完成子域单测，只要测试端提供一个满足 `BlueprintServiceContext` 的 mock 装配。

7.5 THE PromptPackage_Generator SHALL 仅依赖 `ctx.llm.callJson` / `ctx.llm.getConfig` / `ctx.logger`（以及必要时的 `ctx.now`）完成核心生成路径；不得在生成器内部隐式触碰 `ctx.jobStore` 或 `ctx.blueprintStores`，从而保持单测的最小依赖面。

### 需求 8：向后兼容与响应结构稳定性

**用户故事：** 作为 `/autopilot` 已经上线的前端页面、SDK 与集成测试的维护者，我希望本 spec 对我完全是"可选字段增强、既有字段无感知变化"的——不改 URL、不改请求结构、不让既有 E2E 与子域单测因为字段差异而失败。

#### 验收标准

8.1 THE HTTP_Contract SHALL 保持 `POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 以及相关 `/prompt-packages/*` 路由的 URL、HTTP 方法、请求体结构、以及既有响应体字段（含 `promptPackages[*]` 的 `id` / `jobId` / `treeId` / `nodeIds` / `sourceDocumentIds` / `sourcePreviewIds` / `targetPlatform` / `target` / `title` / `summary` / `content` / `sections` / `createdAt` / `updatedAt` / `provenance.*` 等）完全不变。

8.2 THE PromptPackage_Generator SHALL 仅通过**追加可选字段**的方式扩展 `BlueprintImplementationPromptPackage.provenance`（如需求 4 所列字段）；不得删除、不得重命名现有 `provenance` 字段，也不得把既有字段改为必填或变更类型。

8.3 THE Feature SHALL 保持 `server/tests/blueprint-routes.test.ts` 中原有 47 条端到端 E2E 用例与 48 条子域 co-located 单测继续通过，且这 95 条用例不得被改写或删除以迁就新行为。

8.4 THE Feature SHALL 保持 `client/src/lib/blueprint-api/` 目录下 SDK smoke 现有的通过状态；若新增 provenance 字段需要在 SDK 侧补 normalizer，必须以追加方式实现，不得修改既有 normalizer 的输出语义。

8.5 IF 在实现过程中发现必须修改 `server/tests/blueprint-routes.test.ts` 或任一既有子域单测才能让 LLM 路径通过，THEN THE Feature SHALL 视该情况为违反本需求，必须调整实现而不是调整测试。

8.6 THE Feature SHALL 保证默认未注入 LLM mock 的 `BlueprintServiceContext`（即 `ctx.llm.callJson` 走真实 `callLLMJson` 但 `apiKey` 未配置时）在 Prompt Package 生成路径上的行为等价于模板化输出，`generationSource === "template"`，以此不破坏本地开发与 CI 默认装配。

### 需求 9：测试口径与不在范围内事项

**用户故事：** 作为代码评审人，我希望在评审阶段就能按照一组明确、可核对的测试清单判断本 spec 是否到位，以及哪些"周边改动"必须放到后续 spec。

#### 验收标准

9.1 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 中至少新增 2 条 E2E 用例：
  - **(a) Happy path**：mock `ctx.llm.callJson` 返回结构化 Prompt Package 结果（含 `title` / `summary` / `prompts` / `sections`），断言响应的 `promptPackages[*].content` / `promptPackages[*].sections` 来自 LLM（内容明显区别于模板化输出），`promptPackages[*].provenance.generationSource === "llm"`，`promptPackages[*].provenance.promptId` 与 `promptPackages[*].provenance.model` 被写入；
  - **(b) Fallback path**：mock `ctx.llm.callJson` 抛错或返回非法 JSON / schema 不通过，断言响应的 `promptPackages[*]` 退回到模板化输出（结构上与今天 `buildImplementationPromptPackage()` 产出等价），`promptPackages[*].provenance.generationSource === "llm_fallback"`，`promptPackages[*].provenance.error` 被填充。

9.2 THE Feature SHALL 在 `server/routes/blueprint/prompt-package/` 下新增至少 4 条 co-located 单元测试，分别验证：
  - **happy**：给定合法 `BlueprintServiceContext` mock，生成器返回通过 zod schema 校验的 `title` / `summary` / `prompts` / `sections`，`generationSource === "llm"`；
  - **malformed JSON**：mock `callJson` 返回非 JSON / JSON 但结构不符，生成器进入 fallback，`generationSource === "llm_fallback"`，`error` 被填充；
  - **schema fails**：mock `callJson` 返回 JSON 但违反 zod schema（例如 `prompts` 为空 / `prompts[*].id` 重复 / `variables[*].name` 重复 / 字符串越界），生成器进入 fallback；
  - **api key missing**：mock `ctx.llm.getConfig()` 返回无 `apiKey` 配置，生成器直接走模板路径，`generationSource === "template"`（或 `"llm_fallback"`，由 design 阶段确定默认口径，但必须在测试中锁定）。

9.3 THE Feature SHALL NOT 在本轮引入 property-based test（PBT）；若 tasks 阶段出现任何被标注为 PBT 的任务，必须显式写出要验证的不变量（invariant），否则应当改为 example-based test。

9.4 THE Feature SHALL NOT 要求修改 `docker-analysis-sandbox`、`mcp-github-source`、`skill-svg-architecture`、`aigc-spec-node`、`role-system-architecture` 任一 capability adapter 的实际行为（让它们从 simulated 升级为真实执行由独立 capability-bridge feature 推进）。

9.5 THE Feature SHALL NOT 要求改造 RouteSet（已有 spec）、SPEC Tree（已有 spec）、SPEC Documents（已有 spec）、Effect Preview（已有 spec）、Engineering Handoff 的生成逻辑；LLM 驱动这些阶段由各自独立 spec 推进，不作为本 spec 的验收前提。

9.6 THE Feature SHALL NOT 改动 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例、48 条子域 co-located 单测或 SDK smoke 既有断言；本 spec 只新增用例，不改写或删除既有用例。

9.7 THE Feature SHALL NOT 进行非本 spec 必要的 UI 改动；`generationSource` 是否在 `/autopilot` 既有 Prompt Package 工作台或任务墙面上可见，属于可选增强，如果在实现阶段发现自然落点可以顺带追加（以可选 UI 字段形式），否则留作后续 UI spec 处理。

9.8 THE Feature SHALL NOT 引入 Web-AIGC runtime main line、task-autopilot Phase 1 或 blueprint 模块以外的运行时 / 治理 / observability 主线改动作为验收条件；这些主线由各自 steering 推进，本 spec 只保证不引入新的倒退。
