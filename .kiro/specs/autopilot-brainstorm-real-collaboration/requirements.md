# Requirements Document

Autopilot Brainstorm Real Collaboration — 把启发式「辩论」升级为真实多智能体协作引擎（ChatDev 拓扑模型启发），用真实结构化挑战→反驳→裁决喂 3D 墙

## Introduction

WhyBuddy 第二阶段（SPEC 树 / SPEC 文档）的 brainstorm 「伴随运行时」已经接通（见 `autopilot-brainstorm-companion-runtime`）：key pool 并发驱动多角色、主模型综合 + 审计、辩论图投影到 3D 墙。但**协作的核心仍是启发式的**，所以「多智能体辩论真正落地」这件事没落地：

经核验，`server/routes/blueprint/brainstorm/deliberation-protocol.ts` 的当前实现是「扇出 + 正则刮取」：

1. `outputFromMember()` 用正则在每个 Agent **自己**的文本里匹配 `challenge|disagree|risk|concern` 派生「挑战」；`referencedMembers` 只是子串匹配角色名。
2. `challengesFromOutputs()` 把这些正则命中转成 challenge 记录；`computeConvergenceScore()` 是文本相似度启发式。
3. Round 1 = 各自孤立的并行独白（Agent 看不到彼此）；Round 2+ 的 `buildRoundContext()` 确实注入了先前产出并提示「挑战具体点」，所以有**部分**串话，但系统对外暴露的结构化信号（challenge / rebuttal / convergence / 墙面画的图）仍是启发式刮取，而不是真实的「针对某条具体主张的批评 → 被批评方的结构化反驳」交换。

结果：墙面的辩论图稀疏、不可靠，因为上游产生的可靠结构化「挑战」对象很少甚至没有。

本 spec 的目标：**升级 deliberation 核心与事件丰富度**，让「LLM 自主决策 + 多智能体辩论」真实发生——

- 真实结构化批评→反驳轮次：每轮后由专门的 LLM 调用让一个 Agent 批评**另一个** Agent 的**某条具体主张**，返回结构化对象，被挑战方返回结构化反驳；用真实结构化对象替换正则派生的 challenge。
- 真实收敛 / 投票：收敛与「达成共识」由真实主模型裁决或结构化多数投票判定（参考 ChatDev `demo_majority_voting.yaml`），而非文本相似度。
- 拓扑感知协作（ChatDev 风格）：可声明的 Agent 交互图（谁挑战谁、谁综合），而非固定「全并行」；支持默认拓扑加可配置拓扑。
- 真实结构化事件端到端喂 3D 墙：结构化 challenge / rebuttal / vote / convergence 成为一等 `brainstorm.*` 事件 + 节点/边更新，被 `brainstorm-graph-store` 与 `BrainstormWallGraph` 消费，墙面呈现真实协作网络。

本 spec 是**保守升级**：复用既有 `orchestrator / deliberation-protocol / synthesizer / decision-gate / pipeline-integration / brainstorm-graph-store / BrainstormWallGraph`，不从零重写。确定性 SPEC 文档生成始终是真相源；brainstorm 是绝不阻塞、绝不替代确定性生成、绝不抛错的保守伴随侧信道。所有新增能力默认 env-gated、可降级回当前启发式行为，`BUILD_TARGET=test` 默认关闭，不扩大 TypeScript 基线错误数。

参考项目 `./ChatDev-main`（`workflow/*.py`、`yaml_instance/demo_majority_voting.yaml`、`general_problem_solving_team.yaml`、`MACNet_v1.yaml`）**仅作为设计灵感来源，绝不修改、绝不提交**。

## Glossary

- **Deliberation_Engine / 辩论引擎**：`deliberation-protocol.ts` 的升级核心，负责按拓扑组织多轮真实批评→反驳→裁决，替换正则启发式。
- **Critique / 结构化批评**：一个 Agent（challenger）针对另一个 Agent（target）某条**具体主张**（targetClaim）的真实 LLM 批评，结构为 `{ challengerRoleId, targetRoleId, targetClaim, critique, severity }`，由专门的 LLM 调用产出。
- **Rebuttal / 结构化反驳**：被挑战 Agent（responder）对某条 Critique 的真实 LLM 回应，结构为 `{ responderRoleId, challengeId, rebuttal, stance }`，其中 `stance ∈ { "concede", "defend" }`。
- **Adjudicator / 裁决者**：用**主模型 gpt-5.5** 对一轮辩论是否达成共识做结构化裁决（替换 `computeConvergenceScore` 文本相似度）。
- **Majority_Vote / 多数投票**：`vote` 模式下基于各 Agent 结构化投票的多数裁决（参考 ChatDev `demo_majority_voting.yaml`）。
- **Topology / 协作拓扑**：可声明的 Agent 交互图，描述谁挑战谁、谁综合、轮次上限；含一个默认拓扑与可配置拓扑。
- **Topology_Manager / 拓扑管理器**：解析、校验、提供 Topology 的组件；非法/缺失拓扑回退默认拓扑。
- **Aux_Model / 辅模型**：`BLUEPRINT_SPEC_DOCS_LLM_POOL_*` 定义的 5-key ouyi pool，便宜可并发，用于并行 Agent 轮次（生成主张、批评、反驳）。
- **Primary_Model / 主模型**：`gpt-5.5`（`LLM_*`），用于综合（synthesis）、审计（audit）与裁决（adjudication）。
- **Wall_Projection / 墙面投影**：把辩论结构化对象映射成 `BrainstormReasoningGraph` 与 `brainstorm.*` 事件，喂给 `brainstorm-graph-store` 与 `BrainstormWallGraph`。
- **Brainstorm_Event / 辩论事件**：`shared/blueprint/events.ts` 中 `brainstorm` 家族的事件，每条 payload 必带 `jobId` 与 `stageId`。
- **Deterministic_Generation / 确定性生成**：第二阶段按 spec 树 DFS 用 key pool 写 requirements/design/tasks 的既有路径，是产物真相源。
- **Decision_Gate / 决策门**：`decision-gate.ts`，判断某阶段是否启动 brainstorm、用什么 mode、需要哪些角色与拓扑。
- **Brainstorm_Subsystem / 辩论子系统**：`server/routes/blueprint/brainstorm/*` 整体，含 orchestrator / synthesizer / pipeline-integration 等。

## Requirements

### Requirement 1: 真实结构化批评（Critique）替换正则派生挑战

**User Story:** 作为平台，我希望每轮辩论产生的「挑战」是一个 Agent 针对另一个 Agent 某条具体主张的真实 LLM 批评，而不是在自己文本里正则匹配关键词，这样墙上的辩论关系才真实可靠。

#### Acceptance Criteria

1. WHEN 一轮 Agent 主张产出完成 AND Topology 声明某 challenger 角色应批评某 target 角色, THE Deliberation_Engine SHALL 发起一次专门的 Aux_Model LLM 调用, 产出结构化 Critique 对象 `{ challengerRoleId, targetRoleId, targetClaim, critique, severity }`。
2. THE Deliberation_Engine SHALL 为每个 Critique 的 `severity` 取值约束为集合 `{ "low", "medium", "high" }` 之一。
3. THE Deliberation_Engine SHALL 使 Critique 的 `targetClaim` 引用 target 角色本轮产出中的一条具体主张文本, 而非 challenger 自身文本。
4. IF Critique 的 LLM 调用失败或返回的对象无法解析为合法 Critique, THEN THE Deliberation_Engine SHALL 跳过该条 Critique 并继续其余批评, 不抛错且不整局崩溃。
5. THE Deliberation_Engine SHALL NOT 使用正则在 Agent 自身文本中匹配 `challenge|disagree|risk|concern` 作为挑战来源。
6. WHERE 一轮内没有任何合法 Critique 产生, THE Deliberation_Engine SHALL 记录「本轮零挑战」并继续后续轮次或收敛判定, 不抛错。

### Requirement 2: 真实结构化反驳（Rebuttal）

**User Story:** 作为用户，我希望被挑战的 Agent 能针对那条具体批评给出真实的结构化反驳，并明确表态是让步还是坚持，这样辩论才是双向交换而不是单向独白。

#### Acceptance Criteria

1. WHEN 一条 Critique 产生且其 `targetRoleId` 对应的 Agent 可用, THE Deliberation_Engine SHALL 发起一次专门的 Aux_Model LLM 调用, 产出结构化 Rebuttal 对象 `{ responderRoleId, challengeId, rebuttal, stance }`。
2. THE Deliberation_Engine SHALL 使每个 Rebuttal 的 `challengeId` 等于其所回应的 Critique 的标识符。
3. THE Deliberation_Engine SHALL 约束每个 Rebuttal 的 `stance` 取值为集合 `{ "concede", "defend" }` 之一。
4. WHEN 一条 Rebuttal 的 `stance` 为 `"concede"`, THE Deliberation_Engine SHALL 将对应 Critique 标记为已解决（resolved）。
5. WHEN 一条 Rebuttal 的 `stance` 为 `"defend"`, THE Deliberation_Engine SHALL 将对应 Critique 标记为未解决（unresolved）并保留至后续轮次或裁决。
6. IF Rebuttal 的 LLM 调用失败或无法解析为合法 Rebuttal, THEN THE Deliberation_Engine SHALL 将对应 Critique 标记为未解决并继续, 不抛错。

### Requirement 3: 主模型裁决收敛与共识（替换文本相似度）

**User Story:** 作为用户，我希望「是否达成共识」由强主模型基于真实的批评与反驳来裁决，而不是用文本相似度启发式打分。

#### Acceptance Criteria

1. WHEN 一轮的批评与反驳交换完成, THE Adjudicator SHALL 发起一次 Primary_Model LLM 调用, 返回结构化裁决 `{ consensusReached, convergenceScore, unresolvedCritiqueIds, rationale }`。
2. THE Adjudicator SHALL 约束 `convergenceScore` 为闭区间 [0, 1] 内的数值。
3. WHEN 裁决的 `consensusReached` 为 `true` AND 已执行轮次数不小于配置的最小轮次, THE Deliberation_Engine SHALL 结束辩论并进入综合阶段。
4. WHEN 已执行轮次数达到配置的最大轮次, THE Deliberation_Engine SHALL 结束辩论并进入综合阶段, 无论 `consensusReached` 取值。
5. THE Deliberation_Engine SHALL NOT 使用 `computeConvergenceScore` 文本相似度启发式作为共识判定依据。
6. IF Adjudicator 的 LLM 调用失败或无法解析为合法裁决, THEN THE Deliberation_Engine SHALL 将本轮视为未达成共识并继续后续轮次, 直到达到最大轮次为止, 不抛错。
7. WHEN Adjudicator 判定 `consensusReached` 为 `false` 且存在未解决 Critique, THE Deliberation_Engine SHALL 将这些未解决 Critique 作为 dissenting opinions 传递给综合阶段。

### Requirement 4: 结构化多数投票（vote 模式）

**User Story:** 作为用户，我希望 vote 模式下的「达成结论」由各 Agent 的结构化投票多数裁决，参考 ChatDev 的多数投票模型，而不是文本拼接。

#### Acceptance Criteria

1. WHEN session 的 mode 为 `vote`, THE Deliberation_Engine SHALL 收集每个参与 Agent 的结构化投票 `{ roleId, chosenOption, confidence, reasoning }`。
2. THE Majority_Vote SHALL 以各选项累计的票权（按 `confidence` 加权）选出 `winningOption`, 并计算与第二名的 `margin`。
3. WHEN `winningOption` 与第二名的 `margin` 小于配置阈值, THE Majority_Vote SHALL 将结果标记为 `isNarrow` 为 `true` 并保留少数派 `reasoning`。
4. IF 某 Agent 的投票无法解析为合法结构化投票, THEN THE Majority_Vote SHALL 忽略该票并基于剩余有效票裁决, 不抛错。
5. IF 无任何有效投票, THEN THE Deliberation_Engine SHALL 降级到综合阶段并标注「无有效投票」, 不抛错。

### Requirement 5: 拓扑感知协作

**User Story:** 作为维护者，我希望 Agent 之间的交互（谁挑战谁、谁综合、几轮）由可声明的拓扑驱动，而不是写死的「全并行」，这样协作结构可配置、可演进。

#### Acceptance Criteria

1. THE Topology_Manager SHALL 提供一个默认 Topology, 声明参与角色、challenger→target 的批评关系、综合角色与最小/最大轮次。
2. WHEN 一个 brainstorm session 启动, THE Deliberation_Engine SHALL 依据所选 Topology 决定哪些角色批评哪些角色, 而非令所有角色固定全并行无交互。
3. WHERE 提供了具名的可配置 Topology 且其合法, THE Topology_Manager SHALL 使用该具名 Topology 替代默认 Topology。
4. IF 所选 Topology 缺失、引用了未参与角色或包含环导致无法收敛, THEN THE Topology_Manager SHALL 回退到默认 Topology 并记录回退原因, 不抛错。
5. THE Topology_Manager SHALL 校验每条批评关系的 challenger 与 target 均属于本 session 的参与角色集合。

### Requirement 6: 结构化辩论事件喂 3D 墙

**User Story:** 作为用户，我希望墙上看到的 challenge / rebuttal / vote / convergence 来自真实结构化辩论对象，端到端实时呈现真实协作网络。

#### Acceptance Criteria

1. WHEN 一条 Critique 产生, THE Brainstorm_Subsystem SHALL emit 一条 `brainstorm.challenge.issued` 事件, payload 包含 `challengerRoleId`、`targetRoleId`、`targetClaim`、`critiqueSummary`、`severity`、`roundNumber`。
2. WHEN 一条 Rebuttal 产生, THE Brainstorm_Subsystem SHALL emit 一条 `brainstorm.rebuttal.issued` 事件, payload 包含 `responderRoleId`、`challengeId`、`rebuttalSummary`、`stance`、`roundNumber`。
3. WHEN Adjudicator 完成一轮裁决, THE Brainstorm_Subsystem SHALL emit 一条 `brainstorm.round.completed` 事件, payload 包含 `roundNumber`、`convergenceScore`、`consensusReached`、`unresolvedCritiqueCount`。
4. WHEN Majority_Vote 完成, THE Brainstorm_Subsystem SHALL emit 一条 `brainstorm.vote.completed` 事件, payload 包含 `winningOption`、`margin`、`isNarrow`、`voteCount`。
5. THE Wall_Projection SHALL 把 Critique 映射为 `conflicts`/`questions` 语义边、把 Rebuttal 映射为 `supports` 语义边、把综合映射为 `synthesizes` 语义边, 写入 `BrainstormReasoningGraph`。
6. WHEN `brainstorm-graph-store` 收到上述事件, THE Brainstorm_Subsystem SHALL 使 `BrainstormWallGraph` 能据此渲染出包含真实挑战连线与投票结果的协作网络。
7. THE Wall_Projection SHALL 使每个产出的 `BrainstormReasoningGraph` 通过 `isGraphRenderable` 校验（无悬挂边、含中心问题节点）。

### Requirement 7: 每条辩论事件携带 jobId 与 stageId

**User Story:** 作为维护者，我希望每条 brainstorm 事件 payload 都带 jobId 和 stageId，避免出现 node.created 缺 jobId 而被前端丢弃的那类回归。

#### Acceptance Criteria

1. THE Brainstorm_Subsystem SHALL 在每条 `brainstorm.*` 事件 payload 中包含非空 `jobId`。
2. THE Brainstorm_Subsystem SHALL 在每条 `brainstorm.*` 事件 payload 中包含非空 `stageId`。
3. IF 某条待发出的 `brainstorm.*` 事件缺少 `jobId` 或 `stageId`, THEN THE Brainstorm_Subsystem SHALL 跳过该事件的发出而非发出残缺事件, 并记录原因。

### Requirement 8: 模型分工（辅模型并行辩论 / 主模型综合审计裁决）

**User Story:** 作为用户，我希望便宜的辅模型并行干辩论脏活，强的主模型负责综合、审计与裁决，二者物理隔离。

#### Acceptance Criteria

1. WHEN Agent 生成主张、Critique 或 Rebuttal, THE Deliberation_Engine SHALL 使用 Aux_Model（`BLUEPRINT_SPEC_DOCS_LLM_POOL_*`）执行这些调用。
2. WHEN 执行综合（synthesis）、审计（audit）或裁决（adjudication）, THE Brainstorm_Subsystem SHALL 使用 Primary_Model（`LLM_*` gpt-5.5）执行这些调用。
3. THE Brainstorm_Subsystem SHALL 使 Aux_Model 与 Primary_Model 使用各自独立的 baseUrl 与 key 配置, 物理隔离。
4. WHEN Aux_Model key pool 未配置, THE Deliberation_Engine SHALL 回退到 Primary_Model 执行辩论调用, 不抛错。
5. WHEN 某个 Aux_Model key 调用失败, THE Deliberation_Engine SHALL 令该角色按既有降级走 fallback 而不阻塞其它角色。

### Requirement 9: 保守伴随（不阻塞、不替代、绝不抛错）

**User Story:** 作为维护者，我希望这套真实协作引擎是绝对保守的伴随侧信道：任何环节失败都优雅降级到当前行为，绝不阻塞或替代确定性生成。

#### Acceptance Criteria

1. WHEN Deliberation_Engine、Critique、Rebuttal、Adjudicator、Majority_Vote 或 Wall_Projection 任一环节抛错, THE Brainstorm_Subsystem SHALL 降级到既有路径并使 job 继续, 不向用户抛错。
2. THE Brainstorm_Subsystem SHALL NOT 用辩论结论覆盖或替代 Deterministic_Generation 的产物。
3. WHEN brainstorm 作为侧信道运行, THE Brainstorm_Subsystem SHALL 以非阻塞异步方式运行, 使 stage 的 HTTP 响应（job 创建、route 生成）不因辩论而变慢或超时。
4. WHERE 升级后的 Deliberation_Engine 任一环节不可用, THE Deliberation_Engine SHALL 降级回当前启发式 deliberation 行为, 不抛错。
5. WHEN `BLUEPRINT_BRAINSTORM_ENABLED` 为 `"false"` 或未设置, THE Brainstorm_Subsystem SHALL 与本 spec 之前的行为完全一致, 无新副作用。

### Requirement 10: 环境开关与默认关闭

**User Story:** 作为维护者，我希望这套升级默认 env-gated，测试构建默认关闭，避免影响现有测试基线。

#### Acceptance Criteria

1. THE Brainstorm_Subsystem SHALL 由 `BLUEPRINT_BRAINSTORM_ENABLED` 主开关控制真实协作引擎是否启用。
2. WHEN `BUILD_TARGET` 为 `"test"`, THE Brainstorm_Subsystem SHALL 默认关闭真实协作引擎, 除非测试显式 opt-in 打开。
3. WHERE 真实协作引擎关闭, THE Decision_Gate SHALL 维持现有判定路径不变。
4. THE Brainstorm_Subsystem SHALL 经 Decision_Gate 决定某阶段是否启动 session、使用哪个 mode、哪些角色与 Topology。

### Requirement 11: 可观测与诊断

**User Story:** 作为维护者，我希望从诊断端点看到真实协作引擎的运行状态，确认它真的在跑真实辩论而非启发式。

#### Acceptance Criteria

1. WHEN 调用 `GET /api/blueprint/diagnostics`, THE Brainstorm_Subsystem SHALL 返回 brainstorm 诊断, 包含 `enabled`、`activeSessionsCount`、`totalSessionsCompleted`、`degradationCount`、平均时长、`perStageConfig` 与 pool 使用情况。
2. WHEN 真实协作引擎产生 Critique、Rebuttal 或裁决, THE Brainstorm_Subsystem SHALL 在诊断中反映真实结构化辩论计数（如本 session 的批评数、反驳数、未解决数）。
3. WHEN 某 session 降级回启发式或单 Agent, THE Brainstorm_Subsystem SHALL emit `brainstorm.degraded` 事件并计入 `degradationCount`。

### Requirement 12: 工程基线与属性测试

**User Story:** 作为维护者，我希望升级不扩大 TypeScript 基线错误数，并用属性测试锁住关键不变量。

#### Acceptance Criteria

1. THE 改动 SHALL NOT 扩大 `node --run check` 的现有 TypeScript 基线错误数。
2. THE 改动 SHALL NOT 引入破坏性后端契约字段、SHALL NOT 扩展 `brainstorm` 之外的事件家族、SHALL NOT 改 `/tasks` 深链。
3. WHEN 对任意 session 状态映射成 `BrainstormReasoningGraph`, THE Wall_Projection SHALL 始终产出通过 `isGraphRenderable` 校验的图（属性测试，fast-check）。
4. WHEN Aux_Model、Critique、Rebuttal、Adjudicator 在任意失败组合下运行, THE Brainstorm_Subsystem SHALL 不抛错且降级返回（属性测试，fast-check）。
5. WHEN 真实协作引擎执行, THE 测试 SHALL 断言辩论调用走 Aux_Model caller、综合/审计/裁决调用走 Primary_Model caller（二者可注入、可区分）。
6. WHEN 任意合法或非法 Topology 输入解析, THE Topology_Manager SHALL 始终返回一个合法可执行 Topology（合法则用之，否则回退默认）（属性测试，fast-check）。
