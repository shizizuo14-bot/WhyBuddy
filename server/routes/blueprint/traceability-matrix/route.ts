/**
 * `blueprint-v4-full-alignment` Module C — 矩阵查询路由（C.7）。
 *
 * GET /api/blueprint/jobs/:jobId/traceability-matrix
 *   ?format=markdown   可选，返回 Markdown 文本而非 JSON
 *
 * 404 当 job 不存在或矩阵未生成（R9.2）。
 * stale 标记（C.10b.2）：当 spec_tree 在矩阵生成后变更，返回 stale: true。
 */

import type { RequestHandler } from "express";
import type { BlueprintServiceContext } from "../context.js";
import type { BlueprintGenerationJob } from "../../../../shared/blueprint/contracts.js";

/**
 * 判断矩阵是否失效：job 标记了 staleArtifactIds 中含 spec_tree 相关产物。
 */
function isMatrixStale(job: BlueprintGenerationJob): boolean {
  const staleable = job as BlueprintGenerationJob & { staleArtifactIds?: string[] };
  const staleIds = staleable.staleArtifactIds ?? [];
  if (staleIds.length === 0) return false;
  // spec_tree / requirements / design / tasks 任一失效 → 矩阵失效
  return job.artifacts.some(
    (a) =>
      staleIds.includes(a.id) &&
      (a.type === "spec_tree" ||
        a.type === "requirements" ||
        a.type === "design" ||
        a.type === "tasks"),
  );
}

export function createTraceabilityMatrixRouteHandler(
  ctx: BlueprintServiceContext,
): RequestHandler {
  return (req, res) => {
    const jobId = req.params.jobId;
    const job = ctx.jobStore.get(jobId);
    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    const service = ctx.traceabilityMatrixService;
    if (!service) {
      res.status(404).json({ error: "matrix_not_generated" });
      return;
    }

    const stale = isMatrixStale(job);

    if (req.query.format === "markdown") {
      const md = service.exportMarkdown(jobId);
      res.type("text/markdown").send(md);
      return;
    }

    const matrix = service.exportJson(jobId);
    res.json({ ...matrix, stale });
  };
}
