/**
 * @description Brainstorm Pipeline Integration — standalone module demonstrating
 * how the brainstorm orchestrator integrates with the autopilot pipeline.
 *
 * Exports integration functions for:
 * - Service context assembly (lazy initialization)
 * - Decision Gate invocation at stage start
 * - Routing to orchestrator vs single-agent
 * - Graceful degradation when brainstorm is disabled or fails
 * - Event emission when mode is chosen
 *
 * @see .kiro/specs/autopilot-multi-agent-brainstorm/design.md §1, §2
 * Requirements: 1.1, 1.3, 1.4, 3.5, 8.3, 10.1, 10.3
 */

import type {
  BrainstormSession,
  DecisionGateInput,
  DecisionGateOutput,
  SynthesisResult,
} from "../../../../shared/blueprint/brainstorm-contracts";
import {
  decide,
  routeDecision,
  type LLMCallerFn,
  type EventEmitterFn,
} from "./decision-gate";
import { BrainstormOrchestrator } from "./orchestrator";
import { BrainstormSynthesizer } from "./synthesizer";
import {
  BrainstormMemoryStore,
  buildSessionArtifact,
} from "./memory-store";
import { resolveStageConfig } from "./stage-config";
import {
  buildBrainstormEvidence,
  writeEvidenceToLedger,
} from "./evidence-trail";
import type { ChecksLedgerService } from "../checks-ledger/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Service context for the brainstorm subsystem. */
export interface BrainstormServiceContext {
  orchestrator: BrainstormOrchestrator;
  synthesizer: BrainstormSynthesizer;
  memoryStore: BrainstormMemoryStore;
  enabled: boolean;
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
}

/** Stage context passed from the autopilot pipeline. */
export interface StageContext {
  jobId: string;
  stageId: string;
  stageDescription: string;
  degradedBridges: string[];
  previousStageOutputs?: string[];
}

/** Result of running a pipeline stage (either single-agent or brainstorm). */
export interface StageResult {
  type: "single-agent" | "brainstorm";
  output: string;
  synthesisResult?: SynthesisResult;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Service Context Assembly (Task 16.1)
// ---------------------------------------------------------------------------

/**
 * Lazily assemble the brainstorm service context.
 * Only initializes when BLUEPRINT_BRAINSTORM_ENABLED is "true".
 *
 * Follows the same pattern as `roleAgentDelegator` assembly in the codebase.
 */
export function assembleBrainstormContext(
  llmCaller: LLMCallerFn,
  emitEvent: EventEmitterFn,
): BrainstormServiceContext | null {
  const enabled = process.env.BLUEPRINT_BRAINSTORM_ENABLED === "true";

  if (!enabled) {
    return null;
  }

  const orchestrator = new BrainstormOrchestrator(llmCaller, emitEvent);
  const synthesizer = new BrainstormSynthesizer(llmCaller, emitEvent);
  const memoryStore = new BrainstormMemoryStore(emitEvent);

  return { orchestrator, synthesizer, memoryStore, enabled: true };
}

// ---------------------------------------------------------------------------
// Pipeline Stage Driver Integration (Task 16.2)
// ---------------------------------------------------------------------------

/**
 * Execute a pipeline stage with brainstorm decision gating.
 *
 * Flow:
 * 1. If brainstorm disabled → skip Decision Gate entirely, return single-agent
 * 2. Invoke Decision Gate
 * 3. If brainstormNeeded=false → continue single-agent path
 * 4. If brainstormNeeded=true → delegate to orchestrator
 * 5. Feed synthesis result back as stage output
 * 6. On any orchestrator error → graceful degradation to single-agent
 */
export async function executeStageWithBrainstorm(
  stageContext: StageContext,
  brainstormCtx: BrainstormServiceContext | null,
  llmCaller: LLMCallerFn,
  emitEvent: EventEmitterFn,
  singleAgentFallback: (context: StageContext) => Promise<string>,
): Promise<StageResult> {
  // When brainstorm is disabled via env, skip Decision Gate entirely (Req 10.1)
  if (!brainstormCtx || !brainstormCtx.enabled) {
    const output = await singleAgentFallback(stageContext);
    return { type: "single-agent", output };
  }

  // Build Decision Gate input
  const gateInput: DecisionGateInput = {
    jobId: stageContext.jobId,
    stageId: stageContext.stageId,
    stageContext: stageContext.stageDescription,
    degradedBridges: stageContext.degradedBridges,
    previousStageOutputs: stageContext.previousStageOutputs,
  };

  // Invoke Decision Gate
  let decision: DecisionGateOutput;
  try {
    decision = await decide(gateInput, llmCaller, emitEvent);
  } catch {
    // Decision Gate itself should never throw (has internal fallback),
    // but guard defensively
    const output = await singleAgentFallback(stageContext);
    return { type: "single-agent", output };
  }

  // Route based on decision
  emitEvent("brainstorm.gate.evaluated", {
    jobId: stageContext.jobId,
    stageId: stageContext.stageId,
    brainstormNeeded: decision.brainstormNeeded,
    recommendedMode: decision.recommendedMode,
    requiredRoles: decision.requiredRoles,
    requiredToolCategories: decision.requiredToolCategories,
    reasoning: decision.reasoning,
  });

  const routing = routeDecision(decision);

  if (routing.type === "single-agent") {
    const output = await singleAgentFallback(stageContext);
    return { type: "single-agent", output };
  }

  // Emit mode selected event (Task 16.4, Req 3.5)
  emitEvent("brainstorm.mode.selected", {
    jobId: stageContext.jobId,
    stageId: stageContext.stageId,
    mode: routing.sessionConfig!.mode,
    roles: routing.sessionConfig!.roles,
  });

  // Delegate to orchestrator (Req 1.4)
  try {
    const session = await brainstormCtx.orchestrator.startSession({
      jobId: stageContext.jobId,
      stageId: stageContext.stageId,
      mode: routing.sessionConfig!.mode,
      roles: routing.sessionConfig!.roles,
      toolCategories: routing.sessionConfig!.toolCategories,
      stageContext: stageContext.stageDescription,
    });

    // Wait for session to complete (poll-based for simplicity)
    const completedSession = await waitForSessionCompletion(
      brainstormCtx.orchestrator,
      session.id,
    );

    if (!completedSession) {
      // Session failed or timed out — graceful degradation (Req 10.1)
      emitEvent("brainstorm.degraded", {
        sessionId: session.id,
        reason: "Session did not complete within expected time",
        affectedComponent: "pipeline-integration",
        fallbackAction: "single-agent",
      });
      const output = await singleAgentFallback(stageContext);
      return { type: "single-agent", output };
    }

    if (completedSession.status === "failed") {
      emitEvent("brainstorm.degraded", {
        sessionId: session.id,
        reason: "Session failed before synthesis",
        affectedComponent: "pipeline-integration",
        fallbackAction: "single-agent",
      });
      const output = await singleAgentFallback(stageContext);
      return { type: "single-agent", output };
    }

    let finalSession = completedSession;
    if (completedSession.status === "synthesizing") {
      const synthesisResult = await brainstormCtx.synthesizer.synthesize(
        buildSynthesisInput(completedSession, stageContext.stageDescription),
      );
      finalSession =
        brainstormCtx.orchestrator.completeSynthesis(session.id, synthesisResult) ??
        completedSession;
    }

    // Build and persist artifact (Req 8.4)
    const artifact = buildSessionArtifact(finalSession);
    brainstormCtx.memoryStore.persist(artifact);
    writeEvidenceToLedger({
      checksLedger: brainstormCtx.checksLedger,
      evidence: buildBrainstormEvidence({
        session: finalSession,
        roundCount:
          finalSession.deliberationSummary?.roundCount ??
          countDeliberationRounds(finalSession),
        finalConvergenceScore:
          finalSession.deliberationSummary?.finalConvergenceScore ??
          extractFinalConvergenceScore(finalSession),
      }),
    });

    // Extract synthesis result as stage output (Req 8.3)
    const synthesisResult = finalSession.synthesisResult;
    const output = synthesisResult?.decision ?? "Brainstorm completed without synthesis.";

    return {
      type: "brainstorm",
      output,
      synthesisResult: synthesisResult ?? undefined,
      sessionId: session.id,
    };
  } catch (err) {
    // Graceful degradation: on unrecoverable error, fall back to single-agent (Req 10.1, 10.3)
    emitEvent("brainstorm.degraded", {
      sessionId: "",
      reason: `Orchestrator error: ${err instanceof Error ? err.message : String(err)}`,
      affectedComponent: "pipeline-integration",
      fallbackAction: "single-agent",
    });
    const output = await singleAgentFallback(stageContext);
    return { type: "single-agent", output };
  }
}

function countDeliberationRounds(session: BrainstormSession): number {
  const seenRounds = new Set<number>();
  for (const node of session.branchNodes) {
    const match = node.title.match(/\bRound\s+(\d+)\b/i);
    if (match) {
      seenRounds.add(Number(match[1]));
    }
  }

  if (seenRounds.size > 0) {
    return seenRounds.size;
  }

  const completedMembers = Array.from(session.crewMembers.values()).filter(
    (member) => member.state === "completed" && member.output,
  ).length;
  const roleCount = Math.max(1, session.crewMembers.size);
  return Math.max(1, Math.floor(session.branchNodes.length / roleCount), completedMembers > 0 ? 1 : 0);
}

function extractFinalConvergenceScore(session: BrainstormSession): number {
  const scoreCandidates = session.branchNodes
    .map((node) => node.confidence)
    .filter((value): value is number => typeof value === "number");
  if (scoreCandidates.length === 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, Math.max(...scoreCandidates)));
}

// ---------------------------------------------------------------------------
// Diagnostics Extension (Task 15.1)
// ---------------------------------------------------------------------------

/**
 * Get brainstorm orchestrator diagnostics for the diagnostics endpoint.
 * Returns null if brainstorm is not enabled.
 */
export function getBrainstormDiagnostics(
  brainstormCtx: BrainstormServiceContext | null,
) {
  const stageConfig = resolveStageConfig();
  const perStageConfig = Object.fromEntries(
    Object.entries(stageConfig.perStage).map(([stage, enabled]) => [
      stage,
      stageConfig.masterEnabled && enabled,
    ]),
  );

  if (!brainstormCtx) {
    return {
      enabled: false,
      activeSessionsCount: 0,
      totalSessionsCompleted: 0,
      degradationCount: 0,
      averageSessionDurationMs: 0,
      tokenBudget: 0,
      toolCallLimit: 0,
      perStageConfig,
    };
  }

  return {
    ...brainstormCtx.orchestrator.getDiagnostics(),
    perStageConfig,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSynthesisInput(
  session: BrainstormSession,
  stageContext: string,
) {
  return {
    sessionId: session.id,
    mode: session.mode,
    stageContext,
    crewOutputs: Array.from(session.crewMembers.entries())
      .filter(([, member]) => member.state === "completed" && member.output)
      .map(([roleId, member]) => ({
        roleId,
        content: member.output!.content,
        confidence: member.output!.confidence,
      })),
    deliberationContext: session.deliberationSummary
      ? {
          challenges: session.deliberationSummary.challenges ?? [],
          rebuttals: session.deliberationSummary.rebuttals ?? [],
          dissentingOpinions:
            session.deliberationSummary.dissentingOpinions ?? [],
        }
      : undefined,
  };
}

/**
 * Wait for a brainstorm session to reach a terminal state.
 * Polls the orchestrator every 100ms, up to 130s total.
 */
async function waitForSessionCompletion(
  orchestrator: BrainstormOrchestrator,
  sessionId: string,
  maxWaitMs = 130_000,
): Promise<BrainstormSession | null> {
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < maxWaitMs) {
    const session = orchestrator.getSession(sessionId);
    if (!session) return null;

    if (
      session.status === "completed" ||
      session.status === "failed" ||
      session.status === "synthesizing"
    ) {
      return session;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
}
