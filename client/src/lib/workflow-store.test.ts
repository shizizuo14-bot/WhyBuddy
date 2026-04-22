import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetWorkflowsSnapshot = vi.fn();
const mockPersistWorkflows = vi.fn();

vi.mock("./browser-runtime-storage", () => ({
  getAgentsSnapshot: vi.fn(async () => []),
  getHeartbeatReportsSnapshot: vi.fn(async () => []),
  getHeartbeatStatusesSnapshot: vi.fn(async () => []),
  getMemorySearchSnapshot: vi.fn(async () => null),
  getRecentMemorySnapshot: vi.fn(async () => null),
  getWorkflowDetailSnapshot: vi.fn(async () => null),
  getWorkflowsSnapshot: (...args: any[]) => mockGetWorkflowsSnapshot(...args),
  persistAgents: vi.fn(async () => {}),
  persistHeartbeatReports: vi.fn(async () => {}),
  persistHeartbeatStatuses: vi.fn(async () => {}),
  persistMemorySearch: vi.fn(async () => {}),
  persistRecentMemory: vi.fn(async () => {}),
  persistWorkflowDetail: vi.fn(async () => {}),
  persistWorkflows: (...args: any[]) => mockPersistWorkflows(...args),
}));

vi.mock("./runtime/local-event-bus", () => ({
  runtimeEventBus: {
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock("./runtime/local-runtime-client", () => ({
  localRuntime: {
    ensureStarted: vi.fn(async () => {}),
    getSnapshot: vi.fn(async () => ({
      agents: [],
      agentStatuses: {},
      workflows: [],
      heartbeatStatuses: [],
      heartbeatReports: [],
      stages: [],
    })),
    getAgents: vi.fn(async () => ({ agents: [] })),
    getStages: vi.fn(async () => ({ stages: [] })),
    listWorkflows: vi.fn(async () => ({ workflows: [] })),
    getWorkflowDetail: vi.fn(async () => ({
      workflow: null,
      tasks: [],
      messages: [],
      report: null,
    })),
    getAgentRecentMemory: vi.fn(async () => ({ entries: [] })),
    searchAgentMemory: vi.fn(async () => ({ memories: [] })),
    getHeartbeatStatuses: vi.fn(async () => ({ statuses: [] })),
    getHeartbeatReports: vi.fn(async () => ({ reports: [] })),
    runHeartbeat: vi.fn(async () => {}),
    submitDirective: vi.fn(async () => ({ workflowId: "wf-local" })),
    downloadWorkflowReport: vi.fn(async () => ({
      filename: "workflow.md",
      mimeType: "text/markdown",
      content: "# ok",
    })),
    downloadHeartbeatReport: vi.fn(async () => ({
      filename: "heartbeat.md",
      mimeType: "text/markdown",
      content: "# ok",
    })),
  },
}));

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  })),
}));

describe("workflow-store advanced fallback handling", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetWorkflowsSnapshot.mockResolvedValue([]);

    const { useAppStore } = await import("./store");
    useAppStore.setState({ runtimeMode: "advanced" });

    const { useWorkflowStore } = await import("./workflow-store");
    useWorkflowStore.setState({
      socket: null,
      connected: false,
      agents: [],
      agentsError: null,
      agentStatuses: {},
      currentWorkflowId: null,
      workflows: [],
      workflowsError: null,
      currentWorkflow: null,
      currentWorkflowGraphInstance: null,
      currentWorkflowMonitoringInstance: null,
      currentWorkflowMonitoringSession: null,
      monitoringInstances: [],
      workflowDetailError: null,
      tasks: [],
      messages: [],
      agentMemoryRecent: [],
      agentMemorySearchResults: [],
      memoryError: null,
      heartbeatStatuses: [],
      heartbeatReports: [],
      heartbeatError: null,
      stages: [],
      isWorkflowPanelOpen: false,
      activeView: "directive",
      isSubmitting: false,
      submitError: null,
      lastSubmittedInputSignature: null,
      lastSubmittedAt: null,
      isMemoryLoading: false,
      isHeartbeatLoading: false,
      runningHeartbeatAgentId: null,
      selectedMemoryAgentId: null,
      memoryQuery: "",
      eventLog: [],
    });
  });

  it("falls back to cached workflows when the advanced API returns HTML", async () => {
    const cachedWorkflow = {
      id: "wf-cached",
      directive: "Use cached workflow",
      status: "running",
      current_stage: "execution",
      created_at: "2026-04-11T00:00:00.000Z",
    };
    mockGetWorkflowsSnapshot.mockResolvedValue([cachedWorkflow]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><html><body>fallback</body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      })
    );

    const { useWorkflowStore } = await import("./workflow-store");
    await useWorkflowStore.getState().fetchWorkflows();

    const state = useWorkflowStore.getState();
    expect(state.workflows).toEqual([cachedWorkflow]);
    expect(state.workflowsError?.source).toBe("html-fallback");
    expect(state.workflowsError?.message).not.toContain("Unexpected token");
  });

  it("stores a structured submit error instead of surfacing a parser failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><html><body>fallback</body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      })
    );

    const { useWorkflowStore } = await import("./workflow-store");
    await expect(
      useWorkflowStore.getState().submitDirective({
        directive: "Start the mission",
      })
    ).resolves.toBeNull();

    const state = useWorkflowStore.getState();
    expect(state.submitError?.source).toBe("html-fallback");
    expect(state.submitError?.message).not.toContain("Unexpected token");
  });

  it("returns workflowId and missionId from the advanced workflow launch response", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflowId: "wf-advanced",
            missionId: "mission-123",
            status: "running",
            deduped: false,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow: {
              id: "wf-advanced",
              missionId: "mission-123",
              directive: "Launch the workflow with mission link",
              status: "running",
              current_stage: "direction",
              departments_involved: [],
              started_at: null,
              completed_at: null,
              results: {},
              created_at: "2026-04-15T00:00:00.000Z",
            },
            tasks: [],
            messages: [],
            report: null,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflows: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      );

    const { useWorkflowStore } = await import("./workflow-store");
    const result = await useWorkflowStore.getState().submitDirective({
      directive: "Launch the workflow with mission link",
    });

    expect(result).toEqual({
      workflowId: "wf-advanced",
      missionId: "mission-123",
      deduped: false,
    });
  });

  it("fetches graph-instance and monitoring payloads together with advanced workflow detail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow: {
              id: "wf-graph",
              missionId: "mission-graph",
              directive: "Graph instance detail",
              status: "running",
              current_stage: "execution",
              departments_involved: [],
              started_at: null,
              completed_at: null,
              results: {},
              created_at: "2026-04-15T00:00:00.000Z",
            },
            tasks: [],
            messages: [],
            report: null,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instance: {
              kind: "graph_instance_snapshot",
              version: 1,
              instanceId: "graph-wf-graph",
              workflowId: "wf-graph",
              missionId: "mission-graph",
              sessionId: "session-graph",
              directive: "Graph instance detail",
              status: "EXECUTING",
              workflowStatus: "running",
              missionStatus: "running",
              currentStage: "execution",
              createdAt: "2026-04-15T00:00:00.000Z",
              startedAt: "2026-04-15T00:00:01.000Z",
              completedAt: null,
              links: {
                workflowId: "wf-graph",
                missionId: "mission-graph",
                sessionId: "session-graph",
              },
              nodeRuns: [
                {
                  nodeId: "node-1",
                  title: "CEO",
                  status: "EXECUTING",
                },
              ],
              edgeTransitions: [],
              telemetry: {
                messageCount: 2,
                taskCount: 1,
                errorCount: 0,
                waitingFor: "marketing feedback",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 101,
              instanceUuid: "wf-graph",
              orchestrationCode: "growth-agent-pipeline",
              orchestrationName: "Growth Agent Pipeline",
              orchestrationVersion: 3,
              category: "growth",
              sourceApp: "web-aigc",
              status: "EXECUTING",
              executor: "office-runtime",
              startTime: "2026-04-15T00:00:01.000Z",
              endTime: null,
              lastUpdateTime: "2026-04-15T00:03:00.000Z",
              inputVariables: {},
              outputVariables: {},
              nodes: [
                {
                  id: 1,
                  nodeId: "node-1",
                  nodeLabel: "CEO node",
                  nodeType: "planner",
                  status: "EXECUTING",
                  startTime: "2026-04-15T00:00:01.000Z",
                  endTime: null,
                  inputData: null,
                  outputData: null,
                  errorMessage: null,
                  position: { x: 0, y: 0 },
                },
              ],
              edges: [],
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              content: [
                {
                  id: 101,
                  instanceUuid: "wf-graph",
                  orchestrationCode: "growth-agent-pipeline",
                  orchestrationName: "Growth Agent Pipeline",
                  orchestrationVersion: 3,
                  category: "growth",
                  sourceApp: "web-aigc",
                  status: "EXECUTING",
                  executor: "office-runtime",
                  lastExecutionTime: "2026-04-15T00:03:00.000Z",
                  startTime: "2026-04-15T00:00:01.000Z",
                  endTime: null,
                },
              ],
              totalElements: 1,
              totalPages: 1,
              page: 0,
              size: 1,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              sessionId: "session-graph",
              user: "operator",
              startTime: "2026-04-15T00:00:01.000Z",
              sourceApp: "web-aigc",
              messages: [
                {
                  id: "msg-1",
                  role: "assistant",
                  content: "Graph execution is in progress.",
                  timestamp: "2026-04-15T00:02:00.000Z",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          }
        )
      );

    const { useWorkflowStore } = await import("./workflow-store");
    await useWorkflowStore.getState().fetchWorkflowDetail("wf-graph");

    const state = useWorkflowStore.getState();
    expect(state.currentWorkflow?.id).toBe("wf-graph");
    expect(state.currentWorkflowGraphInstance?.workflowId).toBe("wf-graph");
    expect(state.currentWorkflowGraphInstance?.telemetry.waitingFor).toBe(
      "marketing feedback"
    );
    expect(state.currentWorkflowMonitoringInstance?.instanceUuid).toBe(
      "wf-graph"
    );
    expect(state.monitoringInstances).toHaveLength(1);
    expect(state.currentWorkflowMonitoringSession?.sessionId).toBe(
      "session-graph"
    );
  });
});
