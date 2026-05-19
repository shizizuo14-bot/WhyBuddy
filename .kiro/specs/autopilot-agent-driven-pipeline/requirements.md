# Requirements Document

## Introduction

本文档定义 Autopilot Agent-Driven Pipeline 的需求。该特性将 blueprint job 的 RouteSet 生成主流程从"宿主进程直接 `callLLMJson` 一次性生成"升级为"由 Planner 角色通过 `RoleAgentDelegator` 以自主 Agent 模式运行（ReAct Loop：clone → 分析 → 生成路线）"。通过 env flag 控制渐进切换，现有 `buildRouteSet` / `routeSetLlmGenerator` 保留为三级降级的最终 fallback，确保零风险渐进切换。

## Glossary

- **BlueprintServiceContext**: blueprint 服务上下文对象，持有所有依赖实例
- **RoleAgentDelegator**: Agent 委派器，负责将任务委派给 Planner 角色执行
- **BlueprintRouteSet**: blueprint 路线集合，是 RouteSet 生成的最终产物
- **AgentDrivenRouteSetGenerator**: 封装从 delegate 到 RouteSet 转换的生成器函数
- **PlannerGoalBuilder**: 构建 Planner Agent 目标描述和系统提示词的模块
- **AgentOutputValidator**: 验证 Agent 产出是否符合 BlueprintRouteSet schema 的模块
- **LiteAgentRuntime**: 宿主进程内的轻量 Agent 执行运行时
- **Env_Flag**: 环境变量 `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED`，控制 Agent 路径开关

## Requirements

### Requirement 1: Env Flag 控制与默认关闭

**User Story:** As a platform operator, I want the agent-driven pipeline to be controlled by an environment flag that defaults to off, so that I can safely enable it in controlled environments without affecting production stability.

#### Acceptance Criteria

1. THE System SHALL read the environment variable `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED` to determine whether the agent-driven path is active
2. WHEN `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED` is not set or is any value other than the exact string `"true"`, THE System SHALL bypass the agent-driven path entirely and use the existing `buildRouteSet()` path
3. WHEN `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED` is exactly `"true"`, THE System SHALL attempt the agent-driven path before falling back to the existing path
4. THE System SHALL register the env flag in `.env.example` with a default value of `"false"` and a descriptive comment
5. WHEN running with `BUILD_TARGET=test`, THE System SHALL NOT activate the agent-driven path regardless of the env flag value, preserving all existing test behavior

### Requirement 2: BlueprintServiceContext 扩展

**User Story:** As a developer, I want the BlueprintServiceContext to optionally hold a RoleAgentDelegator instance, so that the agent-driven pipeline can be injected without breaking existing consumers.

#### Acceptance Criteria

1. THE BlueprintServiceContext SHALL expose an optional `roleAgentDelegator` field of type `RoleAgentDelegator`
2. WHEN `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED` is `"true"`, THE `buildBlueprintServiceContext` function SHALL assemble and inject a default `RoleAgentDelegator` instance
3. WHEN `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED` is not `"true"`, THE `buildBlueprintServiceContext` function SHALL set `roleAgentDelegator` to `undefined`
4. WHEN `buildBlueprintServiceContext` is called multiple times with the same dependencies and env flag state, THE resulting `roleAgentDelegator` field SHALL be consistent (either always `undefined` or always a valid instance)

### Requirement 3: Planner Goal Builder

**User Story:** As a system architect, I want a dedicated module to construct the Planner Agent's goal, system prompt, and budget, so that the agent receives well-structured instructions for RouteSet generation.

#### Acceptance Criteria

1. WHEN a `BlueprintGenerationRequest` with a non-empty `targetText` is provided, THE PlannerGoalBuilder SHALL produce a non-empty goal string containing the user's objective description
2. WHEN the request includes `githubUrls`, THE PlannerGoalBuilder SHALL include repository analysis instructions in the goal
3. WHEN an `intake` object is provided, THE PlannerGoalBuilder SHALL include the collected project context summary in the goal
4. THE PlannerGoalBuilder SHALL produce a system prompt string appropriate for the specified locale
5. THE PlannerGoalBuilder SHALL produce an `AgentBudget` object where `maxIterations` is within [1, 50], `maxTokens` is within [10000, 500000], and `timeoutMs` is within [30000, 600000]
6. WHEN budget overrides are provided, THE PlannerGoalBuilder SHALL apply them while clamping values to the valid ranges

### Requirement 4: Agent Output Validator

**User Story:** As a system architect, I want a validator that checks Agent output against the BlueprintRouteSet schema and normalizes it, so that only valid route sets proceed to downstream consumers.

#### Acceptance Criteria

1. WHEN the Agent produces output conforming to the RouteSet structure, THE AgentOutputValidator SHALL return a valid `BlueprintRouteSet` with host-side fields (`routeSetId`, `primaryRouteId`, `createdAt`) correctly populated
2. WHEN the Agent produces output that does not conform to the RouteSet structure, THE AgentOutputValidator SHALL return `null`
3. THE AgentOutputValidator SHALL NOT throw exceptions regardless of the input value
4. WHEN validation succeeds, THE returned `BlueprintRouteSet.id` SHALL equal the provided `routeSetId` and `BlueprintRouteSet.primaryRouteId` SHALL equal the provided `primaryRouteId`

### Requirement 5: Agent-Driven RouteSet Generator

**User Story:** As a developer, I want a generator that encapsulates the full delegate-to-RouteSet conversion flow, so that the createGenerationJob call site remains clean and the fallback logic is centralized.

#### Acceptance Criteria

1. WHEN the delegator returns a completed result with valid output, THE AgentDrivenRouteSetGenerator SHALL return an `AgentDrivenRouteSetOutput` containing the validated `BlueprintRouteSet`
2. WHEN the delegator returns a failed result or the output fails validation, THE AgentDrivenRouteSetGenerator SHALL fall back to the provided `routeSetLlmGenerator` and return a valid `BlueprintRouteSet`
3. THE AgentDrivenRouteSetGenerator SHALL never propagate exceptions to the caller; all errors SHALL be handled internally via fallback
4. THE AgentDrivenRouteSetGenerator SHALL include execution metadata (`executionMode`, `iterations`, `totalTokens`, `durationMs`) in the output

### Requirement 6: createGenerationJob 调用点替换

**User Story:** As a developer, I want the createGenerationJob function to conditionally use the agent-driven path based on the env flag and context availability, so that the transition is seamless and reversible.

#### Acceptance Criteria

1. WHEN `ctx.roleAgentDelegator` is defined AND `BLUEPRINT_AGENT_DRIVEN_PIPELINE_ENABLED` is `"true"`, THE `createGenerationJob` function SHALL use the agent-driven path to generate the RouteSet
2. WHEN `ctx.roleAgentDelegator` is `undefined` OR the env flag is not `"true"`, THE `createGenerationJob` function SHALL use the existing `buildRouteSet()` path with no behavioral change
3. WHEN the agent-driven path is used, THE resulting `BlueprintRouteSet` SHALL pass the same structural validation as the existing `buildRouteSet()` output
4. THE `/api/blueprint/jobs` API response shape SHALL remain unchanged regardless of which generation path is used

### Requirement 7: Graceful Degradation

**User Story:** As a platform operator, I want the system to gracefully degrade through multiple fallback tiers when the agent-driven path encounters failures, so that RouteSet generation always succeeds.

#### Acceptance Criteria

1. WHEN Docker is unreachable, THE RoleAgentDelegator SHALL skip Real Mode and execute via LiteAgentRuntime in the host process
2. WHEN the Agent exceeds its budget (iterations, tokens, or timeout), THE system SHALL terminate the Agent and fall back to `routeSetLlmGenerator`
3. WHEN the Agent produces output that fails schema validation, THE system SHALL log a warning and fall back to `routeSetLlmGenerator`
4. WHEN the RoleAgentDelegator is not assembled (env flag off or assembly failure), THE system SHALL use the existing `buildRouteSet()` path directly
5. IF any unexpected error occurs during the agent-driven path, THEN THE system SHALL catch the error, log it, and produce a valid `BlueprintRouteSet` via fallback

### Requirement 8: Provenance Traceability

**User Story:** As a platform operator, I want each generated RouteSet to carry provenance metadata indicating how it was produced, so that I can distinguish agent-generated results from fallback results for monitoring and debugging.

#### Acceptance Criteria

1. WHEN the RouteSet is produced via the agent-driven path successfully, THE provenance SHALL contain `generationSource: "agent"` and include `executionMode`, `iterations`, `totalTokens`, and `durationMs`
2. WHEN the RouteSet is produced via LiteAgentRuntime fallback, THE provenance SHALL contain `generationSource: "agent_fallback_lite"`
3. WHEN the RouteSet is produced via `routeSetLlmGenerator` fallback, THE provenance SHALL contain `generationSource: "agent_fallback_llm"` and include a `fallbackReason` string (max 400 characters)
4. WHEN the env flag is off and the existing path is used, THE provenance SHALL remain unchanged from current behavior

