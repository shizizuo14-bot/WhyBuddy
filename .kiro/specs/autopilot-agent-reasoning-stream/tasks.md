# Tasks

基于 `design.md` 的 14 个文件与 18 个例子测试，切分为可并行推进的原子任务。依赖关系在每节首行标注；子任务为执行级别指令，原则上一次 sub-agent 调用完成一个子任务。

- **禁 PBT（no `fast-check`）**，所有测试全部 example-based Vitest。
- **不扩大 TS 基线 113 个错误**，新增代码必须完整类型、不用 `any`。
- **不修改** 5 条 bridge / `RoleAgentDelegator` / `RoleAgentRuntime` / `LiteAgentRuntime` / `CallbackReceiver` 的内部实现。
- **`BUILD_TARGET=test` 下 env flag 强制 false**，既有 5140+ 测试默认兼容。
- **中文注释 / 中文 commit message** 统一。

## Task 1: Shared types — `AgentReasoningEntry` 与 Layer 4 合约（无依赖）

- [x] 1.1 新建 `shared/blueprint/agent-reasoning.ts`，顶部加中文 docstring 引用 spec 名 `autopilot-agent-reasoning-stream`
- [x] 1.2 导出 `AgentReasoningPhase` union：`"thinking" | "acting" | "observing" | "iteration_started" | "iteration_completed" | "error" | "completed"`
- [x] 1.3 导出 `AgentReasoningEntry` interface，含必填 `id / jobId / iteration / iterationLabel / phase / timestamp` 与可选 `thought / actionToolId / observationSuccess / observationSummary / error / degraded / reason / tokensUsed / budgetRemaining`
- [x] 1.4 导出 `buildEntryFromSocketEvent(event: BlueprintGenerationEvent): AgentReasoningEntry | null`，按 `event.type` 字面量分支构造 entry，非 `role.agent.*` 事件返回 `null`
- [x] 1.5 验证新文件通过 `node --run check`，TS 基线不超过 113

## Task 2: Event catalog — `role.agent.*` 7 个新事件（依赖 Task 1）

- [x] 2.1 在 `shared/blueprint/events.ts` 的 `BlueprintGenerationEventType` union 追加 7 个字面量：`role.agent.iteration_started / role.agent.thinking / role.agent.acting / role.agent.observing / role.agent.iteration_completed / role.agent.error / role.agent.completed`
- [x] 2.2 若文件内有枚举型常量表（如 `BlueprintEventName`），同步补齐 7 项
- [x] 2.3 确认 `resolveBlueprintEventFamily` 的分词规则按第一个 `.` 前缀截取，7 个新事件自动归入 `"role"` 家族；若非此算法则加显式映射
- [x] 2.4 不修改 `BlueprintSocketRelay.DEFAULT_RELAY_FAMILIES`（应已包含 `"role"`），仅补充一个回归断言测试（`role.agent.thinking → "role"`）置于 events.test.ts 或等价位置
- [x] 2.5 扩展既有 `BlueprintGenerationEvent` payload 类型（discriminated union 或开放字段），允许可选 `iteration / roleId / stageId / thought / actionToolId / observationSuccess / observationSummary / error / degraded / reason / tokensUsed / budgetRemaining` 字段，不扩大 TS 基线

## Task 3: Diagnostics store — `agentReasoningBridge` bridge id（依赖 Task 2）

- [x] 3.1 修改 `server/routes/blueprint/runtime-enablement/diagnostics-store.ts`，在 `BridgeId` union 追加 `"agentReasoningBridge"`
- [x] 3.2 新增 `AgentReasoningBridgeDiagnostics` interface：`{ bridgeId: "agentReasoningBridge"; enabled: boolean; totalForwarded: number; droppedEntryCount: number; lastEventAt?: string; lastEventType?: string }`
- [x] 3.3 在 store 内部加 3 个新方法：`recordAgentReasoningForwarded(eventType, now) / recordAgentReasoningDropped() / setAgentReasoningEnabled(enabled)`，更新对应 counter 与 last\* 字段
- [x] 3.4 snapshot 逻辑：`bridges` 对象 key 顺序保持既有 7 种不变，`agentReasoningBridge` 追加到末尾；env off 时返回 `{ enabled: false, totalForwarded: 0, droppedEntryCount: 0 }`
- [x] 3.5 在 `server/routes/blueprint/runtime-enablement/diagnostics-store.test.ts` 追加 3 个例子测试：`enabled=false 默认` / `forwarded 递增 + lastEventType 更新` / `dropped 递增与 forwarded 独立`
- [x] 3.6 确认 `roleAutonomousAgent.totalInvocations` 不受本 task 影响；`GET /api/blueprint/diagnostics` 响应结构向后兼容

## Task 4: Bridge 本体 —  `createAgentReasoningBridge`（依赖 Task 1, Task 2, Task 3）

- [x] 4.1 新建 `server/routes/blueprint/agent-reasoning-bridge.ts`，顶部加中文 docstring 引用 spec 名
- [x] 4.2 定义 `AgentReasoningBridgeDeps` 与 `AgentReasoningBridgeHandle` 接口；导出 `createAgentReasoningBridge` 工厂
- [x] 4.3 实现 env-off 路径：`BLUEPRINT_AGENT_REASONING_STREAM_ENABLED !== "true"` 或 `BUILD_TARGET === "test"` 或 `deps.callbackReceiver == null` → `start/stop` 为 no-op，`getDiagnostics()` 返回 `{ enabled: false, totalForwarded: 0, droppedEntryCount: 0 }`
- [x] 4.4 实现 env-on 路径：`start()` 调用 `callbackReceiver.onProgress(listener)`，保存 unsubscribe handle；`stop()` 释放；两者可重入（已启动/已停止时再次调用为 no-op）
- [x] 4.5 实现 `forward(event)` listener：try 构造 `BlueprintGenerationEvent`（`role.agent.*`）→ emit 到 `eventBus` → 递增 `totalForwarded`；catch 异常 → `logger.debug(...)` + 递增 `droppedEntryCount`，不重抛
- [x] 4.6 实现 Layer 2 → Layer 3 映射（按 design §Layer 2→3 表）：8 种 `AgentProgressEvent.type` 分别映射到对应 `role.agent.*`；`agent.failed`/`agent.aborted` 都映射到 `role.agent.error` 并填 `degraded / reason` 字段
- [x] 4.7 实现脱敏：`thought` 走 `sanitizeTraceEntries` 既有凭证模式 + 280 UTF-8 字符截断 + `...` 省略号标记；`action.params` 丢弃只留 `toolId`；`observation.result` 丢弃只留 `success` + 200 UTF-8 摘要；`error.message` 截断到 200 UTF-8 不含 stack
- [x] 4.8 对接 `runtimeDiagnostics`：成功 forward 时调用 `recordAgentReasoningForwarded`，catch 分支调用 `recordAgentReasoningDropped`；`start()` 调用 `setAgentReasoningEnabled(true)`，`stop()` 调用 `setAgentReasoningEnabled(false)`
- [x] 4.9 确保 bridge **不修改** `RoleAgentDelegator / RoleAgentRuntime / LiteAgentRuntime / CallbackReceiver` 的任何内部实现；通过 interface-only 消费

## Task 5: Bridge 测试 —  `agent-reasoning-bridge.test.ts`（依赖 Task 4）

- [x] 5.1 新建 `server/routes/blueprint/agent-reasoning-bridge.test.ts`，顶部加中文 docstring
- [x] 5.2 写 mock helper：`createMockCallbackReceiver()` 返回 `{ onProgress, __invoke(event) }`；`createMockEventBus()` 返回 `{ emit: vi.fn(), subscribe: vi.fn() }`
- [x] 5.3 测试 1：env-flag-off → `start/stop` no-op，`onProgress` 未被调用，`eventBus.emit` 未被调用
- [x] 5.4 测试 2：`callbackReceiver=undefined` → no-op，与测试 1 等价但由注入缺失触发
- [x] 5.5 测试 3：`agent.thinking` event → `emit` 被调用一次，payload 含脱敏 `thought`（≤280 chars，凭证字串被替换）
- [x] 5.6 测试 4：`agent.acting` event → `emit` payload 只含 `actionToolId`，不含 `params`
- [x] 5.7 测试 5：`agent.failed` event → `emit` payload 是 `role.agent.error` 且 `degraded:true`；`agent.aborted` 同理但 `degraded:false` + `reason:"用户取消"`
- [x] 5.8 测试 6：listener 内部强行抛错（mock `emit` throw）→ `droppedEntryCount` 递增，后续 event 仍能正常 forward
- [x] 5.9 运行 `vitest run server/routes/blueprint/agent-reasoning-bridge.test.ts` 全部通过

## Task 6: Context 与装配 — `server/index.ts` 与 `context.ts`（依赖 Task 4）

- [x] 6.1 检查 `server/routes/blueprint/context.ts` 的 `BlueprintServiceContext` 是否暴露 `callbackReceiver`；若未暴露则补 optional 字段并保持向后兼容（不破坏既有 test）
- [x] 6.2 在 `server/index.ts` 加一段 env-flag-gated 装配：仅当 `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED === "true"` 且 `BUILD_TARGET !== "test"` 时动态 `import()` `createAgentReasoningBridge` 并 `.start()`
- [x] 6.3 装配时把 `blueprintServiceContext.eventBus / callbackReceiver / roleAgentDelegator / logger / () => new Date()` 注入 bridge；同步调用 `runtimeDiagnostics.setAgentReasoningEnabled(true)`
- [x] 6.4 确保既有 `dev:all` 启动日志中能出现一条 `[blueprint] agentReasoningBridge enabled` 或同类提示（参考既有其他 bridge 装配日志风格）
- [x] 6.5 env-off 情况下 `server/index.ts` 路径必须与当前行为 bit-for-bit 一致（无新增 import side effect，无 eager 装配）

## Task 7: `.env.example` 环境变量登记（依赖 Task 4）

- [x] 7.1 在 `.env.example` 追加条目：`BLUEPRINT_AGENT_REASONING_STREAM_ENABLED=false`
- [x] 7.2 紧邻处加中文注释：说明用途、默认关闭、`BUILD_TARGET=test` 强制关、引用本 spec 名 `autopilot-agent-reasoning-stream`
- [x] 7.3 检查其他环境变量示例文件（`.env.development.example` 等若存在）同步追加一致条目

## Task 8: Store slice — `BlueprintRealtimeStore.agentReasoning`（依赖 Task 1, Task 2）

- [x] 8.1 修改 `client/src/lib/blueprint-realtime-store.ts`，导入 `AgentReasoningEntry / AgentReasoningPhase / buildEntryFromSocketEvent`
- [x] 8.2 在 store state 追加 `agentReasoning: { jobId: string | null; entries: AgentReasoningEntry[]; currentIteration: number; status: "idle" | "streaming" | "completed" | "failed" | "aborted" }`，初始 `{ jobId: null, entries: [], currentIteration: 0, status: "idle" }`
- [x] 8.3 在 `dispatchEvent` 中新增 `role.agent.*` 分支：调用 `buildEntryFromSocketEvent` 构造 entry，push 到 `entries`，FIFO 截断到 ≤500；注意该分支必须 fallthrough 或并行写入既有 `logEntries` 逻辑，保证 `BlueprintLogStream` 继续工作
- [x] 8.4 派生 `currentIteration`：`role.agent.iteration_started` → 更新为 `event.iteration`；其他事件不改
- [x] 8.5 派生 `status`：`iteration_started → "streaming"` / `completed → "completed"` / `error + reason==="用户取消" → "aborted"` / `error 其他 → "failed"`
- [x] 8.6 修改 `subscribe(jobId)`：当 `jobId` 变化时清空 `agentReasoning` 回到初始态；`jobId` 不变（Socket 重连）时保留既有 entries
- [x] 8.7 确保 `logEntries` 200-cap、`agentProgress` 50-cap、`rolePhases`、`capabilityStatuses` 的既有行为与字段 shape 完全不变

## Task 9: Store 测试 — `blueprint-realtime-store.agent-reasoning.test.ts`（依赖 Task 8）

- [x] 9.1 新建 `client/src/lib/__tests__/blueprint-realtime-store.agent-reasoning.test.ts`，顶部中文 docstring
- [x] 9.2 测试 1：`role.agent.thinking` event dispatch → `entries.length===1`，entry 字段与 sanitized payload 对应
- [x] 9.3 测试 2：连续 dispatch 超过 500 条 → FIFO 截断，最旧被 shift；同时 `logEntries.length` 不超过 200（既有 cap 不受影响）
- [x] 9.4 测试 3：`subscribe("job-A")` 后 dispatch 多条 → `subscribe("job-B")` → `agentReasoning.entries === []`，`status === "idle"`
- [x] 9.5 测试 4：`iteration_started iteration=1` → `currentIteration===1`，`status==="streaming"`；后续 `iteration_started iteration=2` → `currentIteration===2`
- [x] 9.6 测试 5：dispatch `role.agent.error` with `reason:"用户取消"` → `status==="aborted"`；单独 `role.agent.error` with 其他 reason → `status==="failed"`；`role.agent.completed` → `status==="completed"`
- [x] 9.7 运行 `vitest run client/src/lib/__tests__/blueprint-realtime-store.agent-reasoning.test.ts` 全部通过

## Task 10: CSS keyframes — `reasoning-ripple`（依赖 无）

- [x] 10.1 修改 `client/src/index.css`（或等价全局样式入口），追加 `@keyframes reasoning-ripple` 规则：`0% { scale(0.8), opacity:1, border-color:#ccc } → 100% { scale(2.5), opacity:0, border-color:#eaeaea }`
- [x] 10.2 追加 `@media (prefers-reduced-motion: reduce)` 规则确保 ripple 动画可被禁用（utility class `.reasoning-ripple-disable` 或通过组件内条件 style 控制，任选其一）
- [x] 10.3 不修改既有任何 CSS 规则，仅追加；确认构建通过

## Task 11: Timeline UI — `AgentReasoningTimeline.tsx`（依赖 Task 8, Task 10）

- [x] 11.1 新建 `client/src/components/blueprint/AgentReasoningTimeline.tsx`，顶部中文 docstring
- [x] 11.2 定义 Props：`{ jobId: string; className?: string }`；通过 `useBlueprintRealtimeStore((s) => s.agentReasoning)` 读取 slice
- [x] 11.3 实现 `useReducedMotion()` 本地 hook：`useEffect` + `window.matchMedia("(prefers-reduced-motion: reduce)")` + listener
- [x] 11.4 实现 `<PulseRingPlaceholder>` 子组件：绝对居中、32×32px 环、`reasoning-ripple` 2s infinite、文案「等待第一条思考...」；reduced-motion 下 `animation:none`
- [x] 11.5 实现 `<ReasoningCard>` 子组件：Framer Motion `motion.div`，`initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.4, ease:[0.165,0.84,0.44,1]}}`；reduced-motion 下 `initial=false` 且 `duration=0`；按 `column` prop 设 `gridColumn: "1" | "3"`
- [x] 11.6 实现 `<ReasoningBanner>` 子组件：`gridColumn: "1 / -1"` 横跨，`error/completed` 分别走红系/绿系配色（按 Req 6.2 + design §AgentReasoningTimeline）
- [x] 11.7 主容器 CSS Grid `grid-cols-[1fr_2px_1fr]`，axis 线绝对定位；按 iteration 分组后每组开头插入 iteration 分隔线 `<div class="iteration-separator">#${iteration}</div>`
- [x] 11.8 Entries 分派：`thinking → <ReasoningCard column="left">` / `acting|observing → <ReasoningCard column="right">` / `error|completed → <ReasoningBanner>` / `iteration_started|iteration_completed → 不渲染独立卡，仅驱动分组`
- [x] 11.9 Autoscroll 逻辑：`useRef` 拿容器 + scroll listener 算 `scrollHeight - scrollTop - clientHeight` 与 32 比较设 `atBottom`；`useEffect` 监 `entries.length` 变化，`atBottom===true` 时 `requestAnimationFrame` 把 `scrollTop` 推到 `scrollHeight`
- [x] 11.10 `<LatestButton>` 浮动按钮：`!atBottom` 时渲染右下角；点击后 `scrollTo({ top: scrollHeight, behavior: "smooth" })` 恢复贴底
- [x] 11.11 终态可见性：`status === "completed" | "failed" | "aborted"` 时，终态 banner 调用 `scrollIntoView({ block: "nearest" })` 确保可见，但不改 `atBottom` 状态
- [x] 11.12 重连 chip：当 `connectionState === "reconnected"` 且 `entries.length === 0` 时在 Timeline 顶部渲染 chip「仅显示重新连接后的推理流」
- [x] 11.13 组件 unmount 时清理 scroll listener；不保留 interval / timer

## Task 12: Timeline 测试 — `AgentReasoningTimeline.test.tsx`（依赖 Task 11）

- [x] 12.1 新建 `client/src/components/blueprint/__tests__/AgentReasoningTimeline.test.tsx`，顶部中文 docstring
- [x] 12.2 提供 `matchMedia` mock helper；提供 `createStoreWithReasoning(entries, status)` helper 通过 `useBlueprintRealtimeStore.setState` 注入测试态
- [x] 12.3 测试 1：空 state（`entries.length === 0` 且 `status === "idle"`）→ 渲染 PulseRingPlaceholder，文案含「等待第一条思考」
- [x] 12.4 测试 2：`prefers-reduced-motion: reduce` → PulseRingPlaceholder 的 `animation` 样式为 `none`（或 class 含 disable）
- [x] 12.5 测试 3：用户位于底部，dispatch 新 entry → 容器 `scrollTop` 被更新到 `scrollHeight`（JSDOM 下用 `Object.defineProperty` mock `scrollHeight` / `scrollTop` / `clientHeight`）
- [x] 12.6 测试 4：用户手动 `scrollTop = scrollHeight - 100`（> 32px 阈值）→ 新 entry 不触发 autoscroll；`<LatestButton>` 渲染；点击后 `scrollTop` 被重置到 `scrollHeight`
- [x] 12.7 测试 5：`phase:"thinking"` entry → 找到对应 DOM 节点，验证 `gridColumn` style 或等价属性为左列
- [x] 12.8 测试 6：`phase:"acting"` + `phase:"observing"` entries → 均渲染在右列
- [x] 12.9 测试 7：`phase:"error"` entry → 渲染为 banner，`gridColumn` 横跨三列，视觉 class 含红系；`phase:"completed"` → 横跨三列，视觉 class 含绿系
- [x] 12.10 运行 `vitest run client/src/components/blueprint/__tests__/AgentReasoningTimeline.test.tsx` 全部通过

## Task 13: 集成回归与基线守护（依赖 Task 5, Task 9, Task 12）

- [x] 13.1 运行 `node --run check` 确认 TS 基线仍为 113 或更少；若新增错误则回退到对应 task 修正
- [x] 13.2 运行 `vitest run server` 全量确认 server 既有测试无回归，agent-reasoning-bridge + diagnostics-store 新测试通过
- [x] 13.3 运行 `vitest run client/src` 全量确认 client 既有测试无回归，store + timeline 新测试通过
- [x] 13.4 确认 `BUILD_TARGET=test` 下 `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED` 即使被置为 `"true"` 也不会激活 bridge（通过一条专项回归测试或手动 stubEnv 验证）
- [x] 13.5 文档与 steering：若 `.kiro/steering/execution-plan.md` 或等价工程计划文档需要更新，追加本 spec 的 completion entry；否则略过

## 交付判定

- 所有子任务勾选为 `[x]`
- `node --run check` TS 错误数 ≤ 113（基线不扩大）
- 所有新测试 18 个（6 bridge + 5 store + 7 timeline）全部通过
- 既有 5140+ server 测试无回归
- `GET /api/blueprint/diagnostics` 在 env-on 下 `bridges.agentReasoningBridge` 有真实计数；env-off 下为 `{ enabled: false }`
- 真机环境 `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED=true` 下打开 blueprint 页，提交 github 目标后右侧面板按 design 规格流式出现 Think/Act/Observe 卡片
