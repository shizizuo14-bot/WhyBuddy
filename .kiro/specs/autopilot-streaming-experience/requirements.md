# 需求文档：Autopilot 流式体验补完

## 引言

当前 Autopilot 蓝图主线（clarification → route generation → spec_tree → spec_docs）在用户视角上仍然像“四次同步请求 / 响应”：每个阶段在前端只看到一个 spinner 与最终结果，看不到 LLM 与工具调用过程。MiroFish（https://github.com/666ghj/MiroFish）的参考做法是把每一阶段拆为可见的 thinking / acting / observing 流，并以子时间线在驾驶舱内逐条渲染。

本仓内已经有完成度较高的“服务端发射器 + Socket 中继 + 前端 store + 时间线组件”脚手架，但因为**订阅时机错位**、**子时间线未挂载**与**几个未做回归保护的死锁兜底**，整条链路实际并未在用户面前点亮。本规格的目标是把已经存在的脚手架以最小代价接通：

- 解决 clarification / route_generation 阶段事件键为 `intakeId`、前端只在 `latestJob.id` 出现后才订阅造成的早期事件丢失问题；
- 把已经写好但从未渲染的 `AgentReasoningSubTimeline` 接入右栏 active 节点；
- 修掉 `BlueprintSocketRelay.handleEvent` 中“房间为空就丢弃事件”的早返回，避免订阅前/订阅瞬间的事件被丢；
- 给 `forceAdvance` 5 分钟超时与 spec_tree 的“禁止自动推进”这两条已存在但未回归的契约补上守门测试与说明。

非目标：

- 不改 `agent-reasoning-bridge.ts` / `callback-receiver.ts` / `lite-agent-runtime.ts` / `llm-call.ts` 的事件语义；
- 不引入新的 SSE 通道与 IndexedDB 持久化；
- 不重新设计驾驶舱信息架构与视觉，只补“看得见”的最小闭环；
- 不扩展 5140+ 既有测试集（保持基线），不扩张 113 的 TS 基线错误数。

## 术语表

- **Stage progress emitter**：`server/routes/blueprint/stage-progress-emitter.ts` 中导出的 `createStageProgressEmitter(eventBus, key, stageId, roleId)`，向 `BlueprintEventBus` 发射 `role.agent.thinking|acting|observing|completed|error|iteration_started` 一族事件。
- **Socket relay**：`server/routes/blueprint/socket-relay.ts` 中的 `BlueprintSocketRelay`，订阅 eventBus 并按 `blueprint:${jobId}` room 转发事件给前端。
- **Realtime store**：`client/src/lib/blueprint-realtime-store.ts` 暴露的 `useBlueprintRealtimeStore`，提供 `subscribe(jobId)` / `unsubscribe()` 与 `agentReasoning` slice。
- **Sub-timeline**：`AutopilotRightRail.tsx` 内的 `AgentReasoningSubTimeline`，从 store 读 `agentReasoning.entries` 双轨渲染。
- **Stream key**：emitter 用来生成 `event.jobId` 字段的字符串。当前 clarification / route 阶段的 stream key 是 `intake.id`，spec_docs 阶段的 stream key 是真正的 `BlueprintGenerationJob.id`。
- **Subscription key**：前端 store `subscribe(...)` 传入的字符串，决定 socket join 哪个 `blueprint:${...}` room。
- **forceAdvance**：`client/src/pages/autopilot/right-rail/hooks/use-auto-advance.ts` 中“用户手动确认 spec_tree 后推进到 spec_docs”的入口，包含 5 分钟前端超时保护。

## 需求

### 需求 1：订阅时机覆盖 clarification / route 阶段

**用户故事：** 作为正在等待澄清问题的用户，我希望从输入仓库 URL 开始就能看到分析仓库的 thinking / acting 过程，而不是等到 spec_docs 阶段才有进度。

#### 验收标准

1. WHEN 用户在 `AutopilotRoutePage` 上发起 `POST /api/blueprint/intake/:intakeId/clarifications` 请求, THE Realtime_Store SHALL 在该请求返回前完成对 stream key `intake.id` 的订阅。
2. WHEN clarification 阶段的 stage progress emitter 发射 `role.agent.thinking | acting | observing | completed` 事件, THE Sub_Timeline SHALL 在 active 节点内接收并渲染该事件，前提是 `intake.id` 已被订阅。
3. WHEN 用户继续触发 `POST /api/blueprint/generations`（route 生成）, THE Realtime_Store SHALL 在 `latestJob.id` 出现前继续以 `intake.id` 作为订阅键，从而接收 route_generation 阶段以 `resolved.request.intakeId` 为 stream key 的事件。
4. WHEN `latestJob.id` 首次被设置且与当前 stream key 不同, THE Realtime_Store SHALL 切换订阅到 `latestJob.id`，并在切换前清空 `agentReasoning` 切片。
5. WHERE 当前阶段为 spec_docs 或 spec_tree, THE Realtime_Store SHALL 仅订阅 `latestJob.id`，不再持有 `intake.id` 的订阅。
6. IF `intake.id` 与 `latestJob.id` 同时为空, THEN THE Realtime_Store SHALL 不发起任何订阅，并保持 `agentReasoning.status` 为 `idle`。

> 决策记录（订阅时机）：在 A、B、C 三种方案中采用方案 A — “以 `intakeId` 早订阅，`latestJob.id` 出现后切换到 `jobId`”。理由：A 复用现有 emitter 的 stream key，无需改服务端发射逻辑；B 需要新增 SSE 或轮询通道并在前端做事件归并，会扩大 5140+ 测试集与 TS 基线；C 直接放弃 clarification / route 阶段的可见性，与用户故事冲突。Trade-off：A 在 `latestJob.id` 切换时会丢失同瞬间的少量事件，由需求 3 的 relay 早返回修复 + 需求 1.4 的清空策略联合兜底。

### 需求 2：右栏 active 节点渲染 Agent 推理子时间线

**用户故事：** 作为正在驾驶舱内观察当前阶段进展的用户，我希望在右栏 active 节点内部直接看到双轨推理流，而不是要打开独立调试面板。

#### 验收标准

1. WHEN `AutopilotRightRail` 处于 `currentStage === "fabric"` 且某子阶段被判定为 `active`, THE Right_Rail SHALL 在该子阶段卡片内部渲染 `AgentReasoningSubTimeline`。
2. WHEN `AgentReasoningSubTimeline` 从 store 读取到 `agentReasoning.entries.length === 0` 且 `status === "idle"`, THE Sub_Timeline SHALL 不渲染任何容器（保持折叠态，不抢占布局）。
3. WHEN `agentReasoning.entries` 中存在至少一条 `phase ∈ {thinking, acting, observing, error, completed}`, THE Sub_Timeline SHALL 以左轨展示 `thinking`、右轨展示 `acting | observing`、跨双轨横幅展示 `error | completed`。
4. WHEN `entries` 长度变化, THE Sub_Timeline SHALL 滚动到最新一条；其它非 fabric 阶段不渲染该子时间线。
5. THE Sub_Timeline SHALL 复用既有 `useBlueprintRealtimeStore` 选择器读取 entries，不引入第二份事件存储。
6. IF `currentStage !== "fabric"`, THEN THE Right_Rail SHALL 不挂载 `AgentReasoningSubTimeline`。

### 需求 3：Socket relay 在订阅前/订阅瞬间不丢事件

**用户故事：** 作为开发者，我希望服务端发出的事件在房间还没有订阅者时也能被路由到当前订阅了该 jobId 的 socket，避免“点击太快就什么都看不到”。

#### 验收标准

1. WHEN `BlueprintSocketRelay.handleEvent` 收到 `event.jobId` 合法且家族属于默认推送列表的事件, THE Socket_Relay SHALL 调用 `io.to(\`blueprint:${event.jobId}\`).emit(...)`，无论该 room 当前是否存在订阅者。
2. WHEN 某 socket 已经 `join('blueprint:${jobId}')`, THE Socket_Relay SHALL 在该 socket 上接收到此后所有该 jobId 的事件。
3. WHILE 某 jobId 没有任何 socket 订阅, THE Socket_Relay SHALL 在 `io.to(...).emit(...)` 时由 socket.io 自动丢弃，但不应再有 “roomSockets size === 0 显式 return” 的早返回阻断。
4. THE Socket_Relay SHALL 维持现有家族过滤（`role / capability / crew / job / evidence / sandbox`）与 jobId 校验（非空、≤128）逻辑不变。
5. WHERE 事件家族为 `capability`, THE Socket_Relay SHALL 继续走 100ms 批量聚合通道；其它家族继续走单条 `blueprint:event` 推送通道。
6. IF 一个事件没有任何 socket 订阅, THEN THE Socket_Relay SHALL 不主动缓存事件以等待后续订阅者（不引入新缓存）。

### 需求 4：forceAdvance 5 分钟超时回归保护

**用户故事：** 作为已经点过“确认 SPEC 树并生成规格文档”的用户，我希望即使后端在 5 分钟内没有任何响应，UI 也能解锁，并允许我手动重试，而不是永远卡在 “推进中…”。

#### 验收标准

1. WHEN 用户点击 `timeline-confirm-advance` 触发 `forceAdvance`, THE Force_Advance SHALL 在 5 分钟内未拿到结果时把 `advancing` 重置为 `false` 并暴露 `error` 文案 `请求超时`。
2. WHEN 超时被触发, THE Force_Advance SHALL 不再回调 `onAdvanced`，避免后端实际成功后又被前端误以为失败时重复推进。
3. WHEN 后端在超时前返回 `result.ok === true`, THE Force_Advance SHALL 清掉超时定时器并按既有逻辑调用 `onAdvanced`。
4. WHEN 后端在超时前返回 `result.ok === false`, THE Force_Advance SHALL 清掉超时定时器，把 `advancing` 重置为 `false`，并暴露 `result.error`。
5. THE Force_Advance SHALL 在组件卸载（`mountedRef.current === false`）时不调用任何 `set*` 状态更新。
6. IF `advancing` 已经为 `true`, THEN THE Force_Advance SHALL 在用户再次点击时直接早返回，不发起第二次请求。

### 需求 5：spec_tree 阶段不自动推进

**用户故事：** 作为审核 SPEC 树的用户，我希望在确认前 SPEC 树不会被悄悄推进到 spec_docs，避免错过查看节点列表的机会。

#### 验收标准

1. WHILE `job.stage === "spec_tree"`, THE Auto_Advance SHALL 不向 spec_docs 阶段自动发起请求，无论 `job.status` 取值为 `running | reviewing | completed`。
2. WHEN 用户点击 `timeline-confirm-advance` 时 `job.stage === "spec_tree"`, THE Auto_Advance SHALL 通过 `forceAdvance` 路径调用 `generateBlueprintSpecDocuments`。
3. WHEN spec_docs 阶段进入 `completed` 状态, THE Auto_Advance SHALL 按既有规则自动推进到 effect_preview，spec_tree 的“手动”契约不影响后续阶段的自动推进。
4. THE Auto_Advance SHALL 在文档（design 与 tasks）中显式记录 spec_tree 的“手动确认”契约，便于后续维护者识别。
5. IF spec_tree 阶段在 `forceAdvance` 之前再次被 SSE 写入 `reviewing` 状态, THEN THE Auto_Advance SHALL 保持 `advancing === false`，不在 effect 内发起 spec_docs 调用。

## 非功能需求

### NFR-1：测试集与 TS 基线

1. THE Implementation SHALL 不破坏当前仓内 5140+ 测试用例（既有 `vitest run` 全绿基线）。
2. THE Implementation SHALL 不扩张 `node --run check` 当前 113 错误的 TS 基线错误数。
3. THE Implementation MAY 仅新增本规格相关的最小回归测试，且每条测试与 5140+ 既有测试不发生覆写。

### NFR-2：注释与文案语言

1. THE Implementation SHALL 使本规格涉及到的 JSDoc 与代码内注释统一使用中文，与 `server/routes/blueprint/*.ts` 与 `client/src/pages/autopilot/*.tsx` 周边文件保持一致。
2. THE Implementation SHALL 不在新增中文注释里夹带与功能无关的市场化措辞。

### NFR-3：构建目标与流式开关

1. WHILE `process.env.BUILD_TARGET === "test"`, THE Implementation SHALL 把 `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED` 视为 `false`，即流式不在 test 构建中默认打开。
2. THE Implementation SHALL 不在 test 构建之外（`dev` / `production`）通过环境变量回退方式悄悄关闭流式，需保持原有默认开启行为。

### NFR-4：测试方法

1. THE Implementation SHALL 仅采用基于具体示例（example-based）的回归测试，不引入新的 property-based testing 用例。
2. THE Implementation SHALL 在新增的回归测试中显式断言订阅时机、relay 不丢弃、子时间线挂载、5 分钟超时与 spec_tree 不自动推进这五个最小事实。

### NFR-5：禁止修改的源文件

1. THE Implementation SHALL NOT 修改 `server/routes/blueprint/agent-reasoning-bridge.ts`。
2. THE Implementation SHALL NOT 修改 `server/routes/blueprint/callback-receiver.ts`（如存在该模块的等价实现）。
3. THE Implementation SHALL NOT 修改 `lite-agent-runtime.ts` 与 `llm-call.ts` 的事件发射或调用语义。
4. WHERE 上述模块需要细化语义, THE Implementation SHALL 通过本规格之外的独立任务推进，而不是隐式改动。

### NFR-6：兼容性

1. THE Implementation SHALL 保持 `BlueprintSocketRelay` 既有家族过滤集合 `role / capability / crew / job / evidence / sandbox` 不变。
2. THE Implementation SHALL 保持 `useBlueprintRealtimeStore` 现有 `subscribe / unsubscribe / dispatchEvent / reset` API 形状不变；如需扩展只允许新增可选字段。
3. THE Implementation SHALL 保持 `AgentReasoningSubTimeline` 不渲染独立路由，仅在 `AutopilotRightRail` active 节点内被组合调用。
