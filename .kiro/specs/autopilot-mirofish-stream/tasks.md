# 任务清单：MiroFish 流式卡片

## 概述

按四波收口。Wave 0/1/2 已经全部 commit 入库；Wave 3 是 spec 三件套收口本身。所有任务后均标注对应 commit hash 与文件清单，便于追溯。

工程基线：

- TS 错误数 116（与基线一致，未扩大）
- 前端 `client/src/pages/autopilot/`：431/431 passed
- 后端 `server/tests/blueprint-routes.test.ts`：71 passed / 2 failed（pre-existing baseline `expected 34 to be 33`，与本任务无关）

## Wave 0：前端流式骨架（commit b45a826）

- [x] 1. 定义 `MiroFishStreamEntry` union 与 6 类 entry 类型
  - 路径：`client/src/pages/autopilot/right-rail/mirofish-stream/mirofish-stream-types.ts`
  - 6 类：`reasoning` / `node_completed` / `route_decision` / `capability_invocation` / `artifact_created` / `system_note`
  - 每类 entry 带 `id` / `stageId` / `timestamp` / `tone` 四个统一字段
  - tone 取值：`thinking` / `acting` / `observing` / `success` / `info` / `warning`，按 design.md 表格映射

- [x] 2. 实现 `deriveMiroFishStreamEntries` 纯派生函数
  - 路径：`client/src/pages/autopilot/right-rail/mirofish-stream/derive-mirofish-stream-entries.ts`
  - 输入：`agentReasoning` / `capabilityStatuses` / `artifacts` / `routeSelection` / `routeSet` / `specTree` / `specDocuments` / `specDocumentTreeStats`
  - 输出：`MiroFishStreamEntry[]`，按 `id` 去重 + `timestamp` 升序 stable sort
  - 容忍所有输入缺失（store 初始空态、SSR mock 部分注入），不抛异常
  - `node_completed` 仅在 3 份 docs（requirements / design / tasks）都齐时派生；`source` 按多数派折算
  - `stageId` 派生映射统一收敛在派生函数内部，不下放到组件层

- [x] 3. 实现 6 类卡片组件
  - 路径：`client/src/pages/autopilot/right-rail/mirofish-stream/cards/`
  - `card-shell.tsx`：卡片 shell 通用样式（icon + tone + 主体内容三段式）
  - `index.tsx`：6 类卡片组件 export
  - 单纵向布局，max-width: 100%，360px 宽度可读
  - icon / tone 映射严格按 design.md 表格

- [x] 4. 实现 `MiroFishCardStream` 主组件
  - 路径：`client/src/pages/autopilot/right-rail/mirofish-stream/MiroFishCardStream.tsx`
  - 6 路 store slice 订阅（agentReasoning / capabilityStatuses / artifacts / routeSelection / routeSet+specTree / specDocuments+specDocumentTreeStats）
  - `stageFilter` 归一化（`string | readonly string[]` → `Set<string>`）
  - 自动 scroll-to-bottom，仅当用户未手动滚离底部时触发
  - 空态返回 `null`（不渲染外壳，沿用 AgentReasoningSubTimeline 折叠语义）

- [x] 5. 补齐 Wave 0 测试
  - 路径：`client/src/pages/autopilot/right-rail/mirofish-stream/__tests__/`
  - `derive-mirofish-stream-entries.test.ts`：派生函数单测，覆盖 6 类 entry 派生 / id 去重 / timestamp 排序 / 缺失输入容忍 / stageId 派生映射 / node_completed 仅在 3 份 docs 都齐时派生 / source 多数派折算
  - `cards.test.tsx`：6 类卡片 SSR 测试，每类至少覆盖 tone / icon / 主体内容
  - `MiroFishCardStream.test.tsx`：主组件集成测试，覆盖空态 / stageFilter 形态（string | string[] | undefined）/ 阶段事件溢出过滤 / 单纵向轨道（无 `grid-cols-[1fr_2px_1fr]`）

## Wave 1：thin wrapper 接管挂载点（commit 333a809）

- [x] 1. 改造 `AgentReasoningSubTimeline` 为 thin wrapper
  - 路径：`client/src/pages/autopilot/right-rail/AgentReasoningSubTimeline.tsx`
  - 委托给 `MiroFishCardStream`，透传 `locale` / `stageFilter` / `job`
  - 保留 export 与组件名，外部 API 完全兼容
  - thin wrapper 不再持有任何派生 / 排序 / 渲染逻辑

- [x] 2. `AgentReasoningSubTimelineProps` 新增 `job?: BlueprintGenerationJob` 可选 prop
  - 让挂载点把 `latestJob` 透传进来，使派生函数能消费 `artifacts` / `routeSelection` / `specTree` 等富数据
  - 既有挂载点未传 `job` 时仍能 fallback 到只消费 store slice 的最小派生

- [x] 3. 6 个挂载点接入 `job={latestJob}`
  - `client/src/pages/autopilot/AutopilotRoutePage.tsx`：1 处
  - `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`：5 处（各阶段卡片底部）
  - 全部传入当前 `latestJob`，与 store 单一真实源对齐

- [x] 4. 既有 19 个 SubTimeline / StoreObservabilityHud 测试保持通过
  - thin wrapper 不破坏 `stageFilter` / `locale` 外部 API
  - 部分历史测试中关于双轨布局的 `grid-cols-[1fr_2px_1fr]` 字符串断言按 R-2 现实更新到单纵向轨道（卡片 stack）
  - 测试基线维持 431/431 passed

## Wave 2：后端 emit 三类流式事件（commit e3e0ec6 + 94113ab）

- [x] 1. 新增事件字典 `spec.node_completed` 与 `evidence.artifact_created`
  - 路径：`shared/blueprint/events.ts`
  - `BlueprintEventName.RouteSelected` 已存在，不新增
  - `BlueprintEventName.SpecNodeCompleted = "spec.node_completed"` 归入 `spec` family
  - `BlueprintEventName.EvidenceArtifactCreated = "evidence.artifact_created"` 归入 `evidence` family（12 family 不含 artifact，evidence 是最近的承接点）
  - 路径：`shared/blueprint/__tests__/events.test.ts`
  - 补 family 断言：`SpecNodeCompleted` 属于 `spec`，`EvidenceArtifactCreated` 属于 `evidence`

- [x] 2. 路由层 emit `route.selected` 与 `evidence.artifact_created`
  - 路径：`server/routes/blueprint.ts` `POST /jobs/:jobId/route-selection` line 1145+
  - emit `route.selected`（1 条）
  - 遍历 `route_selection` / `spec_tree` / `agent_crew` 3 类 artifact emit `evidence.artifact_created`（3 条）
  - 时序约束：emit 在 `selectRouteForSpecTree` 内部 `store.save(updatedJob)` 之后由路由层补发，所以不在 HTTP 响应快照 events 中，但会进入 `jobStore.events`，前端通过 socket / `latestJob` 两条路径都能消费

- [x] 3. spec-docs-llm-generation 路径 emit `spec.node_completed`
  - 路径：`server/routes/blueprint/spec-docs-llm-generation.ts` line 712+
  - 在 `emitter?.observing` 之后 emit
  - payload 含 `nodeId` / `nodeTitle` / `documentTypes` / `generationSource`
  - 仅在 3 份 docs 都齐时 emit 一次（与 Wave 0 派生函数侧的 `node_completed` 触发条件对齐）

- [x] 4. 调整既有 `events.length` 断言反映 4 条新 emit
  - 路径：`server/tests/blueprint-routes.test.ts` line 1703
  - `selected.job.events.length + 7` → `selected.job.events.length + 11`
  - 语义说明：4 条新 emit（1 × `route.selected` + 3 × `evidence.artifact_created`）在 `selectRouteForSpecTree` 内部 save 之后由路由层补发，不在 selected.job.events 快照中但会进入 jobStore，再叠加 7 次 actions 回流
  - 补中文注释说明该 +11 来源

## Wave 3：spec 三件套收口

- [x] 1. 验证 TS 基线未扩大
  - `node --run check`：116 错误（与基线一致）

- [x] 2. 验证前端测试全绿
  - `client/src/pages/autopilot/`：431/431 passed

- [x] 3. 验证后端测试无回归
  - `server/tests/blueprint-routes.test.ts`：71 passed / 2 failed（pre-existing baseline `expected 34 to be 33`，与本任务无关）

- [x] 4. spec 三件套收口（本任务）
  - `requirements.md` / `design.md` / `tasks.md` 完整且版本对齐
  - tasks 全部勾选 `[x]`，commit hash 标注清楚
  - 文档与实现一致，便于后续维护者追溯 R-2 重构脉络

## 不做的事（明确范围外）

- 不做 3D 场景联动（`PetWorkers` / `SceneStageFlow` / `MissionIsland`）—— 进入下一个独立 spec `autopilot-scene-fusion`
- 不再改 `BlueprintRealtimeStore` slice 结构。`route.selected` / `spec.node_completed` / `evidence.artifact_created` 三类事件已经通过 `jobStore.events` 落盘，前端通过 `latestJob` 消费 `artifacts` / `routeSelection` / `specTree` 派生卡片，不需要独立 slice
- 不改 mission-first 任务壳 / wall-mounted SandboxMonitor / 任何 `/tasks` 路径
- 不引入 `framer-motion` / `@testing-library/react` / `jsdom` 等新依赖

## 总结

`autopilot-mirofish-stream` R-2 重构 4 波全部完成：

- Wave 0：前端流式骨架（派生函数 + 6 类卡片 + 主组件 + 测试）
- Wave 1：thin wrapper 接管 6 个既有挂载点
- Wave 2：后端 emit 3 类流式事件 + 既有测试断言修正
- Wave 3：spec 三件套收口

实现 commit 已入库：`b45a826` → `333a809` → `e3e0ec6` → `94113ab`，叠加本次 docs 收尾共计 5 个 commit。

TS 基线 116，前端测试 431/431，后端无新增回归。
