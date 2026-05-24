import type { BlueprintGenerationJob } from "../../../../shared/blueprint/contracts.js";
import type { BlueprintJobStore } from "../job-store.js";

export function findJobsByIntakeId(
  jobStore: BlueprintJobStore,
  intakeId: string,
): BlueprintGenerationJob[] {
  return jobStore
    .list()
    .filter((job) => job.request.intakeId === intakeId);
}

export function findJobsByClarificationSessionId(
  jobStore: BlueprintJobStore,
  clarificationSessionId: string,
): BlueprintGenerationJob[] {
  return jobStore
    .list()
    .filter(
      (job) => job.request.clarificationSessionId === clarificationSessionId,
    );
}
