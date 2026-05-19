import { describe, expect, it, vi } from "vitest";

import { ExecutorClientError, type ExecutorClient } from "../../../core/executor-client.js";

import { createDefaultRoleResourceBudget } from "./capability-package.js";
import {
  createLifecycleManager,
  type CreateWithFallbackInput,
  type PhysicalContainer,
} from "./lifecycle-manager.js";

/**
 * Co-located 单元测试（Task 4.7）。
 * 覆盖：(a) real 成功；(b) real unreachable → lite；(c) dispatchPlan 超时 → lite + cancelJob；
 *      (d) override=lite 强制 lite；(e) destroy real 成功；(f) destroy real 抛错 rethrow。
 *
 * 说明：使用进程内 inline fake `ExecutorClient`，不 import 任何测试文件。
 */

// ── Fakes ───────────────────────────────────────────────────────────────────

interface FakeExecutorClientOptions {
  assertReachable?: () => Promise<void>;
  dispatchPlan?: (
    plan: unknown,
    options?: { jobId?: string; requestId?: string; idempotencyKey?: string },
  ) => Promise<{ request: unknown; response: { ok: true; accepted: true; jobId: string } }>;
  cancelJob?: (jobId: string) => Promise<void>;
}

function createFakeExecutorClient(
  options: FakeExecutorClientOptions = {},
): ExecutorClient {
  const fake = {
    assertReachable: options.assertReachable ?? (async () => void 0),
    dispatchPlan:
      options.dispatchPlan ??
      (async (_plan, opts) => ({
        request: { jobId: opts?.jobId ?? "fake-job" },
        response: { ok: true, accepted: true, jobId: opts?.jobId ?? "fake-job" },
      })),
    ...(options.cancelJob !== undefined ? { cancelJob: options.cancelJob } : {}),
  };
  return fake as unknown as ExecutorClient;
}

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildInput(): CreateWithFallbackInput {
  return {
    pkg: {
      alwaysBound: [{ kind: "mcp", id: "github" }],
      containerImage: "lobster-executor:default",
    },
    budget: createDefaultRoleResourceBudget(),
    provisionId: "provision-xyz",
    jobId: "job-1",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("LifecycleManager.createWithFallback", () => {
  it("(a) real success 返回 real 容器且带 containerId", async () => {
    const dispatchPlan = vi.fn().mockResolvedValue({
      request: { jobId: "provision-xyz" },
      response: { ok: true, accepted: true, jobId: "executor-job-abc" },
    });
    const client = createFakeExecutorClient({ dispatchPlan });
    const manager = createLifecycleManager({
      executorClient: client,
      logger: buildLogger(),
      now: () => new Date("2026-05-12T00:00:00Z"),
    });

    const container = await manager.createWithFallback(buildInput());
    expect(container.mode).toBe("real");
    if (container.mode === "real") {
      expect(container.containerId).toBe("executor-job-abc");
      expect(container.image).toBe("lobster-executor:default");
    }
    expect(dispatchPlan).toHaveBeenCalledTimes(1);
  });

  it("(b) real unreachable → lite 带 fallbackReason", async () => {
    const client = createFakeExecutorClient({
      assertReachable: async () => {
        throw new ExecutorClientError("executor down", "unavailable");
      },
    });
    const logger = buildLogger();
    const manager = createLifecycleManager({
      executorClient: client,
      logger,
      now: () => new Date(),
    });

    const container = await manager.createWithFallback(buildInput());
    expect(container.mode).toBe("lite");
    if (container.mode === "lite") {
      expect(container.fallbackReason).toContain("executor unreachable");
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("(c) dispatchPlan 超时 → lite + cancelJob 被调", async () => {
    const cancelJob = vi.fn().mockResolvedValue(undefined);
    const client = createFakeExecutorClient({
      // 用一个"永不 resolve"的 promise 触发超时
      dispatchPlan: () => new Promise(() => {
        // never resolves within test window
      }),
      cancelJob,
    });
    const logger = buildLogger();
    const manager = createLifecycleManager({
      executorClient: client,
      logger,
      now: () => new Date(),
    });

    const input = buildInput();
    // 把 provisionTimeoutMs 调小以便测试快速完成（合法范围最低 5_000，这里
    // 直接覆盖为 5_000 以走最短等待分支）。
    const fastBudget = { ...input.budget, provisionTimeoutMs: 5_000 };
    const container = await manager.createWithFallback({ ...input, budget: fastBudget });

    expect(container.mode).toBe("lite");
    if (container.mode === "lite") {
      expect(container.fallbackReason).toBe("provision timeout");
    }
    expect(cancelJob).toHaveBeenCalledWith("provision-xyz");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("(d) override=lite 无视 executor 可达性直接 lite", async () => {
    const dispatchPlan = vi.fn();
    const assertReachable = vi.fn();
    const client = createFakeExecutorClient({ assertReachable, dispatchPlan });
    const manager = createLifecycleManager({
      executorClient: client,
      logger: buildLogger(),
      now: () => new Date(),
      envOverride: "lite",
    });

    const container = await manager.createWithFallback(buildInput());
    expect(container.mode).toBe("lite");
    if (container.mode === "lite") {
      expect(container.fallbackReason).toBe("mode override=lite");
    }
    expect(assertReachable).not.toHaveBeenCalled();
    expect(dispatchPlan).not.toHaveBeenCalled();
  });

  it("executorClient 缺失时直接 lite", async () => {
    const manager = createLifecycleManager({
      executorClient: undefined,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const container = await manager.createWithFallback(buildInput());
    expect(container.mode).toBe("lite");
    if (container.mode === "lite") {
      expect(container.fallbackReason).toBe("executorClient missing");
    }
  });
});

describe("LifecycleManager.destroyPhysicalContainer", () => {
  it("(e) destroy real 成功：cancelJob 被调", async () => {
    const cancelJob = vi.fn().mockResolvedValue(undefined);
    const client = createFakeExecutorClient({ cancelJob });
    const manager = createLifecycleManager({
      executorClient: client,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const container: PhysicalContainer = {
      mode: "real",
      containerId: "cid-1",
      image: "lobster-executor:default",
    };
    await expect(manager.destroyPhysicalContainer(container)).resolves.toBeUndefined();
    expect(cancelJob).toHaveBeenCalledWith("cid-1");
  });

  it("(f) destroy real 抛错 rethrow 给 loader 统计孤儿", async () => {
    const cancelJob = vi.fn().mockRejectedValue(new Error("network partition"));
    const client = createFakeExecutorClient({ cancelJob });
    const logger = buildLogger();
    const manager = createLifecycleManager({
      executorClient: client,
      logger,
      now: () => new Date(),
    });

    const container: PhysicalContainer = {
      mode: "real",
      containerId: "cid-1",
      image: "lobster-executor:default",
    };
    await expect(manager.destroyPhysicalContainer(container)).rejects.toThrow(
      /network partition/,
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("destroy lite 为 no-op", async () => {
    const cancelJob = vi.fn();
    const client = createFakeExecutorClient({ cancelJob });
    const manager = createLifecycleManager({
      executorClient: client,
      logger: buildLogger(),
      now: () => new Date(),
    });

    const container: PhysicalContainer = {
      mode: "lite",
      fallbackReason: "testing",
    };
    await expect(manager.destroyPhysicalContainer(container)).resolves.toBeUndefined();
    expect(cancelJob).not.toHaveBeenCalled();
  });
});
