import type { BlueprintServiceContext } from "../context.js";
import type { CompanionFinding } from "../../../../shared/blueprint/companion/types.js";

export type ChallengeCycleOutcome =
  | "accepted"
  | "partially_resolved"
  | "escalated";

export interface ChallengeResponse {
  accepted?: boolean;
  summary: string;
}

export interface ChallengeCycleRequest {
  finding: CompanionFinding;
  artifact: unknown;
  responder?: (
    finding: CompanionFinding,
    artifact: unknown,
  ) => Promise<ChallengeResponse>;
  timeoutMs?: number;
}

export interface ChallengeCycleResult {
  finding: CompanionFinding;
  outcome: ChallengeCycleOutcome;
  responseSummary: string | null;
}

function createEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emitCompanionEvent(
  ctx: BlueprintServiceContext,
  type: "companion.challenge.started" | "companion.challenge.resolved",
  finding: CompanionFinding,
  payload: Record<string, unknown>,
): void {
  ctx.eventBus.emit({
    id: createEventId(),
    jobId: finding.targetArtifactId,
    type: type as any,
    family: "checks" as any,
    stage: finding.stage,
    status: "completed" as any,
    message: type,
    occurredAt: ctx.now().toISOString(),
    payload,
  } as any);
}

function recordChallengeOutcome(
  ctx: BlueprintServiceContext,
  finding: CompanionFinding,
  outcome: ChallengeCycleOutcome,
): void {
  try {
    ctx.checksLedger?.recordCheck({
      jobId: finding.targetArtifactId,
      stage: finding.stage,
      checkType: "companion_trace",
      checkName: `companion:challenge:${finding.id}`,
      status: outcome === "accepted" ? "pass" : outcome === "escalated" ? "fail" : "warn",
      validator: "companion/challenge-response-cycle.ts",
      output: JSON.stringify({
        outcome,
        findings: finding.findings,
        severity: finding.severity,
      }),
      metadata: {
        findingId: finding.id,
        role: finding.role,
        outcome,
      },
    });
  } catch (err) {
    ctx.logger.warn("companion challenge: ledger write failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function timeoutAfter(timeoutMs: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
}

export async function initiateChallenge(
  ctx: BlueprintServiceContext,
  request: ChallengeCycleRequest,
): Promise<ChallengeCycleResult> {
  emitCompanionEvent(ctx, "companion.challenge.started", request.finding, {
    findingId: request.finding.id,
    severity: request.finding.severity,
  });

  let outcome: ChallengeCycleOutcome;
  let responseSummary: string | null = null;
  let finding = request.finding;

  if (!request.responder) {
    outcome = finding.severity === "error" ? "escalated" : "partially_resolved";
  } else {
    const response = await Promise.race([
      request.responder(finding, request.artifact),
      timeoutAfter(request.timeoutMs ?? 30_000),
    ]);

    if (!response) {
      outcome = "escalated";
    } else {
      responseSummary = response.summary;
      outcome = response.accepted ? "accepted" : "escalated";
    }
  }

  if (outcome === "escalated" && finding.severity !== "error") {
    finding = {
      ...finding,
      severity: "error",
      findings: [...finding.findings, "Companion challenge escalated."],
    };
  }

  recordChallengeOutcome(ctx, finding, outcome);

  emitCompanionEvent(ctx, "companion.challenge.resolved", finding, {
    findingId: finding.id,
    outcome,
    responseSummary,
    severity: finding.severity,
  });

  return { finding, outcome, responseSummary };
}
