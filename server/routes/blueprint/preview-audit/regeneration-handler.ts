/**
 * `blueprint-v4-full-alignment` Module E — 假图回炉消费方（E.5b / R14.4 闭环）。
 *
 * `createPreviewAuditRegenerationHandler(ctx)` 订阅 `preview.audit.regenerate_requested`
 * 事件，对失败图片走 Module F 的真生成路径（`ctx.effectPreviewImageService.runStageC`）
 * 重新出图，再调用审计服务复审（retryCount 递增）。复审里的 maxRetries 上限 +
 * "诚实失败(ok:false) 不算造假" 共同保证不死循环（design §E.4）。
 *
 * 收敛/降级约束：
 * - 防御式上限：`retryCount + 1 > maxRetries` → 记永久失败台账并停止，不再回炉（belt-and-suspenders）。
 * - `ctx.effectPreviewImageService` 缺失或无失败图片 → 记 warn 台账并优雅停止。
 * - 全程非阻塞：监听器内部 try/catch，绝不向事件总线抛错。
 */

import type { BlueprintServiceContext } from "../context.js";
import type {
  BlueprintGenerationEvent,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/contracts.js";
import type { BlueprintSpecDocument } from "../../../../shared/blueprint/contracts.js";
import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import {
  resolveMaxRetries,
  type PreviewAuditServiceInternal,
} from "./service.js";
import { buildPreviewMetasFromStageCResult } from "./meta-builder.js";

const VALIDATOR = "preview-audit/regeneration-handler.ts";
const SPEC_DOC_TYPES = new Set(["requirements", "design", "tasks"]);

interface RegeneratePayload {
  jobId: string;
  failedImageIds: string[];
  auditReasons?: string[];
  retryCount: number;
}

export interface PreviewAuditRegenerationHandler {
  /** 取消订阅，释放监听器。 */
  dispose(): void;
}

function parsePayload(event: BlueprintGenerationEvent): RegeneratePayload | null {
  const payload = event.payload as Partial<RegeneratePayload> | undefined;
  if (!payload || typeof payload !== "object") return null;
  const jobId = payload.jobId ?? event.jobId;
  if (typeof jobId !== "string" || jobId.length === 0) return null;
  const failedImageIds = Array.isArray(payload.failedImageIds)
    ? payload.failedImageIds.filter((id): id is string => typeof id === "string")
    : [];
  const retryCount =
    typeof payload.retryCount === "number" ? payload.retryCount : 0;
  return { jobId, failedImageIds, retryCount };
}

function extractSpecDocuments(
  job: BlueprintGenerationJob | null | undefined,
): BlueprintSpecDocument[] {
  if (!job) return [];
  return job.artifacts
    .filter((a) => SPEC_DOC_TYPES.has(a.type))
    .map((a) => a.payload as BlueprintSpecDocument)
    .filter((d): d is BlueprintSpecDocument => !!d && typeof d === "object");
}

export function createPreviewAuditRegenerationHandler(
  ctx: BlueprintServiceContext,
): PreviewAuditRegenerationHandler {
  const maxRetries =
    (ctx.previewAuditService as PreviewAuditServiceInternal | undefined)
      ?.maxRetries ?? resolveMaxRetries();

  function recordLedger(
    jobId: string,
    checkName: string,
    status: "fail" | "warn",
    output: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): void {
    try {
      ctx.checksLedger?.recordCheck({
        jobId,
        stage: "effect_preview",
        checkType: "preview_audit",
        checkName,
        status,
        validator: VALIDATOR,
        output: JSON.stringify(output),
        ...(metadata ? { metadata } : {}),
      });
    } catch (err) {
      ctx.logger.warn("preview-audit-regen: ledger write failed", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handle(event: BlueprintGenerationEvent): Promise<void> {
    if (event.type !== BlueprintEventName.PreviewAuditRegenerateRequested) {
      return;
    }
    const payload = parsePayload(event);
    if (!payload) return;
    const { jobId, failedImageIds, retryCount } = payload;

    // R14.4 / design §E.4 防御式上限：本次回炉对应 attempt #(retryCount + 1)。
    // 若已超过 maxRetries → 标永久失败、停止、不再 emit（belt-and-suspenders）。
    if (retryCount + 1 > maxRetries) {
      recordLedger(
        jobId,
        "preview_audit_regen_exhausted",
        "fail",
        {
          message: "regeneration handler reached retry ceiling; stopping",
          retryCount,
          maxRetries,
          failedImageIds,
        },
        { retryCount, maxRetries, permanentlyFailed: true },
      );
      return;
    }

    // 无失败图片 → 无需回炉。
    if (failedImageIds.length === 0) return;

    // 依赖缺失（无图片服务）→ 记 warn 并优雅停止。
    if (!ctx.effectPreviewImageService) {
      recordLedger(jobId, "preview_audit_regen_skipped", "warn", {
        message: "effectPreviewImageService unavailable; regeneration skipped",
        failedImageIds,
      });
      return;
    }

    const job = ctx.jobStore.get(jobId);
    const specDocuments = extractSpecDocuments(job);

    let stageCResult;
    try {
      // 重建最小 runStageC 调用：仅对失败节点出图（走 F 的真生成路径，禁兜底）。
      stageCResult = await ctx.effectPreviewImageService.runStageC({
        missionId: jobId,
        specDocuments,
        rasterTargets: failedImageIds,
        dependencyOrder: failedImageIds,
        architectureNotes: [],
      });
    } catch (err) {
      recordLedger(jobId, "preview_audit_regen_failed", "warn", {
        message: "runStageC threw during regeneration",
        error: err instanceof Error ? err.message : String(err),
        failedImageIds,
      });
      return;
    }

    // 复审（retryCount 递增）。auditWithRetry 内部负责 emit / 耗尽收敛。
    const auditService = ctx.previewAuditService as
      | PreviewAuditServiceInternal
      | undefined;
    if (!auditService || typeof auditService.auditWithRetry !== "function") {
      return;
    }
    const nowIso = ctx.now().toISOString();
    const metas = buildPreviewMetasFromStageCResult(jobId, stageCResult, nowIso);
    try {
      await auditService.auditWithRetry(jobId, metas, retryCount + 1);
    } catch (err) {
      ctx.logger.warn("preview-audit-regen: re-audit failed", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 监听器以 async 形式注册；事件总线同步 fan-out 并忽略返回的 promise，
  // 内部错误由 handle() 自己 try/catch 吞掉，保持非阻塞。返回 promise 以便
  // 单测可 await 监听器完成（事件总线本身不感知该返回值）。
  const unsubscribe = ctx.eventBus.subscribe((event) => handle(event));

  return {
    dispose() {
      unsubscribe();
    },
  };
}
