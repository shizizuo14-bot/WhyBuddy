import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
  BlueprintGenerationStage,
  BlueprintGenerationStatus,
} from "../../../../../../shared/blueprint/index.js";
import { BlueprintEventName } from "../../../../../../shared/blueprint/index.js";

export function buildFixtureJob(
  overrides: Partial<BlueprintGenerationJob> & { id: string },
): BlueprintGenerationJob {
  const createdAt = overrides.createdAt ?? "2026-05-23T00:00:00.000Z";
  return {
    id: overrides.id,
    request: {
      intakeId: `intake-${overrides.id}`,
      clarificationSessionId: `clarification-${overrides.id}`,
      mode: "autopilot_route",
    },
    status: (overrides.status ?? "completed") as BlueprintGenerationStatus,
    stage: (overrides.stage ?? "spec_docs") as BlueprintGenerationStage,
    version: overrides.version ?? "v1",
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    artifacts: overrides.artifacts ?? [],
    events: overrides.events ?? [],
    parentJobId: overrides.parentJobId,
    branchedAt: overrides.branchedAt,
    branchedFromStage: overrides.branchedFromStage,
    staleArtifactIds: overrides.staleArtifactIds,
  };
}

export function buildFixtureEvent(
  overrides: Partial<BlueprintGenerationEvent> & {
    id: string;
    jobId: string;
    occurredAt: string;
    type?: BlueprintGenerationEvent["type"];
  },
): BlueprintGenerationEvent {
  return {
    id: overrides.id,
    jobId: overrides.jobId,
    type: overrides.type ?? BlueprintEventName.ReplanTriggered,
    family: overrides.family ?? "job",
    stage: (overrides.stage ?? "spec_docs") as BlueprintGenerationStage,
    status: (overrides.status ?? "completed") as BlueprintGenerationStatus,
    message: overrides.message ?? "event",
    occurredAt: overrides.occurredAt,
    payload: overrides.payload,
  };
}

export function buildFamilyOfOne(options?: {
  withInPlaceReplan?: boolean;
}): BlueprintGenerationJob[] {
  const root = buildFixtureJob({
    id: "job-root",
    events: options?.withInPlaceReplan
      ? [
          buildFixtureEvent({
            id: "event-in-place",
            jobId: "job-root",
            occurredAt: "2026-05-23T00:01:00.000Z",
            payload: {
              mode: "in_place",
              triggeredAt: "2026-05-23T00:01:00.000Z",
            },
          }),
        ]
      : [],
  });
  return [root];
}

export function buildParentPlusOne(): BlueprintGenerationJob[] {
  const root = buildFixtureJob({ id: "job-root" });
  const branch = buildFixtureJob({
    id: "job-branch-1",
    parentJobId: root.id,
    branchedAt: "2026-05-23T00:01:00.000Z",
    branchedFromStage: "spec_docs",
    events: [
      buildFixtureEvent({
        id: "event-branch-1",
        jobId: "job-branch-1",
        occurredAt: "2026-05-23T00:01:00.000Z",
        payload: {
          mode: "branch",
          parentJobId: root.id,
          triggeredAt: "2026-05-23T00:01:00.000Z",
        },
      }),
    ],
  });
  return [root, branch];
}

export function buildParentPlusN(count: number): BlueprintGenerationJob[] {
  const root = buildFixtureJob({ id: "job-root" });
  const branches = Array.from({ length: count }, (_, index) => {
    const minute = String(index + 1).padStart(2, "0");
    return buildFixtureJob({
      id: `job-branch-${index + 1}`,
      parentJobId: root.id,
      branchedAt: `2026-05-23T00:${minute}:00.000Z`,
      branchedFromStage: "spec_docs",
    });
  });
  return [root, ...branches];
}

export function buildDeepTree(depth: number): BlueprintGenerationJob[] {
  const jobs = [buildFixtureJob({ id: "job-root" })];
  for (let index = 1; index <= depth; index += 1) {
    const minute = String(index).padStart(2, "0");
    jobs.push(
      buildFixtureJob({
        id: `job-depth-${index}`,
        parentJobId: jobs[index - 1].id,
        branchedAt: `2026-05-23T00:${minute}:00.000Z`,
        branchedFromStage: "spec_docs",
      }),
    );
  }
  return jobs;
}

export function buildCyclicFamily(): BlueprintGenerationJob[] {
  return [
    buildFixtureJob({ id: "job-cycle-a", parentJobId: "job-cycle-b" }),
    buildFixtureJob({ id: "job-cycle-b", parentJobId: "job-cycle-a" }),
  ];
}
