import type { CommandPriority } from "./contracts.js";
import type {
  MissionDecision,
  WebAigcHitlSubmissionMetadata,
} from "../mission/contracts.js";

export const COMMAND_LIST_NODE_TYPE = "command_list" as const;

export type CommandListNodeType = typeof COMMAND_LIST_NODE_TYPE;
export type CommandListLocale = "zh-CN" | "en-US";
export type CommandListCandidateSource = "manual" | "heuristic" | "nl-command";
export type CommandListEventType = "generated" | "selected";

export interface CommandListCandidateInput {
  candidateId?: string;
  label?: string;
  commandText: string;
  description?: string;
  recommended?: boolean;
  source?: CommandListCandidateSource;
}

export interface CommandListTargetRequest {
  method: "POST";
  href: string;
  body: {
    commandText: string;
    userId: string;
    priority?: CommandPriority;
    locale?: CommandListLocale;
  };
}

export interface CommandListCandidate {
  candidateId: string;
  label: string;
  commandText: string;
  description?: string;
  recommended: boolean;
  source: CommandListCandidateSource;
  commandTarget: CommandListTargetRequest;
  clarificationPreviewTarget: CommandListTargetRequest;
}

export interface CommandListSelectionBridge {
  nodeType: "selection";
  decision: MissionDecision;
  recommendedSubmission?: {
    optionId: string;
    metadata: WebAigcHitlSubmissionMetadata;
  };
}

export interface CommandListSnapshot {
  listId: string;
  nodeType: CommandListNodeType;
  commandText: string;
  userId: string;
  locale: CommandListLocale;
  priority: CommandPriority;
  generatedAt: string;
  candidates: CommandListCandidate[];
  recommendedCandidateId?: string;
  selectionBridge: CommandListSelectionBridge;
  context?: Record<string, unknown>;
}

export interface CommandListEvent {
  eventId: string;
  listId: string;
  type: CommandListEventType;
  timestamp: number;
  userId: string;
  candidateId?: string;
  candidateLabel?: string;
  commandText?: string;
  submittedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface CommandListNodeInput {
  listId?: string;
  commandText?: string;
  userId?: string;
  locale?: CommandListLocale;
  priority?: CommandPriority;
  prompt?: string;
  candidates?: CommandListCandidateInput[];
  context?: Record<string, unknown>;
}

export interface CommandListNodeExecutionRequest {
  nodeType: CommandListNodeType;
  input?: CommandListNodeInput;
}

export interface CommandListNodeExecutionResult {
  ok: true;
  nodeType: CommandListNodeType;
  output: {
    status: "completed";
    commandList: CommandListSnapshot;
    selectionBridge: CommandListSelectionBridge;
    generatedEvent: CommandListEvent;
  };
}

export interface CommandListSelectionRequest {
  listId: string;
  candidateId: string;
  submittedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface CommandListSelectionResult {
  ok: true;
  listId: string;
  selection: {
    optionId: string;
    commandText: string;
    label: string;
    metadata: WebAigcHitlSubmissionMetadata;
  };
  event: CommandListEvent;
}
