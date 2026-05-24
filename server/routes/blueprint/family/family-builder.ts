import type {
  BlueprintFamilyResponse,
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/index.js";
import { BlueprintEventName } from "../../../../shared/blueprint/index.js";

const MAX_PARENT_CHAIN_DEPTH = 1024;

export type FamilyBuilderResult =
  | { kind: "ok"; response: BlueprintFamilyResponse }
  | { kind: "cycle"; offendingJobId: string; chainSummary: string };

type RootLookupResult =
  | { kind: "ok"; root: BlueprintGenerationJob }
  | Extract<FamilyBuilderResult, { kind: "cycle" }>;

export function buildFamilyFromJobStore(
  allJobs: readonly BlueprintGenerationJob[],
  startJobId: string,
): FamilyBuilderResult {
  const byId = new Map<string, BlueprintGenerationJob>();
  for (const job of allJobs) {
    byId.set(job.id, job);
  }

  const startJob = byId.get(startJobId);
  if (!startJob) {
    return {
      kind: "cycle",
      offendingJobId: startJobId,
      chainSummary: "(missing)",
    };
  }

  const rootResult = findRoot(byId, startJob);
  if (rootResult.kind === "cycle") {
    return rootResult;
  }

  const root = rootResult.root;
  const familyJobs = collectDescendants(allJobs, root);
  const jobs = orderFamilyJobs(familyJobs, root.id);
  const replanEvents = collectReplanEvents(jobs);

  return {
    kind: "ok",
    response: {
      rootJobId: root.id,
      jobs,
      replanEvents,
    },
  };
}

function findRoot(
  byId: ReadonlyMap<string, BlueprintGenerationJob>,
  startJob: BlueprintGenerationJob,
): RootLookupResult {
  const visitedParentIds = new Set<string>();
  const ascentChain: string[] = [];
  let cursor: BlueprintGenerationJob | undefined = startJob;
  let depth = 0;

  while (cursor.parentJobId !== undefined) {
    ascentChain.push(cursor.id);
    if (visitedParentIds.has(cursor.parentJobId)) {
      return {
        kind: "cycle",
        offendingJobId: cursor.parentJobId,
        chainSummary: ascentChain.concat(cursor.parentJobId).join("->"),
      };
    }

    visitedParentIds.add(cursor.parentJobId);
    depth += 1;
    if (depth > MAX_PARENT_CHAIN_DEPTH) {
      return {
        kind: "cycle",
        offendingJobId: cursor.parentJobId,
        chainSummary: `${ascentChain.slice(0, 8).join("->")}->...`,
      };
    }

    const parentJobId = cursor.parentJobId;
    cursor = byId.get(parentJobId);
    if (!cursor) {
      return {
        kind: "cycle",
        offendingJobId: startJob.id,
        chainSummary: `${ascentChain.join("->")}->(missing-parent:${parentJobId})`,
      };
    }
  }

  return { kind: "ok", root: cursor };
}

function collectDescendants(
  allJobs: readonly BlueprintGenerationJob[],
  root: BlueprintGenerationJob,
): Map<string, BlueprintGenerationJob> {
  const familyJobs = new Map<string, BlueprintGenerationJob>();
  const queue = [root.id];
  familyJobs.set(root.id, root);

  for (let index = 0; index < queue.length; index += 1) {
    const parentId = queue[index];
    const children = allJobs
      .filter((job) => job.parentJobId === parentId)
      .sort(compareBranchTimeThenId);
    for (const child of children) {
      if (!familyJobs.has(child.id)) {
        familyJobs.set(child.id, child);
        queue.push(child.id);
      }
    }
  }

  return familyJobs;
}

function orderFamilyJobs(
  familyJobs: ReadonlyMap<string, BlueprintGenerationJob>,
  rootJobId: string,
): BlueprintGenerationJob[] {
  const root = familyJobs.get(rootJobId);
  if (!root) {
    return [];
  }

  const branchJobs = [...familyJobs.values()]
    .filter((job) => job.id !== rootJobId)
    .sort(compareBranchTimeThenId);

  return [root, ...branchJobs];
}

function collectReplanEvents(
  jobs: readonly BlueprintGenerationJob[],
): BlueprintGenerationEvent[] {
  return jobs
    .flatMap((job) => job.events)
    .filter((event) => event.type === BlueprintEventName.ReplanTriggered)
    .sort((left, right) => {
      const occurredComparison = left.occurredAt.localeCompare(right.occurredAt);
      if (occurredComparison !== 0) {
        return occurredComparison;
      }
      return left.jobId.localeCompare(right.jobId);
    });
}

function compareBranchTimeThenId(
  left: BlueprintGenerationJob,
  right: BlueprintGenerationJob,
): number {
  const timeComparison = (left.branchedAt ?? left.createdAt).localeCompare(
    right.branchedAt ?? right.createdAt,
  );
  if (timeComparison !== 0) {
    return timeComparison;
  }
  return left.id.localeCompare(right.id);
}
