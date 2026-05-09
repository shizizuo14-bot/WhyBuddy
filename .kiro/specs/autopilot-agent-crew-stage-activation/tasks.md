# 实施任务：Autopilot Agent Crew — Stage Activation Driver

## 概述

本任务清单把 design 文档 §10.1 的 6 阶段实现大纲收敛为 25 个可验证的代码任务，覆盖：

- `shared/blueprint/events.ts` 的 `BlueprintGenerationEventType` union 追加 `"role.sleeping"` 与 `BlueprintEventName.RoleSleeping: "role.sleeping"` 常量（design §2.D4）
- `shared/blueprint/__tests__/events.test.ts` 追加 `RoleSleeping` 常量断言与 `resolveBlueprintEventFamily("role.sleeping") === "role"` family 映射断言
- `server/routes/blueprint/agent-crew-stage-activation/` 下 4 个新模块（`policy` / `state-machine` / `evidence-lookup` / `driver`）及其 co-located 单测
- `BlueprintServiceContext` 的 2 个可选依赖字段扩展（`agentCrewStageActivationPolicy?` + `agentCrewStageActivationDriver?`；**不改 `ctx.llm` 字段**、**不默认装配 driver** — driver 是 per-job 生命周期，在每条 job 起点由外层 lazy 构造）
- `buildBlueprintServiceContext` 对 `agentCrewStageActivationPolicy` 的默认装配（policy 无状态、可在 context 上默认装配；driver 不默认装配）
- `server/routes/blueprint.ts` 在 `createGenerationJob` / `createRouteGenerationSandboxDerivation` 作业起点 lazy 构造 driver，并在每个 stage 推进点（当前已 emit `BlueprintEventName.JobStage` / `BlueprintEventName.SandboxJobStarted` 的位置）追加 `driver?.onStageTransition(...)` 可选链调用；**不删除** `buildAgentCrew()` / `buildRolePresence()` / `createRolePresenceEvents()` 一行（需求 7.2 + design §1.4）
- `server/tests/blueprint-routes.test.ts` 追加 2 条 E2E（Real + 多 stage 序列 / Fallback path）
- 最终全量回归 + 4 项人工核查（对应 design §10.2 检查清单）

每个任务都对应明确的落点文件、函数与验收标准；所有任务均为本 spec 的必做项，不引入 `*` 可选标记。

依赖顺序：1、2（events union 扩展 + family 映射测试） → 3、4（policy + 单测） → 5、6（state-machine + 单测） → 7、8（evidence-lookup + 单测） → 9（纯函数 checkpoint） → 10、11（driver 实现 + 单测：R9.2 四条硬需求 + R8.1/R8.2 两条幂等专测 + 补充覆盖） → 12（完整子域 checkpoint） → 13（Context 扩展：policy 默认装配、driver 不默认装配） → 14（外层 hook 点：lazy 构造 + `onStageTransition` 可选链注入） → 15（既有 54 E2E + 48 子域回归 checkpoint） → 16、17（E2E 追加：real + 多 stage 序列 / fallback） → 18（SDK 透传） → 19（全量回归 + 最终验收含 4 项人工核查）。

需求 9.3、design §6.1 明确锁定本 spec **不引入 PBT**；所有单测均为 example-based，共 ~32 条 co-located 单测 + 2 条 E2E。design §6 给出的测试策略通过以下 example-based 单测覆盖：policy.test ~5 条 + state-machine.test ~8 条 + evidence-lookup.test ~7 条 + driver.test 6 条硬需求 + ~6 条补充 = 12 条。其中 driver.test 的 6 条硬需求严格对应 R9.2（4 态映射 / 未来激活 watching / 历史激活 sleeping / fallback silent）+ R8.1（determinism）+ R8.2（triplet idempotence）。

## 任务列表

- [x] 1. 在 `shared/blueprint/events.ts` 追加 `RoleSleeping` 常量与 union 成员
  - [x] 1.1 在 `BlueprintGenerationEventType` union 的 `role` 家族段内追加一行 `| "role.sleeping"`；插入位置建议在 `"role.review_completed"` 与 `"role.completed"` 之间，保持与既有 4 态 presence 事件（`active` / `watching` / `reviewing` / `completed`）聚拢（design §2.D4）
  - [x] 1.2 在 `BlueprintEventName` 常量对象的 `// Agent Crew roles` 段内追加 `RoleSleeping: "role.sleeping"`；插入位置与 1.1 保持一致，放在 `RoleReviewCompleted` 与 `RoleCompleted` 之间
  - [x] 1.3 **不改** `BlueprintGenerationEventFamily` union（`role` 家族已存在）；**不改** `resolveBlueprintEventFamily` 实现（其按 `.` 分段首项返回 family，对 `"role.sleeping"` 自动返回 `"role"`，无需改动）
  - [x] 1.4 运行 `node --run check` 确认 union 与常量对象的 `satisfies Record<string, BlueprintGenerationEventType>` 类型守卫通过，未引入新增 TS 错误
  - _Requirements: 3.1, 3.3, 4.2_

- [x] 2. 在 `shared/blueprint/__tests__/events.test.ts` 追加 `RoleSleeping` 常量断言与 family 映射断言
  - [x] 2.1 在既有 `describe("BlueprintEventName", ...)` 块的 `"常量键名使用 PascalCase"` 之后、`"resolveBlueprintEventFamily 返回事件名的首段"` 之前，追加一个 `it("exposes RoleSleeping constant matching role.sleeping", () => { expect(BlueprintEventName.RoleSleeping).toBe("role.sleeping"); })` 断言（与既有 `"role.activated"` / `"role.watching"` 断言形态一致）
  - [x] 2.2 在 `"resolveBlueprintEventFamily 返回事件名的首段"` 的 `samples` 数组中追加 `{ type: BlueprintEventName.RoleSleeping, family: "role" }`，确保 family 映射被显式覆盖
  - [x] 2.3 **不改写**原有 `"ships 12 families"` / `"每个常量值都是合法的 BlueprintGenerationEventType"` / `"常量键名使用 PascalCase"` / enumValues 同构锁定等断言的任一表达式（需求 9.4）
  - [x] 2.4 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts shared/blueprint/__tests__/events.test.ts`，确认所有断言通过
  - _Requirements: 3.3, 4.2, 9.4_

- [x] 3. 新建 `server/routes/blueprint/agent-crew-stage-activation/policy.ts`
  - [x] 3.1 按 design §4.3 定义并导出 `AgentCrewStageActivationPolicy` 接口（字段：`suppressRepeatedStates: boolean`、`enforceTripletIdempotence: true`、`defaultLocale: "zh-CN" | "en-US"`、`supportedPromptIds: readonly string[]`、`redactedEmailPattern: RegExp`、`redactedApiKeyPattern: RegExp`、`redactedGithubPatPattern: RegExp`、`redactionKeywords: readonly string[]`、`maxErrorBytes: number`）
  - [x] 3.2 导出 `createDefaultAgentCrewStageActivationPolicy()`：默认 `suppressRepeatedStates: true` / `enforceTripletIdempotence: true` / `defaultLocale: "en-US"` / `supportedPromptIds: ["blueprint.role-architecture.v1"] as const` / `redactedEmailPattern: /[\w.+-]+@[\w.-]+/g` / `redactedApiKeyPattern: /\b(sk-[A-Za-z0-9]{20,}|clp_[A-Za-z0-9]{20,})\b/g` / `redactedGithubPatPattern: /\b(gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g` / `redactionKeywords: ["authorization","token","api_key","apikey","secret","password","bearer","access_token"]` / `maxErrorBytes: 400`
  - [x] 3.3 导出 `applyAgentCrewRedaction(value: string, policy: AgentCrewStageActivationPolicy): string` 纯函数：依次替换 API key → GitHub PAT → email → `redactionKeywords` 的 `key:value` 对（大小写不敏感，使用 `escapeRegex` 转义 keyword 避免正则注入）；返回脱敏后的字符串
  - [x] 3.4 **禁止** 在本文件 `import` 任何运行时依赖；纯数据 + 纯函数 only（design §2.D1 硬约束）
  - _Requirements: 2.4, 4.2, 6.1, 6.2_

- [x] 4. 新建 `server/routes/blueprint/agent-crew-stage-activation/policy.test.ts`（~5 条）
  - [x] 4.1 断言 `createDefaultAgentCrewStageActivationPolicy()` 返回值的每个字段与 design §4.3 默认值严格一致（`suppressRepeatedStates === true` / `defaultLocale === "en-US"` / `supportedPromptIds` 数组内容为 `["blueprint.role-architecture.v1"]` / `maxErrorBytes === 400`）
  - [x] 4.2 `applyAgentCrewRedaction` 把 `"key=sk-ABCDEFGHIJKLMNOP1234567890"` 中 token 替换为 `[redacted-api-key]`；把 `"ghp_abcdefghijklmnopqrstuvwxyz0123456789AB"` 替换为 `[redacted-github-token]`；把 `"github_pat_abcdefghijklmnopqrstuv"` 替换为 `[redacted-github-token]`
  - [x] 4.3 `applyAgentCrewRedaction("user@example.com", policy)` 返回形如 `"[redacted-email]"`
  - [x] 4.4 `applyAgentCrewRedaction("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9", policy)` 返回形如 `"Authorization: [redacted]"`；`applyAgentCrewRedaction("api_key=superSecret123", policy)` 返回形如 `"api_key: [redacted]"`（或等价脱敏形态）
  - [x] 4.5 `maxErrorBytes` 截断验证：手工调用 `reason.slice(0, policy.maxErrorBytes)` 等价地验证 `maxErrorBytes === 400` 生效，避免 driver 内部在 fallback 路径写入过长 error 字符串（预留给 driver 内部 `enterFallback` 调用链消费）
  - _Requirements: 2.4, 4.2, 4.5, 9.2_

- [x] 5. 新建 `server/routes/blueprint/agent-crew-stage-activation/state-machine.ts`
  - [x] 5.1 按 design §4.5 + §2.D5 定义并导出 `StageRoleStateEntry` 类型（`{ roleId: string; stage: BlueprintGenerationStage; state: BlueprintRolePresenceState }`）与 `deriveStageRoleStateMap(input: { roles: RoleArchitectureResponse["roles"]; primaryRouteStages: BlueprintGenerationStage[]; currentStageId: BlueprintGenerationStage }): Map<string, BlueprintRolePresenceState>` 纯函数
  - [x] 5.2 实现状态机 4 条规则（按顺序判定，先命中者生效）：(1) `currentStageId ∈ role.activationStages` → `"active"`；(2) 历史有 active 且未来无 active + `currentIndex === lastActivation + 1` → `"reviewing"`；(3) 未来有 active → `"watching"`；(4) 其它（含未来无 active、历史非紧邻） → `"sleeping"`
  - [x] 5.3 边界：`currentStageId` 不在 `primaryRouteStages` 中（`indexOf === -1`）→ 所有 role 映射为 `sleeping`；`role.activationStages` 中项不在 primary route 时过滤掉（不计入 stageIndex 判定）；`role.activationStages === []` 或全部无效 → 该 role 所有 stage 映射为 `sleeping`
  - [x] 5.4 **禁止** 在本文件 `import` 任何运行时 / 业务模块；仅 `import type` shared 类型（`BlueprintGenerationStage` / `BlueprintRolePresenceState` / `RoleArchitectureResponse`）；纯函数 only（design §2.D1 硬约束）
  - _Requirements: 2.3, 2.5, 3.1, 3.2, 8.1_

- [x] 6. 新建 `server/routes/blueprint/agent-crew-stage-activation/state-machine.test.ts`（~8 条，穷举 4 态转移 + 边界）
  - [x] 6.1 **Rule 1 active**：`role.activationStages = ["input"]`、`primaryRouteStages = ["input","clarification","spec_tree"]`、`currentStageId = "input"` → `state === "active"`
  - [x] 6.2 **Rule 2 reviewing（紧邻过去 active）**：`role.activationStages = ["input"]`、`primaryRouteStages = ["input","clarification","spec_tree"]`、`currentStageId = "clarification"` → `state === "reviewing"`
  - [x] 6.3 **Rule 2 → sleeping（非紧邻过去 active）**：同上但 `currentStageId = "spec_tree"` → `state === "sleeping"`（不再发 reviewing，已经走过 reviewing 窗口）
  - [x] 6.4 **Rule 3 watching**：`role.activationStages = ["spec_tree"]`、`primaryRouteStages = ["input","clarification","spec_tree"]`、`currentStageId = "input"` → `state === "watching"`
  - [x] 6.5 **Rule 4 sleeping（无任何 active）**：`role.activationStages = []`、`primaryRouteStages = ["input","clarification"]`、`currentStageId = "input"` → `state === "sleeping"`
  - [x] 6.6 **连续 active**：`role.activationStages = ["input","clarification"]`、`primaryRouteStages = ["input","clarification","spec_tree"]`、`currentStageId = "clarification"` → `state === "active"`（Rule 1 先命中，不走 reviewing）
  - [x] 6.7 **边界：stageIndex 未命中**：`currentStageId = "engineering_handoff"` 但 `primaryRouteStages` 不含此 stage → 所有 role 映射为 `sleeping`（即使 role `activationStages` 包含合法项）
  - [x] 6.8 **边界：activationStages 全部无效**：`role.activationStages = ["unknown_stage"]`（不在 primary route 中）+ 任意 `currentStageId` → 该 role 映射为 `sleeping`（过滤后视为空数组）
  - _Requirements: 2.3, 2.5, 3.1, 9.2_

- [x] 7. 新建 `server/routes/blueprint/agent-crew-stage-activation/evidence-lookup.ts`
  - [x] 7.1 按 design §4.4 定义并导出 `EvidenceLookupResult` 类型（`{ status: "real"; evidence: BlueprintCapabilityEvidence; payload: RoleArchitectureResponse }` | `{ status: "fallback"; reason: string }`）与 `findRoleArchitectureEvidence(input: { job: BlueprintGenerationJob | null; routeSetId?: string; primaryRouteId?: string; policy: AgentCrewStageActivationPolicy }): EvidenceLookupResult` 纯函数
  - [x] 7.2 实现检索路径（与 role-bridge design §7.3 契约一致）：(1) `job === null` → `fallback "job not found"`；(2) `job.artifacts.filter(a => a.type === "capability_evidence").map(a => a.payload as BlueprintCapabilityEvidence).filter(e => e.capabilityId === "role-system-architecture")` 候选集；(3) 筛 `executionMode === "real"` + 若指定 `routeSetId` / `primaryRouteId` 三元组匹配；(4) 未找到 real 候选且存在 fallback 候选 → `fallback "role bridge fallback"`；未找到任何候选 → `fallback "role evidence not found"`；(5) real 候选存在但 `structuredRoles === undefined || payload === undefined` → `fallback "structured roles missing"`；(6) real 候选 `promptId` 不在 `policy.supportedPromptIds` 白名单 → `fallback "promptId <v> not supported"`；(7) 全部通过 → `{ status: "real", evidence, payload }`
  - [x] 7.3 `fallback.reason` 字面量与 design §5 Error Handling 表严格对齐：`"job not found"` / `"role evidence not found"` / `"role bridge fallback"` / `"structured roles missing"` / `"promptId <v> not supported"`（v 部分使用 evidence.provenance.promptId 实际值或 `"missing"` 占位）
  - [x] 7.4 **禁止** 在本文件 `import` 运行时业务模块；仅 `import type` shared 类型（`BlueprintCapabilityEvidence` / `BlueprintGenerationJob` / `RoleArchitectureResponse`）与 policy 类型；纯函数 only
  - _Requirements: 2.1, 2.2, 2.6, 5.1, 6.2, 6.4_

- [x] 8. 新建 `server/routes/blueprint/agent-crew-stage-activation/evidence-lookup.test.ts`（~7 条）
  - [x] 8.1 **Real path + 三元组完全匹配**：构造 job with artifact type=`capability_evidence`、payload.capabilityId=`role-system-architecture`、payload.provenance.executionMode=`real`、payload.provenance.routeSetId=`"rs-abc"`、payload.provenance.primaryRouteId=`"rs-abc:primary"`、payload.provenance.promptId=`"blueprint.role-architecture.v1"`、payload.provenance.structuredRoles.payload.roles.length=2；调用 `findRoleArchitectureEvidence({ job, routeSetId: "rs-abc", primaryRouteId: "rs-abc:primary", policy })` → `status === "real"` + `payload.roles.length === 2`
  - [x] 8.2 **job === null**：`findRoleArchitectureEvidence({ job: null, policy })` → `status === "fallback"` + `reason === "job not found"`
  - [x] 8.3 **无 role-system-architecture 候选 evidence**：job.artifacts 为空 / 或 artifacts 只含其它 capability → `reason === "role evidence not found"`
  - [x] 8.4 **fallback 候选存在但无 real**：job 中唯一 role-system-architecture evidence 的 `executionMode === "simulated_fallback"` → `reason === "role bridge fallback"`
  - [x] 8.5 **structuredRoles 缺失（契约违反）**：real evidence 存在但 `provenance.structuredRoles === undefined` → `reason === "structured roles missing"`
  - [x] 8.6 **promptId v2 不支持**：real evidence 存在且 `structuredRoles.payload` 合法但 `provenance.promptId === "blueprint.role-architecture.v2"` → `reason === "promptId blueprint.role-architecture.v2 not supported"`（或等价字面量，含 `"not supported"` 子串）
  - [x] 8.7 **三元组部分匹配**：real evidence 存在但 `routeSetId` 对、`primaryRouteId` 不对 → 不命中 real 候选 → `reason === "role evidence not found"`（或 `"role bridge fallback"` 取决于是否存在 fallback 候选）
  - _Requirements: 2.1, 2.2, 5.1, 6.4, 9.2_

- [x] 9. Checkpoint — 跑通子域纯函数模块单测
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/agent-crew-stage-activation/policy.test.ts server/routes/blueprint/agent-crew-stage-activation/state-machine.test.ts server/routes/blueprint/agent-crew-stage-activation/evidence-lookup.test.ts`，确认 ~20 条单测（5 policy + 8 state-machine + 7 evidence-lookup）全部通过；若失败必须修复对应模块后再继续。同时跑 `node --run check` 确认此时仓库无新增类型错误。
  - _Requirements: 9.2, 9.3_

- [x] 10. 新建 `server/routes/blueprint/agent-crew-stage-activation/driver.ts`
  - [x] 10.1 按 design §4.2 定义并导出 `AgentCrewStageActivationTransition` 类型（`"stage_started" | "stage_completed" | "stage_retry" | "manual_override"`）、`AgentCrewStageActivationInput`（`{ jobId; stageId; transition; job }`）、`AgentCrewStageActivationExecutionMode`（`"real" | "simulated_fallback" | "not_determined"`）、`AgentCrewStageActivationDriver` 接口（含 `onStageTransition(input): void` 方法与只读 `executionMode` / `lastFallbackReason?` 属性）
  - [x] 10.2 按 design §2.D7 + §4.6 定义内部 `RoleTracker` 数据结构（`{ lastEmittedState: BlueprintRolePresenceState | null; lastStageId: BlueprintGenerationStage | null; stageAttemptByStage: Map<BlueprintGenerationStage, number>; emittedTriplets: Set<string> }`）；`emittedTriplets` 的 key 格式为 `"${stageId}:${stageAttempt}:${state}:${roleId}"`
  - [x] 10.3 定义 `STATE_TO_EVENT_NAME: Record<BlueprintRolePresenceState, BlueprintGenerationEventType>` 常量映射表：`active → BlueprintEventName.RoleActivated` / `watching → BlueprintEventName.RoleWatching` / `reviewing → BlueprintEventName.RoleReviewStarted` / `sleeping → BlueprintEventName.RoleSleeping`（本 spec 任务 1 新增常量）
  - [x] 10.4 导出工厂 `createAgentCrewStageActivationDriver(ctx: BlueprintServiceContext): AgentCrewStageActivationDriver`；按 design §4.6 伪代码实现主算法 7 步：(1) 环境变量 gate（`BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED !== "true"` → `enterFallback("driver not enabled")` + `debug`）→ (2) job 终态 gate（R8.5：`jobCompleted` 标志或 `job.status === "completed" | "failed"` → 静默跳过）→ (3) 只处理 `transition === "stage_started"`（其它 transition `debug` 日志 + 跳过，当前版本不处理）→ (4) 从 `input.job.request?.routeSetId` / `input.job.stageState?.nextAction?.routeId` 抽取三元组，调 `findRoleArchitectureEvidence(...)` → fallback 档位统一走 `enterFallback(lookup.reason)` → (5) 从 `input.job.routeSet` 解析 `primaryRoute`，校验 `primaryRoute.stages.length > 0` → (6) 调 `deriveStageRoleStateMap({ roles: payload.roles, primaryRouteStages, currentStageId: input.stageId })` → (7) 对 `payload.roles` 按原始数组顺序遍历（稳定 outer: role-first R3.6）：计算 `stageAttempt`（仅在当前 stage 未记录时递增为 1）→ 幂等三元组检查 → 状态抑制（`suppressRepeatedStates` 且 `lastEmittedState === newState && lastStageId !== stageKey`）→ 构造 event 并 `ctx.eventBus.emit(...)` → 更新 tracker
  - [x] 10.5 按 design §4.6 + §D6 构造事件 payload：`id = createId("blueprint-role-event")`、`type = STATE_TO_EVENT_NAME[newState]`、`family = "role"`、`jobId` / `projectId` / `stage` / `status` 从 `input` / `input.job` 提取、`message = applyAgentCrewRedaction(locale-aware 派生, policy)`、`occurredAt = ctx.now().toISOString()`、`roleId = role.id`、`presenceState = newState`、`evidenceId = evidence.id`；追加 Driver 新增可选字段 `activationDriverExecutionMode: "real"` / `stageAttempt` / `triggeredBy: input.transition` / `roleLabel: role.label` / `sourceEvidenceId: evidence.id`
  - [x] 10.6 按 design §D8 实现 `enterFallback(reason)`：设 `executionMode = "simulated_fallback"`、`lastFallbackReason = applyAgentCrewRedaction(reason.slice(0, policy.maxErrorBytes), policy)`、按 reason 分类 logger 级别（`structured roles missing` / `not supported` → `warn`；其它 → `debug`）；fallback 路径下 `ctx.eventBus.emit` **未**被调用（需求 5.5 + 8.3）
  - [x] 10.7 **禁止** `import { callLLMJson } from "../../../core/llm-client.js"` / `import { getAIConfig } from "../../../core/ai-config.js"`、**禁止** 模块级 `fetch(` / `import "node-fetch"` / `"got"` / `"undici"`、**禁止** 硬编码任何 role id / stage id 字面量（所有标识从 evidence / `BlueprintGenerationStage` 派生）、**禁止** `import` 模块级 evidence store / event bus 单例 / `jobStore` 模块级单例；所有依赖必须来自 `ctx: BlueprintServiceContext`（design §2.D1 + §2.D11 硬约束）
  - _Requirements: 2.1, 2.3, 2.5, 2.6, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4, 5.1, 5.3, 5.6, 6.1, 6.2, 8.1, 8.2, 8.4, 8.5_

- [x] 11. 新建 `server/routes/blueprint/agent-crew-stage-activation/driver.test.ts`（**R9.2 四条硬需求 + R8.1 + R8.2 = 6 条硬需求** + ~6 条补充 = 12 条）
  - [x] 11.1 **R9.2 (a) Initial activation — stage → role-state 映射正确性**（硬需求）：按 design §6.3.1 构造合法结构化角色 JSON（`planner.activationStages = ["input","clarification"]`、`architect.activationStages = ["spec_tree"]`、`reviewer.activationStages = ["engineering_handoff"]`）+ primary route stages = `["input","clarification","spec_tree","engineering_handoff"]`；`BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED=true`；依次调用 `driver.onStageTransition({ stageId: "input", transition: "stage_started", ... })`；断言 spy eventBus 捕获的事件 types 按稳定顺序为 `["role.activated"(planner), "role.watching"(architect), "role.watching"(reviewer)]`、每条事件 `presenceState` 与 type 映射一致（`active → role.activated` / `watching → role.watching` / `reviewing → role.review_started` / `sleeping → role.sleeping`）
  - [x] 11.2 **R9.2 (b) Mid-stage watching — 未来激活的 role 处于 watching**（硬需求）：构造 role `activationStages = ["spec_tree"]`、primaryRouteStages = `["input","clarification","spec_tree"]`、`currentStageId = "input"`；断言 driver 发射 `role.watching` 事件，`presenceState === "watching"`
  - [x] 11.3 **R9.2 (c) Final sleeping — 历史激活后彻底退出**（硬需求）：role `activationStages = ["input"]`、primaryRouteStages = `["input","clarification","spec_tree"]`；按顺序触发 3 个 stage：`input` → `role.activated`；`clarification` → `role.review_started`（刚离开，reviewing）；`spec_tree` → `role.sleeping`（彻底退出）；断言三次 emit 的 type / presenceState 序列严格为 `["role.activated"(active), "role.review_started"(reviewing), "role.sleeping"(sleeping)]`
  - [x] 11.4 **R9.2 (d) Role-bridge fallback silent — driver 静默回退**（硬需求）：注入 ctx + job（无 `role-system-architecture` evidence 或 evidence.executionMode === `"simulated_fallback"`）；`BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED=true`；调用 `driver.onStageTransition(...)`；断言 `ctx.eventBus.emit` spy **从未被调用**（`expect(emitSpy).not.toHaveBeenCalled()`）+ `driver.executionMode === "simulated_fallback"` + `driver.lastFallbackReason` 包含 `"role evidence not found"` 或 `"role bridge fallback"` + `ctx.logger.debug` 被调用（`warn` 未被调用）
  - [x] 11.5 **R8.1 Determinism 幂等性专测**（硬需求）：按 11.1 同样输入连续运行 2 次（每次 `ctx.now` 固定为 `new Date("2026-01-01T00:00:00.000Z")` / `new Date("2026-01-01T00:00:01.000Z")` 以区分 `occurredAt`）；捕获两次 emit 的事件序列；断言除 `id` / `occurredAt` 外，所有字段（`type` / `roleId` / `stage` / `presenceState` / `stageAttempt` / `triggeredBy` / `roleLabel` / `sourceEvidenceId` / `activationDriverExecutionMode` / `message` 等）字节级相等（可通过 `omit(event, ["id", "occurredAt"])` 辅助函数断言两序列 `toEqual`）
  - [x] 11.6 **R8.2 Triplet idempotence 幂等性专测**（硬需求）：同一 `stageId` 调用 `driver.onStageTransition({ stageId: "input", transition: "stage_started", ... })` 两次（模拟同一 stage 被重复进入）；断言第一次发射完整事件集、第二次 emit spy **不再发射** 任何已发射过的 `(roleId, stageId, stageAttempt)` 三元组对应事件（`emittedTriplets` 命中跳过）；补一次显式 `transition: "stage_retry"` 调用验证未来扩展点（当前版本 debug 跳过，不报错）
  - [x] 11.7 **补充：Not enabled 档位 1**：不设 `BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED`（或设为 `"false"` / `"0"`）+ emit spy；断言 emit 未被调用 + `driver.executionMode === "simulated_fallback"` + `lastFallbackReason === "driver not enabled"` + `logger.debug` 被调用（`warn` 未被调用）
  - [x] 11.8 **补充：PromptId v2 mismatch 档位 5**：注入 evidence with `provenance.promptId === "blueprint.role-architecture.v2"`（其它字段合法）；断言 emit 未被调用 + `lastFallbackReason` 匹配 `/not supported/` + `logger.warn` 被调用
  - [x] 11.9 **补充：structuredRoles missing 档位 4**：注入 evidence with `provenance.executionMode === "real"` 但 `provenance.structuredRoles === undefined`；断言 emit 未被调用 + `lastFallbackReason === "structured roles missing"` + `logger.warn` 被调用
  - [x] 11.10 **补充：Event after job completed**（R8.5）：先调一次 `onStageTransition(...)` 触发 `executionMode === "real"`，再设 `job.status = "completed"` 并再次调 `onStageTransition(...)`；断言第二次 emit 未被调用（jobCompleted 标志生效）+ `logger.debug` 被调用
  - [x] 11.11 **补充：Event before any transition**（R8.4）：构造 driver 但**不**调用 `onStageTransition`；断言 spy eventBus 未收到任何 `role.*` 事件 + `driver.executionMode === "not_determined"`（初始态）+ `lastFallbackReason === undefined`
  - [x] 11.12 **补充：suppressRepeatedStates**（R3.7）：连续两个 stage 都保持 `active`（例如 `role.activationStages = ["input","clarification"]`、`primaryRouteStages = ["input","clarification"]`）；断言第一个 stage emit `role.activated`、第二个 stage emit 被抑制（policy 默认 `suppressRepeatedStates: true`）；覆盖 policy `suppressRepeatedStates: false` 时允许两次发射
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 5.1, 5.5, 6.4, 8.1, 8.2, 8.4, 8.5, 9.1, 9.2_

- [x] 12. Checkpoint — 跑通完整 agent-crew-stage-activation 子域测试
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/agent-crew-stage-activation/`，确认 ~32 条单测（5 policy + 8 state-machine + 7 evidence-lookup + 12 driver）全部通过；此 checkpoint 保证 driver 核心实现在接入外层之前已稳定。design §6 的测试策略通过本 checkpoint 等价覆盖。
  - _Requirements: 9.2, 9.3_

- [x] 13. 在 `server/routes/blueprint/context.ts` 扩展 `BlueprintServiceContext` 依赖字段
  - [x] 13.1 在 `BlueprintServiceContext` 与 `BlueprintServiceContextDeps` 上追加 2 个可选字段：`agentCrewStageActivationPolicy?: AgentCrewStageActivationPolicy`、`agentCrewStageActivationDriver?: AgentCrewStageActivationDriver`；类型仅 `import type`，不 import 工厂实现避免循环依赖
  - [x] 13.2 在 `buildBlueprintServiceContext(deps)` 中：若 `deps.agentCrewStageActivationPolicy` 未提供，调用 `createDefaultAgentCrewStageActivationPolicy()` 挂到 ctx 上（policy 无状态、可默认装配）；**不默认装配 driver**（driver 是 per-job 生命周期，内部有 tracker state，不宜放 context 单例位置；design §2.D2）
  - [x] 13.3 保持向后兼容：`buildBlueprintServiceContext(deps)` 在 `deps` 未提供 policy / driver 字段时仍能构造出合法 Context，既有单测与 E2E 无感知（driver 字段默认 `undefined`，外层在每条 job 起点 lazy 构造并写回 ctx；任务 14 处理）
  - [x] 13.4 新增字段的装配顺序：先解析 `logger` / `now` / `llm` / `eventBus` 等既有字段，再装配 `agentCrewStageActivationPolicy`（纯数据），位置放在 role-bridge 桥装配 / aigc-node 桥装配之后；互不影响
  - [x] 13.5 运行 `node --run check` 确认类型扩展未引入新 TS 错误
  - _Requirements: 6.1, 6.2, 6.3, 6.6, 7.1, 7.2_

- [x] 14. 在 `server/routes/blueprint.ts` 追加外层 hook 点：lazy 构造 driver + `onStageTransition` 可选链注入
  - [x] 14.1 **lazy 构造 driver**：在 `createGenerationJob(request, options)` 函数体开头（`createdAt` / `jobId` 计算之后、首次 `BlueprintEventName.JobStage` emit 之前），追加 `if (!ctx.agentCrewStageActivationDriver) { ctx.agentCrewStageActivationDriver = createAgentCrewStageActivationDriver(ctx); }`；在 `createRouteGenerationSandboxDerivation(input)` 函数体开头同样追加一次（同一 ctx 下两次调用复用同一实例）（design §4.7 + §2.D2）
  - [x] 14.2 **Hook 点 A — createGenerationJob 首个 stage emit 处**：在 `server/routes/blueprint.ts` 第 ~2260 行附近首次 emit `BlueprintEventName.JobStage`（`stage: "route_generation"` / `status: "running"`）位置之后，追加一行 `ctx.agentCrewStageActivationDriver?.onStageTransition({ jobId, stageId: "route_generation", transition: "stage_started", job: <当前 job 引用> })`（使用可选链调用，未注入 driver 时等价空语句）
  - [x] 14.3 **Hook 点 B — createRouteGenerationSandboxDerivation SandboxJobStarted emit 处**：在第 ~3200 行附近 emit `BlueprintEventName.SandboxJobStarted` 位置之后，追加 `driver?.onStageTransition({ jobId, stageId: "route_generation", transition: "stage_started", job })`；同理在第 ~9550 行附近另一处 `SandboxJobStarted` emit 点追加（若 stage 不同则 `stageId` 取当前 stage 变量）
  - [x] 14.4 **Hook 点 C — selectRoute / resetRouteSelection / updateSpecTreeNode / saveSpecDocumentVersion / reviewSpecDocument 等后续 stage 推进点**：对每个已存在的 `BlueprintEventName.JobStage` emit 位置（第 ~7529 / ~7649 / ~7861 / ~7919 / ~8479 / ~8546 / ~9739 行附近），在 emit 之后追加 `ctx.agentCrewStageActivationDriver?.onStageTransition({ jobId: job.id, stageId: <当前 stage>, transition: "stage_started", job })`；所有 hook 均为可选链调用，总插入点 ≤ 10 处（design §10.2 检查清单约束）
  - [x] 14.5 **不删除** `buildAgentCrew()` / `buildRolePresence()` / `createRolePresenceEvents()` 一行既有实现（需求 7.2 + design §1.4）；两者共存：snapshot 作为初始 crew 状态，driver 真实 `role.*` 事件作为阶段推进的增量更新
  - [x] 14.6 **不改** `BlueprintAgentRole` / `BlueprintRolePresence` / `BlueprintStageActivationPolicy` 任一既有类型定义（需求 1.9）；**不新增** `/api/*` 路由（需求 1.9 + design §1.4）
  - [x] 14.7 **所有事件 `type` 仍通过 `BlueprintEventName` 常量构造**（含本 spec 任务 1 新增的 `RoleSleeping`），实现文件内 SHALL NOT 以裸字符串字面量（例如 `"role.sleeping"`）方式构造 `type`（需求 4.2）；grep `server/routes/blueprint.ts` 与 `server/routes/blueprint/agent-crew-stage-activation/**` 确认无此类违禁字面量
  - [x] 14.8 运行 `node --run check` 确认 hook 插入未引入新增 TS 错误
  - _Requirements: 1.6, 1.7, 1.9, 3.5, 4.1, 4.2, 4.4, 6.3, 7.1, 7.2_

- [x] 15. Checkpoint — 跑既有 54 E2E + 48 条子域单测确认未回归
  - 在仓库根运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts` → 确认既有 54 条 E2E（基线 45 + Docker 桥 +2 + MCP 桥 +3 + aigc-node 桥 +2 + role 桥 +2 = 54）继续通过；同时运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint --exclude "server/routes/blueprint/agent-crew-stage-activation/**"` → 确认 48 条既有子域单测（handoff / spec-documents / artifact-memory / agent-crew / role-system-architecture / aigc-spec-node / mcp-github-source / docker-analysis-sandbox 等）继续通过；默认装配下 `BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED` 未设置 → driver 所有 `onStageTransition` 调用走档位 1 fallback no-op，路径零感知（design §D12 + §6.6）；若失败说明外层改造（任务 14）破坏了既有事件 / 字段形态等价性，必须回到任务 14 修复。
  - _Requirements: 5.4, 7.3, 7.4, 7.5, 9.4_

- [x] 16. 在 `server/tests/blueprint-routes.test.ts` 追加 **E2E 用例 1**：Real role evidence + 多 stage 序列（R9.1a，独立编号不合并）
  - [x] 16.1 按 design §6.2.1 装配输入：`process.env.BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED = "true"` + `process.env.BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED = "true"`；使用 `llmMocks.callLLMJson.mockImplementation(...)` 让 role-bridge 返回合法 3 角色 payload（`planner.activationStages = ["input","clarification"]`、`architect.activationStages = ["spec_tree"]`、`reviewer.activationStages = ["engineering_handoff"]`）；`POST /api/blueprint/jobs` 带 `targetText: "Build a release dashboard."` + `githubUrls: ["https://github.com/example/dashboard"]`；模拟 primary route 的 stages 序列为 `["input","clarification","spec_tree","engineering_handoff"]`；依次触发 4 个 stage 的 `stage_started`（通过既有 stage 推进 API 或直接调用 hook 后的路径）
  - [x] 16.2 断言 `job.events` 中 `role.*` 事件按稳定顺序出现（按 role-first 即 payload.roles 原始顺序）：(1) stage=input: `role.activated`(planner) + `role.watching`(architect) + `role.watching`(reviewer)；(2) stage=clarification: `role.activated`(planner) 被抑制（policy.suppressRepeatedStates=true，planner 连续 active）、`role.watching`(architect) 被抑制、`role.watching`(reviewer) 被抑制；(3) stage=spec_tree: `role.review_started`(planner) + `role.activated`(architect) + `role.watching`(reviewer) 被抑制；(4) stage=engineering_handoff: `role.sleeping`(planner) + `role.review_started`(architect) + `role.activated`(reviewer)
  - [x] 16.3 断言每条 driver 发射的事件 payload 含 `activationDriverExecutionMode === "real"` + `stageAttempt === 1` + `triggeredBy === "stage_started"` + `roleLabel`（与 structured payload 一致）+ `sourceEvidenceId`（与 role evidence id 一致）+ `presenceState` 与 `type` 映射表对齐
  - [x] 16.4 断言所有 `role.*` 事件的 `type` 字段严格来自 `BlueprintEventName` 常量命名空间（通过 `expect(Object.values(BlueprintEventName)).toContain(event.type)` 断言）；grep 确认 driver 发射的事件 `type` 中含 `BlueprintEventName.RoleSleeping` 至少一次（对应 planner 在 engineering_handoff 的 sleeping 状态）
  - [x] 16.5 **R8.1 确定性 E2E 级别锁定**：连续运行同一用例 2 次（通过固定 ctx.now / 清理 store 后重跑），捕获两次发射事件序列；断言除 `id` / `occurredAt` 外所有字段字节级相同（可用辅助 `omit(event, ["id", "occurredAt"])` 比较）
  - [x] 16.6 用例 setup / teardown 正确清理 `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED` / `BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED` 环境变量与临时 store 状态，避免污染其它用例
  - _Requirements: 1.1, 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.2, 4.4, 5.3, 8.1, 9.1_

- [x] 17. 在 `server/tests/blueprint-routes.test.ts` 追加 **E2E 用例 2**：Role-bridge fallback → driver 不发 role.* 事件（R9.1b，独立编号不合并到用例 1）
  - [x] 17.1 按 design §6.2.2 装配输入：`process.env.BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED = "true"` + `process.env.BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED = "true"`；但 role-bridge 的 fake `callJson` 对 role 相关 messages 返回 `undefined`（触发 role-bridge 内部 fallback → evidence.executionMode = `"simulated_fallback"`）；其它 capability 正常返回；`POST /api/blueprint/jobs` 带相同输入；依次触发多个 stage 的 `stage_started`
  - [x] 17.2 断言 `job.events` 中**不存在**任何 driver 发射的 `role.*` 事件（与本 spec 相关）：具体通过过滤 `event.payload.activationDriverExecutionMode !== undefined` 来识别 driver 发射的事件；既有 `buildRolePresence` snapshot 产出的 `createRolePresenceEvents` 事件仍可能存在（不是本 spec 产出），只要不含 `activationDriverExecutionMode` 字段即视为合法
  - [x] 17.3 断言 `driver.executionMode === "simulated_fallback"`（可通过 ctx.agentCrewStageActivationDriver 只读属性断言，或通过 driver 发射的 provenance 观测）；`driver.lastFallbackReason === "role bridge fallback"`（或等价字面量）
  - [x] 17.4 断言既有 E2E 期望的 snapshot 级 crew 字段形态保持今天的静态 shape（与 role-bridge E2E fallback 用例的断言一致；需求 5.4 + 7.3）：`job.agentCrew` / `job.rolePresence` 字段存在且字段形态等价（非删除、非重命名）
  - [x] 17.5 用例 2 与用例 1 共用同一个 messages 分发 helper（建议落在测试文件顶部或独立 `test-helpers/fake-role-llm-dispatcher.ts`），覆盖 routeset / role 两类 prompt 的识别关键词；helper 不依赖真实 LLM / 不依赖外网 / 不依赖真实 apiKey
  - [x] 17.6 **不改写** `server/tests/blueprint-routes.test.ts` 中原有 54 条 E2E 用例的任一断言（需求 9.4 + 1.10）；仅以追加方式补 2 条（16 + 17，对应 Docker 桥 +2 + MCP 桥 +3 + aigc-node 桥 +2 + role 桥 +2 之后，累计 54 + 2 = 56 条）
  - _Requirements: 1.10, 2.2, 5.1, 5.2, 5.3, 5.4, 5.5, 7.3, 9.1, 9.4_

- [x] 18. 确认 SDK normalizer 支持新事件名与 payload 字段，完成透传验证
  - [x] 18.1 检查 `client/src/lib/blueprint-api.ts` 与 `client/src/lib/blueprint-api/` 目录下的事件 / payload normalizer，确认 `role.sleeping` 事件名通过既有 `BlueprintEventName` 常量命名空间透传（若使用 union 类型或白名单，应已包含 task 1 新增的常量）
  - [x] 18.2 确认 Driver 新增的 payload 可选字段（`activationDriverExecutionMode` / `stageAttempt` / `triggeredBy` / `roleLabel` / `sourceEvidenceId`）对既有订阅 `role.*` 事件的消费者保持向后兼容：既有 normalizer 使用对象 spread / 透明透传时无需改动；若使用显式字段映射，追加 5 个可选字段透传即可，**不得** 修改任一既有字段映射行为（需求 4.5 + 7.4）
  - [x] 18.3 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts client/src/lib/blueprint-api/` → 9 条 SDK smoke 继续通过（不扩展测试数，仅验证透传）
  - [x] 18.4 运行 `node --run check` 确认 SDK 透传未引入新 TS 错误
  - _Requirements: 4.5, 7.4_

- [x] 19. 全量回归 + 最终验收（含 4 项人工核查对应 design §10.2 检查清单）
  - [x] 19.1 运行 `node --run check` → 不应引入新增 TS 错误（若仓库已有历史类型债，新增改动不应扩大错误面）
  - [x] 19.2 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/tests/blueprint-routes.test.ts` → 54 + 2 = 56 条通过（基线 45 + Docker 桥 +2 + MCP 桥 +3 + aigc-node 桥 +2 + role 桥 +2 + 本 spec +2）
  - [x] 19.3 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint/agent-crew-stage-activation/` → ~32 条新增 co-located 单测通过（5 policy + 8 state-machine + 7 evidence-lookup + 12 driver）
  - [x] 19.4 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts server/routes/blueprint --exclude "server/routes/blueprint/agent-crew-stage-activation/**"` → 48 条既有子域单测继续通过
  - [x] 19.5 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts shared/blueprint/__tests__/events.test.ts` → events 家族映射与常量断言继续通过（含任务 2 新增的 `RoleSleeping` 断言）
  - [x] 19.6 运行 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.server.ts client/src/lib/blueprint-api/` → 9 条 SDK smoke 继续通过
  - [x] 19.7 **人工核查 4 项边界**（对应 design §10.2 最终检查清单）：
    - (a) `shared/blueprint/events.ts` 已追加 `RoleSleeping: "role.sleeping"` 常量与 `"role.sleeping"` union 成员，且 `resolveBlueprintEventFamily("role.sleeping") === "role"`（family 映射函数实现未改动）
    - (b) `BlueprintServiceContext` 追加 2 个可选字段（`agentCrewStageActivationPolicy?` + `agentCrewStageActivationDriver?`）；`buildBlueprintServiceContext` 默认装配 `agentCrewStageActivationPolicy`，**不默认装配** `agentCrewStageActivationDriver`（per-job 生命周期）；外层 hook 点 ≤ 10 处，均为可选链调用，且`buildAgentCrew()` / `buildRolePresence()` / `createRolePresenceEvents()` 一行未删除（需求 7.2 + design §1.4）
    - (c) Fallback 路径下 `ctx.eventBus.emit` 未被调用过（任务 11.4 / 11.7 / 11.8 / 11.9 已覆盖 spy 断言）；Real 路径下 driver 发射事件的 `type` 严格来自 `BlueprintEventName` 常量（含 `RoleSleeping`），payload 含 `activationDriverExecutionMode === "real"`（任务 16.3 / 16.4 已覆盖）
    - (d) grep `server/routes/blueprint/agent-crew-stage-activation/**/*.ts` 确认无 `import { callLLMJson }` / `import { getAIConfig }` / 模块级 `fetch(` / 硬编码 role id 或 stage id 字面量 / 模块级 eventBus / jobStore 单例 / 裸事件字符串（例如 `"role.sleeping"`）等违禁代码（design §2.D1 + §2.D11 + 需求 4.2 硬约束）；grep `server/routes/blueprint.ts` 确认本 spec 任务 14 新增的 hook 调用均使用 `ctx.agentCrewStageActivationDriver?.onStageTransition(...)` 可选链 + `BlueprintEventName` 常量，无裸字符串
  - _Requirements: 1.9, 1.10, 4.2, 4.5, 5.4, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5_

## 说明

- 本任务清单所有任务均为必做项，不含 `*` 可选标记（spec 范围聚焦、体量可控；需求 9.3 + design §6.1 明确锁定本 spec 不引入 PBT）。
- 每个任务都在 footer 中引用至少 1 个 EARS requirement id，便于追溯。
- 任务 4、6、8、11 是 example-based 单测（共 ~32 条），**不**包含 PBT（符合 Requirement 9.3、design §6.1）。design §6 给出的测试策略通过这些 example-based 单测覆盖。
- 任务 11 的 6 条硬需求严格对应 Requirement 9.2（a 初始激活 / b 未来 watching / c 历史 sleeping / d fallback silent）+ Requirement 8.1（determinism）+ Requirement 8.2（triplet idempotence）；~6 条补充（not enabled / v2 mismatch / structured missing / after job completed / before any transition / suppressRepeatedStates）覆盖 design §5 的 5 档错误路径与 D7 幂等规则。
- 任务 16、17 向 `server/tests/blueprint-routes.test.ts` **追加** 2 条新用例（用例 1 real + 多 stage 序列 / 用例 2 fallback），不修改原有 54 条（符合 Requirement 1.10、9.4）；最终 E2E 基线从 54 → 56。
- 任务 9、12、15 是 3 个中间 checkpoint，分别在子域纯函数模块（policy / state-machine / evidence-lookup）、完整子域（加 driver）、外层改造后验证未回归；任务 19 是全量回归 + 最终验收（含 4 项人工核查对应 design §10.2 检查清单）。
- 任务 1、2 是本 spec 相对 4 条 capability 桥 spec 的独有前置步骤（shared events union 扩展 + family 映射测试；见 design §2.D4），是本 spec 唯一的 shared 层改动。
- 任务 14 的外层 hook 点插入是本 spec 相对 4 条桥 spec 的最轻改造（仅在每个已有 `BlueprintEventName.JobStage` / `SandboxJobStarted` emit 点追加一行可选链调用，总插入点 ≤ 10 处），不动 `buildAgentCrew()` / `buildRolePresence()` / `createRolePresenceEvents()` 一行；这是因为本 spec driver 是 per-job 生命周期、纯数据转换 + 事件发射器，不需要改造 invocation 签名或聚合层（相对 role 桥的 `buildCapabilityEvidence` 签名改造 + `Map<invocationId, RoleBridgeOutput>` 聚合层而言，本 spec 外层改造最轻）。
- 任务 13 的 Context 扩展与 4 条桥 spec 有本质差异：桥是无状态纯函数，在 context 上默认装配；本 spec driver 是 stateful（内部有 tracker state），**不默认装配**，由外层在每条 job 起点 lazy 构造并写回 ctx（design §2.D2 + §4.7）。
- 任务 16（用例 1 real + 多 stage）与任务 17（用例 2 fallback）是独立编号的 E2E 子任务，不合并为单一用例；这是为了让 real 与 fallback 两条路径各自有独立的 AAA（Arrange-Act-Assert）结构，符合测试隔离最佳实践与 Requirement 9.1 的明确拆分语义；其中用例 1 含 stage 序列 + stable ordering + R8.1 确定性三层断言锚点（Property 4 / 5 / 6 / 7），用例 2 含 fallback silent + Property 2 锚点。
- 任务 3.4 / 5.4 / 7.4 / 10.7 的"禁止 import"硬约束在 code review 阶段应直接拒绝违反者（与 4 条桥 spec 的 DI 硬约束对齐）。
- 任务 19 是强制的验证门禁，必须在所有实现任务完成后执行；任何一步失败都必须回到对应实现任务修复后再跑整套回归。4 项人工核查（19.7 a/b/c/d）对应 design §10.2 检查清单的关键边界断言，不可省略。
- 本 spec 相对 4 条 capability 桥 spec 的最大差异：(1) shared 侧仅新增 events union 扩展 + family 测试（任务 1 + 2），不新增 shared 纯类型文件；(2) Context 扩展最轻（仅 2 字段），且 driver **不默认装配**（per-job 生命周期）；(3) 无 LLM 调用、无 prompt 构造、无 schema validation——driver 是纯数据转换 + 事件发射器（依赖 role 桥已产出的 `structuredRoles.payload`）；(4) 外层改造最轻——仅 hook 点 + lazy 构造，不动 `buildAgentCrew()` / `buildRolePresence()` 一行，不改 `buildCapabilityEvidence` 签名，不聚合 invocation 级 Map；(5) E2E 2 条但断言深度聚焦事件序列 / 稳定顺序 / payload 字段（而非桥 spec 的 invocation provenance / evidence structuredRoles retrieval）；(6) Driver 单测 6 条硬需求（R9.2 4 条 + R8.1 + R8.2 2 条幂等专测，相对 role 桥的 R9.2 四条 + R9.3 一条 downstream-retrieval 共 5 条硬需求而言，本 spec 多 1 条幂等专测但少 1 条 retrieval 专测，总计均为 6 条左右硬需求并列）；(7) 新增事件名常量 `BlueprintEventName.RoleSleeping`（本 spec 独有，4 条桥 spec 均"只复用不新增"）；(8) 环境变量门禁 `BLUEPRINT_AGENT_CREW_STAGE_ACTIVATION_ENABLED` 独立于 role 桥的 `BLUEPRINT_ROLE_CAPABILITY_BRIDGE_ENABLED`——两者相互独立，role 桥开启但本 driver 不开启是合法配置（evidence 已落地但未驱动 role 事件流）。
- 本 spec 完成后，工作流结束 —— 本 spec 是 Wave 2 的第一条非 capability-bridge spec，也是第一条直接消费 role 桥 `evidence.provenance.structuredRoles.payload` 的下游驱动 spec；后续 Wave 2 的 Agent Crew 前端面板 spec 将基于本 spec 发射的按阶段 `role.*` 事件流实现 UI 订阅，属于独立前端 spec 的范围（需求 1.8）。用户可通过 `tasks.md` 中的 "Start task" 入口逐项执行。
