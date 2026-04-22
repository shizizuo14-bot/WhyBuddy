import type {
  DecisionHistoryEntry,
  MissionEvent,
  MissionOperatorActionRecord,
  MissionOperatorActionType,
  MissionProjectionLinks,
  MissionDecisionResolved,
  MissionDecisionSubmission,
  MissionPlanetEdge,
  MissionPlanetEdgeType,
  MissionPlanetInteriorData,
  MissionPlanetOverviewItem,
  MissionRecord,
} from "./contracts.js";
import type { DecisionTemplate } from "./decision-templates.js";
import type {
  AigcMonitoringExecutionStatus,
  AigcMonitoringSessionDetail,
} from "../aigc-monitoring.js";
import type { GraphInstanceSnapshot } from "../workflow-graph.js";

export const MISSION_API_ROUTES = {
  createTask: "/api/tasks",
  listTasks: "/api/tasks",
  getTask: "/api/tasks/:id",
  getTaskProjection: "/api/tasks/:id/projection",
  getTaskSession: "/api/tasks/:id/session",
  listTaskEvents: "/api/tasks/:id/events",
  cancelTask: "/api/tasks/:id/cancel",
  submitTaskOperatorAction: "/api/tasks/:id/operator-actions",
  submitTaskDecision: "/api/tasks/:id/decision",
  listPlanets: "/api/planets",
  getPlanet: "/api/planets/:id",
  getPlanetInterior: "/api/planets/:id/interior",
  createPlanetEdge: "/api/planets/edges",
  updatePlanetEdge: "/api/planets/edges/:fromId/:toId",
  deletePlanetEdge: "/api/planets/edges/:fromId/:toId",
  listDecisionTemplates: "/api/decision-templates",
  listDecisionHistory: "/api/tasks/:id/decisions",
} as const;

export interface MissionApiErrorResponse {
  ok?: false;
  error: string;
}

export interface ListMissionsQuery {
  limit?: number;
}

export interface ListMissionsResponse {
  ok: true;
  tasks: MissionRecord[];
}

export interface CreateMissionRequest {
  kind?: string;
  title?: string;
  sourceText?: string;
  topicId?: string;
  workflowId?: string;
  sessionId?: string;
  sourceApp?: string;
  autoDispatch?: boolean;
}

export interface CreateMissionResponse {
  ok: true;
  task: MissionRecord;
}

export interface GetMissionResponse {
  ok: true;
  task: MissionRecord;
}

export interface CancelMissionRequest {
  reason?: string;
  requestedBy?: string;
  source?: MissionEvent["source"];
}

export interface CancelMissionResponse {
  ok: true;
  alreadyFinal?: boolean;
  executorForwarded?: boolean;
  task: MissionRecord;
}

export interface SubmitMissionOperatorActionRequest {
  action: MissionOperatorActionType;
  reason?: string;
  requestedBy?: string;
}

export interface SubmitMissionOperatorActionResponse {
  ok: true;
  action: MissionOperatorActionRecord;
  task: MissionRecord;
}

export interface ListMissionEventsQuery {
  limit?: number;
}

export interface ListMissionEventsResponse {
  ok: true;
  missionId: string;
  events: MissionEvent[];
}

export type SubmitMissionDecisionRequest = MissionDecisionSubmission;

export interface SubmitMissionDecisionResponse {
  ok: true;
  alreadyResolved?: boolean;
  detail: string;
  decision: MissionDecisionResolved;
  task: MissionRecord;
}

export interface ListMissionPlanetsQuery {
  limit?: number;
}

export interface ListMissionPlanetsResponse {
  ok: true;
  planets: MissionPlanetOverviewItem[];
  edges: MissionPlanetEdge[];
}

export interface GetMissionPlanetResponse {
  ok: true;
  planet: MissionPlanetOverviewItem;
  task: MissionRecord;
}

export interface GetMissionPlanetInteriorResponse {
  ok: true;
  planet: MissionPlanetOverviewItem;
  interior: MissionPlanetInteriorData;
}

export interface UpsertMissionPlanetEdgeRequest {
  from: string;
  to: string;
  type?: MissionPlanetEdgeType;
  reason?: string;
}

export interface UpdateMissionPlanetEdgeRequest {
  type?: MissionPlanetEdgeType;
  reason?: string;
}

export interface UpsertMissionPlanetEdgeResponse {
  ok: true;
  edge: MissionPlanetEdge;
}

export interface DeleteMissionPlanetEdgeResponse {
  ok: true;
}

export interface ListDecisionTemplatesResponse {
  ok: true;
  templates: DecisionTemplate[];
}

export interface ListDecisionHistoryResponse {
  ok: true;
  missionId: string;
  decisions: DecisionHistoryEntry[];
}

export interface MissionProjectionWorkflowSummary {
  id: string;
  directive: string;
  status: string;
  currentStage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attachmentCount: number;
  inputSignature?: string;
  sourceApp?: string | null;
  sessionId?: string;
}

export interface MissionProjectionSessionSummary {
  sessionId: string;
  messageCount: number;
  memoryEntryCount: number;
  latestActivityAt: string | null;
}

export interface MissionProjectionView {
  missionId: string;
  links: MissionProjectionLinks;
  workflow?: MissionProjectionWorkflowSummary;
  graph?: GraphInstanceSnapshot;
  monitoring?: {
    instanceUuid: string;
    status: AigcMonitoringExecutionStatus;
    lastUpdateTime: string;
    executor: string | null;
  };
  session?: MissionProjectionSessionSummary;
}

export interface MissionSessionMemoryEntry {
  timestamp: string;
  workflowId: string | null;
  stage: string | null;
  type: "message" | "llm_prompt" | "llm_response" | "workflow_summary";
  direction?: "inbound" | "outbound";
  agentId?: string;
  otherAgentId?: string;
  preview: string;
  content: string;
  metadata?: unknown;
}

export interface GetMissionProjectionResponse {
  ok: true;
  missionId: string;
  projection: MissionProjectionView;
}

export interface GetMissionSessionResponse {
  ok: true;
  missionId: string;
  links: MissionProjectionLinks;
  session: AigcMonitoringSessionDetail;
  memoryEntries: MissionSessionMemoryEntry[];
}
