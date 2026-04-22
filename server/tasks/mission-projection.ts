import type {
  GetMissionSessionResponse,
  MissionProjectionView,
  MissionSessionMemoryEntry,
} from "../../shared/mission/api.js";
import { resolveMissionProjectionLinks } from "../../shared/mission/projection.js";
import db from "../db/index.js";
import {
  buildMonitoringSessionDetail,
  toMonitoringExecutionStatus,
} from "../core/aigc-monitoring-projection.js";
import { buildWorkflowGraphInstanceSnapshot } from "../core/workflow-graph-projection.js";
import { sessionStore } from "../memory/session-store.js";
import type { SessionEntry } from "../memory/session-store.js";
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
    replayId: workflowId,
  });

  const workflow = workflowInputRef?.workflow;
  const tasks = links.workflowId ? db.getTasksByWorkflow(links.workflowId) : [];
  const messages = links.workflowId ? db.getMessagesByWorkflow(links.workflowId) : [];
  const graph =
    workflow && links.workflowId
      ? buildWorkflowGraphInstanceSnapshot({
          workflow,
          tasks,
          messages,
          mission,
        })
      : undefined;
  const memoryEntries = sessionStore.getMissionWorkflowEntries(mission, {
    workflowId: links.workflowId,
  });

  return {
    missionId,
    links,
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
