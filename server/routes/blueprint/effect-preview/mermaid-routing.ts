import { createHash } from "node:crypto";

import type {
  BlueprintSpecDocument,
  BlueprintSpecTreeNode,
} from "../../../../shared/blueprint/contracts.js";
import type {
  BlueprintPreviewProvenance,
  PreviewImageMeta,
} from "../../../../shared/blueprint/preview-audit/types.js";
import type { ChecksLedgerService } from "../checks-ledger/types.js";
import { renderMermaidPreview, type MermaidRenderResult } from "./mermaid-renderer.js";

export interface MermaidPreviewRouteInput {
  jobId: string;
  node: BlueprintSpecTreeNode;
  documents: readonly BlueprintSpecDocument[];
  generatedAt: string;
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
}

export interface MermaidPreviewRouteResult {
  svg: string;
  meta: PreviewImageMeta;
  renderResult: Extract<MermaidRenderResult, { kind: "ok" }>;
}

const MERMAID_BLOCK_RE = /```mermaid\s*([\s\S]*?)```/i;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isArchitectureOrFlowchartNode(node: BlueprintSpecTreeNode): boolean {
  const metadataValues = Object.values(node.metadata ?? {})
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .join(" ");
  const haystack = [
    node.type,
    node.title,
    node.summary,
    ...node.outputs,
    metadataValues,
  ]
    .join(" ")
    .toLowerCase();

  return /\b(architecture|flowchart|diagram|mermaid|架构|流程图)\b/i.test(haystack);
}

export function extractFirstMermaidSource(
  documents: readonly Pick<BlueprintSpecDocument, "content">[],
): string | null {
  for (const document of documents) {
    const match = MERMAID_BLOCK_RE.exec(document.content);
    const source = match?.[1]?.trim();
    if (source) return source;
  }
  return null;
}

export function shouldRouteNodeToMermaid(input: {
  node: BlueprintSpecTreeNode;
  documents: readonly Pick<BlueprintSpecDocument, "content">[];
}): boolean {
  return (
    isArchitectureOrFlowchartNode(input.node) &&
    extractFirstMermaidSource(input.documents) !== null
  );
}

function toPreviewMeta(input: {
  jobId: string;
  nodeId: string;
  svg: string;
  contentHash: string;
  generatedAt: string;
  provenance: BlueprintPreviewProvenance;
}): PreviewImageMeta {
  return {
    imageId: input.nodeId,
    jobId: input.jobId,
    nodeId: input.nodeId,
    filePath: `${input.jobId}/${input.nodeId}.svg`,
    contentHash: input.contentHash || sha256Hex(input.svg),
    fileSizeBytes: Buffer.byteLength(input.svg, "utf8"),
    provenance: {
      ...input.provenance,
      generatedAt: input.generatedAt,
    },
    watermarkLabel: "preview · unverified",
    localizedWatermarkLabel: "预览·未验证",
  };
}

export async function renderRoutedMermaidPreview(
  input: MermaidPreviewRouteInput,
): Promise<MermaidPreviewRouteResult | null> {
  if (!shouldRouteNodeToMermaid(input)) return null;
  const mermaidSource = extractFirstMermaidSource(input.documents);
  if (!mermaidSource) return null;

  const renderResult = await renderMermaidPreview({
    jobId: input.jobId,
    nodeId: input.node.id,
    mermaidSource,
    checksLedger: input.checksLedger,
  });

  if (renderResult.kind !== "ok") return null;

  return {
    svg: renderResult.svg,
    meta: toPreviewMeta({
      jobId: input.jobId,
      nodeId: input.node.id,
      svg: renderResult.svg,
      contentHash: renderResult.contentHash,
      generatedAt: input.generatedAt,
      provenance: renderResult.provenance,
    }),
    renderResult,
  };
}
