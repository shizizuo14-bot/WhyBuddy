/**
 * Blueprint Socket.IO 中继模块单元测试。
 *
 * 对应 `.kiro/specs/autopilot-realtime-observation-bridge` Task 1.6。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import {
  createBlueprintSocketRelay,
  type BlueprintSocketRelayDeps,
} from "../routes/blueprint/socket-relay.js";
import type { BlueprintEventBus } from "../routes/blueprint/context.js";
import type { BlueprintGenerationEvent } from "../../shared/blueprint/contracts.js";

// ---------------------------------------------------------------------------
// Mock 工厂
// ---------------------------------------------------------------------------

function createMockEventBus() {
  let subscriber: ((event: BlueprintGenerationEvent) => void) | null = null;
  const mockEventBus: BlueprintEventBus = {
    emit: vi.fn(),
    subscribe: vi.fn((fn) => {
      subscriber = fn;
      return () => {
        subscriber = null;
      };
    }),
  };
  return {
    eventBus: mockEventBus,
    emitToSubscriber(event: BlueprintGenerationEvent) {
      subscriber?.(event);
    },
    get subscriber() {
      return subscriber;
    },
  };
}

function createMockSocketIO() {
  const emittedEvents: Array<{ room: string; event: string; data: unknown }> =
    [];
  const rooms = new Map<string, Set<string>>();
  const connectionHandlers: Array<(socket: unknown) => void> = [];

  const mockIo = {
    sockets: {
      adapter: {
        rooms,
      },
    },
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, data: unknown) => {
        emittedEvents.push({ room, event, data });
      }),
    })),
    on: vi.fn((eventName: string, handler: (socket: unknown) => void) => {
      if (eventName === "connection") {
        connectionHandlers.push(handler);
      }
    }),
    off: vi.fn((eventName: string, _handler: unknown) => {
      if (eventName === "connection") {
        connectionHandlers.length = 0;
      }
    }),
  } as unknown as SocketIOServer;

  return {
    io: mockIo,
    emittedEvents,
    rooms,
    connectionHandlers,
    simulateConnection(socket: unknown) {
      for (const handler of connectionHandlers) {
        handler(socket);
      }
    },
  };
}

function createMockSocket(id = "socket-1") {
  const joinedRooms = new Set<string>();
  const handlers = new Map<string, (data: unknown) => void>();
  return {
    id,
    join: vi.fn((room: string) => {
      joinedRooms.add(room);
    }),
    leave: vi.fn((room: string) => {
      joinedRooms.delete(room);
    }),
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
    }),
    joinedRooms,
    handlers,
    triggerEvent(event: string, data: unknown) {
      handlers.get(event)?.(data);
    },
  };
}

function makeEvent(
  overrides: Partial<BlueprintGenerationEvent> = {},
): BlueprintGenerationEvent {
  return {
    id: "evt-1",
    jobId: "job-1",
    type: "role.activated",
    family: "role",
    stage: "runtime_capability",
    status: "running",
    message: "Role activated",
    occurredAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("BlueprintSocketRelay", () => {
  let bus: ReturnType<typeof createMockEventBus>;
  let sio: ReturnType<typeof createMockSocketIO>;
  let deps: BlueprintSocketRelayDeps;

  beforeEach(() => {
    bus = createMockEventBus();
    sio = createMockSocketIO();
    deps = {
      eventBus: bus.eventBus,
      io: sio.io,
    };
  });

  // ── 1. 家族过滤 ──

  it("推送允许家族的事件到 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    // 模拟 room 有订阅者
    sio.rooms.set("blueprint:job-1", new Set(["socket-1"]));

    bus.emitToSubscriber(makeEvent({ type: "role.activated", family: "role" }));

    expect(sio.io.to).toHaveBeenCalledWith("blueprint:job-1");
    expect(sio.emittedEvents).toHaveLength(1);
    expect(sio.emittedEvents[0].event).toBe("blueprint:event");
  });

  it("不推送被过滤家族的事件", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    sio.rooms.set("blueprint:job-1", new Set(["socket-1"]));

    bus.emitToSubscriber(
      makeEvent({
        type: "clarification.ready",
        family: "clarification",
        jobId: "job-1",
      }),
    );

    expect(sio.emittedEvents).toHaveLength(0);
  });

  // ── 2. Room 路由 ──

  it("事件按 jobId 推送到对应 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    sio.rooms.set("blueprint:job-1", new Set(["socket-1"]));
    sio.rooms.set("blueprint:job-2", new Set(["socket-2"]));

    bus.emitToSubscriber(makeEvent({ jobId: "job-1" }));

    expect(sio.io.to).toHaveBeenCalledWith("blueprint:job-1");
    expect(sio.io.to).not.toHaveBeenCalledWith("blueprint:job-2");
  });

  // ── 3. Room 空房间不再阻断单条事件 ──
  // 注：autopilot-streaming-experience 需求 3 移除了 `handleEvent` 中对单条事件
  // 路径的“房间为空就 return”早返回，避免订阅前/订阅瞬间事件被静默丢弃。
  // Socket.IO 的 `io.to(room).emit(...)` 在房间无订阅者时会自然 no-op，
  // 不会抛错，因此本测试更新为：room 无订阅者时仍调用 `io.to().emit()`。

  it("room 无订阅者时仍调用 io.to().emit()（不再因为空房间早返回）", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    // 不设置 room，模拟无订阅者
    bus.emitToSubscriber(makeEvent({ jobId: "job-1" }));

    // autopilot-streaming-experience 需求 3：单条事件路径不再因为空房间早返回，
    // Socket.IO 在房间无订阅者时会自然忽略 emit，不会阻塞后到达的 socket。
    expect(sio.io.to).toHaveBeenCalledWith("blueprint:job-1");
    expect(sio.emittedEvents).toHaveLength(1);
    expect(sio.emittedEvents[0].event).toBe("blueprint:event");
  });

  // ── 4. Subscribe ──

  it("客户端发送 blueprint:subscribe 加入对应 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    const socket = createMockSocket("s1");
    sio.simulateConnection(socket);

    socket.triggerEvent("blueprint:subscribe", { jobId: "job-abc" });

    expect(socket.join).toHaveBeenCalledWith("blueprint:job-abc");
  });

  // ── 5. Unsubscribe ──

  it("客户端发送 blueprint:unsubscribe 离开对应 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    const socket = createMockSocket("s1");
    sio.simulateConnection(socket);

    socket.triggerEvent("blueprint:unsubscribe", { jobId: "job-abc" });

    expect(socket.leave).toHaveBeenCalledWith("blueprint:job-abc");
  });

  // ── 6. jobId 校验 ──

  it("空字符串 jobId 不加入 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    const socket = createMockSocket("s1");
    sio.simulateConnection(socket);

    socket.triggerEvent("blueprint:subscribe", { jobId: "" });

    expect(socket.join).not.toHaveBeenCalled();
  });

  it("非字符串 jobId 不加入 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    const socket = createMockSocket("s1");
    sio.simulateConnection(socket);

    socket.triggerEvent("blueprint:subscribe", { jobId: 123 });

    expect(socket.join).not.toHaveBeenCalled();
  });

  it("超长 jobId（>128）不加入 room", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    const socket = createMockSocket("s1");
    sio.simulateConnection(socket);

    socket.triggerEvent("blueprint:subscribe", { jobId: "x".repeat(129) });

    expect(socket.join).not.toHaveBeenCalled();
  });

  // ── 7. start/stop 生命周期 ──

  it("stop 后不再转发事件", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    sio.rooms.set("blueprint:job-1", new Set(["socket-1"]));

    // 先验证 start 后能转发
    bus.emitToSubscriber(makeEvent({ jobId: "job-1" }));
    expect(sio.emittedEvents).toHaveLength(1);

    relay.stop();

    // stop 后不再转发
    bus.emitToSubscriber(makeEvent({ jobId: "job-1" }));
    expect(sio.emittedEvents).toHaveLength(1); // 仍然是 1，没有新增
  });

  it("stop 后取消 eventBus 订阅", () => {
    const relay = createBlueprintSocketRelay(deps);
    relay.start();

    expect(bus.subscriber).not.toBeNull();

    relay.stop();

    expect(bus.subscriber).toBeNull();
  });
});
