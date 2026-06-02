# Implementation Plan: Autopilot Multi-Agent Brainstorm

## Overview

将 `/autopilot` 蓝图驾驶舱从单 Agent 线性执行扩展为多智能体协作决策系统。实现分为 9 个阶段：共享契约、Decision Gate、Brainstorm Orchestrator、Tool Proxy、Synthesis Engine、事件集成、前端 Store、墙面渲染、记忆与诊断，最后通过属性测试和集成测试验证正确性。

## Tasks

- [x] 1. Phase 1: 共享契约与类型基础
  - [x] 1.1 Create `shared/blueprint/brainstorm-contracts.ts` with all shared types
    - Define `CollaborationMode`, `BrainstormRoleId`, `ToolCategory` type unions
    - Define `DecisionGateInput`, `DecisionGateOutput` interfaces
    - Define `BranchNodeType`, `BranchNodeStatus`, `BranchNode`, `BranchEdge` interfaces
    - Define `CrewMemberState`, `CrewMemberInstance`, `CrewMemberOutput` interfaces
    - Define `BrainstormSession`, `SessionConfig` interfaces
    - Define `ToolInvocationRequest`, `ToolInvocationResult`, `ToolInvocationRecord` interfaces
    - Define `ToolPermissionScope` interfaces
    - Define `SynthesisInput`, `SynthesisResult` interfaces
    - Define `BrainstormSessionArtifact` interface for persistence
    - Define `BrainstormDiagnostics` interface
    - _Requirements: 1.2, 2.1, 2.3, 3.1-3.4, 4.1, 5.3, 6.1, 8.2, 9.2, 10.6_

  - [x] 1.2 Create brainstorm event type extensions in `shared/blueprint/events.ts`
    - Add `"brainstorm"` to `BlueprintGenerationEventFamily` union (13th family)
    - Add all `brainstorm.*` event types to `BlueprintGenerationEventType`
    - Define `BrainstormNodeCreatedPayload`, `BrainstormNodeUpdatedPayload` interfaces
    - Define `BrainstormSessionCompletedPayload`, `BrainstormDegradedPayload` interfaces
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 10.4_

  - [x] 1.3 Add environment variable declarations and defaults
    - Add `BRAINSTORM_MAX_TOKENS` (default 50000) to env config
    - Add `BRAINSTORM_MAX_TOOL_CALLS` (default 20) to env config
    - Add `BRAINSTORM_SESSION_TIMEOUT_MS` (default 120000) to env config
    - Add `BRAINSTORM_DECISION_GATE_TIMEOUT_MS` (default 5000) to env config
    - Add `BLUEPRINT_BRAINSTORM_ENABLED` (default "false") master switch
    - _Requirements: 3.6, 4.5, 10.5_

  - [x] 1.4 Write unit tests for shared contracts type validation
    - Test that all type unions are exhaustive
    - Test default environment variable parsing
    - _Requirements: 1.2, 3.6_

- [ ] 2. Phase 2: Role Registry 与 Decision Gate
  - [x] 2.1 Create `server/routes/blueprint/brainstorm/role-registry.ts`
    - Implement `BRAINSTORM_ROLE_REGISTRY` with 6 predefined roles
    - Define system prompts, max iterations, and tool permissions per role
    - Export `getBrainstormRole(id)` and `getAllBrainstormRoles()` helpers
    - _Requirements: 2.1_

  - [-] 2.2 Create `server/routes/blueprint/brainstorm/decision-gate.ts`
    - Implement `DecisionGate.decide(input)` method
    - Build LLM prompt with stage context and degradation state
    - Parse structured JSON output against `DecisionGateOutput` schema
    - Implement 5-second timeout with `AbortController`
    - Implement fallback: on any error return `{ brainstormNeeded: false }`
    - Emit `brainstorm.degraded` event on failure/timeout
    - Implement degraded-mode bias: when bridges report fallback, bias toward false
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.3_

  - [-] 2.3 Write property test for Decision Gate schema completeness (Property 1)
    - **Property 1: Decision Gate schema completeness**
    - For any valid LLM response, verify all required fields present and valid
    - **Validates: Requirements 1.2**

  - [-] 2.4 Write property test for Decision Gate routing correctness (Property 2)
    - **Property 2: Decision Gate routing correctness**
    - Verify brainstormNeeded=false routes to single-agent, true spawns session
    - **Validates: Requirements 1.3, 1.4**

  - [-] 2.5 Write property test for Decision Gate failure fallback (Property 3)
    - **Property 3: Decision Gate failure fallback**
    - For any error during LLM invocation, verify fallback to single-agent + degraded event
    - **Validates: Requirements 1.6, 10.4**

  - [-] 2.6 Write property test for degraded mode bias (Property 26)
    - **Property 26: Degraded mode biases toward single-agent**
    - When capability bridges report fallback, Decision Gate outputs brainstormNeeded=false
    - **Validates: Requirements 10.3**

  - [-] 2.7 Write unit tests for Decision Gate
    - Test prompt construction with various stage contexts
    - Test JSON parsing with malformed responses
    - Test timeout behavior
    - Test degradation state detection
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

- [~] 3. Checkpoint - Phase 1 & 2 验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Phase 3: Brainstorm Orchestrator 核心
  - [~] 4.1 Create `server/routes/blueprint/brainstorm/orchestrator.ts` scaffold
    - Implement `BrainstormOrchestrator` class with session map
    - Implement `startSession(config)` → creates session, instantiates crew members
    - Implement `getSession(id)`, `getActiveSessions()`, `getDiagnostics()`
    - Implement session timeout watchdog (120s force-termination)
    - Implement token budget tracking across all crew members
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 10.5_

  - [~] 4.2 Implement Discussion mode execution in orchestrator
    - Sequential execution: pass each member's output as context to next
    - Respect token budget between iterations
    - Emit `brainstorm.node.created` and `brainstorm.node.updated` events per member
    - _Requirements: 3.1, 3.6_

  - [~] 4.3 Implement Vote mode execution in orchestrator
    - Parallel execution: all members receive identical prompt
    - Use `Promise.allSettled` for concurrent member execution
    - Collect all outputs for synthesis
    - _Requirements: 3.2_

  - [~] 4.4 Implement Division mode execution in orchestrator
    - Split task into sub-tasks via LLM call
    - Assign each sub-task to a specific crew member
    - Parallel execution of sub-tasks
    - _Requirements: 3.3_

  - [~] 4.5 Implement Audit mode execution in orchestrator
    - Execute primary member first
    - Pass primary output to auditor member for review
    - Collect both outputs for synthesis
    - _Requirements: 3.4_

  - [~] 4.6 Implement Crew Member execution loop (Think→Act→Observe)
    - Implement single member LLM reasoning loop
    - Track iteration count against maxIterations
    - Track token usage per member
    - Handle member failure: mark as failed, log reason, continue session
    - Transition states: idle→thinking→acting→observing→completed/failed
    - _Requirements: 2.3, 2.4, 2.5_

  - [~] 4.7 Implement session lifecycle state transitions
    - active → synthesizing (all members terminal)
    - active → force_terminated (timeout 120s)
    - active → failed (LLM unreachable)
    - force_terminated → synthesizing (proceed with partial)
    - synthesizing → completed
    - _Requirements: 2.6, 10.1, 10.5_

  - [~] 4.8 Write property test for Crew Member instantiation (Property 4)
    - **Property 4: Crew Member instantiation matches decision**
    - Verify session instantiates exactly the roles specified by Decision Gate
    - **Validates: Requirements 2.2**

  - [~] 4.9 Write property test for Crew Member state invariant (Property 5)
    - **Property 5: Crew Member state invariant**
    - Verify state is always exactly one of the 6 valid states
    - **Validates: Requirements 2.3**

  - [~] 4.10 Write property test for terminal state triggers synthesis (Property 6)
    - **Property 6: Terminal state triggers synthesis**
    - When all members reach completed/failed, orchestrator proceeds to synthesis
    - **Validates: Requirements 2.6**

  - [~] 4.11 Write property test for Discussion mode sequential chaining (Property 7)
    - **Property 7: Discussion mode sequential context chaining**
    - Member[i] receives concatenated outputs of members[0..i-1]
    - **Validates: Requirements 3.1**

  - [~] 4.12 Write property test for Vote mode identical prompt (Property 8)
    - **Property 8: Vote mode identical prompt invariant**
    - All members in vote mode receive identical prompt
    - **Validates: Requirements 3.2**

  - [~] 4.13 Write property test for token budget enforcement (Property 9)
    - **Property 9: Token budget enforcement**
    - Total token usage never exceeds BRAINSTORM_MAX_TOKENS
    - **Validates: Requirements 3.6, 10.2**

  - [~] 4.14 Write property test for timeout force-termination (Property 24)
    - **Property 24: Timeout force-termination**
    - Sessions running > 120s force-terminate and proceed to synthesis
    - **Validates: Requirements 10.5**

  - [~] 4.15 Write unit tests for orchestrator mode execution
    - Test discussion mode with 2-4 members
    - Test vote mode parallel execution
    - Test division mode task splitting
    - Test audit mode primary→auditor flow
    - Test session timeout behavior
    - Test token budget cutoff mid-session
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 10.5_

- [~] 5. Checkpoint - Orchestrator 核心验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Phase 4: Tool Proxy
  - [~] 6.1 Create `server/routes/blueprint/brainstorm/tool-proxy.ts`
    - Implement `BrainstormToolProxy` class
    - Implement `invoke(request)` with permission validation
    - Implement per-session tool call counting and limit enforcement
    - Route to appropriate capability bridge: docker/mcp/github/skills
    - Implement Docker unreachable fallback with simulated responses
    - Emit `brainstorm.tool.completed` and `brainstorm.tool.failed` events
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [~] 6.2 Implement permission scope validation logic
    - Check tool category against role's `allowedCategories`
    - Check per-member call count against `maxCallsPerMember`
    - Return structured error on permission denial
    - _Requirements: 4.2_

  - [~] 6.3 Implement Docker fallback and degradation handling
    - Detect Docker bridge unreachable state
    - Return simulated responses for Docker-dependent tools
    - Emit `brainstorm.degraded` event with reason
    - _Requirements: 4.6, 10.4_

  - [~] 6.4 Write property test for tool permission validation (Property 10)
    - **Property 10: Tool permission validation**
    - Requests with disallowed categories are always rejected
    - **Validates: Requirements 4.2**

  - [~] 6.5 Write property test for tool call limit enforcement (Property 11)
    - **Property 11: Tool call limit enforcement**
    - Total tool invocations never exceed BRAINSTORM_MAX_TOOL_CALLS
    - **Validates: Requirements 4.5**

  - [~] 6.6 Write unit tests for Tool Proxy
    - Test permission validation with various role/category combinations
    - Test tool call limit enforcement
    - Test Docker fallback behavior
    - Test event emission on success/failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 7. Phase 5: Synthesis Engine
  - [~] 7.1 Create `server/routes/blueprint/brainstorm/synthesizer.ts`
    - Implement `BrainstormSynthesizer.synthesize(input)` method
    - Build synthesis LLM prompt with all crew outputs as context
    - Parse structured JSON output against `SynthesisResult` schema
    - Implement fallback: on LLM failure, select highest-confidence output
    - Emit `brainstorm.degraded` on synthesis fallback
    - _Requirements: 8.1, 8.2, 8.5_

  - [~] 7.2 Wire synthesizer into orchestrator session completion
    - Call synthesizer when all members reach terminal state
    - Feed synthesis result back as stage output
    - Emit `brainstorm.session.completed` event with summary
    - _Requirements: 8.1, 8.3_

  - [~] 7.3 Write property test for synthesis receives all crew outputs (Property 20)
    - **Property 20: Synthesis receives all crew outputs**
    - Synthesis call receives outputs of ALL completed crew members
    - **Validates: Requirements 8.1**

  - [~] 7.4 Write property test for synthesis output schema completeness (Property 21)
    - **Property 21: Synthesis output schema completeness**
    - Valid synthesis contains decision, confidence [0,1], reasoningPoints, dissentingOpinions
    - **Validates: Requirements 8.2**

  - [~] 7.5 Write property test for synthesis fallback (Property 23)
    - **Property 23: Synthesis fallback selects highest confidence**
    - On LLM failure, selects output with highest confidence score
    - **Validates: Requirements 8.5**

  - [~] 7.6 Write unit tests for Synthesizer
    - Test synthesis prompt construction
    - Test fallback selection logic with various confidence distributions
    - Test schema validation of synthesis output
    - _Requirements: 8.1, 8.2, 8.5_

- [~] 8. Checkpoint - Tool Proxy & Synthesis 验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Phase 6: Event Bus 集成与 Socket.IO Relay
  - [~] 9.1 Register `"brainstorm"` in `DEFAULT_RELAY_FAMILIES` for Socket.IO relay
    - Add `"brainstorm"` to the relay families array in existing Socket relay config
    - Ensure brainstorm events flow through existing `emit` → `jobStore.save` → `fanOut` pipeline
    - _Requirements: 5.1, 5.2_

  - [~] 9.2 Implement brainstorm event emission in orchestrator
    - Emit `brainstorm.session.started` when session begins
    - Emit `brainstorm.mode.selected` when collaboration mode is chosen
    - Emit `brainstorm.node.created` with full payload on node creation
    - Emit `brainstorm.node.updated` on node status/content changes
    - Emit `brainstorm.tool.completed` / `brainstorm.tool.failed` from Tool Proxy
    - Emit `brainstorm.session.completed` with summary on session end
    - Emit `brainstorm.session.failed` on session failure
    - Emit `brainstorm.degraded` on any fallback path
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 10.4_

  - [~] 9.3 Implement event causal ordering guarantee
    - Ensure parent node events are emitted before child node events
    - Use sequence numbers for replay ordering
    - _Requirements: 5.6_

  - [~] 9.4 Write property test for event schema completeness (Property 12)
    - **Property 12: Event schema completeness for node creation**
    - Every brainstorm.node.created event contains nodeId, parentNodeId, roleId, nodeType, status
    - **Validates: Requirements 5.3**

  - [~] 9.5 Write property test for event causal ordering (Property 13)
    - **Property 13: Event causal ordering**
    - Parent node events precede child node events within a session
    - **Validates: Requirements 5.6**

  - [~] 9.6 Write property test for degradation event emission (Property 25)
    - **Property 25: Degradation event emission**
    - Every fallback path emits brainstorm.degraded with reason and affected component
    - **Validates: Requirements 10.1, 10.4**

  - [~] 9.7 Write unit tests for event emission
    - Test all 9 event types are emitted at correct lifecycle points
    - Test event payload completeness
    - Test causal ordering with nested nodes
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6_

- [ ] 10. Phase 7: Frontend Store Slice (brainstormGraph)
  - [~] 10.1 Add `brainstormGraph` slice to `client/src/lib/blueprint-realtime-store.ts`
    - Define `BrainstormGraphSlice` state shape
    - Initialize with idle state, empty nodes/edges
    - _Requirements: 6.1_

  - [~] 10.2 Implement store event handlers for brainstorm events
    - Handle `brainstorm.session.started`: reset state, set sessionId, status=active
    - Handle `brainstorm.node.created`: append node, add edge if parentNodeId non-null
    - Handle `brainstorm.node.updated`: update node status/content/confidence
    - Handle `brainstorm.session.completed`: set status=completed, freeze session
    - _Requirements: 6.2, 6.3, 6.5_

  - [~] 10.3 Implement bounded queue enforcement (max 500 nodes)
    - When nodes.length >= 500, drop oldest node (FIFO) before appending
    - Maintain edge consistency when dropping nodes
    - _Requirements: 6.4_

  - [~] 10.4 Implement fine-grained selectors
    - `selectAllNodes()`: return all nodes
    - `selectNodesByRole(roleId)`: filter by role
    - `selectNodesByStatus(status)`: filter by status
    - `selectSessionMetadata()`: return session metadata
    - `selectIsActive()`: return whether session is active
    - _Requirements: 6.6_

  - [~] 10.5 Write property test for store node addition invariant (Property 14)
    - **Property 14: Store node addition invariant**
    - Each node.created grows nodes by 1; if parentNodeId non-null, edges grows by 1
    - **Validates: Requirements 6.2**

  - [~] 10.6 Write property test for store bounded queue invariant (Property 15)
    - **Property 15: Store bounded queue invariant**
    - nodes array never exceeds 500 elements per active session
    - **Validates: Requirements 6.4**

  - [~] 10.7 Write property test for session finalization freeze (Property 16)
    - **Property 16: Session finalization freezes updates**
    - After session.completed, node.created and node.updated are rejected
    - **Validates: Requirements 6.5**

  - [~] 10.8 Write unit tests for brainstormGraph store slice
    - Test initial state
    - Test event handler state transitions
    - Test bounded queue with 500+ nodes
    - Test session freeze behavior
    - Test selector correctness
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [~] 11. Checkpoint - Event Bus & Store 验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Phase 8: Wall Graph Renderer (BrainstormWallGraph)
  - [~] 12.1 Create `client/src/components/three/scene-fusion/BrainstormWallGraph.tsx`
    - Define component props: nodes, edges, sessionStatus
    - Set up Canvas2D offscreen canvas for rendering
    - Define node type → color mapping (6 colors)
    - Define layout constants: NODE_W=180, NODE_H=56, PADDING=30
    - _Requirements: 7.1, 7.3_

  - [~] 12.2 Implement dagre layout computation
    - Create dagre graph with LR direction, nodesep=50, ranksep=140
    - Set nodes and edges from props
    - Compute layout on every nodes/edges change
    - Implement adaptive scaling to fit wall bounds
    - _Requirements: 7.1, 7.4, 7.7_

  - [~] 12.3 Implement Canvas2D node rendering
    - Draw card-shaped nodes with rounded corners
    - Apply node type colors from mapping
    - Render title (truncated to 22 chars with ellipsis), role label, status dot
    - _Requirements: 7.3, 7.5_

  - [~] 12.4 Implement Canvas2D edge rendering
    - Draw bezier curve dashed lines between parent-child nodes
    - Match existing BlueprintWallTexture rendering style
    - _Requirements: 7.2_

  - [~] 12.5 Implement fade-in animation for new nodes
    - Track new nodes by comparing createdAt with last render time
    - Animate opacity 0→1 over 300ms for new nodes
    - _Requirements: 7.6_

  - [~] 12.6 Integrate with Three.js CanvasTexture
    - Create Three.js CanvasTexture from offscreen canvas
    - Mark `texture.needsUpdate = true` after each render
    - Mount on wall surface mesh (same pattern as BlueprintWallTexture)
    - _Requirements: 7.4, 7.7_

  - [~] 12.7 Wire BrainstormWallGraph to brainstormGraph store
    - Subscribe to brainstormGraph selectors
    - Pass nodes/edges/sessionStatus as props
    - Conditionally render only when session is active or completed
    - _Requirements: 7.4_

  - [~] 12.8 Write property test for node type color mapping uniqueness (Property 17)
    - **Property 17: Node type color mapping uniqueness**
    - All 6 node types map to distinct colors
    - **Validates: Requirements 7.3**

  - [~] 12.9 Write property test for title truncation invariant (Property 18)
    - **Property 18: Title truncation invariant**
    - Displayed title is at most 22 characters, longer titles get ellipsis
    - **Validates: Requirements 7.5**

  - [~] 12.10 Write property test for adaptive scaling fits wall bounds (Property 19)
    - **Property 19: Adaptive scaling fits wall bounds**
    - For any graph with 1-500 nodes, scaled layout fits within wall W×H
    - **Validates: Requirements 7.7**

  - [~] 12.11 Write unit tests for Wall Graph Renderer
    - Test dagre layout computation with various node counts
    - Test color mapping correctness
    - Test title truncation logic
    - Test adaptive scaling with edge cases (1 node, 500 nodes)
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.7_

- [ ] 13. Phase 9: Memory Store & Replay API
  - [~] 13.1 Create `server/routes/blueprint/brainstorm/memory-store.ts`
    - Implement `BrainstormMemoryStore` class
    - Implement `persist(artifact)`: serialize and store session artifact
    - Implement `retrieve(jobId, sessionId)`: load by composite key
    - Implement `listByJob(jobId)`: list all sessions for a job
    - Store as job artifacts following existing retention policy
    - _Requirements: 8.4, 9.1, 9.2, 9.5_

  - [~] 13.2 Wire memory store into orchestrator session completion
    - On session completion, build `BrainstormSessionArtifact` from session state
    - Include all nodes, edges, synthesis result, token usage breakdown per role
    - Call `memoryStore.persist(artifact)`
    - _Requirements: 8.4, 9.1, 9.2_

  - [~] 13.3 Implement Replay API endpoint
    - Add `GET /api/blueprint/jobs/:id/brainstorm/:sessionId` route
    - Return full session artifact with replay timeline
    - Include chronological ordering via sequenceNumber for frontend animation
    - _Requirements: 9.3, 9.4_

  - [~] 13.4 Write property test for session persistence round-trip (Property 22)
    - **Property 22: Session persistence round-trip**
    - Persist then retrieve yields equivalent artifact (nodes, edges, synthesis, metadata)
    - **Validates: Requirements 8.4, 9.1, 9.2**

  - [~] 13.5 Write unit tests for Memory Store
    - Test persist and retrieve round-trip
    - Test listByJob with multiple sessions
    - Test artifact completeness (all fields present)
    - Test replay timeline ordering
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [~] 14. Checkpoint - Wall Graph & Memory Store 验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Phase 10: Diagnostics Extension
  - [~] 15.1 Extend `GET /api/blueprint/diagnostics` with brainstormOrchestrator entry
    - Add `brainstormOrchestrator` field to diagnostics response
    - Report: enabled, activeSessionsCount, totalSessionsCompleted
    - Report: degradationCount, averageSessionDurationMs
    - Report: tokenBudget, toolCallLimit configuration values
    - _Requirements: 10.6_

  - [~] 15.2 Write unit tests for diagnostics extension
    - Test diagnostics response includes brainstormOrchestrator entry
    - Test counter accuracy after multiple sessions
    - _Requirements: 10.6_

- [ ] 16. Phase 11: Pipeline Integration (Hook into Autopilot Stages)
  - [~] 16.1 Add `brainstormOrchestrator` to `BlueprintServiceContext`
    - Add lazy-assembled `brainstormOrchestrator` field on service context
    - Initialize only when `BLUEPRINT_BRAINSTORM_ENABLED` is "true"
    - Follow same pattern as `roleAgentDelegator` assembly
    - _Requirements: 1.1_

  - [~] 16.2 Integrate Decision Gate into autopilot pipeline stage driver
    - At each stage start, invoke `decisionGate.decide(stageContext)`
    - If brainstormNeeded=true, delegate to orchestrator instead of single-agent
    - If brainstormNeeded=false, continue existing single-agent path
    - Feed synthesis result back as stage output when brainstorm completes
    - _Requirements: 1.1, 1.3, 1.4, 8.3_

  - [~] 16.3 Implement graceful degradation at pipeline level
    - When brainstorm is disabled via env, skip Decision Gate entirely
    - When orchestrator encounters unrecoverable error, fall back to single-agent
    - Ensure pipeline never blocks due to brainstorm infrastructure failures
    - _Requirements: 10.1, 10.3_

  - [~] 16.4 Emit `brainstorm.mode.selected` event when mode is chosen
    - Include mode name and participating role IDs in event payload
    - _Requirements: 3.5_

  - [~] 16.5 Write unit tests for pipeline integration
    - Test Decision Gate invocation at stage start
    - Test routing to orchestrator vs single-agent
    - Test graceful degradation when brainstorm disabled
    - Test synthesis result feeding back as stage output
    - _Requirements: 1.1, 1.3, 1.4, 8.3, 10.1_

- [~] 17. Checkpoint - Pipeline Integration 验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Phase 12: Integration Tests
  - [~] 18.1 Write integration test: Event flow end-to-end
    - Test Orchestrator → EventBus → Socket.IO relay → Store update chain
    - Verify events arrive in correct order at store
    - _Requirements: 5.1, 5.2, 5.6_

  - [~] 18.2 Write integration test: Replay API endpoint
    - Test GET /api/blueprint/jobs/:id/brainstorm/:sessionId response format
    - Verify replay timeline contains all nodes in sequence order
    - _Requirements: 9.3, 9.4_

  - [~] 18.3 Write integration test: Diagnostics endpoint
    - Test GET /api/blueprint/diagnostics includes brainstormOrchestrator entry
    - Verify counters update after session completion
    - _Requirements: 10.6_

  - [~] 18.4 Write integration test: Capability bridge delegation
    - Test Tool Proxy routes through existing Docker/MCP/GitHub/Skills bridges
    - Verify fallback behavior when bridges are in degraded state
    - _Requirements: 4.1, 4.6_

  - [~] 18.5 Write integration test: Session persistence round-trip via API
    - Test full flow: start session → complete → persist → retrieve via API
    - Verify artifact completeness
    - _Requirements: 8.4, 9.1, 9.3_

- [ ] 19. Phase 13: End-to-End Smoke Tests
  - [~] 19.1 Write smoke test: Brainstorm disabled by default
    - Verify BLUEPRINT_BRAINSTORM_ENABLED="false" skips all brainstorm logic
    - Pipeline continues with single-agent execution unchanged
    - _Requirements: 10.1_

  - [~] 19.2 Write smoke test: Full brainstorm session lifecycle
    - Enable brainstorm, trigger Decision Gate → session → synthesis → output
    - Verify all events emitted, store updated, artifact persisted
    - _Requirements: 1.1, 2.6, 8.3, 9.1_

  - [~] 19.3 Write smoke test: Graceful degradation cascade
    - Simulate LLM unreachable mid-session
    - Verify session terminates, degraded event emitted, pipeline continues
    - _Requirements: 10.1, 10.4_

  - [~] 19.4 Write smoke test: Role registry completeness
    - Verify all 6 roles are registered with valid system prompts and permissions
    - _Requirements: 2.1_

  - [~] 19.5 Write smoke test: Environment variable configuration
    - Verify all 5 env vars are read and applied correctly
    - Test default values when env vars are not set
    - _Requirements: 3.6, 4.5, 10.5_

- [~] 20. Final Checkpoint - 全量验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at phase boundaries
- Property tests validate the 26 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript (matching the design document)
- All brainstorm logic is gated behind `BLUEPRINT_BRAINSTORM_ENABLED` env var
- Existing systems (EventBus, Socket.IO relay, capability bridges) are extended, not modified
- The Wall Graph renderer follows the same dagre + Canvas2D + CanvasTexture pattern as BlueprintWallTexture

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 3, "tasks": ["4.1", "4.6"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.7"] },
    { "id": 5, "tasks": ["4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "7.1"] },
    { "id": 7, "tasks": ["6.4", "6.5", "6.6", "7.2"] },
    { "id": 8, "tasks": ["7.3", "7.4", "7.5", "7.6", "9.1"] },
    { "id": 9, "tasks": ["9.2", "9.3"] },
    { "id": 10, "tasks": ["9.4", "9.5", "9.6", "9.7", "10.1"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 12, "tasks": ["10.5", "10.6", "10.7", "10.8", "12.1"] },
    { "id": 13, "tasks": ["12.2", "12.3", "12.4", "12.5"] },
    { "id": 14, "tasks": ["12.6", "12.7", "12.8", "12.9", "12.10", "12.11"] },
    { "id": 15, "tasks": ["13.1"] },
    { "id": 16, "tasks": ["13.2", "13.3"] },
    { "id": 17, "tasks": ["13.4", "13.5", "15.1"] },
    { "id": 18, "tasks": ["15.2", "16.1"] },
    { "id": 19, "tasks": ["16.2", "16.3", "16.4"] },
    { "id": 20, "tasks": ["16.5", "18.1", "18.2", "18.3", "18.4", "18.5"] },
    { "id": 21, "tasks": ["19.1", "19.2", "19.3", "19.4", "19.5"] }
  ]
}
```
