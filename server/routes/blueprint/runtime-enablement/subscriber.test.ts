import { describe, expect, it, vi } from "vitest";

import type { BlueprintGenerationEvent } from "../../../../shared/blueprint/contracts.js";
import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import type { BlueprintEventBus, BlueprintLogger } from "../context.js";
import type { BlueprintRuntimeDiagnosticsStore } from "./diagnostics-store.js";
import { attachDiagnosticsSubscriber } from "./subscriber.js";

/**
 * Co-located unit tests for the runtime-enablement diagnostics subscriber.
 *
 * Design anchor: `.kiro/specs/autopilot-capability-runtime-enablement/design.md`
 * §4.6 — capability / role event → diagnostics store mapping, error
 * containment, and guardrails against malformed payloads.
 *
 * Requirements: 5.6, 6.5, 7.2, 8.5 (example-based only — no PBT).
 *
 * Test strategy:
 * - A purely local {@link createFakeEventBus} mirrors the
 *   `BlueprintEventBus` shape (`emit` + `subscribe`) so the subscriber can
 *   be exercised without pulling in the real bus or any shared state.
 * - A vi-spy-backed `BlueprintRuntimeDiagnosticsStore` observes exactly
 *   which invocations are recorded, which asserts the capability → bridge
 *   mapping table (design §4.6) holds without invoking the real store.
 * - `buildEvent(overrides)` produces a canonical `BlueprintGenerationEvent`
 *   with just the required fields, letting each test override only what it
 *   cares about (payload, type, family, capabilityId).
 * - The subscriber MUST NOT leak exceptions into `eventBus.emit`. Every
 *   malformed-payload test asserts both (a) no record is emitted and (b)
 *   the emitter itself does not throw, which matches the guardrail in
 *   subscriber.ts's wrapping `try / catch`.
 */

function createFakeEventBus(): BlueprintEventBus {
  const listeners = new Set<(event: BlueprintGenerationEvent) => void>();
  return {
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createSpyStore(): BlueprintRuntimeDiagnosticsStore {
  return {
    recordBridgeInvocation: vi.fn(),
    recordBridgeConfiguration: vi.fn(),
    // `autopilot-role-container-loader` spec Task 13.4：新增 2 个 loader 专属方法。
    // 既有测试不会调用它们，保持 spy 兼容即可。
    recordTeardown: vi.fn(),
    noteOrphanContainer: vi.fn(),
    snapshot: vi.fn(),
  } satisfies BlueprintRuntimeDiagnosticsStore;
}

function createFakeLogger(): BlueprintLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Produces a canonical {@link BlueprintGenerationEvent} with the minimum set
 * of required fields populated. Each test overrides only the fields that
 * affect the code path under exam.
 */
function buildEvent(
  overrides: Partial<BlueprintGenerationEvent> = {},
): BlueprintGenerationEvent {
  return {
    id: "evt-test-001",
    jobId: "job-test-001",
    type: BlueprintEventName.CapabilityCompleted,
    family: "capability",
    stage: "runtime_capability",
    status: "running",
    message: "test event",
    occurredAt: "2026-05-12T03:45:00.000Z",
    ...overrides,
  };
}

describe("attachDiagnosticsSubscriber — capability events", () => {
  it("capability.completed + capabilityId=docker-analysis-sandbox + executionMode=real → records ('docker', {mode:'real'}) exactly once", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.CapabilityCompleted,
        family: "capability",
        capabilityId: "docker-analysis-sandbox",
        payload: {
          capabilityId: "docker-analysis-sandbox",
          provenance: { executionMode: "real" },
        },
      }),
    );

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith("docker", {
      mode: "real",
    });
    // No error field is forwarded when provenance.error is absent.
    const args = vi.mocked(store.recordBridgeInvocation).mock.calls[0]!;
    expect(args[1]).not.toHaveProperty("error");
  });

  it("capability.completed + executionMode=simulated_fallback + provenance.error → records {mode:'simulated_fallback', error}", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.CapabilityCompleted,
        family: "capability",
        capabilityId: "docker-analysis-sandbox",
        payload: {
          capabilityId: "docker-analysis-sandbox",
          provenance: {
            executionMode: "simulated_fallback",
            error: "executor unreachable",
          },
        },
      }),
    );

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith("docker", {
      mode: "simulated_fallback",
      error: "executor unreachable",
    });
  });

  it.each<{ capabilityId: string; bridgeId: string }>([
    { capabilityId: "docker-analysis-sandbox", bridgeId: "docker" },
    { capabilityId: "mcp-github-source", bridgeId: "mcpGithub" },
    { capabilityId: "role-system-architecture", bridgeId: "role" },
    { capabilityId: "aigc-spec-node", bridgeId: "aigcNode" },
  ])(
    "capability.completed capabilityId='$capabilityId' maps to bridgeId='$bridgeId'",
    ({ capabilityId, bridgeId }) => {
      const eventBus = createFakeEventBus();
      const store = createSpyStore();
      attachDiagnosticsSubscriber(eventBus, store);

      eventBus.emit(
        buildEvent({
          type: BlueprintEventName.CapabilityCompleted,
          family: "capability",
          capabilityId,
          payload: {
            capabilityId,
            provenance: { executionMode: "real" },
          },
        }),
      );

      expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
      expect(store.recordBridgeInvocation).toHaveBeenCalledWith(bridgeId, {
        mode: "real",
      });
    },
  );

  it("capability.completed with unknown capabilityId is silently ignored (no record, no throw)", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    expect(() => {
      eventBus.emit(
        buildEvent({
          type: BlueprintEventName.CapabilityCompleted,
          family: "capability",
          capabilityId: "unrecognized-cap",
          payload: {
            capabilityId: "unrecognized-cap",
            provenance: { executionMode: "real" },
          },
        }),
      );
    }).not.toThrow();

    expect(store.recordBridgeInvocation).not.toHaveBeenCalled();
  });

  it("capability.failed with simulated_fallback also records (failed shares the handler with completed)", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.CapabilityFailed,
        family: "capability",
        status: "failed",
        capabilityId: "docker-analysis-sandbox",
        payload: {
          capabilityId: "docker-analysis-sandbox",
          provenance: {
            executionMode: "simulated_fallback",
            error: "boom",
          },
        },
      }),
    );

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith("docker", {
      mode: "simulated_fallback",
      error: "boom",
    });
  });
});

describe("attachDiagnosticsSubscriber — role events", () => {
  it("role.activated + activationDriverExecutionMode='real' → records ('agentCrewStageActivation', {mode:'real'})", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.RoleActivated,
        family: "role",
        status: "running",
        payload: { activationDriverExecutionMode: "real" },
      }),
    );

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith(
      "agentCrewStageActivation",
      { mode: "real" },
    );
  });

  it("role.sleeping + activationDriverExecutionMode='simulated_fallback' + fallbackReason → records with error mapped from fallbackReason", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.RoleSleeping,
        family: "role",
        payload: {
          activationDriverExecutionMode: "simulated_fallback",
          fallbackReason: "driver not enabled",
        },
      }),
    );

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith(
      "agentCrewStageActivation",
      { mode: "simulated_fallback", error: "driver not enabled" },
    );
  });

  it("role.activated without activationDriverExecutionMode is not recorded", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.RoleActivated,
        family: "role",
        payload: { roleId: "role-architect" },
      }),
    );

    expect(store.recordBridgeInvocation).not.toHaveBeenCalled();
  });
});

describe("attachDiagnosticsSubscriber — malformed payloads", () => {
  it.each<{ label: string; payload: unknown }>([
    { label: "payload=null", payload: null },
    { label: "payload='not an object'", payload: "not an object" },
    {
      label: "payload.capabilityId is a number (not a string)",
      payload: { capabilityId: 123 },
    },
    {
      label: "payload.provenance is a string (not an object)",
      payload: {
        capabilityId: "docker-analysis-sandbox",
        provenance: "bad",
      },
    },
  ])(
    "$label → does not throw and records nothing",
    ({ payload }) => {
      const eventBus = createFakeEventBus();
      const store = createSpyStore();
      attachDiagnosticsSubscriber(eventBus, store);

      expect(() => {
        eventBus.emit(
          buildEvent({
            type: BlueprintEventName.CapabilityCompleted,
            family: "capability",
            // Intentionally omit `capabilityId` so the handler cannot fall
            // back to `event.capabilityId` when `payload.capabilityId` is
            // missing or not a string.
            capabilityId: undefined,
            payload,
          }),
        );
      }).not.toThrow();

      expect(store.recordBridgeInvocation).not.toHaveBeenCalled();
    },
  );
});

describe("attachDiagnosticsSubscriber — error containment", () => {
  it("store.recordBridgeInvocation throwing does NOT propagate out of eventBus.emit and triggers a single logger.warn", () => {
    const eventBus = createFakeEventBus();
    const throwingStore: BlueprintRuntimeDiagnosticsStore = {
      ...createSpyStore(),
      recordBridgeInvocation: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    const logger = createFakeLogger();
    attachDiagnosticsSubscriber(eventBus, throwingStore, { logger });

    expect(() => {
      eventBus.emit(
        buildEvent({
          type: BlueprintEventName.CapabilityCompleted,
          family: "capability",
          capabilityId: "docker-analysis-sandbox",
          payload: {
            capabilityId: "docker-analysis-sandbox",
            provenance: { executionMode: "real" },
          },
        }),
      );
    }).not.toThrow();

    expect(throwingStore.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "blueprint diagnostics subscriber failed",
      { error: "boom", eventType: "capability.completed" },
    );
    // Other log levels are untouched.
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("omitting the optional logger still swallows the error silently", () => {
    const eventBus = createFakeEventBus();
    const throwingStore: BlueprintRuntimeDiagnosticsStore = {
      ...createSpyStore(),
      recordBridgeInvocation: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    attachDiagnosticsSubscriber(eventBus, throwingStore);

    expect(() => {
      eventBus.emit(
        buildEvent({
          type: BlueprintEventName.CapabilityCompleted,
          family: "capability",
          capabilityId: "docker-analysis-sandbox",
          payload: {
            capabilityId: "docker-analysis-sandbox",
            provenance: { executionMode: "real" },
          },
        }),
      );
    }).not.toThrow();
  });
});

describe("attachDiagnosticsSubscriber — unsubscribe", () => {
  it("returned unsubscribe function detaches the listener so further emits are ignored", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    const unsubscribe = attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.CapabilityCompleted,
        family: "capability",
        capabilityId: "docker-analysis-sandbox",
        payload: {
          capabilityId: "docker-analysis-sandbox",
          provenance: { executionMode: "real" },
        },
      }),
    );
    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);

    unsubscribe();

    eventBus.emit(
      buildEvent({
        type: BlueprintEventName.CapabilityCompleted,
        family: "capability",
        capabilityId: "docker-analysis-sandbox",
        payload: {
          capabilityId: "docker-analysis-sandbox",
          provenance: { executionMode: "real" },
        },
      }),
    );
    // Still 1 — no new call after unsubscribe.
    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
  });
});

/**
 * `autopilot-role-container-loader` spec Task 14.4：loader 事件订阅扩展。
 *
 * 断言新增的 4 条 `role.container.*` 事件映射到 diagnostics store 的正确
 * 调用：ready→recordBridgeInvocation；failed→recordBridgeInvocation(sim);
 * teardown→recordTeardown(+ optional noteOrphanContainer);provisioning
 * 不记账；cached ready 命中缓存不重复计数。
 */
describe("attachDiagnosticsSubscriber — role.container.* events", () => {
  it("(a) role.container.ready with executionMode='real' records ('roleContainerLoader', {mode:'real'})", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        id: "evt-rcl-ready",
        type: BlueprintEventName.RoleContainerReady,
        family: "role",
        payload: {
          key: { jobId: "j1", stageId: "spec_tree", roleId: "r1" },
          containerMode: "real",
          executionMode: "real",
          bindingSummary: { mcpCount: 0, skillCount: 0, aigcNodeCount: 0, skippedMcps: 0, skippedSkills: 0 },
        },
      }),
    );

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith(
      "roleContainerLoader",
      { mode: "real" },
    );
    expect(store.recordTeardown).not.toHaveBeenCalled();
  });

  it("(b) role.container.teardown with containerMode='real' triggers recordTeardown but not noteOrphanContainer", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        id: "evt-rcl-teardown",
        type: BlueprintEventName.RoleContainerTeardown,
        family: "role",
        payload: {
          key: { jobId: "j1", stageId: "spec_tree", roleId: "r1" },
          containerMode: "real",
          executionMode: "real",
          orphan: false,
          handoffArtifactAppended: true,
        },
      }),
    );

    expect(store.recordTeardown).toHaveBeenCalledTimes(1);
    expect(store.recordTeardown).toHaveBeenCalledWith("roleContainerLoader", {
      key: { jobId: "j1", stageId: "spec_tree", roleId: "r1" },
      mode: "real",
    });
    expect(store.noteOrphanContainer).not.toHaveBeenCalled();
    expect(store.recordBridgeInvocation).not.toHaveBeenCalled();
  });

  it("(c) role.container.teardown with orphan=true additionally triggers noteOrphanContainer", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        id: "evt-rcl-teardown-orphan",
        type: BlueprintEventName.RoleContainerTeardown,
        family: "role",
        payload: {
          key: { jobId: "j2", stageId: "spec_docs", roleId: "r2" },
          containerMode: "real",
          orphan: true,
          handoffArtifactAppended: true,
        },
      }),
    );

    expect(store.recordTeardown).toHaveBeenCalledTimes(1);
    expect(store.noteOrphanContainer).toHaveBeenCalledTimes(1);
    expect(store.noteOrphanContainer).toHaveBeenCalledWith(
      "roleContainerLoader",
      expect.objectContaining({ key: { jobId: "j2", stageId: "spec_docs", roleId: "r2" } }),
    );
  });

  it("(d) role.container.ready with cached=true does NOT record an invocation", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        id: "evt-rcl-ready-cached",
        type: BlueprintEventName.RoleContainerReady,
        family: "role",
        payload: {
          key: { jobId: "j3", stageId: "spec_tree", roleId: "r3" },
          containerMode: "real",
          executionMode: "real",
          cached: true,
        },
      }),
    );

    expect(store.recordBridgeInvocation).not.toHaveBeenCalled();
  });

  it("(e) role.container.failed without payload does not throw and records simulated_fallback", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    expect(() =>
      eventBus.emit(
        buildEvent({
          id: "evt-rcl-failed",
          type: BlueprintEventName.RoleContainerFailed,
          family: "role",
          // payload 故意缺失
        }),
      ),
    ).not.toThrow();

    expect(store.recordBridgeInvocation).toHaveBeenCalledTimes(1);
    expect(store.recordBridgeInvocation).toHaveBeenCalledWith(
      "roleContainerLoader",
      { mode: "simulated_fallback" },
    );
  });

  it("(f) role.container.provisioning does NOT touch diagnostics store", () => {
    const eventBus = createFakeEventBus();
    const store = createSpyStore();
    attachDiagnosticsSubscriber(eventBus, store);

    eventBus.emit(
      buildEvent({
        id: "evt-rcl-provisioning",
        type: BlueprintEventName.RoleContainerProvisioning,
        family: "role",
        payload: {
          key: { jobId: "j4", stageId: "spec_tree", roleId: "r4" },
          bindingSummary: { mcpCount: 0, skillCount: 0, aigcNodeCount: 0, skippedMcps: 0, skippedSkills: 0 },
        },
      }),
    );

    expect(store.recordBridgeInvocation).not.toHaveBeenCalled();
    expect(store.recordTeardown).not.toHaveBeenCalled();
    expect(store.noteOrphanContainer).not.toHaveBeenCalled();
  });
});
