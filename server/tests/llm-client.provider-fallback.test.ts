import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { costTracker } from "../core/cost-tracker.js";
import { callLLMJson } from "../core/llm-client.js";

describe("callLLMJson provider fallback", () => {
  let savedEnv: Record<string, string | undefined>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedEnv = { ...process.env };
    originalFetch = globalThis.fetch;
    costTracker.resetCurrentMission();

    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_WIRE_API;

    process.env.LLM_API_KEY = "primary-key";
    process.env.LLM_BASE_URL = "https://primary.example.com/codex/v1";
    process.env.LLM_MODEL = "gpt-5.4";
    process.env.LLM_WIRE_API = "responses";
    process.env.LLM_RETRIES = "1";
    process.env.LLM_STREAM = "false";
    process.env.LLM_PROVIDER_COOLDOWN_MS = "0";
    process.env.LLM_MODEL_FALLBACKS = "";

    process.env.FALLBACK_LLM_API_KEY = "fallback-key";
    process.env.FALLBACK_LLM_BASE_URL = "https://fallback.example.com/api/paas/v4";
    process.env.FALLBACK_LLM_MODEL = "glm-5-turbo";
    process.env.FALLBACK_LLM_WIRE_API = "chat_completions";
    process.env.FALLBACK_LLM_FORCE_MODEL = "true";
    process.env.FALLBACK_LLM_RETRIES = "1";
    process.env.FALLBACK_LLM_STREAM = "false";
    process.env.FALLBACK_LLM_COOLDOWN_MS = "0";
  });

  afterEach(() => {
    costTracker.resetCurrentMission();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();

    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it("tries the fallback provider when the primary endpoint rejects the downgraded model", async () => {
    vi.spyOn(costTracker, "getEffectiveModel").mockReturnValue("glm-4.6");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              message: "Model not enabled for /codex: glm-4.6",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    needsClarification: true,
                    questions: [
                      {
                        questionId: "timeline",
                        text: "What deadline should we optimize for?",
                        type: "single_choice",
                        options: ["today", "this week", "flexible"],
                      },
                    ],
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 18,
              total_tokens: 30,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await callLLMJson<{
      needsClarification: boolean;
      questions: Array<{
        questionId: string;
        text: string;
        type: string;
        options: string[];
      }>;
    }>([{ role: "user", content: "Generate clarification questions." }], {
      model: "gpt-5.4",
      maxTokens: 256,
    });

    expect(result).toEqual({
      needsClarification: true,
      questions: [
        {
          questionId: "timeline",
          text: "What deadline should we optimize for?",
          type: "single_choice",
          options: ["today", "this week", "flexible"],
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [primaryUrl, primaryInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(primaryUrl).toBe("https://primary.example.com/codex/v1/responses");
    expect(JSON.parse(primaryInit.body as string)).toMatchObject({
      model: "glm-4.6",
      stream: false,
      store: false,
    });

    const [fallbackUrl, fallbackInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(fallbackUrl).toBe(
      "https://fallback.example.com/api/paas/v4/chat/completions",
    );
    expect(JSON.parse(fallbackInit.body as string)).toMatchObject({
      model: "glm-5-turbo",
      stream: false,
    });
  });

  it("reports truncated JSON when the provider stops at max tokens", async () => {
    process.env.LLM_WIRE_API = "chat_completions";

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '[{"identity":"SlideRule (xiaojilele-',
              },
              finish_reason: "length",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 3000,
            total_tokens: 3100,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      callLLMJson([{ role: "user", content: "Return agent identities." }], {
        model: "gpt-5.4",
        maxTokens: 3000,
      }),
    ).rejects.toThrow(/truncated.*max token/i);
  });

  it("does not downgrade unlimited gpt-5.5 calls", async () => {
    process.env.LLM_MODEL = "gpt-5.5";
    process.env.LLM_UNLIMITED_MODELS = "gpt-5.5";
    const getEffectiveModelSpy = vi
      .spyOn(costTracker, "getEffectiveModel")
      .mockReturnValue("glm-4.6");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({ ok: true }),
          usage: {
            input_tokens: 1000,
            output_tokens: 2000,
            total_tokens: 3000,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await callLLMJson<{ ok: boolean }>(
      [{ role: "user", content: "Use the configured unlimited model." }],
      { maxTokens: 256 },
    );

    expect(result).toEqual({ ok: true });
    expect(getEffectiveModelSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [primaryUrl, primaryInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(primaryUrl).toBe("https://primary.example.com/codex/v1/responses");
    expect(JSON.parse(primaryInit.body as string)).toMatchObject({
      model: "gpt-5.5",
      stream: false,
      store: false,
    });
    expect(costTracker.getRecords()).toHaveLength(0);
    expect(costTracker.getDowngradeLevel()).toBe("none");
  });

  it("tries the fallback provider when the primary provider reports daily quota exhaustion", async () => {
    process.env.LLM_MODEL = "gpt-5.5";
    process.env.LLM_UNLIMITED_MODELS = "gpt-5.5";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              type: "billing_error",
              message: "daily quota exceeded",
            },
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ ok: true }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      callLLMJson<{ ok: boolean }>(
        [{ role: "user", content: "Generate JSON." }],
        { maxTokens: 128 },
      ),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [fallbackUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(fallbackUrl).toBe(
      "https://fallback.example.com/api/paas/v4/chat/completions",
    );
  });

  it("tries same-provider model fallbacks before external fallback when a model quota is exhausted", async () => {
    process.env.LLM_MODEL = "gpt-5.4";
    process.env.LLM_MODEL_FALLBACKS = "gpt-5.3-codex,gpt-5.4-mini";
    process.env.LLM_REASONING_EFFORT = "high";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              type: "billing_error",
              message: "daily quota exceeded",
            },
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({ ok: true, model: "gpt-5.3-codex" }),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      callLLMJson<{ ok: boolean; model: string }>(
        [{ role: "user", content: "Generate JSON." }],
        { maxTokens: 128 },
      ),
    ).resolves.toEqual({ ok: true, model: "gpt-5.3-codex" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [primaryUrl, primaryInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(primaryUrl).toBe("https://primary.example.com/codex/v1/responses");
    expect(JSON.parse(primaryInit.body as string)).toMatchObject({
      model: "gpt-5.4",
      reasoning: { effort: "high" },
    });

    const [modelFallbackUrl, modelFallbackInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(modelFallbackUrl).toBe("https://primary.example.com/codex/v1/responses");
    expect(JSON.parse(modelFallbackInit.body as string)).toMatchObject({
      model: "gpt-5.3-codex",
    });
    const modelFallbackBody = JSON.parse(modelFallbackInit.body as string);
    expect(modelFallbackBody).not.toHaveProperty("reasoning");
    expect(modelFallbackBody).not.toHaveProperty("temperature");
  });

  it("parses provider SSE responses even when the request was non-streaming", async () => {
    process.env.LLM_MODEL = "gpt-5.3-codex";
    process.env.LLM_MODEL_FALLBACKS = "";
    delete process.env.FALLBACK_LLM_API_KEY;
    delete process.env.FALLBACK_LLM_BASE_URL;

    const rawStream = [
      "event: response.created",
      'data: {"type":"response.created","response":{"id":"resp-test","status":"in_progress"}}',
      "",
      "event: response.output_text.delta",
      'data: {"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
      "",
      "event: response.completed",
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":3,"output_tokens":4,"total_tokens":7}}}',
      "",
    ].join("\n");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(rawStream, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      callLLMJson<{ ok: boolean }>(
        [{ role: "user", content: "Generate JSON." }],
        { maxTokens: 128 },
      ),
    ).resolves.toEqual({ ok: true });

    const [, primaryInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(primaryInit.body as string)).toMatchObject({
      model: "gpt-5.3-codex",
      stream: false,
    });
  });

  it("honors per-call retry and timeout overrides", async () => {
    process.env.LLM_RETRIES = "3";
    process.env.LLM_PROVIDER_COOLDOWN_MS = "0";
    delete process.env.FALLBACK_LLM_API_KEY;
    delete process.env.FALLBACK_LLM_BASE_URL;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("temporary provider failure", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(
      callLLMJson<{ ok: boolean }>(
        [{ role: "user", content: "Generate JSON." }],
        {
          maxTokens: 128,
          retryAttempts: 1,
          timeoutMs: 2500,
        },
      ),
    ).rejects.toThrow(/HTTP 502/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, primaryInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(primaryInit.signal).toBeInstanceOf(AbortSignal);
  });
});
