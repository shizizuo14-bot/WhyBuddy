# 实施计划：Autopilot 流式体验补完

## 概述

按下面顺序逐个 PR / 子任务推进。每个子任务都对应 requirements.md / design.md 中的具体需求条款，便于 spec-task-execution 单独认领。所有代码注释与 JSDoc 使用中文。除显式标注 `*` 的回归子任务外均必须实现，禁止实现 `*` 子任务（按工作流约束）。

## 任务

- [x] 1. 修复订阅时机：intakeId 早订阅 → jobId 晚切换
  - 在 `client/src/pages/autopilot/AutopilotRoutePage.tsx` 中替换“仅订阅 latestJob.id”的 useEffect，改为派生 `streamKey = latestJob?.id ?? intake?.id ?? null`，并在 streamKey 变化时通过 store 的 `unsubscribe + subscribe` 完成切换。
  - 复用 `useBlueprintRealtimeStore.subscribe` 现有的“切换前清空 agentReasoning 切片”行为，不新增 store action。
  - 在新增中文 JSDoc 上方引用本规格名 `autopilot-streaming-experience`，便于后续维护者识别契约来源。
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x]* 1.1 编写订阅生命周期回归测试
  - 用 `@testing-library/react` 渲染 `AutopilotRoutePage` 的最小壳（注入 fake intake / latestJob 状态）。
  - 断言：`setIntake({id:"I1"})` 后 `subscribe("I1")` 被调用；`setLatestJob({id:"J1"})` 后先 `unsubscribe` 再 `subscribe("J1")`，且 `agentReasoning.entries` 被清空。
  - 断言：`intake = null` && `latestJob = null` 时不发起任何订阅，`agentReasoning.status` 维持 `idle`。
  - 通过 `useBlueprintRealtimeStore.__setSocket` 注入 mock socket，避免触达真实 io。
  - _Requirements: 1.1, 1.4, 1.6_

- [x] 2. 子时间线渲染条件收敛
  - 在 `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx` 中确认 `AgentReasoningSubTimeline` 仅在 `currentStage === "fabric"` 且当前子阶段为 `active` 的节点内被挂载（已有逻辑）。
  - 在 `AgentReasoningSubTimeline` 入口处保留 `entries.length === 0 && status === "idle"` 时返回 `null` 的折叠态实现，并补一行中文 JSDoc 解释为什么不渲染空容器。
  - 不改双轨布局视觉与动画。
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x]* 2.1 编写子时间线挂载条件回归测试
  - 用最小子树渲染 `AutopilotRightRail`，断言：
    - `currentStage="fabric"` 且 active 节点存在 → `AgentReasoningSubTimeline` 被挂载（DOM 中包含 `agent-reasoning-pulse-ring` 或 entries 容器）。
    - `currentStage="input"` → `AgentReasoningSubTimeline` 不挂载。
    - `entries.length === 0 && status === "idle"` → 子时间线返回 `null`，DOM 中无对应容器。
  - _Requirements: 2.1, 2.2, 2.6_

- [x] 3. 修复 socket relay 的“房间为空就丢”早返回
  - 在 `server/routes/blueprint/socket-relay.ts` 的 `handleEvent` 中，移除针对单条事件路径的 `if (!roomSockets || roomSockets.size === 0) return;` 早返回（约第 200 行）。
  - 直接调用 `io.to(\`blueprint:${event.jobId}\`).emit("blueprint:event", payload)`；socket.io 在房间为空时会自然忽略，不会抛错。
  - 保留 capability 家族走批量缓冲分支，保留 `flushBatch` 内部的空房间裁剪。
  - 在改动处补中文注释，引用本规格 `autopilot-streaming-experience` 与需求 3。
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x]* 3.1 编写 relay 不丢事件回归测试
  - 用 mock 的 `Server as SocketIOServer`（`io.sockets.adapter.rooms` 返回 `undefined` 或 `Set([...])`）+ 真实 `BlueprintEventBus`。
  - 案例 A：房间未订阅时，emit 一条 `role.agent.thinking` → 断言 `io.to(...).emit` 被调用一次（不再被早返回拦截）。
  - 案例 B：先 emit 一条事件、再让 socket join、再 emit 第二条 → 断言 socket 收到第二条；不要求第一条被缓存。
  - 案例 C：capability 家族事件继续走批量路径，单条 thinking 仍走 `blueprint:event`；通过断言 `emit` 的事件名分流。
  - _Requirements: 3.1, 3.2, 3.5, 3.6_

- [x]* 4.1 编写 forceAdvance 5 分钟超时回归测试
  - 在 `client/src/pages/autopilot/right-rail/hooks/__tests__/use-auto-advance.test.ts`（如不存在则新建）内：
    - 用 `vi.useFakeTimers` 与一个 hang 住的 `generateBlueprintSpecDocuments` mock。
    - 触发 `forceAdvance()`，推进时钟 5 分零 1 秒。
    - 断言：`advancing` 被重置为 `false`，`error.status === 408`，`onAdvanced` 在超时窗口期间未被调用。
    - 第二个用例：在 4 分 59 秒时让 mock resolve `{ ok: true }`，断言 `onAdvanced` 被调用一次且超时定时器被清理。
  - 不修改 `use-auto-advance.ts` 实现，只验证既有契约。
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x]* 5.1 编写 spec_tree 不自动推进回归测试
  - 在同一个测试文件内补三个用例，分别构造 `job.stage === "spec_tree"` 且 `status ∈ {running, reviewing, completed}`。
  - 断言：每种 status 下，`useAutoAdvance` 的 effect 都不调用 `generateBlueprintSpecDocuments`。
  - 第四个用例：仍在 spec_tree 阶段触发 `forceAdvance()`，断言 `generateBlueprintSpecDocuments` 被调用一次。
  - 第五个用例：`stage` 切换到 `spec_docs` 且 `status === "completed"`，断言此时 `effect_preview` 阶段会被自动推进，验证 spec_tree 的“手动”契约不影响下游自动推进。
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 6. 文档化 spec_tree 手动确认契约
  - 在 `client/src/pages/autopilot/right-rail/hooks/use-auto-advance.ts` 的 `// spec_tree + completed → 自动生成 spec_docs` 代码块上方追加中文注释：
    - 说明本规格 `autopilot-streaming-experience` 已经把“spec_tree 必须由用户点击 timeline-confirm-advance 触发”锁定为契约。
    - 提示后续若需要打开自动推进，需要同时调整本规格 5.x 的回归测试。
  - 不改实现行为；不动其它阶段的自动推进规则。
  - _Requirements: 5.4_

- [x] 7. 检查点：基线守门
  - 跑 `node --run check`，确认错误数 ≤ 113（不扩张 TS 基线）。
  - 跑 `node --run lint`、`node --run test`（或仓内对应聚合命令），确认 5140+ 既有用例不破坏。
  - 跑新增的 `*` 标记回归测试本身：`vitest run server/routes/blueprint/socket-relay.test.ts client/src/lib/blueprint-realtime-store.test.ts client/src/pages/autopilot/right-rail/hooks/__tests__/use-auto-advance.test.ts`（按实际新增文件命名）。
  - 任一守门失败时，停下来询问用户。

- [x] 8. 手动验证清单（per stage）
  - 启动 `npm run dev:all`，本地浏览器进入 Autopilot Route 页。
  - 阶段 1（clarification）：粘贴一个仓库 URL，提交后**在子时间线左轨**看到至少一条 `thinking` 条目（“正在分析仓库目录结构…”等）；右栏 active 节点不再是空的。
  - 阶段 2（route_generation）：提交澄清答案后，在子时间线右轨看到 `acting`（如 `github.get_repository`）与 `observing` 条目；左栏 RouteSet 数据出现时，子时间线**不**被清空。
  - 阶段 3（spec_tree）：进入编组阶段后，右栏 active 节点出现节点列表；**不**自动推进到 spec_docs；点击“确认 SPEC 树并生成规格文档”按钮后，子时间线持续接收 spec_docs 阶段事件。
  - 阶段 4（spec_docs → preview → packaging → landing）：每个阶段推进时子时间线持续滚动；最终阶段出现 `completed` 横幅。
  - 异常路径：在 spec_docs 阶段点击按钮后，**人为不停后端**（或观察 5 分钟），断言 UI 在 5 分钟时解锁“推进中…”按钮并显示 `请求超时`。
  - 把上述五条手测结果写回本任务的 PR 描述中（截图可选）。
  - _Requirements: 1.x, 2.x, 4.x, 5.x_

## 注意事项

- 标记为 `*` 的子任务为可选回归测试，由 spec-task-execution 默认跳过实现；本仓的执行约束要求测试与实现成对验证，建议在认领时把 1 / 2 / 3 / 6 与对应的 1.1 / 2.1 / 3.1 / 4.1 / 5.1 一起完成。
- 任务 4 与 5 没有“实现”子任务，原因是 `use-auto-advance.ts` 已经满足需求；只需任务 4.1 与 5.1 的回归测试 + 任务 6 的文档化注释来锁定契约。
- 任何子任务都不应触达：`server/routes/blueprint/agent-reasoning-bridge.ts`、`server/routes/blueprint/callback-receiver.ts`（如存在）、`server/runtime/lite-agent-runtime.ts`、`server/runtime/llm-call.ts`。如果实现过程中发现需要改这些文件，停下来开一份独立 spec。
