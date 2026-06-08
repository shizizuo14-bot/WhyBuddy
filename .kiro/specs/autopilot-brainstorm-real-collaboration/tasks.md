# Implementation Plan: Autopilot Brainstorm Real Collaboration

## Overview

把 `deliberation-protocol.ts` 的「扇出 + 正则刮取」升级为 ChatDev 拓扑启发的真实多智能体协作引擎：结构化批评（Critique）→ 结构化反驳（Rebuttal）→ 主模型裁决（Adjudicator）/ 结构化多数投票（MajorityVote），并把真实结构化对象端到端喂给 3D 墙。保守升级：复用既有 `orchestrator / deliberation-protocol / synthesizer / vote-synthesizer / decision-gate / pipeline-integration / reasoning-graph-projection / brainstorm-graph-store / BrainstormWallGraph`，不从零重写。

交付顺序：先落 shared 契约 + 事件，再做纯引擎件（topology-manager、结构化 parser、deliberation 升级、adjudicator、majority vote），再接 orchestrator wiring + 投影 + 事件发出，再到客户端 store/墙消费，再扩诊断，最后补全 PBT 与回归套件。

保守约束贯穿全程：env-gated（`BLUEPRINT_BRAINSTORM_ENABLED`）、绝不抛错、非阻塞异步侧信道、确定性 SPEC 文档生成是真相源且不被替换、`BUILD_TARGET=test` 默认关闭。旧启发式函数保留为 fallback-only（重命名 `legacy*`）。不扩大 `node --run check` TypeScript 基线、不扩展 `brainstorm` 之外的事件家族、不改 `/tasks` 深链。

服务端测试用 `vitest.config.server.ts`；客户端测试在 `client/src` 下。新增能力默认关闭，测试经 `vi.stubEnv` 显式 opt-in 打开。属性测试用 fast-check（每条 ≥100 iterations），统一标注 `// Feature: autopilot-brainstorm-real-collaboration, Property {n}`。

ChatDev（`./ChatDev-main`）仅作设计灵感来源，绝不修改、绝不提交。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.2", "1.3"] },
    { "wave": 2, "tasks": ["1.4", "2.1", "3.1", "4.1", "5.1", "9.1", "11.1"] },
    { "wave": 3, "tasks": ["2.2", "2.3", "3.2", "4.2", "5.2", "6.1", "9.2", "11.2"] },
    { "wave": 4, "tasks": ["3.3", "6.2", "6.4", "6.5", "8.1"] },
    { "wave": 5, "tasks": ["6.3", "8.2", "8.3", "10.1", "12.1"] },
    { "wave": 6, "tasks": ["10.2", "12.2", "13.1"] },
    { "wave": 7, "tasks": ["14.1", "14.2"] }
  ]
}
```

```
Wave1 契约/事件          Wave2 引擎件并行            Wave3 引擎件测试 + 集成          Wave4 拼装           Wave5 wiring         Wave6 接线测试      Wave7 全局
1.1 contracts ─┬─────────→ 2.1 topology ───────────→ 2.2*/2.3* topology test ─┐
               ├─────────→ 3.1 parsers ────────────→ 3.2* P1 parse ───────────┼→ 3.3* P11 ─┐
               ├─────────→ 4.1 adjudicator ────────→ 4.2* P4 clamp            │            │
               ├─────────→ 5.1 majority vote ──────→ 5.2* P6 vote             │            │
               ├─────────→ 9.1 projection ─────────→ 9.2* P8 renderable       │            │
               └─────────→ 11.1 client store ──────→ 11.2* store test         │            │
1.2 events ─┐                                       6.1 deliberation upgrade ─┼→ 6.2* P2 ──┼→ 6.3* P12 ─┐
1.3 guard  ─┴→ 1.4* P9 event guard                  (legacy* fallback-only)   ├→ 6.4* P3   │            │
                                                                              ├→ 6.5* P13  │            │
                                                                              └→ 8.1 orch ─┼→ 8.2* P10 ─┤
                                                                                           │  8.3* spies │
                                                                                           ├→ 10.1 emit ─┼→ 10.2* events
                                                                                           └→ 12.1 diag ─┼→ 12.2* diag IT
                                                                                              13.1 gate ─┘ (wave6)
                                                                                                          └→ 14.1* P5 degrade
                                                                                                             14.2* regression
```

## Tasks

- [x] 1. Shared contracts & events（additive，先行）
  - [x] 1.1 Additive brainstorm 契约类型
    - 在 `shared/blueprint/brainstorm-contracts.ts` 追加（全部 additive，不破坏既有字段）：`CritiqueSeverity`、`RebuttalStance`、`Critique`、`Rebuttal`、`AdjudicationResult`、`StructuredVote`、`MajorityVote`、`TopologyCritiqueEdge`、`BrainstormTopology`
    - 给 `BrainstormSession.deliberationSummary` 以可选字段补 `critiqueCount?/rebuttalCount?/adjudicationCount?`；给 `BrainstormDiagnostics` 补可选 `critiqueCount?/rebuttalCount?/unresolvedCount?/adjudicationCount?/voteCount?`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 12.2_

  - [x] 1.2 新增 `brainstorm.rebuttal.issued` 事件 + payload
    - 在 `shared/blueprint/events.ts` 三处同步追加：`BlueprintGenerationEventType` union 加 `"brainstorm.rebuttal.issued"`、`BlueprintEventName` 常量对象加同名条目、新增 `BrainstormRebuttalIssuedPayload` 接口
    - 升级既有 `BrainstormChallengeIssuedPayload`（补 `targetClaim`/`severity`）与 `BrainstormRoundCompletedPayload`（补 `consensusReached`/`unresolvedCritiqueCount`）；确认 `resolveBlueprintEventFamily("brainstorm.rebuttal.issued") === "brainstorm"`，不扩展家族目录
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 12.2_

  - [x] 1.3 `emitBrainstormEvent` jobId/stageId 守卫包装器
    - 新建 `server/routes/blueprint/brainstorm/emit-brainstorm-event.ts`，导出 `emitBrainstormEvent(emitEvent, type, payload)`：payload 缺非空 `jobId` 或 `stageId` 时跳过发出（不发残缺事件）并 debug 记录原因
    - _Requirements: 7.1, 7.2, 7.3_

  - [x]* 1.4 Property test：事件完整性（P9）
    - 新建 `server/routes/blueprint/brainstorm/brainstorm-event-guard.property.test.ts`
    - **Property 9: Brainstorm event completeness (jobId + stageId)**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 2. Topology Manager（新增，纯同步、never-throws）
  - [x] 2.1 实现 `topology-manager.ts`
    - 新建 `server/routes/blueprint/brainstorm/topology-manager.ts`，导出 `resolveTopology`、`buildDefaultTopology`、`validateTopology`
    - 校验：`critiqueEdges` 端点均属 `participatingRoleIds`（否则 `unknown_role`）、无自环（`self_loop`）、批评关系图无环（DFS 检测，`cyclic`）、`minRounds<=maxRounds && maxRounds>=1`（否则钳制）；任一失败回退 `buildDefaultTopology` 并填 `fallbackReason`
    - 默认拓扑：参与角色串成「无环环形批评链」，`synthesizerRoleId` 取 `"decider"`（否则首个角色），`minRounds=2, maxRounds=5`；单角色时 `critiqueEdges=[]`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 2.2 Property test：拓扑恒合法可执行且被遵循（P7）
    - 新建 `server/routes/blueprint/brainstorm/topology-manager.property.test.ts`
    - **Property 7: Topology is always valid, executable, and honored**
    - **Validates: Requirements 5.2, 5.4, 5.5, 12.6**

  - [x]* 2.3 Unit test：默认拓扑形状与具名拓扑透传
    - 新建 `server/routes/blueprint/brainstorm/topology-manager.test.ts`，覆盖 `buildDefaultTopology` 形状与合法具名拓扑直接采用
    - _Requirements: 5.1, 5.3_

- [x] 3. 结构化 Critique / Rebuttal 解析器与 aux 调用器
  - [x] 3.1 实现结构化 parser 与 aux caller 类型
    - 在 `deliberation-protocol.ts` 实现 `StructuredCritiqueCaller`/`StructuredRebuttalCaller` 类型与各自的宽松 JSON parser（`JSON.parse` → 首个 `{...}` 块 → 保守默认），复用 `synthesis-audit` 的 never-throw + 宽松解析模式
    - parser 拒绝越界值：`severity ∉ {low,medium,high}` 或 `stance ∉ {concede,defend}` 返回 `null`；`targetClaim` 必须取自 target 本轮产出文本
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

  - [x]* 3.2 Property test：解析校验封闭值集（P1）
    - 新建 `server/routes/blueprint/brainstorm/deliberation-protocol.parse.property.test.ts`
    - **Property 1: Structured parse validation enforces closed value sets**
    - **Validates: Requirements 1.2, 2.3**

  - [x]* 3.3 Property test：Critique 引用 target 主张（P11）
    - 扩展 `server/routes/blueprint/brainstorm/deliberation-protocol.parse.property.test.ts`
    - **Property 11: Critique targets the target role's claim**
    - **Validates: Requirements 1.3**

- [x] 4. Adjudicator（主模型裁决，替换 `computeConvergenceScore`）
  - [x] 4.1 实现 `AdjudicatorFn`
    - 新建 `server/routes/blueprint/brainstorm/adjudicator.ts`，导出基于 primary caller 的 `createAdjudicator`：返回 `AdjudicationResult { consensusReached, convergenceScore, unresolvedCritiqueIds, rationale }`
    - `convergenceScore` 钳制到 [0,1]（含 NaN/±∞/越界 → 钳到边界）；LLM 失败或解析失败 → never-throw 返回 `consensusReached=false`
    - _Requirements: 3.1, 3.2, 3.6_

  - [x]* 4.2 Property test：收敛分钳制到 [0,1]（P4）
    - 新建 `server/routes/blueprint/brainstorm/deliberation-protocol.adjudicate.property.test.ts`
    - **Property 4: Convergence score is clamped to [0, 1]**
    - **Validates: Requirements 3.2**

- [x] 5. MajorityVote（vote 模式结构化投票）
  - [x] 5.1 升级 `vote-synthesizer.ts` 为结构化 MajorityVote
    - 复用 `computeVoteResult`（confidence 加权 + margin + `isNarrow` 阈值 + minorityReasoning）；`parseVote` 产出 `StructuredVote[]`，无效票忽略并基于剩余有效票裁决
    - 无任何有效票 → 标「无有效投票」交由 orchestrator 降级到综合，不抛错；`executeVoteMode` 继续 emit `brainstorm.vote.completed`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 5.2 Property test：多数投票正确性（P6）
    - 新建 `server/routes/blueprint/brainstorm/vote-synthesizer.property.test.ts`
    - **Property 6: Majority vote correctness**
    - **Validates: Requirements 4.2, 4.3, 4.4**

- [x] 6. Deliberation 引擎升级（拼装 topology + parser + adjudicator，legacy 为 fallback-only）
  - [x] 6.1 升级 `executeDeliberation`
    - 改 `deliberation-protocol.ts`：拓扑顺序产出主张 → 按 `topology.critiqueEdges` 调 `critiqueCaller`（非法 severity/null 跳过）→ 合法 Critique 调 `rebuttalCaller`（`concede`→Critique resolved、`defend`/失败→unresolved 保留）→ 调 `adjudicator`；终止条件 `consensusReached && round>=minRounds` 或 `round==maxRounds`；未解决 Critique 作为 dissenting 传给综合；本轮零 Critique 记录并继续
    - 将旧启发式 `outputFromMember`/`challengesFromOutputs`/`computeConvergenceScore`/`findRebuttalsForPriorChallenges` 重命名为 `legacy*` 并标注 fallback-only；当 `critiqueCaller/adjudicator` 缺省或 topology 不可执行时走 `legacy*` 路径，保证零变化回退；**不再**用正则在 Agent 自身文本匹配 `challenge|disagree|risk|concern`
    - 新输入字段全部可选向后兼容，保留 `DeliberationRound`/`DeliberationResult` 形状
    - _Requirements: 1.4, 1.5, 1.6, 2.4, 2.5, 2.6, 3.3, 3.4, 3.5, 3.7, 9.4_

  - [x]* 6.2 Property test：反驳解决正确性（P2）
    - 新建 `server/routes/blueprint/brainstorm/deliberation-protocol.resolution.property.test.ts`
    - **Property 2: Rebuttal resolution correctness**
    - **Validates: Requirements 2.4, 2.5, 2.6**

  - [x]* 6.3 Property test：反驳引用其源 Critique（P12）
    - 扩展 `server/routes/blueprint/brainstorm/deliberation-protocol.resolution.property.test.ts`
    - **Property 12: Rebuttal references its originating critique**
    - **Validates: Requirements 2.2**

  - [x]* 6.4 Property test：辩论恒在轮次界内终止（P3）
    - 新建 `server/routes/blueprint/brainstorm/deliberation-protocol.termination.property.test.ts`
    - **Property 3: Deliberation always terminates within configured round bounds**
    - **Validates: Requirements 3.3, 3.4**

  - [x]* 6.5 Property test：未解决 Critique 浮现为 dissent（P13）
    - 新建 `server/routes/blueprint/brainstorm/deliberation-protocol.dissent.property.test.ts`
    - **Property 13: Unresolved critiques surface as dissent**
    - **Validates: Requirements 3.7**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Orchestrator 接线（模型物理分工）
  - [x] 8.1 扩 `orchestrator.ts` 构造与 `executeDiscussionMode`
    - 构造函数新增可选 `adjudicatorCaller`（primary gpt-5.5）；`executeDiscussionMode` 内 `resolveTopology` → 基于 `this.llmCaller`(aux) 构造 `critiqueCaller`/`rebuttalCaller`、基于 `this.adjudicatorCaller`(primary) 构造 `adjudicator`，传入 `executeDeliberation`
    - 辩论/主张/Critique/Rebuttal/Vote 走 aux caller，综合/审计/裁决走 primary caller；pool 未配置时 aux 退化为 primary，但保持不同字段引用便于 spy 区分；某 aux key 失败按既有 failMember 降级，不阻塞其它角色
    - 新结构化结果映射回既有 `deliberationSummary`，累计 `critiqueCount/rebuttalCount/adjudicationCount/voteCount`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 8.2 Property test：模型分工路由（P10）
    - 新建 `server/routes/blueprint/brainstorm/model-split.property.test.ts`
    - **Property 10: Model split routes debate to aux and synthesis/audit/adjudication to primary**
    - **Validates: Requirements 8.1, 8.2, 12.5**

  - [x]* 8.3 Unit test：Critique/Rebuttal/Adjudicator 路由 wiring（spies）
    - 注入可区分 aux/primary spy，断言 R1.1/R2.1/R3.1 各调用走对应 caller
    - _Requirements: 1.1, 2.1, 3.1_

- [x] 9. Wall 投影升级（结构化语义边）
  - [x] 9.1 升级 `reasoning-graph-projection.ts`
    - Critique→`conflicts` 边（label「质疑·{severity}」）、Rebuttal→`supports` 边（`defend`→「坚持」、`concede`→「让步」）、综合→`synthesizes`；保持中心问题节点 + 返回前剔除悬挂边，维持 `isGraphRenderable` 不变量
    - _Requirements: 6.5, 6.7_

  - [x]* 9.2 Property test：投影恒可渲染且语义边正确（P8）
    - 扩展 `server/routes/blueprint/brainstorm/reasoning-graph-projection.test.ts`（含结构化 critiques/rebuttals 的任意 session）
    - **Property 8: Projection is always renderable with correct semantic edges**
    - **Validates: Requirements 6.5, 6.7, 12.3**

- [x] 10. 结构化事件端到端发出
  - [x] 10.1 经 `emitBrainstormEvent` 发出四类事件
    - 在引擎/orchestrator 推进点通过 `emitBrainstormEvent` 发出 `brainstorm.challenge.issued`（含 targetClaim/severity/roundNumber）、`brainstorm.rebuttal.issued`（含 challengeId/stance/roundNumber）、`brainstorm.round.completed`（含 convergenceScore/consensusReached/unresolvedCritiqueCount）、`brainstorm.vote.completed`（含 winningOption/margin/isNarrow/voteCount）；每条 payload 必带 jobId/stageId
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 10.2 Unit test：四类事件字段齐备
    - 断言 `brainstorm.challenge.issued`/`brainstorm.rebuttal.issued`/`brainstorm.round.completed`/`brainstorm.vote.completed` 各 payload 字段齐备
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 11. 客户端 store / 墙消费
  - [x] 11.1 扩 `brainstorm-graph-store.ts` 处理 rebuttal
    - 在 `client/src` 的 `brainstorm-graph-store.ts` 新增 `brainstorm.rebuttal.issued` case → `handleChallengeIssued({ kind: "support" })`（responder→challenger），区分 stance；沿用既有端点角色节点存在守卫（`hasChallenger && hasTarget`），客户端侧不产生悬挂边；确认 `BrainstormWallGraph.tsx` / `brainstorm-wall-graph-logic.ts` 消费 support edge + voteOutcome
    - _Requirements: 6.6_

  - [x]* 11.2 Unit test：store 派发序列 → 边/投票结果
    - 在 `client/src` 下补测：派发事件序列后 `challengeEdges`/`voteOutcome` 填充，`brainstorm.rebuttal.issued` → support edge
    - _Requirements: 6.6_

- [x] 12. 诊断扩展
  - [x] 12.1 扩 `getBrainstormDiagnostics` 真实辩论计数
    - 在 `pipeline-integration.ts` 的 `getBrainstormDiagnostics` 既有字段上补 `critiqueCount/rebuttalCount/unresolvedCount/adjudicationCount/voteCount`（由 orchestrator 累计）；session 降级回启发式/单 Agent 时 emit `brainstorm.degraded` 并计入 `degradationCount`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x]* 12.2 Integration test：诊断端点反映真实计数
    - mock 一个 session 后断言 `GET /api/blueprint/diagnostics` brainstorm 段暴露上述计数与降级计数
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 13. 第二阶段 env-gated 非阻塞接线
  - [x] 13.1 在伴随接线注入 adjudicator 并保持保守约束
    - 在 `pipeline-integration.ts`（`assembleBrainstormContext`）把 `primaryCaller` 作为 adjudicator 传入 orchestrator；保持 `second-stage-companion.ts` 的 fire-and-forget 非阻塞、`BLUEPRINT_BRAINSTORM_ENABLED!="true"` / `BUILD_TARGET=test` 未 opt-in 时 `assembleBrainstormContext` 返回 `null` 字节级零变化；引擎任一环节抛错降级回 legacy 路径并使 job 继续，绝不替换确定性 SPEC 文档生成
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4_

- [x] 14. 全局属性测试与回归
  - [x]* 14.1 Property test：降级绝不抛错（P5）
    - 新建 `server/routes/blueprint/brainstorm/deliberation-degradation.property.test.ts`（独立枚举 aux key/critique/rebuttal/adjudicator/topology/vote/projection 的抛错/超时/垃圾返回组合）
    - **Property 5: Degradation never throws**
    - **Validates: Requirements 1.4, 1.6, 2.6, 3.6, 8.5, 9.1, 9.4, 12.4**

  - [x]* 14.2 回归与基线守卫
    - 断言既有 brainstorm 测试保持绿（`pipeline-integration.test.ts`、`reasoning-graph-projection.test.ts`、`reasoning-graph-emitter.test.ts`、`brainstorm-graph-store.*.test.ts`、`pool-llm-caller.test.ts`、`synthesis-audit.test.ts`、`diagnostics.test.ts`）
    - 断言 `BLUEPRINT_BRAINSTORM_ENABLED` 关闭时第二阶段行为字节级不变、无新事件家族（仅 `brainstorm.rebuttal.issued` 加入单一真相源 `shared/blueprint/events.ts`）、`node --run check` 现有 TypeScript 基线错误数不扩大
    - _Requirements: 9.5, 12.1, 12.2_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 复用，不重写：`orchestrator / deliberation-protocol / synthesizer / vote-synthesizer / decision-gate / pipeline-integration / reasoning-graph-projection / reasoning-graph-emitter / brainstorm-graph-store / BrainstormWallGraph` 均已存在；仅 `topology-manager.ts`、`emit-brainstorm-event.ts`、`adjudicator.ts` 为新增。
- 标 `*` 的子任务为可选测试任务（属性测试 / 单元 / 集成 / 回归），可为更快的 MVP 跳过；顶层任务不带 `*`。
- 每条属性测试对应 design 的 Correctness Properties（P1–P13），用 fast-check ≥100 iterations，标注 `// Feature: autopilot-brainstorm-real-collaboration, Property {n}`。
- 模型分工物理隔离：aux pool（`BLUEPRINT_SPEC_DOCS_LLM_POOL_*`）跑主张/Critique/Rebuttal/Vote，primary（`LLM_*` gpt-5.5）跑综合/审计/裁决。
- 旧启发式函数保留为 `legacy*` fallback-only 路径，确保结构化件不可用时零变化回退。
- 确定性 SPEC 文档生成始终是真相源；brainstorm 为绝不阻塞、绝不替代、绝不抛错的 env-gated 伴随侧信道，`BUILD_TARGET=test` 默认关闭，测试经 `vi.stubEnv` opt-in。
- 不做：场景系统 / 3D 引擎重写 / 修改 ChatDev 参考工程。
```