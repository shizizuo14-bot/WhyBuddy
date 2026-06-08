/**
 * @description Pool-backed brainstorm llmCaller — wraps the shared LLM key pool
 * (`BLUEPRINT_SPEC_DOCS_LLM_POOL_*`) as an `LLMCallerFn` so that the
 * `BrainstormOrchestrator` can drive multiple crew members concurrently across
 * the aux model (ouyi pool) instead of serializing on a single LLM.
 *
 * Design: pure factory. `createPoolBackedBrainstormCaller()` reads the pool
 * config from env once; if the pool is not configured it returns `null` so the
 * caller can fall back to a single (primary) caller. Otherwise it creates the
 * pool a single time and returns a closure that round-robins a key per call via
 * `pool.next()` and delegates to `callLlmWithPoolKey`.
 *
 * A single call failure propagates (throws) so the orchestrator's per-member
 * `failMember` path handles it — failures are not swallowed here.
 *
 * @see .kiro/specs/autopilot-brainstorm-companion-runtime/design.md §1
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */

import {
  callLlmWithPoolKey,
  createLlmKeyPool,
  parseKeyPoolFromEnv,
} from "../llm-key-pool";

import type { LLMCallerFn } from "./orchestrator";

/**
 * Build a pool-backed `LLMCallerFn` from the shared spec-docs key pool config.
 *
 * @returns an `LLMCallerFn` that round-robins keys across the pool, or `null`
 *   when the pool is not configured (caller should fall back to a single caller).
 */
export function createPoolBackedBrainstormCaller(): LLMCallerFn | null {
  const config = parseKeyPoolFromEnv();
  if (!config) return null;

  const pool = createLlmKeyPool(config);

  return async (prompt: string, _options: { signal?: AbortSignal }): Promise<string> => {
    const entry = pool.next();
    // systemMessage intentionally empty: brainstorm role/system framing is
    // already baked into `prompt` by the orchestrator's crew-member loop.
    return callLlmWithPoolKey(entry, config, "", prompt);
  };
}
