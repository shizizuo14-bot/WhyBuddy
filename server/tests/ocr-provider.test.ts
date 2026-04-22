import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/vision-provider.js", () => ({
  runVisionPrompt: vi.fn(),
}));

import { runVisionPrompt } from "../core/vision-provider.js";
import {
  parseOCRResponse,
  recognizeImageText,
  recognizeImagesText,
} from "../core/ocr-provider.js";

const mockRunVisionPrompt = vi.mocked(runVisionPrompt);

describe("parseOCRResponse", () => {
  it("parses fenced JSON payloads", () => {
    const raw = [
      "```json",
      '{"text":"Invoice #42","fragments":[{"text":"Invoice #42","page":1,"region":"top-left"}],"pages":[{"page":1,"text":"Invoice #42"}]}',
      "```",
    ].join("\n");

    const result = parseOCRResponse(raw);

    expect(result.text).toBe("Invoice #42");
    expect(result.fragments).toEqual([
      {
        text: "Invoice #42",
        page: 1,
        region: "top-left",
      },
    ]);
    expect(result.pages).toEqual([{ page: 1, text: "Invoice #42" }]);
  });

  it("falls back to line-based fragments when JSON is unavailable", () => {
    const raw = "Invoice #42\nTotal: $12.00";

    const result = parseOCRResponse(raw);

    expect(result.text).toBe(raw);
    expect(result.fragments).toEqual([
      { text: "Invoice #42", page: 1 },
      { text: "Total: $12.00", page: 1 },
    ]);
    expect(result.pages).toEqual([{ page: 1, text: raw }]);
  });
});

describe("recognizeImageText", () => {
  afterEach(() => {
    mockRunVisionPrompt.mockReset();
  });

  it("reuses the shared vision transport", async () => {
    mockRunVisionPrompt.mockResolvedValue(
      '{"text":"Receipt","fragments":[{"text":"Receipt","page":1,"region":"top"}],"pages":[{"page":1,"text":"Receipt"}]}'
    );

    const result = await recognizeImageText("data:image/png;base64,abc123");

    expect(mockRunVisionPrompt).toHaveBeenCalledOnce();
    expect(mockRunVisionPrompt.mock.calls[0][0]).toBe("data:image/png;base64,abc123");
    expect(result.text).toBe("Receipt");
    expect(result.fragments[0]?.region).toBe("top");
  });
});

describe("recognizeImagesText", () => {
  afterEach(() => {
    mockRunVisionPrompt.mockReset();
  });

  it("returns successful OCR results even if one image fails", async () => {
    mockRunVisionPrompt
      .mockResolvedValueOnce('{"text":"Page A","fragments":[{"text":"Page A","page":1}],"pages":[{"page":1,"text":"Page A"}]}')
      .mockRejectedValueOnce(new Error("vision timeout"));

    const result = await recognizeImagesText([
      { name: "a.png", base64DataUrl: "data:image/png;base64,a" },
      { name: "b.png", base64DataUrl: "data:image/png;base64,b" },
    ]);

    expect(result.size).toBe(1);
    expect(result.get("a.png")?.text).toBe("Page A");
    expect(result.has("b.png")).toBe(false);
  });
});
