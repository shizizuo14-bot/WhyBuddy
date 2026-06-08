import { createHash } from "node:crypto";

import type { ChecksLedgerService } from "../checks-ledger/types.js";
import type { BlueprintPreviewProvenance } from "../../../../shared/blueprint/preview-audit/types.js";

export interface MermaidRenderRequest {
  jobId: string;
  nodeId: string;
  mermaidSource: string;
  checksLedger?: Pick<ChecksLedgerService, "recordCheck">;
}

export type MermaidRenderResult =
  | {
      kind: "ok";
      nodeId: string;
      svg: string;
      contentHash: string;
      provenance: BlueprintPreviewProvenance;
    }
  | {
      kind: "skipped";
      nodeId: string;
      reason: "syntax_error";
      errorSummary: string;
    };

function normalizeSource(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s*-->\s*/g, "-->"))
    .filter(Boolean)
    .join("\n");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validateMermaid(source: string): string | null {
  if (!/^(graph|flowchart)\s+(TD|TB|BT|RL|LR)\b/i.test(source)) {
    return "Mermaid source must start with graph/flowchart and a direction.";
  }
  if (!source.includes("-->") && !source.includes("---")) {
    return "Mermaid source must contain at least one edge.";
  }
  return null;
}

function renderDeterministicSvg(normalizedSource: string): string {
  const lines = normalizedSource.split("\n");
  const width = 720;
  const height = Math.max(180, 80 + lines.length * 28);
  const textLines = lines
    .map(
      (line, index) =>
        `<text x="32" y="${48 + index * 28}" font-family="monospace" font-size="16">${escapeXml(line)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><g fill="#1f2937">${textLines}</g></svg>`;
}

function recordSyntaxError(
  request: MermaidRenderRequest,
  errorSummary: string,
): void {
  try {
    request.checksLedger?.recordCheck({
      jobId: request.jobId,
      stage: "effect_preview",
      checkType: "preview_audit",
      checkName: `preview_audit:mermaid:${request.nodeId}`,
      status: "fail",
      validator: "effect-preview/mermaid-renderer.ts",
      output: errorSummary,
      metadata: {
        nodeId: request.nodeId,
        renderer: "mermaid-deterministic",
      },
    });
  } catch {
    // Rendering syntax diagnostics must not block preview generation.
  }
}

export async function renderMermaidPreview(
  request: MermaidRenderRequest,
): Promise<MermaidRenderResult> {
  const normalized = normalizeSource(request.mermaidSource);
  const syntaxError = validateMermaid(normalized);
  if (syntaxError) {
    recordSyntaxError(request, syntaxError);
    return {
      kind: "skipped",
      nodeId: request.nodeId,
      reason: "syntax_error",
      errorSummary: syntaxError,
    };
  }

  const svg = renderDeterministicSvg(normalized);
  return {
    kind: "ok",
    nodeId: request.nodeId,
    svg,
    contentHash: sha256Hex(svg),
    provenance: {
      source: "model",
      ok: true,
      errorIndicators: [],
      generatedAt: "deterministic",
      modelUsed: "mermaid-deterministic",
      promptHash: sha256Hex(normalized),
      retryCount: 0,
    },
  };
}
