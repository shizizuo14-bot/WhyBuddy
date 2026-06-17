import { afterEach, describe, expect, it, vi } from "vitest";

import { callLlmWithPoolKey, type LlmKeyPoolConfig, type LlmKeyPoolEntry } from "../llm-key-pool.js";

describe("callLlmWithPoolKey response validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports HTTP 200 empty bodies as an upstream empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const entry: LlmKeyPoolEntry = { label: "test001", apiKey: "test-key" };
    const config: LlmKeyPoolConfig = {
      keys: [entry],
      baseUrl: "https://llm.example.test/v1",
      model: "gpt-test",
      timeoutMs: 10_000,
    };

    await expect(callLlmWithPoolKey(entry, config, "system", "user")).rejects.toThrow(
      "LLM pool HTTP 200: empty response body"
    );
  });

  it("reports HTTP 200 invalid JSON bodies as an upstream invalid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const entry: LlmKeyPoolEntry = { label: "test001", apiKey: "test-key" };
    const config: LlmKeyPoolConfig = {
      keys: [entry],
      baseUrl: "https://llm.example.test/v1",
      model: "gpt-test",
      timeoutMs: 10_000,
    };

    await expect(callLlmWithPoolKey(entry, config, "system", "user")).rejects.toThrow(
      "LLM pool HTTP 200: invalid JSON response"
    );
  });
});
