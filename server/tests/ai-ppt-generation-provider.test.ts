import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../core/llm-client.js", () => ({
  callLLMJson: vi.fn(),
}));

import { callLLMJson } from "../core/llm-client.js";
import { generateDeckViaLLM } from "../core/ai-ppt-generation-provider.js";

const mockCallLLMJson = vi.mocked(callLLMJson);

describe("ai-ppt-generation-provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a deck with correct structure from LLM response", async () => {
    mockCallLLMJson.mockResolvedValue({
      title: "Quarterly Review",
      summary: "A review of Q1 performance",
      slides: [
        {
          title: "Overview",
          bullets: ["Revenue up 20%", "New customers: 150", "Churn reduced"],
          speakerNotes: "Start with highlights",
        },
        {
          title: "Revenue Details",
          bullets: ["Product A: $2M", "Product B: $1.5M"],
        },
        {
          title: "Customer Growth",
          bullets: ["150 new customers", "Enterprise segment grew 30%", "SMB stable"],
        },
        {
          title: "Challenges",
          bullets: ["Supply chain delays", "Hiring slower than planned"],
        },
        {
          title: "Next Steps",
          bullets: ["Expand team", "Launch Product C", "Improve retention"],
        },
      ],
    });

    const result = await generateDeckViaLLM({
      topic: "Quarterly Review",
      slideCount: 5,
    });

    expect(result.title).toBe("Quarterly Review");
    expect(result.summary).toBe("A review of Q1 performance");
    expect(result.slides).toHaveLength(5);
    expect(result.slides[0].slideNumber).toBe(1);
    expect(result.slides[0].title).toBe("Overview");
    expect(result.slides[0].bullets).toContain("Revenue up 20%");
    expect(result.slides[0].speakerNotes).toBe("Start with highlights");
    expect(result.slides[4].title).toBe("Next Steps");
  });

  it("pads slides when LLM returns fewer than requested", async () => {
    mockCallLLMJson.mockResolvedValue({
      title: "Short Deck",
      summary: "Only 2 slides returned",
      slides: [
        { title: "Intro", bullets: ["Point A"] },
        { title: "End", bullets: ["Point B"] },
      ],
    });

    const result = await generateDeckViaLLM({
      topic: "Short Deck",
      slideCount: 4,
    });

    expect(result.slides).toHaveLength(4);
    expect(result.slides[0].title).toBe("Intro");
    expect(result.slides[1].title).toBe("End");
    expect(result.slides[2].slideNumber).toBe(3);
    expect(result.slides[3].slideNumber).toBe(4);
  });

  it("handles missing title/summary gracefully", async () => {
    mockCallLLMJson.mockResolvedValue({
      slides: [
        { title: "Slide 1", bullets: ["A", "B"] },
        { title: "Slide 2", bullets: ["C"] },
        { title: "Slide 3", bullets: ["D", "E", "F"] },
      ],
    });

    const result = await generateDeckViaLLM({
      topic: "My Topic",
      slideCount: 3,
    });

    expect(result.title).toBe("My Topic");
    expect(result.summary).toBe("A presentation about My Topic.");
    expect(result.slides).toHaveLength(3);
  });

  it("filters non-string bullets", async () => {
    mockCallLLMJson.mockResolvedValue({
      title: "Test",
      summary: "Test summary",
      slides: [
        { title: "S1", bullets: ["valid", 123, null, "also valid", ""] },
        { title: "S2", bullets: ["ok"] },
        { title: "S3", bullets: ["fine"] },
      ],
    });

    const result = await generateDeckViaLLM({
      topic: "Test",
      slideCount: 3,
    });

    expect(result.slides[0].bullets).toEqual(["valid", "also valid"]);
  });

  it("throws when LLM call fails", async () => {
    mockCallLLMJson.mockRejectedValue(new Error("LLM unavailable"));

    await expect(
      generateDeckViaLLM({ topic: "Fail", slideCount: 3 }),
    ).rejects.toThrow("LLM unavailable");
  });

  it("includes audience and locale in prompt", async () => {
    mockCallLLMJson.mockResolvedValue({
      title: "For Executives",
      summary: "Executive summary",
      slides: [
        { title: "S1", bullets: ["A"] },
        { title: "S2", bullets: ["B"] },
        { title: "S3", bullets: ["C"] },
      ],
    });

    await generateDeckViaLLM({
      topic: "Strategy",
      audience: "C-level executives",
      locale: "zh-CN",
      slideCount: 3,
    });

    const [messages] = mockCallLLMJson.mock.calls[0];
    const userMessage = messages[1].content as string;
    expect(userMessage).toContain("C-level executives");
    expect(userMessage).toContain("zh-CN");
  });

  it("uses brief as topic fallback", async () => {
    mockCallLLMJson.mockResolvedValue({
      title: "Brief-based",
      summary: "From brief",
      slides: [
        { title: "S1", bullets: ["A"] },
        { title: "S2", bullets: ["B"] },
        { title: "S3", bullets: ["C"] },
      ],
    });

    const result = await generateDeckViaLLM({
      brief: "A brief about AI trends",
      slideCount: 3,
    });

    expect(result.title).toBe("Brief-based");
    const [messages] = mockCallLLMJson.mock.calls[0];
    const userMessage = messages[1].content as string;
    expect(userMessage).toContain("A brief about AI trends");
  });

  it("truncates slides array to slideCount", async () => {
    mockCallLLMJson.mockResolvedValue({
      title: "Too Many",
      summary: "LLM returned too many slides",
      slides: Array.from({ length: 10 }, (_, i) => ({
        title: `Slide ${i + 1}`,
        bullets: [`Point ${i + 1}`],
      })),
    });

    const result = await generateDeckViaLLM({
      topic: "Too Many",
      slideCount: 5,
    });

    expect(result.slides).toHaveLength(5);
  });
});
