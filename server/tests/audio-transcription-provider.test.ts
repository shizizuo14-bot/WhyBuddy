import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("audio-transcription-provider", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses dedicated STT service when STT_API_URL and STT_API_KEY are set", async () => {
    vi.stubEnv("STT_API_URL", "https://stt.example.com/v1/audio/transcriptions");
    vi.stubEnv("STT_API_KEY", "stt-key-123");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "Hello from STT" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import(
      "../core/audio-transcription-provider.js"
    );

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer, "audio/webm");

    expect(result.transcript).toBe("Hello from STT");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://stt.example.com/v1/audio/transcriptions");
  });

  it("falls back to Whisper-compatible endpoint when only LLM_API_KEY is set", async () => {
    vi.stubEnv("STT_API_URL", "");
    vi.stubEnv("STT_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "llm-key-456");
    vi.stubEnv("LLM_BASE_URL", "https://api.openai.com/v1");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "Hello from Whisper" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import(
      "../core/audio-transcription-provider.js"
    );

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer, "audio/mpeg");

    expect(result.transcript).toBe("Hello from Whisper");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
  });

  it("throws descriptive error when no STT or LLM provider is configured", async () => {
    vi.stubEnv("STT_API_URL", "");
    vi.stubEnv("STT_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_BASE_URL", "");

    const { transcribeAudio } = await import(
      "../core/audio-transcription-provider.js"
    );

    const buffer = Buffer.from("fake-audio-data");
    await expect(transcribeAudio(buffer)).rejects.toThrow(
      /Audio transcription unavailable/,
    );
  });

  it("throws when Whisper endpoint returns non-ok response", async () => {
    vi.stubEnv("STT_API_URL", "");
    vi.stubEnv("STT_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "llm-key-789");
    vi.stubEnv("LLM_BASE_URL", "https://api.example.com/v1");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import(
      "../core/audio-transcription-provider.js"
    );

    const buffer = Buffer.from("fake-audio-data");
    await expect(transcribeAudio(buffer, "audio/webm")).rejects.toThrow(
      /Whisper transcription failed \(401\)/,
    );
  });

  it("uses correct file extension for different mime types", async () => {
    vi.stubEnv("STT_API_URL", "");
    vi.stubEnv("STT_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "llm-key");
    vi.stubEnv("LLM_BASE_URL", "https://api.example.com/v1");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "transcribed" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import(
      "../core/audio-transcription-provider.js"
    );

    await transcribeAudio(Buffer.from("data"), "audio/wav");

    const formData = mockFetch.mock.calls[0][1].body as FormData;
    const file = formData.get("file") as File;
    expect(file.name).toBe("audio.wav");
  });
});
