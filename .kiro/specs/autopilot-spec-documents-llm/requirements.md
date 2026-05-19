# 需求文档：Autopilot SPEC Documents LLM 驱动生成

## 简介

`/autopilot` 的 11 节点叙事（见 `docs/autopilot-target-experience-architecture-2026-05-07.svg`）要求：**澄清结束之后的每一个阶段，都应由 LLM / Docker / MCP / AIGC-node 能力网络真正驱动，沙箱派生产出真实证据，再由这些证据推导出下游产物**。前序 spec `autopilot-routeset-llm-generation` 已经把 3 条硬编码候选路线升级为 LLM 产出；紧接的 spec `autopilot-spec-tree-llm` 把 SPEC Tree 的节点生成升级为 LLM 产出；它们共同确立了这条流水线的标准模式：

- `BlueprintServiceContext.llm.callJson` 注入；
- `promptId` / `model` / `error` + `generationSource: "llm" | "llm_fallback" | "template"` 写入 `provenance`；
- 严格 zod schema 校验，任何失败都回退到今天的模板化实现；
- locale-aware prompt（zh-CN / en-US）；
- 事件 payload 以可选字段方式追加 `generationSource` / `promptId` / `model`；
- 不改既有 HTTP 契约、不修既有 E2E / 子域单测。

本 spec 把同一模式应用到 **SPEC Documents 生成阶段**。当前 `server/routes/blueprint.ts` 里的 `generateSpecDocuments()`（约第 8571 行）与其内部调用的 `buildSpecDocument()`（约第 11704 行）、`buildSpecDocumentHeading()`、`buildSpecDocumentBody()`、`buildSpecDocumentSectionLines()` 仍然是模板化实现：

- 文档标题由固定字符串拼接，例如 `"Requirements: ${nodeTitle}"` / `"Design: ${nodeTitle}"` / `"Tasks: ${nodeTitle}"`；
- 文档正文用固定的 Markdown 骨架（`## Summary` / `## Inputs` / `## Derived Content` / `## Reused Role Findings`）拼装，其中 `## Derived Content` 每个类型只有 3 行模板式 bullet；
- 每个 SPEC Tree 节点无差别地按 `types`（默认 `["requirements", "design", "tasks"]`）批量生成，不区分节点语义，也不真正消费 intake / clarification / 选中路线 / 上游证据；
- 节点 `id`、父子关系、`dependencies` / `outputs` 由代码拼装，但**文档 sections、body、summary 与裁剪逻辑从不作为 LLM prompt 去推导**；
- 从未调用 `ctx.llm.callJson`，也从未在 provenance 中写入 `generationSource` / `promptId` / `model`；
- 相关 `spec.document.*` 事件（`SpecDocumentVersioned` / `SpecDocumentReviewed`）在当前 `buildSpecDocument()` / `generateSpecDocuments()` 主路径上并未被 emit，事件 payload 上亦无 provenance 扩展点。

本 spec 针对 `/autopilot` 中 **SPEC Documents 生成路径** 这一片工程债，按照 RouteSet / SPEC Tree 已经验证过的 LLM 驱动模式（`callLLMJson` → 严格 zod schema → fallback → provenance + `generationSource`），把硬编码 SPEC Document 升级为由 intake、澄清答案、选中路线、对应的 `BlueprintSpecTreeNode`（文档归属的 SPEC Tree 节点，含 `type` / `title` / `summary` / `dependencies` / `outputs`）与可选上游证据（`reusedRoleFindings` 等）共同推导出的结构化产物。**本 spec 严格限定在 SPEC Documents 这一阶段的 LLM 驱动**；RouteSet 与 SPEC Tree 已有独立 spec，Effect Preview、Prompt Package、Engineering Handoff 的 LLM 驱动都由各自独立 spec 推进；让 `docker-analysis-sandbox` 真正跑 Docker、让 `mcp-github-source` 真正调 MCP、让 `aigc-spec-node` 真正调 AIGC 节点、让 `role-system-architecture` 真正执行角色能力都由独立的 capability-bridge feature 推进。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **SPEC Document / `BlueprintSpecDocument`**：`shared/blueprint/contracts.ts` 中定义的结构化文档对象，字段包含 `id`、`jobId`、`treeId`、`nodeId`、`type`（`"requirements" | "design" | "tasks"`）、`status`（`"draft" | "reviewing" | ...`）、`version`、`sourceDocumentId?`、`title`、`summary`、`content`（Markdown 字符串）、`format`（固定为 `"markdown"`）、`createdAt` / `updatedAt`、`reviewedAt?` / `acceptedAt?` / `rejectedAt?`、`reviewedBy?` / `reviewNote?`，以及嵌套的 `provenance`（含 `jobId`、`projectId?`、`sourceId?`、`targetText?`、`githubUrls`、`treeVersion`、`nodeType`、`nodeTitle`、`nodeSummary`、`dependencies`、`outputs`、`reusedRoleFindingIds?` / `reusedRoleIds?` / `reusedEvidenceIds?`）。
- **SPEC Document LLM Generator / SPEC Document 生成器**：本 spec 引入的新组件，落点在 `server/routes/blueprint/spec-documents/` 目录下（具体文件组织由 design 阶段确定），接收 `(intake, clarificationSession.answers, selectedRoute, specTreeNode, domainContext?, upstreamEvidence?)`，通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，返回可以直接用于构造 `BlueprintSpecDocument.content` / `title` / `summary` 等字段的结构化结果。
- **SPEC Tree Node / `BlueprintSpecTreeNode`**：`BlueprintSpecTree.nodes` 中的每一项（详见 `autopilot-spec-tree-llm` 的术语表），本 spec 的 SPEC Document 生成以**每个节点**为单位：一次 SPEC Document 生成请求会为目标节点集合的每个节点、每个目标文档类型（`requirements` / `design` / `tasks`）各生成一份 `BlueprintSpecDocument`。
- **`generationSource`**：沿用 RouteSet / SPEC Tree / Clarification 子域现有语义的字符串枚举 `"llm" | "llm_fallback" | "template"`，挂在相关事件与 `BlueprintSpecDocument.provenance` 上，表达当前文档是 LLM 直接产出、LLM 失败回退到模板、还是从未走过 LLM。
- **Templated SPEC Document / 模板化 SPEC Document**：现状实现，即 `generateSpecDocuments()` 调用 `buildSpecDocument()` / `buildSpecDocumentHeading()` / `buildSpecDocumentBody()` / `buildSpecDocumentSectionLines()` / `buildReusableRoleFindingLines()` 联合产出的硬编码 `BlueprintSpecDocument`。
- **Fallback / 回退路径**：当 LLM 调用失败（网络错误、超时、返回无效 JSON、zod schema 校验不通过、`sections` 为空、单 section body 为空、字符串越界、`title` 缺失等）时，生成器必须回退到模板化 SPEC Document，并在 provenance 中记录原因。
- **Prompt ID / `promptId`**：本 spec 为 SPEC Document LLM prompt 分配的稳定字符串标识（固定为 `blueprint.spec-document.v1`），用于 provenance 追溯 prompt 版本。
- **External HTTP Contract / 外部 HTTP 契约**：`POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 以及相关 `/spec-documents/*`（例如生成 / 版本化 / 评审 / 接受 / 拒绝）路由的请求与响应结构，以及它们返回的 `documents[*]` / `document` / `version` 字段中 `BlueprintSpecDocument` / `BlueprintSpecDocumentVersionSnapshot` 的既有字段（`id` / `type` / `status` / `title` / `summary` / `content` / `format` / `provenance.*` 等），以 `server/tests/blueprint-routes.test.ts` 中 47 条 E2E 用例所锁定的行为为准。
- **Subdomain Tests / 子域单测**：指 `server/routes/blueprint/*/service.test.ts` 等目录下共 48 条 co-located 子域单元测试，其中包括 `server/routes/blueprint/spec-documents/service.test.ts`。
- **SDK Smoke**：`client/src/lib/blueprint-api/` 目录下 SDK 的 happy-path 断言。
- **`BlueprintServiceContext`**：`server/routes/blueprint/context.ts` 中定义的依赖注入容器，包含 `llm.callJson`、`llm.getConfig`、`now`、`jobStore`、`eventBus` 等。SPEC Document LLM Generator 必须通过 `ctx.llm.callJson` 调用 LLM，而不得在实现内 `import { callLLMJson } from "../../core/llm-client.js"`。
- **Upstream Evidence / 上游证据**：可选输入，包含但不限于 `collectReusableRoleFindings()` 当前已经返回的 `BlueprintRoleTimelineEntry[]`（由 SPEC Tree 节点上下文派生）、sandbox derivation 产出、AIGC-node 证据等。本 spec 不要求这些 capability 先行落地；上游证据在本 spec 范围内作为**可选输入**存在，若为空，SPEC Document 生成器照常工作，只是 prompt 中缺少相应上下文块。
- **Adapter String / adapter 命名**：若 SPEC Document 相关运行时路径在 provenance 或事件中携带 `adapter` 字段，需遵循与 RouteSet / SPEC Tree spec 对齐的命名约定：LLM 真实路径 `adapter` 不得包含 `.simulated`，默认建议为 `blueprint.spec-document.llm`；模板回退路径保留原有 `adapter` 命名不变。

## 需求

### 需求 1：目标与范围对齐

**用户故事：** 作为 `/autopilot` 模块的主要维护者，我希望本 spec 有一个明确、可审核的范围边界，以便 design / tasks 阶段与后续跨 spec 协作都围绕同一条边界推进。

#### 验收标准

1.1 THE Feature_Scope SHALL 覆盖并且仅覆盖 SPEC Documents 这一阶段的 LLM 驱动：即 `server/routes/blueprint.ts` 中 `generateSpecDocuments()` / `buildSpecDocument()` / `buildSpecDocumentHeading()` / `buildSpecDocumentBody()` / `buildSpecDocumentSectionLines()` 当前硬编码文档内容的推导路径，以及从 `(BlueprintGenerationJob, BlueprintSpecTree, BlueprintSpecTreeNode, BlueprintGenerateSpecDocumentsRequest)` 到 `BlueprintSpecDocument` 之间的数据派生环节。

1.2 THE Feature_Scope SHALL 将新增实现物理落地到 `server/routes/blueprint/spec-documents/` 目录下（例如新增 `spec-document-llm-generator.ts` / `spec-document-schema.ts` 之类文件），并把对应 co-located 单元测试放在同目录下；具体文件命名与组织由 design 阶段确定。

1.3 THE Feature_Scope SHALL NOT 修改 `createRouteGenerationSandboxDerivation()`、`docker-analysis-sandbox`、`mcp-github-source`、`aigc-spec-node`、`role-system-architecture` 等 capability adapter 的实际行为，也不要求它们从 simulated 升级为真实执行；这些项目留给独立的 capability-bridge feature。

1.4 THE Feature_Scope SHALL NOT 修改 RouteSet（已由 `autopilot-routeset-llm-generation` 覆盖）、SPEC Tree（已由 `autopilot-spec-tree-llm` 覆盖）、Effect Preview、Prompt Package、Engineering Handoff 各自的生成路径；这些阶段的 LLM 驱动由各自独立 spec 推进。

1.5 THE Feature_Scope SHALL NOT 变更 Clarification 子域、RouteSet 子域、SPEC Tree 子域或 Agent Crew 阶段事件子域的 LLM 调用方式；它们作为参考实现被复用其模式（`generationSource` 命名、provenance 字段形态、失败回退策略），但不被本 spec 重新实现。

1.6 THE Feature_Scope SHALL NOT 修改 `SpecDocumentWorkbenchPanel` 等前端 SPEC Document 工作台 UI 组件；`generationSource` 在前端是否可见属于可选增强，落点与时机由独立 UI spec 决定，不作为本 spec 的验收前提。

1.7 THE Feature_Scope SHALL NOT 改动 GitHub Pages 静态预览（browser-only）或浏览器端 runtime；本 spec 仅作用于服务端 `server/routes/blueprint/*` 与 `shared/blueprint/*` 的兼容追加。

### 需求 2：LLM 驱动的 SPEC Document 生成契约

**用户故事：** 作为 `/autopilot` 的用户，我希望我填写的 intake 目标、clarification 答案、选中的主路线与当前 SPEC Tree 节点的语义真正影响到系统给我的 Requirements / Design / Tasks 文档，而不是无论节点是什么、无论路线是什么都得到同一套三段式模板骨架。

#### 验收标准

2.1 THE SpecDocument_Generator SHALL 以 `(intake, clarificationSession.answers, selectedRoute, specTreeNode, domainContext?, upstreamEvidence?)` 为 LLM 输入，通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，推导并返回用于构造 `BlueprintSpecDocument.title` / `summary` / `content` 的结构化结果（至少包含文档标题、文档概要与若干 section）。

2.2 THE SpecDocument_Generator SHALL 以**每份文档**（即 `(nodeId, type)` 对）为一次独立的 LLM 调用单位：当 `generateSpecDocuments()` 在一次请求中为 N 个节点、M 个类型生成 N × M 份文档时，每一份文档各自独立走 LLM 路径或 fallback 路径，互不影响。

2.3 THE SpecDocument_Generator SHALL 保证返回的 LLM 结果至少包含以下字段：顶层 `title: string`、`summary: string`、`sections: Array<{ heading: string, body: string }>`，可选 `status`（落入 `BlueprintSpecDocumentStatus` 的既有集合）；具体 schema 细节由 design 阶段给出，但必须满足需求 3 的 schema 约束。

2.4 THE SpecDocument_Generator SHALL 在构造 `BlueprintSpecDocument.content` 时，将 LLM 返回的 `sections` 渲染为稳定的 Markdown（例如 `# ${title}` + 按序输出每个 `## ${heading}` + `body`），并保留一条可复现的渲染规则，以便下游 review / version snapshot / accept 流程消费。

2.5 THE SpecDocument_Generator SHALL 根据设计阶段的 locale 读取策略（例如 `ctx.llm.getConfig()` 暴露的 locale 或 intake / request 上携带的 locale），以 zh-CN 或 en-US 产出 `title` / `summary` / `sections[*].heading` / `sections[*].body`，保持与 RouteSet / SPEC Tree LLM Generator locale-aware 行为的一致性。

2.6 WHEN LLM 成功返回符合契约的结果，THE SpecDocument_Generator SHALL 使用 LLM 输出替换现有 `buildSpecDocument()` + `buildSpecDocumentBody()` + `buildSpecDocumentSectionLines()` 产出的硬编码文档字段，而不是与模板化输出并列或合并。

2.7 THE SpecDocument_Generator SHALL 保证最终返回给 `generateSpecDocuments()`（或其等价装配点）的结构可以直接用于构造 `BlueprintSpecDocument`，不引入需要调用方在 `generateSpecDocuments()` 之外再做一轮合成的新中间态，也不得改变 `BlueprintSpecDocument.provenance` 中由节点派生的既有字段（`nodeType` / `nodeTitle` / `nodeSummary` / `dependencies` / `outputs` / `reusedRoleFindingIds?` / `reusedRoleIds?` / `reusedEvidenceIds?`）的含义。

2.8 THE SpecDocument_Generator SHALL 在发起 LLM 调用时，将超时时间上限控制在 30 秒以内；超时即视为失败并触发需求 5 定义的回退路径。

### 需求 3：Prompt 与响应 schema 约束

**用户故事：** 作为负责 SPEC Document 生成器的实现者与评审者，我希望 prompt 输入与 LLM 响应有稳定、可校验的 schema，以便既能让下游代码放心消费 `BlueprintSpecDocument.content`，也能在 LLM 偶发异常输出时快速诊断。

#### 验收标准

3.1 THE SpecDocument_Generator SHALL 使用一个稳定字符串 `promptId`（本 spec 固定为 `blueprint.spec-document.v1`）标识 SPEC Document LLM prompt 的当前版本。

3.2 THE SpecDocument_Generator SHALL 构造确定性的 prompt payload，其内容至少包含：`promptId`、`targetDocumentType`（`"requirements" | "design" | "tasks"`）、`intake.targetText`、`intake.githubUrls`、`clarificationSession` 的 `strategyId` / `templateId` / `answers` 摘要、`selectedRoute` 的 `id` / `title` / `summary` / `rationale` / `steps` / `capabilities`、当前 `specTreeNode` 的 `id` / `type` / `title` / `summary` / `dependencies` / `outputs` / `priority`、可选的 `domainContext`、可选的 `upstreamEvidence` 摘要。Prompt 的完整 schema 在 design 阶段给出，但必须保证同一组输入产生的 prompt payload 可被复现（用于回归测试）。

3.3 THE SpecDocument_Generator SHALL 使用 zod 严格 schema 校验 LLM 返回的 JSON，至少要求：
  - 顶层字段为 `title: string`、`summary: string`、`sections: Array<...>`；
  - 每个 section 含 `heading: string`、`body: string`；
  - 可选 `status` 落入 `BlueprintSpecDocumentStatus` 的既有集合；
  - `sections` 数组长度 `.min(2).max(20)`；
  - 单个 section 的 `body` 长度 `.min(1).max(5000)`；
  - `title` / `summary` / `sections[*].heading` 的长度上界由 design 阶段在更紧口径内确定（建议 `title ≤ 200`、`summary ≤ 500`、`heading ≤ 200`），但必须在 schema 中显式表达。

3.4 THE SpecDocument_Generator SHALL 在 zod schema 中使用 `.refine()`（或等价结构）断言以下文档级不变量：
  - `sections` 数组非空；
  - 所有 `heading` 在同一份文档内唯一（不区分大小写与前后空白）；
  - `title` / `summary` / 每个 `section.body` trim 后非空；
  - 若提供 `status`，其值必须落入 `BlueprintSpecDocumentStatus` 的受支持集合。

3.5 IF LLM 返回的 JSON 解析失败、zod schema 校验失败、`sections` 为空、某个 section `body` trim 后为空、字符串越界、`title` 缺失、`status` 不可解析、或调用超时 / 网络错误，THEN THE SpecDocument_Generator SHALL 触发需求 5 定义的回退路径，而不是把不完整的 LLM 输出塞进 `BlueprintSpecDocument.content`。

3.6 THE SpecDocument_Generator SHALL 在 schema 校验通过后，对 LLM 返回字段做必要的规范化（例如裁剪过长字符串至 schema 允许的上界、强制 `status` 落回受支持集合、trim `heading` / `body` 的首尾空白、去重 `heading`），以保证下游 `generateSpecDocuments()` 消费的结果满足 `BlueprintSpecDocument` 的既有类型期望。

### 需求 4：SPEC Document 真实产物与 provenance 扩展

**用户故事：** 作为在生产环境 triage 问题的维护者，我希望 SPEC Document 最终落盘的对象明确记录"这份文档是 LLM 推导出的、LLM 失败回退的、还是从未走过 LLM"，以及 prompt 版本与模型标识，便于事后对账。

#### 验收标准

4.1 THE SpecDocument_Generator SHALL 在 `BlueprintSpecDocument.provenance` 中新增 LLM 相关追溯信息，至少包括：
  - `generationSource: "llm" | "llm_fallback" | "template"`；
  - `promptId`（当 `generationSource` 为 `"llm"` 或 `"llm_fallback"` 时）；
  - `model`（当调用过 LLM 时，从 `ctx.llm.getConfig()` 读取）；
  - 触发回退时的 `error` 原因（字符串或结构化对象，由 design 阶段确定）。

4.2 THE SpecDocument_Generator SHALL 将上述新字段作为**可选**字段追加到 `BlueprintSpecDocument.provenance`，不得删除、重命名或重定类型现有 `provenance` 字段（`jobId` / `projectId` / `sourceId` / `targetText` / `githubUrls` / `treeVersion` / `nodeType` / `nodeTitle` / `nodeSummary` / `dependencies` / `outputs` / `reusedRoleFindingIds` / `reusedRoleIds` / `reusedEvidenceIds`）。

4.3 THE SpecDocument_Generator SHALL 让 `generationSource` 与 provenance 上的 `promptId` / `model` / `error` 字段与 RouteSet / SPEC Tree 子域已有 LLM provenance 的命名口径严格对齐，而不是另立一套命名。

4.4 WHERE SPEC Document 相关运行时路径在 provenance 或事件中携带 `adapter` 字段，THE SpecDocument_Generator SHALL 保证 LLM 真实路径的 `adapter` 不包含 `.simulated`（建议默认为 `blueprint.spec-document.llm`），而模板回退路径保留原有 `adapter` 命名不变。

4.5 IF 在 LLM 调用前就判定无需走 LLM（例如未来通过 feature flag 或 `ctx.llm.getConfig().apiKey` 为空时显式关闭），THEN THE SpecDocument_Generator SHALL 标记 `generationSource === "template"`，并省略 `promptId` / `model` / `error`。

4.6 WHERE 存在多轮重试，THE SpecDocument_Generator SHALL 保证 `provenance.error` 仅在**最终进入回退路径**时被填充；中间重试成功的情况下不得在 provenance 中写入噪音 error。

4.7 WHERE 一次 `generateSpecDocuments()` 请求同时产出多份 `BlueprintSpecDocument`，THE SpecDocument_Generator SHALL 保证每份文档的 `provenance.generationSource` / `promptId` / `model` / `error` 彼此独立，不会因为其中一份走 fallback 而把其他走 LLM 成功的文档污染为 `"llm_fallback"`。

### 需求 5：回退路径与模板化等价性

**用户故事：** 作为 `/autopilot` 的运维者，我希望 SPEC Document 在 LLM 不可用时仍能给出一份结构等价、前端可展示、下游可继续消费的产物，而不是让整个 SPEC Documents 生成流程直接失败。

#### 验收标准

5.1 WHEN 某一份文档的 LLM 调用失败（网络错误、超时、无效 JSON、zod schema 校验失败、空 sections、字符串越界、`status` 不可解析、规范化后仍不满足类型期望等），THE SpecDocument_Generator SHALL 退回到今天 `buildSpecDocument()` + `buildSpecDocumentHeading()` + `buildSpecDocumentBody()` + `buildSpecDocumentSectionLines()` 的模板化产出路径，并使返回的单份 `BlueprintSpecDocument` 与不走 LLM 的历史行为在字段结构上等价。

5.2 THE Feature SHALL 保留现有 `buildSpecDocument()` / `buildSpecDocumentHeading()` / `buildSpecDocumentBody()` / `buildSpecDocumentSectionLines()` / `buildReusableRoleFindingLines()` 的模板化实现路径，不得在本 spec 范围内删除或改写它们；生成器在 fallback 时必须复用同一段代码作为产出来源。

5.3 WHEN fallback 被触发，THE SpecDocument_Generator SHALL 在返回的 `BlueprintSpecDocument.provenance` 中设置 `generationSource === "llm_fallback"`，并按需求 4 规定填充 `promptId` / `model` / `error`。

5.4 THE Feature SHALL 保证 fallback 路径下的 `BlueprintSpecDocument.id` / `type` / `status` / `title` / `summary` / `content` / `format` / `createdAt` / `updatedAt` / `version` / `sourceDocumentId` 与今天不走 LLM 的行为逐字段一致；在既有 47 条 E2E 与 48 条子域单测使用默认（未注入 LLM mock）的 `BlueprintServiceContext` 时，响应不应因为本 spec 的接入而发生结构变化。

5.5 THE SpecDocument_Generator SHALL 保证 fallback 路径下被送入下游 Artifact Replay / Agent Crew 角色事件 / Handoff 投影的 SPEC Document 数据与今天的行为等价，不因 fallback 改变任何下游消费者看到的字段形态。

5.6 WHERE 一次 `generateSpecDocuments()` 请求中部分文档走 LLM 成功、部分文档走 fallback，THE Feature SHALL 保证响应体 `documents[*]` 数组顺序、长度、`(nodeId, type)` 组合与今天的历史行为一致，既有依赖该顺序的断言不因为混合 provenance 而失败。

### 需求 6：事件家族与 `generationSource` 广播

**用户故事：** 作为 Artifact Replay、Agent Crew 面板与运维监控的消费者，我希望从事件流里能直接读出"这份 SPEC Document 是 LLM 产出的还是模板回退的"，而不是反推响应字段。

#### 验收标准

6.1 WHERE `BlueprintEventName` 中已存在与 SPEC Document 生命周期语义匹配的事件（当前为 `SpecDocumentVersioned` 对应 `spec.document.versioned`、`SpecDocumentReviewed` 对应 `spec.document.reviewed`），AND 既有实现在 SPEC Document 生成或版本化路径上 emit 这些事件，THE SpecDocument_Generator SHALL 在这些事件的 payload 上以**可选**字段追加 `generationSource: "llm" | "llm_fallback" | "template"`、`promptId`（当 `generationSource` 为 `"llm"` 或 `"llm_fallback"` 时）、`model`（当调用过 LLM 时）、可选 `error`（当 `generationSource === "llm_fallback"` 时）。

6.2 IF 当前 `server/routes/blueprint.ts` 在 SPEC Document 生成主路径上（`generateSpecDocuments()` → `buildSpecDocument()`）并未 emit 任何 `spec.document.*` 事件，AND 既有事件 payload 上没有自然落点，THEN THE Feature SHALL NOT 为本 spec 单独新增事件名；SPEC Document 生成器在这种情况下只通过 `BlueprintSpecDocument.provenance` 暴露 `generationSource` 等字段，事件侧保持现状。是否 emit、emit 哪一个既有事件由 design 阶段基于仓库现状判定。

6.3 WHERE 任何事件（既有或 design 阶段确定的既有事件扩展）被用于承载 SPEC Document 的 `generationSource`，THE SpecDocument_Generator SHALL 采用与 RouteSet 子域 `route.generated` 事件、SPEC Tree 子域 `spec.tree.*` 事件以及 clarification 子域 `clarification.*` 事件一致的命名、字段形态与语义，而不是在 `spec.document.*` 事件上另立命名。

6.4 THE SpecDocument_Generator SHALL 继续沿用 `shared/blueprint/events.ts` 中的 `BlueprintEventName` 常量来源；对事件名的任何引用 SHALL NOT 以裸字符串字面量出现在 `server/routes/blueprint/spec-documents/` 以外的文件。

6.5 THE Feature SHALL 保证任何新增的事件字段都是**可选**字段；既有依赖 `spec.document.*` 事件的消费者（含 Artifact Replay、Agent Crew 面板、`blueprint-routes.test.ts` 中所有断言 `spec.document.*` 的用例）不得因为字段追加而断言失败。

### 需求 7：`BlueprintServiceContext` 注入与可测试性

**用户故事：** 作为 SPEC Document LLM Generator 的单元测试作者，我希望生成器完全通过 `BlueprintServiceContext` 拿到 LLM 能力，以便我可以在测试里注入 mock LLM、可控时间与可控 jobStore，验证生成器在 happy / fallback / schema-mismatch / api-key-missing 四条路径下的行为。

#### 验收标准

7.1 THE SpecDocument_Generator SHALL 通过 `BlueprintServiceContext.llm.callJson` 调用 LLM，并通过 `BlueprintServiceContext.llm.getConfig` 读取模型配置与 locale；实现文件内 SHALL NOT 直接 `import { callLLMJson } from "../../core/llm-client.js"` 或 `import { getAIConfig } from "../../core/ai-config.js"`。

7.2 THE SpecDocument_Generator SHALL 被组织为一个工厂函数 `createSpecDocumentLlmGenerator(ctx)`（或等价命名，由 design 阶段确认），其构造签名只接收 `BlueprintServiceContext`，而不接收模块级单例依赖。

7.3 THE SpecDocument_Generator SHALL 可以通过 `buildBlueprintServiceContext({ llm: { callJson, getConfig } })` 注入自定义 LLM 适配器，从而在端到端测试中被替换为返回固定 JSON、返回错误、抛超时等 mock 实现。

7.4 THE SpecDocument_Generator SHALL 支持在不实际发起 HTTP / LLM 请求的前提下完成子域单测，只要测试端提供一个满足 `BlueprintServiceContext` 的 mock 装配。

7.5 THE SpecDocument_Generator SHALL 仅依赖 `ctx.llm.callJson` / `ctx.llm.getConfig` / `ctx.logger`（以及必要时的 `ctx.now`）完成核心生成路径；不得在生成器内部隐式触碰 `ctx.jobStore` 或 `ctx.blueprintStores`，从而保持单测的最小依赖面。

### 需求 8：向后兼容与响应结构稳定性

**用户故事：** 作为 `/autopilot` 已经上线的前端页面、SDK 与集成测试的维护者，我希望本 spec 对我完全是"可选字段增强、既有字段无感知变化"的——不改 URL、不改请求结构、不让既有 E2E 与子域单测因为字段差异而失败。

#### 验收标准

8.1 THE HTTP_Contract SHALL 保持 `POST /api/blueprint/jobs`、`POST /api/blueprint/generations` 以及相关 `/spec-documents/*`（生成 / 版本化 / 评审 / 接受 / 拒绝）路由的 URL、HTTP 方法、请求体结构、以及既有响应体字段（含 `documents[*]` / `document` / `version` 的 `id` / `type` / `status` / `title` / `summary` / `content` / `format` / `createdAt` / `updatedAt` / `version` / `sourceDocumentId` / `provenance.*` 等）完全不变。

8.2 THE SpecDocument_Generator SHALL 仅通过**追加可选字段**的方式扩展 `BlueprintSpecDocument.provenance`（如需求 4 所列字段）；不得删除、不得重命名现有 `provenance` 字段，也不得把既有字段改为必填或变更类型。

8.3 THE Feature SHALL 保持 `server/tests/blueprint-routes.test.ts` 中原有 47 条端到端 E2E 用例与 48 条子域 co-located 单测继续通过，且这 95 条用例不得被改写或删除以迁就新行为。

8.4 THE Feature SHALL 保持 `client/src/lib/blueprint-api/` 目录下 SDK smoke 现有的通过状态；若新增 provenance 字段需要在 SDK 侧补 normalizer，必须以追加方式实现，不得修改既有 normalizer 的输出语义。

8.5 IF 在实现过程中发现必须修改 `server/tests/blueprint-routes.test.ts` 或任一既有子域单测才能让 LLM 路径通过，THEN THE Feature SHALL 视该情况为违反本需求，必须调整实现而不是调整测试。

8.6 THE Feature SHALL 保证默认未注入 LLM mock 的 `BlueprintServiceContext`（即 `ctx.llm.callJson` 走真实 `callLLMJson` 但 `apiKey` 未配置时）在 SPEC Document 生成路径上的行为等价于模板化输出，`generationSource === "template"`，以此不破坏本地开发与 CI 默认装配。

### 需求 9：测试口径与不在范围内事项

**用户故事：** 作为代码评审人，我希望在评审阶段就能按照一组明确、可核对的测试清单判断本 spec 是否到位，以及哪些"周边改动"必须放到后续 spec。

#### 验收标准

9.1 THE Feature SHALL 在 `server/tests/blueprint-routes.test.ts` 中至少新增 2 条 E2E 用例：
  - **(a) Happy path**：mock `ctx.llm.callJson` 返回结构化 SPEC Document 结果（含 `title` / `summary` / `sections`），断言响应的 `documents[*].content` 来自 LLM（内容明显区别于模板化输出），`documents[*].provenance.generationSource === "llm"`，`documents[*].provenance.promptId` 与 `documents[*].provenance.model` 被写入；
  - **(b) Fallback path**：mock `ctx.llm.callJson` 抛错或返回非法 JSON / schema 不通过，断言响应的 `documents[*].content` 退回到模板化输出（结构上与今天 `buildSpecDocument()` 产出等价），`documents[*].provenance.generationSource === "llm_fallback"`，`documents[*].provenance.error` 被填充。

9.2 THE Feature SHALL 在 `server/routes/blueprint/spec-documents/` 下新增至少 4 条 co-located 单元测试，分别验证：
  - **happy**：给定合法 `BlueprintServiceContext` mock，生成器返回通过 zod schema 校验的 `title` / `summary` / `sections`，`generationSource === "llm"`；
  - **malformed JSON**：mock `callJson` 返回非 JSON / JSON 但结构不符，生成器进入 fallback，`generationSource === "llm_fallback"`，`error` 被填充；
  - **schema fails**：mock `callJson` 返回 JSON 但违反 zod schema（例如 `sections` 为空 / `body` 为空 / 字符串越界），生成器进入 fallback；
  - **api key missing**：mock `ctx.llm.getConfig()` 返回无 `apiKey` 配置，生成器直接走模板路径，`generationSource === "template"`（或 `"llm_fallback"`，由 design 阶段确定默认口径，但必须在测试中锁定）。

9.3 THE Feature SHALL NOT 在本轮引入 property-based test（PBT）；若 tasks 阶段出现任何被标注为 PBT 的任务，必须显式写出要验证的不变量（invariant），否则应当改为 example-based test。

9.4 THE Feature SHALL NOT 要求修改 `docker-analysis-sandbox`、`mcp-github-source`、`skill-svg-architecture`、`aigc-spec-node`、`role-system-architecture` 任一 capability adapter 的实际行为（让它们从 simulated 升级为真实执行由独立 capability-bridge feature 推进）。

9.5 THE Feature SHALL NOT 要求改造 RouteSet（已有 spec）、SPEC Tree（已有 spec）、Effect Preview、Prompt Package、Engineering Handoff 的生成逻辑；LLM 驱动这些阶段由各自独立 spec 推进，不作为本 spec 的验收前提。

9.6 THE Feature SHALL NOT 改动 `server/tests/blueprint-routes.test.ts` 中原有 47 条 E2E 用例、48 条子域 co-located 单测或 SDK smoke 既有断言；本 spec 只新增用例，不改写或删除既有用例。

9.7 THE Feature SHALL NOT 进行非本 spec 必要的 UI 改动；`generationSource` 是否在 `/autopilot` 既有 `SpecDocumentWorkbenchPanel` 或任务墙面上可见，属于可选增强，如果在实现阶段发现自然落点可以顺带追加（以可选 UI 字段形式），否则留作后续 UI spec 处理。

9.8 THE Feature SHALL NOT 引入 Web-AIGC runtime main line、task-autopilot Phase 1 或 blueprint 模块以外的运行时 / 治理 / observability 主线改动作为验收条件；这些主线由各自 steering 推进，本 spec 只保证不引入新的倒退。
