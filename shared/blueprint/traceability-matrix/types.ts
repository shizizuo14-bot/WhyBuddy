/**
 * `blueprint-v4-full-alignment` Module C — 可追溯矩阵共享类型。
 *
 * 需求↔设计↔任务↔证据↔用例 五元结构化对应（R6）。
 * 纯类型，无 runtime 副作用。
 */

/**
 * 单条追溯矩阵条目（五元对应，R6.1）。
 */
export interface TraceabilityMatrixEntry {
  requirementId: string;
  requirementTitle: string;
  designSections: string[];
  taskIds: string[];
  evidenceSources: string[];
  testCases: string[];
}

/**
 * 缺口（R6.4）：逐需求列出缺哪几维，让矩阵从"展示"变"守卫"。
 */
export interface TraceabilityGap {
  requirementId: string;
  requirementTitle: string;
  missingLinks: ("design" | "task" | "evidence" | "test")[];
}

/**
 * 覆盖率统计（R6.3）。
 */
export interface TraceabilityCoverage {
  totalRequirements: number;
  coveredByDesign: number;
  coveredByTasks: number;
  coveredByEvidence: number;
  coveredByTests: number;
  coveragePercent: number;
  gaps: TraceabilityGap[];
}

/**
 * 完整追溯矩阵（R6.2）。
 */
export interface TraceabilityMatrix {
  jobId: string;
  generatedAt: string;
  entries: TraceabilityMatrixEntry[];
  coverage: TraceabilityCoverage;
  /** 矩阵是否已失效（spec_tree 变更后，R8.5/C.10b.2） */
  stale?: boolean;
}

/**
 * 矩阵服务接口（R7.1）。
 */
export interface TraceabilityMatrixService {
  generateMatrix(jobId: string): TraceabilityMatrix;
  exportJson(jobId: string): TraceabilityMatrix;
  exportMarkdown(jobId: string): string;
}
