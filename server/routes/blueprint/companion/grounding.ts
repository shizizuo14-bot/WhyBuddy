/**
 * Grounding service for CompanionLayer.
 *
 * The service verifies concrete repository citations through a bounded reader
 * and converts the result into the existing CompanionFinding contract.
 */

import type { BlueprintServiceContext } from "../context.js";
import type {
  CompanionFinding,
  CompanionLayerPolicy,
  CompanionTriggerContext,
  GroundingService,
} from "../../../../shared/blueprint/companion/types.js";
import {
  verificationToFinding,
  verifyFileCitations,
} from "./grounding-tools.js";

function createId(): string {
  return `cf-ground-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createGroundingService(
  ctx: BlueprintServiceContext,
  _policy: CompanionLayerPolicy,
): GroundingService {
  return {
    async evaluate(
      triggerCtx: CompanionTriggerContext,
      artifact: unknown,
    ): Promise<CompanionFinding | null> {
      if (!triggerCtx.hasRealRepo) {
        return null;
      }

      try {
        const verification = await verifyFileCitations({
          ctx,
          triggerCtx,
          artifact,
        });
        return verificationToFinding(ctx, verification);
      } catch (err) {
        ctx.logger.warn("grounding: evaluation failed, returning warn finding", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          id: createId(),
          role: "grounding",
          stage: triggerCtx.stage,
          targetArtifactId: triggerCtx.jobId,
          findings: ["Grounding evaluation encountered an internal error."],
          severity: "warn",
          suggestedActions: [],
          citations: [],
          repoFilesRead: [],
          timestamp: ctx.now().toISOString(),
        };
      }
    },
  };
}
