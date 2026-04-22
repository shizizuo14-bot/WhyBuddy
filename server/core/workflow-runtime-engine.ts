import type { MissionRecord } from "../../shared/mission/contracts.js";
import type {
  StoredWebAigcRuntimeState,
  WebAigcEdgeSchema,
  WebAigcEdgeTransitionRecord,
  WebAigcGraphCheckpoint,
  WebAigcGraphDefinition,
  WebAigcGraphInstance,
  WebAigcNodeRunRecord,
  WebAigcNodeSchema,
} from "../../shared/workflow-domain.js";
import {
  isTerminalWebAigcStatus,
  toCubeWorkflowStatus,
  toWebAigcNodeRunStatus,
  toWebAigcRuntimeStatus,
} from "../../shared/workflow-domain.js";
import type {
  WorkflowNodeAdapter,
  WorkflowNodeAdapterResult,
  WorkflowNodeExecutionContext,
} from "../../shared/workflow-runtime-engine.js";
import type {
  TaskRecord,
  WorkflowRecord,
  WorkflowRuntime,
} from "../../shared/workflow-runtime.js";
import type {
  WorkflowOrganizationNode,
  WorkflowOrganizationSnapshot,
} from "../../shared/organization-schema.js";
import { serverRuntime } from "../runtime/server-runtime.js";

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function bestDeliverable(
  task: Pick<TaskRecord, "deliverable" | "deliverable_v2" | "deliverable_v3">,
): string {
  return task.deliverable_v3 || task.deliverable_v2 || task.deliverable || "";
}

function buildFallbackNodeType(node: WorkflowOrganizationNode): string {
  const executionMode = node.execution?.mode;
  if (executionMode === "orchestrate") return "root";
  if (executionMode === "plan") return "plan";
  if (executionMode === "review") return "review";
  if (executionMode === "audit") return "audit";
  if (executionMode === "summary") return "summary";
  return "agent_task";
}

function buildNodeInput(task?: TaskRecord): Record<string, unknown> {
  if (!task) return {};
  return {
    taskId: task.id,
    description: task.description,
    department: task.department,
    version: task.version,
  };
}

function buildNodeOutput(task?: TaskRecord): Record<string, unknown> | undefined {
  if (!task) return undefined;

  const deliverable = bestDeliverable(task);
  const output: Record<string, unknown> = {
    taskStatus: task.status,
  };
  if (deliverable.trim()) {
    output.deliverable = deliverable;
  }
  if (task.total_score !== null) {
    output.totalScore = task.total_score;
  }
  if (task.verify_result) {
    output.verifyResult = task.verify_result;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function buildNodeRunFromSchema(
  node: WebAigcNodeSchema,
  task?: TaskRecord,
): WebAigcNodeRunRecord {
  const waitingFor =
    task?.status === "waiting" || task?.status === "waiting_input"
      ? "task input"
      : undefined;

  return {
    nodeId: node.id,
    status: toWebAigcNodeRunStatus(task?.status, { waitingFor }),
    attempts: task?.version || 0,
    startedAt: task?.created_at || null,
    completedAt:
      task &&
      ["completed", "done", "passed", "failed", "terminated", "cancelled"].includes(task.status)
        ? task.updated_at
        : null,
    input: buildNodeInput(task),
    output: buildNodeOutput(task),
    waitingFor,
    error:
      task?.status === "failed" && typeof task.deliverable === "string"
        ? task.deliverable
        : undefined,
  };
}

function buildEdgeTransitionRecords(
  edges: WebAigcEdgeSchema[],
  nodeRuns: WebAigcNodeRunRecord[],
): WebAigcEdgeTransitionRecord[] {
  const nodeStatusById = new Map(
    nodeRuns.map(nodeRun => [nodeRun.nodeId, nodeRun.status]),
  );

  return edges.map(edge => {
    const fromStatus = nodeStatusById.get(edge.fromNodeId);
    const toStatus = nodeStatusById.get(edge.toNodeId);
    const executed =
      fromStatus && fromStatus !== "PENDING" && fromStatus !== "WAITING_INPUT";
    const blocked =
      toStatus === "PENDING" &&
      (fromStatus === "EXCEPTION" || fromStatus === "FORCE_TERMINATED");

    return {
      edgeId: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      kind: edge.kind,
      status: blocked ? "blocked" : executed ? "executed" : "known",
    };
  });
}

export function buildWorkflowGraphDefinition(input: {
  workflow: WorkflowRecord;
  tasks: TaskRecord[];
  mission?: MissionRecord;
}): WebAigcGraphDefinition {
  const { workflow, tasks, mission } = input;
  const organization = workflow.results?.organization as
    | WorkflowOrganizationSnapshot
    | undefined;
  const generatedAt = nowIso();

  if (organization?.nodes?.length) {
    const nodeSchemas: WebAigcNodeSchema[] = organization.nodes.map(node => ({
      id: node.id,
      type: buildFallbackNodeType(node),
      title: node.title || node.name,
      description: node.responsibility,
      agentId: node.agentId,
      stageKey: node.execution?.mode || null,
      inputs: [
        {
          key: "directive",
          label: "Directive",
          valueType: "string",
          required: true,
        },
      ],
      outputs: [
        {
          key: "result",
          label: "Result",
          valueType: "object",
        },
      ],
      config: [
        {
          key: "executionMode",
          label: "Execution mode",
          valueType: "string",
          defaultValue: node.execution?.mode,
        },
        {
          key: "strategy",
          label: "Strategy",
          valueType: "string",
          defaultValue: node.execution?.strategy,
        },
      ],
      metadata: {
        role: node.role,
        departmentId: node.departmentId,
        departmentLabel: node.departmentLabel,
        summaryFocus: node.summaryFocus,
      },
    }));

    const edgeSchemas: WebAigcEdgeSchema[] = organization.nodes
      .filter(node => node.parentId)
      .map(node => ({
        id: `${node.parentId}->${node.id}`,
        fromNodeId: node.parentId as string,
        toNodeId: node.id,
        kind: "success",
      }));

    return {
      kind: "graph_definition",
      version: 1,
      definitionId: workflow.id,
      code: workflow.id,
      name:
        typeof organization.taskProfile === "string" && organization.taskProfile.trim()
          ? organization.taskProfile.trim()
          : normalizeText(workflow.directive).slice(0, 80),
      source: "organization_projection",
      entryNodeId: organization.rootNodeId || organization.nodes[0].id,
      graphVersion: {
        kind: "graph_version",
        version: 1,
        definitionId: workflow.id,
        graphVersion: "v1",
        createdAt: generatedAt,
      },
      links: {
        workflowId: workflow.id,
        missionId: mission?.id,
        sessionId: mission?.topicId,
        replayId: workflow.id,
      },
      nodeSchemas,
      edgeSchemas,
      metadata: {
        departments: organization.departments,
        source: organization.source,
      },
    };
  }

  const nodeSchemas: WebAigcNodeSchema[] =
    tasks.length > 0
      ? tasks.map(task => ({
          id: `task-${task.id}`,
          type: "agent_task",
          title: task.description,
          description: `Assigned to ${task.worker_id}`,
          agentId: task.worker_id,
          stageKey: task.status,
          inputs: [
            {
              key: "description",
              label: "Description",
              valueType: "string",
              required: true,
            },
          ],
          outputs: [
            {
              key: "deliverable",
              label: "Deliverable",
              valueType: "string",
            },
          ],
          config: [],
          metadata: {
            taskId: task.id,
            managerId: task.manager_id,
            department: task.department,
          },
        }))
      : [
          {
            id: "workflow-root",
            type: "root",
            title: normalizeText(workflow.directive).slice(0, 120),
            description: workflow.directive,
            stageKey: workflow.current_stage,
            inputs: [
              {
                key: "directive",
                label: "Directive",
                valueType: "string",
                required: true,
              },
            ],
            outputs: [
              {
                key: "result",
                label: "Result",
                valueType: "object",
              },
            ],
            config: [],
          },
        ];

  const edgeSchemas: WebAigcEdgeSchema[] = nodeSchemas
    .slice(1)
    .map((node, index) => ({
      id: `${nodeSchemas[index].id}->${node.id}`,
      fromNodeId: nodeSchemas[index].id,
      toNodeId: node.id,
      kind: "success",
    }));

  return {
    kind: "graph_definition",
    version: 1,
    definitionId: workflow.id,
    code: workflow.id,
    name: normalizeText(workflow.directive).slice(0, 80),
    source: tasks.length > 0 ? "task_projection" : "inline",
    entryNodeId: nodeSchemas[0].id,
    graphVersion: {
      kind: "graph_version",
      version: 1,
      definitionId: workflow.id,
      graphVersion: "v1",
      createdAt: generatedAt,
    },
    links: {
      workflowId: workflow.id,
      missionId: mission?.id,
      sessionId: mission?.topicId,
      replayId: workflow.id,
    },
    nodeSchemas,
    edgeSchemas,
  };
}

function findDefinitionNodeByStageKey(
  definition: WebAigcGraphDefinition,
  stageKey?: string | null,
): WebAigcNodeSchema | undefined {
  if (!stageKey) return undefined;
  return definition.nodeSchemas.find(node => node.stageKey === stageKey);
}

export function buildWorkflowGraphInstance(input: {
  workflow: WorkflowRecord;
  tasks: TaskRecord[];
  mission?: MissionRecord;
  definition?: WebAigcGraphDefinition;
}): WebAigcGraphInstance {
  const { workflow, tasks, mission } = input;
  const definition =
    input.definition ||
    buildWorkflowGraphDefinition({
      workflow,
      tasks,
      mission,
    });
  const runtimeState = readStoredWebAigcRuntimeState(workflow);
  if (runtimeState?.instance) {
    return runtimeState.instance;
  }

  const taskByAgentId = new Map(tasks.map(task => [task.worker_id, task]));
  const nodeRuns = definition.nodeSchemas.map(node =>
    buildNodeRunFromSchema(
      node,
      node.agentId ? taskByAgentId.get(node.agentId) : undefined,
    ),
  );

  const checkpoint = mission?.waitingFor
    ? ({
        nodeId:
          nodeRuns.find(nodeRun => nodeRun.status === "WAITING_INPUT")?.nodeId ||
          definition.entryNodeId,
        waitingFor: mission.waitingFor,
        createdAt: nowIso(),
        resumeCount: 0,
      } satisfies WebAigcGraphCheckpoint)
    : undefined;

  return {
    kind: "graph_instance",
    version: 1,
    instanceId: workflow.id,
    definitionId: definition.definitionId,
    status: toWebAigcRuntimeStatus(workflow.status, {
      waitingFor: checkpoint?.waitingFor,
    }),
    currentNodeId:
      checkpoint?.nodeId ||
      nodeRuns.find(nodeRun => nodeRun.status === "EXECUTING")?.nodeId ||
      findDefinitionNodeByStageKey(definition, workflow.current_stage)?.id ||
      definition.entryNodeId,
    createdAt: workflow.created_at,
    startedAt: workflow.started_at,
    completedAt: workflow.completed_at,
    links: {
      workflowId: workflow.id,
      missionId: mission?.id,
      sessionId: mission?.topicId,
      replayId: workflow.id,
    },
    variables: {},
    nodeRuns,
    edgeTransitions: buildEdgeTransitionRecords(definition.edgeSchemas, nodeRuns),
    checkpoint,
  };
}

function defaultAdvanceTarget(
  definition: WebAigcGraphDefinition,
  currentNodeId: string,
): string | undefined {
  return definition.edgeSchemas.find(edge => edge.fromNodeId === currentNodeId)?.toNodeId;
}

function ensureNodeRun(
  instance: WebAigcGraphInstance,
  nodeId: string,
): WebAigcNodeRunRecord {
  const existing = instance.nodeRuns.find(nodeRun => nodeRun.nodeId === nodeId);
  if (existing) {
    return existing;
  }

  const created: WebAigcNodeRunRecord = {
    nodeId,
    status: "PENDING",
    attempts: 0,
    startedAt: null,
    completedAt: null,
  };
  instance.nodeRuns.push(created);
  return created;
}

function markEdgeExecuted(
  instance: WebAigcGraphInstance,
  edgeId?: string,
): void {
  if (!edgeId) return;
  const edge = instance.edgeTransitions.find(item => item.edgeId === edgeId);
  if (edge) {
    edge.status = "executed";
    edge.timestamp = nowIso();
  }
}

function resolveNextNodeId(
  definition: WebAigcGraphDefinition,
  currentNodeId: string,
  result: WorkflowNodeAdapterResult,
): { nextNodeId?: string; edgeId?: string } {
  if (result.kind === "complete") {
    return {};
  }

  const nextNodeId =
    result.kind === "advance" && result.nextNodeId
      ? result.nextNodeId
      : defaultAdvanceTarget(definition, currentNodeId);
  if (!nextNodeId) {
    return {};
  }

  const edge = definition.edgeSchemas.find(
    item => item.fromNodeId === currentNodeId && item.toNodeId === nextNodeId,
  );

  return {
    nextNodeId,
    edgeId: edge?.id,
  };
}

export function readStoredWebAigcRuntimeState(
  workflow?: Pick<WorkflowRecord, "results"> | null,
): StoredWebAigcRuntimeState | undefined {
  const state = workflow?.results?.webAigcRuntime;
  if (!state || typeof state !== "object") {
    return undefined;
  }

  const candidate = state as Partial<StoredWebAigcRuntimeState>;
  if (candidate.domainModelVersion !== 1) {
    return undefined;
  }
  if (!candidate.definition || !candidate.instance) {
    return undefined;
  }
  return candidate as StoredWebAigcRuntimeState;
}

export class InMemoryWorkflowNodeAdapterRegistry {
  private readonly adapters = new Map<string, WorkflowNodeAdapter>();

  register(adapter: WorkflowNodeAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: string): WorkflowNodeAdapter | undefined {
    return this.adapters.get(type);
  }
}

export class EchoWorkflowNodeAdapter implements WorkflowNodeAdapter {
  readonly type = "echo";

  async execute(context: {
    input: Record<string, unknown>;
    node: WebAigcNodeSchema;
  }): Promise<WorkflowNodeAdapterResult> {
    return {
      kind: "advance",
      output: {
        echoedFrom: context.node.id,
        ...context.input,
      },
    };
  }
}

class ProjectionPassThroughAdapter implements WorkflowNodeAdapter {
  constructor(readonly type: string) {}

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeAdapterResult> {
    return {
      kind: "advance",
      output: {
        lastNodeId: context.node.id,
        lastNodeType: context.node.type,
        ...context.input,
      },
    };
  }
}

export class WorkflowRuntimeEngine {
  constructor(
    private readonly runtime: WorkflowRuntime,
    private readonly adapters: InMemoryWorkflowNodeAdapterRegistry = new InMemoryWorkflowNodeAdapterRegistry(),
  ) {}

  registerAdapter(adapter: WorkflowNodeAdapter): void {
    this.adapters.register(adapter);
  }

  getState(
    workflowId: string,
    mission?: MissionRecord,
  ): StoredWebAigcRuntimeState | undefined {
    const workflow = this.runtime.workflowRepo.getWorkflow(workflowId);
    if (!workflow) return undefined;

    const existing = readStoredWebAigcRuntimeState(workflow);
    if (existing) {
      return existing;
    }

    const tasks = this.runtime.workflowRepo.getTasksByWorkflow(workflowId);
    const definition = buildWorkflowGraphDefinition({
      workflow,
      tasks,
      mission,
    });
    const instance = buildWorkflowGraphInstance({
      workflow,
      tasks,
      mission,
      definition,
    });

    return {
      domainModelVersion: 1,
      definition,
      instance,
      updatedAt: nowIso(),
    };
  }

  initialize(input: {
    workflowId: string;
    definition: WebAigcGraphDefinition;
    variables?: Record<string, unknown>;
  }): StoredWebAigcRuntimeState {
    const workflow = this.runtime.workflowRepo.getWorkflow(input.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${input.workflowId}`);
    }

    const createdAt = nowIso();
    const instance: WebAigcGraphInstance = {
      kind: "graph_instance",
      version: 1,
      instanceId: input.workflowId,
      definitionId: input.definition.definitionId,
      status: "PENDING",
      currentNodeId: input.definition.entryNodeId,
      createdAt: workflow.created_at || createdAt,
      startedAt: null,
      completedAt: null,
      links: {
        workflowId: input.workflowId,
        missionId: input.definition.links.missionId,
        sessionId: input.definition.links.sessionId,
        replayId: input.definition.links.replayId,
        auditId: input.definition.links.auditId,
      },
      variables: clone(input.variables || {}),
      nodeRuns: input.definition.nodeSchemas.map(node => ({
        nodeId: node.id,
        status: "PENDING",
        attempts: 0,
        startedAt: null,
        completedAt: null,
      })),
      edgeTransitions: input.definition.edgeSchemas.map(edge => ({
        edgeId: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        kind: edge.kind,
        status: "known",
      })),
    };

    const state: StoredWebAigcRuntimeState = {
      domainModelVersion: 1,
      definition: clone(input.definition),
      instance,
      updatedAt: createdAt,
    };

    this.persistState(input.workflowId, state);
    return state;
  }

  async runToCheckpoint(input: {
    workflowId: string;
    definition?: WebAigcGraphDefinition;
    variables?: Record<string, unknown>;
    maxSteps?: number;
  }): Promise<StoredWebAigcRuntimeState> {
    const workflow = this.requireWorkflow(input.workflowId);
    let state = readStoredWebAigcRuntimeState(workflow);
    if (!state) {
      state = this.initialize({
        workflowId: input.workflowId,
        definition:
          input.definition ||
          buildWorkflowGraphDefinition({
            workflow,
            tasks: this.runtime.workflowRepo.getTasksByWorkflow(input.workflowId),
          }),
        variables: input.variables,
      });
    }

    const limit = Math.max(1, input.maxSteps || 50);
    for (let step = 0; step < limit; step += 1) {
      if (
        isTerminalWebAigcStatus(state.instance.status) ||
        state.instance.status === "WAITING_INPUT"
      ) {
        break;
      }

      state = await this.executeCurrentNode(state);
      if (
        isTerminalWebAigcStatus(state.instance.status) ||
        state.instance.status === "WAITING_INPUT"
      ) {
        break;
      }
    }

    return state;
  }

  async resume(
    workflowId: string,
    payload: Record<string, unknown> = {},
  ): Promise<StoredWebAigcRuntimeState> {
    const workflow = this.requireWorkflow(workflowId);
    const state = readStoredWebAigcRuntimeState(workflow);
    if (!state) {
      throw new Error(`Workflow runtime state not found: ${workflowId}`);
    }
    if (!state.instance.checkpoint) {
      throw new Error(`Workflow is not waiting for input: ${workflowId}`);
    }

    const checkpoint = state.instance.checkpoint;
    const nextState = clone(state);
    nextState.instance.status = "EXECUTING";
    nextState.instance.variables = {
      ...nextState.instance.variables,
      ...payload,
    };
    nextState.instance.checkpoint = {
      ...checkpoint,
      resumeCount: checkpoint.resumeCount + 1,
      payload,
    };
    this.persistState(workflowId, nextState);
    return this.executeCurrentNode(nextState, payload);
  }

  private requireWorkflow(workflowId: string): WorkflowRecord {
    const workflow = this.runtime.workflowRepo.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    return workflow;
  }

  private persistState(workflowId: string, state: StoredWebAigcRuntimeState): void {
    const workflow = this.requireWorkflow(workflowId);
    const currentNode = state.definition.nodeSchemas.find(
      node => node.id === state.instance.currentNodeId,
    );
    const results =
      workflow.results && typeof workflow.results === "object" ? workflow.results : {};

    this.runtime.workflowRepo.updateWorkflow(workflowId, {
      status: toCubeWorkflowStatus(state.instance.status) as WorkflowRecord["status"],
      current_stage:
        workflow.current_stage || currentNode?.stageKey || state.instance.currentNodeId,
      completed_at: state.instance.completedAt,
      results: {
        ...results,
        webAigcRuntime: {
          ...state,
          updatedAt: nowIso(),
        },
      },
    });
  }

  private async executeCurrentNode(
    state: StoredWebAigcRuntimeState,
    resumePayload?: Record<string, unknown>,
  ): Promise<StoredWebAigcRuntimeState> {
    const nextState = clone(state);
    const { definition, instance } = nextState;
    const nodeId = instance.currentNodeId || definition.entryNodeId;
    const node = definition.nodeSchemas.find(item => item.id === nodeId);

    if (!node) {
      instance.status = "EXCEPTION";
      instance.error = `Node not found: ${nodeId}`;
      instance.completedAt = nowIso();
      this.persistState(instance.instanceId, nextState);
      return nextState;
    }

    const run = ensureNodeRun(instance, node.id);
    run.attempts += 1;
    run.startedAt = run.startedAt || nowIso();
    run.status = "EXECUTING";
    instance.status = "EXECUTING";
    instance.currentNodeId = node.id;
    this.persistState(instance.instanceId, nextState);

    const adapter = this.adapters.get(node.type);
    if (!adapter) {
      run.status = "EXCEPTION";
      run.error = `Adapter not registered: ${node.type}`;
      run.completedAt = nowIso();
      instance.status = "EXCEPTION";
      instance.error = run.error;
      instance.completedAt = run.completedAt;
      this.persistState(instance.instanceId, nextState);
      return nextState;
    }

    let result: WorkflowNodeAdapterResult;
    try {
      const context: WorkflowNodeExecutionContext = {
        definition,
        instance,
        node,
        input: clone(instance.variables),
        variables: clone(instance.variables),
        resumePayload,
      };
      if (resumePayload && adapter.resume) {
        result = await adapter.resume(context);
      } else {
        result = await adapter.execute(context);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.status = "EXCEPTION";
      run.error = message;
      run.completedAt = nowIso();
      instance.status = "EXCEPTION";
      instance.error = message;
      instance.completedAt = run.completedAt;
      this.persistState(instance.instanceId, nextState);
      return nextState;
    }

    this.applyAdapterResult(nextState, node, run, result);
    this.persistState(instance.instanceId, nextState);
    return nextState;
  }

  private applyAdapterResult(
    state: StoredWebAigcRuntimeState,
    node: WebAigcNodeSchema,
    run: WebAigcNodeRunRecord,
    result: WorkflowNodeAdapterResult,
  ): void {
    const { definition, instance } = state;
    if (result.output) {
      run.output = clone(result.output);
      instance.variables = {
        ...instance.variables,
        ...result.output,
      };
    }

    if (result.kind === "wait") {
      run.status = "WAITING_INPUT";
      run.waitingFor = result.waitingFor;
      instance.status = "WAITING_INPUT";
      instance.checkpoint = {
        nodeId: node.id,
        waitingFor: result.waitingFor,
        createdAt: nowIso(),
        resumeCount: instance.checkpoint?.resumeCount || 0,
        inputSchema: result.inputSchema,
        payload: result.checkpointData,
      };
      return;
    }

    if (result.kind === "error") {
      run.status = "EXCEPTION";
      run.error = result.message;
      run.completedAt = nowIso();
      instance.status = "EXCEPTION";
      instance.error = result.message;
      instance.completedAt = run.completedAt;
      return;
    }

    run.status = "EXECUTED";
    run.completedAt = nowIso();
    run.waitingFor = undefined;
    instance.checkpoint = undefined;

    if (result.kind === "complete") {
      instance.status = "EXECUTED";
      instance.output = result.output ? clone(result.output) : instance.output;
      instance.currentNodeId = node.id;
      instance.completedAt = nowIso();
      return;
    }

    const transition = resolveNextNodeId(definition, node.id, result);
    if (!transition.nextNodeId) {
      instance.status = "EXECUTED";
      instance.currentNodeId = node.id;
      instance.completedAt = nowIso();
      return;
    }

    run.transitionEdgeId = transition.edgeId;
    markEdgeExecuted(instance, transition.edgeId);
    instance.currentNodeId = transition.nextNodeId;
    instance.status = "EXECUTING";
  }
}

export const webAigcRuntimeEngine = new WorkflowRuntimeEngine(serverRuntime);
webAigcRuntimeEngine.registerAdapter(new EchoWorkflowNodeAdapter());
for (const type of ["root", "agent_task", "plan", "review", "audit", "summary"]) {
  webAigcRuntimeEngine.registerAdapter(new ProjectionPassThroughAdapter(type));
}
