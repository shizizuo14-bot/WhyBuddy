/**
 * @description Shared type contracts for the Autopilot Multi-Agent Brainstorm system.
 * Defines all interfaces and type unions used across server, client, and shared layers
 * for multi-agent collaboration, decision gating, tool proxying, synthesis, persistence,
 * and diagnostics.
 *
 * @see .kiro/specs/autopilot-multi-agent-brainstorm/design.md
 */

// ---------------------------------------------------------------------------
// Core Type Unions
// ---------------------------------------------------------------------------

/** Collaboration mode determining how crew members interact during a brainstorm session. */
export type CollaborationMode = "discussion" | "vote" | "division" | "audit";

/** Predefined role identifiers for brainstorm crew members. */
export type BrainstormRoleId =
  | "decider"
  | "planner"
  | "architect"
  | "executor"
  | "auditor"
  | "ui_previewer";

/** Tool categories available through the Tool Proxy. */
export type ToolCategory = "docker" | "mcp" | "github" | "skills";

// ---------------------------------------------------------------------------
// Decision Gate
// ---------------------------------------------------------------------------

/** Input provided to the Decision Gate for determining collaboration strategy. */
export interface DecisionGateInput {
  jobId: string;
  stageId: string;
  stageContext: string;
  /** Current system degradation state from capability bridges. */
  degradedBridges: string[];
  /** Previous stage outputs for context continuity. */
  previousStageOutputs?: string[];
}

/** Structured output from the Decision Gate LLM call. */
export interface DecisionGateOutput {
  brainstormNeeded: boolean;
  recommendedMode: CollaborationMode;
  requiredRoles: BrainstormRoleId[];
  requiredToolCategories: ToolCategory[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Branch Node Model
// ---------------------------------------------------------------------------

/** Type classification for nodes in the brainstorm reasoning tree. */
export type BranchNodeType =
  | "decision"
  | "thinking"
  | "action"
  | "observation"
  | "synthesis"
  | "error";

/** Lifecycle status of a branch node. */
export type BranchNodeStatus = "pending" | "active" | "completed" | "failed";

/** A single node in the brainstorm reasoning tree (mind-map). */
export interface BranchNode {
  id: string;
  sessionId: string;
  /** Null for the root node. */
  parentNodeId: string | null;
  roleId: BrainstormRoleId;
  type: BranchNodeType;
  status: BranchNodeStatus;
  title: string;
  content?: string;
  confidence?: number;
  tokenUsage?: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
  /** Monotonically increasing sequence number for replay ordering. */
  sequenceNumber: number;
}

/** A directed edge connecting parent and child branch nodes. */
export interface BranchEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

// ---------------------------------------------------------------------------
// Crew Member
// ---------------------------------------------------------------------------

/** Lifecycle state of a crew member during a brainstorm session. */
export type CrewMemberState =
  | "idle"
  | "thinking"
  | "acting"
  | "observing"
  | "completed"
  | "failed";

/** Runtime instance of a crew member participating in a brainstorm session. */
export interface CrewMemberInstance {
  roleId: BrainstormRoleId;
  state: CrewMemberState;
  iterationCount: number;
  maxIterations: number;
  tokenUsage: number;
  output?: CrewMemberOutput;
  failureReason?: string;
}

/** Output produced by a crew member after completing its reasoning task. */
export interface CrewMemberOutput {
  content: string;
  /** Confidence score in range [0, 1]. */
  confidence: number;
  toolInvocations: ToolInvocationRecord[];
  tokenUsage: number;
}

// ---------------------------------------------------------------------------
// Brainstorm Session
// ---------------------------------------------------------------------------

/** Lifecycle status of a brainstorm session. */
export type BrainstormSessionStatus =
  | "active"
  | "synthesizing"
  | "completed"
  | "failed"
  | "force_terminated";

/** A complete brainstorm session containing all state for multi-agent collaboration. */
export interface BrainstormSession {
  id: string;
  jobId: string;
  stageId: string;
  mode: CollaborationMode;
  crewMembers: Map<BrainstormRoleId, CrewMemberInstance>;
  branchNodes: BranchNode[];
  edges: BranchEdge[];
  status: BrainstormSessionStatus;
  tokenBudget: number;
  tokenUsed: number;
  toolCallCount: number;
  toolCallLimit: number;
  startedAt: Date;
  completedAt?: Date;
  synthesisResult?: SynthesisResult;
  deliberationSummary?: {
    roundCount: number;
    finalConvergenceScore: number;
    consensusAchieved: boolean;
    totalChallenges: number;
    unresolvedChallengeCount: number;
    challenges?: Array<{
      challengerRoleId: BrainstormRoleId;
      targetRoleId: BrainstormRoleId;
      summary: string;
      roundNumber: number;
    }>;
    rebuttals?: Array<{
      responderRoleId: BrainstormRoleId;
      challengeSummary: string;
      summary: string;
      roundNumber: number;
    }>;
    dissentingOpinions?: Array<{
      roleId: BrainstormRoleId;
      opinion: string;
    }>;
  };
}

/** Configuration for starting a new brainstorm session. */
export interface SessionConfig {
  jobId: string;
  stageId: string;
  mode: CollaborationMode;
  roles: BrainstormRoleId[];
  toolCategories: ToolCategory[];
  stageContext: string;
  /** Defaults to BRAINSTORM_MAX_TOKENS env var. */
  tokenBudget?: number;
  /** Defaults to BRAINSTORM_MAX_TOOL_CALLS env var. */
  toolCallLimit?: number;
}

// ---------------------------------------------------------------------------
// Tool Proxy
// ---------------------------------------------------------------------------

/** Request to invoke a tool through the Tool Proxy. */
export interface ToolInvocationRequest {
  sessionId: string;
  roleId: BrainstormRoleId;
  toolCategory: ToolCategory;
  toolId: string;
  params: Record<string, unknown>;
}

/** Result returned from a tool invocation. */
export interface ToolInvocationResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

/** Compact record of a tool invocation for audit/tracking purposes. */
export interface ToolInvocationRecord {
  requestId: string;
  toolCategory: ToolCategory;
  toolId: string;
  success: boolean;
  durationMs: number;
}

/** Permission scope defining what tools a crew member role can invoke. */
export interface ToolPermissionScope {
  allowedCategories: ToolCategory[];
  /** If empty/undefined, all tools in allowed categories are permitted. */
  allowedToolIds?: string[];
  maxCallsPerMember: number;
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

/** Input for the synthesis engine to aggregate crew member outputs. */
export interface SynthesisInput {
  sessionId: string;
  mode: CollaborationMode;
  crewOutputs: Array<{
    roleId: BrainstormRoleId;
    content: string;
    confidence: number;
  }>;
  stageContext: string;
  deliberationContext?: {
    challenges: Array<{
      challengerRoleId: BrainstormRoleId;
      targetRoleId: BrainstormRoleId;
      summary: string;
      roundNumber: number;
    }>;
    rebuttals: Array<{
      responderRoleId: BrainstormRoleId;
      challengeSummary: string;
      summary: string;
      roundNumber: number;
    }>;
    dissentingOpinions: Array<{
      roleId: BrainstormRoleId;
      opinion: string;
    }>;
  };
}

/** Result of the synthesis phase aggregating multi-agent brainstorm outputs. */
export interface SynthesisResult {
  decision: string;
  /** Confidence score in range [0, 1]. */
  confidence: number;
  reasoningPoints: Array<{
    roleId: BrainstormRoleId;
    point: string;
  }>;
  dissentingOpinions: Array<{
    roleId: BrainstormRoleId;
    opinion: string;
  }>;
  tokenUsage: number;
}

// ---------------------------------------------------------------------------
// Persistence / Memory Store
// ---------------------------------------------------------------------------

/** Serializable artifact representing a complete brainstorm session for persistence and replay. */
export interface BrainstormSessionArtifact {
  sessionId: string;
  jobId: string;
  stageId: string;
  mode: CollaborationMode;
  roles: BrainstormRoleId[];
  /** ISO 8601 timestamp. */
  startedAt: string;
  /** ISO 8601 timestamp. */
  completedAt: string;
  nodes: BranchNode[];
  edges: BranchEdge[];
  synthesisResult: SynthesisResult | null;
  tokenUsageByRole: Record<string, number>;
  totalTokenUsage: number;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Diagnostics entry for the brainstorm orchestrator reported via GET /api/blueprint/diagnostics. */
export interface BrainstormDiagnostics {
  enabled: boolean;
  activeSessionsCount: number;
  totalSessionsCompleted: number;
  degradationCount: number;
  averageSessionDurationMs: number;
  tokenBudget: number;
  toolCallLimit: number;
}
