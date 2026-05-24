import { describe, expect, it } from "vitest";
import type {
  BlueprintGenerationJob,
  BlueprintGenerationNextAction,
} from "../../../../../shared/blueprint/contracts.js";
import { buildFullChainJob } from "../../staleness/__tests__/__fixtures__/build-fixture-job.js";
import { detectRunningDownstream } from "../guards/running-stage-guard.js";
import { validateReplanInput } from "../guards/validate-input.js";

describe("validateReplanInput", () => {
  it("accepts a valid replan request", () => {
    expect(
      validateReplanInput({
        fromStage: "spec_tree",
        mode: "in_place",
        reason: "Need a different structure.",
      }),
    ).toEqual({
      ok: true,
      value: {
        fromStage: "spec_tree",
        mode: "in_place",
        reason: "Need a different structure.",
      },
    });
  });

  it("returns stable error codes in fromStage, mode, reason order", () => {
    expect(validateReplanInput(null)).toEqual({
      ok: false,
      status: 400,
      error: "invalid_from_stage",
    });
    expect(validateReplanInput({ fromStage: "__bad__", mode: 42 })).toEqual({
      ok: false,
      status: 400,
      error: "invalid_from_stage",
    });
    expect(validateReplanInput({ fromStage: "input", mode: "replace" })).toEqual({
      ok: false,
      status: 400,
      error: "invalid_mode",
    });
    expect(
      validateReplanInput({
        fromStage: "input",
        mode: "branch",
        reason: "x".repeat(1025),
      }),
    ).toEqual({
      ok: false,
      status: 400,
      error: "invalid_reason",
    });
  });
});

describe("detectRunningDownstream", () => {
  it("detects a downstream running job stage", () => {
    const job = buildFullChainJob({
      staleStages: [],
    }) as BlueprintGenerationJob;
    const result = detectRunningDownstream(
      { ...job, status: "running", stage: "spec_docs" },
      "spec_tree",
    );

    expect(result).toEqual({
      runningStage: "spec_docs",
      reason: "job_running",
    });
  });

  it("treats reviewing handoff state as downstream active work", () => {
    const job = buildFullChainJob() as BlueprintGenerationJob;

    expect(
      detectRunningDownstream(
        { ...job, status: "completed", stage: "effect_preview", handoffState: "reviewing" },
        "spec_docs",
      ),
    ).toEqual({
      runningStage: "effect_preview",
      reason: "handoff_active",
    });
  });

  it("treats non-review nextAction on a downstream stage as active", () => {
    const job = buildFullChainJob() as BlueprintGenerationJob;
    const nextAction: BlueprintGenerationNextAction = {
      type: "select_route",
      label: "Select route",
      stage: "route_generation",
      required: true,
    };

    expect(
      detectRunningDownstream({ ...job, nextAction }, "clarification"),
    ).toEqual({
      runningStage: "route_generation",
      reason: "next_action_active",
    });
  });

  it("ignores source stage, completed handoff states, review actions, and returns nearest downstream stage", () => {
    const job = buildFullChainJob() as BlueprintGenerationJob;
    const reviewAction: BlueprintGenerationNextAction = {
      type: "review_spec_documents",
      label: "Review documents",
      stage: "spec_docs",
      required: true,
    };

    expect(
      detectRunningDownstream(
        {
          ...job,
          status: "running",
          stage: "spec_tree",
          handoffState: "confirmed",
          nextAction: reviewAction,
        },
        "spec_tree",
      ),
    ).toBeNull();

    expect(
      detectRunningDownstream(
        {
          ...job,
          status: "running",
          stage: "engineering_landing",
          nextAction: {
            type: "select_route",
            label: "Active closer downstream action",
            stage: "effect_preview",
            required: true,
          },
        },
        "spec_docs",
      ),
    ).toEqual({
      runningStage: "effect_preview",
      reason: "next_action_active",
    });
  });
});
