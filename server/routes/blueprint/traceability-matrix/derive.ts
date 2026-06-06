/**
 * `blueprint-v4-full-alignment` Module C — 矩阵派生（纯函数，C.4）。
 *
 * 从 spec_tree 节点 + spec documents 派生五元追溯矩阵。
 *
 * 节点类型映射（已对齐真实 SpecTreeLlmNodeSchema 枚举）：
 *   root | route_step | alternative_route | spec_document |
 *   effect_preview | prompt_package | engineering_plan
 *
 * - requirements = type === "route_step"（需求级节点）
 * - design       = type === "spec_document"
 * - tasks        = type === "engineering_plan"
 * - evidence     = outputs[] + metadata.evidenceSources
 * - tests        = spec documents (type==="tasks") 中的 acceptance criteria
 */

import type {
  BlueprintSpecTreeNode,
  BlueprintSpecDocument,
} from "../../../../shared/blueprint/contracts.js";
import type {
  TraceabilityMatrix,
  TraceabilityMatrixEntry,
  TraceabilityCoverage,
  TraceabilityGap,
} from "../../../../shared/blueprint/traceability-matrix/types.js";

/**
 * 判断某节点是否是给定 requirement 节点的后代（按 parentId 链）。
 */
function isDescendantOf(
  node: BlueprintSpecTreeNode,
  requirementId: string,
  nodeById: Map<string, BlueprintSpecTreeNode>,
): boolean {
  let current: BlueprintSpecTreeNode | undefined = node;
  const guard = new Set<string>();
  while (current?.parentId && !guard.has(current.id)) {
    guard.add(current.id);
    if (current.parentId === requirementId) return true;
    current = nodeById.get(current.parentId);
  }
  return false;
}

/** 提取节点的证据来源（outputs + metadata.evidenceSources） */
function nodeEvidence(node: BlueprintSpecTreeNode): string[] {
  const out = Array.isArray(node.outputs) ? [...node.outputs] : [];
  const ev = node.metadata?.evidenceSources;
  if (Array.isArray(ev)) {
    out.push(...ev.map((e) => String(e)));
  }
  return out;
}

/** 从 tasks 类型 spec document 中提取 acceptance criteria 行 */
function extractTestCases(specDocs: BlueprintSpecDocument[]): Map<string, string[]> {
  const byNode = new Map<string, string[]>();
  for (const doc of specDocs) {
    if (doc.type !== "tasks") continue;
    const content = (doc as { content?: string }).content ?? "";
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /- \[[ x]\]/.test(l));
    if (lines.length > 0) {
      const existing = byNode.get(doc.nodeId) ?? [];
      byNode.set(doc.nodeId, [...existing, ...lines.map((l) => l.replace(/- \[[ x]\]\s*/, ""))]);
    }
  }
  return byNode;
}

export function deriveMatrix(
  jobId: string,
  nodes: BlueprintSpecTreeNode[],
  specDocs: BlueprintSpecDocument[],
  generatedAt: string,
): TraceabilityMatrix {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const requirements = nodes.filter((n) => n.type === "route_step");
  const designNodes = nodes.filter((n) => n.type === "spec_document");
  const taskNodes = nodes.filter((n) => n.type === "engineering_plan");
  const testsByNode = extractTestCases(specDocs);

  const entries: TraceabilityMatrixEntry[] = requirements.map((req) => {
    const designSections = designNodes
      .filter((d) => d.parentId === req.id || isDescendantOf(d, req.id, nodeById))
      .map((d) => d.title);
    const taskIds = taskNodes
      .filter((t) => t.parentId === req.id || isDescendantOf(t, req.id, nodeById))
      .map((t) => t.id);
    const evidenceSources = nodeEvidence(req);
    // 测试用例：req 节点自身 + 其后代 design/task 节点关联的 spec doc tests
    const relatedNodeIds = [
      req.id,
      ...designNodes.filter((d) => isDescendantOf(d, req.id, nodeById) || d.parentId === req.id).map((d) => d.id),
      ...taskNodes.filter((t) => isDescendantOf(t, req.id, nodeById) || t.parentId === req.id).map((t) => t.id),
    ];
    const testCases: string[] = [];
    for (const nid of relatedNodeIds) {
      const t = testsByNode.get(nid);
      if (t) testCases.push(...t);
    }

    return {
      requirementId: req.id,
      requirementTitle: req.title,
      designSections,
      taskIds,
      evidenceSources,
      testCases,
    };
  });

  const coverage = computeCoverage(entries);

  return { jobId, generatedAt, entries, coverage };
}

function computeCoverage(entries: TraceabilityMatrixEntry[]): TraceabilityCoverage {
  let coveredByDesign = 0;
  let coveredByTasks = 0;
  let coveredByEvidence = 0;
  let coveredByTests = 0;
  const gaps: TraceabilityGap[] = [];

  for (const e of entries) {
    const hasDesign = e.designSections.length > 0;
    const hasTask = e.taskIds.length > 0;
    const hasEvidence = e.evidenceSources.length > 0;
    const hasTest = e.testCases.length > 0;

    if (hasDesign) coveredByDesign++;
    if (hasTask) coveredByTasks++;
    if (hasEvidence) coveredByEvidence++;
    if (hasTest) coveredByTests++;

    const missingLinks: TraceabilityGap["missingLinks"] = [];
    if (!hasDesign) missingLinks.push("design");
    if (!hasTask) missingLinks.push("task");
    if (!hasEvidence) missingLinks.push("evidence");
    if (!hasTest) missingLinks.push("test");

    if (missingLinks.length > 0) {
      gaps.push({
        requirementId: e.requirementId,
        requirementTitle: e.requirementTitle,
        missingLinks,
      });
    }
  }

  const total = entries.length;
  // 覆盖率：每条需求四维全覆盖才算完全覆盖
  const fullyCovered = entries.filter(
    (e) =>
      e.designSections.length > 0 &&
      e.taskIds.length > 0 &&
      e.evidenceSources.length > 0 &&
      e.testCases.length > 0,
  ).length;
  const coveragePercent = total === 0 ? 100 : Math.round((fullyCovered / total) * 100);

  return {
    totalRequirements: total,
    coveredByDesign,
    coveredByTasks,
    coveredByEvidence,
    coveredByTests,
    coveragePercent,
    gaps,
  };
}
