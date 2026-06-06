/**
 * `blueprint-v4-full-alignment` Module C — 矩阵服务（C.5）。
 *
 * createTraceabilityMatrixService(ctx)：从 job 提取 spec_tree 节点 + spec
 * documents，调用 deriveMatrix 产出五元矩阵。env gate 关闭时返回空矩阵。
 */

import type { BlueprintServiceContext } from "../context.js";
import type {
  BlueprintSpecTree,
  BlueprintSpecDocument,
  BlueprintGenerationJob,
} from "../../../../shared/blueprint/contracts.js";
import type {
  TraceabilityMatrix,
  TraceabilityMatrixService,
} from "../../../../shared/blueprint/traceability-matrix/types.js";
import { deriveMatrix } from "./derive.js";
import { renderMatrixMarkdown } from "./export.js";

const ENV_KEY = "BLUEPRINT_TRACEABILITY_MATRIX_ENABLED";

const SPEC_DOC_TYPES = new Set(["requirements", "design", "tasks"]);

function emptyMatrix(jobId: string, generatedAt: string): TraceabilityMatrix {
  return {
    jobId,
    generatedAt,
    entries: [],
    coverage: {
      totalRequirements: 0,
      coveredByDesign: 0,
      coveredByTasks: 0,
      coveredByEvidence: 0,
      coveredByTests: 0,
      coveragePercent: 100,
      gaps: [],
    },
  };
}

function extractSpecTree(job: BlueprintGenerationJob): BlueprintSpecTree | undefined {
  const artifact = job.artifacts.find((a) => a.type === "spec_tree");
  return artifact?.payload as BlueprintSpecTree | undefined;
}

function extractSpecDocuments(job: BlueprintGenerationJob): BlueprintSpecDocument[] {
  return job.artifacts
    .filter((a) => SPEC_DOC_TYPES.has(a.type))
    .map((a) => a.payload as BlueprintSpecDocument)
    .filter((d): d is BlueprintSpecDocument => !!d && typeof d === "object");
}

export function createTraceabilityMatrixService(
  ctx: BlueprintServiceContext,
): TraceabilityMatrixService {
  const enabled = process.env[ENV_KEY] === "true";

  function build(jobId: string): TraceabilityMatrix {
    const generatedAt = ctx.now().toISOString();
    if (!enabled) return emptyMatrix(jobId, generatedAt);

    const job = ctx.jobStore.get(jobId);
    if (!job) return emptyMatrix(jobId, generatedAt);

    const specTree = extractSpecTree(job);
    if (!specTree || !Array.isArray(specTree.nodes)) {
      return emptyMatrix(jobId, generatedAt);
    }
    const specDocs = extractSpecDocuments(job);

    return deriveMatrix(jobId, specTree.nodes, specDocs, generatedAt);
  }

  return {
    generateMatrix: build,
    exportJson: build,
    exportMarkdown(jobId: string): string {
      return renderMatrixMarkdown(build(jobId));
    },
  };
}
