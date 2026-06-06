/**
 * `blueprint-v4-full-alignment` Module E — 三类出图造假检测纯函数（E.4 / R12.4–12.6）。
 *
 * 全部为无副作用纯函数，便于单测覆盖边界。语义关键点（R12.4）：
 * - 兜底冒充（fraud） = `source: "fallback"` AND `ok: true`（占位图冒充真生成）。
 * - 诚实失败（NOT fraud）= `source: "fallback"` AND `ok: false`（缺图，不写文件）。
 *   诚实失败 SHALL NOT 触发 fraud 检测路径或回炉循环。
 */

import type {
  PreviewImageMeta,
  PreviewAuditFinding,
} from "../../../../shared/blueprint/preview-audit/types.js";

/** detectFakeSuccess 默认最小文件字节阈值（R12.5）。 */
export const DEFAULT_MIN_SIZE_BYTES = 1024;

/**
 * R12.4 — 兜底占位冒充。
 *
 * 仅当 `source === "fallback"` AND `ok === true` 时触发（占位图冒充真生成）。
 * 诚实失败（`source: "fallback"`, `ok: false`）不是造假 → 返回 `null`。
 */
export function detectFallbackFraud(
  meta: PreviewImageMeta,
): PreviewAuditFinding | null {
  const { source, ok } = meta.provenance;
  if (source === "fallback" && ok === true) {
    return {
      imageId: meta.imageId,
      reason: "fallback_pretending",
      details:
        `Image ${meta.imageId} (node ${meta.nodeId}) reports source="fallback" with ok=true — ` +
        `a local placeholder masquerading as a real generation.`,
      severity: "error",
    };
  }
  return null;
}

/**
 * R12.5 — 假成功。
 *
 * 当 `ok === true` 但满足以下任一时触发：
 * - `errorIndicators` 非空；或
 * - `fileSizeBytes < minSizeBytes`（默认 1024）。
 */
export function detectFakeSuccess(
  meta: PreviewImageMeta,
  minSizeBytes: number = DEFAULT_MIN_SIZE_BYTES,
): PreviewAuditFinding | null {
  if (meta.provenance.ok !== true) {
    return null;
  }
  const errorIndicatorCount = meta.provenance.errorIndicators?.length ?? 0;
  const tooSmall = meta.fileSizeBytes < minSizeBytes;
  if (errorIndicatorCount > 0 || tooSmall) {
    const reasons: string[] = [];
    if (errorIndicatorCount > 0) {
      reasons.push(
        `errorIndicators=[${meta.provenance.errorIndicators.join(", ")}]`,
      );
    }
    if (tooSmall) {
      reasons.push(`fileSizeBytes=${meta.fileSizeBytes} < ${minSizeBytes}`);
    }
    return {
      imageId: meta.imageId,
      reason: "fake_success",
      details:
        `Image ${meta.imageId} (node ${meta.nodeId}) reports ok=true but ` +
        `${reasons.join("; ")}.`,
      severity: "error",
    };
  }
  return null;
}

/**
 * R12.6 — 复制充数。
 *
 * 按 `contentHash` 分组；任意一组含 ≥2 张图，则为该组**每一张图**产出一条
 * `duplicate_content` 发现（severity `"warn"`）。`details` 标注重复组。
 */
export function detectDuplicates(
  metas: PreviewImageMeta[],
): PreviewAuditFinding[] {
  const groups = new Map<string, PreviewImageMeta[]>();
  for (const meta of metas) {
    const hash = meta.contentHash;
    // 忽略空哈希，避免把"无内容"误判为重复。
    if (!hash) continue;
    const bucket = groups.get(hash);
    if (bucket) {
      bucket.push(meta);
    } else {
      groups.set(hash, [meta]);
    }
  }

  const findings: PreviewAuditFinding[] = [];
  for (const [hash, bucket] of groups) {
    if (bucket.length < 2) continue;
    const groupImageIds = bucket.map((m) => m.imageId);
    for (const meta of bucket) {
      findings.push({
        imageId: meta.imageId,
        reason: "duplicate_content",
        details:
          `Image ${meta.imageId} (node ${meta.nodeId}) shares contentHash ${hash} with ` +
          `${bucket.length} images in the same job: [${groupImageIds.join(", ")}].`,
        severity: "warn",
      });
    }
  }
  return findings;
}
