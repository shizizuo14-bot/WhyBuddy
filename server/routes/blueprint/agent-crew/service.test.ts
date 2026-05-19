import { describe, expect, it } from "vitest";

import type {
  BlueprintAgentCrew,
  BlueprintCapabilityEvidence,
  BlueprintCapabilityInvocation,
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintRuntimeCapability,
} from "../../../../shared/blueprint/index.js";
import { createMemoryBlueprintJobStore } from "../../blueprint.js";

import { buildBlueprintServiceContext } from "../context.js";
import { createAgentCrewService } from "./service.js";

function makeJob(id: string, artifacts: BlueprintGenerationArtifact[]): BlueprintGenerationJob {
  return {
    id,
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

describe("createAgentCrewService (shell)", () => {
  it("getCrew 取最新 agent_crew artifact 的 payload", () => {
    const crew = { id: "crew-1" } as BlueprintAgentCrew;
    const job = makeJob("job-1", [
      artifact("a-1", "agent_crew", crew),
      artifact("a-2", "agent_crew", { id: "crew-2" }),
    ]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createAgentCrewService(ctx);
    expect(service.getCrew("job-1")?.id).toBe("crew-2");
    expect(service.getCrew("missing")).toBeNull();
  });

  it("listCapabilities 取 capability_registry 的 capabilities 数组", () => {
    const capability = { id: "cap-1" } as BlueprintRuntimeCapability;
    const job = makeJob("job-1", [
      artifact("a-1", "capability_registry", { capabilities: [capability] }),
    ]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createAgentCrewService(ctx);
    expect(service.listCapabilities("job-1")).toEqual([capability]);
    expect(service.listCapabilities("missing")).toEqual([]);
  });

  it("listInvocations / listEvidence 聚合所有同类型 artifact payload", () => {
    const inv1 = { id: "inv-1" } as BlueprintCapabilityInvocation;
    const inv2 = { id: "inv-2" } as BlueprintCapabilityInvocation;
    const ev = { id: "ev-1" } as BlueprintCapabilityEvidence;
    const job = makeJob("job-1", [
      artifact("a-1", "capability_invocation", inv1),
      artifact("a-2", "capability_invocation", inv2),
      artifact("a-3", "capability_evidence", ev),
    ]);
    const jobStore = createMemoryBlueprintJobStore([job]);
    const ctx = buildBlueprintServiceContext({ jobStore });
    const service = createAgentCrewService(ctx);
    expect(service.listInvocations("job-1").map(inv => inv.id)).toEqual([
      "inv-1",
      "inv-2",
    ]);
    expect(service.listEvidence("job-1").map(e => e.id)).toEqual(["ev-1"]);
  });
});
