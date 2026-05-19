# 实施任务：Autopilot RouteSet LLM 驱动生成

## 概述

本任务清单把 design 文档中的 17 步实现大纲收敛为 15 个可验证的代码任务。每个任务都对应 `server/routes/blueprint/routeset/` 目录下的具体文件或 `server/routes/blueprint.ts` / `shared/blueprint/contracts.ts` 中的具体片段改动；所有任务均为本 spec 的必做项，不引入 `*` 可选标记。

依赖顺序：1（契约） → 2、3（schema） → 4、5（prompt） → 6、7（generator） → 8、9（context/deps） → 10、11（buildRouteSet / createGenerationJob） → 12（handler + caller trace） → 13（E2E） → 14（全量回归） → 15（可选前端透传）。

## 任务列表

- [x] 1. 在 `shared/blueprint/contracts.ts` 扩展 `BlueprintRouteSet.provenance`
  - [x] 1.1 追加 4 个可选字段到 `provenance` 类型：`generationSource?: "llm" | "llm_fallback" | "template"`、`promptId?: string`、`model?: string`、`error?: string`；不删除、不重命名、不修改任何既有字段
  - [x] 1.2 在仓库根运行 `node --run check`，确认新增字段不引入新 TS 错误；同时 grep `BlueprintRouteSet.provenance` / `provenance:` 确认没有现有消费者被破坏
  - _Requirements: 4.2, 4.3, 5.1, 5.2_

- [x] 2. 在 `server/routes/blueprint/routeset/route-schema.ts` 定义 zod 严格 schema
  - [x] 2.1 按 design §4.2 定义 `BlueprintRouteSetLlmResponseSchema`：包含 `RouteKindEnum`（`"primary" | "alternative"`）、`RiskLevelEnum` / `CostLevelEnum`（`"low" | "medium" | "high"`）、`ComplexityEnum`（`"light" | "balanced" | "deep"`，注意不是 `simple/standard/complex`）、`CapabilityUsageSchema` 与 `BlueprintRouteCandidateLlmSchema`；`routes` 数组 `.min(2).max(5)`
  - [x] 2.2 追加 `.refine()` 约束恰好一条 `kind === "primary"` 路线；导出类型 `BlueprintRouteSetLlmResponse = z.infer<typeof BlueprintRouteSetLlmResponseSchema>`
  - _Requirements: 3.3, 3.4_

- [x] 3. 在 `server/routes/blueprint/routeset/route-schema.test.ts` 新增 9 条 schema 单测
  - [x] 3.1 覆盖以下场景：合法响应通过 / `routes` 缺失 / 零条 primary / 两条 primary / `kind` 越界 / `riskLevel` 越界 / `capabilities` 为空 / 额外字段静默丢弃 / `title` 超长被拒绝（不裁剪）
  - [x] 3.2 使用 `BlueprintRouteSetLlmResponseSchema.safeParse(payload)` 模式，断言 `result.success` 与 `result.error?.message`
  - _Requirements: 3.3, 3.4, 9.2_

- [x] 4. 在 `server/routes/blueprint/routeset/route-prompt.ts` 实现确定性 prompt builder
  - [x] 4.1 导出常量 `ROUTE_SET_PROMPT_ID = "blueprint.routeset.v1"` 与类型 `RouteSetPromptPayload`
  - [x] 4.2 实现 `buildRouteSetPrompt(input)`，返回 `{ promptId, systemMessage, userMessage, userPayload }`；`answers` 按 `questionId` 字典序排序，`sources` / `assets` 按 `id` 字典序排序，`githubUrls` 保留输入顺序
  - [x] 4.3 按 design §4.4 实现 locale 分支：`locale === "zh-CN"` 时 `systemMessage` 使用中文规划器文案；其他情况使用英文文案（`"You are the /autopilot RouteSet planner..."`）
  - _Requirements: 3.1, 3.2, 6.3_

- [x] 5. 在 `server/routes/blueprint/routeset/route-prompt.test.ts` 新增 6 条 prompt 单测
  - [x] 5.1 断言确定性：同一输入产出 byte-identical `userMessage`
  - [x] 5.2 断言输入变化敏感：追加一条新的 clarification answer 后 `userMessage` 变化
  - [x] 5.3 断言 `answers` 按 `questionId` 字典序排序（输入 `["q-c","q-a","q-b"]` 应产出 `["q-a","q-b","q-c"]`）
  - [x] 5.4 断言 `locale === "zh-CN"` 时 `systemMessage` 包含 CJK 字符
  - [x] 5.5 断言 `locale === "en-US"` 时 `systemMessage` 以 `"You are the /autopilot RouteSet planner"` 开头
  - [x] 5.6 断言 `prompt.promptId` 恒等于 `"blueprint.routeset.v1"`
  - _Requirements: 3.1, 3.2, 6.3, 9.2_

- [x] 6. 在 `server/routes/blueprint/routeset/route-llm-generator.ts` 实现工厂与主生成逻辑
  - [x] 6.1 按 design §4.3 定义并导出接口 `RouteSetLlmGeneratorInput` / `RouteSetLlmProvenanceExtras` / `RouteSetLlmGeneratorOutput` / `RouteSetLlmGenerator`；导出工厂 `createRouteSetLlmGenerator(ctx: BlueprintServiceContext): RouteSetLlmGenerator`
  - [x] 6.2 按 design §4.6 伪代码实现 `generate(input)`：`apiKey` 缺失早退到 fallback；构造 prompt；`await ctx.llm.callJson(messages, { model, temperature: 0.2, maxTokens: 2000, retryAttempts: 1, timeoutMs })`；`safeParse` 校验；成功则走 normalize，失败则走 fallback 并在 `provenanceExtras.error` 中填 `truncate(err, 400)`
  - [x] 6.3 实现 `buildTemplatedRoutes(input)`，对 `["primary","alternative","alternative"]` 三档调用既有 `buildRouteCandidate()` 复现当前 3 条模板路线（`"Primary SPEC asset route"` / `"Documentation-first conservative route"` / `"Preview-first exploratory route"`），保证与今天不走 LLM 的字段结构 100% 一致
  - [x] 6.4 按 design §4.5 实现 `normalizeToRouteCandidates(llmRoutes, input)`：primary 路线的 `id` 重写为 caller 传入的 `primaryRouteId`；alternative 路线 id 为 `${routeSetId}:alternative-${index}`；capabilities 不在注册表时保留 LLM id 并用注册表补齐 label/kind；通过 `buildRouteCandidate` 的 `externalOverrides` 参数注入 LLM 骨架，由服务端自动生成 `steps` / `outputs`
  - [x] 6.5 强制通过 `ctx.llm.callJson` / `ctx.llm.getConfig` 与 `ctx.logger.warn` 访问依赖；**不得** `import { callLLMJson } from "../../core/llm-client.js"` 或 `import { getAIConfig } from "../../core/ai-config.js"`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 8.1, 8.2_

- [x] 7. 在 `server/routes/blueprint/routeset/route-llm-generator.test.ts` 新增 7 条 generator 单测
  - [x] 7.1 Happy path：mock `callJson` 返回合法 2 条路线 → 路线来自 LLM + `provenanceExtras.generationSource === "llm"` + `promptId === "blueprint.routeset.v1"` + `error` 未定义
  - [x] 7.2 LLM 抛错：`throw new Error("network unreachable")` → 3 条模板路线 + `generationSource === "llm_fallback"` + `error` 匹配 `/network unreachable/`
  - [x] 7.3 LLM 返回 `{}`：schema 校验失败 → 3 条模板路线 + `generationSource === "llm_fallback"` + `error` 匹配 `/Schema validation failed/`
  - [x] 7.4 LLM 返回无 primary 路线（全是 alternative）：refine 失败 → 3 条模板路线 + `generationSource === "llm_fallback"` + `error` 包含 `/primary/i`
  - [x] 7.5 `apiKey` 缺失：早退 fallback + `generationSource === "llm_fallback"` + `error` 匹配 `/not configured/i`；断言 `callJson` 未被调用
  - [x] 7.6 断言 `provenanceExtras.model` 反映 `ctx.llm.getConfig().model`（happy path 下配 `"gpt-4-turbo"` 时返回 `"gpt-4-turbo"`）
  - [x] 7.7 断言 normalize 把 primary 路线 id 改写为 caller 传入的 `primaryRouteId`（即使 LLM 产出的 id 是 `"llm-primary"`）
  - _Requirements: 2.4, 3.4, 4.1, 4.2, 4.3, 4.4, 6.2, 6.3, 6.4, 8.2, 9.2_

- [x] 8. 扩展 `BlueprintServiceContext` 以接受可选 `routeSetLlmGenerator`
  - [x] 8.1 在 `server/routes/blueprint/context.ts` 的 `BlueprintServiceContext` 与 `BlueprintServiceContextDeps` 上追加 `routeSetLlmGenerator?: RouteSetLlmGenerator`
  - [x] 8.2 在 `buildBlueprintServiceContext(deps)` 中，当 `deps.routeSetLlmGenerator` 未提供时使用 `createRouteSetLlmGenerator(ctx)` 构造默认实例并挂载到 ctx 上
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. 扩展 `BlueprintRouterDeps` 并改造 `createBlueprintRouter`
  - [x] 9.1 在 `server/routes/blueprint.ts` 的 `BlueprintRouterDeps` 追加 `routeSetLlmGenerator?: RouteSetLlmGenerator`
  - [x] 9.2 在 `createBlueprintRouter(deps)` 中按 `deps.routeSetLlmGenerator ?? createRouteSetLlmGenerator(ctx)` 解析实例，并在 `CreateGenerationJobOptions` 中透传给 `createGenerationJob`
  - _Requirements: 6.2, 6.3_

- [x] 10. 将 `buildRouteSet()` 改造为 async 并调用 generator
  - [x] 10.1 把 `buildRouteSet` 签名从 sync 改为 `async`，追加参数 `generator: RouteSetLlmGenerator`、`intake?: BlueprintIntake`、`projectContext?: BlueprintProjectDomainContext`
  - [x] 10.2 调用 `await generator({ request, intake, clarificationSession, projectContext, routeSetId, primaryRouteId, createdAt })`，使用返回的 `routes` 与 `provenanceExtras`
  - [x] 10.3 合并 provenance：保留所有既有字段不变（`projectId` / `sourceId` / `targetText` / `githubUrls` / 所有 `clarification*` 字段），追加 `generationSource` / `promptId` / `model` / `error` 四个新字段
  - _Requirements: 2.4, 2.5, 4.2, 5.1, 5.2, 7.4_

- [x] 11. 将 `createGenerationJob()` 改造为 async 并发出 `route.generated` 事件
  - [x] 11.1 把 `createGenerationJob` 签名改为 `async`；把 `CreateGenerationJobOptions` 追加必填字段 `routeSetLlmGenerator: RouteSetLlmGenerator`（调用方负责从 deps 或默认工厂解析并注入）
  - [x] 11.2 在内部 `await buildRouteSet(request, jobId, createdAt, clarificationSession, options.routeSetLlmGenerator, options.intake, options.context)` 并消费返回的 RouteSet
  - [x] 11.3 在调用 `createRouteGenerationSandboxDerivation()` **之前**追加一条 `createGenerationEvent({ type: BlueprintEventName.RouteGenerated, stage: "route_generation", status: "completed", artifactId: routeArtifact.id, payload: { routeSetId, primaryRouteId, routeCount, generationSource, promptId, model, error } })` 事件
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1_

- [x] 12. 将 `handleCreateGenerationJob` 改造为 async 并 trace 其他调用点
  - [x] 12.1 把 `handleCreateGenerationJob` 改为 `async (req, res) => { try { ...; const result = await createGenerationJob(resolved.request, options); res.status(201).json(result); } catch (error) { res.status(500).json({ error: "Failed to create blueprint generation job.", message: errorMessage(error) }); } }`；在 `options` 中传入已解析的 `routeSetLlmGenerator`
  - [x] 12.2 运行 `grep -nE "(createGenerationJob|buildRouteSet)\\(" server/ shared/ --include="*.ts"`，逐一检查匹配项：确认除 `server/routes/blueprint.ts` 内部调用外没有其他函数级调用；如有，追加 `await` 并把外层改 `async`
  - [x] 12.3 运行 `node --run check` 确认 sync → async 改造未引入新 TS 错误
  - _Requirements: 5.3, 5.4_

- [x] 13. 在 `server/tests/blueprint-routes.test.ts` 追加 2 条 E2E 用例
  - [x] 13.1 追加 **Happy path** 用例：在既有 routeSet 相关断言附近（不修改 45 条既有用例），`llmMocks.callLLMJson.mockResolvedValueOnce({ routes: [...] })` 注入 design §6.2.1 所述 2 条路线的合法 JSON；`POST /api/blueprint/jobs`；断言 `routeSet.routes.length === 2`、`routes[0].title === "LLM-derived balanced route"`、`routes[0].kind === "primary"`、`provenance.generationSource === "llm"`、`provenance.promptId === "blueprint.routeset.v1"`、`typeof provenance.model === "string"`、`provenance.error` 为 undefined
  - [x] 13.2 追加 **Fallback path** 用例：`llmMocks.callLLMJson.mockRejectedValueOnce(new Error("Connection timeout"))`；`POST /api/blueprint/jobs`；断言 `routeSet.routes.length === 3`、`routes[0].title === "Primary SPEC asset route"`（今日模板原文）、`provenance.generationSource === "llm_fallback"`、`provenance.error` 匹配 `/Connection timeout/`
  - _Requirements: 9.1_

- [x] 14. 执行全量回归并修复类型 / 测试失败
  - [x] 14.1 `node --run check` → 0 个新增 TS 错误（若仓库已有历史类型债，不应扩大错误面）
  - [x] 14.2 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts` → 45 + 2 = 47 条通过
  - [x] 14.3 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/routeset/` → ~22 条新增 co-located 单测通过（9 schema + 6 prompt + 7 generator）
  - [x] 14.4 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint` → 48 条既有子域单测继续通过
  - [x] 14.5 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts client/src/lib/blueprint-api/` → 9 条 SDK smoke 继续通过
  - _Requirements: 5.3, 5.4, 9.6_

- [x] 15. 确认 SDK normalizer 支持新 provenance 字段
  - [x] 15.1 检查 `client/src/lib/blueprint-api.ts` 与 `client/src/lib/blueprint-api/routeset.ts`（如存在）中是否存在显式的 routeSet / provenance normalizer
  - [x] 15.2 如使用对象 spread 或透明透传：确认无需改动，仅运行 SDK smoke 验证 4 个新字段能到达客户端
  - [x] 15.3 如使用显式字段映射：追加 4 行可选字段透传（`generationSource` / `promptId` / `model` / `error`）；**不得**修改任一既有字段映射行为
  - _Requirements: 5.4_

## 说明

- 本任务清单所有任务均为必做项，不含 `*` 可选标记（spec 范围聚焦、体量可控）。
- 每个任务都在 footer 中引用至少 1 个 EARS requirement id，便于追溯。
- 任务 3、5、7 是 example-based 单测（共 22 条），**不**包含 PBT（符合 Requirement 9.3）。
- 任务 13 只向 `server/tests/blueprint-routes.test.ts` **追加** 2 条新用例，不修改原有 45 条（符合 Requirement 9.6）。
- D5=A（仅 provenance 可见，无 UI banner）锁定了任务 15 的边界：SDK 只需透传，不改 UI。
- D6=A（locale-aware prompt）在任务 4.3 / 5.4 / 5.5 落地。
- D7（`promptId = "blueprint.routeset.v1"`）在任务 4.1 / 5.6 / 6.2 落地。
- D9（扩展现有 `route.generated` 事件 payload，不新增事件名）在任务 11.3 落地。
- 任务 14 是强制的验证门禁，必须在所有实现任务完成后执行；任何一步失败都必须回到对应实现任务修复后再跑整套回归。
- 本 spec 完成后，工作流结束——不在此 spec 内覆盖后续功能增强。用户可通过 `tasks.md` 中的 "Start task" 入口逐项执行。
