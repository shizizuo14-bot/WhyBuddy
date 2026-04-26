import type {
  GetMissionSessionResponse,
  MissionAutopilotSummary,
  MissionProjectionControlActionSummary,
  MissionProjectionOrchestrationStatus,
  MissionProjectionView,
  MissionSessionMemoryEntry,
} from "../../shared/mission/api.js";
import { buildMissionAutopilotSummary } from "../../shared/mission/autopilot.js";
import type {
  MissionOperatorActionRecord,
  MissionOperatorActionType,
  MissionRecord,
} from "../../shared/mission/contracts.js";
import {
  resolveMissionProjectionLinks,
  type MissionProjectionLinks,
} from "../../shared/mission/projection.js";
import db from "../db/index.js";
import {
  buildMonitoringSessionDetail,
  toMonitoringExecutionStatus,
} from "../core/aigc-monitoring-projection.js";
import { buildWorkflowGraphInstanceSnapshot } from "../core/workflow-graph-projection.js";
import { sessionStore } from "../memory/session-store.js";
import type { SessionEntry } from "../memory/session-store.js";
import { getAvailableMissionOperatorActions } from "./mission-operator-service.js";
import type { MissionRuntime } from "./mission-runtime.js";

function toMemoryEntry(entry: SessionEntry): MissionSessionMemoryEntry {
  return {
    timestamp: entry.timestamp,
    workflowId: entry.workflowId,
    stage: entry.stage,
    type: entry.type,
    direction: entry.direction,
    agentId: entry.agentId,
    otherAgentId: entry.otherAgentId,
    preview: entry.preview,
    content: entry.content,
    metadata: entry.metadata,
  };
}

function getWorkflowInput(workflowId?: string) {
  if (!workflowId) return undefined;
  const workflow = db.getWorkflow(workflowId);
  const input =
    workflow &&
    typeof workflow.results?.input === "object" &&
    workflow.results.input !== null
      ? (workflow.results.input as Record<string, unknown>)
      : undefined;

  return { workflow, input };
}

function stageLabelFromMission(
  mission: MissionRecord,
  stageKey: string | null
): string | null {
  if (!stageKey) return null;
  return mission.stages.find(stage => stage.key === stageKey)?.label || stageKey;
}

function toOrchestrationStatus(
  mission: MissionRecord
): MissionProjectionOrchestrationStatus {
  if (mission.status === "done") return "completed";
  if (mission.status === "failed") return "failed";
  if (mission.status === "cancelled" || mission.operatorState === "terminating") {
    return "terminated";
  }
  if (mission.operatorState === "paused") return "paused";
  if (mission.operatorState === "blocked") return "blocked";
  if (mission.status === "waiting") return "waiting";
  if (mission.status === "queued") return "queued";
  return "running";
}

function toControlActionSummary(
  action: MissionOperatorActionRecord
): MissionProjectionControlActionSummary {
  return {
    action: action.action,
    result: action.result,
    requestedBy: action.requestedBy,
    reason: action.reason,
    detail: action.detail,
    createdAt: new Date(action.createdAt).toISOString(),
  };
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
}

interface RouteSelectionReplanContext {
  decisionId: string;
  selectedRouteId: string;
  recommendedRouteId: string;
  reason: string | null;
  submittedAt: string | null;
}

function inferRouteSelectionReplanContext(
  mission: MissionRecord
): RouteSelectionReplanContext | null {
  const history = mission.decisionHistory ?? [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const formData = entry?.resolved?.metadata?.formData;

    if (!formData || formData.replanRequested !== true) {
      continue;
    }

    const selectedRouteId = normalizeNonEmptyString(
      typeof formData.selectedRouteId === "string" ? formData.selectedRouteId : null
    );
    const recommendedRouteId = normalizeNonEmptyString(
      typeof formData.recommendedRouteId === "string" ? formData.recommendedRouteId : null
    );

    if (
      !selectedRouteId ||
      !recommendedRouteId ||
      selectedRouteId === recommendedRouteId
    ) {
      continue;
    }

    const reason = normalizeNonEmptyString(
      typeof formData.changedReason === "string"
        ? formData.changedReason
        : typeof entry.reason === "string"
          ? entry.reason
          : null
    );
    const submittedAt =
      typeof entry.submittedAt === "number" && Number.isFinite(entry.submittedAt)
        ? new Date(entry.submittedAt).toISOString()
        : null;

    return {
      decisionId: entry.decisionId,
      selectedRouteId,
      recommendedRouteId,
      reason:
        reason ||
        `Route selection changed from ${recommendedRouteId} to ${selectedRouteId}.`,
      submittedAt,
    };
  }

  return null;
}

function inferReplanReason(mission: MissionRecord): string | null {
  const lastAction = mission.operatorActions?.at(-1);
  if (lastAction?.action === "retry") {
    return (
      lastAction.reason ||
      lastAction.detail ||
      mission.blocker?.reason ||
      mission.waitingFor ||
      "Retry requested after runtime interruption."
    );
  }

  if ((mission.attempt ?? 1) > 1) {
    return mission.blocker?.reason || mission.waitingFor || "Mission retried with a fresh execution attempt.";
  }

  const routeSelectionReplan = inferRouteSelectionReplanContext(mission);
  if (routeSelectionReplan) {
    return routeSelectionReplan.reason;
  }

  return null;
}

function inferReplanTrigger(
  mission: MissionRecord
): MissionOperatorActionType | "system" | null {
  const lastAction = mission.operatorActions?.at(-1);
  if (lastAction?.action === "retry") return "retry";
  if (lastAction?.action === "escalate") return "escalate";
  if ((mission.attempt ?? 1) > 1) return "system";
  if (inferRouteSelectionReplanContext(mission)) return "system";
  return null;
}

function buildOrchestrationView(mission: MissionRecord) {
  const currentStageKey = mission.currentStageKey || null;
  const decisionId =
    normalizeNonEmptyString(mission.decision?.decisionId) ||
    (mission.decision ? mission.id : null);
  const recentActions = (mission.operatorActions || [])
    .slice(-5)
    .map(toControlActionSummary)
    .reverse();
  const lastAction = recentActions[0] || null;
  const routeSelectionReplan = inferRouteSelectionReplanContext(mission);
  const replanRequired =
    (mission.attempt ?? 1) > 1 ||
    mission.operatorActions?.some(action => action.action === "retry") ||
    Boolean(routeSelectionReplan) ||
    false;
  const replanUpdatedAt =
    lastAction?.action === "retry"
      ? lastAction.createdAt
      : (mission.attempt ?? 1) > 1
        ? new Date(mission.updatedAt).toISOString()
        : routeSelectionReplan?.submittedAt || null;

  return {
    status: toOrchestrationStatus(mission),
    currentStageKey,
    currentStageLabel: stageLabelFromMission(mission, currentStageKey),
    blockingReason: mission.blocker?.reason || mission.waitingFor || null,
    updatedAt: new Date(mission.updatedAt).toISOString(),
    bindings: {
      missionId: mission.id,
      workflowId: mission.projection?.workflowId || null,
      instanceId: mission.projection?.instanceId || mission.projection?.workflowId || null,
      decisionId,
      executorJobId: mission.executor?.jobId || null,
    },
    controlActions: {
      available: getAvailableMissionOperatorActions(mission),
      recent: recentActions,
      lastAction,
    },
    wait: {
      active: mission.status === "waiting",
      reason: mission.waitingFor || null,
      decisionId,
      timeoutAt:
        typeof mission.decision?.timeoutAt === "number"
          ? new Date(mission.decision.timeoutAt).toISOString()
          : null,
    },
    replan: {
      required: replanRequired,
      active:
        replanRequired &&
        mission.status !== "done" &&
        mission.status !== "cancelled" &&
        mission.status !== "failed",
      attempt: Math.max(1, mission.attempt ?? 1),
      reason: inferReplanReason(mission),
      triggerAction: inferReplanTrigger(mission),
      updatedAt: replanUpdatedAt,
    },
  };
}

function alignAutopilotSummaryWithLinks(
  summary: MissionAutopilotSummary,
  links: MissionProjectionLinks
): MissionAutopilotSummary {
  const selectedRoute =
    summary.route.selected ||
    summary.route.selectedRoute ||
    summary.route.candidateRoutes.find(candidate => candidate.selected) ||
    null;
  const selectedRouteId = normalizeNonEmptyString(
    summary.route.selectedRouteId || selectedRoute?.id || summary.evidence.correlation.selectedRouteId
  );
  const recommendedRouteId = normalizeNonEmptyString(
    summary.route.recommendedRouteId ||
      summary.route.candidateRoutes.find(candidate => candidate.recommended)?.id ||
      summary.evidence.correlation.recommendedRouteId ||
      selectedRouteId
  );
  const routeIds = uniqueStrings([
    ...summary.route.candidateRoutes.map(candidate => candidate.id),
    ...summary.evidence.correlation.routeIds,
    selectedRouteId,
    recommendedRouteId,
  ]);
  const routeStageKeys = uniqueStrings([
    ...summary.route.stages.map(stage => stage.key),
    ...summary.evidence.correlation.routeStageKeys,
    summary.route.currentStageKey,
  ]);
  const decisionId = normalizeNonEmptyString(
    summary.takeover.decisionId || summary.route.takeoverPointIds[0]
  );
  const decisionIds = uniqueStrings([
    ...summary.evidence.correlation.decisionIds,
    decisionId,
  ]);
  const currentStepKey = normalizeNonEmptyString(
    summary.evidence.correlation.currentStepKey ||
      summary.explanation.remainingSteps?.currentStepKey ||
      summary.route.currentStageKey
  );
  const correlationTimelineId = summary.evidence.correlation.timelineId;

  return {
    ...summary,
    route: {
      ...summary.route,
      id: links.workflowId ?? summary.route.id,
      recommendedRouteId,
      selectedRouteId,
      takeoverPointIds:
        summary.route.takeoverPointIds.length > 0
          ? summary.route.takeoverPointIds
          : decisionId
            ? [decisionId]
            : [],
      selected: selectedRoute,
      selectedRoute: selectedRoute,
      selection: {
        ...summary.route.selection,
        changedAt: summary.route.selection.changedAt ?? summary.route.evidence.lastEventAt,
      },
    },
    takeover: {
      ...summary.takeover,
      decisionId,
    },
    bindings: {
      ...summary.bindings,
      workflowId: links.workflowId ?? summary.bindings.workflowId,
      instanceId: links.instanceId ?? summary.bindings.instanceId,
    },
    evidence: {
      ...summary.evidence,
      correlation: {
        ...summary.evidence.correlation,
        workflowId: links.workflowId ?? summary.evidence.correlation.workflowId,
        replayId: links.replayId ?? summary.evidence.correlation.replayId,
        sessionId: links.sessionId ?? summary.evidence.correlation.sessionId,
        routeIds,
        recommendedRouteId,
        selectedRouteId,
        routeStageKeys,
        currentStepKey,
        decisionIds,
      },
    },
    explanation: {
      ...summary.explanation,
      currentState: summary.explanation.currentState
        ? {
            ...summary.explanation.currentState,
            routeSelectionStatus:
              summary.explanation.currentState.routeSelectionStatus || summary.route.selectionStatus,
            selectedRouteId:
              summary.explanation.currentState.selectedRouteId || selectedRouteId,
            correlationTimelineId:
              summary.explanation.currentState.correlationTimelineId || correlationTimelineId,
          }
        : summary.explanation.currentState,
      recommendationDetails: summary.explanation.recommendationDetails?.map(detail => ({
        ...detail,
        routeId: detail.routeId || selectedRouteId,
        decisionId: detail.decisionId || decisionId,
        routeSelectionStatus: detail.routeSelectionStatus || summary.route.selectionStatus,
        correlationTimelineId: detail.correlationTimelineId || correlationTimelineId,
      })),
      remainingSteps: summary.explanation.remainingSteps
        ? {
            ...summary.explanation.remainingSteps,
            currentStepKey:
              summary.explanation.remainingSteps.currentStepKey || currentStepKey,
            currentStepLabel:
              summary.explanation.remainingSteps.currentStepLabel || summary.route.currentStageLabel,
            selectedRouteId:
              summary.explanation.remainingSteps.selectedRouteId || selectedRouteId,
            routeSelectionStatus:
              summary.explanation.remainingSteps.routeSelectionStatus ||
              summary.route.selectionStatus,
          }
        : summary.explanation.remainingSteps,
    },
  };
}

function alignOrchestrationBindingsWithLinks(
  projection: ReturnType<typeof buildOrchestrationView>,
  links: MissionProjectionLinks
) {
  return {
    ...projection,
    bindings: {
      ...projection.bindings,
      workflowId: links.workflowId ?? projection.bindings.workflowId,
      instanceId: links.instanceId ?? projection.bindings.instanceId,
    },
  };
}

function alignGraphWithLinks(
  graph: ReturnType<typeof buildWorkflowGraphInstanceSnapshot>,
  links: MissionProjectionLinks
) {
  return {
    ...graph,
    instanceId: links.instanceId ?? graph.instanceId,
    workflowId: links.workflowId ?? graph.workflowId,
    sessionId: links.sessionId ?? graph.sessionId,
    links: {
      ...graph.links,
      workflowId: links.workflowId ?? graph.links.workflowId,
      sessionId: links.sessionId ?? graph.links.sessionId,
      replayId: links.replayId ?? graph.links.replayId,
    },
  };
}

function applyResolvedProjectionLinks(
  mission: MissionRecord,
  links: MissionProjectionLinks
): MissionRecord {
  return {
    ...mission,
    projection: {
      ...(mission.projection ?? {}),
      ...(links.workflowId ? { workflowId: links.workflowId } : {}),
      ...(links.instanceId ? { instanceId: links.instanceId } : {}),
      ...(links.sessionId ? { sessionId: links.sessionId } : {}),
      ...(links.replayId ? { replayId: links.replayId } : {}),
      ...(links.sourceApp ? { sourceApp: links.sourceApp } : {}),
    },
  };
}

export function buildMissionProjectionView(
  runtime: MissionRuntime,
  missionId: string
): MissionProjectionView | null {
  const mission = runtime.getTask(missionId);
  if (!mission) return null;

  const workflowId = mission.projection?.workflowId;
  const workflowInputRef = getWorkflowInput(workflowId);
  const links = resolveMissionProjectionLinks({
    mission,
    workflowId,
    workflowInput: workflowInputRef?.input,
    replayId: mission.projection?.replayId,
  });
  const alignedMission = applyResolvedProjectionLinks(mission, links);

  const workflow = workflowInputRef?.workflow;
  const tasks = links.workflowId ? db.getTasksByWorkflow(links.workflowId) : [];
  const messages = links.workflowId ? db.getMessagesByWorkflow(links.workflowId) : [];
  const rawGraph =
    workflow && links.workflowId
      ? buildWorkflowGraphInstanceSnapshot({
          workflow,
          tasks,
          messages,
          mission: alignedMission,
        })
      : undefined;
  const graph = rawGraph ? alignGraphWithLinks(rawGraph, links) : undefined;
  const memoryEntries = sessionStore.getMissionWorkflowEntries(mission, {
    workflowId: links.workflowId,
  });
  const autopilotSummary = alignAutopilotSummaryWithLinks(
    buildMissionAutopilotSummary({
      mission: alignedMission,
      workflowId: links.workflowId,
      source: "mission-projection",
      version: "server-autopilot-projection/v1",
      workflowRuntime: workflow
        ? {
            status: workflow.status,
            currentStage: workflow.current_stage,
            startedAt: workflow.started_at,
            completedAt: workflow.completed_at,
            directive: workflow.directive,
          }
        : undefined,
    }),
    links
  );
  const orchestration = alignOrchestrationBindingsWithLinks(
    buildOrchestrationView(alignedMission),
    links
  );

  return {
    missionId,
    links,
    autopilotSummary,
    orchestration,
    workflow:
      workflow && workflowInputRef
        ? {
            id: workflow.id,
            directive: workflow.directive,
            status: workflow.status,
            currentStage: workflow.current_stage,
            createdAt: workflow.created_at,
            startedAt: workflow.started_at,
            completedAt: workflow.completed_at,
            attachmentCount: Array.isArray(workflowInputRef.input?.attachments)
              ? workflowInputRef.input.attachments.length
              : 0,
            inputSignature:
              typeof workflowInputRef.input?.signature === "string"
                ? workflowInputRef.input.signature
                : undefined,
            sourceApp:
              typeof workflowInputRef.input?.sourceApp === "string"
                ? workflowInputRef.input.sourceApp
                : null,
            sessionId:
              typeof workflowInputRef.input?.sessionId === "string"
                ? workflowInputRef.input.sessionId
                : links.sessionId,
          }
        : undefined,
    graph,
    monitoring:
      workflow && graph
        ? {
            instanceUuid: workflow.id,
            status: toMonitoringExecutionStatus(graph.status),
            lastUpdateTime: new Date(mission.updatedAt).toISOString(),
            executor: mission.executor?.name || null,
          }
        : undefined,
    session: links.sessionId
      ? {
          sessionId: links.sessionId,
          messageCount: workflow ? messages.length : 0,
          memoryEntryCount: memoryEntries.length,
          latestActivityAt:
            memoryEntries.length > 0
              ? memoryEntries[memoryEntries.length - 1]?.timestamp || null
              : workflow?.completed_at || workflow?.started_at || null,
        }
      : undefined,
  };
}

export function buildMissionSessionView(
  runtime: MissionRuntime,
  missionId: string
): GetMissionSessionResponse | null {
  const mission = runtime.getTask(missionId);
  if (!mission) return null;

  const projection = buildMissionProjectionView(runtime, missionId);
  if (!projection) return null;

  const workflowId = projection.links.workflowId;
  const workflow = workflowId ? db.getWorkflow(workflowId) : undefined;
  const messages = workflowId ? db.getMessagesByWorkflow(workflowId) : [];
  const memoryEntries = sessionStore
    .getMissionWorkflowEntries(mission, {
      workflowId,
    })
    .map(toMemoryEntry);

  const session = workflow
    ? buildMonitoringSessionDetail({
        workflow,
        mission,
        messages,
      })
    : {
        sessionId: projection.links.sessionId || mission.topicId || mission.id,
        user: mission.topicId || "workflow-user",
        startTime: new Date(mission.createdAt).toISOString(),
        sourceApp: projection.links.sourceApp || null,
        messages: [],
      };

  return {
    ok: true,
    missionId,
    links: projection.links,
    session,
    memoryEntries,
  };
}
