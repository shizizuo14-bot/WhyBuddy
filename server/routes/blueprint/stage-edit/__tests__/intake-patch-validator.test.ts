import { describe, expect, it } from "vitest";

import { validateIntakePatch } from "../intake-patch-validator.js";

describe("validateIntakePatch", () => {
  it("accepts partial targetText, githubUrls, and reason fields", () => {
    expect(
      validateIntakePatch({
        targetText: "Updated target",
        githubUrls: ["https://github.com/example/repo"],
        reason: "corrected upstream target",
      }),
    ).toEqual({
      ok: true,
      value: {
        targetText: "Updated target",
        githubUrls: ["https://github.com/example/repo"],
        reason: "corrected upstream target",
      },
    });
  });

  it("rejects malformed field types and overlong reason text", () => {
    expect(validateIntakePatch(null)).toEqual({
      ok: false,
      error: "invalid_intake_patch",
      message: "Request body must be an object.",
    });
    expect(validateIntakePatch({ targetText: 123 })).toEqual({
      ok: false,
      error: "invalid_intake_patch",
      message: "targetText must be a string when provided.",
    });
    expect(validateIntakePatch({ githubUrls: ["ok", 123] })).toEqual({
      ok: false,
      error: "invalid_intake_patch",
      message: "githubUrls must be an array of strings when provided.",
    });
    expect(validateIntakePatch({ reason: "x".repeat(1025) })).toEqual({
      ok: false,
      error: "invalid_intake_patch",
      message: "reason must be 1024 characters or fewer.",
    });
  });
});
