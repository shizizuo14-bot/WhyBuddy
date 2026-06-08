import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { BrainstormSession } from "../../../../../shared/blueprint/brainstorm-contracts.js";
import type { ChecksLedgerService } from "../../checks-ledger/types.js";
import {
  buildBrainstormEvidence,
  writeEvidenceToLedger,
} from "../evidence-trail.js";

function makeSession(outputs: Array<{ content: string; confidence?: number }>): BrainstormSession {
  return {
    id: "session-evidence",
    jobId: "job-evidence",
    stageId: "spec_docs",
    mode: "discussion",
    crewMembers: new Map(
      outputs.map((output, index) => [
        index === 0 ? "planner" : index === 1 ? "architect" : "executor",
        {
          roleId: index === 0 ? "planner" : index === 1 ? "architect" : "executor",
          state: "completed",
          iterationCount: 1,
          maxIterations: 5,
          tokenUsage: 10,
          output: {
            content: output.content,
            confidence: output.confidence ?? 0.8,
            toolInvocations: [],
            tokenUsage: 10,
          },
        },
      ]),
    ),
    branchNodes: [],
    edges: [],
    status: "completed",
    tokenBudget: 50_000,
    tokenUsed: 20,
    toolCallCount: 0,
    toolCallLimit: 20,
    startedAt: new Date("2026-06-08T00:00:00.000Z"),
    completedAt: new Date("2026-06-08T00:00:01.000Z"),
  };
}

describe("brainstorm evidence trail properties", () => {
  it("records brainstorm_deliberation with pass only when rounds and references are present", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.boolean(), (roundCount, hasReference) => {
        const recordCheck = vi.fn();
        const session = makeSession([
          { content: hasReference ? "I agree with architect." : "Standalone thought." },
          { content: "Architecture output." },
        ]);
        const evidence = buildBrainstormEvidence({
          session,
          roundCount,
          finalConvergenceScore: 0.8,
        });

        writeEvidenceToLedger({
          checksLedger: { recordCheck } as unknown as ChecksLedgerService,
          evidence,
        });

        const expectedStatus = roundCount >= 2 && hasReference ? "pass" : "fail";
        expect(recordCheck).toHaveBeenCalledWith(
          expect.objectContaining({
            jobId: "job-evidence",
            stage: "spec_docs",
            checkType: "brainstorm_deliberation",
            checkName: "brainstorm:evidence:session-evidence",
            status: expectedStatus,
            validator: "brainstorm/orchestrator.ts",
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("does not throw when the ledger write fails", () => {
    const evidence = buildBrainstormEvidence({
      session: makeSession([{ content: "planner references architect" }]),
      roundCount: 2,
      finalConvergenceScore: 0.75,
    });
    const checksLedger = {
      recordCheck: vi.fn(() => {
        throw new Error("ledger unavailable");
      }),
    } as unknown as ChecksLedgerService;

    expect(() => writeEvidenceToLedger({ checksLedger, evidence })).not.toThrow();
    expect(checksLedger.recordCheck).toHaveBeenCalledOnce();
  });
});
