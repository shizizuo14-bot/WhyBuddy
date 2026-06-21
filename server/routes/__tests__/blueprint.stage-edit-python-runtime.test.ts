import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BlueprintGenerationArtifact,
  BlueprintGenerationJob,
  BlueprintIntake,
} from "../../../shared/blueprint/contracts.js";
import {
  applyBlueprintStageEditWithPythonRuntime,
  BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
  previewBlueprintStageEditWithPythonRuntime,
  validateBlueprintStageEditWithPythonRuntime,
} from "../blueprint/stage-edit-python-runtime.js";

const FIXED_NOW = "2026-06-20T00:00:00.000Z";

function makeIntake(overrides: Partial<BlueprintIntake> = {}): BlueprintIntake {
  return {
    id: "intake-1",
    targetText: "Original target",
    githubUrls: ["https://github.com/example/original"],
    sources: [],
    duplicateGithubUrls: [],
    domainNotes: [],
    assets: [],
    evidence: [],
    readiness: {
      status: "ready",
      score: 1,
      answeredRequired: 0,
      requiredTotal: 0,
      missingQuestionIds: [],
    },
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeArtifact(
  id: string,
  type: BlueprintGenerationArtifact["type"],
  overrides: Partial<BlueprintGenerationArtifact> = {},
): BlueprintGenerationArtifact {
  return {
    id,
    type,
    title: id,
    summary: id,
    createdAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeJob(
  overrides: Partial<BlueprintGenerationJob> = {},
): BlueprintGenerationJob {
  return {
    id: "job-1",
    request: {
      intakeId: "intake-1",
      targetText: "Original target",
      githubUrls: ["https://github.com/example/original"],
    },
    status: "completed",
    stage: "engineering_landing",
    version: "v1",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    artifacts: [
      makeArtifact("artifact-input", "intake", { payload: makeIntake() }),
      makeArtifact("artifact-route", "route_set"),
      makeArtifact("artifact-spec", "requirements"),
    ],
    events: [{ id: "node-owned-event" } as BlueprintGenerationJob["events"][number]],
    staleArtifactIds: [],
    stageState: { current: { status: "node-owned" } } as BlueprintGenerationJob["stageState"],
    nextAction: { type: "none" } as BlueprintGenerationJob["nextAction"],
    checksLedger: [{ id: "ledger-node-owned" } as BlueprintGenerationJob["checksLedger"][number]],
    ...overrides,
  };
}

function runtimeSuccess(operation: "validate" | "preview" | "apply") {
  return {
    ok: true,
    operation,
    contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
    runtime: {
      owner: "python",
      mode: "runtime_bridge",
      selectedStage: "input",
      stateAuthority: "node",
      persistenceOwner: "node",
      invalidationOwner: "node",
      jobStoreOwner: "node",
      stateMutation: "none",
    },
    validation: {
      accepted: true,
      patch: { targetText: "Updated target" },
    },
    decision: {
      contractVersion: "blueprint.stage-edit.proxy.v1",
      kind: "blueprint.stage_edit.preview",
      ok: true,
      outcome: "accepted",
      status: 200,
      preview: {
        stateAuthority: "node",
        persistenceOwner: "node",
        stateMutation: "none",
        appliesMutation: false,
      },
      intake: makeIntake({ targetText: "Updated target", updatedAt: FIXED_NOW }),
      jobs: [],
    },
    apply: {
      accepted: false,
      reason: "node_state_owner",
      message: "Blueprint stage edits are evaluated by Python but applied by Node.",
      requestedPatch: { targetText: "Updated target" },
    },
    provenance: "python-blueprint-stage-edit-runtime",
  };
}

describe("Blueprint stage edit Python runtime bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delegates preview to Python with a bounded Node-owned snapshot", async () => {
    vi.stubEnv("BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-blueprint.test/");
    vi.stubEnv("PYTHON_SLIDE_RULE_INTERNAL_KEY", "internal-test");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(runtimeSuccess("preview")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const job = makeJob();

    const result = await previewBlueprintStageEditWithPythonRuntime({
      selectedStage: "input",
      intakeId: "intake-1",
      intake: makeIntake(),
      patch: { targetText: "Updated target" },
      jobs: [job],
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.operation).toBe("preview");
    expect(result.runtime.owner).toBe("python");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "http://python-blueprint.test/api/blueprint/stage-edit/runtime/preview",
    );
    expect((fetchSpy.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Internal-Key": "internal-test",
    });

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      operation: "preview",
      selectedStage: "input",
      intakeId: "intake-1",
      patch: { targetText: "Updated target" },
      nodeControl: {
        stateAuthority: "node",
        persistenceOwner: "node",
        invalidationOwner: "node",
        jobStoreOwner: "node",
      },
    });
    expect(body.jobs[0].id).toBe("job-1");
    expect(body.jobs[0].events).toBeUndefined();
    expect(body.jobs[0].stageState).toBeUndefined();
    expect(body.jobs[0].nextAction).toBeUndefined();
    expect(body.jobs[0].checksLedger).toBeUndefined();
  });

  it("falls back to local non-mutating projection when Python mode is disabled", async () => {
    vi.stubEnv("BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME", "false");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await previewBlueprintStageEditWithPythonRuntime({
      selectedStage: "input",
      intakeId: "intake-1",
      intake: makeIntake(),
      patch: { targetText: "Updated target" },
      jobs: [makeJob()],
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.runtime.owner).toBe("node");
    expect(result.runtime.mode).toBe("local_fallback");
    expect(result.decision?.outcome).toBe("accepted");
    expect(result.decision?.preview.stateMutation).toBe("none");
    expect(result.apply.accepted).toBe(false);
    expect(result.apply.reason).toBe("node_state_owner");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps apply as an audit envelope so Python cannot bypass Node invalidation", async () => {
    vi.stubEnv("BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME", "false");
    const job = makeJob();

    const result = await applyBlueprintStageEditWithPythonRuntime({
      selectedStage: "input",
      intakeId: "intake-1",
      intake: makeIntake(),
      patch: { targetText: "Updated target" },
      jobs: [job],
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.operation).toBe("apply");
    expect(result.decision?.outcome).toBe("accepted");
    expect(result.apply).toEqual({
      accepted: false,
      reason: "node_state_owner",
      message: "Blueprint stage edits are evaluated by Python but applied by Node.",
      requestedPatch: { targetText: "Updated target" },
    });
    expect(job.artifacts[1].staleSince).toBeUndefined();
    expect(job.staleArtifactIds).toEqual([]);
  });

  it("does not report stale selected-stage edits as success", async () => {
    vi.stubEnv("BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME", "false");

    const result = await previewBlueprintStageEditWithPythonRuntime({
      selectedStage: "input",
      selectedStageState: {
        stage: "input",
        stale: true,
        staleSince: "2026-06-19T23:00:00.000Z",
      },
      intakeId: "intake-1",
      intake: makeIntake(),
      patch: { targetText: "Updated target" },
      jobs: [makeJob()],
      now: () => FIXED_NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      operation: "preview",
      error: "selected_stage_stale",
      statusCode: 409,
      provenance: "node-blueprint-stage-edit-python-runtime",
    });
    expect(result.decision?.outcome).toBe("stale");
    expect(result.apply.accepted).toBe(false);
  });

  it("preserves Python conflict envelopes instead of converting them to success", async () => {
    vi.stubEnv("BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-blueprint.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          operation: "preview",
          contractVersion: BLUEPRINT_STAGE_EDIT_RUNTIME_CONTRACT_VERSION,
          runtime: {
            owner: "python",
            mode: "runtime_bridge",
            selectedStage: "input",
            stateAuthority: "node",
            persistenceOwner: "node",
            invalidationOwner: "node",
            jobStoreOwner: "node",
            stateMutation: "none",
          },
          decision: {
            contractVersion: "blueprint.stage-edit.proxy.v1",
            kind: "blueprint.stage_edit.preview",
            ok: false,
            outcome: "conflict",
            status: 409,
            preview: {
              stateAuthority: "node",
              persistenceOwner: "node",
              stateMutation: "none",
              appliesMutation: false,
            },
            error: "downstream_running",
            runningStage: "spec_tree",
          },
          apply: {
            accepted: false,
            reason: "node_state_owner",
            message: "Blueprint stage edits are evaluated by Python but applied by Node.",
          },
          error: "downstream_running",
          reason: "stage_edit_conflict",
          message: "A downstream Blueprint stage is still running.",
          statusCode: 409,
          provenance: "python-blueprint-stage-edit-runtime",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await previewBlueprintStageEditWithPythonRuntime({
      selectedStage: "input",
      intakeId: "intake-1",
      intake: makeIntake(),
      patch: { targetText: "Updated target" },
      jobs: [makeJob()],
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.decision?.outcome).toBe("conflict");
    expect(result.statusCode).toBe(409);
  });

  it("rejects invalid Python success envelopes that would claim mutation ownership", async () => {
    vi.stubEnv("BLUEPRINT_STAGE_EDIT_PYTHON_RUNTIME", "true");
    vi.stubEnv("PYTHON_SLIDE_RULE_BASE_URL", "http://python-blueprint.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...runtimeSuccess("preview"),
          runtime: {
            ...runtimeSuccess("preview").runtime,
            invalidationOwner: "python",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await validateBlueprintStageEditWithPythonRuntime({
      selectedStage: "input",
      intakeId: "intake-1",
      intake: makeIntake(),
      patch: { targetText: "Updated target" },
      jobs: [makeJob()],
      now: () => FIXED_NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      operation: "validate",
      error: "invalid_runtime_response",
      reason: "invalid_python_runtime_shape",
      statusCode: 502,
      retryable: true,
    });
    expect(result).not.toHaveProperty("decision");
  });
});
