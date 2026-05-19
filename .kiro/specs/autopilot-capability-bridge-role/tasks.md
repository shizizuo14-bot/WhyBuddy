# 实施任务：Autopilot Capability Bridge — Role System Architecture

## 概述

本任务清单把 design 文档 §10.1 的 16 步实现大纲收敛为 26 个可验证的代码任务，覆盖：

- `shared/blueprint/role-architecture.ts` 的新增纯类型定义（`RoleArchitectureResponse` / `AgentRoleEntry`，不依赖 zod；由 `shared/blueprint/index.ts` 重新导出）
- `shared/blueprint/contracts.ts` 的 provenance 可选字段扩展（invocation +2 字段 / evidence +2 字段 +  `structuredRoles?` 可选对象 4 字段含 `payload: RoleArchitectureResponse`；复用 Docker / MCP / aigc-node 桥 spec 已追加的 provenance 字段不重复扩展）
- `BlueprintServiceContext` 的 2 个可选依赖字段扩展（`roleSystemArchitectureCapabilityPolicy?` + `roleSystemArchitectureCapabilityBridge?`；**不改 `ctx.llm` 字段** — 与 aigc-node 桥一致，LLM 能力已在 wt1 默认装配）
- `server/routes/blueprint/role-system-architecture/` 下 5 个新模块（`schema` / `policy` / `prompt` / `summary-derivation` / `bridge`）及其 co-located 单测
- `buildBlueprintServiceContext` 的默认装配
- `server/routes/blueprint.ts` 中 `createRouteGenerationSandboxDerivation` 的 role-system-architecture 分支（Docker / MCP / aigc-node 桥 spec 已改为 async，本 spec 继续复用），以及 input 追加 `primaryRouteId?` 可选字段与调用点透传
- `buildCapabilityEvidence` 的签名改造（接受 `roleBridgeOutput?` 参数）+ 外层聚合层 `Map<invocationId, RoleBridgeOutput>` 构造 + real 路径下写入 `evidence.provenance.structuredRoles.payload` 完整对象
- `server/tests/blueprint-routes.test.ts` 追加 2 条 E2E（Real LLM path + downstream retrieval sanity / Fallback path）
- 最终全量回归

每个任务都对应明确的落点文件、函数与验收标准；所有任务均为本 spec 的必做项，不引入 `*` 可选标记。

依赖顺序：1（shared 纯类型） → 2（shared barrel 重新导出） → 3（Contract 扩展） → 4（Context 字段扩展） → 5、6（schema + 单测） → 7、8（policy + 单测） → 9、10（prompt + 单测） → 11、12（summary-derivation + 单测） → 13（纯模块 checkpoint） → 14、15（bridge 主逻辑 + 单测） → 16（完整子域 checkpoint） → 17（context 默认装配） → 18、19、20、21（blueprint.ts 改造：input 追加 `primaryRouteId?` 透传 / 分支 / adapter + event payload / `buildCapabilityEvidence` 签名改造 / 聚合层 Map 构造） → 22（既有子域回归 checkpoint） → 23、24（E2E 追加：real + retrieval / fallback） → 25（SDK 透传） → 26（全量回归 + 最终验收）。

需求 9.4 明确锁定本 spec **不引入 PBT**；所有单测均为 example-based，共 ~38 条 co-located 单测 + 2 条 E2E。design §6 给出的测试策略通过以下 example-based 单测覆盖：schema.test ~10 条 + policy.test ~6 条 + prompt.test ~7 条 + summary-derivation.test ~4 条 + bridge.test 5 条硬需求 + 3 条补充 = 8 条。其中 bridge.test 的 5 条硬需求严格对应 R9.2（happy / malformed / schema-fail / apiKey-missing）+ R9.3（downstream-retrieval）。

## 任务列表

- [x] 1. 新建 `shared/blueprint/role-architecture.ts`：追加纯类型定义
  - [x] 1.1 定义并导出纯 interface `AgentRoleEntry`（字段：`id: string`、`label: string`、`responsibilities: string[]`、`activationStages: string[]`、`permissions?: string[]`）与 `RoleArchitectureResponse`（字段：`roles: AgentRoleEntry[]`）;**不依赖 zod**，文件内 SHALL NOT `import { z } from "zod"` 或 `import` 任何运行时模块（design §4.10 + §2.D9 硬约束）
  - [x] 1.2 与 `shared/blueprint/contracts.ts` 中既有 `BlueprintAgentRole` / `BlueprintRolePresence` 类型**只读对齐**，不修改这两个既有类型的任一字段（需求 1.9 + design §1）
  - [x] 1.3 文件头部以 TSDoc 注释说明：该类型与 server 侧 `RoleArchitectureResponseSchema` 的 `z.infer<...>` 等价，供前端 / SDK / Browser Runtime 同构消费
  - _Requirements: 3.1, 3.6, 1.9, 8.1_

- [x] 2. 在 `shared/blueprint/index.ts` 的 barrel 中重新导出 role-architecture 类型
  - [x] 2.1 追加 `export type { AgentRoleEntry, RoleArchitectureResponse } from "./role-architecture.js"`;使用 `export type` 确保运行时无副作用
  - [x] 2.2 运行 `node --run check` 确认 shared 层类型扩展未引入新 TS 错误（历史类型债不应扩大）
  - [x] 2.3 grep 既有 `shared/blueprint/contracts.ts` 消费点，确认新增导出不与既有符号冲突
  - _Requirements: 3.6, 8.1, 8.3_

- [x] 3. 在 `shared/blueprint/contracts.ts` 扩展 provenance 可选字段
  - [x] 3.1 在 `BlueprintCapabilityInvocation.provenance` 类型中追加 2 个可选字段：`primaryRouteId?: string`、`roleCount?: number`;复用 Docker / MCP / aigc-node 桥 spec 已追加的 `executionMode` / `error` / `promptId` / `model` / `responseDigest` / `tokenCount` / `structuredPayloadDigest` / `promptFingerprint` 及 Docker / MCP 桥追加的 `containerId` / `artifactUrl` / `logDigest` / `executionPath` / `repoUrl` / `commitSha` / `fetchedAt` / `defaultBranch` / `apiResponseDigest` / `mcpToolName` 字段（本 spec 只读复用，不重复扩展）;不删除、不重命名、不修改任何既有字段
  - [x] 3.2 在 `BlueprintCapabilityEvidence.provenance` 类型中追加 2 个可选字段 `primaryRouteId?: string` / `roleCount?: number`，**以及** 1 个独立可选对象 `structuredRoles?: { digest: string; byteSize: number; summary: string; payload: RoleArchitectureResponse }`（承载**完整**结构化角色 JSON 对象，而非仅 digest；与 aigc-node 桥的 `structuredPayload?` 三字段形态**不同**，故使用独立字段名避免语义冲突）（design §2.D8 方案 A + §4.10）
  - [x] 3.3 `import type { RoleArchitectureResponse } from "./role-architecture.js"` 在本文件顶部追加，确保 `structuredRoles.payload` 类型精确化
  - [x] 3.4 在仓库根运行 `node --run check`，确认新增字段不引入新增 TS 错误;同时 grep 既有 `provenance:` 消费点确认没有因字段追加而断言失败
  - _Requirements: 3.5, 3.6, 4.4, 4.5, 4.6, 5.2, 5.4, 8.1, 8.3_

- [x] 4. 在 `server/routes/blueprint/context.ts` 扩展 `BlueprintServiceContext` 依赖字段
  - [x] 4.1 在 `BlueprintServiceContext` 与 `BlueprintServiceContextDeps` 上追加 2 个可选字段：`roleSystemArchitectureCapabilityPolicy?: RoleSystemArchitectureCapabilityPolicy`、`roleSystemArchitectureCapabilityBridge?: RoleSystemArchitectureCapabilityBridge`;类型仅 `import type`，不 import 工厂实现避免循环依赖
  - [x] 4.2 **不改 `ctx.llm` 字段**：`ctx.llm.callJson` / `ctx.llm.getConfig` 已在 wt1 的 `buildBlueprintServiceContext` 中默认装配为 `callLLMJson` / `getAIConfig`，本 spec 只消费不扩展（需求 7.5 + design §2.D2）;bridge 内部 SHALL NOT `import { callLLMJson }` / `import { getAIConfig }`
  - [x] 4.3 保持向后兼容：`buildBlueprintServiceContext(deps)` 在 `deps` 未提供 policy / bridge 字段时仍能构造出合法 Context，既有单测与 E2E 无感知（字段默认装配在任务 17 中处理，本任务只保证"类型可选且不传也不崩"）
  - [x] 4.4 运行 `node --run check` 确认类型扩展未引入新 TS 错误
  - _Requirements: 7.1, 7.3, 7.5, 8.2_

- [x] 5. 新建 `server/routes/blueprint/role-system-architecture/schema.ts`
  - [x] 5.1 按 design §4.4 定义并导出 `AgentRoleSchema`：`z.object({ id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]{0,63}$/), label: z.string().min(1).max(80), responsibilities: z.array(z.string().min(1).max(200)).min(1).max(10), activationStages: z.array(z.string().min(1).max(64)).min(1).max(10), permissions: z.array(z.string().min(1).max(120)).min(0).max(10).optional() })`;定义并导出 `RoleArchitectureResponseSchema`：`z.object({ roles: z.array(AgentRoleSchema).min(1).max(9) }).superRefine((data, ctx) => { /* 检查 roles[].id 在数组内唯一 */ })`;**不使用 `.strict()`**（zod 默认 strip 行为静默丢弃未知字段，design §2.D9）;**禁止** 任何 `.transform(...)` / `z.coerce.*` / `z.preprocess(...)` 之类的 coerce 链（需求 3.2）
  - [x] 5.2 导出类型别名 `export type RoleArchitectureResponse = z.infer<typeof RoleArchitectureResponseSchema>`、`export type AgentRoleEntry = z.infer<typeof AgentRoleSchema>`;这两个类型 SHALL 与 `shared/blueprint/role-architecture.ts` 中的同名 interface 结构等价（任务 6 会补一条 type-level 等价性测试）
  - [x] 5.3 **禁止** 在本文件 `import` 任何运行时 / 业务模块;仅 `import { z } from "zod"` 与 `import type { RoleArchitectureResponse, AgentRoleEntry } from "../../../../shared/blueprint/role-architecture.js"`（后者仅用于类型对比，不强制使用）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 6. 新建 `server/routes/blueprint/role-system-architecture/schema.test.ts`（~10 条）
  - [x] 6.1 **Type-level 等价性测试**：使用 TS 编译期 assert 工具（例如 `expectTypeOf<z.infer<typeof RoleArchitectureResponseSchema>>().toEqualTypeOf<SharedRoleArchitectureResponse>()` 或等价的 `type _AssertEqual = Expect<Equal<z.infer<typeof RoleArchitectureResponseSchema>, SharedRoleArchitectureResponse>>`）确认 server 侧 `z.infer` 与 `shared/blueprint/role-architecture.ts` 中 `RoleArchitectureResponse` 完全等价（design §4.10）
  - [x] 6.2 合法 minimal payload：`{ roles: [{ id: "planner", label: "Planner", responsibilities: ["r1"], activationStages: ["s1"] }] }` 通过;合法 full payload：9 个角色，每角色带 `permissions: [...]`，通过
  - [x] 6.3 `roles` 缺失 → `safeParse` 返回 `success: false`;`roles: []`（空数组）→ 失败（违反 `.min(1)`）;`roles: Array(10).fill(validRole)` → 失败（违反 `.max(9)`）
  - [x] 6.4 `roles[0].id === "X"`（大写字母）→ 失败（正则 `/^[a-z][a-z0-9-]{0,63}$/` 不匹配）;`roles[0].id === "1planner"`（数字开头）→ 失败;`roles[0].id === ""`（空串）→ 失败（违反 `.min(1)`）;`roles[0].id === "a".repeat(65)` → 失败（超长）
  - [x] 6.5 **unique id superRefine**：`{ roles: [{ id: "dup", ... }, { id: "dup", ... }] }` → 失败，错误 message 包含 `"duplicated id"` 或 `"unique"`（可通过 `parsed.error.issues.some(i => /duplicat|unique/i.test(i.message))` 断言）
  - [x] 6.6 `roles[0].label === ""` / `label` 长 81 字符 → 失败
  - [x] 6.7 `roles[0].responsibilities: []` / 11 项 / 单项 >200 字符 / 单项空串 → 失败
  - [x] 6.8 `roles[0].activationStages: []` / 11 项 / 单项 >64 字符 → 失败
  - [x] 6.9 `roles[0].permissions: Array(11).fill("p")` / 单项 >120 字符 → 失败
  - [x] 6.10 未知字段 `{ roles: [{ id: "planner", ..., group: "planning", collaborationNotes: ["x"] }] }` → **通过**，且 `parsed.data.roles[0]` 不包含 `group` / `collaborationNotes`（zod 默认 strip，需求 3.3）
  - [x] 6.11 ReDoS 哨兵：`{ roles: [{ id: "a".repeat(1000), ... }] }` 解析在 50ms 内完成（正则上界 `{0,63}` 无回溯爆炸风险，design §5.6）
  - _Requirements: 3.1, 3.2, 3.3, 3.6, 9.2_

- [x] 7. 新建 `server/routes/blueprint/role-system-architecture/policy.ts`
  - [x] 7.1 按 design §4.3 定义并导出 `RoleSystemArchitectureCapabilityPolicy` 接口（字段：`maxInvocationTimeoutMs` / `temperature` / `maxLogLines` / `maxLogBytes` / `maxStructuredPayloadSummaryBytes` / `redactionKeywords` / `redactedEmailPattern` / `redactedApiKeyPattern` / `redactedGithubPatPattern` / `callJsonRetryAttempts`）
  - [x] 7.2 导出 `createDefaultRoleSystemArchitectureCapabilityPolicy()`:默认 `maxInvocationTimeoutMs: 30_000`（env `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS` 覆盖；非法或 > 30000 时 clamp 回 30000）/ `temperature: 0.2` / `maxLogLines: 20` / `maxLogBytes: 4_096` / `maxStructuredPayloadSummaryBytes: 300` / `redactionKeywords: ["authorization","token","api_key","apikey","secret","password","bearer","access_token","x-github-token","openai-api-key"]` / `redactedEmailPattern: /[\w.+-]+@[\w.-]+/g` / `redactedApiKeyPattern: /\b(sk-[A-Za-z0-9]{20,}|clp_[A-Za-z0-9]{20,})\b/g` / `redactedGithubPatPattern: /\b(gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g` / `callJsonRetryAttempts: 1`
  - [x] 7.3 导出 `applyRoleCapabilityRedaction(value: string, policy): string` 纯函数:依次替换 API key → GitHub PAT → email → `redactionKeywords` 的 key:value 对（大小写不敏感，使用 `escapeRegex` 转义 keyword 避免正则注入）;返回脱敏后的字符串
  - [x] 7.4 **禁止** 在本文件 `import` 任何运行时依赖;纯数据 + 纯函数 only
  - _Requirements: 2.4, 4.7, 7.4_

- [x] 8. 新建 `server/routes/blueprint/role-system-architecture/policy.test.ts`（~6 条）
  - [x] 8.1 `applyRoleCapabilityRedaction` 把 `"key=sk-ABCDEFGHIJKLMNOP1234567890"` 中 token 替换为 `[redacted-api-key]`;把 `"ghp_abcdefghijklmnopqrstuvwxyz0123456789AB"` 替换为 `[redacted-github-token]`;把 `"github_pat_abcdefghijklmnopqrstuv"` 替换为 `[redacted-github-token]`
  - [x] 8.2 `applyRoleCapabilityRedaction("user@example.com")` 返回 `"[redacted-email]"`
  - [x] 8.3 `applyRoleCapabilityRedaction("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9")` 返回形如 `"Authorization: [redacted]"`;`applyRoleCapabilityRedaction("api_key=superSecret123")` 返回 `"api_key: [redacted]"`（或等价脱敏形态）
  - [x] 8.4 断言 `createDefaultRoleSystemArchitectureCapabilityPolicy()` 返回值的每个字段与 design §4.3 默认值严格一致;`maxInvocationTimeoutMs === 30_000` / `temperature === 0.2` / `callJsonRetryAttempts === 1`
  - [x] 8.5 断言 `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS=15000` 环境变量覆盖生效（使用 `vi.stubEnv` 或等价机制），返回 `maxInvocationTimeoutMs === 15_000`;`BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS=99999` 被 clamp 回 `30_000`;`BLUEPRINT_ROLE_CAPABILITY_BRIDGE_TIMEOUT_MS=abc` 非法值 fallback 回 `30_000`
  - [x] 8.6 ReDoS 哨兵：`applyRoleCapabilityRedaction` 处理 5MB 普通文本（不含敏感 marker）在 200ms 内返回（性能下限保护，design §5.6）
  - _Requirements: 2.5, 4.7, 7.4, 9.2_

- [x] 9. 新建 `server/routes/blueprint/role-system-architecture/prompt.ts`
  - [x] 9.1 按 design §4.5 定义并导出 `ROLE_ARCHITECTURE_PROMPT_ID = "blueprint.role-architecture.v1"` 常量（需求 2.3）
  - [x] 9.2 导出 `RoleArchitecturePromptPayload` / `BuildRoleArchitecturePromptInput` 类型与 `buildRoleArchitecturePrompt(input): RoleArchitecturePromptPayload` 纯函数
  - [x] 9.3 实现 locale-aware `systemMessage`：`locale === "zh-CN"` 时使用 design §4.5 给出的中文 prompt（以"你是 /autopilot 沙箱派生管线中的角色架构推理器"开头、含 6 条约束）;其余使用英文版（以"You are the Role System Architecture reasoner"开头、含 6 条 Constraints）
  - [x] 9.4 构造 `userPayload`（确定性，字段顺序固定）:顺序为 `promptId` / `selectedRoute` / `alternativeRoutes` / `intake` / `clarification` / `projectContext` / `outputSchema`;`selectedRoute.steps[]` **原样透传 route.steps 输入顺序**（不排序），每条步骤保留 `title` / `description` / `role` 三个字段;`selectedRoute.stagesSummary[]` 保留 `routeSet.stagesSummary` 输入顺序;`alternativeRoutes` 取 `routeSet.routes` 中排除 primaryRouteId 的条目并保留输入顺序（只保留 `id` / `title` / `summary` 三个字段）;`intake.githubUrls` 保持 `request.githubUrls ?? []` 输入顺序;`clarification.answers` 按 `questionId` 字典序排序（`answers.slice().sort((a,b) => a.questionId.localeCompare(b.questionId))`）;`projectContext` 在 `request.projectId` / `request.sourceId` 均缺失时整块 `undefined`
  - [x] 9.5 `userMessage = JSON.stringify(userPayload, null, 2)`;`promptFingerprint = "sha256:" + sha256Hex(systemMessage + "\n\n" + userMessage)`（使用 `node:crypto` 的 `createHash("sha256")`）
  - [x] 9.6 **禁止** 在本文件 `import` 运行时业务模块（仅允许 `node:crypto`）;**禁止** 硬编码任何 model 名 / provider 名 / API URL
  - _Requirements: 2.2, 2.3, 2.6, 2.8, 7.2_

- [x] 10. 新建 `server/routes/blueprint/role-system-architecture/prompt.test.ts`（~7 条）
  - [x] 10.1 Determinism：同输入（`request`、`clarificationSession`、`route`、`routeSet`、`primaryRouteId`、`locale`）两次调用 `buildRoleArchitecturePrompt(...)` 返回的 `userMessage` 字节相同，`promptFingerprint` 字节相同
  - [x] 10.2 `clarificationSession.locale === "zh-CN"` → `systemMessage` 至少包含一个 CJK 字符（正则 `/[\u4e00-\u9fa5]/` 匹配）;`locale === "en-US"` → `systemMessage` 以英文字符开头且不含 CJK
  - [x] 10.3 `clarificationSession.answers = [{questionId: "q-b", answer: "B"}, {questionId: "q-a", answer: "A"}]` 输入 → `userPayload.clarification.answers` 按 `questionId` 升序排列（`[q-a, q-b]`）
  - [x] 10.4 `ROLE_ARCHITECTURE_PROMPT_ID === "blueprint.role-architecture.v1"`;`prompt.promptId === ROLE_ARCHITECTURE_PROMPT_ID`
  - [x] 10.5 `prompt.promptFingerprint` 匹配 `/^sha256:[a-f0-9]{64}$/`;手动计算 `sha256(systemMessage + "\n\n" + userMessage)` 与 `prompt.promptFingerprint.replace("sha256:", "")` 相等
  - [x] 10.6 **`selectedRoute.steps[]` 原样透传**（本 spec 特有）：构造 `route.steps = [{title: "S3", ...}, {title: "S1", ...}, {title: "S2", ...}]` → `userPayload.selectedRoute.steps` 顺序严格为 `["S3", "S1", "S2"]`（不排序）;每条步骤对象包含 `title` / `description` / `role` 三个字段
  - [x] 10.7 `request.targetText === "Build a release dashboard"` + `request.githubUrls: ["url1","url2"]` + `input.primaryRouteId === "rs-abc:primary"` → `userMessage` 包含 `"Build a release dashboard"` 子串 + `"url1"` / `"url2"` 子串（按输入顺序出现）+ `"rs-abc:primary"` 子串;`clarificationSession === undefined` → `userPayload.clarification === undefined`（JSON 序列化后 key 不出现）
  - _Requirements: 2.2, 2.3, 2.6, 2.8, 9.2_

- [x] 11. 新建 `server/routes/blueprint/role-system-architecture/summary-derivation.ts`
  - [x] 11.1 按 design §4.8 导出 `deriveRoleOutputSummary(data: RoleArchitectureResponse, options: { locale: "zh-CN" | "en-US" }): string` 纯函数:locale=en-US 时返回 `"Composed N role(s); covering K stage(s)."` 单复数正确（N=1 用 role，其余用 roles；K 同理；K 为 `new Set(roles.flatMap(r => r.activationStages)).size`）;locale=zh-CN 时返回 `"规划 N 个角色；覆盖 K 个阶段。"`
  - [x] 11.2 导出 `buildStructuredRolesSummary(data: RoleArchitectureResponse, policy: RoleSystemArchitectureCapabilityPolicy): string` 纯函数:生成简短人可读摘要（例如 `"roles=3 [planner, architect, reviewer]"`；>3 个角色时追加 `", +N more"`），截断到 `policy.maxStructuredPayloadSummaryBytes` 字节（末尾补 `"..."`）
  - [x] 11.3 导出 `sha256Hex(text: string): string` 纯函数（若 prompt.ts 已导出可复用其实现；否则独立实现）:使用 `node:crypto` 的 `createHash("sha256")`，返回 64 字符 hex lowercase
  - [x] 11.4 **禁止** 在本文件 `import` 运行时业务模块;纯函数 only
  - _Requirements: 3.5, 4.3, 4.5, 4.7_

- [x] 12. 新建 `server/routes/blueprint/role-system-architecture/summary-derivation.test.ts`（~4 条）
  - [x] 12.1 **单复数 en-US**：`deriveRoleOutputSummary({ roles: [{...activationStages: ["s1"]}] }, { locale: "en-US" })` 返回 `"Composed 1 role; covering 1 stage."`（role 单数，stage 单数）;`deriveRoleOutputSummary({ roles: [{...activationStages: ["s1","s2"]}, {...activationStages: ["s2","s3"]}, {...activationStages: ["s3"]}] }, { locale: "en-US" })` 返回 `"Composed 3 roles; covering 3 stages."`（roles 复数，stages 复数；注意 stages 是去重后的集合大小）
  - [x] 12.2 **zh-CN 变体**：同样输入在 `{ locale: "zh-CN" }` 下返回 `"规划 1 个角色；覆盖 1 个阶段。"` / `"规划 3 个角色；覆盖 3 个阶段。"`（中文不区分单复数）
  - [x] 12.3 **truncation**：构造 9 个角色、每个 `id` 长 32 字符的 payload，`buildStructuredRolesSummary(...)` 返回字符串的 `Buffer.byteLength(..., "utf8")` ≤ `policy.maxStructuredPayloadSummaryBytes`（300）;超长时以 `"..."` 结尾
  - [x] 12.4 `sha256Hex("hello")` 返回确定的 hex 摘要（可断言 === `"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"`）
  - _Requirements: 3.5, 4.3, 4.5, 9.2_

- [x] 13. Checkpoint — 跑通子域 schema / policy / prompt / summary-derivation 纯模块单测
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/role-system-architecture/schema.test.ts server/routes/blueprint/role-system-architecture/policy.test.ts server/routes/blueprint/role-system-architecture/prompt.test.ts server/routes/blueprint/role-system-architecture/summary-derivation.test.ts`，确认 ~27 条单测（10 schema + 6 policy + 7 prompt + 4 summary-derivation）全部通过;若失败必须修复对应模块后再继续。同时跑 `node --run check` 确认此时仓库无新增类型错误。
  - _Requirements: 9.2, 9.4_

- [x] 14. 新建 `server/routes/blueprint/role-system-architecture/bridge.ts`
  - [x] 14.1 按 design §4.2 定义并导出 `RoleSystemArchitectureCapabilityBridgeInput`（`capability` / `route` / `jobId` / `request` / `routeSet` / `primaryRouteId` / `clarificationSession?` / `createdAt` / `invocationId` / `roleId`）、`RoleSystemArchitectureCapabilityBridgeOutput`（`invocation` / `executionMode: "real" | "simulated_fallback"` / `additionalEvents` / `structuredRoles?: RoleArchitectureResponse` / `structuredRolesMeta?: { digest, byteSize, summary }`）、`RoleSystemArchitectureCapabilityBridge` 类型别名;**`primaryRouteId` 为必填字段**（本 spec 特有输入，非可选）
  - [x] 14.2 导出工厂 `createRoleSystemArchitectureCapabilityBridge(ctx: BlueprintServiceContext): RoleSystemArchitectureCapabilityBridge`;按 design §4.6 伪代码实现主算法 7 步：早退档位 1（`BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED !== "true"` → fallback `"bridge not enabled"` + `logger.debug`）→ 早退档位 2（`ctx.llm.getConfig().apiKey` 空 → fallback `"llm apiKey missing"` + `logger.debug`，**不调用 callJson**）→ 构造 prompt（locale-aware，locale 从 `input.clarificationSession?.locale === "zh-CN" ? "zh-CN" : "en-US"`）→ 记录 `startedAt = ctx.now()` → `await ctx.llm.callJson(messages, { model, temperature: policy.temperature, timeoutMs: policy.maxInvocationTimeoutMs, retryAttempts: policy.callJsonRetryAttempts, sessionId: ... })` → 档位 3/4/5 错误处理 → 档位 3 非 JSON / undefined → fallback `"non-json response"` + `logger.warn` → schema.safeParse → 档位 4 schema 失败 → fallback `"schema validation failed: {truncated msg}"` + `logger.warn` → 档位 5 timeout（`/abort|timeout/i.test(errMsg)`）→ fallback `"llm timeout"` + `logger.warn` → happy path → 构造 real invocation + `structuredRoles` + `structuredRolesMeta`
  - [x] 14.3 按 design §4.7 实现 `buildRealOutput`：填充 `durationMs = completedAt.getTime() - startedAt.getTime()`（墙钟毫秒）/ `logs`（只记录 metadata：`promptId=...` / `promptFingerprint=...` / `model=...` / `responseDigest=...` / `structuredPayloadDigest=...` / `primaryRouteId=...` / `roleCount=N` / `stagesCount=K`；每条写入前经 `applyRoleCapabilityRedaction` 防御性脱敏；按 `policy.maxLogLines` / `policy.maxLogBytes` 截断）/ `outputSummary`（来自 `deriveRoleOutputSummary` + `applyRoleCapabilityRedaction`）/ `requestedBy: "role-system-architecture-capability-bridge"` / `safetyGate.reason: "{label} approved for real LLM execution via ctx.llm.callJson."` / `provenance.executionMode: "real"` / `provenance.promptId / model / responseDigest / structuredPayloadDigest / promptFingerprint` / `provenance.primaryRouteId = input.primaryRouteId` / `provenance.roleCount = validated.roles.length`;**不填** `error`（real 路径 error 必须为 undefined，需求 5.2）;**不写入原始 prompt 全文或原始 LLM 响应体**到 logs / outputSummary 的任何位置（需求 4.7）;同时填充 `structuredRoles: validated`（完整对象，由外层 `buildCapabilityEvidence` 写入 `evidence.provenance.structuredRoles.payload`）与 `structuredRolesMeta: { digest: structuredPayloadDigest, byteSize: Buffer.byteLength(JSON.stringify(validated), "utf8"), summary: applyRoleCapabilityRedaction(buildStructuredRolesSummary(validated, policy), policy) }`
  - [x] 14.4 按 design §4.9 实现 `buildFallbackOutput(input, { reason, promptId?, model? })`：调用既有 `buildCapabilityOutputSummary()` / `buildCapabilityInvocationLogs()` / `deterministicCapabilityDuration()` 产出模板化字段（outputSummary / logs / durationMs）;`requestedBy: "route-generation-sandbox-derivation"` 保留今日值;`provenance.executionMode: "simulated_fallback"` + `provenance.error: truncate(reason, 400)`;若 prompt 已构造则可选填充 `provenance.promptId` / `model`（档位 3/4/5），档位 1/2 不填;**`provenance.primaryRouteId = input.primaryRouteId`**（fallback 路径也填充，让下游能定位"是哪条路线 fallback 了"，design §4.9）;`provenance.roleCount = undefined`;返回的 `structuredRoles: undefined` / `structuredRolesMeta: undefined`
  - [x] 14.5 5 档错误分类严格对齐 design §5.1：档位 1 未启用（debug + `"bridge not enabled"`）/ 档位 2 apiKey 缺失（debug + `"llm apiKey missing"` + 不调用 callJson）/ 档位 3 callJson 抛错或返回 non-object（warn + `"llm callJson threw: ..."` 或 `"non-json response"`）/ 档位 4 schema 失败（warn + `"schema validation failed: ..."` 含 unique id superRefine 失败）/ 档位 5 超时（warn + `"llm timeout"`，通过 `/abort|timeout/i.test(errMsg)` 判断）
  - [x] 14.6 `structuredPayloadDigest` 计算：`canonicalPayloadJson = JSON.stringify(parsed.data)`（只含 schema-declared 字段，zod 已 strip 额外字段）→ `structuredPayloadDigest = "sha256:" + sha256Hex(canonicalPayloadJson)`;`responseDigest = "sha256:" + sha256Hex(JSON.stringify(rawPayload))`（rawPayload 是 callJson 返回的原始对象，可能含 zod 丢弃的额外字段）
  - [x] 14.7 日志级别与 meta：档位 1/2 `ctx.logger.debug(...)` 降噪;档位 3/4/5 `ctx.logger.warn(...)` 且 meta 只含 `{ promptId, error?, errorMsg? }` 三类字段，**不**含 `messages` / `rawPayload` / `systemMessage` / `userMessage` 等原始内容（design §2.D10 / 需求 4.7）
  - [x] 14.8 **禁止** `import { callLLMJson } from "../../../core/llm-client.js"`、**禁止** `import { getAIConfig } from "../../../core/ai-config.js"`、**禁止** `new ...LLMClient()` 自己装配、**禁止** 模块级 `fetch()`、**禁止** `import "node-fetch"` / `"got"` / `"undici"`、**禁止** 硬编码任何 model 名（如 `"gpt-4"`）或 provider 名或 temperature 默认值;所有 LLM 能力必须通过 `ctx.llm.callJson` / `ctx.llm.getConfig` 注入（design §2.D1 硬约束）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.5, 3.6, 4.1, 4.2, 4.3, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.7, 7.1, 7.2, 7.3_

- [x] 15. 新建 `server/routes/blueprint/role-system-architecture/bridge.test.ts`（**R9.2 四条 + R9.3 一条 = 5 条硬需求** + 3 条补充 = 8 条）
  - [x] 15.1 **R9.2 Happy path**（硬需求）：注入 fake `callJson: async () => ({ roles: [ ... 3 个合法 role ... ] })` + `getConfig: () => ({ model: "gpt-4-turbo", apiKey: "sk-test-valid" })` + `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED=true`;断言 `result.executionMode === "real"` + `result.structuredRoles!.roles.length === 3` + `result.structuredRolesMeta!.digest` 匹配 `/^sha256:[a-f0-9]{64}$/` + `result.structuredRolesMeta!.byteSize > 0` + `invocation.provenance.executionMode === "real"` + `invocation.provenance.promptId === "blueprint.role-architecture.v1"` + `invocation.provenance.model === "gpt-4-turbo"` + `invocation.provenance.structuredPayloadDigest === result.structuredRolesMeta!.digest` + `invocation.provenance.primaryRouteId === input.primaryRouteId` + `invocation.provenance.roleCount === 3` + `invocation.provenance.error === undefined` + `outputSummary` 匹配 `/Composed\s+3\s+role/` + `durationMs >= 0` + `logs` 每行都不包含 `"You are"` / `"你是"` / `"system"` 等 prompt 原文子串
  - [x] 15.2 **R9.2 Malformed JSON**（硬需求）：fake `callJson: async () => undefined`（或返回 `null` / string / number）;断言 `result.executionMode === "simulated_fallback"` + `result.structuredRoles === undefined` + `result.structuredRolesMeta === undefined` + `provenance.executionMode === "simulated_fallback"` + `provenance.error` 匹配 `/non-json response/`;断言 `outputSummary` / `logs` / `durationMs` 与 `buildCapabilityOutputSummary` / `buildCapabilityInvocationLogs` / `deterministicCapabilityDuration` 产出完全一致（字节级等价）
  - [x] 15.3 **R9.2 Schema validation fails**（硬需求，3 个子场景，各 1 条 `it(...)`）:
    - (a) fake `callJson: async () => ({ roles: [] })`（空数组，违反 `.min(1)`）→ fallback + `provenance.error` 匹配 `/schema validation failed/`
    - (b) fake `callJson: async () => ({ roles: [{ id: "dup", ... }, { id: "dup", ... }] })`（id 重复，`.superRefine()` 触发）→ fallback + `provenance.error` 匹配 `/schema validation failed/` 且错误消息包含 `"duplicat"` 或 `"unique"` 子串
    - (c) fake `callJson: async () => ({ roles: [{ id: "X", ... }] })`（大写 id，正则 `/^[a-z].../` 不匹配）→ fallback + `provenance.error` 匹配 `/schema validation failed/`
  - [x] 15.4 **R9.2 ApiKey missing**（硬需求）：fake `callJson` spy（`vi.fn()`） + fake `getConfig: () => ({ model: "gpt-4-turbo", apiKey: "" })`;断言 `result.executionMode === "simulated_fallback"` + `provenance.error` 匹配 `/llm apiKey missing/` + `callJson` spy **从未被调用**（`expect(callJsonSpy).not.toHaveBeenCalled()`）
  - [x] 15.5 **R9.3 Downstream retrieval feasibility**（硬需求，**本 spec 独有**，独立编号不合并到 happy path）：按 design §6.3.5 注入 fake `callJson` 返回合法 2 个角色 payload + `input.primaryRouteId = "rs-abc:primary"`;断言 `result.executionMode === "real"` + `result.structuredRoles!.roles.length === 2` + `result.structuredRolesMeta!.digest` / `byteSize` / `summary` 字段齐备;断言 `result.invocation.provenance.primaryRouteId === "rs-abc:primary"` + `result.invocation.provenance.roleCount === 2` + `result.invocation.provenance.structuredPayloadDigest === result.structuredRolesMeta!.digest`;**通过 helper `simulateBuildCapabilityEvidence`**（或直接调用外层 `buildCapabilityEvidence`）模拟外层回填 `evidence.provenance.structuredRoles.payload` 的完整路径，断言 evidence 可通过 `{ jobId, routeSetId, primaryRouteId }` 三元组唯一定位，且 `evidence.provenance.structuredRoles!.payload.roles` 与 `result.structuredRoles!.roles` 按角色顺序与字段完全相等
  - [x] 15.6 **补充 Not enabled**（档位 1）：不设 `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED`（或设为 `"false"` / `"0"`）+ fake callJson spy;断言 fallback + `provenance.error === "bridge not enabled"` + callJson 未被调用 + `ctx.logger.debug` 被调用（warn 未被调用）+ `provenance.primaryRouteId === input.primaryRouteId`（fallback 也填充）
  - [x] 15.7 **补充 Timeout**（档位 5）：fake `callJson: async () => { throw new Error("Request aborted due to timeout") }`（或使用 `Object.assign(new Error("aborted"), { name: "AbortError" })`）;断言 fallback + `provenance.error === "llm timeout"`
  - [x] 15.8 **补充 Redaction E2E**（需求 4.7）：fake `callJson` 返回 payload，但 `roles[0].responsibilities[0]` 包含 `"contact user@example.com for escalation"` 或 `"token=sk-ABCDEFGHIJKLMNOP1234567890"`;断言 bridge 返回的 `invocation.outputSummary` / `invocation.logs.join("\n")` 均**不含** `"sk-ABCDEFGHIJKLMNOP1234567890"` 或 `"user@example.com"` 原文;`structuredPayloadDigest` / `responseDigest` / `promptFingerprint` 作为 hash 允许存在;**注意**：`result.structuredRoles.payload.roles[0].responsibilities[0]` 本身**不脱敏**（下游需要完整字段；脱敏会破坏契约；design §2.D10 + §4.3）
  - [x] 15.9 所有 8 条单测均不启动真实 LLM 调用、不发真实 HTTP 请求，完全通过 fake ctx 驱动;不依赖外网，不依赖真实 apiKey
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.6, 4.7, 5.1, 5.2, 5.3, 5.5, 9.1, 9.2, 9.3_

- [x] 16. Checkpoint — 跑通完整 role-system-architecture 子域测试
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/role-system-architecture/`，确认 ~35 条单测（10 schema + 6 policy + 7 prompt + 4 summary-derivation + 8 bridge）全部通过;此 checkpoint 保证 role capability bridge 核心实现在接入外层之前已稳定。design §6 的测试策略通过本 checkpoint 等价覆盖。
  - _Requirements: 9.2, 9.4_

- [x] 17. 在 `buildBlueprintServiceContext` 中默认装配 bridge 与 policy
  - [x] 17.1 在 `server/routes/blueprint/context.ts` 的 `buildBlueprintServiceContext(deps)` 中：若 `deps.roleSystemArchitectureCapabilityPolicy` 未提供，调用 `createDefaultRoleSystemArchitectureCapabilityPolicy()` 挂到 ctx 上;若 `deps.roleSystemArchitectureCapabilityBridge` 未提供，调用 `createRoleSystemArchitectureCapabilityBridge(ctx)` 构造默认实例挂到 ctx 上
  - [x] 17.2 保持向后兼容：`ctx.llm` 字段保持现状（`callJson` / `getConfig` 默认已由 wt1 装配），本 spec **不**扩展 `ctx.llm`;bridge 在 `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED !== "true"` 或 `apiKey` 缺失时自动早退 fallback（不强行触发真实 LLM 调用，避免在默认装配下拖慢响应或消耗 API quota）
  - [x] 17.3 新增字段的装配顺序：先解析 `logger` / `now` / `llm`（既有顺序），再装配 `roleSystemArchitectureCapabilityPolicy`（纯数据），最后装配 `roleSystemArchitectureCapabilityBridge`（依赖 policy + llm + logger + now）;顺序相对 Docker 桥 / MCP 桥 / aigc-node 桥的装配之后，互不影响
  - _Requirements: 7.1, 7.3, 7.5, 7.6, 8.2_

- [x] 18. 改造 `createRouteGenerationSandboxDerivation` 的 input 类型与调用链：追加 `primaryRouteId?` 可选字段（本 spec 特有）
  - [x] 18.1 在 `server/routes/blueprint.ts` 中 `createRouteGenerationSandboxDerivation` 的 input 类型追加 `primaryRouteId?: string` 可选字段（本 spec 相对 Docker / MCP / aigc-node 桥的独有改造）;非破坏性改造，既有 Docker / MCP / aigc-node 桥分支不消费此字段
  - [x] 18.2 在 `createRouteGenerationSandboxDerivation` 内部：`const primaryRouteId = input.primaryRouteId ?? primaryRoute.id;` 作为默认回退（即调用方未显式提供时取当前 `primaryRoute.id`），保证向后兼容
  - [x] 18.3 在 `createGenerationJob` 调用 `createRouteGenerationSandboxDerivation(...)` 的位置追加 `primaryRouteId` 透传:`createGenerationJob` options 中若已存在可用 primary route id（例如从 `buildRouteSet()` 返回值派生），优先传入；否则让内部默认 fallback 到 `primaryRoute.id`;trace `server/routes/blueprint.ts` 中所有 `createRouteGenerationSandboxDerivation(` 调用点（包括测试 fixture）确保类型兼容
  - [x] 18.4 grep 其它 `createRouteGenerationSandboxDerivation(` 调用点（包括测试 fixture）：对未传 `primaryRouteId` 的调用点保持不变（可选字段缺省为 `undefined`，内部默认回退到 `primaryRoute.id`）
  - [x] 18.5 运行 `node --run check` 确认类型追加未引入新 TS 错误
  - _Requirements: 1.1, 4.6, 7.1, 7.2_

- [x] 19. 改造 `createRouteGenerationSandboxDerivation` 的 capability 分支：新增 role-system-architecture 分支
  - [x] 19.1 在 `server/routes/blueprint.ts` 中 `createRouteGenerationSandboxDerivation` 的 capability map 循环内（Docker 桥 spec 已改为 async、MCP 桥 spec 已新增 mcp-github-source 分支、aigc-node 桥 spec 已新增 aigc-spec-node 分支）：在 `capability.id === "aigc-spec-node"` 分支之后，新增 `capability.id === "role-system-architecture" && ctx.roleSystemArchitectureCapabilityBridge` 分支，调用 `await ctx.roleSystemArchitectureCapabilityBridge({ capability, route, jobId, request, routeSet, primaryRouteId, clarificationSession, createdAt, invocationId, roleId: invocationRoleId })` 并返回 `{ invocation: bridgeResult.invocation, executionMode: bridgeResult.executionMode, structuredRoles: bridgeResult.structuredRoles, structuredRolesMeta: bridgeResult.structuredRolesMeta }`（注意：返回值比其它三条桥多 2 个字段 `structuredRoles` / `structuredRolesMeta`，供任务 21 的聚合层消费）
  - [x] 19.2 其它 capability（`skill-svg-architecture` 等）分支**一行不改**：继续走 `buildCapabilityOutputSummary` / `buildCapabilityInvocationLogs` / `deterministicCapabilityDuration` 模板化组合;Docker / MCP / aigc-node 桥分支同样不改
  - [x] 19.3 `ctx.roleSystemArchitectureCapabilityBridge` 未注入时（理论上任务 17 默认装配后不会出现）走 else 分支（与其它 capability 相同的模板化代码），保证 ctx 无 bridge 也不崩
  - [x] 19.4 `invocationId = createId("blueprint-capability-invocation")` 保持由外层生成（Docker / MCP / aigc-node 桥 spec 已实现），本 spec 沿用;real / fallback 两条路径共享同一 id
  - _Requirements: 1.1, 1.7, 2.1, 4.1, 4.3, 4.8_

- [x] 20. 改造 `createRouteGenerationSandboxDerivation` 的 event payload 语义：adapter 切换与可选字段追加
  - [x] 20.1 在 `createRouteGenerationSandboxDerivation` 聚合完 invocations 之后，针对 role-system-architecture capability 提取真实 adapter：`const roleResult = invocations.find(({invocation}) => invocation.capabilityId === "role-system-architecture"); const roleAdapter = roleResult?.executionMode === "real" ? "blueprint.runtime.role.llm" : routeGenerationCapabilities.find(c => c.id === "role-system-architecture")?.adapter ?? "blueprint.runtime.role.system-architecture.simulated";`（design §2.D6 + §4.11）
  - [x] 20.2 在 `sandbox.job.started` / `sandbox.job.completed` / `sandbox.job.failed` 事件 payload 中，对应 role-system-architecture capability 的 `adapter` 字段使用 `roleAdapter`;trace `server/routes/blueprint.ts` 第 ~2915 / 2940 / 3088 / 3091 行附近 event payload 构造代码并精确补丁（与 aigc-node 桥 §18.2 同款位置）
  - [x] 20.3 在 `capability.invoked` / `capability.completed` / `evidence.recorded` 事件 payload 中追加可选字段：`executionMode`、`promptId?`、`model?`、`error?`、`roleCount?`（real 路径下取 `invocation.provenance.roleCount`）;**所有事件 `type` 仍通过 `BlueprintEventName` 常量构造，不出现裸字符串字面量**（需求 6.6）
  - [x] 20.4 `getDefaultRuntimeCapabilities()` 本身**不改**（role-system-architecture capability adapter 仍为 `"blueprint.runtime.role.system-architecture.simulated"` 作为 fallback 基线），保证既有 52 条 E2E 继续通过（Docker 桥 +2 / MCP 桥 +3 / aigc-node 桥 +2，累计基线 52）（design §2.D6）
  - _Requirements: 4.4, 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

- [x] 21. 改造 `buildCapabilityEvidence` 的签名：接受 `roleBridgeOutput?` 参数并继承 provenance（本 spec 最重的外层改造）
  - [x] 21.1 **改造 `buildCapabilityEvidence` 函数签名**（独立任务，不合并到聚合层或分支）：在 `server/routes/blueprint.ts` 中 `buildCapabilityEvidence(input)` 的 input 类型追加可选参数 `roleBridgeOutput?: { structuredRoles: RoleArchitectureResponse; structuredRolesMeta: { digest: string; byteSize: number; summary: string } }`（design §4.8）;非破坏性改造，既有 Docker / MCP / aigc-node 桥调用点不传此参数仍能工作
  - [x] 21.2 在 `buildCapabilityEvidence` 内部：读取 `invocation.provenance.executionMode / error / promptId / model / responseDigest / tokenCount / structuredPayloadDigest / promptFingerprint` 并原样回填到 evidence 的 `provenance` 对应字段（与 aigc-node 桥一致）;本 spec 额外追加 `primaryRouteId?` / `roleCount?` 两个可选字段的透传（若 invocation.provenance 存在则回填）
  - [x] 21.3 **针对 role-system-architecture real 路径**（`invocation.capabilityId === "role-system-architecture" && invocation.provenance.executionMode === "real" && input.roleBridgeOutput`），在 evidence.provenance 上构造 `structuredRoles: { digest, byteSize, summary, payload }` 可选对象（4 字段，本 spec 特有；与 aigc-node 桥的 3 字段 `structuredPayload` 独立命名以精确化 payload 类型为 `RoleArchitectureResponse`；design §4.8 + §4.10）:`digest` / `byteSize` / `summary` 直接取 `input.roleBridgeOutput.structuredRolesMeta`;`payload` 直接取 `input.roleBridgeOutput.structuredRoles`（完整 validated 对象）
  - [x] 21.4 **Fallback 路径也填充 `primaryRouteId`**：针对 role fallback 路径（`invocation.capabilityId === "role-system-architecture" && invocation.provenance.executionMode === "simulated_fallback" && invocation.provenance.primaryRouteId`），在 evidence.provenance 填充 `primaryRouteId` 但**不填** `structuredRoles` / `roleCount`（让下游能定位"是哪条路线 fallback 了"，design §4.9 + §4.8）
  - [x] 21.5 运行 `node --run check` 确认签名改造未引入新 TS 错误
  - _Requirements: 3.5, 4.4, 4.5, 4.6, 4.8, 5.2, 5.4, 8.1, 8.2, 8.3_

- [x] 22. 在 `createRouteGenerationSandboxDerivation` 外层聚合层构造 `Map<invocationId, RoleBridgeOutput>`（本 spec 独有架构，不合并到分支或 evidence 改造）
  - [x] 22.1 **独立任务建立聚合 Map**：在 `createRouteGenerationSandboxDerivation` 的 `Promise.all(...)` 返回后（任务 19 新分支产出 `{ invocation, executionMode, structuredRoles?, structuredRolesMeta? }`），遍历 `invocations` 数组，对其中 `structuredRoles && structuredRolesMeta` 两字段都非空的 entry，向 `roleBridgeOutputs: Map<string, { structuredRoles: RoleArchitectureResponse; structuredRolesMeta: { digest, byteSize, summary } }>` 中 `set(invocation.id, { structuredRoles, structuredRolesMeta })`（design §4.8 末尾"外层聚合层"）
  - [x] 22.2 将 `roleBridgeOutputs.get(invocation.id)` 传入 `buildCapabilityEvidence({ invocation, ..., roleBridgeOutput: ... })` 的调用;非 role capability 的调用点此参数为 `undefined`，由任务 21.3 的守卫分支自动忽略
  - [x] 22.3 **不用** WeakMap / 模块级单例：每次 `createRouteGenerationSandboxDerivation` 调用都构造独立 Map，避免跨调用污染（`jobStore` 是通用持久化层，不持有运行时 Map）
  - [x] 22.4 grep `buildCapabilityEvidence(` 调用点确认全部传入 roleBridgeOutput（role capability 路径）或 undefined（非 role capability 路径）;确保不会因漏传导致 evidence.provenance.structuredRoles 在 real 路径下仍为 undefined
  - _Requirements: 3.5, 4.6, 4.8, 8.2_

- [x] 23. Checkpoint — 跑既有 52 E2E + 48 条子域单测确认未回归
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint --exclude "server/routes/blueprint/role-system-architecture/**" --exclude "server/routes/blueprint/aigc-spec-node/**" --exclude "server/routes/blueprint/mcp-github-source/**" --exclude "server/routes/blueprint/docker-analysis-sandbox/**"`，确认既有 48 条子域 co-located 单测（handoff / spec-documents / artifact-memory / agent-crew 等）继续通过;同时跑 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts` 确认既有 52 条 E2E（基线 45 + Docker 桥 +2 + MCP 桥 +3 + aigc-node 桥 +2 = 52）继续通过;若失败说明外层改造（任务 18-22）破坏了 invocation / evidence 字段形态等价性（需求 4.8 / 5.3），必须回到对应任务修复。
  - _Requirements: 4.8, 5.3, 8.2, 9.5_

- [x] 24. 在 `server/tests/blueprint-routes.test.ts` 追加 **E2E 用例 1**：Real LLM path + downstream retrieval sanity（R9.1a + R9.3 复合测试，独立编号不合并）
  - [x] 24.1 追加 **Real LLM path** 用例（需求 9.1a）：`process.env.BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED = "true"`;使用 `llmMocks.callLLMJson.mockImplementation((messages) => { ... })` 按 messages 关键词分发（routeset messages 含 `"RouteSet planner"` 或等价关键词返回 routeset payload；aigc messages 含 `"AIGC Spec Node"` / `"domain-reasoner"` 返回 aigc payload；role messages 含 `"Role System Architecture"` / `"角色架构推理器"` 关键词返回 design §6.2.1 给出的 3 角色 payload（`planner` / `architect` / `reviewer`，含 `activationStages` / `permissions`）;其它分支返回 `undefined`）;`POST /api/blueprint/jobs` 带 `targetText: "Build a release dashboard."` + `githubUrls: ["https://github.com/example/dashboard"]`
  - [x] 24.2 断言对应 `role-system-architecture` invocation 的 `provenance.executionMode === "real"`、`provenance.promptId === "blueprint.role-architecture.v1"`、`typeof provenance.model === "string"` 且非空、`provenance.responseDigest` 匹配 `/^sha256:[a-f0-9]{64}$/`、`provenance.structuredPayloadDigest` 匹配同上、`provenance.promptFingerprint` 匹配同上、`provenance.error === undefined`、`typeof provenance.primaryRouteId === "string"`、`provenance.roleCount === 3`、`outputSummary` 匹配 `/Composed\s+3\s+role/`
  - [x] 24.3 断言对应 capability 的 `adapter === "blueprint.runtime.role.llm"` 且不含 `.simulated` 子串（需求 4.4 + design §2.D6）
  - [x] 24.4 **Downstream retrieval sanity**（需求 9.3，**本 spec 特有、相对 aigc-node 桥 E2E 更深的断言**）：对应 `evidence.provenance.structuredRoles.digest === invocation.provenance.structuredPayloadDigest` 且 `evidence.provenance.structuredRoles.byteSize > 0`;断言 `evidence.provenance.structuredRoles.payload` 存在、`payload.roles.length === 3`、`payload.roles.map(r => r.id) === ["planner", "architect", "reviewer"]`、`payload.roles[0].activationStages` 包含 `"route_generation"`;断言 `evidence.provenance.primaryRouteId === invocation.provenance.primaryRouteId`、`evidence.provenance.roleCount === 3`、`evidence.provenance.executionMode === "real"`;**显式三元组检索**：通过 `evidenceItems.find(e => e.capabilityId === "role-system-architecture" && e.provenance.routeSetId === roleEvidence.provenance.routeSetId && e.provenance.primaryRouteId === roleEvidence.provenance.primaryRouteId && e.provenance.executionMode === "real")` 能唯一定位到同一条 evidence
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.5, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 5.1, 5.2, 5.3, 9.1, 9.3_

- [x] 25. 在 `server/tests/blueprint-routes.test.ts` 追加 **E2E 用例 2**：Fallback path（R9.1b，独立编号不合并到用例 1）
  - [x] 25.1 追加 **Fallback path** 用例（需求 9.1b）：`process.env.BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED = "true"`;`llmMocks.callLLMJson.mockImplementation((messages) => { if (/Role System Architecture|角色架构推理器/.test(JSON.stringify(messages))) { throw new Error("upstream 503"); } /* else routeset / aigc mock */ })`;`POST /api/blueprint/jobs` 带相同输入
  - [x] 25.2 断言对应 `role-system-architecture` invocation 的 `provenance.executionMode === "simulated_fallback"`、`provenance.error` 匹配 `/upstream 503|llm callJson threw/`、`provenance.roleCount === undefined`、`typeof provenance.primaryRouteId === "string"`（fallback 路径也填充，design §4.9）、`durationMs` 等于 `deterministicCapabilityDuration` 产出、`outputSummary` 来自 `buildCapabilityOutputSummary` 模板、`logs` 来自 `buildCapabilityInvocationLogs` 模板
  - [x] 25.3 断言对应 capability 的 `adapter === "blueprint.runtime.role.system-architecture.simulated"`（与 `getDefaultRuntimeCapabilities()` 既有值严格一致，design §2.D6）
  - [x] 25.4 断言对应 evidence 的 `provenance.structuredRoles === undefined` / `provenance.roleCount === undefined`;但 `typeof evidence.provenance.primaryRouteId === "string"`（fallback 路径下 evidence 也填充 primaryRouteId，任务 21.4 的逻辑）
  - [x] 25.5 两条 E2E 用例（24 + 25）共用一个 messages 分发 helper（建议落在测试文件顶部或独立 `test-helpers/fake-role-llm-dispatcher.ts`），覆盖 routeset / aigc / role 三类 prompt 的识别关键词;helper 不依赖真实 LLM / 不依赖外网 / 不依赖真实 apiKey
  - [x] 25.6 用例 setup / teardown 正确清理 `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED` 环境变量与临时 `specsRoot` 目录，避免污染其它用例;若 mock 被全局持有，teardown 重置 `llmMocks.callLLMJson.mockReset()`
  - [x] 25.7 **不改写** `server/tests/blueprint-routes.test.ts` 中原有 52 条 E2E 用例的任一断言（需求 9.5 / 1.11）;仅以追加方式补 2 条（24 + 25，对应 Docker 桥 +2 + MCP 桥 +3 + aigc-node 桥 +2 之后，累计 52 + 2 = 54 条）
  - _Requirements: 2.1, 3.1, 4.1, 4.2, 4.4, 4.8, 5.1, 5.2, 5.3, 5.4, 9.1, 9.5_

- [x] 26. 确认 SDK normalizer 支持新 provenance 字段，并完成全量回归 + 最终验收
  - [x] 26.1 检查 `client/src/lib/blueprint-api.ts` 与 `client/src/lib/blueprint-api/` 目录下是否存在 capability invocation / evidence provenance 的显式 normalizer
  - [x] 26.2 如使用对象 spread 或透明透传：确认无需改动，仅运行 SDK smoke 验证新字段（`primaryRouteId` / `roleCount`）+ evidence 的 `structuredRoles` 可选对象（4 字段含 `payload: RoleArchitectureResponse`）能到达客户端
  - [x] 26.3 如使用显式字段映射：追加可选字段透传到 invocation provenance normalizer（`primaryRouteId` / `roleCount`）与 evidence provenance normalizer（同上 + `structuredRoles?` 对象含 `digest` / `byteSize` / `summary` / `payload`）;**不得** 修改任一既有字段映射行为，**不得** 为新字段默认值或类型强制（保持 `string | number | RoleArchitectureResponse | undefined` 各自原样）
  - [x] 26.4 运行 `node --run check` → 不应引入新增 TS 错误（若仓库已有历史类型债，新增改动不应扩大错误面）
  - [x] 26.5 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts` → 52 + 2 = 54 条通过（基线 45 + Docker 桥 +2 + MCP 桥 +3 + aigc-node 桥 +2 + 本 spec +2）
  - [x] 26.6 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/role-system-architecture/` → ~35 条新增 co-located 单测通过（10 schema + 6 policy + 7 prompt + 4 summary-derivation + 8 bridge）
  - [x] 26.7 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint --exclude "server/routes/blueprint/role-system-architecture/**" --exclude "server/routes/blueprint/aigc-spec-node/**" --exclude "server/routes/blueprint/mcp-github-source/**" --exclude "server/routes/blueprint/docker-analysis-sandbox/**"` → 48 条既有子域单测继续通过
  - [x] 26.8 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts client/src/lib/blueprint-api/` → 9 条 SDK smoke 继续通过
  - [x] 26.9 **人工核查 4 项边界**（对应 design §10.2 最终检查清单）:
    - (a) Real LLM 路径下 capability event payload 的 `adapter === "blueprint.runtime.role.llm"` 且不含 `.simulated` 子串（需求 4.4）
    - (b) Fallback 路径下 capability event payload 的 `adapter === "blueprint.runtime.role.system-architecture.simulated"`（与 `getDefaultRuntimeCapabilities()` 既有值严格一致）
    - (c) `server/core/llm-client.ts` / `server/core/ai-config.ts` 源码**无**本 spec 引起的改动（需求 1.12 / design §2.D1 硬约束）；`shared/blueprint/contracts.ts` 中 `BlueprintAgentRole` / `BlueprintRolePresence` 类型定义**无**本 spec 引起的修改（需求 1.9 / design §1）
    - (d) grep `server/routes/blueprint/role-system-architecture/**/*.ts` 确认无 `import { callLLMJson }` / `import { getAIConfig }` / 模块级 `fetch(` / 硬编码 model 名 / 裸事件字符串 `"sandbox.job.started"` / 硬编码 temperature 默认值等违禁代码（design §2.D1 + §2.D10）
  - _Requirements: 1.8, 1.9, 1.10, 1.11, 4.4, 4.8, 5.4, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

## 说明

- 本任务清单所有任务均为必做项，不含 `*` 可选标记（spec 范围聚焦、体量可控；需求 9.4 明确锁定本 spec 不引入 PBT）。
- 每个任务都在 footer 中引用至少 1 个 EARS requirement id，便于追溯。
- 任务 6、8、10、12、15 是 example-based 单测（共 ~35 条），**不**包含 PBT（符合 Requirement 9.4、design §6.1）。design §6 给出的测试策略通过这些 example-based 单测覆盖。
- 任务 15 的 5 条硬需求严格对应 Requirement 9.2（happy / malformed / schema-fail / apiKey-missing）+ **Requirement 9.3（downstream-retrieval，本 spec 独有，独立编号 15.5）**;3 条补充（not-enabled / timeout / redaction E2E）覆盖 design §5.1 的五档错误路径与 §2.D10 的脱敏行为。
- 任务 24、25 向 `server/tests/blueprint-routes.test.ts` **追加** 2 条新用例（用例 1 real + retrieval / 用例 2 fallback），不修改原有 52 条（符合 Requirement 1.11、9.5）;最终 E2E 基线从 52 → 54。
- 任务 13、16、23 是 3 个中间 checkpoint，分别在子域纯模块、完整子域、外层改造后验证未回归；任务 26 是全量回归 + 最终验收（含 4 项人工核查对应 design §10.2 检查清单）。
- 任务 1、2 是本 spec 相对 aigc-node 桥的独有前置步骤（shared 纯类型文件 + barrel 重新导出；见 design §4.10）。
- 任务 18 的 `primaryRouteId?` 追加与任务 22 的聚合层 Map 构造是本 spec 相对 aigc-node 桥的独有外层改造（aigc-node 桥 input 追加的是 `clarificationSession?`，且无需聚合层 Map；见 design §2.D3 + §4.11）。
- 任务 21 的 `buildCapabilityEvidence` 签名改造（接受 `roleBridgeOutput?` 参数）是本 spec 最重的外层改造，相对 aigc-node 桥的 `structuredPayload?` 三字段追加更深一层（本 spec 的 `structuredRoles?` 含完整 `payload: RoleArchitectureResponse` 对象，下游可直接检索而非仅 digest）；见 design §4.8。
- 任务 15.5（downstream-retrieval）是独立任务编号，严格不合并到 happy path（15.1）或 E2E 用例 1（24）;这是为了让下游 Wave 2 `autopilot-agent-crew-stage-activation` 的消费可行性有独立、可追踪的测试证据（需求 9.3 + design §7.1）。
- 任务 24（用例 1 real + retrieval）与任务 25（用例 2 fallback）是独立编号的 E2E 子任务，不合并为单一用例;这是为了让 real 与 fallback 两条路径各自有独立的 AAA（Arrange-Act-Assert）结构，符合测试隔离最佳实践与 Requirement 9.1 的明确拆分语义。
- D1（工厂 DI）在任务 14.2 / 14.8 落地；D2（`BlueprintServiceContext` 最小扩展，仅追加 2 字段，不改 `ctx.llm`）在任务 4 / 17 落地；D3（invocation 层替换，不改外层 orchestration，input 追加 `primaryRouteId?`）在任务 18 / 19 落地；D4（30s timeout + env 覆盖）在任务 7.2 / 8.5 落地；D5（promptId `blueprint.role-architecture.v1`）在任务 9.1 / 10.4 落地；D6（adapter 字符串 `.llm` / `.simulated`）在任务 20.1 / 20.4 / 24.3 / 25.3 / 26.9 落地；D7（复用 `BlueprintEventName`）在任务 20.3 落地；D8（结构化 payload 承载方案 A + 4 字段 `structuredRoles` 含 `payload`）在任务 3.2 / 11.2 / 21.3 / 24.4 落地；D9（strict schema + `.superRefine(unique id)` + zod strip）在任务 5 / 6 落地；D10（独立 redaction helper）在任务 7.3 / 8.1-8.3 / 14.3 / 15.8 落地；D11（不引入 callback dispatcher，不改 `/api/executor/events` 中继链）在任务 18-22 范围外（本 spec 不动 server/index.ts）；D12（default test harness ≡ today's production behavior）在任务 17.2 / 25.7 / 26.7 落地。
- 任务 5.3 / 7.4 / 9.6 / 11.4 / 14.8 的"禁止 import"硬约束在 code review 阶段应直接拒绝违反者（与 routeset / Docker / MCP / aigc-node 桥 DI 硬约束对齐）。
- 任务 26 是强制的验证门禁，必须在所有实现任务完成后执行；任何一步失败都必须回到对应实现任务修复后再跑整套回归。4 项人工核查（26.9a/b/c/d）对应 design §10.2 检查清单的关键边界断言，不可省略。
- 本 spec 相对 Docker / MCP / aigc-node 桥的最大差异：(1) shared 侧新增独立纯类型文件（任务 1 + 2）；(2) Context 扩展最轻（仅 2 字段，不改 `ctx.llm`）与 aigc-node 桥一致；(3) input 追加 `primaryRouteId?`（本 spec 独有，相对 aigc-node 桥的 `clarificationSession?`）；(4) `buildCapabilityEvidence` 签名改造接受 `roleBridgeOutput?` 参数（本 spec 最重的外层改造）；(5) 外层聚合层新增 `Map<invocationId, RoleBridgeOutput>`（本 spec 独有架构）；(6) E2E 2 条但断言深度更深（用例 1 含 downstream retrieval 三元组检索）；(7) Bridge 单测 5 条硬需求（R9.2 四条 + R9.3 一条，相对 aigc-node 桥的 4 条多 1 条 downstream-retrieval 专测）；(8) `structuredRoles.payload` 承载**完整** `RoleArchitectureResponse` 对象（相对 aigc-node 桥的仅 digest 三字段，语义更深，下游可直接检索）。
- 本 spec 完成后，工作流结束 —— 本 spec 是 Tier 1/2 capability 桥体系的**第 4 条、也是最后一条**关键路径，是 Wave 2 `autopilot-agent-crew-stage-activation` 的硬前置（design §1 + §7）。用户可通过 `tasks.md` 中的 "Start task" 入口逐项执行。
