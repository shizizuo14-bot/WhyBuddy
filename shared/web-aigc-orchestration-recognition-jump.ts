export const WEB_AIGC_ORCHESTRATION_RECOGNITION_JUMP_API = {
  EXECUTE: "POST /api/orchestration-recognition-jump/nodes/execute",
} as const;

export const WEB_AIGC_ORCHESTRATION_RECOGNITION_JUMP_NODE_TYPES = [
  "orchestration_recognition_jump",
] as const;

export type OrchestrationRecognitionJumpNodeType =
  (typeof WEB_AIGC_ORCHESTRATION_RECOGNITION_JUMP_NODE_TYPES)[number];

export interface WebAigcOrchestrationRecognitionJumpCandidate {
  orchestrationId: string;
  orchestrationCode?: string;
  entryNodeId: string;
  label: string;
  orchestrationName?: string;
  description?: string;
  keywords?: string[];
  aliases?: string[];
  inheritContextKeys?: string[];
  permissionResource?: string;
  metadata?: Record<string, unknown>;
}

export interface WebAigcOrchestrationRecognitionJumpFallbackTarget {
  orchestrationId: string;
  entryNodeId: string;
  reason?: string;
}

export interface OrchestrationRecognitionJumpNodeInput {
  query?: string;
  text?: string;
  candidates?: WebAigcOrchestrationRecognitionJumpCandidate[];
  fallbackTarget?: WebAigcOrchestrationRecognitionJumpFallbackTarget;
  inheritContext?: boolean;
  contextKeys?: string[];
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  agentId?: string;
  token?: string;
}

export interface OrchestrationRecognitionJumpNodeExecutionRequest {
  nodeType: OrchestrationRecognitionJumpNodeType;
  input?: OrchestrationRecognitionJumpNodeInput;
}

export interface WebAigcOrchestrationRecognitionJumpRecognizedTarget {
  orchestrationId: string;
  orchestrationCode?: string;
  entryNodeId: string;
  label: string;
  orchestrationName?: string;
  description?: string;
  confidence: number;
  matchedTerms: string[];
  source: "candidate" | "fallback";
  inheritContextKeys?: string[];
  permissionResource: string;
  metadata?: Record<string, unknown>;
}

export interface WebAigcOrchestrationRecognitionJumpPermissionSummary {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

export interface OrchestrationRecognitionJumpNodeExecutionResult {
  ok: boolean;
  nodeType: OrchestrationRecognitionJumpNodeType;
  output: {
    status: "completed" | "denied";
    jumpTargetNodeId?: string;
    jumpReason: string;
    jumpValidated: boolean;
    jump?: {
      nextNodeId: string;
      jumpReason: string;
      jumpValidated: boolean;
    };
    contextBridge?: {
      inheritContext: boolean;
      inheritedKeys?: string[];
    };
    recognizedTarget?: WebAigcOrchestrationRecognitionJumpRecognizedTarget;
    context: Record<string, unknown>;
    governance: {
      permission?: WebAigcOrchestrationRecognitionJumpPermissionSummary;
    };
    audit: {
      eventKey:
        | "orchestration.recognized"
        | "orchestration.denied";
      resource?: string;
      matchedTerms: string[];
    };
    observability: {
      eventKey: "orchestration.recognition_jump";
      nodeType: OrchestrationRecognitionJumpNodeType;
      candidateCount: number;
      matchedTerms: string[];
      confidence: number;
      source?: "candidate" | "fallback";
    };
    error?: string;
  };
}
