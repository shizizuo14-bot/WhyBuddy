import { describe, expect, it } from "vitest";

import type { MissionRecord } from "../../shared/mission/contracts.js";
import type { WorkflowOrganizationSnapshot } from "../../shared/organization-schema.js";
import type { MessageRecord, TaskRecord, WorkflowRecord } from "../../shared/workflow-runtime.js";
import { buildWorkflowGraphInstanceSnapshot } from "../core/workflow-graph-projection.js";

const ORGANIZATION: WorkflowOrganizationSnapshot = {
  kind: "workflow_organization",
  version: 1,
  workflowId: "wf-graph",
  directive: "Build a graph projection",
  generatedAt: "2026-04-22T00:00:00.000Z",
  source: "generated",
  taskProfile: "analysis",
  reasoning: "Need manager and worker nodes.",
  rootNodeId: "node-root",
  rootAgentId: "agent-root",
  departments: [
    {
      id: "dept-ai",
      label: "AI",
      managerNodeId: "node-manager",
      direction: "Answer user request",
      strategy: "parallel",
      maxConcurrency: 2,
    },
  ],
  nodes: [
    {
      id: "node-root",
      agentId: "agent-root",
      parentId: null,
      departmentId: "dept-ai",
      departmentLabel: "AI",
      name: "Root",
      title: "Root Orchestrator",
      role: "ceo",
      responsibility: "Orchestrate graph",
      responsibilities: ["Orchestrate graph"],
      goals: ["Complete mission"],
      summaryFocus: ["status"],
      skills: [],
      mcp: [],
      model: { model: "gpt-5.4", temperature: 0.2, maxTokens: 4000 },
      execution: { mode: "orchestrate", strategy: "parallel", maxConcurrency: 2 },
    },
    {
      id: "node-manager",
      agentId: "agent-manager",
      parentId: "node-root",
      departmentId: "dept-ai",
      departmentLabel: "AI",
      name: "Manager",
      title: "Knowledge Manager",
      role: "manager",
      responsibility: "Coordinate work",
      responsibilities: ["Coordinate work"],
      goals: ["Route tasks"],
      summaryFocus: ["quality"],
      skills: [],
      mcp: [],
      model: { model: "gpt-5.4", temperature: 0.2, maxTokens: 4000 },
      execution: { mode: "review", strategy: "parallel", maxConcurrency: 2 },
    },
    {
      id: "node-worker",
      agentId: "agent-worker",
      parentId: "node-manager",
      departmentId: "dept-ai",
      departmentLabel: "AI",
      name: "Worker",
      title: "Knowledge Worker",
      role: "worker",
      responsibility: "Answer question",
      responsibilities: ["Answer question"],
      goals: ["Deliver answer"],
      summaryFocus: ["answer"],
      skills: [],
      mcp: [],
      model: { model: "gpt-5.4", temperature: 0.2, maxTokens: 4000 },
      execution: { mode: "execute", strategy: "parallel", maxConcurrency: 2 },
    },
  ],
};

function makeWorkflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: "wf-graph",
    directive: "Build a graph projection",
    status: "running",
    current_stage: "execution",
    departments_involved: ["dept-ai"],
    started_at: "2026-04-22T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-04-22T00:00:00.000Z",
    results: {
      organization: ORGANIZATION,
    },
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 1,
    workflow_id: "wf-graph",
    worker_id: "agent-worker",
    manager_id: "agent-manager",
    department: "AI",
    description: "Answer the user question",
    deliverable: "A concise answer with citations.",
    deliverable_v2: null,
    deliverable_v3: null,
    score_accuracy: null,
    score_completeness: null,
    score_actionability: null,
    score_format: null,
    total_score: null,
    manager_feedback: null,
    meta_audit_feedback: null,
    verify_result: null,
    version: 1,
    status: "running",
    created_at: "2026-04-22T00:00:00.000Z",
    updated_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 1,
    workflow_id: "wf-graph",
    from_agent: "agent-worker",
    to_agent: "agent-manager",
    stage: "execution",
    content: "Current answer draft",
    metadata: {},
    created_at: "2026-04-22T00:00:01.000Z",
    ...overrides,
  };
}

function makeMission(overrides: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: "mission-graph",
    kind: "chat",
    title: "Graph mission",
    sourceText: "Build a graph projection",
    topicId: "session-1",
    status: "waiting",
    progress: 55,
    currentStageKey: "execute",
    stages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
    waitingFor: "user confirmation",
    ...overrides,
  };
}

describe("buildWorkflowGraphInstanceSnapshot", () => {
  it("projects workflow organization into graph node runs and edges", () => {
    const instance = buildWorkflowGraphInstanceSnapshot({
      workflow: makeWorkflow(),
      tasks: [makeTask()],
      messages: [makeMessage()],
      mission: makeMission(),
    });

    expect(instance.kind).toBe("graph_instance_snapshot");
    expect(instance.instanceId).toBe("wf-graph");
    expect(instance.missionId).toBe("mission-graph");
    expect(instance.sessionId).toBe("session-1");
    expect(instance.status).toBe("WAITING_INPUT");
    expect(instance.nodeRuns).toHaveLength(3);
    expect(instance.edgeTransitions).toHaveLength(2);
    expect(instance.telemetry).toMatchObject({
      messageCount: 1,
      taskCount: 1,
      errorCount: 0,
      waitingFor: "user confirmation",
    });
  });

  it("maps worker task status onto the matching node run", () => {
    const instance = buildWorkflowGraphInstanceSnapshot({
      workflow: makeWorkflow(),
      tasks: [makeTask({ status: "completed", deliverable_v3: "Final answer." })],
      messages: [],
      mission: makeMission({ status: "running", waitingFor: undefined }),
    });

    const workerNode = instance.nodeRuns.find(node => node.agentId === "agent-worker");
    expect(workerNode).toBeDefined();
    expect(workerNode?.status).toBe("EXECUTED");
    expect(workerNode?.taskStatus).toBe("completed");
    expect(workerNode?.outputPreview).toBe("Final answer.");
  });

  it("falls back to synthetic node runs when organization is missing", () => {
    const instance = buildWorkflowGraphInstanceSnapshot({
      workflow: makeWorkflow({ results: {} }),
      tasks: [makeTask({ id: 7, worker_id: "agent-fallback", description: "Fallback task" })],
      messages: [],
      mission: undefined,
    });

    expect(instance.nodeRuns).toHaveLength(1);
    expect(instance.nodeRuns[0]).toMatchObject({
      nodeId: "task-7",
      agentId: "agent-fallback",
      title: "Fallback task",
    });
    expect(instance.edgeTransitions).toHaveLength(0);
  });

  it("projects a minimal web-aigc controlflow slice with assignment and condition branching", () => {
    const instance = buildWorkflowGraphInstanceSnapshot({
      workflow: makeWorkflow({
        id: "wf-controlflow",
        directive: "Decide whether the output is approved",
        status: "running",
        current_stage: "condition-1",
        results: {
          webAigcControlFlow: {
            version: 1,
            metadata: {
              name: "approval-flow",
              code: "approval-flow-v1",
            },
            input: {
              directive: "Decide whether the output is approved",
              attachments: [{ id: "att-1" }],
              variables: {
                global: {
                  approved: true,
                },
              },
            },
            nodes: [
              { id: "start-1", type: "start", label: "Start" },
              {
                id: "assign-1",
                type: "variable_assignment",
                label: "Assign review result",
                config: {
                  scope: "global",
                  target: "reviewResult",
                  source: "$.approved",
                },
              },
              {
                id: "condition-1",
                type: "condition",
                label: "Approved?",
                config: {
                  expression: "reviewResult == true",
                },
              },
              {
                id: "end-approved",
                type: "end",
                label: "Approved End",
                config: {
                  output: "$.reviewResult",
                },
              },
              {
                id: "end-rejected",
                type: "end",
                label: "Rejected End",
                config: {
                  output: "$.reviewResult",
                },
              },
            ],
            edges: [
              { source: "start-1", target: "assign-1" },
              { source: "assign-1", target: "condition-1" },
              { source: "condition-1", target: "end-approved", branch: "true" },
              { source: "condition-1", target: "end-rejected", branch: "false" },
            ],
            execution: {
              currentNodeId: "condition-1",
              visitedNodeIds: ["start-1", "assign-1", "condition-1"],
              branchHits: {
                "condition-1": "true",
              },
              variableChanges: [
                {
                  nodeId: "assign-1",
                  scope: "global",
                  target: "reviewResult",
                  previousValue: undefined,
                  nextValue: true,
                },
              ],
              output: {
                reviewResult: true,
              },
            },
          },
        },
      }),
      tasks: [],
      messages: [],
      mission: undefined,
    });

    expect(instance.instanceId).toBe("wf-controlflow");
    expect(instance.status).toBe("EXECUTING");
    expect(instance.currentStage).toBe("condition-1");
    expect(instance.nodeRuns).toHaveLength(5);
    expect(instance.edgeTransitions).toHaveLength(4);
    expect(instance.telemetry).toMatchObject({
      messageCount: 0,
      taskCount: 5,
      errorCount: 0,
      waitingFor: "Approved?",
    });

    expect(instance.nodeRuns[0]).toMatchObject({
      nodeId: "start-1",
      title: "Start",
      role: "start",
      departmentLabel: "web-aigc",
      status: "EXECUTED",
      stageKey: "start",
    });

    expect(instance.nodeRuns[1]).toMatchObject({
      nodeId: "assign-1",
      title: "Assign review result",
      role: "variable_assignment",
      status: "EXECUTED",
      outputPreview: "global.reviewResult = true",
    });

    expect(instance.nodeRuns[2]).toMatchObject({
      nodeId: "condition-1",
      title: "Approved?",
      role: "condition",
      status: "EXECUTING",
      outputPreview: "branch: true (reviewResult == true)",
    });

    expect(instance.nodeRuns[3]).toMatchObject({
      nodeId: "end-approved",
      title: "Approved End",
      role: "end",
      status: "PENDING",
      outputPreview: undefined,
    });

    expect(instance.nodeRuns[4]).toMatchObject({
      nodeId: "end-rejected",
      title: "Rejected End",
      role: "end",
      status: "PENDING",
      outputPreview: undefined,
    });

    expect(instance.edgeTransitions).toEqual([
      {
        edgeId: "start-1->assign-1",
        fromNodeId: "start-1",
        toNodeId: "assign-1",
        kind: "control_flow",
        status: "executed",
      },
      {
        edgeId: "assign-1->condition-1",
        fromNodeId: "assign-1",
        toNodeId: "condition-1",
        kind: "control_flow",
        status: "executed",
      },
      {
        edgeId: "condition-1->end-approved",
        fromNodeId: "condition-1",
        toNodeId: "end-approved",
        kind: "control_flow",
        status: "known",
      },
      {
        edgeId: "condition-1->end-rejected",
        fromNodeId: "condition-1",
        toNodeId: "end-rejected",
        kind: "control_flow",
        status: "blocked",
      },
    ]);
  });

  it("derives assignment values and condition branches when execution details are partial", () => {
    const instance = buildWorkflowGraphInstanceSnapshot({
      workflow: makeWorkflow({
        id: "wf-controlflow-derived",
        directive: "Compute an approval branch",
        status: "running",
        current_stage: "condition-1",
        results: {
          controlFlow: {
            version: 1,
            input: {
              directive: "Compute an approval branch",
              variables: {
                global: {
                  score: 91,
                },
              },
            },
            nodes: [
              { id: "start-1", type: "start", label: "Start" },
              {
                id: "assign-1",
                type: "variable_assignment",
                label: "Assign pass flag",
                config: {
                  scope: "global",
                  target: "passed",
                  expression: "score >= 90",
                },
              },
              {
                id: "condition-1",
                type: "condition",
                label: "Passed?",
                config: {
                  expression: "passed == true",
                },
              },
              {
                id: "end-1",
                type: "end",
                label: "Done",
                config: {
                  output: "$.passed",
                },
              },
            ],
            edges: [
              { source: "start-1", target: "assign-1" },
              { source: "assign-1", target: "condition-1" },
              { source: "condition-1", target: "end-1", branch: "true" },
            ],
            execution: {
              currentNodeId: "condition-1",
              visitedNodeIds: ["start-1", "assign-1", "condition-1"],
            },
          },
        },
      }),
      tasks: [],
      messages: [],
      mission: undefined,
    });

    const assignmentNode = instance.nodeRuns.find(node => node.nodeId === "assign-1");
    const conditionNode = instance.nodeRuns.find(node => node.nodeId === "condition-1");
    const transition = instance.edgeTransitions.find(
      edge => edge.fromNodeId === "condition-1" && edge.toNodeId === "end-1"
    );

    expect(assignmentNode?.outputPreview).toBe("global.passed = true");
    expect(conditionNode?.outputPreview).toBe("branch: true (passed == true)");
    expect(transition).toMatchObject({
      kind: "control_flow",
      status: "known",
    });
  });
});
