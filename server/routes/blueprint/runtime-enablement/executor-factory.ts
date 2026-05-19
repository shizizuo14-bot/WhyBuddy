/**
 * Autopilot capability runtime enablement — default executor factory.
 *
 * Synchronously resolves the optional default `ExecutorClient` that the Docker
 * capability bridge (`server/routes/blueprint/docker-analysis-sandbox/bridge.ts`)
 * receives via `BlueprintServiceContext.executorClient`.
 *
 * Design anchor: `.kiro/specs/autopilot-capability-runtime-enablement/design.md`
 * §4.3 — `resolveDefaultExecutorClient` factory.
 *
 * Requirements satisfied:
 * - 2.1: Docker bridge receives a default `ExecutorClient` when the resolved
 *        bridge enablement is `"true"` and `LOBSTER_EXECUTOR_BASE_URL` is set.
 * - 2.4: Master switch on but `baseUrl` missing → `undefined` + `logger.warn`
 *        rather than throwing; the bridge then falls back.
 * - 2.5: Startup construction MUST NOT synchronously call `assertReachable()`;
 *        the probe is scheduled via `queueMicrotask` as fire-and-forget.
 * - 2.6: The `ExecutorClient` constructor is invoked with
 *        `{ baseUrl, callbackUrl }`, matching the signature used by
 *        `server/core/execution-bridge.ts`.
 *
 * Design constraints (hard):
 * - Value import for `ExecutorClient` (we need `new`); type-only import for
 *   `BlueprintLogger` to avoid pulling context-layer code into the dependency
 *   graph of this leaf module.
 * - No `process.env` reads here; the caller supplies every input. This keeps
 *   the factory pure-ish (only `queueMicrotask` + possible `logger.warn`
 *   side effects) and directly testable.
 * - The probe callback itself is wrapped in try/catch so a buggy caller
 *   `onProbeResult` cannot turn a fire-and-forget probe into an unhandled
 *   rejection or a thrown exception that escapes the microtask boundary.
 * - Never return a `Promise`. The Docker bridge expects a synchronously
 *   available client (or `undefined`); any latency would block
 *   `createServer()` startup (requirement 2.5).
 */

import { ExecutorClient } from "../../../core/executor-client.js";
import type { BlueprintLogger } from "../context.js";

/**
 * Input tuple for {@link resolveDefaultExecutorClient}. All fields are plain
 * data; callers are responsible for extracting the values from `process.env`
 * or wherever they originate.
 */
export interface ResolveExecutorClientInput {
  /**
   * Resolved enablement state for the Docker bridge, produced by
   * `resolveBridgeEnablement({ envFlag: "BLUEPRINT_DOCKER_CAPABILITY_BRIDGE_ENABLED", ... })`.
   *
   * Any value other than the exact string `"true"` short-circuits the factory
   * to `undefined` and skips the warn / probe paths — this includes both the
   * `"false"` and `undefined` cases, aligned with the bridge tier-1 gate in
   * `server/routes/blueprint/docker-analysis-sandbox/bridge.ts`.
   */
  dockerEnabled: "true" | "false" | undefined;
  /**
   * Value of `process.env.LOBSTER_EXECUTOR_BASE_URL`. Empty string or
   * `undefined` is treated as "missing" and results in a `logger.warn` without
   * constructing a client (requirement 2.4).
   */
  baseUrl: string | undefined;
  /**
   * Server-side callback URL the executor should POST events to, produced by
   * the caller via the same `buildCallbackUrl()` helper that
   * `server/core/execution-bridge.ts` uses (requirement 2.6). Passed straight
   * into `new ExecutorClient({ baseUrl, callbackUrl })`.
   */
  callbackUrl: string;
  /**
   * Optional logger. When the factory decides to short-circuit because of a
   * missing `baseUrl` or a constructor throw, it emits a single `warn` record
   * so operators can diagnose why Docker bridge fell back to simulated mode.
   * Silent no-op logger is acceptable and recommended for tests that do not
   * care about log content.
   */
  logger?: BlueprintLogger;
  /**
   * Optional fire-and-forget probe callback. When supplied and the client is
   * successfully constructed, the factory schedules a single
   * `client.assertReachable()` call via `queueMicrotask` and forwards the
   * resolution to this callback. The callback is invoked at most once per
   * `resolveDefaultExecutorClient` call and never blocks the caller.
   *
   * The factory guarantees:
   * - `queueMicrotask` (Node built-in global) is used, NOT `setImmediate` or
   *   `setTimeout`, matching the design §4.3 algorithm.
   * - The probe call site and the callback invocation are both wrapped in
   *   try/catch so a synchronous throw from `assertReachable`, a rejected
   *   promise chain, or a throwing `onProbeResult` cannot escape the
   *   microtask and crash the server.
   */
  onProbeResult?: (result: { reachable: boolean; error?: string }) => void;
}

/**
 * Constructs a default `ExecutorClient` for the Docker capability bridge when
 * the configuration signals the bridge is enabled and the executor base URL
 * is available. Returns `undefined` in all other cases so the bridge falls
 * back to simulated execution via its existing tier-2 dependency check.
 *
 * Preconditions:
 * - `input.dockerEnabled`, `input.baseUrl` are arbitrary strings or `undefined`
 *   (mirroring `process.env` access); `null` is NOT accepted.
 * - `input.callbackUrl` is a well-formed URL string; malformed callback URLs
 *   will be caught by the `new ExecutorClient(...)` constructor and surfaced
 *   via the catch block (returns `undefined` + warn).
 *
 * Postconditions:
 * - Returns an `ExecutorClient` instance when `dockerEnabled === "true"` AND
 *   `baseUrl` is a non-empty string AND the constructor does not throw.
 * - Returns `undefined` in every other branch without throwing.
 * - When `onProbeResult` is supplied and a client was constructed, exactly one
 *   microtask is scheduled that eventually invokes `onProbeResult` once with
 *   `{ reachable: true }` on success or `{ reachable: false, error }` on
 *   failure. The caller MUST tolerate the probe completing after
 *   `resolveDefaultExecutorClient` has already returned.
 *
 * Non-postconditions (intentional):
 * - The factory does NOT call `assertReachable()` synchronously; requirement
 *   2.5 forbids blocking `createServer()` startup on executor reachability.
 * - The factory does NOT throw under any circumstance. Construction failures
 *   are logged via `logger.warn` and converted to `undefined`.
 */
export function resolveDefaultExecutorClient(
  input: ResolveExecutorClientInput,
): ExecutorClient | undefined {
  // Step 1 — Bridge disabled → short-circuit silently. No warn, no probe.
  // This branch covers both explicit `"false"` and the `undefined` "unset"
  // state; the Docker bridge tier-1 gate will observe the same env value and
  // route the invocation to simulated fallback on its own.
  if (input.dockerEnabled !== "true") {
    return undefined;
  }

  // Step 2 — Enabled but `baseUrl` missing. Emit a single warn so operators
  // can tell the difference between "explicitly disabled" and "enabled but
  // misconfigured" when reading `/api/blueprint/diagnostics` later.
  if (input.baseUrl === undefined || input.baseUrl === "") {
    input.logger?.warn(
      "executor base url missing, docker bridge will fallback",
      { bridge: "docker" },
    );
    return undefined;
  }

  // Step 3 — Attempt construction. `ExecutorClient` validates nothing in its
  // constructor today, but any future invariants (URL parsing, required
  // options) should fall through to the same warn path rather than propagate
  // out of the composition root.
  let client: ExecutorClient;
  try {
    client = new ExecutorClient({
      baseUrl: input.baseUrl,
      callbackUrl: input.callbackUrl,
    });
  } catch (err) {
    input.logger?.warn("executor client construction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }

  // Step 4 — Optional fire-and-forget probe. Scheduling via `queueMicrotask`
  // guarantees the caller returns before any network I/O starts, while the
  // inner try/catch ensures neither `assertReachable` nor a misbehaving
  // `onProbeResult` callback can escape the microtask boundary and bring
  // down the server process.
  const onProbeResult = input.onProbeResult;
  if (onProbeResult !== undefined) {
    queueMicrotask(() => {
      try {
        client
          .assertReachable()
          .then(() => {
            try {
              onProbeResult({ reachable: true });
            } catch {
              // Swallow: diagnostics callback must not impact runtime.
            }
          })
          .catch((err: unknown) => {
            try {
              onProbeResult({
                reachable: false,
                error: err instanceof Error ? err.message : String(err),
              });
            } catch {
              // Swallow: diagnostics callback must not impact runtime.
            }
          });
      } catch (err) {
        // `assertReachable()` itself can, in theory, throw synchronously
        // before returning a promise (e.g. if the `fetch` polyfill is
        // misconfigured). Treat that the same as a probe failure.
        try {
          onProbeResult({
            reachable: false,
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // Swallow.
        }
      }
    });
  }

  return client;
}
