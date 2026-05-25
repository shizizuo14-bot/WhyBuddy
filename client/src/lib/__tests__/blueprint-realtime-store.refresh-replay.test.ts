import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __setHydrateHistoricalEventsForTest,
  __setSocket,
  useBlueprintRealtimeStore,
} from "../blueprint-realtime-store.js";

describe("BlueprintRealtimeStore refresh replay", () => {
  beforeEach(() => {
    __setSocket(null as any);
    useBlueprintRealtimeStore.setState(useBlueprintRealtimeStore.getInitialState());
  });

  afterEach(() => {
    __setHydrateHistoricalEventsForTest(null);
    useBlueprintRealtimeStore.getState().reset();
    __setSocket(null as any);
  });

  it("replays historical events into realtime slices used by the right rail", async () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connected: true,
    };
    __setSocket(mockSocket as any);

    const historicalEvents = [
      {
        id: "evt-container-ready",
        jobId: "job-restored",
        type: "role.container.ready",
        family: "role",
        occurredAt: "2026-05-24T10:00:00.000Z",
        stage: "spec_tree",
        status: "running",
        payload: {
          key: {
            jobId: "job-restored",
            stageId: "spec_tree",
            roleId: "planner",
          },
          containerMode: "lite",
          executionMode: "simulated_fallback",
          fallbackReason: "executor unavailable",
          bindingSummary: {
            mcpCount: 1,
            skillCount: 2,
            aigcNodeCount: 3,
            skippedMcps: 0,
            skippedSkills: 1,
          },
        },
      },
      {
        id: "evt-stage",
        jobId: "job-restored",
        type: "job.stage",
        family: "job",
        occurredAt: "2026-05-24T10:00:01.000Z",
        stage: "spec_tree",
        status: "running",
        payload: {
          roleId: "planner",
          message: "Deriving SPEC tree",
        },
      },
      {
        id: "evt-thinking",
        jobId: "job-restored",
        type: "role.agent.thinking",
        family: "role",
        occurredAt: "2026-05-24T10:00:02.000Z",
        stage: "spec_tree",
        status: "running",
        payload: {
          iteration: 1,
          roleId: "planner",
          stageId: "spec_tree",
          thought: "Analyze blueprint context",
        },
      },
    ];
    __setHydrateHistoricalEventsForTest(async () => historicalEvents as any);

    useBlueprintRealtimeStore.getState().subscribe("job-restored");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const state = useBlueprintRealtimeStore.getState();
    expect(state.rolePhases.planner).toBe("activated");
    expect(state.capabilityStatuses["role-container-loader:planner"]).toBe(
      "completed"
    );
    expect(state.roleRuntimeStates.planner).toMatchObject({
      roleId: "planner",
      jobId: "job-restored",
      stageId: "spec_tree",
      status: "ready",
      runtimeKind: "fallback",
    });
    expect(state.agentProgress).toEqual([
      expect.objectContaining({
        roleId: "planner",
        message: "Deriving SPEC tree",
        timestamp: Date.parse("2026-05-24T10:00:01.000Z"),
      }),
    ]);
    expect(state.logEntries.map((entry) => entry.message)).toEqual([
      "role.container.ready",
      "job.stage",
      "role.agent.thinking",
    ]);
    expect(state.agentReasoning.entries).toEqual([
      expect.objectContaining({
        phase: "thinking",
        stageId: "spec_tree",
        thought: "Analyze blueprint context",
      }),
    ]);
  });
});
