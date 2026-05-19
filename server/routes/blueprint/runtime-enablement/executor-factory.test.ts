import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Co-located unit tests for `resolveDefaultExecutorClient`.
 *
 * Design anchor: `.kiro/specs/autopilot-capability-runtime-enablement/design.md`
 * §4.3 — factory behavior (dockerEnabled gate, baseUrl missing warn,
 * constructor throw warn, fire-and-forget probe).
 *
 * Requirements: 2.1, 2.4, 2.5, 2.6, 8.5 (example-based only — no PBT).
 *
 * Test strategy:
 * - `vi.mock` on `../../../core/executor-client.js` with a hoisted control
 *   object lets us (1) avoid real HTTP, (2) toggle the constructor into
 *   throwing on demand, and (3) reconfigure `assertReachable()` per test to
 *   resolve or reject. Using the mocked class for both the factory and the
 *   test means `instanceof ExecutorClient` checks still work.
 * - `queueMicrotask` used by the factory means probe callbacks fire in a
 *   microtask after `resolveDefaultExecutorClient` returns; we use
 *   `vi.waitFor` to await that boundary.
 */

const mockState = vi.hoisted(() => ({
  constructorShouldThrow: false,
  assertReachable: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../../core/executor-client.js", () => {
  class MockExecutorClient {
    readonly baseUrl: string;
    readonly callbackUrl: string;

    constructor(options: { baseUrl: string; callbackUrl: string }) {
      if (mockState.constructorShouldThrow) {
        throw new Error("constructor boom");
      }
      this.baseUrl = options.baseUrl;
      this.callbackUrl = options.callbackUrl;
    }

    assertReachable(): Promise<void> {
      return mockState.assertReachable();
    }
  }
  return { ExecutorClient: MockExecutorClient };
});

// Imports intentionally placed AFTER `vi.mock` so the mocked class is used
// both inside `executor-factory.ts` and in our `instanceof` assertions.
import { ExecutorClient } from "../../../core/executor-client.js";
import { resolveDefaultExecutorClient } from "./executor-factory.js";

function createFakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

const CALLBACK_URL = "http://localhost:3001/api/executor/events";
const BASE_URL = "http://localhost:4000";

describe("resolveDefaultExecutorClient", () => {
  beforeEach(() => {
    mockState.constructorShouldThrow = false;
    mockState.assertReachable.mockReset();
    mockState.assertReachable.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    ["undefined", undefined],
    ["'false'", "false" as const],
  ])(
    "dockerEnabled=%s → returns undefined without warn or probe",
    (_label, dockerEnabled) => {
      const logger = createFakeLogger();
      const onProbeResult = vi.fn();

      const result = resolveDefaultExecutorClient({
        dockerEnabled,
        baseUrl: BASE_URL,
        callbackUrl: CALLBACK_URL,
        logger,
        onProbeResult,
      });

      expect(result).toBeUndefined();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(onProbeResult).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["empty string", ""],
    ["undefined", undefined],
  ])(
    "dockerEnabled='true' + baseUrl=%s → returns undefined and calls logger.warn once",
    (_label, baseUrl) => {
      const logger = createFakeLogger();
      const onProbeResult = vi.fn();

      const result = resolveDefaultExecutorClient({
        dockerEnabled: "true",
        baseUrl,
        callbackUrl: CALLBACK_URL,
        logger,
        onProbeResult,
      });

      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        "executor base url missing, docker bridge will fallback",
        { bridge: "docker" },
      );
      expect(onProbeResult).not.toHaveBeenCalled();
    },
  );

  it("dockerEnabled='true' + valid baseUrl → returns an ExecutorClient instance", () => {
    const result = resolveDefaultExecutorClient({
      dockerEnabled: "true",
      baseUrl: BASE_URL,
      callbackUrl: CALLBACK_URL,
    });

    expect(result).toBeInstanceOf(ExecutorClient);
  });

  it("successful construction + assertReachable resolves → onProbeResult invoked once with { reachable: true }", async () => {
    mockState.assertReachable.mockResolvedValue(undefined);
    const onProbeResult = vi.fn();

    const client = resolveDefaultExecutorClient({
      dockerEnabled: "true",
      baseUrl: BASE_URL,
      callbackUrl: CALLBACK_URL,
      onProbeResult,
    });

    expect(client).toBeInstanceOf(ExecutorClient);
    // Probe is scheduled via `queueMicrotask`, so it has NOT fired yet.
    expect(onProbeResult).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(onProbeResult).toHaveBeenCalledTimes(1);
    });
    expect(onProbeResult).toHaveBeenCalledWith({ reachable: true });
    expect(mockState.assertReachable).toHaveBeenCalledTimes(1);
  });

  it("successful construction + assertReachable rejects → onProbeResult invoked with { reachable: false, error }", async () => {
    mockState.assertReachable.mockRejectedValue(new Error("executor down"));
    const onProbeResult = vi.fn();

    const client = resolveDefaultExecutorClient({
      dockerEnabled: "true",
      baseUrl: BASE_URL,
      callbackUrl: CALLBACK_URL,
      onProbeResult,
    });

    expect(client).toBeInstanceOf(ExecutorClient);

    await vi.waitFor(() => {
      expect(onProbeResult).toHaveBeenCalledTimes(1);
    });
    expect(onProbeResult).toHaveBeenCalledWith({
      reachable: false,
      error: "executor down",
    });
  });

  it("constructor throws → returns undefined and calls logger.warn", () => {
    mockState.constructorShouldThrow = true;
    const logger = createFakeLogger();
    const onProbeResult = vi.fn();

    const result = resolveDefaultExecutorClient({
      dockerEnabled: "true",
      baseUrl: BASE_URL,
      callbackUrl: CALLBACK_URL,
      logger,
      onProbeResult,
    });

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "executor client construction failed",
      { error: "constructor boom" },
    );
    // No probe can be scheduled if the client failed to construct.
    expect(onProbeResult).not.toHaveBeenCalled();
  });
});
