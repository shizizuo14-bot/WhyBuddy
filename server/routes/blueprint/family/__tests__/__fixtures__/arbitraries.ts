import * as fc from "fast-check";

import type { BlueprintGenerationJob } from "../../../../../../shared/blueprint/index.js";
import { BlueprintEventName } from "../../../../../../shared/blueprint/index.js";
import { buildFixtureEvent, buildFixtureJob } from "./build-fixture-family.js";

export interface FamilyArbitraryCase {
  jobs: BlueprintGenerationJob[];
  startJobId: string;
  rootJobId: string;
}

export const familyCaseArbitrary: fc.Arbitrary<FamilyArbitraryCase> = fc
  .record({
    branchCount: fc.integer({ min: 0, max: 20 }),
    parentHints: fc.array(fc.nat(), { minLength: 0, maxLength: 20 }),
    startHint: fc.nat(),
    replanHints: fc.array(fc.boolean(), { minLength: 0, maxLength: 21 }),
    noiseHints: fc.array(fc.boolean(), { minLength: 0, maxLength: 21 }),
  })
  .map(({ branchCount, parentHints, startHint, replanHints, noiseHints }) => {
    const jobs: BlueprintGenerationJob[] = [
      buildFixtureJob({
        id: "job-root",
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
    ];

    for (let index = 0; index < branchCount; index += 1) {
      const parent = jobs[(parentHints[index] ?? 0) % jobs.length];
      const sequence = index + 1;
      const minute = String(sequence % 60).padStart(2, "0");
      const hour = String(Math.floor(sequence / 60)).padStart(2, "0");
      const jobId = `job-${sequence}`;
      const events = [];

      if (replanHints[index]) {
        events.push(
          buildFixtureEvent({
            id: `event-replan-${sequence}`,
            jobId,
            occurredAt: `2026-05-23T${hour}:${minute}:00.000Z`,
            payload: {
              mode: sequence % 2 === 0 ? "in_place" : "branch",
              parentJobId: parent.id,
              triggeredAt: `2026-05-23T${hour}:${minute}:00.000Z`,
            },
          }),
        );
      }

      if (noiseHints[index]) {
        events.push(
          buildFixtureEvent({
            id: `event-noise-${sequence}`,
            jobId,
            type: BlueprintEventName.JobCreated,
            occurredAt: `2026-05-23T${hour}:${minute}:30.000Z`,
          }),
        );
      }

      jobs.push(
        buildFixtureJob({
          id: jobId,
          parentJobId: parent.id,
          branchedAt: `2026-05-23T${hour}:${minute}:00.000Z`,
          branchedFromStage: "spec_docs",
          createdAt: `2026-05-23T${hour}:${minute}:00.000Z`,
          events,
        }),
      );
    }

    const startJob = jobs[startHint % jobs.length];
    return {
      jobs,
      startJobId: startJob.id,
      rootJobId: "job-root",
    };
  });
