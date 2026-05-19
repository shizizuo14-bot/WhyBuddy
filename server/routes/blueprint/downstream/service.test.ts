import { describe, expect, it } from "vitest";

import type {
  BlueprintEffectPreview,
  BlueprintEngineeringLandingPlan,
  BlueprintEngineeringRun,
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintImplementationPromptPackage,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import { createDownstreamService } from "./service.js";

function makeJob(artifacts: BlueprintGenerationArtifact[]): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: {},
    status: "pending",
    stage: "input",
    version: "v1",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    artifacts,
    events: [],
  };
}

function artifact(
  id: string,
  type: BlueprintGenerationArtifact["type"],
  payload: unknown
): BlueprintGenerationArtifact {
  return {
    id,
    type,
    title: id,
    summary: "",
    createdAt: "2026-05-07T00:00:00.000Z",
    payload,
  };
}

describe("createDownstreamService (shell)", () => {
  it("各 list 方法按 artifact type 过滤", () => {
    const preview = { id: "p-1" } as BlueprintEffectPreview;
    const pack = { id: "pp-1" } as BlueprintImplementationPromptPackage;
    const plan = { id: "lp-1" } as BlueprintEngineeringLandingPlan;
    const run = { id: "run-1" } as BlueprintEngineeringRun;
    const job = makeJob([
      artifact("a-1", "effect_preview", preview),
      artifact("a-2", "prompt_pack", pack),
      artifact("a-3", "engineering_plan", plan),
      artifact("a-4", "engineering_run", run),
    ]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createDownstreamService(ctx);
    expect(service.listEffectPreviews("job-1").map(p => p.id)).toEqual(["p-1"]);
    expect(service.listPromptPackages("job-1").map(p => p.id)).toEqual(["pp-1"]);
    expect(service.listLandingPlans("job-1").map(p => p.id)).toEqual(["lp-1"]);
    expect(service.listEngineeringRuns("job-1").map(r => r.id)).toEqual(["run-1"]);
  });

  it("未知 jobId 返回空数组", () => {
    const jobStore = createMemoryBlueprintJobStore();
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createDownstreamService(ctx);
    expect(service.listEffectPreviews("missing")).toEqual([]);
    expect(service.listPromptPackages("missing")).toEqual([]);
    expect(service.listLandingPlans("missing")).toEqual([]);
    expect(service.listEngineeringRuns("missing")).toEqual([]);
  });
});
