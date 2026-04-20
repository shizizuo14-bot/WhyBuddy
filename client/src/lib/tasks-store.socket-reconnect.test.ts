import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionRecord } from "@shared/mission/contracts";
import type { ListMissionEventsResponse, ListMissionsResponse } from "@shared/mission/api";

const mockListMissions = vi.fn<() => Promise<ListMissionsResponse>>();
const mockListMissionEvents = vi.fn<() => Promise<ListMissionEventsResponse>>();
const mockListPlanets = vi.fn();
const mockIo = vi.fn();
const mockInitSandboxSocket = vi.fn();
const appStoreState = { runtimeMode: "advanced" as const };
const originalWindow = globalThis.window;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

type SocketHandler = (...args: any[]) => void;

const socketHandlers = new Map<string, SocketHandler>();
const mockSocket = {
  on: vi.fn((event: string, handler: SocketHandler) => {
    socketHandlers.set(event, handler);
    return mockSocket;
  }),
  off: vi.fn((event?: string) => {
    if (event) {
      socketHandlers.delete(event);
    }
    return mockSocket;
  }),
  disconnect: vi.fn(),
};

vi.mock("./mission-client", () => ({
  cancelMission: vi.fn(),
  createMission: vi.fn(),
  getMission: vi.fn(),
  getPlanet: vi.fn(),
  getPlanetInterior: vi.fn(),
  listMissionEvents: (...args: unknown[]) => mockListMissionEvents(...args),
  listMissions: (...args: unknown[]) => mockListMissions(...args),
  listPlanets: (...args: unknown[]) => mockListPlanets(...args),
  submitMissionDecision: vi.fn(),
  submitMissionOperatorAction: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

vi.mock("./sandbox-store", () => ({
  useSandboxStore: {
    getState: () => ({
      initSocket: mockInitSandboxSocket,
    }),
  },
}));

vi.mock("./store", () => ({
  useAppStore: Object.assign(
    () => ({}),
    {
      getState: () => appStoreState,
      subscribe: vi.fn(),
    }
  ),
}));

function makeMission(id: string, overrides?: Partial<MissionRecord>): MissionRecord {
  const now = Date.now();
  return {
    id,
    kind: "chat",
    title: `Mission ${id}`,
    sourceText: `Source ${id}`,
    status: "running",
    progress: 42,
    currentStageKey: "execute",
    stages: [{ key: "execute", label: "Execute", status: "running" }],
    createdAt: now - 10_000,
    updatedAt: now,
    events: [],
    artifacts: [],
    operatorState: "active",
    operatorActions: [],
    attempt: 1,
    ...overrides,
  };
}

describe("tasks-store socket reconnect recovery", () => {
  let useTasksStore: typeof import("./tasks-store").useTasksStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    socketHandlers.clear();
    mockIo.mockReturnValue(mockSocket);
    appStoreState.runtimeMode = "advanced";
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as typeof globalThis & { window?: typeof globalThis & { location: { origin: string } } }).window = {
      ...(globalThis as typeof globalThis & { window?: typeof globalThis }).window,
      location: { origin: "http://localhost:3000" },
      setTimeout: ((...args: Parameters<typeof globalThis.setTimeout>) =>
        globalThis.setTimeout(...args)) as typeof globalThis.setTimeout,
      clearTimeout: ((...args: Parameters<typeof globalThis.clearTimeout>) =>
        globalThis.clearTimeout(...args)) as typeof globalThis.clearTimeout,
    } as typeof globalThis & { location: { origin: string } };

    mockListMissions.mockResolvedValue({
      ok: true,
      tasks: [makeMission("mission-1")],
    });
    mockListMissionEvents.mockResolvedValue({
      ok: true,
      missionId: "mission-1",
      events: [],
    });
    mockListPlanets.mockRejectedValue(new Error("planets unavailable in reconnect test"));

    const mod = await import("./tasks-store");
    useTasksStore = mod.useTasksStore;
    useTasksStore.setState({
      ready: false,
      loading: false,
      error: null,
      missionSocketConnected: false,
      selectedTaskId: "mission-1",
      tasks: [],
      detailsById: {},
      decisionNotes: {},
      cancellingMissionIds: {},
      operatorActionLoadingByMissionId: {},
      lastDecisionLaunch: null,
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();

    if (originalWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: typeof globalThis }).window;
      return;
    }

    (globalThis as typeof globalThis & { window?: typeof globalThis }).window = originalWindow;
  });

  it("queues a task refresh when the mission socket reconnects", async () => {
    vi.useFakeTimers();
    try {
      await useTasksStore.getState().refresh({ preferredTaskId: "mission-1" });
      expect(mockIo).toHaveBeenCalledTimes(1);

      mockListMissions.mockClear();
      mockListMissionEvents.mockClear();

      const connectHandler = socketHandlers.get("connect");
      expect(connectHandler).toBeTypeOf("function");

      connectHandler?.();
      expect(useTasksStore.getState().missionSocketConnected).toBe(true);

      await vi.advanceTimersByTimeAsync(150);

      expect(mockListMissions).toHaveBeenCalledWith(200);
      expect(mockListMissionEvents).toHaveBeenCalledWith("mission-1", 60);
    } finally {
      vi.useRealTimers();
    }
  });
});
