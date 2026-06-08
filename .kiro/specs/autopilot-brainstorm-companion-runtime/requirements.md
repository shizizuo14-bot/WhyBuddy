# Requirements Document

Autopilot Brainstorm Companion Runtime — 多 Agent 辩论运行时（key pool 并发 + 主模型综合审计 + 驱动 3D 墙）

## Introduction

当前第二阶段（SPEC 树 / SPEC 文档）走的是**确定性生成**：按 spec 树 DFS，每个节点用 key pool 的 5 个 ouyi key 并行写 requirements/design/tasks。这只是「并行抄写」，不是「多 Agent 自主规划/辩论」。因此 3D 墙上的 flow 看起来整齐有序，而不是参考图那种「中心问题 → 多角色发散 → 挑刺 → 接地 → 投票 → 收敛」的有机推演图。

代码里**已经存在**一套多 Agent 辩论子系统（`server/routes/blueprint/brainstorm/*`：`BrainstormOrchestrator`、`deliberation-protocol`、`vote-synthesizer`、`evidence-trail`、`synthesizer`、`role-registry`、`decision-gate`、`pipeline-integration`），由 `BLUEPRINT_BRAINSTORM_ENABLED` 控制。但它有三个断点：

1. **没接 key pool**：`BrainstormOrchestrator` 只吃单个注入的 `llmCaller`，所有角色串在同一个 LLM 上 → 不是并行多 Agent。
2. **没驱动 3D 墙**：辩论产出的 `branchNodes / edges / challenges / votes` 没有映射成 `BrainstormReasoningGraph`（墙面 structured graph 契约），所以墙上看不到辩论。
3. **没接进第二阶段主链 / 没有主模型审计收口**：`executeStageWithBrainstorm` 是独立示例，未确认接到实际 stage driver；也没有形式化「辅模型（ouyi pool）并行辩论 → 主模型（gpt-5.5）综合 + 审计」的分工。

本 spec 的目标：把已有的 brainstorm 子系统**接通成一条可观察、可控、可审计的伴随运行时**——用 5 个 ouyi pool key 并行驱动多角色辩论，用主 gpt-5.5 做综合与审计，并把辩论图实时喂给 3D 墙（复用已修通的 `BlueprintWallTexture` structured graph 渲染路径），为后续「场景化推演引擎」铺底。

本 spec **不**重写 3D 引擎、**不**新增场景系统、**不**改 spec 树/文档的最终产物形态，只新增「辩论伴随层 + 编排接线 + 墙面投影 + 主审计收口」。所有新增能力默认 env-gated、可降级回单 Agent，不扩大现有测试基线。

## Glossary

- **Companion runtime / 伴随运行时**：多角色辩论层（挑刺者/接地者/规划/研究/综合等），在第二阶段按需触发，产出推演图与综合结论。
- **Key pool / 池**：`BLUEPRINT_SPEC_DOCS_LLM_POOL_*` 定义的多 key（当前 5 个 ouyi key），用于并发调用辅模型。
- **辅模型 / aux model**：`ouyi-5-preview-thinking`（pool），便宜、可并发、质量偏低 → 干辩论脏活。
- **主模型 / primary model**：`gpt-5.5`（`LLM_*`），贵、强 → 做综合（synthesis）与审计（audit）收口。
- **BrainstormReasoningGraph**：`shared/blueprint/brainstorm-reasoning-graph.ts` 定义的墙面推演图契约（中心问题 + 节点 + 语义边 + telemetry + console lines），3D 墙 `BlueprintWallTexture` 已能渲染。
- **Pool-backed llmCaller**：把 `BrainstormOrchestrator` 的单 `llmCaller` 换成「按角色从 pool 取 key 并发调 aux 模型」的 caller。
- **Decision Gate**：`decision-gate.ts`，判断某阶段是否需要 brainstorm、用什么 mode、需要哪些角色。

## Requirements

### Requirement 1: Pool-backed 并发多角色辩论

**User Story:** 作为平台，我希望多角色辩论用 key pool 的多个 key 并发调用辅模型，这样多个角色能真正同时推理，而不是串在一个 LLM 上。

#### Acceptance Criteria

1. WHEN brainstorm session 启动且 key pool 已配置（`parseKeyPoolFromEnv()` 返回非空）THEN 系统 SHALL 用 pool-backed `llmCaller` 注入 `BrainstormOrchestrator`，每个 crew member 的 LLM 调用 SHALL 经 `pool.next()` 取一个 key 调辅模型。
2. WHEN 同一轮（round）有多个角色需要推理 AND mode 为 `vote` 或 `division`（并发模式）THEN 这些角色的 LLM 调用 SHALL 并发执行（受 pool 并发度限制），而非串行。
3. WHEN key pool 未配置 THEN 系统 SHALL 回退到单 `llmCaller`（主模型或现有行为），不报错。
4. WHEN 某个 key 调用失败（503/超时）THEN 该角色 SHALL 按既有降级走 fallback（不阻塞其它角色），并记录原因；不得整局崩溃。
5. The pool-backed caller SHALL NOT 改变 `BrainstormOrchestrator` 的对外接口（仍是 `LLMCallerFn`），只替换注入实现。

### Requirement 2: 主模型综合 + 审计收口

**User Story:** 作为用户，我希望便宜的辅模型并行辩论完之后，由强的主模型做综合和审计把关，避免辅模型质量低导致结论不可信。

#### Acceptance Criteria

1. WHEN 辩论 session 进入 `synthesizing` THEN 综合（`BrainstormSynthesizer.synthesize`）SHALL 由**主模型 gpt-5.5** 执行（不是 pool 辅模型）。
2. WHEN 综合完成 THEN 系统 SHALL 用主模型对综合结论做一次**审计/校验**（结论是否被证据支撑、是否有未解决挑战、是否存在编造），并把审计结果写入 checks ledger（复用 `evidence-trail` / `QA_LEDGER` 通道）。
3. WHEN 审计判定不通过（证据不足/未解决挑战过多）THEN 系统 SHALL 在产出中标注「需复议」并保留 dissenting opinions，不得静默当作通过。
4. The 主模型综合/审计 SHALL 复用现有 `LLM_*` 配置（gpt-5.5），与 pool 辅模型物理隔离（不同 baseUrl/key）。

### Requirement 3: 辩论图投影到 3D 墙

**User Story:** 作为用户，我希望在 3D 墙上实时看到辩论过程（中心问题、各角色、挑刺连线、投票、收敛），而不是整齐的 spec 树派生图。

#### Acceptance Criteria

1. WHEN 辩论 session 产生 `branchNodes / edges / challenges / rebuttals / votes / synthesis` THEN 系统 SHALL 把它们映射成 `BrainstormReasoningGraph`（中心问题节点 + 角色节点 + 语义边 + telemetry + consoleLines）。
2. WHEN 映射 THEN 边的语义类型 SHALL 体现辩论关系：挑战→`conflicts`/`questions`、接地引用→`cites`/`depends_on`、综合→`synthesizes`、支撑→`supports`。
3. WHEN 辩论进行中 THEN 该图 SHALL 通过既有 artifact（`brainstorm_reasoning_graph`）/ 事件通道增量喂给前端，`BlueprintWallTexture` 的 structured graph 路径 SHALL 渲染它（无需再改渲染器）。
4. WHEN telemetry 可得 THEN 图 SHALL 填充 `tokenBurn / sourceCount / remainingBudget / elapsedMs / activeRoleCount`（来自 session token 统计与角色数）。
5. The 映射 SHALL 通过 `isGraphRenderable` 校验（所有边的 source/target 必须是图中节点，含中心问题节点）。

### Requirement 4: 第二阶段接线与触发

**User Story:** 作为用户，我希望在第二阶段（SPEC 树/文档）能真正触发辩论伴随层，而不是只走确定性 DFS 抄写。

#### Acceptance Criteria

1. WHEN 第二阶段开始 AND `BLUEPRINT_BRAINSTORM_ENABLED === "true"` THEN 系统 SHALL 经 Decision Gate 判断是否启动 brainstorm session（mode/roles）。
2. WHEN Decision Gate 判定需要 brainstorm THEN 系统 SHALL 启动 session 并把综合结论作为该阶段的上游上下文（喂给后续 spec 文档生成或作为推演结论）。
3. WHEN brainstorm 未启用或 Decision Gate 判定不需要 THEN 系统 SHALL 维持现有确定性生成路径不变（零行为变化）。
4. The 触发 SHALL 默认 env-gated（`BLUEPRINT_BRAINSTORM_ENABLED`），`BUILD_TARGET=test` 默认关闭，仅显式 opt-in 打开，保持现有测试基线。

### Requirement 5: 可观测与诊断

**User Story:** 作为维护者，我希望能从诊断端点看到伴随运行时的真实状态（是否启用、活跃 session、降级次数、pool 使用），便于确认它真的在跑而不是假装。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/blueprint/diagnostics` THEN 响应 SHALL 包含 brainstorm 诊断（`enabled / activeSessionsCount / totalSessionsCompleted / degradationCount / 平均时长 / perStageConfig`，复用 `getBrainstormDiagnostics`）。
2. WHEN pool-backed caller 生效 THEN 诊断 SHALL 反映 pool 是否在用（key 数 / 实际并发 / 降级计数）。
3. WHEN session 降级回单 Agent THEN 系统 SHALL emit `brainstorm.degraded` 事件并计入 `degradationCount`。

### Requirement 6: 安全降级与不破坏现状

**User Story:** 作为维护者，我希望这套伴随层任何环节失败都能优雅降级，且不扩大现有 TypeScript / 测试基线。

#### Acceptance Criteria

1. WHEN 伴随层任一环节抛错（pool / 编排 / 综合 / 审计 / 映射）THEN 系统 SHALL 降级到既有路径（单 Agent / 确定性生成），不向用户抛错、不阻塞 job。
2. WHEN 关闭 `BLUEPRINT_BRAINSTORM_ENABLED` THEN 全链路 SHALL 与本 spec 之前的行为完全一致（无新副作用）。
3. The 改动 SHALL NOT 扩大 `node --run check` 的现有 TypeScript 基线错误数。
4. The 改动 SHALL NOT 改后端契约的破坏性字段、socket 事件家族（仍归入既有 `brainstorm` / `spec` 家族）、`/tasks` 深链。

### Requirement 7: 回归与属性测试

**User Story:** 作为维护者，我希望关键不变量有属性测试锁住（图可渲染、降级不抛错、主辅模型隔离）。

#### Acceptance Criteria

1. WHEN 对任意 session 状态映射成 `BrainstormReasoningGraph` THEN 输出 SHALL 始终通过 `isGraphRenderable`（无悬挂边、含中心问题节点）。
2. WHEN pool caller 在任意 key 失败组合下运行 THEN `startSession`/`executeStageWithBrainstorm` SHALL 不抛错（降级返回）。
3. WHEN 综合/审计执行 THEN 测试 SHALL 断言综合用主模型 caller、辩论用 pool caller（两者可注入、可区分）。
