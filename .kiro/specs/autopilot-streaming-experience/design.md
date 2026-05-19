# 设计文档：Autopilot 流式体验补完

## 概述

本设计在不改动事件源（`agent-reasoning-bridge.ts`、`callback-receiver.ts`、`lite-agent-runtime.ts`、`llm-call.ts`）的前提下，把已经存在的脚手架按下面四条主线接通：

1. **订阅时机修复**：在 `AutopilotRoutePage` 内引入“intakeId 早订阅 → jobId 晚切换”的两段式订阅生命周期，覆盖 clarification / route_generation 阶段；
2. **子时间线挂载**：把现有 `AgentReasoningSubTimeline` 真正渲染进 `AutopilotRightRail` 的 active 节点；
3. **Relay 不丢事件**：移除 `BlueprintSocketRelay.handleEvent` 中“房间为空就 return”的早返回，让事件依靠 socket.io 的 `to(room).emit` 自动路由；
4. **死锁兜底契约**：把 `forceAdvance` 5 分钟超时与 spec_tree“禁止自动推进”这两条已经存在的实现以测试形式锁定，并在文档里说明契约。

整套改动只触达：

- `server/routes/blueprint/socket-relay.ts`（一行 if 判断 + 注释；不改公开类型）
- `client/src/pages/autopilot/AutopilotRoutePage.tsx`（两段式订阅 useEffect + 调用顺序）
- `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`（确认 active 节点已经渲染 `AgentReasoningSubTimeline`，必要时补条件渲染说明）
- `client/src/pages/autopilot/right-rail/hooks/use-auto-advance.ts`（仅作为契约对象，不改实现，写测试覆盖）
- 新增最少量的 example-based vitest 用例（不扩张 PBT，不扩张 5140+ 既有测试）。

## 架构

### 端到端事件流

```mermaid
flowchart LR
    subgraph Server [server/routes/blueprint]
        EM["createStageProgressEmitter\nstage = clarification | route_generation | spec_docs\nstreamKey = intakeId | jobId"]
        BUS[BlueprintEventBus]
        RELAY["BlueprintSocketRelay.handleEvent\n(family + jobId 校验)"]
    end

    subgraph Wire [Socket.IO]
        ROOM["room: blueprint:${streamKey}"]
    end

    subgraph Client [client/src]
        STORE["useBlueprintRealtimeStore\nsubscribe(streamKey)"]
        SLICE[agentReasoning slice]
        RAIL["AutopilotRightRail\nactive 节点"]
        SUB["AgentReasoningSubTimeline\n双轨布局"]
    end

    EM -- emit --> BUS
    BUS -- subscribe --> RELAY
    RELAY -- "io.to(room).emit" --> ROOM
    ROOM -- blueprint:event / blueprint:batch --> STORE
    STORE --> SLICE
    SLICE --> SUB
    RAIL -- 仅在 fabric & active 时挂载 --> SUB
```

关键事实：

- 服务端发射器在 clarification / route_generation 阶段以 `intake.id` 作为 `event.jobId`（即“stream key”），spec_docs 阶段以 `BlueprintGenerationJob.id` 作为 stream key。
- 前端 socket join 的 room 名只取决于 `subscribe(streamKey)` 传入的字符串，与“它是 intakeId 还是 jobId”无关。
- 所以**修复点是前端的订阅生命周期，不是服务端的事件键**。

### 订阅生命周期状态机

```mermaid
stateDiagram-v2
    [*] --> Idle: page mount, intake = null, job = null
    Idle --> EarlyIntake: setIntake(intake)
    EarlyIntake --> EarlyIntake: clarification / route 事件流入
    EarlyIntake --> Job: setLatestJob(job), job.id !== intake.id
    EarlyIntake --> Idle: page unmount
    Job --> Job: spec_tree / spec_docs / preview 事件流入
    Job --> Idle: page unmount
    EarlyIntake --> EarlyIntake: setLatestJob(job), job.id === intake.id
```

切换 `EarlyIntake → Job` 时：

1. 先 `unsubscribe()` 当前 intake room；
2. 把 `agentReasoning` 切片重置为初始空态（`subscribe(jobId)` 内部已经实现这一步，见 `blueprint-realtime-store.ts` 的 `subscribe` 分支）；
3. 再 `subscribe(jobId)`。

> 注：现有 `useBlueprintRealtimeStore.subscribe` 已经在 `state.subscribedJobId !== jobId` 时先 `unsubscribe` 再切换，并清空 `agentReasoning` 切片。所以前端只需要保证“先用 intakeId、后用 jobId”这一条调用顺序，不需要新加 store action。

## 组件与接口

### 1. `AutopilotRoutePage`：两段式订阅 useEffect

替换当前唯一的“仅订阅 latestJob.id”的 useEffect，改为：

```tsx
// 中文 JSDoc：autopilot-streaming-experience 流式订阅生命周期
const subscribeToJob = useBlueprintRealtimeStore(s => s.subscribe);
const unsubscribeFromJob = useBlueprintRealtimeStore(s => s.unsubscribe);

useEffect(() => {
  // 优先使用 jobId，没有 jobId 时退回到 intakeId
  const streamKey = latestJob?.id ?? intake?.id ?? null;
  if (!streamKey) return;
  subscribeToJob(streamKey);
  return () => {
    // 当 streamKey 改变（intake → job 切换）或组件卸载时退订
    unsubscribeFromJob();
  };
}, [latestJob?.id, intake?.id, subscribeToJob, unsubscribeFromJob]);
```

要点：

- 用 `latestJob?.id ?? intake?.id` 派生唯一 streamKey，让 React 在依赖变化时自然走 cleanup → 重新订阅；
- `subscribe` 内部已经按 jobId 比较做幂等，因此 `intake.id === latestJob.id` 这种极少见的退化也不会双订阅；
- 不在 `setLatestJob` 处显式调用 `subscribe`，让派生关系单向。

### 2. `AutopilotRightRail`：active 节点渲染 `AgentReasoningSubTimeline`

当前 `AutopilotRightRail.tsx` 已经在 active 子阶段卡片内调用 `<AgentReasoningSubTimeline locale={locale} />`，但 `AgentReasoningSubTimeline` 在 `entries.length === 0` 时返回 `null`，加上之前订阅时机错位，导致用户**看到的还是空 active 节点**。本规格不重写双轨渲染，只保证：

- `AgentReasoningSubTimeline` 在 `currentStage !== "fabric"` 时不被挂载（已有逻辑，需在测试中覆盖）；
- `AgentReasoningSubTimeline` 在 `entries.length === 0 && status === "idle"` 时返回 `null`，避免占位空容器；
- 在 `entries.length > 0` 时渲染左轨 thinking、右轨 acting+observing、跨双轨横幅 error+completed（已有实现）。

测试需要覆盖的渲染语义见 `tasks.md` 任务 2.x。

### 3. `BlueprintSocketRelay`：移除“房间为空就丢”的早返回

`socket-relay.ts` 当前在 `handleEvent` 内部、批量推送的 `flushBatch` 内部各有一处早返回：

- `flushBatch` 内的早返回是合理的：批量缓冲只在已有过订阅但 socket 离开后才会有数据，丢弃缓冲不会造成订阅前事件丢失。保留。
- `handleEvent` 内单条事件路径上的早返回（约第 200 行附近）是**bug**：它在订阅前一瞬间到达的事件会被静默丢掉。修复方案：

```ts
// 修改前
const room = `blueprint:${event.jobId}`;
const roomSockets = io.sockets.adapter.rooms.get(room);
if (!roomSockets || roomSockets.size === 0) return;

// 修改后（中文注释 + 直接 emit，让 socket.io 自行处理空房间）
const room = `blueprint:${event.jobId}`;
// autopilot-streaming-experience：不再因为房间当前为空就丢弃事件。
// 单条事件直接 io.to(room).emit，Socket.IO 在 room 没有订阅者时会自然忽略，
// 不会阻塞后到达的 socket。批量缓冲路径仍保留 flushBatch 中的空房间裁剪。
```

要点：

- 不动家族过滤（`role / capability / crew / job / evidence / sandbox`）与 `isValidJobId` 校验；
- 不动 capability 家族走批量聚合的分支；
- 该改动让需求 1 的“intake 早订阅”窗口期事件可以稳定到达。

### 4. `useAutoAdvance`：契约对象，不改实现

当前实现已经满足需求 4（5 分钟前端超时）与需求 5（spec_tree 不自动推进）。本设计仅：

- 在 `tasks.md` 中以 example-based 测试锁定行为；
- 在 `use-auto-advance.ts` 内部对应代码块上方补一行中文注释，引用本规格名称，方便后续维护者识别契约来源（不改可观测行为）。

## 数据模型

本规格不引入新的持久化模型与共享 contracts。涉及的数据均为内存中的 store slice 与短期事件：

| 数据 | 来源 | 生命周期 |
| --- | --- | --- |
| `agentReasoning.entries` | `blueprint-realtime-store.ts` | 订阅期间 FIFO 截断到 ≤500 条 |
| `agentReasoning.status` | 同上 | 由 `iteration_started / completed / error` 推导 |
| `agentReasoning.currentIteration` | 同上 | 由 `iteration_started` 推动 |
| `subscribedJobId` | 同上 | 与当前 streamKey 绑定 |
| `BatchBuffer` | `socket-relay.ts` | 100ms 窗口 / 10 条上限 |

## Error Handling

- **订阅切换失败**：`subscribe` 已经包含 connect / disconnect 监听，断网时把 `connectionState` 切成 `disconnected`，重连时自动 emit `blueprint:subscribe`；本规格不增加新的错误处理路径。
- **Relay 推送失败**：`io.to(room).emit` 在房间为空时是 no-op，不抛错。修复后无需 try/catch。
- **forceAdvance 5 分钟超时**：已在 `use-auto-advance.ts` 内通过 `setTimeout + timedOut` 标志保护；超时后即使后端最终返回也会被 `timedOut` 拦截，不会触发 `onAdvanced`。
- **spec_tree 状态错位**：由 `useAutoAdvance` 的 effect 早返回兜底；测试需要覆盖 `stage === "spec_tree"` 与 `status ∈ {running, reviewing, completed}` 三种取值。
- **组件卸载**：`use-auto-advance.ts` 已经维护 `mountedRef`；测试需要在 `act(() => unmount())` 之后断言不再调用 `set*`。

## 测试策略

### 测试形态

- 仅采用 example-based vitest 用例。
- 服务端测试用 `BlueprintEventBus` mock + 内存 socket.io 端到端 emit 验证。
- 前端测试用 `@testing-library/react` 渲染 `AutopilotRightRail` 与 `AutopilotRoutePage` 的最小子树，store 通过 `__setSocket` 注入 mock。

### 必要回归用例

1. **Relay 不丢事件**：构造 `BlueprintSocketRelay`，不让任何 socket join 房间，直接 emit 一条 role.agent.thinking → 期望 `io.to(room).emit` 被调用一次（用 mock io）；再 join 后 emit 第二条 → 期望该 socket 收到第二条。
2. **订阅生命周期**：渲染 `AutopilotRoutePage` 的最小壳，先 `setIntake({id: "I1"})` → `subscribe("I1")` 被调用；再 `setLatestJob({id: "J1"})` → 先 `unsubscribe()` 再 `subscribe("J1")`，且 `agentReasoning.entries` 被清空。
3. **子时间线挂载条件**：`currentStage = "fabric"` 且 active 节点存在时，`AgentReasoningSubTimeline` 被挂载；`currentStage = "input"` 时不被挂载。
4. **forceAdvance 超时**：用 `vi.useFakeTimers` 把 `advance` 阻塞 5 分零 1 秒，断言 `advancing` 重置为 `false`、`error.status === 408`、未调用 `onAdvanced`。
5. **spec_tree 不自动推进**：`stage === "spec_tree"`、`status` 取 `running | reviewing | completed` 时 effect 都不调用 `generateBlueprintSpecDocuments`；`forceAdvance` 触发后才调用。

### 手动验证清单

| 阶段 | 期望看到 |
| --- | --- |
| clarification | 输入仓库 URL → 在子时间线左轨看到“正在分析仓库目录结构”等 thinking 条目 |
| route_generation | 提交澄清答案 → 在子时间线右轨看到 acting / observing 条目 |
| spec_tree | active 节点展示节点列表 + 子时间线，5 分钟内不自动推进到 spec_docs |
| spec_docs | 点击“确认 SPEC 树并生成规格文档”→ 子时间线持续接收事件，最终 completed 横幅 |

### 测试集与基线守门

- 新增用例总数控制在 ≤8 个，避免触发 5140+ 测试集的整体抖动；
- 不修改 `agent-reasoning-bridge.test.ts`、`callback-receiver.test.ts`、`lite-agent-runtime.test.ts`、`llm-call.test.ts`；
- `node --run check` 在改动后错误数维持 ≤113。

## 关键决策与取舍

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 订阅时机方案 | A：intakeId 早订阅 → jobId 切换 | 最小代价复用现有 emitter 的 stream key；B 需要新增 SSE/轮询通道与归并；C 直接放弃 clarification 可见性 |
| Relay 改动范围 | 只改 `handleEvent` 单条路径 | 批量路径的早返回是合理裁剪，不影响订阅前事件 |
| `useAutoAdvance` | 不动实现，仅以测试锁定 | 现实现已经满足需求；任何改写都会扩大 PR 风险面 |
| 子时间线渲染位置 | 仅在 fabric+active 节点内 | 避免与右栏其它阶段争抢空间，不需要单独路由 |
| PBT | 不采用 | 用户明确要求 example-based；本规格涉及面均为 wiring 与时序，PBT 价值低 |

## 不做的事

- 不为 clarification / route_generation 引入第二条 SSE / 轮询通道。
- 不在 `BlueprintSocketRelay` 内引入“订阅前事件缓存”机制（成本高、收益低，依赖 `intakeId` 早订阅就足够）。
- 不修改 `agentReasoning` slice 的现有派生规则与 cap=500。
- 不改 `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED` 默认值；保留 `BUILD_TARGET=test` 时强制为 false 的既有约束。
- 不重做 `AgentReasoningSubTimeline` 的视觉与动画。
