# Worktree wt1-blueprint-core 任务清单

**分支**：`feat/blueprint-core`
**Wave**：A（串行，阻塞下游）
**前置**：无
**下游**：wt1 合入 `main` 后才可启动 wt2；wt3 / wt4 要等 wt2 合入 `main`

## 目标

契约与子域切分、`BlueprintServiceContext` 与事件总线落地、`reviewing` 交接态显式化、8 个子域迁出与 co-located 单测。

所有任务为强制项。任务 17 是 wt1 合并入 `main` 前的强制校验步骤，未通过禁止推进到 Wave B。

## 任务

- [x] 1. 定义 `BlueprintEventName` 常量与事件家族 union
  - 新建 `shared/blueprint/events.ts`，导出 `BlueprintEventName` 常量对象与 `BlueprintGenerationEventFamily` union（12 个家族：`job` / `clarification` / `route` / `spec` / `preview` / `prompt` / `mission` / `evidence` / `role` / `capability` / `crew` / `sandbox`）。
  - 从 `shared/blueprint/contracts.ts` re-export `BlueprintEventName` 与 `BlueprintGenerationEventFamily`，保持既有导入路径兼容。
  - _Requirements: 5.1, 5.2, 6.3_

- [x] 2. 拆出 `shared/blueprint/` 8 个子域 types 模块
  - 按 design.md 的目录结构，把 `shared/blueprint/contracts.ts` 切成 `shared/blueprint/{intake,clarification,jobs,agent-crew,routeset,spec-documents,downstream,artifact-memory}/types.ts`。
  - 通过 `shared/blueprint/index.ts` re-export 现有所有导出符号；`shared/blueprint/contracts.ts` 降为 re-export barrel。
  - _Requirements: 2.4, 6.3_

- [x] 3. 新增 `BlueprintHandoffState` 与 `BlueprintReviewingHandoff` 可选字段
  - 在 `shared/blueprint/contracts.ts`（或对应子域 types 文件）追加 `BlueprintHandoffState` union 与 `BlueprintReviewingHandoff` 接口。
  - 在 `BlueprintGenerationJob.handoffState?` 与 `BlueprintGenerationStageState.reviewingHandoff?` 挂钩为可选字段。
  - _Requirements: 4.1, 4.3, 6.2_

- [x] 4. 新建 `BlueprintServiceContext` 与工厂
  - 新建 `server/routes/blueprint/context.ts`，定义 `BlueprintServiceContext` 类型与 `buildBlueprintServiceContext(deps)` 工厂。
  - 默认构造 lazy `defaultJobStore`、lazy `createDefaultBlueprintStores`、lazy `createDefaultSandboxDerivationRunner`、lazy `createJobBackedReplayStore`、默认 `eventBus`，允许通过 `deps` 显式覆盖。
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 5. 实现 `createBlueprintEventBus`
  - 新建 `server/routes/blueprint/event-bus.ts`，实现 `createBlueprintEventBus()` 同步 `emit` + `jobStore.save` 顺序写入，事件名只接受 `BlueprintEventName` 常量。
  - 补 co-located 单测验证事件只接受枚举常量（非枚举字面量直接报类型 / 运行时错误）。
  - _Requirements: 3.1, 5.1, 5.2, 5.3_

- [x] 6. 迁出子域 1 Intake & Project Context
  - 新建 `server/routes/blueprint/intake/`，拆出 `router.ts`、`service.ts`、`specs-scanner.ts`、`capabilities.ts`，把 `collectBlueprintSpecs`、`parseIntakeRequest`、`createBlueprintIntake`、`getDefaultRuntimeCapabilities` 等函数迁入并通过 `ctx` 读写依赖。
  - 补 `intake-service.test.ts`、`specs-scanner.test.ts`，覆盖一条成功路径 + 一条失败 / 边界路径。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 7.3_

- [x] 7. 迁出子域 2 Clarification
  - 新建 `server/routes/blueprint/clarification/`，迁入 `createClarificationSession` / `findReusableClarificationSession` / `updateClarificationSession` / `BlueprintClarificationStrategyTemplate` 及策略常量，依赖从 `ctx` 读取。
  - 补 co-located 单测覆盖成功路径与一条失败 / 边界路径（例如 intake 不存在、answers 校验失败）。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 5.1, 7.3_

- [x] 8. 迁出子域 3 Jobs Lifecycle & Events
  - 新建 `server/routes/blueprint/jobs/`，拆出 `router.ts`、`service.ts`、`request-parser.ts`、`event-stream.ts`、`event-filters.ts`、`job-details.ts`；把 `parseGenerationRequest` / `createGenerationJob` / `createGenerationEvent` / `handleJobEventStream` 等迁入。
  - 补 co-located 单测覆盖成功路径与一条 SSE / event filter 边界路径。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 5.1, 7.3_

- [x] 9. 迁出子域 4 Agent Crew & Runtime Capability
  - 新建 `server/routes/blueprint/agent-crew/`，拆出 `crew-service.ts`、`capability-service.ts`、`capability-registry.ts`、`role-presence.ts`、`role-timelines.ts`、`sandbox-derivation.ts`、`default-roles.ts`、`stage-activation.ts`。
  - 把 `buildAgentCrew` / `buildRolePresence` / `buildDefaultCapabilityMatrix` / `createRouteGenerationSandboxDerivation` / `extractRuntimeCapabilities` / `extractCapabilityInvocations` / `extractCapabilityEvidence` 等迁入。
  - 补 co-located 单测覆盖成功路径与一条 capability invoke 失败 / sandbox 作业失败边界。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 5.1, 5.2, 7.3_

- [x] 10. 迁出子域 5 RouteSet & SPEC Tree 并写入 `reviewing` 状态
  - 新建 `server/routes/blueprint/routeset/`，拆出 `route-service.ts`、`spec-tree-service.ts`、`route-builder.ts`、`clarification-context.ts`、`generation-artifacts.ts`、`spec-tree-actions.ts`、`spec-tree-versions.ts`。
  - 在 `selectRoute` / `updateSpecTreeNode` / `saveSpecTreeVersion` 成功路径写入 `handoffState = "reviewing"` + `reviewingHandoff` + `BlueprintReviewHandoffState.provenance`；`resetRoute` 写入 `handoffState = "reset"`。
  - 补 co-located 单测覆盖成功路径 + `reviewing -> reset -> reviewing` 状态流转边界。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 4.1, 4.3, 4.4, 7.3_

- [x] 11. 迁出子域 6 SPEC Documents 并推进 `confirmed`
  - 新建 `server/routes/blueprint/spec-documents/`，拆出 `router.ts`、`service.ts`、`generator.ts`、`review.ts`、`versions.ts`。
  - 在 `review = accepted` 分支把 `handoffState` 推进到 `confirmed`；`review = rejected` 保持 `reviewing`。
  - 补 co-located 单测覆盖 accept / reject 两条路径。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 4.1, 4.4, 7.3_

- [x] 12. 迁出子域 7 Downstream（Effect Preview / Prompt Package / Engineering Handoff）
  - 新建 `server/routes/blueprint/downstream/`，拆出 effect preview / prompt package / engineering landing / engineering runs 各服务与 router。
  - `engineering-landing` 成功路径发 `mission.handoff` 事件，事件名来自 `BlueprintEventName`。
  - 补 co-located 单测覆盖 preview 生成 + prompt 打包 + engineering handoff 三条成功路径。
  - _Requirements: 2.1, 2.2, 3.2, 3.6, 5.1, 7.3_

- [x] 13. 迁出子域 8 Artifact Memory / Replay，强制事件源唯一
  - 新建 `server/routes/blueprint/artifact-memory/`，把 artifact ledger / replay / diff / feedback 路由与服务迁入；Artifact Replay 只通过 `ctx.replayStore` 消费 `ctx.eventBus`，禁止引入旁路事件源。
  - 补 co-located example-based 单测：构造一个包含 evidence / capability / sandbox 事件的 job，断言 replay snapshot 的事件集合与 `jobStore.events + eventBus` 派生结果一致，验证事件源唯一性。本任务不声称 PBT。
  - _Requirements: 3.2, 3.6, 5.3, 7.3_

- [x] 14. 把 `server/routes/blueprint.ts` 降为 barrel 并装配子 Router
  - `server/routes/blueprint.ts` 只 re-export `createBlueprintRouter`、`BlueprintJobStore`、`createMemoryBlueprintJobStore`、`createFileBlueprintJobStore`。
  - `createBlueprintRouter(deps)` 内部调用 `buildBlueprintServiceContext(deps)`，然后依次 `router.use(...)` 8 个子域 Router。
  - _Requirements: 2.2, 3.3, 3.4, 6.1_

- [x] 15. 替换裸字符串事件名为 `BlueprintEventName.*`
  - 替换 `server/routes/blueprint/` 与相关运行时代码中所有事件名字面量为 `BlueprintEventName.*` 常量引用。
  - 全仓执行 `rg '"(clarification|route|spec|preview|prompt|mission|evidence|role|capability|job|sandbox|crew)\.'`（在 `shared/blueprint/events.ts` 与 `shared/blueprint/contracts.ts` 之外）应返回零命中。
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 16. 在 `server/tests/blueprint-routes.test.ts` 追加 `reviewing` 显式化用例
  - 至少追加 2 条用例覆盖 `handoffState = "reviewing"` 出现时机与 `confirmed` / `reset` 推进；不改写既有 51 条用例。
  - 本地运行 `node --run check` 与 `vitest run server/tests/blueprint-routes.test.ts`，确认 51 条 + 新增用例全部通过。
  - _Requirements: 4.1, 4.3, 4.4, 7.1, 7.2, 7.5_

- [x] 17. 验证子域不直接引用模块级单例
  - wt1 合并前运行 `grep -R "defaultJobStore" server/routes/blueprint/`、`grep -R "blueprintStores" server/routes/blueprint/`，所有命中必须位于 `context.ts` 或顶层 barrel，不允许子域文件直接 import。
  - 若发现违反，回到对应子域修正，阻塞 wt1 合并。
  - _Requirements: 3.2, 3.6_
