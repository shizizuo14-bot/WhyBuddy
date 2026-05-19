# 设计文档：Autopilot / Blueprint 模块子域拆分重构

## 简介

本设计严格遵循 `requirements.md` 中的 9 条需求与术语表，将当前蓝图栈按 `/autopilot` 实际 Router 结构拆成 8 个子域模块，统一事件家族命名，显式化 `reviewing` 交接态，并通过 `BlueprintServiceContext` 把运行时依赖完全注入化。本设计只产出 `design.md`，不修改任何代码文件，也不修改 `requirements.md`。

本轮三件实事：

1. 把 `server/routes/blueprint.ts`（13,245 行）、`shared/blueprint/contracts.ts`（1,873 行）、`client/src/lib/blueprint-api.ts`（4,541 行）、`client/src/pages/autopilot/AutopilotRoutePage.tsx`（2,469 行）、`client/src/pages/specs/BlueprintProgressPanel.tsx`（5,691 行）按 Router 资源前缀切成 8 个子域。
2. 将当前散落的事件名字面量（`job.*`、`route.*`、`sandbox.job.*`、`capability.*`、`role.*`、`preview.*`、`prompt.*`、`mission.*` 等）收敛到 `shared/blueprint/events.ts` 的单一来源，其余子域与 Artifact Replay 一律消费该事件流。
3. 为 SPEC Tree / RouteSet draft 的 `reviewing` 交接态选定显式字段（`handoffState` 与 `reviewingHandoff`），并把它作为可选字段追加到现有响应结构中，保持 `server/tests/blueprint-routes.test.ts` 51 个端到端用例向后兼容。

---

# 高层设计（High-Level Design）

## 1. 系统叙事：为什么这么切

蓝图栈当前的问题不是功能缺失，而是同一个 Router 模块承载了 40+ 条 REST 路由、模块级 `blueprintStores`、文件版 `BlueprintJobStore`、RouteSet / Agent Crew / Runtime Capability / SPEC Tree / SPEC Document / Effect Preview / Prompt Package / Engineering Handoff / Artifact Ledger / Replay 共十几种业务能力，外加客户端与共享契约层都按同一个形状"全量复制"了一份。当需求 2.1 列出 8 个 Router 资源前缀时，可以很自然地观察到：每个前缀其实对应一段内聚的业务叙事，而文件级切分只是把这个叙事显式表达出来。

保留的外部契约边界就是需求 6 里列出的：所有 HTTP 方法 / URL / 请求体 / 响应体结构、`@shared/blueprint/contracts` 的类型符号、`@/lib/blueprint-api` 的函数符号、`server/tests/blueprint-routes.test.ts` 的 51 条用例。任何让这些边界发生破坏性变化的拆分方案都在需求 6.5 的定义下视为违规，必须在设计阶段被显式桥接或放弃。

本设计不承诺运行时行为改变，只承诺结构收敛、事件名收敛、`reviewing` 交接态显式化这三件事。

## 2. 8 个子域的边界图

下图展示 8 个子域围绕 `BlueprintServiceContext` 的依赖关系。实线箭头代表"读/写某种上下文状态"；虚线箭头代表"通过事件总线观察另一子域"。

```mermaid
flowchart LR
    subgraph CTX[BlueprintServiceContext]
        direction TB
        stores[blueprintStores<br/>intake/clarification/project]
        jobs[jobStore<br/>BlueprintJobStore]
        llm[llm deps<br/>callLLMJson / chat]
        bus[eventBus<br/>BlueprintEventEmitter]
        clock[now: &#40;&#41; =&gt; Date]
        clar[generateClarificationQuestions]
        sbx[sandboxDerivationRunner]
        rpl[replayStore adapter]
    end

    A[1 Intake &amp; Project Context] --- CTX
    B[2 Clarification] --- CTX
    C[3 Job Lifecycle &amp; Events] --- CTX
    D[4 Agent Crew &amp; Runtime Capability] --- CTX
    E[5 RouteSet &amp; SPEC Tree] --- CTX
    F[6 SPEC Documents] --- CTX
    G[7 Effect Preview / Prompt / Handoff] --- CTX
    H[8 Artifact Memory / Replay] --- CTX

    A -. clarification.ready .-> B
    B -. job.* .-> C
    C -. route.* / role.* / capability.* / sandbox.* .-> D
    C -. spec.* .-> E
    E -. spec.document.* .-> F
    F -. preview.* .-> G
    G -. prompt.* / mission.handoff .-> G
    C -. job.* / role.* / capability.* / preview.* / prompt.* / mission.* / evidence.* / sandbox.* .-> H
```

关键约束：

- 所有子域只通过 `BlueprintServiceContext` 获取依赖，不得 `import` 模块级单例（需求 3.2、3.6）。
- 所有跨子域通信走 `BlueprintEventEmitter`（`ctx.eventBus`）；Artifact Replay 只消费统一事件流，不维护旁路源（需求 5.3）。
- 子域之间不共享内部 `types.ts`，只通过 `shared/blueprint/*` 与 `BlueprintServiceContext` 交互。

## 3. `BlueprintServiceContext` 形状

`BlueprintServiceContext` 是本次重构引入的共享依赖容器。它的字段清单、默认构造来源与注入要求如下。所有字段均支持通过构造参数替换（需求 3.1），没有隐式兜底；默认构造来源也列出，用于 `createBlueprintRouter(deps)` 未显式提供 `BlueprintServiceContext` 时自动组装（需求 3.3）。

| 字段 | 类型 | 注入必需 | 默认构造来源 | 说明 |
| --- | --- | --- | --- | --- |
| `now` | `() => Date` | 是 | `() => new Date()` | 所有生成 `createdAt` / `occurredAt` 的唯一时间源 |
| `blueprintStores` | `BlueprintIntakeStores` | 是 | `createDefaultBlueprintStores()`（内存 `Map` 三件套） | intake / clarificationSessions / projectContexts |
| `jobStore` | `BlueprintJobStore` | 是 | `createFileBlueprintJobStore(deps.jobStoreFile)` | 作业持久化；`deps.jobStore` 优先 |
| `llm.callJson` | `typeof callLLMJson` | 是 | 直接引用 `../core/llm-client.js#callLLMJson` | RouteSet / 策略派生等 JSON 调用入口 |
| `llm.getConfig` | `typeof getAIConfig` | 是 | 直接引用 `../core/ai-config.js#getAIConfig` | 模型配置读取 |
| `generateClarificationQuestions` | `BlueprintClarificationQuestionGenerator` | 是 | 复用 `./nl-command.js#defaultPreviewClarificationQuestions` 组合的 LLM 规划器 | 允许测试注入 mock |
| `sandboxDerivationRunner` | `BlueprintSandboxDerivationRunner` | 是 | `createDefaultSandboxDerivationRunner(ctx)`（纯内存派生，保持当前 `createRouteGenerationSandboxDerivation` 行为） | 沙箱作业派生回调 |
| `replayStore` | `BlueprintReplayStore` | 是 | `createJobBackedReplayStore(ctx.jobStore)`（与现状等价，事件仍写进 `job.events`） | 只消费统一事件流 |
| `eventBus` | `BlueprintEventEmitter` | 是 | `createBlueprintEventBus()`（新建，内部顺序分发 + `job.events` 落盘） | 所有事件名必须来自 `BlueprintEventName` 枚举 |
| `specsRoot` | `string` | 否 | `path.resolve(process.cwd(), ".kiro/specs")` | `GET /specs` 扫描根 |
| `logger` | `BlueprintLogger`（可选） | 否 | 静默 logger | 仅做可观测性，不影响行为 |

计算属性（不是依赖，挂在 context 对象上做便捷读取）：

- `ctx.latestJob()` → `ctx.jobStore.latest()`；
- `ctx.clock()` → `ctx.now()`；
- `ctx.emit(event)` → `ctx.eventBus.emit(event)`，同时写 `ctx.jobStore` 的 `job.events`。

"全部可替换"的具体含义是：`createBlueprintRouter({ context })` 可传入一个完全自定义的 `BlueprintServiceContext`，实现中所有子域服务的构造只读取传入的 context，不能 `import defaultJobStore` 或 `import { blueprintStores }`（需求 3.6）。

## 4. 事件家族架构

统一事件名定义在 `shared/blueprint/events.ts`（需求 5.1）：

```ts
// shared/blueprint/events.ts
export type BlueprintEventName =
  | `job.${"created" | "stage" | "completed" | "failed"}`
  | `clarification.${"ready" | "answered" | "dismissed"}`
  | `route.${"generated" | "selected" | "reset"}`
  | `spec.${"tree.updated" | "tree.versioned" | "document.versioned" | "document.reviewed"}`
  | `preview.${"generated" | "refreshed"}`
  | `prompt.${"packaged"}`
  | `mission.${"handoff"}`
  | `evidence.${"recorded" | "linked"}`
  | `role.${"activated" | "watching" | "capability_invoked" | "review_started" | "review_completed" | "completed"}`
  | `capability.${"invoked" | "completed" | "failed"}`
  | `crew.${"context.updated"}`
  | `sandbox.job.${"started" | "completed" | "failed"}`;

export const BlueprintEventName = {
  JobCreated: "job.created",
  JobStage: "job.stage",
  // ... 全量常量，禁止在其它文件出现裸字符串事件名
} as const satisfies Record<string, BlueprintEventName>;
```

`BlueprintGenerationEventFamily`（需求 5.1 中的 9 个 `.` 分段家族 + `job` / `sandbox`）从同一文件导出：

```ts
export type BlueprintGenerationEventFamily =
  | "job"
  | "clarification"
  | "route"
  | "spec"
  | "preview"
  | "prompt"
  | "mission"
  | "evidence"
  | "role"
  | "capability"
  | "crew"
  | "sandbox";
```

迁移策略：

- 现有 `shared/blueprint/contracts.ts` 中的 `BlueprintGenerationEventType` / `BlueprintGenerationEventFamily` 两个 union 搬到 `shared/blueprint/events.ts`，并从 `contracts.ts` 做 re-export 保持向后兼容（需求 6.3）。
- `server/routes/blueprint.ts` 中所有裸字符串事件名（例如 `type: "job.created"`、`type: "sandbox.job.completed"`）在拆分过程中全部替换为 `BlueprintEventName.*` 常量引用（需求 5.2）。替换工作由各子域在其迁移任务中完成，不单起第十个 PR。
- 当前代码中出现的、本 spec 未列入 9 个家族的事件名（例如如果发现 `blueprint.progress.*` 之类散落命名），在 design 阶段保留为"遗留项"列表，在 tasks 阶段决定归属家族或移除（需求 5.4）。初步扫描结果：现状只观察到 9 个家族 + `job.*` + `sandbox.job.*`，未发现越界命名。

## 5. Artifact Replay 的事件流消费模型

需求 5.3 要求 Artifact Replay 只从统一事件流消费。本设计落到代码上的含义：

- `createJobBackedReplayStore(ctx.jobStore)` 不单独维护事件列表，它的 `listSnapshots(jobId)` / `getSnapshot(jobId, snapshotId)` 返回值由 `jobStore.get(jobId).events` + `jobStore.get(jobId).artifacts` 现场拼装。这与当前 `BlueprintGenerationJob` 已经把事件存在 `job.events` 里一致，只是把入口收敛到 `ReplayStore` 接口，避免 Artifact Replay 子域直接读 `job.events`。
- `ctx.eventBus.emit(event)` 同步调用 `ctx.jobStore.save(updatedJob)`，确保事件落盘即对 Replay 可见。
- Artifact Replay 的 `POST /jobs/:id/artifact-replay`、`POST /jobs/:id/artifact-diff`、`POST /jobs/:id/artifact-feedback` 生成的决策 / 演化快照以 `evidence.recorded` / `evidence.linked` 家族事件回流到同一事件总线，符合需求 5.1 的"evidence.*"定义。

## 6. `reviewing` 交接态字段设计

需求 4 要求把 `reviewing` 定义为显式命名状态，具体字段名由 design 阶段确定；需求 4.3 要求新增字段以可选形式出现，不引起 51 个端到端用例失败。

现状：`BlueprintGenerationStatus` 已经包含字符串值 `"reviewing"`，并用于 `job.stage` / `job.completed` 的 `status` 字段；`BlueprintGenerationNextAction` 已经挂载可选 `handoff?: BlueprintReviewHandoffState`，其中已经含 `selectedPathId` / `routeId` / `selectionId` / `specTreeId` / `provenance.*`。这说明隐式字段已经存在，问题只在于"没有一个显式命名让 UI 与测试一次性锁定"。

本设计新增两个可选字段：

1. `BlueprintGenerationJob.handoffState?: BlueprintHandoffState`
2. `BlueprintGenerationStageState.reviewingHandoff?: BlueprintReviewingHandoff`

类型定义（追加到 `shared/blueprint/contracts.ts`，以 re-export 形式通过 `shared/blueprint/index.ts` 暴露）：

```ts
export type BlueprintHandoffState =
  | "idle"
  | "reviewing"
  | "confirmed"
  | "reset"
  | "failed";

export interface BlueprintReviewingHandoff {
  state: "reviewing";
  stage: BlueprintGenerationStage;         // 通常是 "route_generation" 或 "spec_tree"
  selectedPathId: string;
  routeId: string;
  selectionId?: string;
  specTreeId?: string;
  nodeId?: string;
  enteredAt: string;                        // ISO string from ctx.now()
  confirmable: boolean;                     // mirror of nextAction.handoff.confirmable
}
```

与现有 `BlueprintReviewHandoffState` 的分工：

- `BlueprintReviewHandoffState` 继续描述"下一步可用的处理动作"（保留不变，属于需求 6.1/6.2 保护的响应结构）；
- `BlueprintReviewingHandoff` 是对外"当前处于 reviewing 状态"的显式标识，给前端面板与回归测试读；
- `BlueprintGenerationJob.handoffState` 是作业级粗粒度状态机，帮助 `OfficeTaskCockpit` / `BlueprintProgressPanel` 不用再根据"某时段无下一步事件"去推断。

Provenance 写入：在"用户确认 `reviewing` 并继续推进"的动作（`POST /jobs/:id/route-selection` 成功返回、`PATCH /spec-tree/nodes/:nodeId` 成功返回、`POST /spec-tree/versions` 成功返回等），把 `reviewingHandoff` 结构复制进对应 `BlueprintReviewHandoffState.provenance`（需求 4.4）。

向后兼容策略：两个新字段都是可选的，仅出现在响应体中；现有 51 条断言只匹配既有字段，不会因为多出可选字段而失败（需求 4.3、6.2）。`blueprint-routes.test.ts` 可增量添加 1-2 条"reviewing 显式化"新用例（需求 7.2）。

## 7. 后向兼容策略

### 7.1 `createBlueprintRouter(deps)` 作为唯一装配入口

演进方式：

- 保留 `export function createBlueprintRouter(deps: BlueprintRouterDeps = {}): Router` 签名（需求 2.2）；
- 在其内部：
  1. `const context = buildBlueprintServiceContext(deps)`（需求 3.3）；
  2. `const router = Router()`；
  3. 依次 `router.use(createIntakeRouter(context))`、`router.use(createClarificationRouter(context))` … 8 个子 Router；
  4. 返回 `router`。

不改变现有 `server/index.ts`、`server/tests/blueprint-routes.test.ts`、任何 `import { createBlueprintRouter } from "../routes/blueprint.js"` 的调用方。

### 7.2 barrel 导出

- `server/routes/blueprint.ts` 降为 barrel：只 re-export `createBlueprintRouter`、`BlueprintJobStore`、`createMemoryBlueprintJobStore`、`createFileBlueprintJobStore` 四个既有符号（需求 3.4、6.5）。这样外部 `import { ... } from "../routes/blueprint.js"` 继续生效。
- `shared/blueprint/index.ts` 是新的 barrel 真相源：re-export 所有现有从 `shared/blueprint/contracts.ts` 导出的符号 + 新增 `BlueprintEventName` / `BlueprintHandoffState` / `BlueprintReviewingHandoff`（需求 2.4、6.3）。`shared/blueprint/contracts.ts` 继续保留但收敛到按子域重新切分的 contracts 模块（见子域小节）。
- `client/src/lib/blueprint-api/index.ts` 是新的客户端 SDK barrel：re-export 所有既有从 `client/src/lib/blueprint-api.ts` 导出的符号（8 个 endpoint 常量 + 50+ 个 normalizer + 30+ 个 fetch 函数），现有调用方 `import { ... } from "@/lib/blueprint-api"` 继续生效（需求 2.3、6.4）。`client/src/lib/blueprint-api.ts` 降为 re-export（可在最后一个 PR 整体删除，前端调用方已迁移到 barrel）。

## 8. 验证策略

- `server/tests/blueprint-routes.test.ts` 51/51 保持通过，不改写既有用例，最多以增量方式追加 1-2 条关于 `reviewing` 显式化的新用例（需求 7.1、7.2）。
- 每个子域在其目录下新增 co-located 单测：`server/routes/blueprint/<subdomain>/*.test.ts`，至少覆盖一条成功路径与一条失败 / 边界路径（需求 7.3）。命名约定：`<service-name>.test.ts`（例如 `intake-service.test.ts`、`clarification-session.test.ts`）。
- 客户端 SDK happy-path 最小断言结构：每个 `client/src/lib/blueprint-api/<subdomain>.ts` 新增对应 `*.test.ts`，至少验证 URL / HTTP 方法 / 请求体结构（需求 7.4）。可复用现有 `client/src/lib/blueprint-api.test.ts` 中的测试工具。
- LLM smoke / 公共 smoke 保持通过，受影响时通过适配 `BlueprintServiceContext` 默认构造而不是修改 smoke（需求 7.5）。

---

# 低层设计（Low-Level Design）

## 子域 1：Intake & Project Context

### 1.1 路由列表（来自需求 2.1）

- `GET /specs`
- `GET /capabilities`
- `POST /intake`
- `GET /intake/:id`
- `GET /projects/:projectId/context`

> 注：`GET /intake` （需求 2.1 未列出，但 SDK 里有 `fetchBlueprintIntakes`）当前在 blueprint.ts 里不存在；本 spec 不新增。

### 1.2 服务端目录结构

```
server/routes/blueprint/intake/
  router.ts             // createIntakeRouter(ctx): Router
  service.ts            // createIntakeService(ctx): IntakeService
  specs-scanner.ts      // collectBlueprintSpecs, parseConfigMetadata 等
  capabilities.ts       // getDefaultRuntimeCapabilities (迁移自 blueprint.ts)
  types.ts              // 子域内部类型（不进 shared）
  intake-service.test.ts
  specs-scanner.test.ts
```

### 1.3 关键函数 / 方法签名

```ts
export interface IntakeService {
  listSpecs(): Promise<BlueprintSpecsResponse>;
  listDefaultCapabilities(): BlueprintCapabilityRegistryResponse;
  createIntake(input: BlueprintIntakeRequest): BlueprintCreateIntakeResponse;
  getIntake(intakeId: string): BlueprintIntake | null;
  getProjectContext(projectId: string): BlueprintProjectDomainContext;
}

export function createIntakeService(ctx: BlueprintServiceContext): IntakeService;
export function createIntakeRouter(ctx: BlueprintServiceContext): Router;
```

### 1.4 事件家族子集

- 生产：无直接事件（intake 创建只是落 `ctx.blueprintStores.intakes`）。
- 消费：无。

### 1.5 迁移函数清单（来自 `server/routes/blueprint.ts`）

- `collectBlueprintSpecs` → `intake/specs-scanner.ts`
- `parseIntakeRequest` → `intake/service.ts`
- `createBlueprintIntake` → `intake/service.ts`
- `getDefaultRuntimeCapabilities` → `intake/capabilities.ts`
- `getDefaultAgentRoles`（被 Agent Crew 子域消费，但定义在 intake 子域导出，通过 `BlueprintServiceContext` 注入）→ 迁到 `agent-crew/default-roles.ts`（见子域 4）
- 配置 metadata 解析辅助（`BLUEPRINT_METADATA`、`DOC_NAMES`、`KNOWN_WORD_LABELS`、`CONFIG_FILE`）→ `intake/specs-scanner.ts`

### 1.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/intake.ts` 应暴露：

- `BLUEPRINT_SPECS_ENDPOINT`、`BLUEPRINT_CAPABILITIES_ENDPOINT`、`BLUEPRINT_INTAKE_ENDPOINT`、`BLUEPRINT_PROJECTS_ENDPOINT`
- `normalizeBlueprintSpecsResponse`
- `fetchBlueprintSpecsProgress`
- `createBlueprintIntake`
- `fetchBlueprintIntakes`（当前 SDK 存在的符号，继续保留，后端 404 行为不变）
- `fetchBlueprintIntake`
- `fetchBlueprintProjectContext`

### 1.7 前端消费路径

- `BlueprintProgressPanel` 进度头读 `fetchBlueprintSpecsProgress` → 切到 `@/lib/blueprint-api`（barrel 入口不变）。
- `AutopilotRoutePage` 的 input 阶段面板读 `createBlueprintIntake` / `fetchBlueprintIntake` → 同上。
- 不需要中间适配层；消费方继续用 barrel。

### 1.8 三件事职责

- **reviewing**：本子域无关。
- **事件家族**：本子域无直接生产；间接通过 intake 对象被 clarification 与 job 子域读取。
- **provenance**：本子域无关。

---

## 子域 2：Clarification

### 2.1 路由列表

- `POST /intake/:id/clarifications`
- `GET /clarifications/:sessionId`
- `POST /clarifications/:sessionId/answers`
- `PATCH /clarifications/:sessionId/answers`

### 2.2 服务端目录结构

```
server/routes/blueprint/clarification/
  router.ts
  service.ts               // createClarificationService(ctx)
  strategy.ts              // BlueprintClarificationStrategyTemplate & 内置策略
  question-generator.ts    // 默认 generateClarificationQuestions 组装（若未从 ctx 注入）
  answers-updater.ts       // updateClarificationSession
  types.ts
  clarification-service.test.ts
  strategy.test.ts
```

### 2.3 关键函数 / 方法签名

```ts
export interface ClarificationService {
  createSession(intakeId: string, request: BlueprintCreateClarificationSessionRequest): Promise<BlueprintClarificationSession>;
  getSession(sessionId: string): BlueprintClarificationSession | null;
  saveAnswers(sessionId: string, request: BlueprintClarificationAnswersRequest): BlueprintClarificationSession;
}

export function createClarificationService(ctx: BlueprintServiceContext): ClarificationService;
export function createClarificationRouter(ctx: BlueprintServiceContext): Router;
```

### 2.4 事件家族子集

- 生产：`clarification.ready`（会话创建、问题生成完毕时）、`clarification.answered`（`POST/PATCH /answers` 成功后）、`clarification.dismissed`（`readiness = "skipped"` 分支）。
- 消费：无（intake 通过参数读入）。

### 2.5 迁移函数清单

- `createClarificationSession` → `clarification/service.ts`
- `findReusableClarificationSession` → `clarification/service.ts`
- `parseClarificationSessionRequest` → `clarification/service.ts`
- `parseClarificationAnswersRequest` → `clarification/service.ts`
- `updateClarificationSession` → `clarification/answers-updater.ts`
- `BlueprintClarificationStrategyTemplate` 及所有 `CLARIFICATION_STRATEGY_*` 常量 → `clarification/strategy.ts`
- `buildClarificationRouteContext` 中 clarification 相关部分 → `clarification/strategy.ts`（RouteSet 侧继续在子域 5 用）

### 2.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/clarification.ts`：

- `BLUEPRINT_CLARIFICATIONS_ENDPOINT`
- `createBlueprintClarificationSession`
- `fetchBlueprintClarificationSession`
- `saveBlueprintClarificationAnswers`

### 2.7 前端消费路径

- `AutopilotRoutePage` 的澄清阶段面板 → 迁到 `client/src/pages/autopilot/stages/ClarificationStage.tsx`（见后文 `AutopilotRoutePage.tsx` 拆分）。
- `UnifiedLaunchComposer` 的澄清弹层（`OfficeTaskCockpit` 下）已经独立，不受影响。

### 2.8 三件事职责

- **reviewing**：本子域无关（clarification 自有 `readiness` 状态机）。
- **事件家族**：生产 `clarification.*` 三个事件。
- **provenance**：无。

---

## 子域 3：Job Lifecycle & Events

### 3.1 路由列表

- `POST /jobs`、`POST /generations`
- `GET /jobs`
- `GET /jobs/latest`
- `GET /jobs/:id`、`GET /generations/:id`
- `GET /jobs/:id/events`、`GET /generations/:id/events`
- `GET /jobs/:id/events/stream`、`GET /generations/:id/events/stream`

### 3.2 服务端目录结构

```
server/routes/blueprint/jobs/
  router.ts
  service.ts                // createJobService(ctx)
  request-parser.ts         // parseGenerationRequest / resolveGenerationRequest
  event-stream.ts           // handleJobEventStream (SSE)
  event-filters.ts          // 事件过滤工具 (stage / family / routeId / nodeId)
  job-details.ts            // createJobDetailsPayload, createJobStageState 等
  types.ts
  job-service.test.ts
  event-stream.test.ts
```

### 3.3 关键函数 / 方法签名

```ts
export interface JobService {
  createJob(request: BlueprintGenerationRequest): Promise<BlueprintCreateGenerationJobResponse>;
  listJobs(): BlueprintGenerationJob[];
  getJob(jobId: string): BlueprintGenerationJob | null;
  getLatestJob(): BlueprintLatestGenerationJobResponse;
  getJobEvents(jobId: string, filters: BlueprintGenerationEventFilters): BlueprintGenerationEventsResponse;
  streamJobEvents(jobId: string, res: Response): void;
}

export function createJobService(ctx: BlueprintServiceContext): JobService;
export function createJobsRouter(ctx: BlueprintServiceContext): Router;
```

### 3.4 事件家族子集

- 生产：`job.created`、`job.stage`、`job.completed`、`job.failed`。
- 消费：监听 `route.*` / `spec.*` / `preview.*` / `prompt.*` / `mission.*` / `role.*` / `capability.*` / `sandbox.*` 以便通过 SSE 广播。

### 3.5 迁移函数清单

- `parseGenerationRequest` → `jobs/request-parser.ts`
- `resolveGenerationRequest` → `jobs/request-parser.ts`
- `createGenerationJob` → `jobs/service.ts`
- `createGenerationEvent` → `jobs/event-factory.ts`
- `mapGenerationEventFamily` → `jobs/event-factory.ts`
- `createJobDetailsPayload`、`createJobStageState` → `jobs/job-details.ts`
- `handleJobEvents`、`handleJobEventStream`、`handleJobDetails` → `jobs/router.ts`
- `handleCreateGenerationJob` → `jobs/router.ts`

### 3.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/jobs.ts`：

- `BLUEPRINT_JOBS_ENDPOINT`、`BLUEPRINT_GENERATIONS_ENDPOINT`
- `createBlueprintGenerationJob`、`createBlueprintGenerationCompatJob`
- `fetchBlueprintJobEvents`、`fetchBlueprintJobEventStreamUrl`
- `fetchLatestBlueprintGenerationJob`
- `normalizeBlueprintLatestGenerationJobResponse`

### 3.7 前端消费路径

- `AutopilotRoutePage` 主骨架读 `fetchLatestBlueprintGenerationJob` / `createBlueprintGenerationJob` → 通过 barrel 继续。
- `BlueprintProgressPanel` 的"进度头 / Job Ledger"子面板读 `fetchBlueprintJobEvents` / `fetchBlueprintJobEventStreamUrl`。
- `use-autopilot-route-plan.ts` / `use-autopilot-cockpit-model.ts` 切到 barrel 不改实现。

### 3.8 三件事职责

- **reviewing**：`BlueprintGenerationJob.handoffState` 的写入口归属本子域——RouteSet / SPEC Tree / SPEC Document 子域通过 `ctx.emit(...)` 发出状态转换事件，Job Service 统一更新 `job.handoffState`。
- **事件家族**：`job.*` 家族生产者 + 所有家族的 SSE 广播端。
- **provenance**：`job.handoffState` 与 `BlueprintReviewingHandoff` 的一致性在 Job Service 层校验。

---

## 子域 4：Agent Crew & Runtime Capability

### 4.1 路由列表

- `GET /jobs/:id/agent-crew`
- `GET /jobs/:id/role-timelines`
- `GET /jobs/:id/capabilities`
- `GET /jobs/:id/capability-invocations`
- `POST /jobs/:id/capability-invocations`
- `GET /jobs/:id/capability-evidence`
- `GET /jobs/:id/sandbox-derivation-jobs`
- `POST /jobs/:id/sandbox-derivation-jobs`

### 4.2 服务端目录结构

```
server/routes/blueprint/agent-crew/
  router.ts
  crew-service.ts              // createAgentCrewService(ctx)
  capability-service.ts        // createCapabilityService(ctx)
  capability-registry.ts       // buildDefaultCapabilityMatrix, safety gate
  role-presence.ts             // buildRolePresence, resolveRolePresenceState
  role-timelines.ts            // extract / derive role timeline events
  sandbox-derivation.ts        // createRouteGenerationSandboxDerivation
  default-roles.ts             // getDefaultAgentRoles
  stage-activation.ts          // getDefaultStageActivationPolicies
  types.ts
  *.test.ts
```

### 4.3 关键函数 / 方法签名

```ts
export interface AgentCrewService {
  getCrew(jobId: string): BlueprintAgentCrewResponse;
  getRoleTimelines(jobId: string, filters: BlueprintRoleTimelineFilters): BlueprintRoleTimelinesResponse;
}

export interface CapabilityService {
  getRegistry(jobId: string): BlueprintCapabilityRegistryResponse;
  listInvocations(jobId: string, filters: BlueprintFetchCapabilityInvocationsRequest): BlueprintCapabilityInvocationsResponse;
  invoke(jobId: string, request: BlueprintCapabilityInvocationRequest): Promise<BlueprintInvokeCapabilityResponse>;
  listEvidence(jobId: string, filters: BlueprintFetchCapabilityEvidenceRequest): BlueprintCapabilityEvidenceResponse;
  listSandboxJobs(jobId: string): BlueprintSandboxDerivationJobsResponse;
  createSandboxJob(jobId: string, request: BlueprintSandboxDerivationJobRequest): Promise<BlueprintSandboxDerivationJobResponse>;
}

export function createAgentCrewService(ctx: BlueprintServiceContext): AgentCrewService;
export function createCapabilityService(ctx: BlueprintServiceContext): CapabilityService;
export function createAgentCrewRouter(ctx: BlueprintServiceContext): Router;
```

### 4.4 事件家族子集

- 生产：`role.*` 全家族、`capability.*` 全家族、`sandbox.job.*` 全家族、`crew.context.updated`、`evidence.recorded`、`evidence.linked`。
- 消费：监听 `job.*` / `route.*` / `spec.*` 以刷新 capability matrix。

### 4.5 迁移函数清单

- `buildAgentCrew`、`extractAgentCrew` → `agent-crew/crew-service.ts`
- `buildRolePresence`、`resolveRolePresenceState`、`buildRoleCurrentAction` → `agent-crew/role-presence.ts`
- `mapRolePresenceEventType`、`createRolePresenceEvents`、`createRoleEvent` → `agent-crew/role-timelines.ts`
- `buildDefaultCapabilityMatrix`、`getDefaultAgentRoles`、`getDefaultStageActivationPolicies` → `agent-crew/default-roles.ts` / `agent-crew/capability-registry.ts` / `agent-crew/stage-activation.ts`
- `createRouteGenerationSandboxDerivation`、`buildSandboxRouteOutline`、`buildSandboxRoutePath`、`buildRouteSandboxCapabilityEventPayload`、`resolveRouteSandboxCapabilityRoleId` → `agent-crew/sandbox-derivation.ts`
- `extractRuntimeCapabilities`、`extractCapabilityInvocations`、`extractCapabilityEvidence` → `agent-crew/capability-service.ts`

### 4.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/agent-crew.ts`：

- `normalizeBlueprintAgentCrew`
- `normalizeBlueprintRuntimeCapability`
- `normalizeBlueprintCapabilityRegistryResponse`
- `normalizeBlueprintJobCapabilitiesResponse`
- `normalizeBlueprintCapabilityInvocation`
- `normalizeBlueprintCapabilityInvocationsResponse`
- `normalizeBlueprintCapabilityEvidence`
- `normalizeBlueprintCapabilityEvidenceResponse`
- `normalizeBlueprintInvokeCapabilityResponse`
- 相应 `fetchBlueprintAgentCrew` / `fetchBlueprintRoleTimelines` / `fetchBlueprintJobCapabilities` / `fetchBlueprintCapabilityInvocations` / `invokeBlueprintCapability` / `fetchBlueprintCapabilityEvidence` / `fetchBlueprintSandboxDerivationJobs` / `createBlueprintSandboxDerivationJob`（当前 blueprint-api.ts 已有对应实现，整体挪入子模块）

### 4.7 前端消费路径

- `BlueprintProgressPanel` 中 `RuntimeCapabilityBridgeWorkbenchPanel` 读 capability / invocation / evidence / sandbox 接口 → barrel 不变。
- `AutopilotRoutePage` fabric / execution 阶段读 role-timelines / agent-crew → barrel 不变。

### 4.8 三件事职责

- **reviewing**：本子域不主动进入 reviewing；但当某个 capability `blocked` / `needs_approval` 时，可选在 `job.handoffState` 里反映"阻塞态"（下一轮迭代决定是否需要独立状态值，本 spec 不立即引入）。
- **事件家族**：最大事件生产者；所有事件名必须走 `BlueprintEventName`。
- **provenance**：`capability.invoked` / `capability.completed` / `sandbox.job.*` 事件均带 `jobId` / `projectId` / `crewId` / `capabilityId` / `evidenceId`，支撑 Artifact Replay 反查。

---

## 子域 5：RouteSet & SPEC Tree

### 5.1 路由列表

- `POST /jobs/:id/route-selection`、`DELETE /jobs/:id/route-selection`、`DELETE /generations/:id/route-selection`
- `GET /jobs/:id/spec-tree`
- `PATCH /jobs/:id/spec-tree/nodes/:nodeId`
- `POST /jobs/:id/spec-tree/actions`
- `POST /jobs/:id/spec-tree/versions`

### 5.2 服务端目录结构

```
server/routes/blueprint/routeset/
  router.ts
  route-service.ts              // createRouteService(ctx)
  spec-tree-service.ts          // createSpecTreeService(ctx)
  route-builder.ts              // buildRouteSet / buildRouteCandidate / buildRouteSteps / buildCapabilityUsage
  clarification-context.ts      // buildClarificationRouteContext, appendClarificationRouteSummary
  generation-artifacts.ts       // buildGenerationContextArtifacts
  spec-tree-actions.ts          // describeSpecTreeAction & 各 action 实现
  spec-tree-versions.ts         // 版本保存 / 恢复
  types.ts
  *.test.ts
```

### 5.3 关键函数 / 方法签名

```ts
export interface RouteService {
  selectRoute(jobId: string, request: BlueprintRouteSelectionRequest): BlueprintSelectRouteResponse;
  resetRoute(jobId: string): BlueprintResetRouteSelectionResponse;
}

export interface SpecTreeService {
  getSpecTree(jobId: string): BlueprintSpecTree | null;
  updateNode(jobId: string, nodeId: string, request: BlueprintUpdateSpecTreeNodeRequest): BlueprintUpdateSpecTreeNodeResponse;
  runAction(jobId: string, request: BlueprintSpecTreeActionRequest): BlueprintSpecTreeActionResponse;
  saveVersion(jobId: string, request?: { title?: string; summary?: string }): BlueprintSaveSpecTreeVersionResponse;
}

export function createRouteService(ctx: BlueprintServiceContext): RouteService;
export function createSpecTreeService(ctx: BlueprintServiceContext): SpecTreeService;
export function createRoutesetRouter(ctx: BlueprintServiceContext): Router;
```

### 5.4 事件家族子集

- 生产：`route.generated`（作业创建时）、`route.selected`、`route.reset`、`spec.tree.updated`、`spec.tree.versioned`。
- 消费：监听 `clarification.ready` / `clarification.answered`（用于 buildRouteSet 的 clarification context）。

### 5.5 迁移函数清单

- `buildRouteSet`、`buildRouteCandidate`、`buildRouteSteps`、`buildCapabilityUsage` → `routeset/route-builder.ts`
- `buildClarificationRouteContext`、`appendClarificationRouteSummary` → `routeset/clarification-context.ts`
- `buildGenerationContextArtifacts` → `routeset/generation-artifacts.ts`
- `handleResetRouteSelection` → `routeset/route-service.ts`
- `extractRouteSet`、`extractRouteSelection` → `routeset/route-service.ts`
- `extractSpecTree`、`extractSpecTreeVersions` → `routeset/spec-tree-service.ts`
- 所有 `router.patch("/jobs/:jobId/spec-tree/nodes/:nodeId", ...)`、`router.post("/jobs/:jobId/spec-tree/actions", ...)`、`router.post("/jobs/:jobId/spec-tree/versions", ...)` 的 handler body → `routeset/spec-tree-service.ts`

### 5.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/routeset.ts`：

- `selectBlueprintRoute`、`resetBlueprintRouteSelection`
- `updateBlueprintSpecTreeNode`、`runBlueprintSpecTreeAction`、`saveBlueprintSpecTreeVersion`

### 5.7 前端消费路径

- `AutopilotRoutePage` 的 routeset / selection 阶段面板 → 拆分为 `stages/RouteSetStage.tsx` + `stages/SelectionStage.tsx`。
- `BlueprintProgressPanel` 的 "SPEC Tree" 子面板读 `fetchLatestBlueprintGenerationJob` 并调用 `updateBlueprintSpecTreeNode` / `runBlueprintSpecTreeAction` / `saveBlueprintSpecTreeVersion`。

### 5.8 三件事职责

- **reviewing**：**本子域是 `reviewing` 交接态的主要生产者**。当 `POST /route-selection` 成功返回后把 `job.handoffState = "reviewing"`；`stageState["spec_tree"].reviewingHandoff = { state: "reviewing", stage: "spec_tree", selectedPathId, routeId, selectionId, specTreeId, enteredAt: ctx.now().toISOString(), confirmable: true }`；`PATCH /spec-tree/nodes/:nodeId` / `POST /spec-tree/versions` 保持 `reviewing` 状态直到 SPEC Document 生成进入 `confirmed`。`DELETE /route-selection` 把 `handoffState = "reset"`。
- **事件家族**：`route.*`、`spec.tree.*`。
- **provenance**：成功写入后把 `reviewingHandoff` 字段映射进 `BlueprintReviewHandoffState.provenance`（需求 4.4）。

---

## 子域 6：SPEC Documents

### 6.1 路由列表

- `GET /jobs/:id/spec-documents`
- `POST /jobs/:id/spec-documents`
- `POST /jobs/:id/spec-documents/:documentId/versions`
- `PATCH /jobs/:id/spec-documents/:documentId/review`

### 6.2 服务端目录结构

```
server/routes/blueprint/spec-documents/
  router.ts
  service.ts                   // createSpecDocumentService(ctx)
  generator.ts                 // generateBlueprintSpecDocuments 的服务端实现
  review.ts                    // 评审状态机 (accepted / rejected / pending)
  versions.ts                  // saveSpecDocumentVersion 实现
  types.ts
  *.test.ts
```

### 6.3 关键函数 / 方法签名

```ts
export interface SpecDocumentService {
  listDocuments(jobId: string, filters: { nodeId?: string; type?: BlueprintSpecDocumentType }): BlueprintSpecDocumentsResponse;
  generateDocuments(jobId: string, request: BlueprintGenerateSpecDocumentsRequest): BlueprintSpecDocumentsResponse;
  saveVersion(jobId: string, documentId: string, request: BlueprintSaveSpecDocumentVersionRequest): BlueprintSaveSpecDocumentVersionResponse;
  review(jobId: string, documentId: string, request: BlueprintReviewSpecDocumentRequest): BlueprintReviewSpecDocumentResponse;
}

export function createSpecDocumentService(ctx: BlueprintServiceContext): SpecDocumentService;
export function createSpecDocumentsRouter(ctx: BlueprintServiceContext): Router;
```

### 6.4 事件家族子集

- 生产：`spec.document.versioned`、`spec.document.reviewed`。
- 消费：`spec.tree.updated` / `spec.tree.versioned`（决定文档能否生成）。

### 6.5 迁移函数清单

- `extractSpecDocuments`、`extractSpecDocumentVersions` → `spec-documents/service.ts`
- 所有 `router.post("/jobs/:jobId/spec-documents", ...)` / `router.get(...)` / `router.post(".../versions", ...)` / `router.patch(".../review", ...)` handler body → `spec-documents/service.ts`

### 6.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/spec-documents.ts`：

- `fetchBlueprintSpecDocuments`
- `generateBlueprintSpecDocuments`
- `reviewBlueprintSpecDocument`
- `saveBlueprintSpecDocumentVersion`

### 6.7 前端消费路径

- `BlueprintProgressPanel` 的 "SPEC Documents" 子面板；
- `SpecDocumentWorkbenchPanel.tsx` 直接消费该子模块。

### 6.8 三件事职责

- **reviewing**：当 SPEC document `status = "reviewing"` 时，响应体继续带 `nextAction.handoff`，不再新增字段。`handoffState` 若仍在 `reviewing`，在本子域 `review = accepted` 动作后可能推进到 `confirmed`（全部 document accepted 时）。
- **事件家族**：`spec.document.*`。
- **provenance**：`review` 动作需要把当前 `reviewingHandoff` 复制到 `BlueprintReviewHandoffState.provenance`。

---

## 子域 7：Effect Preview / Prompt Package / Engineering Handoff

### 7.1 路由列表

- `GET /jobs/:id/effect-previews`、`POST /jobs/:id/effect-previews`
- `GET /jobs/:id/prompt-packages`、`POST /jobs/:id/prompt-packages`
- `GET /jobs/:id/engineering-landing`、`POST /jobs/:id/engineering-landing`
- `GET /jobs/:id/engineering-runs`、`POST /jobs/:id/engineering-runs`

### 7.2 服务端目录结构

```
server/routes/blueprint/downstream/
  router.ts
  effect-preview-service.ts
  prompt-package-service.ts
  engineering-landing-service.ts
  engineering-runs-service.ts
  handoff-builder.ts           // buildPlatformHandoff / runtime projection 组装
  types.ts
  *.test.ts
```

> 子域名采用 `downstream/`，因为三者在路由层紧挨且共享大量 `promptPackage -> effectPreview -> engineeringLanding -> engineeringRuns` 的串联逻辑，物理上在同一个子目录内聚。

### 7.3 关键函数 / 方法签名

```ts
export interface EffectPreviewService {
  listPreviews(jobId: string, filters: { nodeId?: string }): BlueprintEffectPreviewsResponse;
  generatePreviews(jobId: string, request: BlueprintGenerateEffectPreviewsRequest): BlueprintEffectPreviewsResponse;
}

export interface PromptPackageService {
  listPackages(jobId: string, filters: { platform?: BlueprintImplementationPromptTargetPlatform }): BlueprintImplementationPromptPackagesResponse;
  generatePackages(jobId: string, request: BlueprintGenerateImplementationPromptPackagesRequest): BlueprintImplementationPromptPackagesResponse;
}

export interface EngineeringLandingService {
  listPlans(jobId: string): BlueprintEngineeringLandingPlansResponse;
  generatePlans(jobId: string, request: BlueprintGenerateEngineeringLandingPlansRequest): BlueprintEngineeringLandingPlansResponse;
}

export interface EngineeringRunsService {
  listRuns(jobId: string): BlueprintEngineeringRunsResponse;
  recordRun(jobId: string, request: BlueprintRecordEngineeringRunRequest): BlueprintRecordEngineeringRunResponse;
}

export function createDownstreamRouter(ctx: BlueprintServiceContext): Router;
```

### 7.4 事件家族子集

- 生产：`preview.generated` / `preview.refreshed`、`prompt.packaged`、`mission.handoff`。
- 消费：`spec.document.reviewed`（以判定 `includeDrafts` / `accepted` 来源）。

### 7.5 迁移函数清单

- `extractEffectPreviews`、`extractImplementationPromptPackages`、`extractEngineeringLandingPlans`、`extractEngineeringRuns` → 对应 `*-service.ts`
- `router.post("/jobs/:jobId/effect-previews", ...)` handler body → `effect-preview-service.ts`
- `router.post("/jobs/:jobId/prompt-packages", ...)` handler body → `prompt-package-service.ts`
- `router.post("/jobs/:jobId/engineering-landing", ...)` handler body → `engineering-landing-service.ts`
- `router.post("/jobs/:jobId/engineering-runs", ...)` handler body → `engineering-runs-service.ts`

### 7.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/downstream.ts`（或拆成 `preview-prompt-handoff.ts` 与 `engineering-runs.ts`，二选一）：

- `normalizeBlueprintEffectPreviewRuntimeProjection`、`normalizeBlueprintEffectPreview`、`normalizeBlueprintEffectPreviewsResponse`
- `normalizeBlueprintPromptPackage`、`normalizeBlueprintPromptPackagesResponse`
- `normalizeBlueprintEngineeringLandingPlan`、`normalizeBlueprintEngineeringLandingResponse`
- `normalizeBlueprintEngineeringRun`、`normalizeBlueprintEngineeringRunsResponse`、`normalizeBlueprintCreateEngineeringRunResponse`
- 相应 `fetch*` / `generate*` / `recordBlueprintEngineeringRun` 函数

### 7.7 前端消费路径

- `BlueprintProgressPanel` 的 `EffectPreviewWorkbenchPanel` / `PromptPackageWorkbenchPanel` / `EngineeringLandingWorkbenchPanel` → barrel 不变。
- `AutopilotRoutePage` 的 fabric 阶段面板 → `stages/FabricStage.tsx` 内部读这批 API。

### 7.8 三件事职责

- **reviewing**：engineering-landing 成功后事件 `mission.handoff` 写入，Job Service 把 `handoffState` 推进到 `confirmed`。
- **事件家族**：`preview.*` / `prompt.*` / `mission.handoff`。
- **provenance**：Handoff 对象内部已含 `platformHandoff`，保留现状。

---

## 子域 8：Artifact Memory / Replay

### 8.1 路由列表

- `GET /jobs/:id/artifact-ledger`
- `POST /jobs/:id/artifact-replay`
- `GET /jobs/:id/artifact-replays`
- `POST /jobs/:id/artifact-diff`
- `POST /jobs/:id/artifact-feedback`

### 8.2 服务端目录结构

```
server/routes/blueprint/artifact-memory/
  router.ts
  service.ts                    // createArtifactMemoryService(ctx)
  ledger.ts                     // buildArtifactLedger (纯投影)
  replay.ts                     // createReplaySnapshot 组合器
  diff.ts                       // buildArtifactDiff
  feedback.ts                   // buildArtifactFeedback
  types.ts
  *.test.ts
```

### 8.3 关键函数 / 方法签名

```ts
export interface ArtifactMemoryService {
  getLedger(jobId: string): BlueprintArtifactLedgerResponse;
  createReplay(jobId: string, request: BlueprintCreateArtifactReplayRequest): BlueprintArtifactReplayResponse;
  listReplays(jobId: string): BlueprintArtifactReplaysResponse;
  buildDiff(jobId: string, request: BlueprintArtifactDiffRequest): BlueprintArtifactDiffResponse;
  submitFeedback(jobId: string, request: BlueprintArtifactFeedbackRequest): BlueprintArtifactFeedbackResponse;
}

export function createArtifactMemoryService(ctx: BlueprintServiceContext): ArtifactMemoryService;
export function createArtifactMemoryRouter(ctx: BlueprintServiceContext): Router;
```

### 8.4 事件家族子集

- 生产：`evidence.recorded`（replay 快照生成时）、`evidence.linked`（feedback 写入时）。
- 消费：统一事件流的**全部**家族（需求 5.3）。

### 8.5 迁移函数清单

- `router.get("/jobs/:jobId/artifact-ledger", ...)` handler → `service.ts`
- `router.post("/jobs/:jobId/artifact-replay", ...)` handler → `service.ts`
- `router.get("/jobs/:jobId/artifact-replays", ...)` handler → `service.ts`
- `router.post("/jobs/:jobId/artifact-diff", ...)` handler → `service.ts`
- `router.post("/jobs/:jobId/artifact-feedback", ...)` handler → `service.ts`

### 8.6 客户端 SDK 对应文件

`client/src/lib/blueprint-api/artifact-replay.ts`：

- `normalizeBlueprintArtifactLedgerEntry`、`normalizeBlueprintArtifactLedgerResponse`
- `normalizeBlueprintArtifactReplay`、`normalizeBlueprintArtifactReplayResponse`、`normalizeBlueprintArtifactReplaysResponse`
- `normalizeBlueprintArtifactDiff`、`normalizeBlueprintArtifactDiffResponse`
- `normalizeBlueprintArtifactFeedback`、`normalizeBlueprintArtifactFeedbackResponse`

### 8.7 前端消费路径

- `BlueprintProgressPanel` 的 `ArtifactMemoryWorkbenchPanel` → barrel 不变。

### 8.8 三件事职责

- **reviewing**：本子域只读消费 `handoffState`；在 replay snapshot 元数据中透出 `handoffState` 字段以便前端复盘。
- **事件家族**：Artifact Replay 是**统一事件流的唯一消费示范**，不允许新增私有事件源。
- **provenance**：replay snapshot / diff / feedback 的输出均带 `jobId` / `routeId` / `selectedPathId` / `specTreeId` / `handoffState`，满足跨子域反查。

---

## `AutopilotRoutePage.tsx` 的拆分规划

### 目录结构

```
client/src/pages/autopilot/
  AutopilotRoutePage.tsx        // 只保留：阶段编排 + 数据接线
  AutopilotRoutePage.test.tsx   // 保留现有主用例
  stages/
    InputStage.tsx              // 现 readAutopilotWorkflowStage + input 面板
    ClarificationStage.tsx      // 现 ClarificationPanel
    RouteSetStage.tsx           // routeset 阶段面板
    SelectionStage.tsx          // selection 阶段面板
    FabricStage.tsx             // fabric/execution 阶段面板（预览/提示词/交接）
    ConsolePanel.tsx            // 现 AutopilotConsolePanel + buildConsoleLines
    AutopilotVisualStage.tsx    // 现 AutopilotVisualStage
    AutopilotWorkflowRail.tsx   // 现 AutopilotWorkflowRail
```

page 自身保留职责：

- 读 `useAutopilotRoutePlan()`、`useAutopilotCockpitModel()`；
- 解析 route 参数（currentProjectId、locale）；
- 把数据分发到 5 个 stage 组件 + console；
- 不再拥有面板内的文案、布局、正则。

### 组件清单（建议命名）

- `InputStage`、`ClarificationStage`、`RouteSetStage`、`SelectionStage`、`FabricStage` 共 5 个阶段面板；
- `ConsolePanel`、`AutopilotVisualStage`、`AutopilotWorkflowRail` 共 3 个辅助组件。

---

## `BlueprintProgressPanel.tsx` 的拆分规划

### 目录结构

```
client/src/pages/specs/
  BlueprintProgressPanel.tsx          // 只保留：区块装配 + 数据获取
  panels/
    ProgressHeaderPanel.tsx           // 现 "specs 进度头" 区（第 5700 行附近）
    JobLedgerPanel.tsx                // Job 事件 / 作业元信息
    SpecTreePanel.tsx                 // SPEC Tree 交互区（复用 SpecTreeWorkbenchPanel）
    SpecDocumentsPanel.tsx            // SPEC Documents 区（复用 SpecDocumentWorkbenchPanel）
    EffectPreviewPanel.tsx            // 现 EffectPreviewWorkbenchPanel
    PromptPackagePanel.tsx            // 现 PromptPackageWorkbenchPanel
    RuntimeCapabilityPanel.tsx        // 现 RuntimeCapabilityBridgeWorkbenchPanel
    EngineeringLandingPanel.tsx       // 现 EngineeringLandingWorkbenchPanel
    ArtifactMemoryPanel.tsx           // 现 ArtifactMemoryWorkbenchPanel
    RouteCandidateCard.tsx            // 现 RouteCandidateCard
    RuntimeProjectionCard.tsx         // 现 RuntimeProjectionCard
  hooks/
    use-blueprint-progress-data.ts    // 统一封装 fetchBlueprintSpecsProgress / fetchLatestBlueprintGenerationJob / fetchBlueprintJobEvents 等
```

BlueprintProgressPanel 自身保留：

- 受 props 驱动的 `jobId` / `currentProjectId` 解析；
- 统一调用 `use-blueprint-progress-data` 拿到数据，再分发到子面板；
- 不再内联 5691 行的子组件定义。

---

## `Home.tsx` 的 Autopilot 入口调整

本 spec 只允许调整 `Home.tsx` 中 autopilot 入口与 hand-off 相关的代码（需求 9.1、1.2），不改 project-space 分支。

### 具体调整点

- `handleOpenAutopilotProject`（第 1064 行附近）：继续调用 `selectProject(project.id)` + `setLocation(AUTOPILOT_PATH)`；不改行为。
- `projectAutopilotMissions` / `currentAutopilotTask` / `currentAutopilotSummary`（第 778-843 行附近）：继续读 `missionTasks` / `autopilotSummary`；本 spec 只把这些 helper 的导入路径从 `@/lib/blueprint-api` 切到 `@/lib/blueprint-api/index` barrel（实际 path 不变）。
- `OfficeTaskCockpit` 入口（第 2781 行附近）：不动，继续是 autopilot 模式 + 非项目 hub 时的主壳。
- 第 1177-1230 行、第 1847-1850 行、第 2450-2452 行、第 3092-3094 行等 `handleOpenAutopilotProject` 的调用方只保留现有业务，不扩展。

### 明确不改

- `projectId` 路由参数逻辑、`routeProject` / `storedProject` 的合并、`selectProject` 行为、`/projects` 返回按钮、`home-desktop-sidebar-shell` CSS 等 project-space 分支代码（需求 9.1）。

---

## 支持 lib 的归类建议

这些文件目前平铺在 `client/src/lib/` 下，在本次拆分里建议按"是否与 autopilot UI 耦合"与"是否属于 blueprint SDK"归类：

| 文件 | 建议目标目录 | 理由 |
| --- | --- | --- |
| `autopilot-launch-examples.ts` | `client/src/lib/autopilot/launch-examples.ts` | 仅被 autopilot 入口/AutopilotRoutePage 消费 |
| `autopilot-prompt-optimizer.ts` | `client/src/lib/autopilot/prompt-optimizer.ts` | 纯 prompt 优化，不涉及 blueprint API |
| `autopilot-frontend-model.ts` | `client/src/lib/autopilot/frontend-model.ts` | autopilot UI 的 view-model 映射 |
| `use-autopilot-cockpit-model.ts` | `client/src/lib/autopilot/use-cockpit-model.ts` | autopilot-specific hook |
| `use-autopilot-route-plan.ts` | `client/src/lib/autopilot/use-route-plan.ts` | autopilot-specific hook |
| `launch-router.ts` | `client/src/lib/autopilot/launch-router.ts` | 仅被 autopilot 发起链消费 |
| `blueprint-copy.ts` | `client/src/lib/blueprint/copy.ts` | blueprint UI 文案，跨 autopilot / specs 页面 |

归类只涉及 `import` 路径变化；为了满足需求 6.5，建议对每个文件在原位置保留 re-export 兜底一个版本周期，然后统一清理。

---

## 失败与风险

| 风险 | 可能触发点 | 缓解策略 |
| --- | --- | --- |
| Barrel 迁移引入循环依赖 | `shared/blueprint/index.ts` 与子模块互相 re-export；`client/src/lib/blueprint-api/index.ts` 与子模块互相 re-export | 规定子模块只从 `shared/blueprint/types/...`（纯类型）/ `shared/blueprint/events.ts` 引入，barrel 仅做 re-export；客户端子模块只从 `shared/blueprint/index.ts` 拉类型，不反向依赖 SDK barrel |
| `BlueprintProgressPanel` 测试快照漂移 | 子面板抽出后 DOM 结构变化 | 拆分时保持顶层 DOM 顺序与 `data-testid` 不变（现有 `data-testid="runtime-projection-card"`、`"blueprint-spec-progress-card"`、`"prompt-package-sections-preview"` 全部保留） |
| 51 个 E2E 用例断言到具体 `handoff` 字段 | 新增 `handoffState` / `reviewingHandoff` 改动响应 shape | 新字段全部可选，测试直接跳过；若某条测试基于 `toEqual` 深比较整对象，允许该测试使用 `toMatchObject` 或 `expect.objectContaining` 重写（但不删改断言意图） |
| `ctx.eventBus` 与 `ctx.jobStore.save` 顺序导致事件丢失 | 多子域并发写 | `ctx.emit(event)` 内部以单例 Promise chain 串行化；或用同步 `eventBus.emit + jobStore.save` 一体化 |
| 事件名字面量残留 | grep 漏掉 `server/core/*` 中的引用 | 在 tasks 阶段要求 `rg 'type:\s*"(clarification|route|spec|preview|prompt|mission|evidence|role|capability|job|sandbox|crew)\.'` 全仓扫描，验证零命中（除 `BlueprintEventName` 定义文件） |
| TypeScript 基线恶化 | 大规模跨文件移动 | 每个 PR 都跑 `npm run check`，不引入新错误；允许现状，但不放大 |
| 现有 `createFileBlueprintJobStore()` 被顶层立即构造 | `const defaultJobStore = createFileBlueprintJobStore()` 在模块加载时构造 | 把 `defaultJobStore` 改为 lazy: `let _defaultJobStore: BlueprintJobStore | null = null; function getDefaultJobStore() { return _defaultJobStore ??= createFileBlueprintJobStore(); }`；`buildBlueprintServiceContext(deps)` 里调用 `deps.jobStore ?? getDefaultJobStore()` |
| smoke 测试被依赖方式变化打破 | LLM smoke 依赖 `callLLMJson` | `ctx.llm.callJson` 默认就是 `callLLMJson`，smoke 不需改 |

---

## 迁移推进策略

建议按 4 个 worktree 并行切法，ownership 边界与合并顺序如下：

### `wt1-blueprint-core`（串行，最先合并）

- 分支名：`feat/blueprint-core`
- ownership：
  - `shared/blueprint/events.ts`（新建）
  - `shared/blueprint/index.ts`（新建 barrel）
  - `shared/blueprint/contracts.ts`（按子域切分 + re-export）
  - `shared/blueprint/intake/`、`shared/blueprint/clarification/`、`shared/blueprint/jobs/`、`shared/blueprint/agent-crew/`、`shared/blueprint/routeset/`、`shared/blueprint/spec-documents/`、`shared/blueprint/downstream/`、`shared/blueprint/artifact-memory/`（新建，按子域切分类型）
  - `server/routes/blueprint.ts`（降为 barrel，4 个 re-export）
  - `server/routes/blueprint/`（新目录，8 个子域目录 + `context.ts` + `router.ts`）
  - `server/tests/blueprint-routes.test.ts`（仅增量 `reviewing` 用例）
- 合并顺序：**先合这个**，其它 worktree 在其 rebase 之上推进。
- 必须完成：`BlueprintServiceContext` + 8 个子域 service + router + co-located 单测 + `BlueprintEventName` 收敛。

### `wt2-blueprint-sdk`

- 分支名：`feat/blueprint-sdk`
- ownership：
  - `client/src/lib/blueprint-api/`（新目录，8 个子模块 + `index.ts`）
  - `client/src/lib/blueprint-api.ts`（降为 re-export，后续删）
  - `client/src/lib/blueprint-api.test.ts`（拆分到各 `blueprint-api/<subdomain>.test.ts`）
  - `client/src/lib/blueprint/`（新目录，`copy.ts`）
  - `client/src/lib/autopilot/`（新目录，7 个 autopilot helper）
  - `client/src/lib/autopilot-*.ts` / `use-autopilot-*.ts` / `launch-router.ts` / `blueprint-copy.ts`（保留 re-export 兜底一轮，然后删）
- 依赖：`wt1-blueprint-core` 合入后可以基于新的 `shared/blueprint/index.ts` 做类型引入。
- 必须完成：SDK happy-path 测试 + barrel 导出完整。

### `wt3-autopilot-page`

- 分支名：`feat/autopilot-page-split`
- ownership：
  - `client/src/pages/autopilot/AutopilotRoutePage.tsx`（瘦身）
  - `client/src/pages/autopilot/stages/`（新目录，5 个 stage + 3 个辅助组件）
  - `client/src/pages/autopilot/AutopilotRoutePage.test.tsx`（保留并补最小 smoke）
  - `client/src/pages/Home.tsx`（只改 autopilot 入口 import 路径）
- 依赖：`wt2-blueprint-sdk` 合入后可以直接引 barrel。
- 必须完成：`AutopilotRoutePage.tsx` 行数显著下降；现有用例 + 最小 smoke 通过。

### `wt4-blueprint-panels`

- 分支名：`feat/blueprint-panels-split`
- ownership：
  - `client/src/pages/specs/BlueprintProgressPanel.tsx`（瘦身）
  - `client/src/pages/specs/panels/`（新目录，10 个子面板）
  - `client/src/pages/specs/hooks/use-blueprint-progress-data.ts`（新建）
  - `client/src/pages/specs/BlueprintProgressPanel.test.tsx`（保留）
- 依赖：`wt2-blueprint-sdk` 合入后可以引 barrel；可与 `wt3` 并行。
- 必须完成：`BlueprintProgressPanel.tsx` 只剩装配 + 数据；各子面板 `data-testid` 不变。

### 合并顺序建议

1. `wt1-blueprint-core` —— 建立新契约与服务端结构，51/51 通过 + 新增 1-2 条 `reviewing` 用例通过。
2. `wt2-blueprint-sdk` —— 基于新契约切 SDK；Home / AutopilotRoutePage / BlueprintProgressPanel 继续通过老 barrel（re-export）不受影响。
3. `wt3-autopilot-page` 与 `wt4-blueprint-panels` —— 二者不共享高冲突文件，可并行；按 PR 就绪顺序合入。
4. 一轮稳定观察后，删除 `client/src/lib/blueprint-api.ts` / `client/src/lib/autopilot-*.ts` 等兜底 re-export。

以 `main` 为唯一集成主线，不长期维护 worktree；每个 worktree 合并前必须本地跑 `npm run check` + `server/tests/blueprint-routes.test.ts` 51 条 + 各自新增单测。
