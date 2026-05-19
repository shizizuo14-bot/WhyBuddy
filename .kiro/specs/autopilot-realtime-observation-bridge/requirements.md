# Requirements: autopilot-realtime-observation-bridge

## Overview

将 Blueprint 事件流从服务端实时推送到前端，让 3D 运行台（Step 5）成为伴随式观察层，实时反映 Agent Crew（Step 2）和能力网络（Step 3）的执行状态。

## Requirements

### Requirement 1: Socket.IO 事件中继

服务端应提供一个 `BlueprintSocketRelay` 模块，订阅 `BlueprintEventBus` 的事件并按 jobId 隔离推送到前端。

**Acceptance Criteria:**
- 1.1 Relay 模块订阅 eventBus 后，`role` / `capability` / `crew` / `job` / `evidence` / `sandbox` 六个家族的事件应被转发到对应 Socket.IO room
- 1.2 事件推送必须按 jobId 隔离：事件只发送到 `blueprint:${jobId}` room 中的客户端，不广播给其他 jobId 的订阅者
- 1.3 当 room 中无订阅者时，relay 不执行 Socket.IO emit 操作
- 1.4 不改变既有 `eventBus` 接口（只读订阅，不修改 emit 行为）
- 1.5 不改变既有 Socket.IO 初始化方式（复用 `server/core/socket.ts` 中的实例）
- 1.6 不引入新的 WebSocket 库

### Requirement 2: 前端实时状态管理

前端应提供一个 `BlueprintRealtimeStore`（Zustand store），接收 Socket.IO 推送的事件并维护实时状态。

**Acceptance Criteria:**
- 2.1 Store 提供 `subscribe(jobId)` 和 `unsubscribe()` 方法管理 Socket.IO room 订阅生命周期
- 2.2 收到事件后，store 应增量更新对应状态切片（rolePhases / capabilityStatuses / logEntries / fleetRoleCards），不全量替换
- 2.3 `logEntries` 队列长度不超过 200 条，超出时截断最旧条目
- 2.4 `agentProgress` 队列长度不超过 50 条，超出时截断最旧条目
- 2.5 Store 应暴露 `connectionState` 字段，反映 Socket.IO 连接状态（disconnected / connecting / connected）
- 2.6 Socket.IO 重连后应自动重新发送 `blueprint:subscribe` 恢复订阅

### Requirement 3: 3D PetWorkers 状态绑定

3D Agent 宠物组件应根据角色的实时 `phase` 切换动画。

**Acceptance Criteria:**
- 3.1 当 `BlueprintRealtimeStore.rolePhases[roleId]` 变化时，对应 PetWorker 的动画类型应切换到映射后的 `AgentAnimationType`
- 3.2 动画切换应使用 spring 插值平滑过渡，不产生跳变
- 3.3 当 `prefers-reduced-motion: reduce` 时，动画切换应降级为静态状态指示（颜色/边框变化），不播放运动动画
- 3.4 角色阶段到动画的映射应覆盖所有 `RolePhase` 值（idle / activated / thinking / acting / observing / reviewing / sleeping / completed / failed）

### Requirement 4: HUD Fleet 卡片实时刷新

`TaskAutopilotPanel` 的 Fleet 卡片应订阅 Agent 进度事件做实时更新。

**Acceptance Criteria:**
- 4.1 当 `BlueprintRealtimeStore` 中有实时 Fleet 数据时，Fleet 卡片应优先使用实时数据，否则 fallback 到静态投影数据
- 4.2 Fleet 卡片更新应是增量的：只更新变化的卡片，不全量替换整个列表
- 4.3 卡片应实时反映角色的 `phase`、`currentAction` 和 `status` 字段

### Requirement 5: 日志面板流式追加

Agent 的 trace 和 logs 应流式推送到前端日志面板。

**Acceptance Criteria:**
- 5.1 所有被中继的事件应生成对应的日志条目，追加到 `logEntries` 队列
- 5.2 日志条目应包含 `timestamp`、`level`、`source`（事件来源角色/能力）和 `message` 字段
- 5.3 日志面板应支持流式追加渲染，新条目出现时自动滚动到底部（除非用户手动滚动到非底部位置）

### Requirement 6: 事件过滤与安全

系统应确保事件推送的安全性和效率。

**Acceptance Criteria:**
- 6.1 默认只推送 `role` / `capability` / `crew` / `job` / `evidence` / `sandbox` 六个家族，不推送 `clarification` / `route` / `spec` / `preview` / `prompt` / `mission`
- 6.2 事件 payload 不包含敏感信息（API key、token、凭证等）
- 6.3 服务端应对客户端传入的 jobId 做基本校验（非空字符串、合理长度），拒绝无效订阅请求
- 6.4 高频事件场景下（连续 capability 调用），应支持批量推送（每 100ms 聚合一次），减少 Socket.IO 帧数
