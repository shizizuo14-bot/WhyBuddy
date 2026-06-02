# Requirements Document

## Introduction

将 WhyBuddy `/autopilot` 蓝图驾驶舱从当前的单 Agent 线性执行改造为多智能体协作决策系统。系统由 LLM 自主决策是否需要头脑风暴（多分支推理）、是否需要不同角色参与、是否需要调用工具链、以及每个阶段的协作模式。协作过程通过统一运行时事件总线实时推送到前端，并在 3D 墙面上以思维导图风格动态渲染多分支推理树。

## Glossary

- **Orchestrator**: 多智能体协作的顶层调度器，负责接收任务目标、决策协作模式、分配角色、汇总结果
- **Crew_Member**: 参与协作的单个智能体角色实例，具有特定职责（规划师/架构师/执行者/审计员等）
- **Brainstorm_Session**: 一次多分支推理会话，包含多个 Crew_Member 的并行或串行推理分支
- **Collaboration_Mode**: 协作模式枚举，包括 discussion（讨论）、vote（投票）、division（分工）、audit（审计）
- **Decision_Gate**: LLM 自主决策点，决定是否启动头脑风暴、选择协作模式、是否调用工具链
- **Branch_Node**: 思维导图中的一个推理节点，代表一次 Agent 的推理/决策/行动
- **EventBus**: 统一运行时事件总线，负责将协作事件从服务端 relay 到前端 Store
- **Wall_Graph**: 3D 墙面上的思维导图可视化组件，使用 dagre 布局 + Canvas2D 绘制 + Three.js CanvasTexture
- **Tool_Proxy**: 工具调用代理层，统一封装 Docker sandbox / MCP / GitHub / Skills 的调用接口
- **Stage_Activation**: 阶段激活机制，控制哪些角色在哪个阶段被激活参与协作

## Requirements

### Requirement 1: LLM 自主决策门控

**User Story:** As a 项目总设计师, I want the system to let LLM autonomously decide whether brainstorming is needed at each stage, so that the system does not perform unnecessary multi-agent collaboration when simple linear execution suffices.

#### Acceptance Criteria

1. WHEN a new stage begins in the autopilot pipeline, THE Orchestrator SHALL invoke a Decision_Gate LLM call to determine the collaboration strategy for that stage
2. THE Decision_Gate SHALL output a structured decision containing: whether brainstorming is needed (boolean), recommended Collaboration_Mode, list of required role IDs, and list of required tool categories
3. WHEN the Decision_Gate determines brainstorming is not needed, THE Orchestrator SHALL proceed with single-agent linear execution using the existing workflow engine path
4. WHEN the Decision_Gate determines brainstorming is needed, THE Orchestrator SHALL spawn a Brainstorm_Session with the recommended configuration
5. THE Decision_Gate SHALL complete its decision within 5 seconds of receiving stage context
6. IF the Decision_Gate LLM call fails or times out, THEN THE Orchestrator SHALL fall back to single-agent linear execution and emit a degradation event

### Requirement 2: 多智能体角色注册与生命周期

**User Story:** As a 项目总设计师, I want the system to dynamically instantiate and manage multiple agent roles during a brainstorm session, so that different perspectives contribute to the decision-making process.

#### Acceptance Criteria

1. THE Orchestrator SHALL maintain a role registry containing at least 6 predefined roles: Decider (决策者), Planner (规划师), Architect (架构师), Executor (执行者), Auditor (审计员), and UI_Previewer (UI 预览师)
2. WHEN a Brainstorm_Session starts, THE Orchestrator SHALL instantiate only the Crew_Members specified by the Decision_Gate output
3. WHILE a Brainstorm_Session is active, THE Orchestrator SHALL track each Crew_Member state as one of: idle, thinking, acting, observing, completed, or failed
4. WHEN a Crew_Member completes its assigned reasoning task, THE Orchestrator SHALL collect its output and mark it as completed
5. IF a Crew_Member fails or exceeds its iteration budget, THEN THE Orchestrator SHALL mark it as failed, log the failure reason, and continue the session without that member
6. WHEN all active Crew_Members have reached a terminal state (completed or failed), THE Orchestrator SHALL proceed to the synthesis phase

### Requirement 3: 协作模式调度

**User Story:** As a 项目总设计师, I want the system to support multiple collaboration patterns (discussion, vote, division, audit), so that the most appropriate pattern is used for each type of decision.

#### Acceptance Criteria

1. WHEN Collaboration_Mode is "discussion", THE Orchestrator SHALL execute Crew_Members sequentially, passing each member's output as context to the next member
2. WHEN Collaboration_Mode is "vote", THE Orchestrator SHALL execute all Crew_Members in parallel on the same prompt, then synthesize results by majority or weighted scoring
3. WHEN Collaboration_Mode is "division", THE Orchestrator SHALL split the task into sub-tasks and assign each sub-task to a specific Crew_Member for parallel execution
4. WHEN Collaboration_Mode is "audit", THE Orchestrator SHALL execute a primary Crew_Member first, then pass its output to an Auditor Crew_Member for review and validation
5. THE Orchestrator SHALL emit a `brainstorm.mode.selected` event when a Collaboration_Mode is chosen, containing the mode name and participating role IDs
6. WHILE a Brainstorm_Session is executing in any mode, THE Orchestrator SHALL enforce a maximum total token budget per session, configurable via environment variable `BRAINSTORM_MAX_TOKENS`

### Requirement 4: 工具链代理与调用决策

**User Story:** As a 项目总设计师, I want each Crew_Member to be able to invoke tools (Docker sandbox, MCP, GitHub, Skills) when the LLM decides tool use is necessary, so that agents can ground their reasoning in real execution results.

#### Acceptance Criteria

1. THE Tool_Proxy SHALL provide a unified interface for invoking Docker sandbox commands, MCP tool calls, GitHub API operations, and registered Skills
2. WHEN a Crew_Member's LLM output contains a tool invocation request, THE Tool_Proxy SHALL validate the request against the Crew_Member's permission scope before execution
3. WHEN a tool invocation succeeds, THE Tool_Proxy SHALL return the result to the requesting Crew_Member and emit a `brainstorm.tool.completed` event
4. IF a tool invocation fails, THEN THE Tool_Proxy SHALL return an error summary to the Crew_Member and emit a `brainstorm.tool.failed` event
5. THE Tool_Proxy SHALL enforce a per-session tool invocation limit, configurable via environment variable `BRAINSTORM_MAX_TOOL_CALLS`, defaulting to 20
6. WHILE Docker is not reachable, THE Tool_Proxy SHALL fall back to simulated responses for Docker-dependent tools and emit a degradation event

### Requirement 5: 统一运行时事件总线集成

**User Story:** As a 项目总设计师, I want all multi-agent collaboration events to flow through the existing EventBus and Socket.IO relay, so that the frontend can consume them in real-time without a separate transport layer.

#### Acceptance Criteria

1. THE Orchestrator SHALL emit events through the existing `BlueprintEventBus` using the `brainstorm.*` event family prefix
2. THE EventBus SHALL relay all `brainstorm.*` events to connected Socket.IO clients subscribed to the corresponding job room
3. WHEN a Branch_Node is created during collaboration, THE Orchestrator SHALL emit a `brainstorm.node.created` event containing the node ID, parent node ID, role ID, node type, and initial status
4. WHEN a Branch_Node status changes, THE Orchestrator SHALL emit a `brainstorm.node.updated` event containing the node ID and new status
5. WHEN a Brainstorm_Session completes, THE Orchestrator SHALL emit a `brainstorm.session.completed` event containing the session ID, synthesis result summary, and total token usage
6. THE EventBus SHALL maintain event ordering guarantees within a single Brainstorm_Session (events for the same session arrive in causal order)

### Requirement 6: 前端实时状态管理

**User Story:** As a 项目总设计师, I want the frontend store to incrementally build the brainstorm graph from streaming events, so that the wall visualization updates in real-time as agents collaborate.

#### Acceptance Criteria

1. THE blueprint-realtime-store SHALL maintain a `brainstormGraph` slice containing nodes (Branch_Node[]) and edges (parent-child relationships)
2. WHEN a `brainstorm.node.created` event is received, THE store SHALL append the new node and its parent edge to the brainstormGraph slice
3. WHEN a `brainstorm.node.updated` event is received, THE store SHALL update the corresponding node's status and optional payload fields
4. THE store SHALL maintain a bounded queue of at most 500 Branch_Nodes per active session to prevent unbounded memory growth
5. WHEN a `brainstorm.session.completed` event is received, THE store SHALL mark the session as finalized and stop accepting further node updates for that session
6. THE store SHALL expose fine-grained selectors for: all nodes, nodes by role, nodes by status, and the current session metadata

### Requirement 7: 3D 墙面思维导图实时渲染

**User Story:** As a 项目总设计师, I want the brainstorm collaboration process to be visualized as a mind-map style graph on the 3D wall, so that I can observe the multi-agent reasoning process in real-time.

#### Acceptance Criteria

1. THE Wall_Graph SHALL render Branch_Nodes as card-shaped elements arranged in a left-to-right tree layout using dagre
2. THE Wall_Graph SHALL connect parent-child nodes with bezier curve dashed lines, consistent with the existing BlueprintWallTexture rendering style
3. THE Wall_Graph SHALL assign distinct colors to different node types: decision (teal), thinking (indigo), action (amber), observation (pink), synthesis (emerald), and error (red)
4. WHEN a new Branch_Node is added to the brainstormGraph, THE Wall_Graph SHALL re-compute the dagre layout and redraw the canvas within the next animation frame
5. THE Wall_Graph SHALL display each node's title (truncated to 22 characters), role label, and status indicator dot
6. WHILE a Brainstorm_Session is active, THE Wall_Graph SHALL animate newly added nodes with a fade-in transition over 300ms
7. THE Wall_Graph SHALL scale the graph to fit within the wall bounds, using the same adaptive scaling logic as the existing BlueprintWallTexture

### Requirement 8: 协作结果综合与输出

**User Story:** As a 项目总设计师, I want the system to synthesize multi-agent brainstorm results into a single coherent output that feeds back into the autopilot pipeline, so that the collaboration produces actionable decisions.

#### Acceptance Criteria

1. WHEN a Brainstorm_Session reaches the synthesis phase, THE Orchestrator SHALL invoke a synthesis LLM call with all Crew_Member outputs as context
2. THE synthesis output SHALL contain: a final decision or recommendation, confidence score (0-1), key reasoning points from each contributing role, and any dissenting opinions
3. WHEN the synthesis is complete, THE Orchestrator SHALL feed the result back into the autopilot pipeline as the stage output, replacing what would have been the single-agent output
4. THE Orchestrator SHALL persist the full Brainstorm_Session (all Branch_Nodes, edges, and synthesis) to the artifact memory store for replay and provenance
5. IF the synthesis LLM call fails, THEN THE Orchestrator SHALL use the highest-confidence individual Crew_Member output as fallback and emit a degradation event

### Requirement 9: 记忆管理与回放支持

**User Story:** As a 项目总设计师, I want brainstorm sessions to be persisted and replayable, so that I can review past collaboration decisions and their reasoning chains.

#### Acceptance Criteria

1. THE Orchestrator SHALL persist each Brainstorm_Session as an artifact in the existing blueprint artifact memory store, keyed by job ID and session ID
2. THE persisted artifact SHALL contain: session metadata (mode, roles, timestamps), all Branch_Nodes with their full payloads, all edges, synthesis result, and token usage breakdown per role
3. WHEN a replay is requested via `GET /api/blueprint/jobs/:id/brainstorm/:sessionId`, THE system SHALL return the full session graph in a format consumable by the Wall_Graph renderer
4. THE replay response SHALL include chronological ordering information so the frontend can animate the replay at configurable speed
5. THE artifact memory store SHALL retain brainstorm sessions for the same duration as other blueprint job artifacts (governed by existing retention policy)

### Requirement 10: 优雅降级与容错

**User Story:** As a 项目总设计师, I want the multi-agent system to degrade gracefully when resources are constrained, so that the autopilot pipeline never blocks due to brainstorm infrastructure failures.

#### Acceptance Criteria

1. IF the LLM provider is unreachable during a Brainstorm_Session, THEN THE Orchestrator SHALL terminate the session, emit an error event, and fall back to single-agent execution for the current stage
2. IF total token usage exceeds `BRAINSTORM_MAX_TOKENS`, THEN THE Orchestrator SHALL stop spawning new Crew_Member iterations and proceed to synthesis with available outputs
3. WHILE the system is in degraded mode (any capability bridge reporting fallback), THE Decision_Gate SHALL bias toward single-agent execution to reduce resource pressure
4. THE Orchestrator SHALL emit a `brainstorm.degraded` event whenever a fallback path is taken, containing the degradation reason and affected component
5. IF a Brainstorm_Session has been running for more than 120 seconds without reaching synthesis, THEN THE Orchestrator SHALL force-terminate remaining Crew_Members and proceed to synthesis with partial results
6. THE diagnostics endpoint `GET /api/blueprint/diagnostics` SHALL include a `brainstormOrchestrator` entry reporting: active sessions count, total sessions completed, degradation count, and average session duration

