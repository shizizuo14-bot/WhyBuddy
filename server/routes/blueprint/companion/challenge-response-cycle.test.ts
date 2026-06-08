import { describe, expect, it, vi } from "vitest";

import type { BlueprintServiceContext } from "../context.js";
import type { CompanionFinding } from "../../../../shared/blueprint/companion/types.js";
import { initiateChallenge } from "./challenge-response-cycle.js";

function makeFinding(severity: CompanionFinding["severity"] = "warn"): CompanionFinding {
  return {
    id: "finding-1",
    role: "grounding",
    stage: "spec_docs",
    targetArtifactId: "job-1",
    findings: ["Missing cited file"],
    severity,
    suggestedActions: ["Fix citation"],
    citations: ["src/missing.ts"],
    timestamp: "2026-06-08T00:00:00.000Z",
  };
}

function makeCtx() {
  const emitted: unknown[] = [];
  const recordCheck = vi.fn();
  const ctx = {
    now: () => new Date("2026-06-08T00:00:00.000Z"),
    eventBus: { emit: vi.fn((event) => emitted.push(event)) },
    checksLedger: { recordCheck },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as BlueprintServiceContext;
  return { ctx, emitted, recordCheck };
}

describe("companion challenge response cycle", () => {
  it("maps accepted/escalated/timeout outcomes to events and ledger status", async () => {
    const acceptedCtx = makeCtx();
    const accepted = await initiateChallenge(acceptedCtx.ctx, {
      finding: makeFinding("warn"),
      artifact: { ok: true },
      responder: async () => ({ accepted: true, summary: "Fixed citation" }),
    });

    expect(accepted.outcome).toBe("accepted");
    expect(acceptedCtx.recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        checkType: "companion_trace",
        status: "pass",
      }),
    );
    expect(
      acceptedCtx.emitted.map((event: any) => event.type),
    ).toEqual(["companion.challenge.started", "companion.challenge.resolved"]);

    const escalatedCtx = makeCtx();
    const escalated = await initiateChallenge(escalatedCtx.ctx, {
      finding: makeFinding("error"),
      artifact: { ok: false },
    });
    expect(escalated.outcome).toBe("escalated");
    expect(escalated.finding.severity).toBe("error");
    expect(escalatedCtx.recordCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        checkType: "companion_trace",
        status: "fail",
      }),
    );

    const timeoutCtx = makeCtx();
    const timeout = await initiateChallenge(timeoutCtx.ctx, {
      finding: makeFinding("warn"),
      artifact: {},
      timeoutMs: 1,
      responder: () => new Promise((resolve) => setTimeout(resolve, 20)),
    });
    expect(timeout.outcome).toBe("escalated");
    expect(timeout.finding.severity).toBe("error");
  });
});
