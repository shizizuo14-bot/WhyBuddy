// Feature: autopilot-brainstorm-real-collaboration, Task 14.2 regression + baseline guard
//
// This suite is the conservative regression guard for the
// `autopilot-brainstorm-real-collaboration` spec. It asserts the three
// invariants that protect the rest of the codebase from this feature:
//
//   1. No new event family — the only event added to the single source of
//      truth (`shared/blueprint/events.ts`) is `brainstorm.rebuttal.issued`,
//      and it stays inside the existing `brainstorm` family. The family
//      catalogue size is unchanged (14).
//   2. Flag-off no-op — with `BLUEPRINT_BRAINSTORM_ENABLED` unset / != "true",
//      `assembleBrainstormContext` returns `null` (byte-for-byte unchanged
//      second-stage behavior, R9.5).
//   3. The `emitBrainstormEvent` jobId/stageId guard is importable and skips
//      partial events (light sanity).
//
// Validates: Requirements 9.5, 12.1, 12.2

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BlueprintEventName,
  resolveBlueprintEventFamily,
  type BlueprintGenerationEventFamily,
  type BlueprintGenerationEventType,
} from "../../../../shared/blueprint/events.js";

import { assembleBrainstormContext } from "./pipeline-integration";
import { emitBrainstormEvent } from "./emit-brainstorm-event";
import type { EventEmitterFn, LLMCallerFn } from "./orchestrator";

/**
 * The frozen blueprint event-family catalogue size. The
 * `autopilot-brainstorm-real-collaboration` spec MUST NOT extend the family
 * directory — `brainstorm.rebuttal.issued` is additive inside the existing
 * `brainstorm` family (R12.2). If a future change legitimately introduces a
 * new family, this constant (and the design doc) must be updated deliberately.
 */
const EXPECTED_FAMILY_COUNT = 14;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("real-collaboration regression — no new event family (R12.2)", () => {
  it("resolves brainstorm.rebuttal.issued into the existing 'brainstorm' family", () => {
    expect(BlueprintEventName.BrainstormRebuttalIssued).toBe(
      "brainstorm.rebuttal.issued",
    );
    expect(
      resolveBlueprintEventFamily(BlueprintEventName.BrainstormRebuttalIssued),
    ).toBe("brainstorm");
  });

  it("keeps the event-family catalogue size unchanged (14)", () => {
    const families = new Set<BlueprintGenerationEventFamily>();
    for (const eventName of Object.values(BlueprintEventName)) {
      families.add(
        resolveBlueprintEventFamily(eventName as BlueprintGenerationEventType),
      );
    }

    expect(families.size).toBe(EXPECTED_FAMILY_COUNT);
    // The new rebuttal event must NOT have introduced any family beyond the
    // frozen 13 + checks catalogue.
    expect(families.has("brainstorm")).toBe(true);
  });
});

describe("real-collaboration regression — flag-off no-op (R9.5)", () => {
  const noopCaller: LLMCallerFn = (async () => "") as unknown as LLMCallerFn;
  const noopEmit: EventEmitterFn = (() => {}) as unknown as EventEmitterFn;

  it("returns null when BLUEPRINT_BRAINSTORM_ENABLED is unset", () => {
    vi.stubEnv("BLUEPRINT_BRAINSTORM_ENABLED", "");
    expect(assembleBrainstormContext(noopCaller, noopEmit)).toBeNull();
  });

  it("returns null when BLUEPRINT_BRAINSTORM_ENABLED != 'true'", () => {
    vi.stubEnv("BLUEPRINT_BRAINSTORM_ENABLED", "false");
    expect(assembleBrainstormContext(noopCaller, noopEmit)).toBeNull();

    vi.stubEnv("BLUEPRINT_BRAINSTORM_ENABLED", "1");
    expect(assembleBrainstormContext(noopCaller, noopEmit)).toBeNull();

    vi.stubEnv("BLUEPRINT_BRAINSTORM_ENABLED", "TRUE");
    expect(assembleBrainstormContext(noopCaller, noopEmit)).toBeNull();
  });
});

describe("real-collaboration regression — emitBrainstormEvent guard sanity (R7)", () => {
  it("skips events that are missing a non-empty jobId or stageId", () => {
    const emit = vi.fn();

    // Missing both
    emitBrainstormEvent(emit, "brainstorm.rebuttal.issued", {});
    // Missing stageId
    emitBrainstormEvent(emit, "brainstorm.rebuttal.issued", { jobId: "job-1" });
    // Empty stageId
    emitBrainstormEvent(emit, "brainstorm.rebuttal.issued", {
      jobId: "job-1",
      stageId: "   ",
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it("emits events that carry both a non-empty jobId and stageId", () => {
    const emit = vi.fn();

    emitBrainstormEvent(emit, "brainstorm.rebuttal.issued", {
      jobId: "job-1",
      stageId: "stage-1",
      responderRoleId: "architect",
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("brainstorm.rebuttal.issued", {
      jobId: "job-1",
      stageId: "stage-1",
      responderRoleId: "architect",
    });
  });

  it("never throws even if the underlying emitter throws", () => {
    const throwingEmit = vi.fn(() => {
      throw new Error("boom");
    });

    expect(() =>
      emitBrainstormEvent(throwingEmit, "brainstorm.rebuttal.issued", {
        jobId: "job-1",
        stageId: "stage-1",
      }),
    ).not.toThrow();
  });
});
