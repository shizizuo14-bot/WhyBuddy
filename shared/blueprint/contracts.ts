export type BlueprintGenerationStage =
  | "input"
  | "clarification"
  | "route_generation"
  | "spec_tree"
  | "spec_docs"
  | "effect_preview"
  | "prompt_packaging"
  | "runtime_capability"
  | "engineering_landing";

export type BlueprintGenerationStatus =
  | "pending"
  | "running"
  | "waiting"
  | "reviewing"
  | "completed"
  | "failed";

export type BlueprintGenerationMode =
  | "autopilot_route"
  | "spec_tree"
  | "spec_docs"
  | "effect_preview"
  | "prompt_packaging"
  | "runtime_capability"
  | "engineering_landing";

export type BlueprintRouteRiskLevel = "low" | "medium" | "high";
export type BlueprintRouteCostLevel = "low" | "medium" | "high";
export type BlueprintRouteComplexity = "light" | "balanced" | "deep";
export type BlueprintRouteKind = "primary" | "alternative";
export type BlueprintRuntimeCapabilityKind =
  | "docker"
  | "mcp"
  | "skill"
  | "aigc_node"
  | "role";
export type BlueprintRuntimeCapabilitySecurityLevel =
  | "readonly"
  | "sandboxed"
  | "write_enabled"
  | "networked";
export type BlueprintRuntimeCapabilityStatus =
  | "available"
  | "disabled"
  | "requires_approval";
export type BlueprintCapabilityInvocationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "blocked";
export type BlueprintCapabilitySafetyGateStatus = "allowed" | "blocked";
export type BlueprintCapabilityEvidenceKind =
  | "analysis"
  | "diagram"
  | "document"
  | "log"
  | "safety";
export type BlueprintCapabilityEvidenceStatus =
  | "recorded"
  | "blocked"
  | "failed";
export type BlueprintSpecTreeStatus = "draft" | "reviewing" | "accepted";
export type BlueprintSpecTreeNodeStatus =
  | "seed"
  | "draft"
  | "ready"
  | "accepted";
export type BlueprintSpecTreeNodeType =
  | "root"
  | "route_step"
  | "alternative_route"
  | "spec_document"
  | "effect_preview"
  | "prompt_package"
  | "engineering_plan";
export type BlueprintSpecDocumentType = "requirements" | "design" | "tasks";
export type BlueprintSpecDocumentStatus =
  | "draft"
  | "reviewing"
  | "accepted"
  | "rejected";
export type BlueprintEffectPreviewStatus = "preview" | "completed";
export type BlueprintEffectPreviewSourceStatus =
  | "accepted"
  | "draft"
  | "reviewing"
  | "mixed";
export type BlueprintImplementationPromptTargetPlatform =
  | "cursor"
  | "kiro"
  | "trae"
  | "windsurf"
  | "codex"
  | "claude";
export type BlueprintImplementationPromptSourceStatus =
  | "accepted"
  | "draft"
  | "reviewing"
  | "mixed"
  | "missing";
export type BlueprintImplementationPromptSectionKind =
  | "context"
  | "implementation"
  | "constraints"
  | "verification"
  | "handoff";
export type BlueprintImplementationPromptItemKind =
  | "instruction"
  | "constraint"
  | "verification"
  | "source"
  | "note";
export type BlueprintEngineeringLandingStepMode =
  | "automatic"
  | "manual"
  | "handoff";
export type BlueprintEngineeringLandingRiskLevel = "low" | "medium" | "high";
export type BlueprintEngineeringLandingPlanStatus =
  | "draft"
  | "ready"
  | "running"
  | "completed"
  | "failed";
export type BlueprintEngineeringRunStatus =
  | "planned"
  | "running"
  | "passed"
  | "failed"
  | "blocked";
export type BlueprintEngineeringVerificationStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "blocked";

export interface BlueprintClarificationAnswer {
  questionId: string;
  answer: string;
}

export type BlueprintGithubSourceKind = "repository";
export type BlueprintClarificationQuestionKind =
  | "goal"
  | "audience"
  | "constraint"
  | "github"
  | "domain";
export type BlueprintClarificationReadinessStatus =
  | "needs_answers"
  | "ready";
export type BlueprintDomainAssetKind =
  | "product_goal"
  | "github_repository"
  | "clarification"
  | "domain_note";
export type BlueprintDomainEvidenceKind =
  | "intake_text"
  | "github_url"
  | "clarification_answer";

export interface BlueprintGithubSource {
  id: string;
  kind: BlueprintGithubSourceKind;
  url: string;
  normalizedUrl: string;
  owner: string;
  repo: string;
  slug: string;
  branch?: string;
  path?: string;
  evidenceIds: string[];
  duplicateOf?: string;
}

export interface BlueprintDomainEvidence {
  id: string;
  kind: BlueprintDomainEvidenceKind;
  label: string;
  summary: string;
  value: string;
  sourceId?: string;
  createdAt: string;
}

export interface BlueprintDomainAsset {
  id: string;
  kind: BlueprintDomainAssetKind;
  title: string;
  summary: string;
  sourceIds: string[];
  evidenceIds: string[];
  tags: string[];
  createdAt: string;
}

export interface BlueprintProjectDomainContext {
  projectId: string;
  updatedAt: string;
  intakeIds: string[];
  sourceIds: string[];
  assets: BlueprintDomainAsset[];
  evidence: BlueprintDomainEvidence[];
}

export interface BlueprintIntakeRequest {
  projectId?: string;
  sourceId?: string;
  targetText?: string;
  githubUrls?: string[];
  domainNotes?: string[];
}

export interface BlueprintIntake {
  id: string;
  projectId?: string;
  sourceId?: string;
  targetText?: string;
  githubUrls: string[];
  sources: BlueprintGithubSource[];
  duplicateGithubUrls: BlueprintGithubSource[];
  domainNotes: string[];
  assets: BlueprintDomainAsset[];
  evidence: BlueprintDomainEvidence[];
  readiness: BlueprintClarificationReadiness;
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintClarificationQuestion {
  id: string;
  kind: BlueprintClarificationQuestionKind;
  prompt: string;
  required: boolean;
  sourceIds: string[];
  evidenceIds: string[];
}

export interface BlueprintClarificationReadiness {
  status: BlueprintClarificationReadinessStatus;
  score: number;
  answeredRequired: number;
  requiredTotal: number;
  missingQuestionIds: string[];
}

export interface BlueprintClarificationSession {
  id: string;
  intakeId: string;
  projectId?: string;
  questions: BlueprintClarificationQuestion[];
  answers: BlueprintClarificationAnswer[];
  readiness: BlueprintClarificationReadiness;
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintGenerationRequest {
  projectId?: string;
  sourceId?: string;
  version?: string;
  mode?: BlueprintGenerationMode;
  intakeId?: string;
  clarificationSessionId?: string;
  targetText?: string;
  githubUrls?: string[];
  clarifications?: BlueprintClarificationAnswer[];
  domainContext?: BlueprintProjectDomainContext;
}

export interface BlueprintRouteStep {
  id: string;
  title: string;
  description: string;
  role: string;
  status: "pending" | "ready" | "blocked";
}

export interface BlueprintCapabilityUsage {
  id: string;
  label: string;
  kind: BlueprintRuntimeCapabilityKind;
  purpose: string;
}

export interface BlueprintRuntimeCapability {
  id: string;
  label: string;
  kind: BlueprintRuntimeCapabilityKind;
  purpose: string;
  description: string;
  tags: string[];
  securityLevel: BlueprintRuntimeCapabilitySecurityLevel;
  status: BlueprintRuntimeCapabilityStatus;
  adapter: string;
  inputSchema: string;
  outputTypes: string[];
  supportedStages: BlueprintGenerationStage[];
  requiresApproval: boolean;
  projectScoped: boolean;
}

export interface BlueprintCapabilitySafetyGate {
  status: BlueprintCapabilitySafetyGateStatus;
  reason: string;
  requiresApproval: boolean;
  approved: boolean;
  securityLevel: BlueprintRuntimeCapabilitySecurityLevel;
}

export interface BlueprintCapabilityInvocationRequest {
  capabilityId: string;
  routeId?: string;
  nodeId?: string;
  input?: string;
  approved?: boolean;
  requestedBy?: string;
  evidenceTags?: string[];
}

export interface BlueprintCapabilityInvocation {
  id: string;
  jobId: string;
  capabilityId: string;
  capabilityLabel: string;
  kind: BlueprintRuntimeCapabilityKind;
  status: BlueprintCapabilityInvocationStatus;
  securityLevel: BlueprintRuntimeCapabilitySecurityLevel;
  safetyGate: BlueprintCapabilitySafetyGate;
  requestedAt: string;
  completedAt?: string;
  requestedBy?: string;
  routeId?: string;
  nodeId?: string;
  input?: string;
  outputSummary: string;
  logs: string[];
  evidenceIds: string[];
  durationMs: number;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    routeSetId?: string;
    routeId?: string;
    specTreeId?: string;
    nodeId?: string;
    targetText?: string;
    githubUrls: string[];
  };
}

export interface BlueprintCapabilityEvidence {
  id: string;
  jobId: string;
  invocationId: string;
  capabilityId: string;
  capabilityLabel: string;
  kind: BlueprintCapabilityEvidenceKind;
  status: BlueprintCapabilityEvidenceStatus;
  title: string;
  summary: string;
  createdAt: string;
  routeSetId?: string;
  routeId?: string;
  specTreeId?: string;
  nodeId?: string;
  artifacts: string[];
  logs: string[];
  tags: string[];
  payloadSummary: BlueprintArtifactPayloadSummary;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    routeSetId?: string;
    routeId?: string;
    specTreeId?: string;
    nodeId?: string;
    targetText?: string;
    githubUrls: string[];
  };
}

export interface BlueprintRouteCandidate {
  id: string;
  kind: BlueprintRouteKind;
  title: string;
  summary: string;
  rationale: string;
  riskLevel: BlueprintRouteRiskLevel;
  costLevel: BlueprintRouteCostLevel;
  complexity: BlueprintRouteComplexity;
  estimatedEffort: string;
  capabilities: BlueprintCapabilityUsage[];
  steps: BlueprintRouteStep[];
  outputs: string[];
}

export interface BlueprintRouteSet {
  id: string;
  requestId: string;
  createdAt: string;
  primaryRouteId: string;
  routes: BlueprintRouteCandidate[];
  nextAsset: {
    type: "spec_tree";
    menu: "deduction";
    description: string;
  };
  provenance: {
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
  };
}

export interface BlueprintRouteSelectionRequest {
  routeId: string;
  reason?: string;
  selectedBy?: string;
  mergedAlternativeRouteIds?: string[];
}

export interface BlueprintRouteSelection {
  id: string;
  routeSetId: string;
  routeId: string;
  routeTitle: string;
  selectedAt: string;
  selectedBy?: string;
  reason?: string;
  mergedAlternativeRouteIds: string[];
  status: "selected";
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
  };
}

export interface BlueprintSpecTreeNode {
  id: string;
  parentId?: string;
  title: string;
  summary: string;
  type: BlueprintSpecTreeNodeType;
  status: BlueprintSpecTreeNodeStatus;
  priority: number;
  routeId?: string;
  routeStepId?: string;
  dependencies: string[];
  outputs: string[];
  children: string[];
  metadata?: Record<string, string | number | boolean | string[]>;
}

export interface BlueprintSpecTree {
  id: string;
  routeSetId: string;
  selectionId: string;
  selectedRouteId: string;
  rootNodeId: string;
  version: number;
  status: BlueprintSpecTreeStatus;
  createdAt: string;
  updatedAt: string;
  alternativeRouteIds: string[];
  nodes: BlueprintSpecTreeNode[];
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
  };
}

export interface BlueprintUpdateSpecTreeNodeRequest {
  title?: string;
  summary?: string;
  status?: BlueprintSpecTreeNodeStatus;
  priority?: number;
  outputs?: string[];
}

export type BlueprintSpecTreeActionType =
  | "add_node"
  | "delete_node"
  | "move_node"
  | "merge_nodes"
  | "split_node"
  | "set_current_version";

export type BlueprintSpecTreeActionRequest =
  | {
      action: "add_node";
      parentId: string;
      title: string;
      summary?: string;
      type?: BlueprintSpecTreeNodeType;
      status?: BlueprintSpecTreeNodeStatus;
      priority?: number;
      outputs?: string[];
    }
  | {
      action: "delete_node";
      nodeId: string;
    }
  | {
      action: "move_node";
      nodeId: string;
      parentId: string;
      priority?: number;
    }
  | {
      action: "merge_nodes";
      sourceNodeId: string;
      targetNodeId: string;
    }
  | {
      action: "split_node";
      sourceNodeId: string;
      title: string;
      summary?: string;
      outputs?: string[];
      placement?: "sibling" | "child";
    }
  | {
      action: "set_current_version";
      versionId: string;
    };

export interface BlueprintSpecTreeVersionSnapshot {
  id: string;
  treeId: string;
  version: number;
  title?: string;
  summary?: string;
  savedAt: string;
  savedBy?: string;
  snapshot: BlueprintSpecTree;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
  };
}

export interface BlueprintSpecDocument {
  id: string;
  jobId: string;
  treeId: string;
  nodeId: string;
  type: BlueprintSpecDocumentType;
  status?: BlueprintSpecDocumentStatus;
  version?: number;
  sourceDocumentId?: string;
  title: string;
  summary: string;
  content: string;
  format: "markdown";
  createdAt: string;
  updatedAt?: string;
  reviewedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
    treeVersion: number;
    nodeType: BlueprintSpecTreeNodeType;
    nodeTitle: string;
    nodeSummary: string;
    dependencies: string[];
    outputs: string[];
  };
}

export interface BlueprintSpecDocumentVersionSnapshot {
  id: string;
  documentId: string;
  sourceDocumentId: string;
  jobId: string;
  treeId: string;
  nodeId: string;
  type: BlueprintSpecDocumentType;
  version: number;
  status: BlueprintSpecDocumentStatus;
  title: string;
  summary: string;
  content: string;
  format: "markdown";
  savedAt: string;
  savedBy?: string;
  acceptedAt?: string;
  reviewedAt?: string;
  rejectedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    treeVersion: number;
    nodeType: BlueprintSpecTreeNodeType;
    nodeTitle: string;
    nodeSummary: string;
    dependencies: string[];
    outputs: string[];
  };
}

export interface BlueprintEffectPreviewStep {
  id: string;
  title: string;
  summary: string;
  sourceDocumentIds: string[];
}

export interface BlueprintEffectPreviewMilestone {
  id: string;
  title: string;
  summary: string;
  target: string;
  sourceDocumentIds: string[];
}

export interface BlueprintEffectPreviewPrototypeCue {
  id: string;
  title: string;
  surface: "ui" | "api" | "workflow" | "architecture" | "operations";
  cue: string;
  sourceDocumentIds: string[];
}

export interface BlueprintEffectPreviewNode {
  id: string;
  nodeId: string;
  nodeTitle: string;
  nodeType: BlueprintSpecTreeNodeType;
  summary: string;
  sourceDocumentIds: string[];
  steps: BlueprintEffectPreviewStep[];
  milestones: BlueprintEffectPreviewMilestone[];
  prototypeCues: BlueprintEffectPreviewPrototypeCue[];
}

export interface BlueprintEffectPreview {
  id: string;
  jobId: string;
  treeId: string;
  nodeId: string;
  sourceDocumentIds: string[];
  status: BlueprintEffectPreviewStatus;
  createdAt: string;
  updatedAt?: string;
  summary: string;
  architectureNotes: string[];
  prototypeNotes: string[];
  progressPlan: BlueprintEffectPreviewMilestone[];
  nodes: BlueprintEffectPreviewNode[];
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
    treeVersion: number;
    nodeType: BlueprintSpecTreeNodeType;
    nodeTitle: string;
    nodeSummary: string;
    sourceStatus: BlueprintEffectPreviewSourceStatus;
    includeDrafts: boolean;
    sourceDocumentStatuses: Record<string, BlueprintSpecDocumentStatus>;
  };
}

export interface BlueprintImplementationPromptTarget {
  platform: BlueprintImplementationPromptTargetPlatform;
  label: string;
  executionMode: "agent" | "chat" | "workspace";
  guidance: string;
}

export interface BlueprintImplementationPromptItem {
  id: string;
  kind: BlueprintImplementationPromptItemKind;
  title: string;
  content: string;
  nodeIds: string[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
}

export interface BlueprintImplementationPromptSection {
  id: string;
  kind: BlueprintImplementationPromptSectionKind;
  title: string;
  content: string;
  items: BlueprintImplementationPromptItem[];
  nodeIds: string[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
}

export interface BlueprintImplementationPromptPackage {
  id: string;
  jobId: string;
  treeId: string;
  nodeIds: string[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
  targetPlatform: BlueprintImplementationPromptTargetPlatform;
  target: BlueprintImplementationPromptTarget;
  title: string;
  summary: string;
  content: string;
  sections: BlueprintImplementationPromptSection[];
  createdAt: string;
  updatedAt?: string;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
    treeVersion: number;
    nodeIds: string[];
    sourceDocumentIds: string[];
    sourcePreviewIds: string[];
    targetPlatform: BlueprintImplementationPromptTargetPlatform;
    sourceDocumentStatus: BlueprintImplementationPromptSourceStatus;
    sourcePreviewStatus: BlueprintImplementationPromptSourceStatus;
    includeDrafts: boolean;
    includePreviewDrafts: boolean;
    sourceDocumentStatuses: Record<string, BlueprintSpecDocumentStatus>;
    sourcePreviewStatuses: Record<string, BlueprintEffectPreviewStatus>;
  };
}

export interface BlueprintEngineeringLandingStep {
  id: string;
  title: string;
  summary: string;
  mode: BlueprintEngineeringLandingStepMode;
  sourceNodeIds: string[];
  sourceDocumentIds: string[];
  sourcePreviewIds: string[];
  promptPackageIds: string[];
  fileScopes: string[];
  verificationCommands: string[];
  riskLevel: BlueprintEngineeringLandingRiskLevel;
}

export interface BlueprintPlatformHandoff {
  id: string;
  platform: BlueprintImplementationPromptTargetPlatform;
  title: string;
  summary: string;
  content: string;
  promptPackageId: string;
  sourceNodeIds: string[];
  verificationCommands: string[];
}

export interface BlueprintEngineeringLandingPlan {
  id: string;
  jobId: string;
  treeId: string;
  status: BlueprintEngineeringLandingPlanStatus;
  title: string;
  summary: string;
  promptPackageIds: string[];
  steps: BlueprintEngineeringLandingStep[];
  handoffs: BlueprintPlatformHandoff[];
  createdAt: string;
  updatedAt: string;
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
    treeVersion: number;
    promptPackageIds: string[];
    sourceNodeIds: string[];
    sourceDocumentIds: string[];
    sourcePreviewIds: string[];
    sourceDocumentStatus: BlueprintImplementationPromptSourceStatus;
    sourcePreviewStatus: BlueprintImplementationPromptSourceStatus;
    sourceDocumentStatuses: Record<string, BlueprintSpecDocumentStatus>;
    sourcePreviewStatuses: Record<string, BlueprintEffectPreviewStatus>;
    promptPackagePlatforms: Record<
      string,
      BlueprintImplementationPromptTargetPlatform
    >;
  };
}

export interface BlueprintEngineeringVerificationResult {
  command: string;
  status: BlueprintEngineeringVerificationStatus;
  output?: string;
  durationMs?: number;
}

export interface BlueprintEngineeringRun {
  id: string;
  jobId: string;
  landingPlanId: string;
  status: BlueprintEngineeringRunStatus;
  startedAt?: string;
  completedAt?: string;
  summary: string;
  logs: string[];
  verificationResults: BlueprintEngineeringVerificationResult[];
  changedFiles: string[];
  promptPackageIds: string[];
  capabilityInvocationIds: string[];
  capabilityEvidenceIds: string[];
  provenance: {
    jobId: string;
    projectId?: string;
    sourceId?: string;
    targetText?: string;
    githubUrls: string[];
    landingPlanId: string;
    treeId: string;
    treeVersion: number;
    promptPackageIds: string[];
    capabilityInvocationIds: string[];
    capabilityEvidenceIds: string[];
  };
}

export interface BlueprintReviewSpecDocumentRequest {
  status: "accepted" | "rejected" | "reviewing";
  reviewedBy?: string;
  reviewNote?: string;
}

export interface BlueprintReviewSpecDocumentResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  document: BlueprintSpecDocument;
}

export interface BlueprintSaveSpecDocumentVersionResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  document: BlueprintSpecDocument;
  version: BlueprintSpecDocumentVersionSnapshot;
}

export type BlueprintGenerationArtifactType =
  | "intake"
  | "github_source"
  | "clarification_session"
  | "project_context"
  | "route_set"
  | "route_selection"
  | "spec_tree"
  | "spec_tree_version"
  | "requirements"
  | "design"
  | "tasks"
  | "spec_document_version"
  | "preview"
  | "effect_preview"
  | "prompt_pack"
  | "capability_registry"
  | "capability_invocation"
  | "capability_evidence"
  | "engineering_plan"
  | "engineering_run"
  | "replay"
  | "feedback";

export interface BlueprintGenerationArtifact {
  id: string;
  type: BlueprintGenerationArtifactType;
  title: string;
  summary: string;
  createdAt: string;
  payload?: unknown;
}

export interface BlueprintGenerationEvent {
  id: string;
  jobId: string;
  type: "job.created" | "job.stage" | "job.completed" | "job.failed";
  stage: BlueprintGenerationStage;
  status: BlueprintGenerationStatus;
  message: string;
  occurredAt: string;
  payload?: unknown;
}

export interface BlueprintGenerationJob {
  id: string;
  request: BlueprintGenerationRequest;
  status: BlueprintGenerationStatus;
  stage: BlueprintGenerationStage;
  projectId?: string;
  sourceId?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  artifacts: BlueprintGenerationArtifact[];
  events: BlueprintGenerationEvent[];
  error?: {
    code: string;
    message: string;
    stage: BlueprintGenerationStage;
  };
}

export type BlueprintArtifactMemoryType =
  | BlueprintGenerationArtifactType
  | "event";

export interface BlueprintArtifactSourceIds {
  routeSetId?: string;
  specTreeId?: string;
  specDocumentIds: string[];
  effectPreviewIds: string[];
  promptPackageIds: string[];
  capabilityInvocationIds: string[];
  capabilityEvidenceIds: string[];
  landingPlanIds: string[];
  engineeringRunIds: string[];
  capabilityIds: string[];
}

export type BlueprintArtifactPayloadSummary = Record<
  string,
  string | number | boolean | string[] | number[] | null
>;

export interface BlueprintArtifactMemoryEntry {
  id: string;
  jobId: string;
  artifactId: string;
  artifactType: BlueprintArtifactMemoryType;
  stage: BlueprintGenerationStage;
  title: string;
  summary: string;
  createdAt: string;
  sourceIds: BlueprintArtifactSourceIds;
  version: number;
  tags: string[];
  payloadSummary: BlueprintArtifactPayloadSummary;
}

export interface BlueprintArtifactReplayTimelineEntry {
  id: string;
  entryId: string;
  artifactId: string;
  artifactType: BlueprintArtifactMemoryType;
  stage: BlueprintGenerationStage;
  title: string;
  summary: string;
  occurredAt: string;
  tags: string[];
}

export interface BlueprintArtifactLineageEdge {
  id: string;
  fromEntryId: string;
  toEntryId: string;
  sourceId: string;
  sourceType:
    | "route_set"
    | "spec_tree"
    | "spec_document"
    | "effect_preview"
    | "prompt_package"
    | "capability_registry"
    | "capability_invocation"
    | "capability_evidence"
    | "landing_plan"
    | "engineering_run";
  relation: "derived_from" | "records" | "references";
}

export interface BlueprintArtifactReplaySnapshot {
  id: string;
  jobId: string;
  createdAt: string;
  timelineEntries: BlueprintArtifactReplayTimelineEntry[];
  stageCounts: Record<BlueprintGenerationStage, number>;
  lineageEdges: BlueprintArtifactLineageEdge[];
}

export interface BlueprintArtifactDiff {
  id: string;
  leftEntryId: string;
  rightEntryId: string;
  changedFields: string[];
  summary: string;
}

export type BlueprintArtifactFeedbackKind = "feedback" | "backfill";

export interface BlueprintArtifactFeedback {
  id: string;
  jobId: string;
  entryId: string;
  artifactId: string;
  artifactType: BlueprintArtifactMemoryType;
  kind: BlueprintArtifactFeedbackKind;
  message: string;
  summary: string;
  createdAt: string;
  createdBy?: string;
  tags: string[];
  sourceIds: BlueprintArtifactSourceIds;
  payloadSummary: BlueprintArtifactPayloadSummary;
}

export interface BlueprintArtifactLedgerResponse {
  job: BlueprintGenerationJob;
  entries: BlueprintArtifactMemoryEntry[];
}

export interface BlueprintCapabilityRegistryResponse {
  capabilities: BlueprintRuntimeCapability[];
}

export interface BlueprintCapabilityInvocationsResponse {
  job: BlueprintGenerationJob;
  routeSet?: BlueprintRouteSet;
  specTree?: BlueprintSpecTree;
  capabilities: BlueprintRuntimeCapability[];
  invocations: BlueprintCapabilityInvocation[];
}

export interface BlueprintCapabilityEvidenceResponse {
  job: BlueprintGenerationJob;
  routeSet?: BlueprintRouteSet;
  specTree?: BlueprintSpecTree;
  evidence: BlueprintCapabilityEvidence[];
}

export interface BlueprintInvokeCapabilityResponse {
  job: BlueprintGenerationJob;
  routeSet?: BlueprintRouteSet;
  specTree?: BlueprintSpecTree;
  capability: BlueprintRuntimeCapability;
  invocation: BlueprintCapabilityInvocation;
  evidence: BlueprintCapabilityEvidence;
}

export interface BlueprintFetchCapabilityInvocationsRequest {
  capabilityId?: string;
  nodeId?: string;
  routeId?: string;
}

export interface BlueprintFetchCapabilityEvidenceRequest {
  capabilityId?: string;
  nodeId?: string;
  routeId?: string;
}

export interface BlueprintCreateArtifactReplayRequest {
  title?: string;
  summary?: string;
  tags?: string[];
}

export interface BlueprintArtifactReplayResponse {
  job: BlueprintGenerationJob;
  replay: BlueprintArtifactReplaySnapshot;
}

export interface BlueprintArtifactReplaysResponse {
  job: BlueprintGenerationJob;
  replays: BlueprintArtifactReplaySnapshot[];
}

export interface BlueprintArtifactDiffRequest {
  leftEntryId: string;
  rightEntryId: string;
}

export interface BlueprintArtifactDiffResponse {
  job: BlueprintGenerationJob;
  diff: BlueprintArtifactDiff;
}

export interface BlueprintArtifactFeedbackRequest {
  entryId?: string;
  artifactId?: string;
  kind?: BlueprintArtifactFeedbackKind;
  message?: string;
  summary?: string;
  createdBy?: string;
  tags?: string[];
  sourceIds?: Partial<BlueprintArtifactSourceIds>;
  payloadSummary?: BlueprintArtifactPayloadSummary;
}

export interface BlueprintArtifactFeedbackResponse {
  job: BlueprintGenerationJob;
  feedback: BlueprintArtifactFeedback;
}

export interface BlueprintCreateGenerationJobResponse {
  job: BlueprintGenerationJob;
  routeSet?: BlueprintRouteSet;
  intake?: BlueprintIntake;
  clarificationSession?: BlueprintClarificationSession;
  projectContext?: BlueprintProjectDomainContext;
}

export interface BlueprintGenerationEventsResponse {
  job: BlueprintGenerationJob;
  events: BlueprintGenerationEvent[];
}

export interface BlueprintSelectRouteResponse {
  job: BlueprintGenerationJob;
  routeSet: BlueprintRouteSet;
  selection: BlueprintRouteSelection;
  specTree: BlueprintSpecTree;
}

export interface BlueprintResetRouteSelectionResponse {
  job: BlueprintGenerationJob;
  routeSet: BlueprintRouteSet;
}

export interface BlueprintUpdateSpecTreeNodeResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  node: BlueprintSpecTreeNode;
}

export interface BlueprintSpecTreeActionResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  node?: BlueprintSpecTreeNode;
  version?: BlueprintSpecTreeVersionSnapshot;
}

export interface BlueprintSaveSpecTreeVersionResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  version: BlueprintSpecTreeVersionSnapshot;
}

export interface BlueprintSpecDocumentsResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  documents: BlueprintSpecDocument[];
}

export interface BlueprintEffectPreviewsResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  effectPreviews: BlueprintEffectPreview[];
}

export interface BlueprintImplementationPromptPackagesResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  promptPackages: BlueprintImplementationPromptPackage[];
}

export interface BlueprintEngineeringLandingPlansResponse {
  job: BlueprintGenerationJob;
  specTree: BlueprintSpecTree;
  engineeringLandingPlans: BlueprintEngineeringLandingPlan[];
}

export interface BlueprintEngineeringRunsResponse {
  job: BlueprintGenerationJob;
  engineeringLandingPlans: BlueprintEngineeringLandingPlan[];
  engineeringRuns: BlueprintEngineeringRun[];
}

export interface BlueprintRecordEngineeringRunResponse {
  job: BlueprintGenerationJob;
  engineeringLandingPlan: BlueprintEngineeringLandingPlan;
  engineeringRun: BlueprintEngineeringRun;
}

export interface BlueprintGenerateSpecDocumentsRequest {
  nodeId?: string;
  types?: BlueprintSpecDocumentType[];
}

export interface BlueprintGenerateEffectPreviewsRequest {
  nodeId?: string;
  includeDrafts?: boolean;
}

export interface BlueprintGenerateImplementationPromptPackagesRequest {
  nodeId?: string;
  targetPlatforms?: BlueprintImplementationPromptTargetPlatform[];
  includeDrafts?: boolean;
  includePreviewDrafts?: boolean;
}

export interface BlueprintGenerateEngineeringLandingPlansRequest {
  promptPackageId?: string;
  targetPlatform?: BlueprintImplementationPromptTargetPlatform;
  targetPlatforms?: BlueprintImplementationPromptTargetPlatform[];
}

export interface BlueprintRecordEngineeringRunRequest {
  landingPlanId: string;
  status?: BlueprintEngineeringRunStatus;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  logs?: string[];
  verificationResults?: BlueprintEngineeringVerificationResult[];
  changedFiles?: string[];
  promptPackageIds?: string[];
  capabilityInvocationIds?: string[];
  capabilityEvidenceIds?: string[];
}

export interface BlueprintLatestGenerationJobResponse {
  job: BlueprintGenerationJob | null;
  routeSet?: BlueprintRouteSet;
  selection?: BlueprintRouteSelection;
  specTree?: BlueprintSpecTree;
  specTreeVersions?: BlueprintSpecTreeVersionSnapshot[];
  specDocuments?: BlueprintSpecDocument[];
  specDocumentVersions?: BlueprintSpecDocumentVersionSnapshot[];
  effectPreviews?: BlueprintEffectPreview[];
  promptPackages?: BlueprintImplementationPromptPackage[];
  capabilities?: BlueprintRuntimeCapability[];
  capabilityInvocations?: BlueprintCapabilityInvocation[];
  capabilityEvidence?: BlueprintCapabilityEvidence[];
  engineeringLandingPlans?: BlueprintEngineeringLandingPlan[];
  engineeringRuns?: BlueprintEngineeringRun[];
  artifactLedgerEntries?: BlueprintArtifactMemoryEntry[];
  artifactReplays?: BlueprintArtifactReplaySnapshot[];
  artifactFeedback?: BlueprintArtifactFeedback[];
}
