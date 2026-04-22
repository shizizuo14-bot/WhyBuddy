import { describe, expect, it } from "vitest";

import type { WorkflowRuntime } from "../../shared/workflow-runtime.js";
import type { WorkflowNodeAdapter } from "../../shared/workflow-runtime-engine.js";
import { WorkflowRuntimeEngine } from "../core/workflow-runtime-engine.js";
import type {
  AgentRecord,
  MessageRecord,
  TaskRecord,
  WorkflowRecord,
} from "../../shared/workflow-runtime.js";

function makeWorkflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: "wf-runtime-engine",
    directive: "Run a thin web-aigc runtime slice",
    status: "pending",
    current_stage: null,
    departments_involved: [],
    started_at: null,
    completed_at: null,
    results: {},
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function createRuntime(workflow: WorkflowRecord): WorkflowRuntime {
  const workflows = new Map<string, WorkflowRecord>([[workflow.id, workflow]]);
  const tasksByWorkflow = new Map<string, TaskRecord[]>();
  const messagesByWorkflow = new Map<string, MessageRecord[]>();
  const agents: AgentRecord[] = [];

  return {
    workflowRepo: {
      createWorkflow(id, directive, departments) {
        const created = makeWorkflow({
          id,
          directive,
          departments_involved: departments,
        });
        workflows.set(id, created);
        return created;
      },
      getWorkflow(id) {
        return workflows.get(id);
      },
      getWorkflows() {
        return Array.from(workflows.values());
      },
      findWorkflowByDirective() {
        return undefined;
      },
      updateWorkflow(id, updates) {
        const current = workflows.get(id);
        if (!current) return;
        workflows.set(id, { ...current, ...updates });
      },
      getAgents() {
        return agents;
      },
      getAgent(id) {
        return agents.find(agent => agent.id === id);
      },
      getAgentsByRole(role) {
        return agents.filter(agent => agent.role === role);
      },
      getAgentsByDepartment(dept) {
        return agents.filter(agent => agent.department === dept);
      },
      getTasksByWorkflow(workflowId) {
        return tasksByWorkflow.get(workflowId) || [];
      },
      createTask(task) {
        const created: TaskRecord = {
          id: 1,
          created_at: "2026-04-22T00:00:00.000Z",
          updated_at: "2026-04-22T00:00:00.000Z",
          ...task,
        };
        tasksByWorkflow.set(task.workflow_id, [
          ...(tasksByWorkflow.get(task.workflow_id) || []),
          created,
        ]);
        return created;
      },
      updateTask(id, updates) {
        for (const [workflowId, tasks] of tasksByWorkflow.entries()) {
          tasksByWorkflow.set(
            workflowId,
            tasks.map(task => (task.id === id ? { ...task, ...updates } : task)),
          );
        }
      },
      getMessagesByWorkflow(workflowId) {
        return messagesByWorkflow.get(workflowId) || [];
      },
      createEvolutionLog() {
        return {};
      },
      getScoresForWorkflow() {
        return [];
      },
    },
    memoryRepo: {
      buildPromptContext() {
        return [];
      },
      appendLLMExchange() {},
      appendMessageLog() {},
      materializeWorkflowMemories() {},
      getSoulText() {
        return "";
      },
      appendLearnedBehaviors() {
        return "";
      },
    },
    reportRepo: {
      buildDepartmentReport() {
        return {
          stats: {
            averageScore: null,
          },
        };
      },
      saveDepartmentReport() {
        return { jsonPath: "department.json", markdownPath: "department.md" };
      },
      saveFinalWorkflowReport() {
        return { jsonPath: "workflow.json", markdownPath: "workflow.md" };
      },
    },
    eventEmitter: {
      emit() {},
    },
    llmProvider: {
      async call() {
        return { content: "" };
      },
      async callJson() {
        return {};
      },
    },
    agentDirectory: {
      get() {
        return undefined;
      },
      getCEO() {
        return undefined;
      },
      getManagerByDepartment() {
        return undefined;
      },
      getWorkersByManager() {
        return [];
      },
      refresh() {},
    },
    messageBus: {
      async send() {
        throw new Error("not needed");
      },
      async sendA2A() {
        throw new Error("not needed");
      },
      async getInbox() {
        return [];
      },
    },
    evolutionService: {
      evolveWorkflow() {
        return {};
      },
    },
  };
}

describe("WorkflowRuntimeEngine", () => {
  it("runs a minimal graph to completion through adapters", async () => {
    const workflow = makeWorkflow();
    const runtime = createRuntime(workflow);
    const engine = new WorkflowRuntimeEngine(runtime);

    const rootAdapter: WorkflowNodeAdapter = {
      type: "root",
      async execute() {
        return {
          kind: "advance",
          output: {
            directive: "hello",
          },
        };
      },
    };
    const echoAdapter: WorkflowNodeAdapter = {
      type: "echo",
      async execute(context) {
        return {
          kind: "complete",
          output: {
            finalText: String(context.variables.directive || ""),
          },
        };
      },
    };

    engine.registerAdapter(rootAdapter);
    engine.registerAdapter(echoAdapter);

    engine.initialize({
      workflowId: workflow.id,
      definition: {
        kind: "graph_definition",
        version: 1,
        definitionId: workflow.id,
        code: workflow.id,
        name: "thin-slice",
        source: "inline",
        entryNodeId: "start",
        graphVersion: {
          kind: "graph_version",
          version: 1,
          definitionId: workflow.id,
          graphVersion: "v1",
          createdAt: "2026-04-22T00:00:00.000Z",
        },
        links: {
          workflowId: workflow.id,
        },
        nodeSchemas: [
          {
            id: "start",
            type: "root",
            title: "Start",
            inputs: [],
            outputs: [],
            config: [],
          },
          {
            id: "echo",
            type: "echo",
            title: "Echo",
            inputs: [],
            outputs: [],
            config: [],
          },
        ],
        edgeSchemas: [
          {
            id: "start->echo",
            fromNodeId: "start",
            toNodeId: "echo",
            kind: "success",
          },
        ],
      },
    });

    const state = await engine.runToCheckpoint({ workflowId: workflow.id });

    expect(state.instance.status).toBe("EXECUTED");
    expect(state.instance.output).toMatchObject({
      finalText: "hello",
    });
    expect(state.instance.nodeRuns.map(node => node.status)).toEqual([
      "EXECUTED",
      "EXECUTED",
    ]);
  });

  it("stores a checkpoint and resumes waiting nodes", async () => {
    const workflow = makeWorkflow({ id: "wf-runtime-wait" });
    const runtime = createRuntime(workflow);
    const engine = new WorkflowRuntimeEngine(runtime);

    const waitAdapter: WorkflowNodeAdapter = {
      type: "waiter",
      async execute() {
        return {
          kind: "wait",
          waitingFor: "approval token",
          inputSchema: [
            {
              key: "token",
              label: "Approval token",
              valueType: "string",
              required: true,
            },
          ],
        };
      },
      async resume(context) {
        return {
          kind: "complete",
          output: {
            acceptedToken: context.resumePayload?.token,
          },
        };
      },
    };

    engine.registerAdapter(waitAdapter);

    engine.initialize({
      workflowId: workflow.id,
      definition: {
        kind: "graph_definition",
        version: 1,
        definitionId: workflow.id,
        code: workflow.id,
        name: "wait-slice",
        source: "inline",
        entryNodeId: "wait-node",
        graphVersion: {
          kind: "graph_version",
          version: 1,
          definitionId: workflow.id,
          graphVersion: "v1",
          createdAt: "2026-04-22T00:00:00.000Z",
        },
        links: {
          workflowId: workflow.id,
        },
        nodeSchemas: [
          {
            id: "wait-node",
            type: "waiter",
            title: "Wait Node",
            inputs: [],
            outputs: [],
            config: [],
          },
        ],
        edgeSchemas: [],
      },
    });

    const waitingState = await engine.runToCheckpoint({ workflowId: workflow.id });
    expect(waitingState.instance.status).toBe("WAITING_INPUT");
    expect(waitingState.instance.checkpoint?.waitingFor).toBe("approval token");

    const resumedState = await engine.resume(workflow.id, { token: "approved" });
    expect(resumedState.instance.status).toBe("EXECUTED");
    expect(resumedState.instance.output).toMatchObject({
      acceptedToken: "approved",
    });
    expect(resumedState.instance.checkpoint).toBeUndefined();
  });
});
