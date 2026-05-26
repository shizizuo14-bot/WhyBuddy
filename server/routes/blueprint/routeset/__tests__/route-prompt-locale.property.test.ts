/**
 * autopilot-i18n-consistency — Property test for prompt builder locale.
 *
 * Property 8 from the design document.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { buildRouteSetPrompt } from "../route-prompt";

/**
 * Detect whether a string contains Chinese characters (CJK Unified Ideographs).
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

describe("buildRouteSetPrompt locale property tests", () => {
  const minimalRequest = {
    targetText: "Build a permission system",
    githubUrls: ["https://github.com/example/repo"],
  };

  it("Property 8: Prompt builder locale determines system message language — for zh-CN, systemMessage contains Chinese characters", () => {
    fc.assert(
      fc.property(
        fc.constant("zh-CN" as const),
        (locale) => {
          const result = buildRouteSetPrompt({
            request: minimalRequest,
            locale,
          });
          expect(containsChinese(result.systemMessage)).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("Property 8: Prompt builder locale determines system message language — for en-US, systemMessage does NOT contain Chinese characters and starts with English prefix", () => {
    fc.assert(
      fc.property(
        fc.constant("en-US" as const),
        (locale) => {
          const result = buildRouteSetPrompt({
            request: minimalRequest,
            locale,
          });
          expect(containsChinese(result.systemMessage)).toBe(false);
          expect(result.systemMessage.startsWith("You are the /autopilot RouteSet planner")).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("Property 8 extended: locale defaults to en-US when not provided", () => {
    const result = buildRouteSetPrompt({
      request: minimalRequest,
    });
    expect(containsChinese(result.systemMessage)).toBe(false);
    expect(result.systemMessage.startsWith("You are the /autopilot RouteSet planner")).toBe(true);
  });

  it("Property 8 extended: zh-CN system message instructs LLM to use Chinese for title/summary/rationale", () => {
    const result = buildRouteSetPrompt({
      request: minimalRequest,
      locale: "zh-CN",
    });
    // The Chinese system message should mention writing in Chinese
    expect(result.systemMessage).toContain("中文");
  });
});
