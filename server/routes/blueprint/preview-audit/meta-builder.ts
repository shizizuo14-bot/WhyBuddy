/**
 * `blueprint-v4-full-alignment` Module E — 从 `runStageC` 结果构造审计输入。
 *
 * 把 `ImageService.runStageC` 的产出（`imageBase64ByNodeId` 已出图节点 +
 * `failedProvenanceByNodeId` 失败节点）转换为 `PreviewImageMeta[]`，供
 * `PreviewAuditService.auditPreviews` 消费。
 *
 * - `contentHash` = base64 内容的 SHA-256（已出图节点）。
 * - `fileSizeBytes` = base64 解码后的字节长度（已出图节点）。
 * - 失败节点无图文件 → `contentHash: ""`、`fileSizeBytes: 0`，直接复用其 provenance。
 *
 * 纯函数，无副作用，便于单测与多处复用（E.8 路由钩子 + E.5b 回炉处理器）。
 */

import { createHash } from "node:crypto";
import type {
  BlueprintPreviewProvenance,
  PreviewImageMeta,
} from "../../../../shared/blueprint/preview-audit/types.js";

/**
 * `runStageC` 结果中与审计相关的最小子集形状。
 * 与 `ImageServiceRunStageCResult` 结构兼容（只读取需要的字段）。
 */
export interface StageCResultForAudit {
  imageBase64ByNodeId?: Record<
    string,
    {
      b64: string;
      mimeType?: string;
      generatedAt?: string;
      provenance?: BlueprintPreviewProvenance;
    }
  >;
  failedProvenanceByNodeId?: Record<string, BlueprintPreviewProvenance>;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function decodedByteLength(b64: string): number {
  try {
    return Buffer.from(b64, "base64").length;
  } catch {
    return 0;
  }
}

/**
 * 构造审计输入。`imageId` 采用 `${nodeId}`（同 job 内 nodeId 唯一）。
 *
 * @param jobId 关联作业 ID。
 * @param result runStageC 结果（或其审计子集）。
 * @param nowIso 失败节点缺省 provenance 的 generatedAt 兜底时间。
 */
export function buildPreviewMetasFromStageCResult(
  jobId: string,
  result: StageCResultForAudit | undefined | null,
  nowIso: string,
): PreviewImageMeta[] {
  if (!result) return [];
  const metas: PreviewImageMeta[] = [];

  const produced = result.imageBase64ByNodeId ?? {};
  for (const [nodeId, record] of Object.entries(produced)) {
    if (!record || typeof record.b64 !== "string") continue;
    const provenance: BlueprintPreviewProvenance = record.provenance ?? {
      source: "model",
      ok: true,
      errorIndicators: [],
      generatedAt: record.generatedAt ?? nowIso,
      retryCount: 0,
    };
    metas.push({
      imageId: nodeId,
      jobId,
      nodeId,
      filePath: `${jobId}/${nodeId}.png`,
      contentHash: sha256Hex(record.b64),
      fileSizeBytes: decodedByteLength(record.b64),
      provenance,
    });
  }

  const failed = result.failedProvenanceByNodeId ?? {};
  for (const [nodeId, provenance] of Object.entries(failed)) {
    if (!provenance) continue;
    metas.push({
      imageId: nodeId,
      jobId,
      nodeId,
      filePath: "",
      contentHash: "",
      fileSizeBytes: 0,
      provenance,
    });
  }

  return metas;
}
