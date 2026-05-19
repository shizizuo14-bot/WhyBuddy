# Tasks

## 1. Define shared contracts and types

- [x] 1.1 Define `AgentToolDefinition`, `AgentToolInvocation`, `AgentToolResult` interfaces in `shared/blueprint/agent-tool.ts`
- [x] 1.2 Define `AgentBudget` interface with maxIterations, maxTokens, timeoutMs, toolTimeoutMs, allowParallelTools in `shared/blueprint/agent-budget.ts`
- [x] 1.3 Define `AgentLoopPhase`, `AgentLoopState`, `AgentTraceEntry` types in `shared/blueprint/agent-state.ts`
- [x] 1.4 Define `AgentJobInput`, `AgentJobOutput` interfaces in `shared/blueprint/agent-job.ts`
- [x] 1.5 Define `AgentProgressEvent`, `AgentProgressEventType` in `shared/blueprint/agent-events.ts`
- [x] 1.6 Define `RoleAgentConfig` interface and add optional `agentConfig?: RoleAgentConfig` to `BlueprintAgentRole` in `shared/blueprint/contracts.ts`
- [x] 1.7 Define `DelegateInput`, `DelegateOutput`, `DelegateStatus` interfaces in `shared/blueprint/agent-delegator.ts`

## 2. Implement Agent Loop state machine (RoleAgentRuntime)

- [x] 2.1 Implement `AgentLoopStateMachine` class with phase transitions (idle→thinking→acting→observing→completed/failed)
- [x] 2.2 Implement budget checking logic (iterations, tokens, timeout) executed before each thinking phase
- [x] 2.3 Implement LLM call integration within thinking phase using existing `callLLMJson` with function-calling schema
- [x] 2.4 Implement LLM response parsing: distinguish "finish" (output), "action" (tool call), and "error" responses
- [x] 2.5 Implement single-retry logic for LLM errors with format hint injection
- [x] 2.6 Implement tool invocation via ToolProxyClient (HTTP POST with HMAC signature)
- [x] 2.7 Implement observation recording into AgentTraceEntry history
- [x] 2.8 Implement progress event emission (HMAC-signed callbacks to host)
- [x] 2.9 Implement `abort(reason)` method for forced termination
- [x] 2.10 Write unit tests for all state machine transitions and budget enforcement

## 3. Implement Tool Registration Protocol (buildToolDefinitions)

- [x] 3.1 Implement MCP binding → AgentToolDefinition conversion with category "mcp"
- [x] 3.2 Implement Skill binding → AgentToolDefinition conversion with category "skill"
- [x] 3.3 Implement AIGC node binding → AgentToolDefinition conversion with category "aigc_node"
- [x] 3.4 Implement builtin tools registration ("finish" and "think")
- [x] 3.5 Write unit tests verifying tool count = MCP + Skill + AIGC + 2 builtins, and all required fields populated

## 4. Implement ToolProxyServer (host-side HTTP tool proxy)

- [x] 4.1 Implement HTTP server with `POST /tools/invoke` endpoint
- [x] 4.2 Implement HMAC-SHA256 signature validation on incoming requests
- [x] 4.3 Implement tool whitelist enforcement (role can only call declared tools)
- [x] 4.4 Implement request routing to MCP adapter, Skill adapter, or AIGC node adapter based on tool category
- [x] 4.5 Implement per-tool timeout enforcement and timeout error response
- [x] 4.6 Implement `start(port)`, `registerTools(roleId, tools)`, `shutdown()` lifecycle methods
- [x] 4.7 Write unit tests for HMAC validation, whitelist enforcement, and routing

## 5. Implement RoleAgentDelegator (host-side delegation orchestrator)

- [x] 5.1 Implement Tier 1 env gate check (`BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED !== "true"` → callLLMJson fallback)
- [x] 5.2 Implement Tier 2 Docker availability check via `executorClient.assertReachable()`
- [x] 5.3 Implement Real Mode dispatch: build tools from RoleRuntimeContext, dispatch to container, await result
- [x] 5.4 Implement Lite Mode execution: run simplified Agent Loop in host process
- [x] 5.5 Implement Tier 3 degradation: Real fails → Lite retry → callLLMJson fallback
- [x] 5.6 Implement `getStatus(jobId)` for in-progress delegation status queries
- [x] 5.7 Implement `cancel(jobId, reason)` for delegation cancellation
- [x] 5.8 Implement `getDiagnostics()` returning delegation counters and metrics
- [x] 5.9 Write unit tests for three-tier degradation chain with mocked Docker/LLM

## 6. Implement LiteAgentRuntime (host-process simplified Agent Loop)

- [x] 6.1 Implement in-process Agent Loop reusing AgentLoopStateMachine but with direct adapter calls instead of HTTP proxy
- [x] 6.2 Implement temporary directory workspace for file operations
- [x] 6.3 Verify Lite Mode produces output compatible with Real Mode (same AgentJobOutput schema)
- [x] 6.4 Write integration test: Lite Mode produces valid BlueprintRouteSet output

## 7. Implement HMAC Callback Receiver (host-side progress receiver)

- [x] 7.1 Implement HTTP endpoint for receiving progress callbacks from containers
- [x] 7.2 Implement HMAC-SHA256 signature verification on incoming callbacks
- [x] 7.3 Implement security event logging for invalid signatures
- [x] 7.4 Implement progress event forwarding to diagnostics store and any listeners
- [x] 7.5 Write unit tests for signature validation and rejection

## 8. Implement Diagnostics Extension

- [x] 8.1 Add `roleAutonomousAgent` bridge entry to `GET /api/blueprint/diagnostics` response
- [x] 8.2 Implement mode reporting ("real" / "lite" / "disabled")
- [x] 8.3 Implement delegation counters (total, real, lite, fallback) with invariant: total = real + lite + fallback
- [x] 8.4 Implement average metrics (iterations, tokens, duration) calculation
- [x] 8.5 Implement lastInvocationAt, lastMode, lastError tracking
- [x] 8.6 Write unit test verifying diagnostics counter invariant

## 9. Implement Environment Variable Configuration

- [x] 9.1 Register `BLUEPRINT_ROLE_AUTONOMOUS_AGENT_ENABLED` in env resolution with default "false"
- [x] 9.2 Register `BLUEPRINT_AGENT_MAX_ITERATIONS`, `BLUEPRINT_AGENT_MAX_TOKENS`, `BLUEPRINT_AGENT_TIMEOUT_MS` with numeric parsing
- [x] 9.3 Register `BLUEPRINT_AGENT_TOOL_PROXY_PORT` with default 0 (random)
- [x] 9.4 Integrate with `resolveBridgeEnablement`: when `AUTOPILOT_REAL_RUNTIME=true`, default the agent flag to "true"
- [x] 9.5 Integrate with `BUILD_TARGET=test` override: force agent flag to "false"
- [x] 9.6 Write unit tests for env parsing and override logic

## 10. Implement Output Schema Validation

- [x] 10.1 Implement output validation against `outputSchema` in DelegateInput before accepting Agent result
- [x] 10.2 Implement rejection and degradation trigger when output fails validation
- [x] 10.3 Write unit tests with valid and invalid outputs for BlueprintRouteSet, BlueprintClarificationSession, BlueprintSpecTree schemas

## 11. Implement Credential Exclusion from Traces

- [x] 11.1 Implement trace sanitization: strip API keys, Bearer tokens, and secrets from AgentTraceEntry before persistence
- [x] 11.2 Write unit test verifying no known credential patterns appear in serialized traces

## 12. Integration Tests

- [x] 12.1 Write integration test: Real Mode with fake Docker + fake LLM → complete Agent Loop → valid output
- [x] 12.2 Write integration test: Lite Mode → complete Agent Loop → output format compatible with Real Mode
- [x] 12.3 Write integration test: Docker unavailable → automatic degradation to Lite Mode
- [x] 12.4 Write integration test: ToolProxy end-to-end (container → HTTP → host → MCP/Skill mock → response)
- [x] 12.5 Write integration test: Budget exceeded (iterations) → loop terminates with partial result
- [x] 12.6 Write integration test: `BUILD_TARGET=test` → Tier 1 early exit (no Agent execution)
