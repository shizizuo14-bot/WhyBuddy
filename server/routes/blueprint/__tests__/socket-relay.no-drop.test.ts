/**
 * BlueprintSocketRelay 不丢事件回归测试。
 *
 * 对应 `.kiro/specs/autopilot-streaming-experience` 任务 3 / 3.1。
 *
 * 验证点：
 *   1. 房间为空场景：`handleEvent` 中针对单条事件路径已经移除了
 *      “房间为空就 return”早返回，事件直接由 `io.to(room).emit(...)`
 *      路由，Socket.IO 在房间无订阅者时会自然忽略。
 *   2. 后到达 socket 场景：先 emit 一条事件（房间空 → 自然丢弃），
 *      socket 再 join 房间，再 emit 第二条 → 该 socket 仍能收到第二条；
 *      不要求第一条被缓存或重放。
 *   3. 家族路由保留：`capability.*` 事件仍走批量缓冲通道
 *      （`blueprint:batch`），其它家族（如 `role.agent.thinking`）走
 *      单条 `blueprint:event` 通道。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBlueprintSocketRelay } from "../socket-relay.js";
import { createBlueprintEventBus } from "../event-bus.js";
import { createMemoryBlueprintJobStore } from "../job-store.js";
import type { BlueprintGenerationEvent } from "../../../../shared/blueprint/contracts.js";
import type { BlueprintGenerationJob } from "../../../../shared/blueprint/index.js";

// ---------------------------------------------------------------------------
// Mock Socket.IO 工厂
// ---------------------------------------------------------------------------

/**
 * 为单个 socket 创建 mock。
 *
 * - `id`：socket id
 * - `join` / `leave`：直接同步操作 `rooms` Map
 * - `on`：把客户端事件 handler 缓存到 `handlers` 中
 * - `triggerEvent`：测试用，向 socket 注入一条客户端事件（如
 *   `blueprint:subscribe`），用于触发真实 socket join 流程。
 */
interface RecordedEmit {
  room: string;
  event: string;
  data: unknown;
}

function createMockSocket(id: string, rooms: Map<string, Set<string>>) {
  const handlers = new Map<string, (data: unknown) => void>();
  return {
    id,
    join(room: string) {
      let members = rooms.get(room);
      if (!members) {
        members = new Set<string>();
        rooms.set(room, members);
      }
      members.add(id);
    },
    leave(room: string) {
      rooms.get(room)?.delete(id);
    },
    on(event: string, handler: (data: unknown) => void) {
      handlers.set(event, handler);
    },
    triggerEvent(event: string, data: unknown) {
      handlers.get(event)?.(data);
    },
  };
}

/**
 * 创建一个最小可用的 mock Socket.IO Server。
 *
 * 关键约束：
 * - `to(room)` 返回一个对象，其 `emit(event, data)` 会把推送记录到
 *   `emittedEvents`，便于断言。同时把推送派发到 room 内所有 socket 的
 *   per-socket received 列表，让“后到达 socket 收到第二条”这种场景可
 *   以直接断言。
 * - `sockets.adapter.rooms` 是真实的 `Map<string, Set<string>>`，与
 *   线上 Socket.IO 行为对齐。
 * - `on('connection', ...)` 注册的 handler 通过 `simulateConnection`
 *   被显式触发，不引入真实网络层。
 */
function createMockSocketIOServer() {
  const rooms = new Map<string, Set<string>>();
  const emittedEvents: RecordedEmit[] = [];
  const connectionHandlers: Array<(socket: unknown) => void> = [];
  const socketReceived = new Map<string, RecordedEmit[]>();

  function recordEmit(room: string, event: string, data: unknown): void {
    emittedEvents.push({ room, event, data });
    const members = rooms.get(room);
    if (!members) return;
    for (const socketId of members) {
      let received = socketReceived.get(socketId);
      if (!received) {
        received = [];
        socketReceived.set(socketId, received);
      }
      received.push({ room, event, data });
    }
  }

  const io = {
    sockets: {
      adapter: {
        rooms,
      },
    },
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, data: unknown) => {
        recordEmit(room, event, data);
      }),
    })),
    on: vi.fn((event: string, handler: (socket: unknown) => void) => {
      if (event === "connection") {
        connectionHandlers.push(handler);
      }
    }),
    off: vi.fn((event: string, _handler: unknown) => {
      if (event === "connection") {
        connectionHandlers.length = 0;
      }
    }),
  };

  return {
    io,
    rooms,
    emittedEvents,
    socketReceived,
    simulateConnection(socket: unknown) {
      for (const handler of connectionHandlers) {
        handler(socket);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 工具：构造 jobStore + eventBus
// ---------------------------------------------------------------------------

/**
 * 构造一个带有指定 jobId 的最小 mission，避免 eventBus.persist 阶段
 * 拒绝事件（job 不存在时 persist 会跳过 fanOut 之外的逻辑，但不会
 * 抛错；仍然为了语义清晰显式注入一个 job）。
 */
function makeJob(jobId: string): BlueprintGenerationJob {
  const now = new Date("2026-05-01T00:00:00.000Z").toISOString();
  return {
    id: jobId,
    request: {
      // BlueprintGenerationRequest 的最小字段；测试只关心 id/events
      // 此处用 `as any` 规避完整 request shape，不影响 relay 行为
    } as never,
    status: "running",
    stage: "runtime_capability",
    version: "v1",
    createdAt: now,
    updatedAt: now,
    artifacts: [],
    events: [],
  };
}

/**
 * 构造一条标准事件。`type` 与 `family` 必须匹配，否则
 * `BlueprintEventName` 校验会拒绝。
 */
function makeEvent(
  overrides: Partial<BlueprintGenerationEvent> & {
    id: string;
    jobId: string;
    type: BlueprintGenerationEvent["type"];
    family: BlueprintGenerationEvent["family"];
  },
): BlueprintGenerationEvent {
  return {
    stage: "runtime_capability",
    status: "running",
    message: "test event",
    occurredAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe("BlueprintSocketRelay 单条事件不丢事件回归（autopilot-streaming-experience 需求 3）", () => {
  let sio: ReturnType<typeof createMockSocketIOServer>;

  beforeEach(() => {
    sio = createMockSocketIOServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("场景 1：房间为空时仍直接调用 io.to(room).emit('blueprint:event', ...)，不再因为空房间早返回", () => {
    const jobId = "job-empty-room";
    const jobStore = createMemoryBlueprintJobStore([makeJob(jobId)]);
    const eventBus = createBlueprintEventBus(jobStore);

    const relay = createBlueprintSocketRelay({
      eventBus,
      io: sio.io as never,
    });
    relay.start();

    // 关键前提：blueprint:job-empty-room 这个 room 当前完全没有订阅者
    expect(sio.rooms.get(`blueprint:${jobId}`)).toBeUndefined();

    // 通过 eventBus 发射一条 role.agent.thinking 事件
    eventBus.emit(
      makeEvent({
        id: "evt-thinking-1",
        jobId,
        type: "role.agent.thinking",
        family: "role",
        thought: "正在分析仓库目录结构",
      }),
    );

    // autopilot-streaming-experience 需求 3.1：
    // 即使房间无订阅者，relay 仍然调用 io.to(room).emit 一次。
    // Socket.IO 在房间为空时会自然 no-op，不会阻塞后续订阅。
    expect(sio.io.to).toHaveBeenCalledTimes(1);
    expect(sio.io.to).toHaveBeenCalledWith(`blueprint:${jobId}`);
    expect(sio.emittedEvents).toHaveLength(1);
    expect(sio.emittedEvents[0]).toMatchObject({
      room: `blueprint:${jobId}`,
      event: "blueprint:event",
    });
    expect((sio.emittedEvents[0].data as { type: string }).type).toBe(
      "role.agent.thinking",
    );

    relay.stop();
  });

  it("场景 2：后到达 socket 仍能接收 join 之后到达的事件（不要求第一条被缓存/重放）", () => {
    const jobId = "job-late-join";
    const jobStore = createMemoryBlueprintJobStore([makeJob(jobId)]);
    const eventBus = createBlueprintEventBus(jobStore);

    const relay = createBlueprintSocketRelay({
      eventBus,
      io: sio.io as never,
    });
    relay.start();

    // 第一条：房间为空时发出，期望被 socket.io 自然丢弃，
    // 但 relay 必须直接调用 io.to(room).emit 一次（验证早返回已被移除）。
    // 用 `payload` 字段携带可断言的标识符（relay 会原样转发到 payload.payload）。
    eventBus.emit(
      makeEvent({
        id: "evt-thinking-1",
        jobId,
        type: "role.agent.thinking",
        family: "role",
        thought: "first event before any subscriber",
        payload: { marker: "first-before-subscriber" },
      }),
    );
    expect(sio.io.to).toHaveBeenCalledTimes(1);
    expect(sio.emittedEvents).toHaveLength(1);

    // 模拟一个 socket 连接进来并订阅 jobId
    const socket = createMockSocket("socket-late", sio.rooms);
    sio.simulateConnection(socket);
    socket.triggerEvent("blueprint:subscribe", { jobId });
    expect(sio.rooms.get(`blueprint:${jobId}`)).toEqual(new Set(["socket-late"]));

    // 第二条：在 socket join 之后发出
    eventBus.emit(
      makeEvent({
        id: "evt-thinking-2",
        jobId,
        type: "role.agent.thinking",
        family: "role",
        thought: "second event after subscriber joined",
        payload: { marker: "second-after-subscriber" },
      }),
    );

    // 该 socket 必须收到第二条事件
    const received = sio.socketReceived.get("socket-late") ?? [];
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      room: `blueprint:${jobId}`,
      event: "blueprint:event",
    });
    const receivedPayload = received[0].data as {
      type: string;
      payload: { marker: string };
    };
    expect(receivedPayload.type).toBe("role.agent.thinking");
    expect(receivedPayload.payload.marker).toBe("second-after-subscriber");

    // 不要求第一条事件被重放：late socket 不应收到第一条事件
    expect(
      received.find(
        (entry) =>
          (entry.data as { payload?: { marker?: string } }).payload?.marker ===
          "first-before-subscriber",
      ),
    ).toBeUndefined();

    relay.stop();
  });

  it("场景 3：家族路由保留 —— capability.* 走批量 blueprint:batch，role.agent.thinking 走单条 blueprint:event", () => {
    vi.useFakeTimers();
    try {
      const jobId = "job-family-routing";
      const jobStore = createMemoryBlueprintJobStore([makeJob(jobId)]);
      const eventBus = createBlueprintEventBus(jobStore);

      const relay = createBlueprintSocketRelay({
        eventBus,
        io: sio.io as never,
      });
      relay.start();

      // 让 room 至少有一个订阅者，避免 flushBatch 因为空房间裁掉缓冲。
      // 注意：单条事件路径已不依赖 room 是否为空（需求 3 已经移除早返回），
      // 但批量路径仍保留空房间裁剪，为了断言 blueprint:batch 实际被推送，
      // 必须确保房间内有订阅者。
      const socket = createMockSocket("socket-cap", sio.rooms);
      sio.simulateConnection(socket);
      socket.triggerEvent("blueprint:subscribe", { jobId });

      // 1) 单条 role.agent.thinking → 应该立即走 blueprint:event
      eventBus.emit(
        makeEvent({
          id: "evt-role-thinking",
          jobId,
          type: "role.agent.thinking",
          family: "role",
          thought: "single role event",
        }),
      );

      const singleEvents = sio.emittedEvents.filter(
        (entry) => entry.event === "blueprint:event",
      );
      expect(singleEvents).toHaveLength(1);
      expect((singleEvents[0].data as { type: string }).type).toBe(
        "role.agent.thinking",
      );

      // 2) 一条 capability.invoked → 进入批量缓冲，不应立即 emit blueprint:batch
      eventBus.emit(
        makeEvent({
          id: "evt-capability-invoked",
          jobId,
          type: "capability.invoked",
          family: "capability",
          capabilityId: "cap-1",
        }),
      );

      // 缓冲未刷新前不应有 blueprint:batch
      const batchBefore = sio.emittedEvents.filter(
        (entry) => entry.event === "blueprint:batch",
      );
      expect(batchBefore).toHaveLength(0);

      // 推进 100ms 触发批量窗口
      vi.advanceTimersByTime(100);

      const batchAfter = sio.emittedEvents.filter(
        (entry) => entry.event === "blueprint:batch",
      );
      expect(batchAfter).toHaveLength(1);
      expect(batchAfter[0].room).toBe(`blueprint:${jobId}`);
      const batchData = batchAfter[0].data as Array<{ type: string }>;
      expect(batchData).toHaveLength(1);
      expect(batchData[0].type).toBe("capability.invoked");

      // 3) 单条 role 事件不应混入 batch 通道，batch 事件不应混入 single 通道
      const singleAfter = sio.emittedEvents.filter(
        (entry) => entry.event === "blueprint:event",
      );
      expect(singleAfter).toHaveLength(1);
      expect((singleAfter[0].data as { type: string }).type).toBe(
        "role.agent.thinking",
      );

      relay.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
