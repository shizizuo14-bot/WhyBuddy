import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { BlueprintGenerationJob } from "../../../../../shared/blueprint/contracts.js";
import { getTransitiveDownstreamStages } from "../../staleness/dependency-graph.js";
import { runAutoInvalidationHook } from "../auto-invalidation-hook.js";
import { isClarificationAnswersNoop } from "../clarification-noop-detector.js";
import {
  buildFixtureClarificationAnswers,
  buildFixtureClarificationSession,
  buildJobLinkedToIntakeAndSession,
} from "./__fixtures__/build-fixture-job.js";
import { clarificationAnswersArb, staleFreshStagesArb } from "./__fixtures__/arbitraries.js";

const NUM_RUNS = 100;

function buildLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function buildJobStore(job: BlueprintGenerationJob) {
  return {
    list: vi.fn(() => [job]),
    get: vi.fn(() => job),
    save: vi.fn(),
    latest: vi.fn(() => job),
  };
}

function invalidateClarification(job: BlueprintGenerationJob) {
  return runAutoInvalidationHook({
    job,
    fromStage: "clarification",
    reason: "upstream_clarification_changed",
    triggeringEndpoint: "clarification_answers",
    triggeringArtifactId: "artifact-clarification",
    triggeringArtifactType: "clarification_session",
    jobStore: buildJobStore(job),
    ctx: {
      logger: buildLogger(),
      now: () => new Date("2026-05-23T02:00:00.000Z"),
    },
  });
}

describe("clarification modify invalidation properties", () => {
  it("marks every fresh downstream artifact stale from clarification", () => {
    fc.assert(
      fc.property(staleFreshStagesArb, (staleStages) => {
        const job = buildJobLinkedToIntakeAndSession({ staleStages });
        const result = invalidateClarification(job);
        const downstreamStages = new Set(
          getTransitiveDownstreamStages("clarification"),
        );

        for (const artifact of result.job.artifacts) {
          const stage = artifact.id.replace("artifact-", "");
          if (downstreamStages.has(stage as any)) {
            expect(result.job.staleArtifactIds).toContain(artifact.id);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("treats repeated equivalent answers as no-op and preserves stale state", () => {
    fc.assert(
      fc.property(clarificationAnswersArb, (answers) => {
        const session = buildFixtureClarificationSession({ answers });
        const next = answers.map((answer) => ({ ...answer }));
        const job = buildJobLinkedToIntakeAndSession();
        const first = invalidateClarification(job);
        const beforeMarkers = first.job.staleArtifactIds;

        expect(isClarificationAnswersNoop(session.answers, next)).toBe(true);
        expect(first.job.staleArtifactIds).toEqual(beforeMarkers);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("is idempotent for the same clarification edit applied twice", () => {
    fc.assert(
      fc.property(staleFreshStagesArb, (staleStages) => {
        const job = buildJobLinkedToIntakeAndSession({ staleStages });
        const first = invalidateClarification(job);
        const second = invalidateClarification(first.job);

        expect(second.newlyStaleArtifactIds).toEqual([]);
        expect(second.job.staleArtifactIds).toEqual(first.job.staleArtifactIds);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("detects changed answer values against the previous question ids", () => {
    const previous = buildFixtureClarificationAnswers(["old", "same"]);
    const next = [
      { ...previous[0], answer: "new" },
      { ...previous[1] },
    ];

    expect(isClarificationAnswersNoop(previous, next)).toBe(false);
  });
});
