# Requirements Document

## Introduction

本文档定义 `autopilot-agent-reasoning-stream` 特性的需求。

在 `autopilot-agent-driven-pipeline` 完成后（Planner 角色在 `RoleAgentDelegator` 内部通过 ReAct Loop 自主产出 `BlueprintRouteSet`），以及 `autopilot-realtime-observation-bridge` 完成后（Socket.IO 中继 + `BlueprintRealtimeStore` + `PetWorkers` 角色动画），用户提交 GitHub URL 后 Agent 的确在 LLM 沙箱里跑 Think→Act→Observe 循环，但前端当前只展示一个通用 loading 状态，`BlueprintLogStream` 只能渲染事件类型原文，用户感知不到 Agent 内部的推理过程。

本特性把 Agent 执行过程落成前端**流式推理时间线**：

1. 用户提交目标后，右侧 HUD 面板呈现为一条时间线，Think / Act / Observe 条目实时追加到末尾并自动锚定底部；
2. 未到达的未来节点保持"神秘感"，不提前渲染占位，保持"系统正在活着思考"的体感；
3. LLM 每次执行路径可能不一样，这种不确定性本身是 AGI 平台的仪式感；
4. 同时让用户在 LLM 沙箱 30–90s 的等待中有清晰内部进度，而不是转圈。

本特性的视觉与交互模式**参考 MiroFish 仓库 `frontend/src/components/Step3Simulation.vue` 与 `SimulationRunView.vue` 中已验证的流式时间线设计**（TransitionGroup + timeline-axis + timeline-card + pulse-ring 等待态 + 双轨交替 + 自动滚动策略），并针对本项目单 Agent ReAct 循环 + Socket.IO 实时推送 + 新增 error/degraded/completed 全宽横幅态的场景做改良；详见 Requirement 13。

本特性**不**扩展 12 家族目录、**不**替换既有 `BlueprintLogStream` / `blueprint-realtime-store` / `socket-relay`、**不**修改 5 条 bridge 内部实现（`docker-analysis-sandbox` / `mcp-github-source` / `role-system-architecture` / `aigc-spec-node` / `agent-crew-stage-activation` / `role-autonomous-agent`），只在 `role` / `agent` 家族下做增量接线与前端纵切。

## Glossary

- **Agent Trace Entry**：`AgentTraceEntry`（定义于 `shared/blueprint/agent-state.ts`），包含 `iteration / phase (idle|thinking|acting|observing|completed|failed) / thought / action / observation / error / tokensUsed / timestamp`。
- **Agent Progress Event**：`AgentProgressEvent`（定义于 `shared/blueprint/agent-events.ts`），容器内 Agent Loop 通过 `CallbackReceiver` 回调的进度事件，已有 `agent.started / agent.thinking / agent.acting / agent.observing / agent.iteration_completed / agent.completed / agent.failed / agent.aborted` 8 个类型。
- **Reasoning Stream**：本特性新增的前端流式推理时间线，承载 Think / Act / Observe / Error / Iteration 结构化条目，按 iteration 聚合。
- **Reasoning Entry**：前端时间线的一条结构化卡片，对应一次 Think / Act / Observe / Error / Summary，由后端 `AgentProgressEvent` 派生而来。
- **Mystery Policy**：未到达节点不提前显示占位符的策略，只渲染已到达的条目。
- **Bottom Anchor Policy**：新条目到达后是否自动滚到底部的策略，用户手动上滑时暂停自动滚。
- **Agent_Reasoning_Bridge**：本特性引入的宿主侧桥接模块，订阅 `CallbackReceiver.onProgress` 与 `RoleAgentDelegator` 的 trace，把结构化条目经 `ctx.eventBus.emit()` 转发为 `role.agent.*` 事件，再由 `BlueprintSocketRelay` 推送至前端。
- **Env_Flag**：环境变量 `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED`，控制本特性总开关，默认 `"false"`；`BUILD_TARGET=test` 下强制视为关闭。
- **Timeline_Store_Slice**：`BlueprintRealtimeStore` 新增的 `agentReasoning` 状态切片，维护按 `jobId` 组织的 Reasoning Entry 列表与当前 iteration 指针。
- **MiroFish Timeline Pattern**：本 spec 参考的流式时间线模式，源自 https://github.com/666ghj/MiroFish `frontend/src/components/Step3Simulation.vue`，核心特征为：双层信息架构（Timeline Feed 结构化卡片 + System Logs 终端日志）、400ms cubic-bezier 渐入、pulse-ring 等待占位、左右双轨交替布局、Timeline 层保护用户滚动位置（不强制 autoscroll）；详见 Requirement 13。

## Requirements

### Requirement 1：Env Flag 与默认兼容

**User Story:** As a platform operator, I want the agent reasoning stream to be gated by a dedicated env flag that defaults to off, so that existing 5140+ tests and existing clients remain unaffected when the feature is not explicitly enabled.

#### Acceptance Criteria

1. THE System SHALL read the environment variable `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED` to determine whether the reasoning stream bridge and the front-end timeline are active.
2. WHEN `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED` is not exactly the string `"true"`, THE System SHALL NOT emit any new `role.agent.*` events, SHALL NOT subscribe to `CallbackReceiver.onProgress` for reasoning purposes, and SHALL NOT mount the reasoning timeline UI.
3. WHEN `BUILD_TARGET=test` is set in the runtime environment, THE System SHALL treat the env flag as `"false"` regardless of its actual value, preserving the existing server-side 5140+ test baseline.
4. THE System SHALL register the env flag in `.env.example` with the default value `"false"` and a descriptive Chinese comment referencing this spec.
5. WHEN the env flag is off, THE existing `BlueprintLogStream` component, `BlueprintRealtimeStore.logEntries` queue, and `BlueprintSocketRelay` behavior SHALL remain bit-for-bit identical to their current behavior.

### Requirement 2：Agent Reasoning Bridge 装配

**User Story:** As a developer, I want a dedicated bridge module that translates `AgentProgressEvent` and `AgentTraceEntry` into `role.agent.*` events on the existing `BlueprintEventBus`, so that the Socket.IO relay and front-end store can consume structured reasoning entries without any change to the 5 existing capability bridges.

#### Acceptance Criteria

1. THE System SHALL provide a new module `server/routes/blueprint/agent-reasoning-bridge.ts` that exports a `createAgentReasoningBridge({ eventBus, callbackReceiver, delegator, logger, now })` factory function.
2. WHEN the env flag is `"true"` AND the factory receives a valid `callbackReceiver`, THE Agent_Reasoning_Bridge SHALL subscribe to `callbackReceiver.onProgress(listener)` and forward every `AgentProgressEvent` as a `role.agent.*` event on the existing `BlueprintEventBus`.
3. WHEN the factory receives `callbackReceiver=undefined` OR the env flag is `"false"`, THE Agent_Reasoning_Bridge SHALL register no listeners and SHALL return a no-op `{ start, stop }` handle so that host assembly code remains identical.
4. THE Agent_Reasoning_Bridge SHALL NOT modify the implementation of `RoleAgentDelegator`, `CallbackReceiver`, `RoleAgentRuntime`, `LiteAgentRuntime`, `ExecutorClient`, or any of the 5 existing bridges.
5. IF the underlying listener throws during translation, THEN THE Agent_Reasoning_Bridge SHALL log a debug entry, SHALL increment an internal `droppedEntryCount` counter, and SHALL continue processing subsequent events.

### Requirement 3：`role.agent.*` 事件在 `role` 家族下的增量扩充

**User Story:** As a system architect, I want the new reasoning events to live inside the existing `role` family instead of opening a new family, so that the 12-family event catalog and existing family filters on `BlueprintSocketRelay` remain stable.

#### Acceptance Criteria

1. THE System SHALL extend `BlueprintGenerationEventType` and `BlueprintEventName` in `shared/blueprint/events.ts` with the following additive event names: `role.agent.iteration_started`, `role.agent.thinking`, `role.agent.acting`, `role.agent.observing`, `role.agent.iteration_completed`, `role.agent.error`, `role.agent.completed`.
2. THE `resolveBlueprintEventFamily` function SHALL map every new `role.agent.*` event to the existing `"role"` family and SHALL NOT introduce a new family entry.
3. THE `BlueprintSocketRelay` default family filter (`DEFAULT_RELAY_FAMILIES`) SHALL continue to include `"role"`, and SHALL propagate the new `role.agent.*` events to clients without any change to the filter set.
4. WHEN a `role.agent.*` event is emitted, THE event payload SHALL include at minimum `jobId`, `roleId`, `stageId`, `iteration`, `phase`, `timestamp`, and MAY include `thought`, `actionToolId`, `observationSuccess`, `error`, `tokensUsed`, `budgetRemaining` as sanitized fields.
5. THE System SHALL NOT emit `role.agent.*` events for any execution path that uses the `"fallback"` tier of `RoleAgentDelegator` (one-shot `callLLMJson`), because that tier has no Think/Act/Observe loop to stream.

### Requirement 4：内容脱敏与神秘感策略

**User Story:** As a security-aware operator, I want the reasoning entries to expose enough narrative for users to feel the agent is alive while scrubbing prompts, credentials, and raw tool payloads, so that sensitive information does not leak into the front-end timeline.

#### Acceptance Criteria

1. WHEN a `thought` field is emitted, THE System SHALL truncate the thought to at most 280 UTF-8 characters, SHALL strip any substring that matches the existing `sanitizeTraceEntries` credential patterns (API Key / Bearer / AWS Key / password / token), and SHALL append an ellipsis marker when truncation occurred.
2. WHEN an `action` field is emitted, THE System SHALL include only the stable `toolId` (e.g. `mcp.github.clone`) and SHALL NOT include raw tool parameters, tokens, or file paths.
3. WHEN an `observation` field is emitted, THE System SHALL include only a boolean `success` flag and an optional one-line summary of at most 200 UTF-8 characters, SHALL NOT include raw tool return values, and SHALL NOT include file contents.
4. WHEN an `error` field is emitted, THE System SHALL include an error code or short message of at most 200 UTF-8 characters, SHALL include a `degraded` boolean indicating Tier 2 / Tier 3 fallback, and SHALL NOT include stack traces.
5. THE Reasoning Entry SHALL include an `iteration` integer (starting from 1) and a human-readable `iterationLabel` of the form `#${iteration}` so that users can visually count rounds.
6. THE System SHALL NOT pre-render placeholders for future iterations: the Timeline_Store_Slice SHALL only contain entries that have already been received, preserving the Mystery Policy.

### Requirement 5：`BlueprintRealtimeStore` 扩展 `agentReasoning` 切片

**User Story:** As a front-end developer, I want `BlueprintRealtimeStore` to carry a typed `agentReasoning` slice alongside the existing `logEntries`, so that the new timeline UI does not need to re-derive structured entries from raw log strings and existing subscribers remain unaffected.

#### Acceptance Criteria

1. THE System SHALL extend `client/src/lib/blueprint-realtime-store.ts` with a new read-only slice `agentReasoning: { jobId: string | null; entries: AgentReasoningEntry[]; currentIteration: number; status: "idle" | "streaming" | "completed" | "failed" | "aborted" }`.
2. WHEN the store receives a `role.agent.*` event for the currently subscribed `jobId`, THE store SHALL append a new `AgentReasoningEntry` to `agentReasoning.entries` and SHALL update `currentIteration` and `status` accordingly.
3. THE `agentReasoning.entries` queue SHALL be bounded to at most 500 entries, SHALL truncate the oldest entries when the cap is exceeded, and SHALL NOT affect the existing 200-cap `logEntries` queue or 50-cap `agentProgress` queue.
4. WHEN `subscribe(jobId)` is called with a new `jobId`, THE store SHALL reset `agentReasoning` to its initial empty state so that the Mystery Policy holds at the start of every new job.
5. THE existing `BlueprintLogStream` component, `logEntries` queue shape, and `dispatchEvent` behavior for non-`role.agent.*` events SHALL remain unchanged.

### Requirement 6：Reasoning Timeline UI 组件

**User Story:** As an end user, I want a structured timeline panel on the right rail that shows each Think / Act / Observe card appearing live as the agent reasons, so that I can feel the agent is alive during the 30–90 second LLM run instead of staring at a spinner.

#### Acceptance Criteria

1. THE System SHALL provide a new front-end component `client/src/components/blueprint/AgentReasoningTimeline.tsx` that consumes the `agentReasoning` slice via `useBlueprintRealtimeStore`.
2. THE AgentReasoningTimeline SHALL render one card per `AgentReasoningEntry`, grouped visually by `iteration`, with distinct visual treatments for each phase per the following mapping (参考 MiroFish `Step3Simulation.vue` 中 action badge 的 monochrome + mono 视觉语言，详见 Requirement 13)：
   - `thinking`：dashed border + `#999` 文字（meta 气质，对应 MiroFish `SEARCH / FOLLOW` badge）；
   - `acting`：filled `#F0F0F0` 背景 + `#333` 文字（对应 MiroFish `POST / QUOTE` badge）；
   - `observing`：outline `#FFF` 背景 + `#E0E0E0` border（对应 MiroFish `LIKE / UPVOTE / REPOST` badge）；
   - `error` / `degraded`：红边框 `#F44336` + 浅红底 `#FFF5F5`（本项目新增，MiroFish 无对应）；
   - `completed`：solid `#1A936F` 底 + 白字（本项目新增，MiroFish 无对应）；
   - 空 iteration / idle：opacity 0.5（对应 MiroFish `IDLE` badge）。
3. THE AgentReasoningTimeline SHALL coexist with the existing `BlueprintLogStream` (not replace it) and SHALL be mounted only when the env flag resolves to `"true"` at build time.
4. WHEN `agentReasoning.entries` is empty AND `agentReasoning.status` is `"idle"` or `"streaming"`, THE AgentReasoningTimeline SHALL render a single "waiting for first thought" placeholder that does NOT enumerate future iterations, preserving the Mystery Policy. THE placeholder SHALL be implemented as a MiroFish-style pulse-ring with the following specification (参考 MiroFish `.pulse-ring` + `@keyframes ripple`)：
   - 环初始尺寸 `32px × 32px`，边框颜色 `#EAEAEA`，圆角 50%；
   - 脉冲动画 `2s infinite`，`transform: scale(0.8 → 2.5)` 与 `opacity: 1 → 0` 同步；
   - 伴随文字标签：中文 `"等待第一条思考..."`（英文环境 `"Waiting for first thought..."`）；
   - 放置于 Timeline 视口中央，不随滚动移动；
   - WHEN `prefers-reduced-motion: reduce` is detected, THE placeholder SHALL degrade to a static ring + text (no `ripple` animation).
5. WHEN the component is unmounted, THE component SHALL NOT retain timers, intervals, or ongoing animations.
6. THE AgentReasoningTimeline SHALL implement a **dual-track alternating layout** inspired by MiroFish's left/right platform tracks (`SimulationRunView.vue`), mapped to this project's single-agent ReAct loop as follows:
   - `thinking` 条目对齐**左轨**（思考在左侧）；
   - `acting` 与 `observing` 条目对齐**右轨**（行动与结果在右侧）；
   - `error` / `degraded` 条目为**居中横跨**的全宽横幅，比普通卡片更显眼的警示视觉；
   - `completed` 条目为**居中横跨**的全宽横幅（终态，与 error 同样的全宽位但使用成功态配色）；
   - 每个 iteration 之间 SHALL 渲染一条横向分隔线，标注 `#${iteration}` 编号，便于用户视觉计数轮数。

### Requirement 7：自动滚动与打字节奏

**User Story:** As an end user, I want new reasoning entries to appear at the bottom of the timeline with a subtle reveal, and I want the timeline to stop auto-scrolling when I scroll up to read an earlier entry, so that the timeline feels live without fighting my attention.

本需求参考 MiroFish `Step3Simulation.vue` 中的**双层滚动策略**：Timeline Feed（结构化卡片层）不强制 autoscroll，仅在用户已贴底时自动滚；System Logs（底部终端日志层）始终自动贴底。对应到本项目：**新增的 Reasoning Timeline 作为 Timeline Feed 层，采用"贴底时自动滚"策略；现有 `BlueprintLogStream` 作为 System Logs 层（运行日志），保持当前的自动贴底行为不变**。详见 Requirement 13。

#### Acceptance Criteria

1. WHEN a new `AgentReasoningEntry` is appended AND the user's scroll position is within 32px of the bottom of the timeline, THE AgentReasoningTimeline SHALL scroll to the bottom on the next animation frame.
2. WHEN the user has scrolled more than 32px away from the bottom, THE AgentReasoningTimeline SHALL NOT auto-scroll on new entries and SHALL show a floating "↓ Latest" button that restores auto-scroll when clicked.
3. THE AgentReasoningTimeline SHALL reveal each new entry with a **400ms `cubic-bezier(0.165, 0.84, 0.44, 1)` fade-and-slide animation**, where `opacity` transitions from `0 → 1` and `transform` transitions from `translateY(20px) → translateY(0)` (对齐 MiroFish `.timeline-item-enter-active` / `.timeline-item-enter-from` 规格，见 Requirement 13)，SHALL NOT use a per-character typewriter effect, and SHALL NOT block the main thread.
4. WHEN `prefers-reduced-motion: reduce` is detected, THE AgentReasoningTimeline SHALL disable the reveal animation and SHALL fall back to instant appearance.
5. THE AgentReasoningTimeline SHALL NOT batch entries for display: every received entry SHALL be rendered within one animation frame after the store update, so that the live cadence matches the real LLM cadence rather than a cosmetic buffer. **节奏来自真实 LLM 循环的 Socket.IO 事件**：本特性 SHALL NOT 引入任何前端定时轮询（如 `setInterval` 拉取状态）或人为合成节奏，所有时序完全由 `BlueprintSocketRelay` 推送的 `role.agent.*` 事件驱动；这是本项目相对 MiroFish HTTP 轮询（`getRunStatus` 2s / `getRunStatusDetail` 3s）的结构性改良。

### Requirement 8：错误 / 降级 / 取消 / 超时展示

**User Story:** As an end user, I want the timeline to honestly show when the agent falls back to Lite mode, fails, is cancelled, or times out, so that I can trust the timeline as a truthful progress surface rather than a theatrical animation.

#### Acceptance Criteria

1. WHEN the `RoleAgentDelegator` degrades from Real Mode to Lite Mode during a job, THE Agent_Reasoning_Bridge SHALL emit one `role.agent.error` event with `degraded: true` and a concise Chinese-friendly reason such as `"降级到 Lite 模式"`.
2. WHEN the `RoleAgentDelegator` falls back from Lite Mode to the one-shot `callLLMJson` path (Tier 3), THE AgentReasoningTimeline SHALL render a single summary card labeled `"一次性 LLM 回退"` with the final outcome and SHALL NOT fabricate Think / Act / Observe entries for the fallback path.
3. WHEN a user cancels the job via `delegator.cancel(jobId, reason)`, THE Agent_Reasoning_Bridge SHALL emit a `role.agent.error` entry with `degraded: false` and reason `"用户取消"`, and THE AgentReasoningTimeline SHALL show a terminal "aborted" card as the last entry.
4. WHEN the LLM sandbox exceeds its 180s timeout budget, THE Agent_Reasoning_Bridge SHALL emit a `role.agent.error` entry with reason `"超时"` and THE AgentReasoningTimeline SHALL render the entry as the terminal card without dropping earlier entries.
5. THE AgentReasoningTimeline SHALL always render the final terminal card (`completed` / `error` / `aborted`) regardless of auto-scroll state, so that users who scrolled up still receive an unambiguous end-of-stream signal (e.g. through a status badge at the top of the timeline).

### Requirement 9：Socket 断开、重连与重放

**User Story:** As an end user, I want the timeline to recover gracefully when my browser reconnects to the Socket.IO server, so that I do not end up with a permanently stale timeline mid-job.

#### Acceptance Criteria

1. WHEN the Socket.IO client disconnects and reconnects for the same `jobId`, THE `BlueprintRealtimeStore` SHALL re-issue `blueprint:subscribe` and SHALL continue appending new `role.agent.*` events to the existing `agentReasoning.entries` queue.
2. THE System SHALL NOT attempt a full server-side replay of past `role.agent.*` events on reconnect in this feature; the timeline SHALL display the entries received since reconnect and SHALL rely on a non-intrusive "reconnected, live tail resumed" status chip to convey the gap to the user.
3. IF a user closes the tab and reopens the same job URL later, THEN THE AgentReasoningTimeline MAY render an empty timeline with an informational chip `"仅显示重新连接后的推理流"`, and SHALL NOT fabricate or guess missing entries.
4. THE `connectionState` field of `BlueprintRealtimeStore` SHALL remain the single source of truth for connection status; the AgentReasoningTimeline SHALL NOT maintain its own connection-state machine.

### Requirement 10：与既有 UI / Store / 诊断端点的兼容

**User Story:** As a maintainer, I want the new timeline to coexist with `BlueprintLogStream`, `PetWorkers` animations, `tasks-store`, `mission-client`, and the diagnostics endpoint without duplicating state or forcing renaming, so that the main trunk remains compatibility-first.

#### Acceptance Criteria

1. THE System SHALL NOT modify the props or DOM contract of the existing `BlueprintLogStream` component.
2. THE System SHALL NOT change the existing `PetWorkers` animation mapping; `role.agent.*` events SHALL continue to drive role phases via the existing `mapEventTypeToPhase` (returning `"thinking" | "acting" | "observing"` for the agent sub-events).
3. THE `tasks-store` and `mission-client` modules SHALL NOT be modified by this feature; the reasoning stream is a pure blueprint-domain surface.
4. WHEN a `role.agent.*` event is observed by the server-side diagnostics counters, THE `roleAutonomousAgent.totalInvocations` counter SHALL NOT be incremented by this feature, because the counter belongs to the delegator and not to the reasoning stream; this feature SHALL instead expose a separate additive diagnostics entry `agentReasoningBridge` at `GET /api/blueprint/diagnostics`, carrying `enabled`, `totalForwarded`, `droppedEntryCount`, `lastEventAt`, and `lastEventType`.
5. THE new diagnostics entry SHALL be additive: existing entries in `/api/blueprint/diagnostics` SHALL retain their shape and order, and the endpoint SHALL continue to respond successfully when the env flag is `"false"` (the new entry MAY be omitted or reported as `{ enabled: false }` in that case).

### Requirement 11：测试口径与基线约束

**User Story:** As a release engineer, I want example-based tests that cover the critical reasoning paths without expanding the TypeScript baseline of 113 errors or introducing property-based tests, so that the main branch remains green and the baseline does not grow.

#### Acceptance Criteria

1. THE System SHALL provide example-based Vitest tests for `createAgentReasoningBridge` covering: (a) env-flag-off no-op, (b) single Think/Act/Observe/Iteration-Completed translation, (c) error / degraded event translation, (d) cancel and timeout paths.
2. THE System SHALL provide example-based Vitest tests for `BlueprintRealtimeStore.agentReasoning` covering: (a) appending entries under the 500-cap, (b) resetting state on `subscribe(newJobId)`, (c) preserving existing `logEntries` semantics.
3. THE System SHALL provide example-based Vitest tests for `AgentReasoningTimeline` covering: (a) empty / mystery placeholder (pulse-ring rendering + reduced-motion degradation), (b) auto-scroll resume after user scroll-up, (c) `prefers-reduced-motion` fallback, (d) terminal badge rendering under `completed` / `error` / `aborted`, (e) dual-track alternating layout (thinking-left / acting-right / error-center / completed-center) and iteration separator numbering.
4. THE System SHALL NOT introduce property-based tests (e.g. `fast-check`) for this feature; all tests SHALL be example-based per the 本 spec 约束.
5. AFTER the feature lands, THE TypeScript diagnostics count produced by `node --run check` SHALL NOT exceed the existing baseline of 113 errors; the new code SHALL compile without increasing the baseline.

### Requirement 12：文档与中文注释

**User Story:** As a reviewer, I want every new code unit and spec artifact to carry Chinese comments and commit messages, so that the main trunk's documentation style remains consistent.

#### Acceptance Criteria

1. Every new source file introduced by this feature (`agent-reasoning-bridge.ts`, `AgentReasoningTimeline.tsx`, test files, etc.) SHALL include a top-level Chinese docstring referencing this spec by name (`autopilot-agent-reasoning-stream`).
2. Every commit message introduced by this feature SHALL be written in Chinese and SHALL reference the spec name when relevant.
3. The feature's `design.md` and `tasks.md` (to be authored in later phases) SHALL be written primarily in Chinese prose with English terms of art retained where they are canonical (e.g. `AgentTraceEntry`, `BlueprintEventBus`).
4. WHERE the feature introduces new user-facing strings (status chips, placeholders, terminal labels), THE strings SHALL be provided in Simplified Chinese by default, and SHALL be routed through the existing i18n infrastructure if applicable.

### Requirement 13：参考来源与改良点

**User Story:** As a maintainer, I want the MiroFish reference sources and this project's improvements to be explicitly documented in requirements, so that future reviewers can trace every visual/interaction decision back to either a MiroFish code location or an explicit project-specific improvement, and so that scope creep (e.g. copying MiroFish's HTTP polling or dual-platform UI) is prevented.

本特性的流式推理时间线视觉与交互模式参考了 MiroFish 仓库（https://github.com/666ghj/MiroFish）中已经过真实运行验证的设计。具体来源、改良点与**不复制的部分**分别列出如下，所有上文 Requirement 6 与 Requirement 7 的具体规格均可回溯到此处。

#### Acceptance Criteria

1. THE spec SHALL document that the **timeline visual & interaction baseline** is referenced from MiroFish `frontend/src/components/Step3Simulation.vue` 与 `frontend/src/views/SimulationRunView.vue`, specifically:
   - Vue `<TransitionGroup name="timeline-item">` 包裹的事件卡片列表结构（对应本 spec 的 Reasoning Entry 卡片列表）；
   - `timeline-axis` + `timeline-card` + action badge 的三层结构（对应本 spec 的时间线主轴 + 卡片 + phase badge）；
   - `pulse-ring` + `@keyframes ripple` 的等待占位动画（对应 Requirement 6.4）；
   - `.timeline-item-enter-active` 的 `transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)` 与 `.timeline-item-enter-from` 的 `opacity: 0 + transform: translateY(20px)` 入场规格（对应 Requirement 7.3）；
   - 左右双轨（Twitter / Reddit）交替布局（本 spec 映射为 Think 左 / Act+Observe 右，见 Requirement 6.6）；
   - Timeline Feed **不自动滚动** + System Logs **自动贴底** 的双层滚动策略（对应 Requirement 7 引言与 7.1-7.2）。

2. THE spec SHALL document **this project's improvements over MiroFish** that MUST be preserved:
   - **单 Agent ReAct 语义化双轨**：MiroFish 用左右分轨区分 Twitter / Reddit 两个社交平台来源，本项目单 Agent ReAct 循环没有平台维度；改良为 `Think 左 / Act + Observe 右`，以语义而非平台划分轨道（见 Requirement 6.6）。
   - **Socket.IO 事件驱动节奏**：MiroFish 用 HTTP 轮询（`getRunStatus()` 2s 粗粒度 + `getRunStatusDetail()` 3s 拉 `all_actions` + 前端 `actionIds: Set<string>` 去重）。本项目**不复制**此模式，直接复用已建成的 `autopilot-realtime-observation-bridge` Socket.IO 事件流；节奏来自真实 LLM 循环的 Socket 事件，不在前端引入定时轮询，不人为合成节奏（见 Requirement 7.5）。
   - **新增 error / degraded / completed 全宽横幅态**：MiroFish 的 action badge 只区分正常动作类型（`POST / QUOTE / LIKE / UPVOTE / REPOST / SEARCH / FOLLOW / IDLE`），本项目新增 `error`（红边框 `#F44336` + 浅红底 `#FFF5F5`）与 `completed`（solid `#1A936F` + 白字）两类居中横跨横幅，用于表达 MiroFish 场景中不存在的 Tier 降级、Agent 终态与错误边界（见 Requirement 6.2 与 6.6）。

3. THE spec SHALL document **parts that are explicitly NOT copied from MiroFish**, to prevent scope creep:
   - **HTTP 轮询机制**：本项目直接走 Socket.IO 事件流，不引入 MiroFish 的 `getRunStatus` / `getRunStatusDetail` 轮询间隔、不引入前端 `actionIds: Set<string>` 去重（由 `BlueprintRealtimeStore` + 后端事件唯一性保证）。
   - **双平台视觉（Twitter / Reddit）**：本项目是单 Agent ReAct 循环，不需要平台来源区分。
   - **`action_type` 详细渲染**：MiroFish 为每种社交动作（`POST / COMMENT / LIKE / REPOST / QUOTE` 等）渲染不同的正文结构，本项目简化为 phase-based（`thinking / acting / observing / error / completed`）卡片，不按工具类型展开细节视图，工具参数与返回值仍遵守 Requirement 4 的脱敏约束。
   - **MiroFish `COMMENT` badge**：本项目无对应语义，不映射（见 Requirement 6.2 badge 映射表未出现 `COMMENT`）。

4. WHEN future design iterations propose additional visual features claimed to be "from MiroFish", THE proposer SHALL either locate the corresponding MiroFish source file + selector/keyframe and add it to Acceptance Criterion 1, OR declare the feature as a new project-specific improvement under Acceptance Criterion 2; otherwise THE proposal SHALL be rejected as scope creep.

5. THE reference documentation in this requirement SHALL NOT imply any dependency, licensing, or code copy from MiroFish: all UI code in `AgentReasoningTimeline.tsx`, CSS keyframes, and bridge logic SHALL be written from scratch for this project; the reference is for **visual & interaction design inspiration only**, not for code reuse.
