import { afterEach, describe, expect, it, vi } from "vitest";

import { createPoolBackedBrainstormCaller } from "./pool-llm-caller";

/**
 * Unit tests for the pool-backed brainstorm llmCaller.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5
 *
 * The network is fully mocked: `callLlmWithPoolKey` is replaced via `vi.mock`
 * so NO real HTTP request is made. We keep the real `parseKeyPoolFromEnv` /
 * `createLlmKeyPool` so the round-robin behaviour under test is exercised
 * genuinely.
 */
vi.mock("../llm-key-pool", async (importActual) => {
  const actual = await importActual<typeof import("../llm-key-pool")>();
  return {
    ...actual,
    // Echo back the key label so tests can observe round-robin key selection.
    callLlmWithPoolKey: vi.fn(
      async (entry: { label: string }, _config, _system: string, prompt: string) =>
        `${entry.label}::${prompt}`,
    ),
  };
});

function stubPoolEnv(keys: string, labels?: string): void {
  vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", keys);
  vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL", "https://example.test/v1");
  vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL", "ouyi-5-preview-thinking");
  if (labels !== undefined) {
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_LABELS", labels);
  }
}

describe("createPoolBackedBrainstormCaller", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns a function and round-robins keys across multiple calls when pool is configured", async () => {
    stubPoolEnv("key-aaa,key-bbb,key-ccc", "a,b,c");

    const caller = createPoolBackedBrainstormCaller();
    expect(caller).toBeTypeOf("function");

    // 5 calls over a 3-key pool → labels should cycle a,b,c,a,b.
    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await caller!(`prompt-${i}`, {}));
    }

    const labels = results.map((r) => r.split("::")[0]);
    expect(labels).toEqual(["a", "b", "c", "a", "b"]);

    // Each call delegated to the pool with the correct prompt passed through.
    expect(results[0]).toBe("a::prompt-0");
    expect(results[4]).toBe("b::prompt-4");
  });

  it("returns null when the pool is not configured", () => {
    vi.stubEnv("BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS", "");

    const caller = createPoolBackedBrainstormCaller();
    expect(caller).toBeNull();
  });
});
