/**
 * `blueprint-v4-full-alignment` Module E — 出图审计服务（E.5 / R12–R14）。
 *
 * `createPreviewAuditService(ctx)` 闭包工厂：
 * - env gate `BLUEPRINT_PREVIEW_AUDIT_ENABLED`：关闭时返回 no-op（全 pass，不触台账/事件，R12.2）。
 * - 开启时跑三类 detector（fallback 冒充 / 假成功 / 复制充数），汇总 findings。
 * - 写入 checksLedger（checkType `preview_audit`, stage `effect_preview`, R13）。
 * - failCount>0 且 retryCount<maxRetries → emit `preview.audit.regenerate_requested`（R14.1/14.2）。
 * - retryCount>=maxRetries → 记台账 fail（retry 耗尽），不再 emit（防死循环，R14.3）。
 *
 * 全程非阻塞：台账写入与事件发出均包 try/catch，绝不抛错（R14.5）。
 *
 * 接口契约 `PreviewAuditService.auditPreviews(jobId, previews)` 不含 retryCount，
 * 因此服务对象额外暴露非接口内部方法 `auditWithRetry(jobId, previews, retryCount)`，
 * 供回炉处理器（E.5b）在递增 retryCount 后复审时调用。
 */

import type { BlueprintServiceContext } from "../context.js";
import type { BlueprintCheckStatus } from "../../../../shared/blueprint/checks-ledger/types.js";
import type {
  PreviewAuditService,
  PreviewAuditResult,
  PreviewAuditFinding,
  PreviewImageMeta,
} from "../../../../shared/blueprint/preview-audit/types.js";
import { BlueprintEventName } from "../../../../shared/blueprint/events.js";
import {
  detectFallbackFraud,
  detectFakeSuccess,
  detectDuplicates,
} from "./detectors.js";

const ENV_KEY = "BLUEPRINT_PREVIEW_AUDIT_ENABLED";
const MAX_RETRIES_ENV_KEY = "BLUEPRINT_PREVIEW_AUDIT_MAX_RETRIES";
const DEFAULT_MAX_RETRIES = 2;
const VALIDATOR = "preview-audit/service.ts";

/**
 * `createPreviewAuditService` 返回的对象类型。除接口方法外，额外暴露
 * 内部 `auditWithRetry`，供回炉处理器复审使用。
 */
export interface PreviewAuditServiceInternal extends PreviewAuditService {
  /** 内部方法：带显式 retryCount 的审计（回炉复审入口）。 */
  auditWithRetry(
    jobId: string,
    previews: PreviewImageMeta[],
    retryCount: number,
  ): Promise<PreviewAuditResult>;
  /** 当前生效的最大回炉次数（供处理器做防御式上限判断）。 */
  readonly maxRetries: number;
}

/**
 * 解析当前生效的最大回炉次数（`BLUEPRINT_PREVIEW_AUDIT_MAX_RETRIES`，默认 2）。
 * 导出供回炉处理器（E.5b）做独立的防御式上限判断。
 */
export function resolveMaxRetries(): number {
  const raw = process.env[MAX_RETRIES_ENV_KEY];
  if (raw === undefined) return DEFAULT_MAX_RETRIES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? DEFAULT_MAX_RETRIES : parsed;
}

function emitEventId(): string {
  return `pa-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createPreviewAuditService(
  ctx: BlueprintServiceContext,
): PreviewAuditServiceInternal {
  const enabled = process.env[ENV_KEY] === "true";
  const maxRetries = resolveMaxRetries();

  function allPassResult(
    jobId: string,
    total: number,
    auditedAt: string,
  ): PreviewAuditResult {
    return {
      jobId,
      auditedAt,
      totalImages: total,
      passCount: total,
      failCount: 0,
      findings: [],
      overallStatus: "pass",
    };
  }

  async function auditWithRetry(
    jobId: string,
    previews: PreviewImageMeta[],
    retryCount: number,
  ): Promise<PreviewAuditResult> {
    const auditedAt = ctx.now().toISOString();
    const totalImages = previews.length;

    // R12.2：env gate 关闭 → no-op，全部报 pass，不触台账/事件。
    if (!enabled) {
      return allPassResult(jobId, totalImages, auditedAt);
    }

    // ── 三类 detector ──
    const findings: PreviewAuditFinding[] = [];
    for (const meta of previews) {
      const fallback = detectFallbackFraud(meta);
      if (fallback) findings.push(fallback);
      const fake = detectFakeSuccess(meta);
      if (fake) findings.push(fake);
    }
    findings.push(...detectDuplicates(previews));

    // ── 聚合：error 级 finding 决定"失败图片" ──
    const failedImageIds = new Set<string>();
    const failedImages: Array<{ imageId: string; reason: string }> = [];
    let hasWarn = false;
    let fallbackDetected = false;
    let fakeSuccessDetected = false;
    let duplicateCount = 0;
    for (const f of findings) {
      if (f.severity === "error") {
        if (!failedImageIds.has(f.imageId)) {
          failedImages.push({ imageId: f.imageId, reason: f.reason });
        }
        failedImageIds.add(f.imageId);
        if (f.reason === "fallback_pretending") fallbackDetected = true;
        if (f.reason === "fake_success") fakeSuccessDetected = true;
      } else if (f.severity === "warn") {
        hasWarn = true;
        if (f.reason === "duplicate_content") duplicateCount += 1;
      }
    }

    const failCount = failedImageIds.size;
    const passCount = Math.max(0, totalImages - failCount);
    const overallStatus: BlueprintCheckStatus =
      failCount > 0 ? "fail" : hasWarn ? "warn" : "pass";

    const result: PreviewAuditResult = {
      jobId,
      auditedAt,
      totalImages,
      passCount,
      failCount,
      findings,
      overallStatus,
    };

    // ── R13：写入校验台账（非阻塞） ──
    try {
      ctx.checksLedger?.recordCheck({
        jobId,
        stage: "effect_preview",
        checkType: "preview_audit",
        checkName: "preview_audit_batch",
        status: overallStatus,
        validator: VALIDATOR,
        output: JSON.stringify({
          totalImages,
          passCount,
          failCount,
          failedImages,
        }),
        metadata: {
          ...(duplicateCount > 0 ? { duplicateHashGroups: duplicateCount } : {}),
          ...(fallbackDetected ? { fallbackDetected: true } : {}),
          ...(fakeSuccessDetected ? { fakeSuccessDetected: true } : {}),
        },
      });
    } catch (err) {
      ctx.logger.warn("preview-audit: ledger write failed", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── R14：假图回炉触发 / retry 耗尽 ──
    if (failCount > 0) {
      const auditReasons = failedImages.map((f) => f.reason);
      if (retryCount < maxRetries) {
        // R14.1/14.2：发出回炉请求事件。
        try {
          ctx.eventBus.emit({
            id: emitEventId(),
            jobId,
            type: BlueprintEventName.PreviewAuditRegenerateRequested,
            family: "preview",
            stage: "effect_preview",
            createdAt: auditedAt,
            occurredAt: auditedAt,
            payload: {
              jobId,
              failedImageIds: [...failedImageIds],
              auditReasons,
              retryCount,
            },
          } as never);
        } catch (err) {
          ctx.logger.warn("preview-audit: regenerate emit failed", {
            jobId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        // R14.3：retry 耗尽 → 记台账 fail，不再 emit（防死循环）。
        try {
          ctx.checksLedger?.recordCheck({
            jobId,
            stage: "effect_preview",
            checkType: "preview_audit",
            checkName: "preview_audit_retry_exhausted",
            status: "fail",
            validator: VALIDATOR,
            output: JSON.stringify({
              message: "regeneration retry budget exhausted",
              retryCount,
              maxRetries,
              failedImages,
            }),
            metadata: {
              retryCount,
              maxRetries,
              permanentlyFailed: true,
            },
          });
        } catch (err) {
          ctx.logger.warn("preview-audit: exhaustion ledger write failed", {
            jobId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return result;
  }

  return {
    maxRetries,
    auditWithRetry,
    async auditPreviews(
      jobId: string,
      previews: PreviewImageMeta[],
    ): Promise<PreviewAuditResult> {
      return auditWithRetry(jobId, previews, 0);
    },
  };
}

// ---------------------------------------------------------------------------
// Python runtime support (Blueprint prompt/preview runtime 97)
// Mapper retains provenance/policy/audit metadata; never rewrites degraded as pass.
// ---------------------------------------------------------------------------

export interface PythonPreviewAuditEnvelope {
  jobId: string;
  auditedAt: string;
  totalImages: number;
  passCount: number;
  failCount: number;
  findings: PreviewAuditFinding[];
  overallStatus: BlueprintCheckStatus;
  provenance?: string;
  policy?: Record<string, unknown>;
}

export function mapPreviewAuditPythonResult(
  env: PythonPreviewAuditEnvelope,
): PreviewAuditResult {
  // direct passthrough preserving all metadata; status decides pass/fail
  return {
    jobId: env.jobId,
    auditedAt: env.auditedAt,
    totalImages: env.totalImages,
    passCount: env.passCount,
    failCount: env.failCount,
    findings: env.findings,
    overallStatus: env.overallStatus,
    provenance: env.provenance,
    policy: env.policy,
  };
}
