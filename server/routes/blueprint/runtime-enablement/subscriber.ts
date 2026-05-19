/**
 * Autopilot capability runtime enablement — diagnostics event subscriber.
 *
 * Attaches a single listener onto `BlueprintEventBus` that translates the
 * existing `capability.completed` / `capability.failed` / `role.*` events
 * produced by the 5 `/autopilot` capability bridges into
 * `BlueprintRuntimeDiagnosticsStore.recordBridgeInvocation(...)` updates.
 *
 * Design anchors:
 * - `design.md` §4.6 — event → diagnostics mapping table and guardrails.
 * - `design.md` §4.4 — `BridgeId` / invocation record shape in the store.
 *
 * Requirements satisfied:
 * - 5.6: Diagnostics store populates itself by subscribing to the event bus
 *        WITHOUT requiring any modification to the 5 bridge implementations.
 * - 6.5: Runtime errors surfaced while updating the store MUST be swallowed
 *        so a mis-shaped event never propagates out of the event bus loop.
 * - 7.2: SHALL NOT introduce any new `BlueprintEventName`; we only consume
 *        the existing `capability.completed` / `capability.failed` and the
 *        `role.*` family.
 *
 * Hard constraints:
 * - This module is a leaf on the composition graph: it only depends on the
 *   `BlueprintEventBus` interface from `../context.js`, the diagnostics
 *   `BridgeId` + store contract from `./diagnostics-store.js`, and the
 *   `BlueprintGenerationEvent` shape from `shared/blueprint/contracts.ts`.
 * - The subscriber MUST NOT throw. The whole handler body is wrapped in a
 *   `try / catch` that silently swallows errors; when a `logger` is supplied
 *   we additionally emit a single `warn` so operators can diagnose bad
 *   payloads via log grep without the server crashing.
 * - `event.payload` is typed as `unknown` — we narrow it with defensive
 *   `typeof ... === "object"` checks before touching any nested field, so a
 *   bridge that changes its payload shape tomorrow never causes the
 *   subscriber to crash.
 * - We MUST NOT read `process.env`. Gate decisions belong to the resolver
 *   and composition root; the subscriber is a pure data translator.
 */

import type { BlueprintGenerationEvent } from "../../../../shared/blueprint/contracts.js";
import {
  BlueprintEventName,
  type BlueprintGenerationEventType,
} from "../../../../shared/blueprint/events.js";
import type { BlueprintEventBus, BlueprintLogger } from "../context.js";
import type {
  BridgeId,
  BlueprintRuntimeDiagnosticsStore,
} from "./diagnostics-store.js";

/**
 * Options for {@link attachDiagnosticsSubscriber}. All fields are optional;
 * the default silent behaviour is appropriate for tests and for the
 * composition root when no dedicated logger is available.
 */
export interface AttachDiagnosticsSubscriberOptions {
  /**
   * Optional logger. When supplied, the subscriber emits a single `warn`
   * record if an event handler throws (either because the event payload is
   * malformed or because the store itself misbehaves). Callers that prefer
   * silent failure can omit this field.
   */
  logger?: BlueprintLogger;
}

/**
 * Capability identifier → {@link BridgeId} mapping. See design §4.6 for the
 * authoritative table. Capabilities not listed here are silently ignored
 * (for example `spec-generation`) — diagnostics only tracks the 5 bridges
 * owned by this spec.
 */
const CAPABILITY_TO_BRIDGE: Readonly<Record<string, BridgeId>> = {
  "docker-analysis-sandbox": "docker",
  "mcp-github-source": "mcpGithub",
  "role-system-architecture": "role",
  "aigc-spec-node": "aigcNode",
};

/**
 * Event types we react to for the capability → bridge mapping. Listed as
 * literals so the `typeof CAPABILITY_EVENT_TYPES[number]` narrowing in
 * `isCapabilityEvent` stays sound under `--strict`.
 */
const CAPABILITY_EVENT_TYPES: readonly BlueprintGenerationEventType[] = [
  BlueprintEventName.CapabilityCompleted,
  BlueprintEventName.CapabilityFailed,
];

/**
 * Type guard: `event.type` is one of the capability events we care about.
 */
function isCapabilityEvent(event: BlueprintGenerationEvent): boolean {
  return CAPABILITY_EVENT_TYPES.includes(event.type);
}

/**
 * Safely reads a property from an `unknown` payload. Returns `undefined`
 * when the payload is not an object or the key is absent. Intentionally
 * loose: we never throw even if the caller passes a string or a primitive.
 */
function readPayloadField(payload: unknown, key: string): unknown {
  if (payload === null || typeof payload !== "object") {
    return undefined;
  }
  if (!(key in payload)) {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

/**
 * Coerces the provenance `executionMode` into the diagnostics store's
 * `{ "real" | "simulated_fallback" }` shape. Returns `undefined` for any
 * other value so the caller can short-circuit without recording a bogus
 * invocation.
 */
function toInvocationMode(
  value: unknown,
): "real" | "simulated_fallback" | undefined {
  if (value === "real" || value === "simulated_fallback") {
    return value;
  }
  return undefined;
}

/**
 * Normalises an error field into the `{ error?: string }` shape expected by
 * `recordBridgeInvocation`. Non-string values (missing, numbers, objects)
 * are dropped.
 */
function toErrorString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

/**
 * Handles a `capability.completed` / `capability.failed` event. Resolves the
 * bridge identifier from the payload's `capabilityId` (falling back to the
 * top-level `event.capabilityId` when the bridge emits the id only there),
 * extracts the provenance execution mode, and forwards it to the store.
 *
 * Returns silently when the capability is not one of the 4 tracked bridges
 * or when the payload does not carry a usable execution mode — diagnostics
 * is additive instrumentation, not a validator.
 */
function handleCapabilityEvent(
  event: BlueprintGenerationEvent,
  store: BlueprintRuntimeDiagnosticsStore,
): void {
  const payloadCapabilityId = readPayloadField(event.payload, "capabilityId");
  const capabilityId =
    typeof payloadCapabilityId === "string"
      ? payloadCapabilityId
      : event.capabilityId;
  if (typeof capabilityId !== "string" || capabilityId === "") {
    return;
  }
  const bridgeId = CAPABILITY_TO_BRIDGE[capabilityId];
  if (bridgeId === undefined) {
    return;
  }

  // Provenance may live at `payload.provenance` (the canonical location) but
  // the docker / mcp / role / aigc bridges also splat select fields directly
  // onto the payload root (see server/routes/blueprint.ts). We prefer the
  // nested path and fall back to the flat form to stay robust against both.
  const provenance = readPayloadField(event.payload, "provenance");
  const executionMode =
    toInvocationMode(readPayloadField(provenance, "executionMode")) ??
    toInvocationMode(readPayloadField(event.payload, "executionMode"));
  if (executionMode === undefined) {
    return;
  }

  const error =
    toErrorString(readPayloadField(provenance, "error")) ??
    toErrorString(readPayloadField(event.payload, "error"));

  store.recordBridgeInvocation(bridgeId, {
    mode: executionMode,
    ...(error !== undefined ? { error } : {}),
  });
}

/**
 * Handles any event in the `role` family. The stage activation driver tags
 * its outgoing `role.activated` / `role.watching` / `role.reviewing` /
 * `role.sleeping` events with `activationDriverExecutionMode`; the absence
 * of that field means the role transition is driven by a non-real-time
 * path and should not be recorded here.
 *
 * We also pick up an optional `fallbackReason` (and, defensively, `error`)
 * so the diagnostics endpoint can explain why the driver fell back.
 */
function handleRoleEvent(
  event: BlueprintGenerationEvent,
  store: BlueprintRuntimeDiagnosticsStore,
): void {
  if (event.family !== "role") {
    return;
  }
  const mode = toInvocationMode(
    readPayloadField(event.payload, "activationDriverExecutionMode"),
  );
  if (mode === undefined) {
    return;
  }

  const error =
    toErrorString(readPayloadField(event.payload, "fallbackReason")) ??
    toErrorString(readPayloadField(event.payload, "error"));

  store.recordBridgeInvocation("agentCrewStageActivation", {
    mode,
    ...(error !== undefined ? { error } : {}),
  });
}

/**
 * Subscribes a listener onto `eventBus` that mirrors relevant events into
 * `store`. Returns the unsubscribe handle produced by `eventBus.subscribe`,
 * so callers (typically `buildBlueprintServiceContext`) can dispose the
 * subscription during teardown if needed.
 *
 * Preconditions:
 * - `eventBus.subscribe` is the `BlueprintEventBus` contract from
 *   `server/routes/blueprint/context.ts`.
 * - `store` is an instance produced by
 *   `createBlueprintRuntimeDiagnosticsStore()`.
 *
 * Postconditions:
 * - Each received event passes through the handler exactly once. The handler
 *   body is fully wrapped in `try / catch`; neither a malformed event nor a
 *   throwing `store.recordBridgeInvocation` can propagate out of the event
 *   loop callback.
 * - When `options.logger` is supplied, a throwing handler emits exactly one
 *   `warn` record per failed event, annotated with `{ error, eventType }`.
 * - The returned function is the same unsubscribe returned by
 *   `eventBus.subscribe`; calling it more than once is permitted and
 *   idempotent as far as this module is concerned.
 */
/**
 * `autopilot-role-container-loader` spec Task 14：处理 role container loader
 * 相关的 4 条事件（`role.container.provisioning/ready/teardown/failed`）。
 *
 * 本函数独立于 `handleRoleEvent`：loader 事件属于 `role` 家族但不带
 * `activationDriverExecutionMode` 字段（那是 stage activation driver 专用），
 * 而是带 `executionMode` / `containerMode` / `cached` / `orphan` 等 loader 独有
 * payload。因此拆成独立 handler 更清晰。
 *
 * 约束：
 * - `role.container.provisioning` 是"开始"信号，不记入任何计数；loader 的真正
 *   invocation 统计由 `ready` / `failed` 驱动。
 * - `role.container.ready` 的 `cached === true` 表示幂等命中，**不重复计数**
 *   （需求 2.2 + Task 2.2 幂等语义 + Task 14 规范）。
 * - `role.container.failed` 永远记为 `simulated_fallback`，携带 error。
 * - `role.container.teardown` 调 `recordTeardown` + 可选 `noteOrphanContainer`。
 */
function handleRoleContainerLoaderEvent(
  event: BlueprintGenerationEvent,
  store: BlueprintRuntimeDiagnosticsStore,
): void {
  if (event.type === BlueprintEventName.RoleContainerReady) {
    const cached = readPayloadField(event.payload, "cached");
    if (cached === true) return;
    const mode =
      toInvocationMode(
        readPayloadField(event.payload, "executionMode"),
      ) ?? "simulated_fallback";
    store.recordBridgeInvocation("roleContainerLoader", { mode });
    return;
  }
  if (event.type === BlueprintEventName.RoleContainerFailed) {
    const error =
      toErrorString(readPayloadField(event.payload, "error")) ??
      toErrorString(readPayloadField(event.payload, "fallbackReason"));
    store.recordBridgeInvocation("roleContainerLoader", {
      mode: "simulated_fallback",
      ...(error !== undefined ? { error } : {}),
    });
    return;
  }
  if (event.type === BlueprintEventName.RoleContainerTeardown) {
    const containerMode = readPayloadField(event.payload, "containerMode");
    const mode: "real" | "lite" = containerMode === "real" ? "real" : "lite";
    const key = readPayloadField(event.payload, "key");
    store.recordTeardown("roleContainerLoader", { key, mode });
    if (readPayloadField(event.payload, "orphan") === true) {
      store.noteOrphanContainer("roleContainerLoader", {
        key,
        err: "physical container release failed",
      });
    }
    return;
  }
  // role.container.provisioning 只作为开始信号；不影响 diagnostics。
}

export function attachDiagnosticsSubscriber(
  eventBus: BlueprintEventBus,
  store: BlueprintRuntimeDiagnosticsStore,
  options: AttachDiagnosticsSubscriberOptions = {},
): () => void {
  const { logger } = options;
  return eventBus.subscribe((event) => {
    try {
      if (isCapabilityEvent(event)) {
        handleCapabilityEvent(event, store);
        return;
      }
      // Task 14：先分发 role container loader 事件，再交给通用 role handler。
      // 两者互不冲突：loader 事件带 `executionMode`，driver 事件带
      // `activationDriverExecutionMode`；即便共流经两个 handler，也不会产生
      // 双重记账（通用 handler 看不到 `activationDriverExecutionMode` 会直接 return）。
      if (
        event.type === BlueprintEventName.RoleContainerProvisioning ||
        event.type === BlueprintEventName.RoleContainerReady ||
        event.type === BlueprintEventName.RoleContainerTeardown ||
        event.type === BlueprintEventName.RoleContainerFailed
      ) {
        handleRoleContainerLoaderEvent(event, store);
        return;
      }
      handleRoleEvent(event, store);
    } catch (err) {
      // Diagnostics MUST NOT break the event bus. Swallow the failure and,
      // when a logger is supplied, emit a single warn record so operators
      // can correlate a missing diagnostics entry with the offending event.
      logger?.warn("blueprint diagnostics subscriber failed", {
        error: err instanceof Error ? err.message : String(err),
        eventType: event.type,
      });
    }
  });
}
