import type { AigcMonitoringInstanceListQuery } from "../../../shared/aigc-monitoring.js";
import type {
  GetMissionSessionResponse,
  MissionProjectionView,
} from "../../../shared/mission/api.js";
import type { MissionRecord } from "../../../shared/mission/contracts.js";
import { WEB_AIGC_RISK_ACTION_API } from "../../../shared/web-aigc-risk-actions.js";
import type {
  MessageRecord,
  TaskRecord,
  WorkflowRecord,
} from "../../../shared/workflow-runtime.js";
import {
  buildMonitoringInstanceDetail,
  buildMonitoringInstanceListResponse,
  buildMonitoringSessionDetail,
} from "../../core/aigc-monitoring-projection.js";
import { resolveWorkflowMission } from "../../core/mission-enrichment-bridge.js";
import { buildWorkflowGraphInstanceSnapshot } from "../../core/workflow-graph-projection.js";
import db from "../../db/index.js";
import {
  buildMissionProjectionView,
  buildMissionSessionView,
} from "../../tasks/mission-projection.js";
import {
  missionRuntime,
  type MissionRuntime,
} from "../../tasks/mission-runtime.js";

export const INTERNAL_API_TARGET_IDS = [
  "mission.projection.get",
  "mission.session.get",
  "workflow.graph_instance_snapshot",
  "aigc_monitoring.instances",
  "aigc_monitoring.instance_detail",
  "aigc_monitoring.session_detail",
  "web_aigc.risk_action_catalog",
] as const;

export type InternalApiTargetId = (typeof INTERNAL_API_TARGET_IDS)[number];

export interface InternalApiExecutionRequest {
  targetId: string;
  input: string;
  context: string[];
  workflowId?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
}

export interface InternalApiExecutionResult {
  output: string;
  targetLabel: string;
  operation: string;
  response: unknown;
}

export interface InternalApiExecutorLike {
  execute(request: InternalApiExecutionRequest): Promise<InternalApiExecutionResult>;
}

export interface InternalApiWorkflowRepository {
  getWorkflow(id: string): WorkflowRecord | undefined;
  getWorkflows(): WorkflowRecord[];
  getTasksByWorkflow(workflowId: string): TaskRecord[];
  getMessagesByWorkflow(workflowId: string): MessageRecord[];
}

export interface MissionRuntimeReader {
  getTask(id: string): MissionRecord | undefined;
}

export interface InternalApiExecutorDependencies {
  workflowRepo?: InternalApiWorkflowRepository;
  resolveMissionId?: (workflowId: string) => string | undefined;
  getMission?: (missionId: string) => MissionRecord | undefined;
  missionRuntime?: MissionRuntimeReader;
  buildMissionProjection?: (
    runtime: MissionRuntimeReader,
    missionId: string,
  ) => MissionProjectionView | null;
  buildMissionSession?: (
    runtime: MissionRuntimeReader,
    missionId: string,
  ) => GetMissionSessionResponse | null;
}

function defaultBuildMissionProjection(
  runtime: MissionRuntimeReader,
  missionId: string,
): MissionProjectionView | null {
  return buildMissionProjectionView(runtime as MissionRuntime, missionId);
}

function defaultBuildMissionSession(
  runtime: MissionRuntimeReader,
  missionId: string,
): GetMissionSessionResponse | null {
  return buildMissionSessionView(runtime as MissionRuntime, missionId);
}

interface WorkflowProjectionContext {
  workflow: WorkflowRecord;
  mission?: MissionRecord;
  tasks: TaskRecord[];
  messages: MessageRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function readNumber(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : undefined;
}

function serializeInternalApiResponse(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function normalizeMonitoringListQuery(
  value: unknown,
): AigcMonitoringInstanceListQuery {
  if (!isRecord(value)) {
    return {};
  }

  return {
    name: readString(value, "name"),
    code: readString(value, "code"),
    version: readNumber(value, "version"),
    executor: readString(value, "executor"),
    instanceUuid: readString(value, "instanceUuid"),
    category: readString(value, "category"),
    status: readString(value, "status") as
      | AigcMonitoringInstanceListQuery["status"]
      | undefined,
    startTimeFrom: readString(value, "startTimeFrom"),
    startTimeTo: readString(value, "startTimeTo"),
    endTimeFrom: readString(value, "endTimeFrom"),
    endTimeTo: readString(value, "endTimeTo"),
    page: readNumber(value, "page"),
    size: readNumber(value, "size"),
  };
}

function resolveRequestedWorkflowId(
  request: InternalApiExecutionRequest,
): string | undefined {
  if (typeof request.workflowId === "string" && request.workflowId.trim()) {
    return request.workflowId.trim();
  }

  if (!isRecord(request.metadata)) {
    return undefined;
  }

  return (
    readString(request.metadata, "workflowId") ||
    readString(request.metadata, "instanceId")
  );
}

function resolveRequestedMissionId(
  request: InternalApiExecutionRequest,
): string | undefined {
  if (!isRecord(request.metadata)) {
    return undefined;
  }

  return (
    readString(request.metadata, "missionId") ||
    readString(request.metadata, "taskId")
  );
}

export class InternalApiExecutor implements InternalApiExecutorLike {
  private readonly workflowRepo: InternalApiWorkflowRepository;
  private readonly resolveMissionId: (workflowId: string) => string | undefined;
  private readonly getMission: (missionId: string) => MissionRecord | undefined;
  private readonly runtime: MissionRuntimeReader;
  private readonly buildMissionProjection: (
    runtime: MissionRuntimeReader,
    missionId: string,
  ) => MissionProjectionView | null;
  private readonly buildMissionSession: (
    runtime: MissionRuntimeReader,
    missionId: string,
  ) => GetMissionSessionResponse | null;

  constructor(deps: InternalApiExecutorDependencies = {}) {
    this.workflowRepo = deps.workflowRepo ?? db;
    this.resolveMissionId = deps.resolveMissionId ?? resolveWorkflowMission;
    this.getMission =
      deps.getMission ?? ((missionId: string) => missionRuntime.getTask(missionId));
    this.runtime = deps.missionRuntime ?? missionRuntime;
    this.buildMissionProjection =
      deps.buildMissionProjection ?? defaultBuildMissionProjection;
    this.buildMissionSession =
      deps.buildMissionSession ?? defaultBuildMissionSession;
  }

  async execute(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    switch (request.targetId) {
      case "mission.projection.get":
        return this.executeMissionProjection(request);
      case "mission.session.get":
        return this.executeMissionSession(request);
      case "workflow.graph_instance_snapshot":
        return this.executeWorkflowGraphSnapshot(request);
      case "aigc_monitoring.instances":
        return this.executeMonitoringInstanceList(request);
      case "aigc_monitoring.instance_detail":
        return this.executeMonitoringInstanceDetail(request);
      case "aigc_monitoring.session_detail":
        return this.executeMonitoringSessionDetail(request);
      case "web_aigc.risk_action_catalog":
        return this.executeRiskActionCatalog();
      default:
        throw new Error(`Internal API target not found: ${request.targetId}`);
    }
  }

  private resolveMission(request: InternalApiExecutionRequest): MissionRecord {
    const missionId = resolveRequestedMissionId(request);
    if (!missionId) {
      throw new Error("Missing required field: missionId");
    }

    const mission = this.runtime.getTask(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    return mission;
  }

  private getWorkflowProjectionContext(
    request: InternalApiExecutionRequest,
  ): WorkflowProjectionContext {
    const workflowId = resolveRequestedWorkflowId(request);
    if (!workflowId) {
      throw new Error("Missing required field: workflowId");
    }

    const workflow = this.workflowRepo.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const missionId = this.resolveMissionId(workflow.id);
    const mission = missionId ? this.getMission(missionId) : undefined;

    return {
      workflow,
      mission,
      tasks: this.workflowRepo.getTasksByWorkflow(workflow.id),
      messages: this.workflowRepo.getMessagesByWorkflow(workflow.id),
    };
  }

  private async executeMissionProjection(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    const mission = this.resolveMission(request);
    const response = this.buildMissionProjection(this.runtime, mission.id);
    if (!response) {
      throw new Error(`Mission projection not found: ${mission.id}`);
    }

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "Mission 聚合投影视图",
      operation: "mission.projection.get",
      response,
    };
  }

  private async executeMissionSession(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    const mission = this.resolveMission(request);
    const response = this.buildMissionSession(this.runtime, mission.id);
    if (!response) {
      throw new Error(`Mission session not found: ${mission.id}`);
    }

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "Mission 会话与记忆视图",
      operation: "mission.session.get",
      response,
    };
  }

  private async executeWorkflowGraphSnapshot(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    const context = this.getWorkflowProjectionContext(request);
    const response = buildWorkflowGraphInstanceSnapshot(context);

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "工作流图实例快照",
      operation: "workflow.graph_instance_snapshot",
      response,
    };
  }

  private async executeMonitoringInstanceList(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    const workflows = this.workflowRepo.getWorkflows().map((workflow) => {
      const missionId = this.resolveMissionId(workflow.id);
      const mission = missionId ? this.getMission(missionId) : undefined;
      const tasks = this.workflowRepo.getTasksByWorkflow(workflow.id);
      const messages = this.workflowRepo.getMessagesByWorkflow(workflow.id);
      const instance = buildWorkflowGraphInstanceSnapshot({
        workflow,
        mission,
        tasks,
        messages,
      });

      return {
        workflow,
        mission,
        instance,
      };
    });

    const query = normalizeMonitoringListQuery(
      isRecord(request.metadata) ? request.metadata.query : undefined,
    );
    const response = buildMonitoringInstanceListResponse({
      items: workflows,
      query,
    });

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "AIGC 监控实例列表",
      operation: "aigc_monitoring.instances",
      response,
    };
  }

  private async executeMonitoringInstanceDetail(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    const context = this.getWorkflowProjectionContext(request);
    const instance = buildWorkflowGraphInstanceSnapshot(context);
    const response = buildMonitoringInstanceDetail({
      workflow: context.workflow,
      mission: context.mission,
      instance,
    });

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "AIGC 监控实例详情",
      operation: "aigc_monitoring.instance_detail",
      response,
    };
  }

  private async executeMonitoringSessionDetail(
    request: InternalApiExecutionRequest,
  ): Promise<InternalApiExecutionResult> {
    const context = this.getWorkflowProjectionContext(request);
    const response = buildMonitoringSessionDetail({
      workflow: context.workflow,
      mission: context.mission,
      messages: context.messages,
    });

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "AIGC 监控会话详情",
      operation: "aigc_monitoring.session_detail",
      response,
    };
  }

  private async executeRiskActionCatalog(): Promise<InternalApiExecutionResult> {
    const response = {
      kind: "web_aigc_risk_action_catalog",
      version: 1,
      actions: WEB_AIGC_RISK_ACTION_API,
      notes: [
        "该目录用于暴露 Web-AIGC 兼容层中的高风险动作入口。",
        "向量写入类动作会继续经过 permission + governance + audit 链路。",
      ],
    };

    return {
      output: serializeInternalApiResponse(response),
      targetLabel: "Web-AIGC 风险动作目录",
      operation: "web_aigc.risk_action_catalog",
      response,
    };
  }
}
