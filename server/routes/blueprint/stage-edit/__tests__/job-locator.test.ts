import { describe, expect, it } from "vitest";

import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../../job-store.js";
import {
  findJobsByClarificationSessionId,
  findJobsByIntakeId,
} from "../job-locator.js";

function buildJob(
  id: string,
  request: BlueprintGenerationJob["request"],
): BlueprintGenerationJob {
  return {
    id,
    request,
    status: "completed",
    stage: "engineering_landing",
    version: "v1",
    createdAt: `2026-05-23T00:00:0${id.slice(-1)}.000Z`,
    updatedAt: `2026-05-23T00:00:0${id.slice(-1)}.000Z`,
    artifacts: [],
    events: [],
  };
}

function buildStore(jobs: BlueprintGenerationJob[]): BlueprintJobStore {
  return {
    list: () => jobs,
    get: () => null,
    save: () => void 0,
    latest: () => jobs[0] ?? null,
  };
}

describe("job-locator", () => {
  it("finds every job linked to an intake id", () => {
    const matchingA = buildJob("job-1", { intakeId: "intake-a" });
    const matchingB = buildJob("job-2", { intakeId: "intake-a" });
    const unrelated = buildJob("job-3", { intakeId: "intake-b" });

    expect(findJobsByIntakeId(buildStore([matchingA, unrelated, matchingB]), "intake-a"))
      .toEqual([matchingA, matchingB]);
  });

  it("finds every job linked to a clarification session id", () => {
    const matchingA = buildJob("job-1", {
      clarificationSessionId: "session-a",
    });
    const matchingB = buildJob("job-2", {
      clarificationSessionId: "session-a",
    });
    const unrelated = buildJob("job-3", {
      clarificationSessionId: "session-b",
    });

    expect(
      findJobsByClarificationSessionId(
        buildStore([matchingA, unrelated, matchingB]),
        "session-a",
      ),
    ).toEqual([matchingA, matchingB]);
  });
});
