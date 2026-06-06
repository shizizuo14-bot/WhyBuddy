/**
 * `blueprint-v4-full-alignment` Module C — 矩阵导出（C.6）。
 *
 * JSON 导出即 TraceabilityMatrix 本身；Markdown 渲染为五列表格 + 缺口区块。
 */

import type { TraceabilityMatrix } from "../../../../shared/blueprint/traceability-matrix/types.js";

/**
 * 渲染追溯矩阵为 Markdown 表格（R8.2）。
 * 列：需求 | 设计章节 | 任务项 | 证据来源 | 测试用例
 */
export function renderMatrixMarkdown(matrix: TraceabilityMatrix): string {
  const lines: string[] = ["## 可追溯矩阵 (Traceability Matrix)", ""];

  if (matrix.entries.length === 0) {
    lines.push("暂无追溯条目。", "");
    return lines.join("\n");
  }

  if (matrix.stale) {
    lines.push("> ⚠️ 此矩阵已失效（spec_tree 在生成后发生变更），请重新生成。", "");
  }

  lines.push("| 需求 | 设计章节 | 任务项 | 证据来源 | 测试用例 |");
  lines.push("|------|----------|--------|----------|----------|");
  for (const e of matrix.entries) {
    lines.push(
      `| ${e.requirementTitle} | ${e.designSections.join("<br/>") || "—"} | ${e.taskIds.join("<br/>") || "—"} | ${e.evidenceSources.join("<br/>") || "—"} | ${e.testCases.slice(0, 3).join("<br/>") || "—"} |`,
    );
  }

  lines.push("");
  lines.push("### 覆盖率");
  const c = matrix.coverage;
  lines.push(
    `- 总需求: ${c.totalRequirements} | 设计覆盖: ${c.coveredByDesign} | 任务覆盖: ${c.coveredByTasks} | 证据覆盖: ${c.coveredByEvidence} | 测试覆盖: ${c.coveredByTests} | 全链覆盖率: ${c.coveragePercent}%`,
  );

  // 缺口区块（R6.4）：让矩阵从"展示"变"守卫"
  if (c.gaps.length > 0) {
    lines.push("");
    lines.push("### ⚠️ 覆盖缺口");
    for (const g of c.gaps) {
      lines.push(`- **${g.requirementTitle}** 缺少：${g.missingLinks.join(", ")}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
