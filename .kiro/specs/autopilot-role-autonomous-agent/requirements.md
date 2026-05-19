# Requirements Document

## Introduction

本文档定义 Autopilot Role Autonomous Agent 的需求规格。该特性将 `/autopilot` 流水线从"宿主进程固定代码驱动 + 单次 LLM 调用"升级为"每个角色在自己的 Docker 容器内作为自主 Agent 运行"，采用 ReAct Loop（Think → Act → Observe）模式自主决策下一步动作，同时保持产物格式与现有 API schema 完全兼容。

## Glossary

- **RoleAgentRuntime**: 容器内核心组件，负责运行 ReAct Agent Loop 并自主决策下一步动作
- **RoleAgentDelegator**: 宿主侧委派器，负责将任务委派给角色容器内的 Agent 并管理降级策略
- **ToolProxyServer**: 宿主侧工具代理服务，接收容器内 Agent 的 HTTP 工具调用请求并转发到真实 MCP/Skill/AIGC 服务
- **AgentLoopState**: Agent Loop 状态机，包含 idle、thinking、acting、observing、completed、failed 六个阶段
- **AgentBudget**: 预算控制对象，包含 maxIterations、maxTokens、timeoutMs 三重保护
- **AgentToolDefinition**: 统一工具接口定义，将 MCP/Skill/AIGC 节点统一为 Tool 接口
- **AgentProgressEvent**: 进度回调事件，容器通过 HMAC 签名回调向宿主报告执行进度
- **LiteAgentRuntime**: 简化 Agent 运行时，在宿主进程内运行简化 Agent Loop（无 Docker）
- **Real_Mode**: 容器内完整 Agent Loop 执行模式
- **Lite_Mode**: 宿主进程内简化 Agent Loop 执行模式
- **Graceful_Degradation**: 三级降级策略（Real → Lite → callLLMJson）

## Requirements

### Requirement 1: Agent Loop 状态机行为

**User Story:** As a system operator, I want the Agent Loop to follow a well-defined state machine, so that execution is predictable, observable, and recoverable.

#### Acceptance Criteria

1. WHEN the RoleAgentRuntime receives a start signal, THE AgentLoopState SHALL transition from idle to thinking
2. WHEN the LLM returns a tool invocation decision, THE AgentLoopState SHALL transition from thinking to acting
3. WHEN the LLM returns a finish decision, THE AgentLoopState SHALL transition from thinking to completed
4. WHEN a tool invocation completes, THE AgentLoopState SHALL transition from acting to observing
5. WHEN the observation phase completes without reaching the goal, THE AgentLoopState SHALL transition from observing to thinking
6. WHEN the observation phase determines the goal is reached, THE AgentLoopState SHALL transition from observing to completed
7. IF an LLM error occurs during thinking, THEN THE AgentLoopState SHALL retry once and transition to failed if the retry also fails
8. IF a fatal tool error occurs during acting, THEN THE AgentLoopState SHALL transition to failed
9. IF the budget is exceeded during any phase, THEN THE AgentLoopState SHALL transition to failed with a budget-exceeded reason
10. THE RoleAgentRuntime SHALL record each state transition with a timestamp in the AgentTraceEntry history

### Requirement 2: 预算控制

**User Story:** As a platform administrator, I want the Agent Loop to enforce budget limits, so that runaway executions are prevented and resource consumption is bounded.

#### Acceptance Criteria

1. WHEN the iteration count reaches maxIterations, THE RoleAgentRuntime SHALL stop the loop and finalize with status indicating budget exhaustion
2. WHEN the cumulative token usage reaches maxTokens, THE RoleAgentRuntime SHALL stop the loop and finalize with status indicating budget exhaustion
3. WHEN the elapsed time reaches timeoutMs, THE RoleAgentRuntime SHALL abort the loop immediately
4. WHEN a single tool invocation exceeds toolTimeoutMs, THE RoleAgentRuntime SHALL return a timeout error as the observation result
5. THE RoleAgentRuntime SHALL check all three budget dimensions (iterations, tokens, timeout) before each thinking phase begins
6. THE AgentProgressEvent SHALL include budgetRemaining with remaining iterations, tokens, and time for each progress callback

### Requirement 3: 宿主侧委派器行为

**User Story:** As a system developer, I want the RoleAgentDelegator to manage task delegation with automatic degradation, so that the autopilot pipeline remains functional regardless of infrastructure availability.

#### Acceptance Criteria

1. WHEN BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED is not "true", THE RoleAgentDelegator SHALL immediately fall back to callLLMJson without attempting Agent execution
2. WHEN the environment flag is "true" and Docker is available, THE RoleAgentDelegator SHALL dispatch the job to a container in Real Mode
3. WHEN the environment flag is "true" and Docker is not available, THE RoleAgentDelegator SHALL execute the job in Lite Mode within the host process
4. WHEN Real Mode execution fails, THE RoleAgentDelegator SHALL retry in Lite Mode before falling back to callLLMJson
5. WHEN Lite Mode execution fails, THE RoleAgentDelegator SHALL fall back to callLLMJson as the final degradation tier
6. THE RoleAgentDelegator SHALL report the executionMode ("real" or "lite") in the DelegateOutput
7. THE RoleAgentDelegator SHALL provide a getStatus method that returns the current delegation status for a given jobId
8. THE RoleAgentDelegator SHALL provide a cancel method that terminates an in-progress delegation

### Requirement 4: 工具代理行为

**User Story:** As a container-based Agent, I want to invoke host-side tools via HTTP proxy, so that I can access MCP servers, Skills, and AIGC nodes without direct network access to those services.

#### Acceptance Criteria

1. THE ToolProxyServer SHALL accept HTTP POST requests containing toolId, params, requestId, and HMAC signature
2. WHEN a valid tool invocation request is received, THE ToolProxyServer SHALL forward the request to the corresponding MCP, Skill, or AIGC service
3. WHEN the HMAC signature verification fails, THE ToolProxyServer SHALL reject the request and return an authentication error
4. THE ToolProxyServer SHALL enforce that each role can only invoke tools declared in its RoleCapabilityPackage
5. THE ToolProxyServer SHALL return the tool result including success status, result payload, error message, and duration
6. WHEN a tool invocation exceeds the configured timeout, THE ToolProxyServer SHALL return a timeout error response

### Requirement 5: 通信协议与安全

**User Story:** As a security engineer, I want all container-to-host communication to be authenticated and validated, so that unauthorized or tampered callbacks are rejected.

#### Acceptance Criteria

1. THE RoleAgentRuntime SHALL sign every progress callback with HMAC-SHA256 using the callbackSecret
2. WHEN the host receives a callback without a valid HMAC signature, THE HMAC_Callback_Receiver SHALL reject the callback and log a security event
3. THE ToolProxyServer SHALL validate the HMAC signature on every tool invocation request before processing
4. THE AgentTraceEntry SHALL NOT record LLM API keys or other sensitive credentials
5. WHEN the Agent produces output, THE RoleAgentDelegator SHALL validate the output against the outputSchema before accepting it

### Requirement 6: Graceful Degradation 三级降级

**User Story:** As a system operator, I want the system to degrade gracefully across three tiers, so that the autopilot pipeline continues to function even when Docker or the Agent runtime is unavailable.

#### Acceptance Criteria

1. WHEN BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED is "false", THE RoleAgentDelegator SHALL use callLLMJson directly (Tier 1 early exit)
2. WHEN Docker is unavailable, THE RoleAgentDelegator SHALL automatically switch to Lite Mode without manual intervention (Tier 2 degradation)
3. WHEN the container crashes during execution, THE RoleAgentDelegator SHALL detect the failure and retry in Lite Mode (Tier 3 degradation)
4. WHEN both Real Mode and Lite Mode fail, THE RoleAgentDelegator SHALL fall back to callLLMJson as the final tier
5. THE RoleAgentDelegator SHALL log each degradation event with the tier level and failure reason

### Requirement 7: 工具注册协议

**User Story:** As a platform developer, I want MCP servers, Skills, and AIGC nodes to be unified into a single tool interface, so that the Agent can invoke any capability through a consistent API.

#### Acceptance Criteria

1. WHEN a RoleRuntimeContext is provided, THE tool registration protocol SHALL convert all MCP bindings into AgentToolDefinition objects with category "mcp"
2. WHEN a RoleRuntimeContext is provided, THE tool registration protocol SHALL convert all Skill bindings into AgentToolDefinition objects with category "skill"
3. WHEN a RoleRuntimeContext is provided, THE tool registration protocol SHALL convert all AIGC node bindings into AgentToolDefinition objects with category "aigc_node"
4. THE tool registration protocol SHALL include builtin tools "finish" and "think" in every Agent tool set
5. EACH AgentToolDefinition SHALL include id, name, description, category, inputSchema, requiresProxy flag, and timeoutMs

### Requirement 8: 诊断扩展

**User Story:** As a system operator, I want the diagnostics endpoint to report autonomous agent status, so that I can monitor the health and usage of the Agent delegation system.

#### Acceptance Criteria

1. THE diagnostics endpoint SHALL include a new entry with bridgeId "roleAutonomousAgent"
2. THE diagnostics entry SHALL report the current mode as "real", "lite", or "disabled"
3. THE diagnostics entry SHALL report enabledByConfig and dependencyReady boolean flags
4. THE diagnostics entry SHALL report totalDelegations, realDelegations, liteDelegations, and fallbackDelegations counters
5. THE diagnostics entry SHALL report averageIterations, averageTokensPerDelegation, and averageDurationMs metrics
6. THE diagnostics entry SHALL report lastInvocationAt timestamp, lastMode, and lastError

### Requirement 9: 产物兼容性

**User Story:** As a downstream consumer of autopilot outputs, I want the Agent-produced artifacts to maintain the same JSON schema as existing outputs, so that no downstream code changes are required.

#### Acceptance Criteria

1. THE RoleAgentRuntime SHALL produce output conforming to the existing BlueprintRouteSet schema when acting as Planner
2. THE RoleAgentRuntime SHALL produce output conforming to the existing BlueprintClarificationSession schema when acting as Clarifier
3. THE RoleAgentRuntime SHALL produce output conforming to the existing BlueprintSpecTree schema when acting as Architect
4. THE RoleAgentDelegator SHALL NOT modify the shared/blueprint/contracts.ts API schema
5. WHEN the Agent output fails schema validation, THE RoleAgentDelegator SHALL reject the output and trigger degradation

### Requirement 10: 环境配置

**User Story:** As a deployment engineer, I want the Agent system to be configurable via environment variables, so that I can tune behavior without code changes.

#### Acceptance Criteria

1. THE system SHALL read BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED to determine Tier 1 gate status
2. THE system SHALL read BLUEPRINT_AGENT_MAX_ITERATIONS to set the default maximum iteration count
3. THE system SHALL read BLUEPRINT_AGENT_MAX_TOKENS to set the default maximum token budget
4. THE system SHALL read BLUEPRINT_AGENT_TIMEOUT_MS to set the default execution timeout
5. THE system SHALL read BLUEPRINT_AGENT_TOOL_PROXY_PORT to configure the ToolProxy listening port
6. WHEN AUTOPILOT_REAL_RUNTIME is "true", THE resolveBridgeEnablement function SHALL default BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED to "true"
7. WHEN BUILD_TARGET is "test", THE system SHALL force BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED to "false"
