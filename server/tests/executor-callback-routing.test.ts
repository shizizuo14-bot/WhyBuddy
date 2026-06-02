import { describe, expect, it } from "vitest";

import { isBlueprintExecutorMissionId } from "../core/executor-callback-routing.js";

describe("executor callback routing", () => {
  it("accepts both blueprint callback mission id formats", () => {
    expect(isBlueprintExecutorMissionId("blueprint:job-real")).toBe(true);
    expect(
      isBlueprintExecutorMissionId(
        "blueprint-job-2de22800-3b5f-403e-9089-5949cf0271f8",
      ),
    ).toBe(true);
  });

  it("does not classify regular mission ids as blueprint callbacks", () => {
    expect(isBlueprintExecutorMissionId("mission_mnw0brh6_gs7jnj")).toBe(false);
    expect(isBlueprintExecutorMissionId("")).toBe(false);
  });
});
