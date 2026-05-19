# Tasks: autopilot-realtime-observation-bridge

## Task 1: 实现服务端 Socket.IO 中继模块

- [x] 1.1 创建 `server/routes/blueprint/socket-relay.ts`，实现 `createBlueprintSocketRelay` 工厂函数
- [x] 1.2 实现 eventBus 订阅与家族过滤逻辑（默认推送 role / capability / crew / job / evidence / sandbox）
- [x] 1.3 实现 `blueprint:subscribe` / `blueprint:unsubscribe` Socket.IO 事件处理与 room 管理
- [x] 1.4 实现 room 空检查：无订阅者时跳过 emit
- [x] 1.5 在 `server/index.ts` 中接入 relay（复用现有 `getSocketIO()` 实例，不改变初始化方式）
- [x] 1.6 编写 `server/tests/blueprint-socket-relay.test.ts` 单元测试

## Task 2: 实现前端 BlueprintRealtimeStore

- [x] 2.1 创建 `client/src/lib/blueprint-realtime-store.ts`，定义 Zustand store 结构
- [x] 2.2 实现 `subscribe(jobId)` / `unsubscribe()` 方法，管理 Socket.IO room 生命周期
- [x] 2.3 实现 `dispatchEvent` 事件分发逻辑：role → rolePhases, capability → capabilityStatuses, 全部 → logEntries
- [x] 2.4 实现有界队列截断（logEntries ≤ 200, agentProgress ≤ 50）
- [x] 2.5 实现 connectionState 跟踪与重连自动恢复订阅
- [x] 2.6 编写 `client/src/lib/__tests__/blueprint-realtime-store.test.ts` 单元测试

## Task 3: PetWorkers 3D 动画绑定

- [x] 3.1 在 `PetWorkers.tsx` 中引入 `useBlueprintRealtimeStore` 的 rolePhases selector
- [x] 3.2 实现 `mapRolePhaseToAnimation` 映射函数（覆盖所有 RolePhase → AgentAnimationType）
- [x] 3.3 实现 `mapRolePhaseToStatusCategory` 映射函数（影响光效和边框样式）
- [x] 3.4 添加 `prefers-reduced-motion` 检测，降级为静态状态指示
- [x] 3.5 使用 spring 插值实现动画平滑过渡

## Task 4: TaskAutopilotPanel Fleet 实时更新

- [x] 4.1 创建 `useFleetRealtimeCards` hook，合并静态投影与实时 store 数据
- [x] 4.2 在 `TaskAutopilotPanel` 中接入实时 Fleet 数据，优先使用实时数据、fallback 到静态投影
- [x] 4.3 实现增量更新逻辑：只更新变化的卡片

## Task 5: 日志面板流式追加

- [x] 5.1 实现 `buildLogEntry` 函数：将 blueprint 事件转换为结构化日志条目
- [x] 5.2 在现有日志面板组件中接入 `BlueprintRealtimeStore.logEntries`
- [x] 5.3 实现自动滚动到底部逻辑（用户手动滚动时暂停自动滚动）

## Task 6: 高频事件批量推送

- [x] 6.1 在 SocketRelay 中实现 100ms 聚合窗口，高频事件使用 `blueprint:batch` 批量推送
- [x] 6.2 前端 store 支持处理 `blueprint:batch` 事件（批量 dispatch）
- [x] 6.3 编写批量推送场景的集成测试
