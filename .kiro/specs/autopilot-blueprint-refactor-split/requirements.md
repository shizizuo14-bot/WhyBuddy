# 需求文档：Autopilot / Blueprint 模块子域拆分重构

## 简介

`/autopilot` 当前已经按 `docs/autopilot-target-experience-architecture-2026-05-07.svg` 跑通 11 个节点并勾选完 249/249 spec 任务，但实际实现仍然高度单体：

- `server/routes/blueprint.ts` 约 13,245 行，在同一个 Router 模块里注册了 40+ 条 REST 路由，同时持有模块级的 `blueprintStores`（intake / clarification session / project context）与文件版 `BlueprintJobStore`，以及 RouteSet 生成、Agent Crew 与 Runtime Capability 逻辑、SPEC Tree 与 SPEC Document 逻辑、Effect Preview、Prompt Package、Engineering Handoff、Artifact Ledger / Replay 等几乎所有业务能力。
- `client/src/lib/blueprint-api.ts` 约 4,541 行，把上述每条路由都对应复制了一份 DTO 与 normalizer。
- `shared/blueprint/contracts.ts` 约 1,873 行，堆叠了 intake、clarification、route、spec、preview、prompt、handoff、artifact 等全部 blueprint 契约。
- `client/src/pages/autopilot/AutopilotRoutePage.tsx` 约 2,469 行，把输入、澄清、RouteSet、选择、fabric/execution 五个阶段面板与控制台都内联在同一个文件里。
- `client/src/pages/specs/BlueprintProgressPanel.tsx` 约 5,691 行，承载了从进度总览到明细面板的全部 UI。
- `client/src/pages/Home.tsx` 约 3,238 行，同时承载 project-space 与 autopilot 两种模式；本 spec 只涉及它的 autopilot 入口交接面。

这种单体形态带来的主要问题不是“功能不对”，而是“边界不清”：新加一个阶段、改一个事件命名、接一个新的澄清策略，都需要在上述超大文件里反复滑动，测试、类型、团队协作成本都在快速抬升。本 spec 面向 `autopilot-blueprint-refactor-split`，其目标是在**完全保留外部可观察 HTTP 路由、响应结构、公共类型和 249/249 spec 任务基线**的前提下，把 blueprint 栈按照 `/autopilot` 实际 Router 结构切成 8 个子域模块，并顺带硬化一小批长期被“先接上再说”的业务逻辑。

本 spec 属于 Feature 类型，采用 requirements-first 工作流，本轮只产出 `requirements.md`，不产出 `design.md` 与 `tasks.md`。

## 术语表

- **Blueprint Stack / 蓝图栈**：`server/routes/blueprint.ts` + `shared/blueprint/contracts.ts` + `client/src/lib/blueprint-api.ts` + `client/src/pages/autopilot/AutopilotRoutePage.tsx` + `client/src/pages/specs/BlueprintProgressPanel.tsx` 组成的 `/autopilot` + Blueprint 模块集合。
- **Subdomain / 子域**：按照当前 Router 的资源前缀切出的 8 个业务切片，见需求 2。
- **BlueprintServiceContext**：本 spec 引入的共享依赖容器，用于显式注入 intake / clarification / job store、LLM 依赖、event emitter 与 `now()` 等基础设施，替代直接引用模块级单例。
- **BlueprintJobStore**：当前的作业存储抽象，本 spec 要求在 `BlueprintServiceContext` 下与 `blueprintStores` 共存但边界对齐。
- **External HTTP Contract / 外部 HTTP 契约**：当前 `router.get/post/put/patch/delete(...)` 注册的所有 URL、HTTP 方法、请求结构和响应结构的集合，以 `server/tests/blueprint-routes.test.ts` 51 个用例所锁定的行为为准。
- **Public Types / 公共类型**：`shared/blueprint/contracts.ts` 对 `client` 与 `server` 已导出的类型符号集合，以及从 `server/routes/blueprint.ts` 通过 `export` 暴露到外部测试与调用方的 `BlueprintJobStore`、`createMemoryBlueprintJobStore`、`createFileBlueprintJobStore` 等运行时符号。
- **Event Family / 事件家族**：`clarification.*`、`route.*`、`spec.*`、`preview.*`、`prompt.*`、`mission.*`、`evidence.*`、`role.*`、`capability.*` 等以 `.` 分段的事件命名空间。
- **Reviewing Handoff**：当前 `BlueprintProgressPanel` / SPEC Tree 中“已生成草稿等待确认”的人工交接态，在 `project-autopilot-blueprint-master` 中被要求为显式状态，但在代码里仍以隐式字段表达。
- **Artifact Replay Event Stream**：Artifact Ledger / Replay 子系统消费的运行时事件流，本 spec 要求其与其余 7 个子域共用同一套统一事件流，而不是再维护一份旁路流水。

## 需求

### 需求 1：对齐拆分范围与目标边界

**用户故事：** 作为 `/autopilot` 模块的主要维护者，我希望本次重构有一个明确、可审核的拆分范围定义，以便后续的 design 和 tasks 都能围绕同一条边界推进，不被临时扩大或缩小。

#### 验收标准

1.1 THE Refactor_Scope SHALL 覆盖并且仅覆盖以下文件及其同目录测试：`server/routes/blueprint.ts`、`shared/blueprint/contracts.ts`、`client/src/lib/blueprint-api.ts`、`client/src/pages/autopilot/AutopilotRoutePage.tsx`、`client/src/pages/specs/BlueprintProgressPanel.tsx`，以及 `client/src/lib/` 下的 `autopilot-launch-examples.ts`、`autopilot-prompt-optimizer.ts`、`autopilot-frontend-model.ts`、`use-autopilot-cockpit-model.ts`、`use-autopilot-route-plan.ts`、`launch-router.ts`、`blueprint-copy.ts`。

1.2 THE Refactor_Scope SHALL 仅将 `client/src/pages/Home.tsx` 中“进入 autopilot 模式”的入口与 hand-off 相关逻辑纳入调整范围，而不涉及其中的 project-space 分支或通用导航壳。

1.3 THE Refactor_Scope SHALL NOT 修改 `docs/autopilot-target-experience-architecture-2026-05-07.svg`、`docs/autopilot-spec-adjustment-progress-2026-05-07.svg` 或其他 `docs/*.svg` 文件。

1.4 THE Refactor_Scope SHALL NOT 修改 Web-AIGC 节点适配器、MCP、Docker executor、runtime 引擎以及 `blueprint` 模块以外的服务端路由。

1.5 WHEN 本 spec 的任意后续阶段试图扩大上述范围，THE Refactor_Scope SHALL 要求先回到 requirements 阶段追加对应需求，再进入 design 与 tasks。

### 需求 2：按 8 个子域切分 Router 与 Client SDK

**用户故事：** 作为 `/autopilot` 的新加入维护者，我希望蓝图栈按照我在 Router 里看到的业务形状被切成若干内聚模块，以便我可以只打开一两个文件就完成一项功能，而不是每次都在一个一万三千行的文件里滚屏。

#### 验收标准

2.1 THE Blueprint_Server SHALL 将 `server/routes/blueprint.ts` 中的路由按以下 8 个子域重新组织为独立的服务模块，每个模块至少包含一个对应的子 Router 或 service 类，并在 `server/routes/blueprint/` 下拥有自己的目录或文件：
  1. Intake & Project Context：`/specs`、`/capabilities`、`/intake`、`/intake/:id`、`/projects/:projectId/context`。
  2. Clarification：`/intake/:id/clarifications`、`/clarifications/:sessionId`、`/clarifications/:sessionId/answers`。
  3. Job Lifecycle & Events：`/jobs`、`/generations`、`/jobs/latest`、`/jobs/:id`、`/jobs/:id/events`、`/jobs/:id/events/stream`、`/generations/:id/events`、`/generations/:id/events/stream`、`/generations/:id`。
  4. Agent Crew & Runtime Capability：`/jobs/:id/agent-crew`、`/jobs/:id/role-timelines`、`/jobs/:id/capabilities`、`/jobs/:id/capability-invocations`(GET/POST)、`/jobs/:id/capability-evidence`、`/jobs/:id/sandbox-derivation-jobs`(GET/POST)。
  5. RouteSet & SPEC Tree：`/jobs/:id/route-selection`(POST/DELETE)、`/generations/:id/route-selection`(DELETE)、`/jobs/:id/spec-tree`(GET)、`/jobs/:id/spec-tree/nodes/:nodeId`(PATCH)、`/jobs/:id/spec-tree/actions`、`/jobs/:id/spec-tree/versions`。
  6. SPEC Documents：`/jobs/:id/spec-documents`(GET/POST) 以及其附属的版本与 review 子路径（若已实现）。
  7. Effect Preview / Prompt Package / Engineering Handoff：`/jobs/:id/effect-previews`(GET/POST)、`/jobs/:id/prompt-packages`(GET/POST)、`/jobs/:id/engineering-landing`(GET/POST)、`/jobs/:id/engineering-runs`(GET/POST)。
  8. Artifact Memory / Replay：`/jobs/:id/artifact-ledger`、`/jobs/:id/artifact-replay`、`/jobs/:id/artifact-replays`、`/jobs/:id/artifact-diff`、`/jobs/:id/artifact-feedback`。

2.2 THE Blueprint_Server SHALL 保留 `createBlueprintRouter(deps)` 作为对外唯一装配入口，使现有调用方（如 `server/index.ts` 与集成测试）无需修改挂载方式即可继续使用同一个聚合 Router。

2.3 THE Blueprint_Client SHALL 将 `client/src/lib/blueprint-api.ts` 按同样的 8 个子域拆分为独立模块（例如 `client/src/lib/blueprint-api/intake.ts`、`clarification.ts`、`jobs.ts`、`agent-crew.ts`、`routeset.ts`、`spec-documents.ts`、`preview-prompt-handoff.ts`、`artifact-replay.ts`），并通过 `client/src/lib/blueprint-api/index.ts` 重新导出当前消费者使用的符号。

2.4 THE Shared_Contracts SHALL 将 `shared/blueprint/contracts.ts` 按同样的子域切分到 `shared/blueprint/` 下的子模块，并通过 `shared/blueprint/index.ts` 继续导出当前 `client` 与 `server` 依赖的所有类型符号。

2.5 THE Blueprint_UI SHALL 将 `client/src/pages/autopilot/AutopilotRoutePage.tsx` 中 input、clarification、routeset、selection、fabric/execution 五个阶段面板与控制台拆分为独立的 React 组件文件（至少一个子目录，如 `client/src/pages/autopilot/stages/`），`AutopilotRoutePage.tsx` 降级为阶段编排与数据接线，自身体量显著下降。

2.6 THE Blueprint_UI SHALL 将 `client/src/pages/specs/BlueprintProgressPanel.tsx` 按“总览 / 作业事件 / SPEC 树 / SPEC 文档 / 预览与提示词 / 交接与回放”等功能区切分为多个协作组件，`BlueprintProgressPanel.tsx` 自身只承担区块装配与数据获取。

2.7 WHEN 8 个子域完成拆分，THE Refactor SHALL 让每个新模块内部条理清晰、以子域为主聚合，而不再承载跨子域的胶水逻辑；不设硬性单文件行数阈值，但若某个文件在拆分后仍明显偏大、跨多个子域或可识别为“继续单体化”，则 SHALL 在 design 阶段说明理由并在 tasks 中给出下一步处理项。

### 需求 3：通过 BlueprintServiceContext 显式注入依赖

**用户故事：** 作为蓝图栈的单元测试作者，我希望每个子域服务都可以在测试里被单独装配，而不是必须构造整个 Router 才能验证一段逻辑，以便我可以为每个子域补可快速执行的 co-located 单元测试。

#### 验收标准

3.1 THE Blueprint_Server SHALL 定义一个 `BlueprintServiceContext`（或等效命名的共享容器），包含全部子域所需的运行期依赖，并对每一项支持通过构造时注入完成替换；默认覆盖但不限于：`blueprintStores`（intake / clarification sessions / project contexts）、`jobStore`、`llm` 相关依赖（含 chat 完成与 JSON 调用入口）、event emitter、`now(): Date`、`generateClarificationQuestions` 与其他由当前模块内部默认构造的依赖（例如 Artifact Replay 的存储适配、`sandbox` 作业的推导回调等）。

3.2 THE Blueprint_Server SHALL 让 8 个子域服务通过构造参数或工厂函数接收 `BlueprintServiceContext`，而不是在模块顶层直接引用 `defaultJobStore`、`blueprintStores` 等模块级单例。

3.3 WHEN `createBlueprintRouter(deps)` 被调用并未显式提供 `BlueprintServiceContext`，THE Blueprint_Server SHALL 自行基于 `deps` 构建一个默认的 `BlueprintServiceContext`，保证当前所有调用点（包括 `server/tests/blueprint-routes.test.ts` 中的装配）可在无需改动外部代码的情况下继续工作。

3.4 THE Blueprint_Server SHALL 保留 `BlueprintJobStore` 接口及其 `createMemoryBlueprintJobStore`、`createFileBlueprintJobStore` 两个工厂的对外导出签名；WHERE 本 spec 引入 `BlueprintServiceContext`，THE Blueprint_Server SHALL 将这两个工厂收敛为 `BlueprintServiceContext` 的默认实现来源，而不是并存多套竞争实现。

3.5 THE Blueprint_Server SHALL 统一 `blueprintStores` 与 `BlueprintJobStore` 的抽象边界：`blueprintStores` 继续承载 intake / clarification / project context 等纯内存状态，`BlueprintJobStore` 继续承载作业级持久化状态；两者通过 `BlueprintServiceContext` 暴露给子域，不再由任一子域自行实例化。

3.6 IF 任一子域在实现过程中被发现直接 `import` 模块级单例（如 `defaultJobStore`）而不是通过 `BlueprintServiceContext` 获取依赖，THEN THE Refactor SHALL 在 design / tasks 层次上将其视为违反本需求的阻塞项，并要求在合并前修正。

### 需求 4：显式化 `reviewing` 交接态与状态机

**用户故事：** 作为 `/autopilot` 的用户，我希望 RouteSet 生成与 SPEC Tree 草稿完成后，我能在界面上清楚看到“这是等待我确认的交接点”，而不是怀疑后台卡死。

#### 验收标准

4.1 THE Blueprint_Server SHALL 在作业状态与 SPEC Tree 状态机中将 `reviewing` 定义为一个显式的命名状态，可以通过响应体或事件中的字段被前端和测试读出来，而不是仅以“某个时间范围内未收到下一步事件”来隐式推断；具体字段名与字段结构 SHALL 留到 design 阶段确定，本 spec 只要求“显式化”。

4.2 THE Blueprint_UI SHALL 在 `BlueprintProgressPanel` 与 `AutopilotRoutePage` 中至少展示一个与 `reviewing` 状态对应的可见提示，明确告知用户下一步可选动作（确认、微调、改选路线或继续推进）。

4.3 THE Blueprint_Server SHALL 保证 `reviewing` 状态在当前 51 个 `blueprint-routes.test.ts` 用例覆盖的响应结构中以向后兼容的方式出现：现有字段和含义不变，新增字段仅以可选形式出现，不引起既有断言失败。

4.4 WHEN 用户确认 `reviewing` 交接并继续推进，THE Blueprint_Server SHALL 将 `reviewing` 结果写入 provenance（至少包括被选中的路径标识、SPEC Tree 标识与对应 routeId，具体字段名由 design 阶段确定），使后续子域消费者可以反查决策。

### 需求 5：统一事件家族命名与运行时事件流

**用户故事：** 作为 Artifact Replay 与前端面板的消费者，我希望蓝图栈使用一套一致的事件命名，以便我在 SDK、面板和回放里看到的事件名字含义一致。

#### 验收标准

5.1 THE Blueprint_Server SHALL 在 `shared/blueprint/` 下维护唯一一份事件名枚举或联合类型，包括并仅包括以下事件家族：`clarification.*`、`route.*`、`spec.*`、`preview.*`、`prompt.*`、`mission.*`、`evidence.*`、`role.*`、`capability.*`，以及现有必需的作业级事件（如 `job.started`、`job.failed`、`sandbox.job.*`）。

5.2 WHERE 现有代码在字符串字面量或散落位置直接写出事件名，THE Refactor SHALL 将其全部替换为从 `shared/blueprint/` 事件名枚举导出的常量引用，使新增或重命名事件必须经过该单一来源。

5.3 THE Artifact_Replay SHALL 仅从需求 5.1 所定义的统一事件流中消费事件，而不再单独维护与之并行的事件源或自定义命名空间。

5.4 IF 实现过程中发现现有某个事件名不属于需求 5.1 定义的家族（例如散落的 `blueprint.*` 或拼错的命名），THEN THE Refactor SHALL 在 design / tasks 阶段为该事件选择归属的家族或记录为遗留项，而不是沉默继续使用旧名。

5.5 THE Refactor SHALL 确保事件家族收敛过程中，`server/tests/blueprint-routes.test.ts` 中依赖事件流的用例仍然通过：若某用例因事件名字符串改动而断言失败，则视为违反本需求，需要调整实现使外部可观察行为保持一致。

### 需求 6：保留外部 HTTP 与公共类型契约

**用户故事：** 作为当前已经接入 blueprint API 的前端页面、集成测试和 SVG 流程图的维护者，我希望这次重构对我完全是“黑盒无感知”的，代码挪位不会要求我改 URL、请求结构、响应结构或导入路径。

#### 验收标准

6.1 THE Blueprint_Server SHALL 在拆分完成后保留需求 2.1 所列的全部 HTTP 方法与 URL 前缀，不删除、不重命名、不合并任何现有路由。

6.2 THE Blueprint_Server SHALL 保留所有现有路由的请求体与响应体结构，包括字段名、字段类型、可选性与错误响应形态；可新增的变化仅限于在响应中追加**可选**字段（如显式 `reviewing` 状态标识）。

6.3 THE Shared_Contracts SHALL 通过 `shared/blueprint/index.ts` 重新导出所有当前被 `client` 与 `server` 使用的类型符号，使现有 `import { ... } from "@shared/blueprint/contracts"` 或等价相对路径继续可用；若路径层级必须变化，则 THE Refactor SHALL 以 barrel re-export 形式兜底。

6.4 THE Blueprint_Client SHALL 通过 `client/src/lib/blueprint-api/index.ts` 保留当前所有导出符号，使现有页面与 store 的 `import` 语句无需修改即可完成迁移。

6.5 WHEN 任一外部调用方（已存在的页面组件、store、测试）在重构后必须修改 `import` 路径、URL 或请求结构才能继续工作，THE Refactor SHALL 将该情况视为违反本需求，必须在 design / tasks 阶段提出显式桥接方案或索性放弃该变更。

### 需求 7：保持 `blueprint-routes.test.ts` 为端到端契约闸门并补齐子域单测

**用户故事：** 作为代码评审人，我希望这次重构在 CI 上的表现是“原有 51 个端到端用例保持绿色，同时每个新子域都带来自己的快速单测”，以便我可以用测试数和覆盖面而不是主观判断来评估重构是否到位。

#### 验收标准

7.1 THE Blueprint_Server SHALL 保持 `server/tests/blueprint-routes.test.ts` 作为端到端契约闸门；本 spec 完成后，该文件中原有的 51 个用例 SHALL 全部保持通过。

7.2 WHERE 重构过程暴露出此前未覆盖的隐式行为（例如 `reviewing` 状态的显式化、事件家族命名的统一），THE Blueprint_Server SHALL 在 `blueprint-routes.test.ts` 中以增量方式追加少量新用例，而不是改写或删除既有 51 个用例。

7.3 THE Blueprint_Server SHALL 为 8 个子域中的每一个至少新增一份 co-located 单元测试（例如 `server/routes/blueprint/intake/intake-service.test.ts`），覆盖该子域的核心成功路径和至少一条失败 / 边界路径。

7.4 THE Blueprint_Client SHALL 为新拆分出的 API 模块保留或补充 happy-path 断言（至少验证 URL、HTTP 方法与请求体结构），可以通过现有 `client` 测试框架或新增文件完成。

7.5 THE Refactor SHALL 保持当前 LLM smoke 与公共 smoke 的通过状态，不引入新的 smoke failure；WHERE 这些 smoke 受影响仅因为依赖注入方式变化，THE Refactor SHALL 通过适配 `BlueprintServiceContext` 默认构造而非修改 smoke 测试来保持通过。

### 需求 8：保留 SVG 叙事与 249/249 任务基线

**用户故事：** 作为项目总览文档的读者，我希望这次重构不要破坏 SVG 流程图所描述的 11 个节点叙事，也不要让 249/249 的进度基线出现意外回退。

#### 验收标准

8.1 THE Refactor SHALL 保持 `docs/autopilot-target-experience-architecture-2026-05-07.svg` 与 `docs/autopilot-spec-adjustment-progress-2026-05-07.svg` 所描述的 11 个流程节点与 249/249 spec 任务基线不变。

8.2 THE Refactor SHALL NOT 借重构之名修改既有 Web-AIGC 58 份 specs、task-autopilot Phase 1 的 18 份 specs 或其 tasks 基线。

8.3 WHERE 本 spec 自身产生了新的 tasks（在后续 tasks 阶段），它们 SHALL 仅计入本 spec 的任务清单，而不并入上述已封板的基线。

### 需求 9：明确不在本次拆分范围内的事项

**用户故事：** 作为后续执行人，我希望在进入 design 阶段之前就明确“什么不做”，以便在实现中遇到边界时可以直接引用。

#### 验收标准

9.1 THE Refactor SHALL NOT 触及 `client/src/pages/Home.tsx` 中 project-space 分支的任何业务逻辑；仅允许调整它进入 autopilot 模式的入口与 hand-off 代码。

9.2 THE Refactor SHALL NOT 修改 Web-AIGC 节点适配器、MCP checker / tool adapter、Docker executor、runtime engine 或 blueprint 模块以外的 runtime / governance / observability 主线。

9.3 THE Refactor SHALL NOT 对 3D 场景、HUD、运行日志界面做视觉重设计或交互级重构；仅当显式化 `reviewing` 状态或事件家族需要最小 UI 提示时，可在现有组件里新增一个可访问的状态指示。

9.4 THE Refactor SHALL NOT 合入 Web-AIGC 的 58 份 specs、task-autopilot Phase 1 的 18 份 specs 或 Web-AIGC runtime 主线作为本 spec 的验收前提，也不依赖它们产生新的接口改动。

9.5 THE Refactor SHALL NOT 承担平台级治理收口（类型债清理、runtime adapter result 统一、observability / lineage 深化、tools-and-agents 治理字段统一等）作为本 spec 的验收目标；这些主线由各自 steering 继续推进，本 spec 只保证不引入新的倒退。
