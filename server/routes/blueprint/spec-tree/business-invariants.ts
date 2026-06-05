/**
 * `blueprint-v4-full-alignment` Module D — S4 业务语义不变量（纯函数）。
 *
 * 两条软检查（R10/R11/D §D）：
 * 1. checkRequirementCoverage — 每条 successCriterion 是否被节点覆盖
 * 2. checkNodeEvidence — 每个非根节点是否挂证据
 *
 * 关键策略：均为**软检查**——不调 ctx.addIssue()、不拦规格树，只产出结果供
 * 上层写入 checksLedger。与 QA_CONTENT 的非阻塞哲学一致。
 */

import type { BlueprintSpecTreeNode } from "../../../../shared/blueprint/contracts.js";
import type { BlueprintCheckStatus } from "../../../../shared/blueprint/checks-ledger/types.js";

export interface BusinessInvariantResult {
  status: BlueprintCheckStatus;
  /** 未通过项的标识列表（未覆盖的 criteria 或缺证据的 nodeId） */
  offending: string[];
  output: string;
}

// ---------------------------------------------------------------------------
// 归一化与关键词匹配
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 提取关键词（长度 ≥ 3 的 token），过滤常见停用词 */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "shall", "should",
  "must", "will", "can", "able", "user", "system", "support",
]);

function keywords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
  );
}

/** 两个关键词集合是否有交集 */
function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) {
    if (b.has(w)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// D.1 需求覆盖检查（两级匹配）
// ---------------------------------------------------------------------------

/**
 * 检查每条 successCriterion 是否被至少一个节点覆盖。
 *
 * 两级匹配（R10.3）：
 * 1. 显式声明：node.metadata.coversCriteria 包含该 criterion 标识
 * 2. 关键词兜底：criterion 的关键词与节点 title+summary+outputs 有交集
 *
 * status：全覆盖=pass；未覆盖 ≤50%=warn；未覆盖 >50%=fail
 */
export function checkRequirementCoverage(
  successCriteria: string[],
  nodes: BlueprintSpecTreeNode[],
): BusinessInvariantResult {
  if (successCriteria.length === 0) {
    return { status: "skip", offending: [], output: "no successCriteria to check" };
  }

  // 预计算每个节点的显式声明集合 + 关键词集合
  const nodeExplicit: Set<string>[] = nodes.map((n) => {
    const covers = n.metadata?.coversCriteria;
    if (Array.isArray(covers)) {
      // 同时存原始值和归一化值，兼容多种声明形式
      const set = new Set<string>();
      for (const c of covers) {
        const raw = String(c);
        set.add(raw);
        set.add(normalize(raw));
      }
      return set;
    }
    return new Set<string>();
  });
  const nodeKeywords: Set<string>[] = nodes.map((n) =>
    keywords([n.title, n.summary, ...(n.outputs ?? [])].join(" ")),
  );

  const uncovered: string[] = [];

  for (let ci = 0; ci < successCriteria.length; ci++) {
    const criterion = successCriteria[ci];
    const criterionNorm = normalize(criterion);
    const criterionKw = keywords(criterion);

    let covered = false;
    for (let ni = 0; ni < nodes.length; ni++) {
      // 1. 显式声明优先
      if (
        nodeExplicit[ni].has(criterionNorm) ||
        nodeExplicit[ni].has(String(ci)) ||
        nodeExplicit[ni].has(`criterion-${ci}`)
      ) {
        covered = true;
        break;
      }
      // 2. 关键词兜底
      if (criterionKw.size > 0 && hasOverlap(criterionKw, nodeKeywords[ni])) {
        covered = true;
        break;
      }
    }

    if (!covered) {
      uncovered.push(criterion.slice(0, 80));
    }
  }

  if (uncovered.length === 0) {
    return {
      status: "pass",
      offending: [],
      output: `all ${successCriteria.length} success criteria covered`,
    };
  }

  const ratio = uncovered.length / successCriteria.length;
  const status: BlueprintCheckStatus = ratio > 0.5 ? "fail" : "warn";
  return {
    status,
    offending: uncovered,
    output: `${uncovered.length}/${successCriteria.length} criteria uncovered: ${uncovered.slice(0, 5).join("; ")}`,
  };
}

// ---------------------------------------------------------------------------
// D.2 节点证据检查
// ---------------------------------------------------------------------------

/**
 * 检查每个非根节点是否至少有一个 outputs 项或 metadata.evidenceSources 项。
 *
 * status：全部有证据=pass；缺证据 ≤50%=warn；缺证据 >50%=fail
 */
export function checkNodeEvidence(
  nodes: BlueprintSpecTreeNode[],
): BusinessInvariantResult {
  const nonRoot = nodes.filter((n) => n.type !== "root");
  if (nonRoot.length === 0) {
    return { status: "skip", offending: [], output: "no non-root nodes to check" };
  }

  const lacking: string[] = [];
  for (const n of nonRoot) {
    const hasOutputs = Array.isArray(n.outputs) && n.outputs.length > 0;
    const evidenceSources = n.metadata?.evidenceSources;
    const hasEvidence =
      Array.isArray(evidenceSources) && evidenceSources.length > 0;
    if (!hasOutputs && !hasEvidence) {
      lacking.push(n.id);
    }
  }

  if (lacking.length === 0) {
    return {
      status: "pass",
      offending: [],
      output: `all ${nonRoot.length} non-root nodes carry evidence`,
    };
  }

  const ratio = lacking.length / nonRoot.length;
  const status: BlueprintCheckStatus = ratio > 0.5 ? "fail" : "warn";
  return {
    status,
    offending: lacking,
    output: `${lacking.length}/${nonRoot.length} nodes lack evidence: ${lacking.slice(0, 10).join(", ")}`,
  };
}
