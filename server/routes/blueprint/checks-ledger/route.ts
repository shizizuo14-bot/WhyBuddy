/**
 * `blueprint-checks-ledger` spec Tasks 4.1–4.3：
 * REST 路由处理器。
 *
 * GET /api/blueprint/jobs/:jobId/checks-ledger
 *   ?stage=...       可选，过滤管线阶段
 *   ?status=...      可选，过滤结果状态
 *   ?checkType=...   可选，过滤校验类型
 *
 * 返回 200 + BlueprintChecksLedgerResponse，或 404 { error: "job_not_found" }。
 */

import type { RequestHandler } from "express";
import type { BlueprintServiceContext } from "../context.js";
import type { BlueprintGenerationStage } from "../../../../shared/blueprint/contracts.js";
import type { BlueprintCheckStatus, BlueprintCheckType, GetChecksFilter } from "./types.js";
import { createChecksLedgerService } from "./service.js";

const VALID_STAGES: ReadonlySet<string> = new Set([
  "input",
  "clarification",
  "route_generation",
  "spec_tree",
  "spec_docs",
  "preview",
  "effect_preview",
  "prompt_packaging",
  "runtime_capability",
  "engineering_handoff",
  "engineering_landing",
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "pass",
  "fail",
  "warn",
  "skip",
]);

const VALID_CHECK_TYPES: ReadonlySet<string> = new Set([
  "schema",
  "invariant",
  "content_quality",
  "test",
  "merge_gate",
  "companion_trace",
  "preview_audit",
]);

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

export function createChecksLedgerRouteHandler(
  ctx: BlueprintServiceContext,
): RequestHandler {
  const service = ctx.checksLedger ?? createChecksLedgerService(ctx);

  return (req, res) => {
    const jobId = req.params.jobId;

    // Check job existence
    const job = ctx.jobStore.get(jobId);
    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    // Parse optional query filters
    const filter: GetChecksFilter = {};

    const stageParam = readOptionalString(req.query.stage);
    if (stageParam && VALID_STAGES.has(stageParam)) {
      filter.stage = stageParam as BlueprintGenerationStage;
    }

    const statusParam = readOptionalString(req.query.status);
    if (statusParam && VALID_STATUSES.has(statusParam)) {
      filter.status = statusParam as BlueprintCheckStatus;
    }

    const checkTypeParam = readOptionalString(req.query.checkType);
    if (checkTypeParam && VALID_CHECK_TYPES.has(checkTypeParam)) {
      filter.checkType = checkTypeParam as BlueprintCheckType;
    }

    const response = service.getChecks(jobId, filter);
    res.status(200).json(response);
  };
}
