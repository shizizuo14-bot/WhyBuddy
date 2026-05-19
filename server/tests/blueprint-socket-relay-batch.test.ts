/**
 * Blueprint Socket Relay 批量推送集成测试。
 *
 * 对应 `.kiro/specs/autopilot-realtime-observation-bridge` Task 6.3。
 * 验证高频 capability 事件通过 100ms 聚合窗口批量推送。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlueprintSocketRelay } from "../routes/blueprint/socket-relay.js";

// ---------------------------------------------------------------------------
// Mock 基础设施
// ---------------------------------------------------------------------------

type EventHandler = (event: any) => void;
type SocketHandler = (event: string, data: unknown) => void;

function createMockEventBus() {
  let subscriber: EventHandler | null = null;
  return {
    subscribe(handler: EventHandler) {
      subscriber = handler;
      return () => {
        subscriber = null;
      };
    },
    emit(event: any) {
      subscriber?.(event);
    },
  };
}

function createMockIO() {
  const rooms = new Map<string, Set<string>>();
  const emittedEvents: Array<{ room: string; event: string; data: unknown }> =
    [];
  const connectionHandlers: Array<(socket: any) => void> = [];

  const mockIO = {
    sockets: {
      adapter: {
        rooms,
      },
    },
    to(room: string) {
      return {
        emit(event: string, data: unknown) {
          emittedEvents.push({ room, event, data });
        },
      };
    },
    on(event: string, handler: any) {
      if (event === "connection") {
        connectionHandlers.push(handler);
      }
    },
    off(_event: string, _handler?: any) {},
    // Test helpers
    _emittedEvents: emittedEvents,
    _connectionHandlers: connectionHandlers,
    _addRoom(room: string, socketId: string) {
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room)!.add(socketId);
    },
    _simulateConnection(socket: any) {
      for (const handler of connectionHandlers) {
        handler(socket);
      }
    },
  };

  return mockIO;
}

function createMockSocket(id: string) {
  const handlers = new Map<string, Function>();
  return {
    id,
    on(event: string, handler: Function) {
      handlers.set(event, handler);
    },
    join: vi.fn(),
    leave: vi.fn(),
    _trigger(event: string, data: unknown) {
      handlers.get(event)?.(data);
    },
  };
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("BlueprintSocketRelay batch push (Task 6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("6.1 capability 事件在 100ms 窗口内聚合为 blueprint:batch", () => {
    const eventBus = createMockEventBus();
    const io = createMockIO();
    io._addRoom("blueprint:job-1", "socket-1");

    const relay = createBlueprintSocketRelay({
      eventBus: eventBus as any,
      io: io as any,
    });
    relay.start();

    // 快速连续发送 3 个 capability 事件
    eventBus.emit({
      type: "capability.invoked",
      jobId: "job-1",
      family: "capability",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { capabilityId: "cap-1" },
    });
    eventBus.emit({
      type: "capability.completed",
      jobId: "job-1",
      family: "capability",
      occurredAt: "2026-01-01T00:00:00.050Z",
      payload: { capabilityId: "cap-1" },
    });
    eventBus.emit({
      type: "capability.invoked",
      jobId: "job-1",
      family: "capability",
      occurredAt: "2026-01-01T00:00:00.080Z",
      payload: { capabilityId: "cap-2" },
    });

    // 在 100ms 窗口内不应有任何推送
    expect(io._emittedEvents).toHaveLength(0);

    // 100ms 后应批量推送
    vi.advanceTimersByTime(100);

    expect(io._emittedEvents).toHaveLength(1);
    expect(io._emittedEvents[0].event).toBe("blueprint:batch");
    expect(io._emittedEvents[0].room).toBe("blueprint:job-1");

    const batch = io._emittedEvents[0].data as any[];
    expect(batch).toHaveLength(3);
    expect(batch[0].type).toBe("capability.invoked");
    expect(batch[1].type).toBe("capability.completed");
    expect(batch[2].type).toBe("capability.invoked");

    relay.stop();
  });

  it("6.1 非 capability 事件直接推送，不进入批量缓冲", () => {
    const eventBus = createMockEventBus();
    const io = createMockIO();
    io._addRoom("blueprint:job-1", "socket-1");

    const relay = createBlueprintSocketRelay({
      eventBus: eventBus as any,
      io: io as any,
    });
    relay.start();

    // role 事件应直接推送
    eventBus.emit({
      type: "role.activated",
      jobId: "job-1",
      family: "role",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { roleId: "role-1" },
    });

    expect(io._emittedEvents).toHaveLength(1);
    expect(io._emittedEvents[0].event).toBe("blueprint:event");
    expect((io._emittedEvents[0].data as any).type).toBe("role.activated");

    relay.stop();
  });

  it("6.1 达到 maxBatchSize 时立即刷新，不等待窗口", () => {
    const eventBus = createMockEventBus();
    const io = createMockIO();
    io._addRoom("blueprint:job-1", "socket-1");

    const relay = createBlueprintSocketRelay({
      eventBus: eventBus as any,
      io: io as any,
      maxBatchSize: 3,
    });
    relay.start();

    // 发送 3 个事件（达到 maxBatchSize）
    for (let i = 0; i < 3; i++) {
      eventBus.emit({
        type: "capability.invoked",
        jobId: "job-1",
        family: "capability",
        occurredAt: `2026-01-01T00:00:00.0${i}0Z`,
        payload: { capabilityId: `cap-${i}` },
      });
    }

    // 应立即推送，不等待 100ms
    expect(io._emittedEvents).toHaveLength(1);
    expect(io._emittedEvents[0].event).toBe("blueprint:batch");
    expect((io._emittedEvents[0].data as any[]).length).toBe(3);

    relay.stop();
  });

  it("6.1 stop() 清理所有批量缓冲区定时器", () => {
    const eventBus = createMockEventBus();
    const io = createMockIO();
    io._addRoom("blueprint:job-1", "socket-1");

    const relay = createBlueprintSocketRelay({
      eventBus: eventBus as any,
      io: io as any,
    });
    relay.start();

    // 发送一个事件进入缓冲
    eventBus.emit({
      type: "capability.invoked",
      jobId: "job-1",
      family: "capability",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { capabilityId: "cap-1" },
    });

    // 停止 relay
    relay.stop();

    // 推进时间，不应有推送
    vi.advanceTimersByTime(200);
    expect(io._emittedEvents).toHaveLength(0);
  });

  it("6.1 不同 jobId 的事件独立聚合", () => {
    const eventBus = createMockEventBus();
    const io = createMockIO();
    io._addRoom("blueprint:job-1", "socket-1");
    io._addRoom("blueprint:job-2", "socket-2");

    const relay = createBlueprintSocketRelay({
      eventBus: eventBus as any,
      io: io as any,
    });
    relay.start();

    eventBus.emit({
      type: "capability.invoked",
      jobId: "job-1",
      family: "capability",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { capabilityId: "cap-1" },
    });
    eventBus.emit({
      type: "capability.invoked",
      jobId: "job-2",
      family: "capability",
      occurredAt: "2026-01-01T00:00:00.010Z",
      payload: { capabilityId: "cap-2" },
    });

    vi.advanceTimersByTime(100);

    // 应有两个独立的批量推送
    expect(io._emittedEvents).toHaveLength(2);
    expect(io._emittedEvents[0].room).toBe("blueprint:job-1");
    expect(io._emittedEvents[1].room).toBe("blueprint:job-2");

    relay.stop();
  });
});
