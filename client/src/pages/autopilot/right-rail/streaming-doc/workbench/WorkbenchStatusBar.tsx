/**
 * `autopilot-spec-documents-workbench-v2` — 顶部状态栏（Phase 1 / Task 2 + Phase 2 / Task 7）。
 *
 * 任务范围：
 * - 渲染主标题 `<h2>` 与副标题 `<p>`，缺失时使用稳定降级文案，绝不渲染
 *   空白 DOM。
 * - 渲染三个 `<button type="button">`：`export` / `review` / `refresh`，
 *   分别挂 `data-testid="autopilot-workbench-action-{export|review|refresh}"`。
 * - 按钮在 `generating !== null` 时禁用并设置 `aria-disabled="true"`；
 *   `export` 按钮额外受 `exportDisabled` 控制（jobId 缺失时由容器透传）。
 * - 不在本组件内部直接调用 `exportSpecDocumentsToDownload` 或父级处理函数；
 *   所有桥接由容器 `AutopilotSpecDocumentsWorkbench` 完成（R2.3 / R2.4 / R7.4）。
 * - Phase 2 / Task 7：渲染三个统计 badge（文档总数、任务总数、完成率）与三张
 *   文档类型卡片（requirements / design / tasks），数据来自容器透传的 `docStats`。
 *   不在本组件内部维护重复计数状态，所有数值均来自 `deriveDocStats`（R2.5-R2.10）。
 *
 * 设计契约：
 * - 不渲染空列表容器（`<ul>` / `<ol>` / `data-testid="...-list"`），保持
 *   下游空态测试稳定。
 * - 模块描述、props 与函数说明使用中文 JSDoc（R6.3）；`data-testid` 与 prop 名
 *   一律英文（R6.4）。
 */

import type { FC } from "react";
import { Download, Eye, RefreshCw } from "lucide-react";

import type { AppLocale } from "@/lib/locale";
import type { DocStats } from "./derive-doc-stats";

/**
 * 顶部状态栏 props。
 *
 * - `title`：当前蓝图主标题；缺失时使用稳定降级文案。
 * - `subtitle`：当前蓝图副标题；缺失时使用与主标题不同的稳定降级文案。
 * - `generating`：与 `AutopilotRightRail` 现有 `specDocsGenerating` 形状一致；
 *   `null` 表示当前没有生成中请求。
 * - `exportDisabled`：容器派生的导出按钮禁用态，覆盖默认 `generating !== null`
 *   语义；当 `jobId === undefined` 时容器会传 `true`。
 * - `docStats`：由容器通过 `deriveDocStats` 派生的统计聚合，用于渲染三个统计
 *   badge 与三张文档类型卡片（Phase 2 / Task 7）。可选，缺失时按全零渲染。
 * - `onExport` / `onReview` / `onRefresh`：三个动作按钮的点击回调。
 *   `onReview` 在本任务保留为 no-op 占位（容器中带 TODO 注释）。
 */
export interface WorkbenchStatusBarProps {
  title?: string;
  subtitle?: string;
  generating: "all" | "single" | null;
  onExport: () => void;
  onReview: () => void;
  onRefresh: () => void;
  /** 一键生成全部规格文档。缺失时不渲染按钮。 */
  onGenerateAll?: () => void;
  /**
   * 导出按钮额外禁用条件。容器在 `props.jobId === undefined` 或
   * `generating !== null` 时设为 `true`。
   */
  exportDisabled?: boolean;
  /**
   * 由容器通过 `deriveDocStats` 派生的统计聚合（R2.5-R2.10）。
   * 缺失时按全零渲染，确保组件不抛出异常。
   */
  docStats?: DocStats;
  locale: AppLocale;
}

// ---------------------------------------------------------------------------
// 文案降级
// ---------------------------------------------------------------------------

/**
 * 主标题降级文案：数据缺失时使用，确保 `<h2>` 永远有可读内容。
 */
function resolveTitle(title: string | undefined, locale: AppLocale): string {
  if (title && title.trim().length > 0) {
    return title;
  }
  return locale === "zh-CN" ? "当前蓝图概览" : "Blueprint Overview";
}

/**
 * 副标题降级文案：与主标题降级文案不同，避免视觉重复。
 */
function resolveSubtitle(
  subtitle: string | undefined,
  locale: AppLocale
): string {
  if (subtitle && subtitle.trim().length > 0) {
    return subtitle;
  }
  return locale === "zh-CN" ? "Spec 文档驾驶舱" : "Spec Documents Workbench";
}

/**
 * 三个动作按钮的中英文文案。
 */
function resolveActionLabels(locale: AppLocale): {
  exportLabel: string;
  reviewLabel: string;
  refreshLabel: string;
} {
  if (locale === "zh-CN") {
    return {
      exportLabel: "导出",
      reviewLabel: "评审",
      refreshLabel: "重新生成",
    };
  }
  return {
    exportLabel: "Export",
    reviewLabel: "Review",
    refreshLabel: "Refresh",
  };
}

// ---------------------------------------------------------------------------
// 默认全零 DocStats（数据缺失时使用，确保组件不抛出异常 R2.8）
// ---------------------------------------------------------------------------

const DEFAULT_DOC_STATS: DocStats = {
  totalDocs: 0,
  targetDocs: 0,
  totalTasks: 0,
  targetTasks: 0,
  completionRate: 0,
  byType: {
    requirements: { generated: 0, completed: 0 },
    design: { generated: 0, completed: 0 },
    tasks: { generated: 0, completed: 0 },
  },
};

/**
 * 文档类型卡片的中英文标签。
 */
function resolveDocTypeLabels(locale: AppLocale): {
  requirements: string;
  design: string;
  tasks: string;
} {
  if (locale === "zh-CN") {
    return { requirements: "需求", design: "设计", tasks: "任务" };
  }
  return { requirements: "Requirements", design: "Design", tasks: "Tasks" };
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

/**
 * 顶部状态栏组件。
 *
 * Phase 1 范围：标题、副标题、三个动作按钮（含禁用态与 `aria-disabled`）。
 * Phase 2 / Task 7 范围：三个统计 badge 与三张文档类型卡片。
 */
export const WorkbenchStatusBar: FC<WorkbenchStatusBarProps> = ({
  title,
  subtitle,
  generating,
  onExport,
  onReview,
  onRefresh,
  onGenerateAll,
  exportDisabled,
  docStats,
  locale,
}) => {
  const resolvedTitle = resolveTitle(title, locale);
  const resolvedSubtitle = resolveSubtitle(subtitle, locale);
  const { exportLabel, reviewLabel, refreshLabel } = resolveActionLabels(locale);
  const docTypeLabels = resolveDocTypeLabels(locale);

  // R2 / R6.5：generating !== null 时三个按钮统一禁用；
  // export 按钮额外受 exportDisabled 控制（jobId 缺失场景）。
  const baseDisabled = generating !== null;
  const isExportDisabled = baseDisabled || exportDisabled === true;
  const isReviewDisabled = baseDisabled;
  const isRefreshDisabled = baseDisabled;

  // 使用容器透传的 docStats，缺失时按全零渲染（R2.8）
  const stats = docStats ?? DEFAULT_DOC_STATS;
  const docsMetricLabel = locale === "zh-CN" ? "文档生成" : "Docs generated";
  const tasksMetricLabel = locale === "zh-CN" ? "任务文档" : "Task docs";
  const completionMetricLabel =
    locale === "zh-CN" ? "已验收率" : "Accepted rate";

  return (
    <section
      data-testid="autopilot-workbench-status-bar"
      role="banner"
      aria-label="autopilot workbench status bar"
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2
            data-testid="autopilot-workbench-title"
            className="truncate text-sm font-bold text-slate-950"
          >
            {resolvedTitle}
          </h2>
          <p
            data-testid="autopilot-workbench-subtitle"
            className="mt-0.5 truncate text-[11px] font-medium text-slate-500"
          >
            {resolvedSubtitle}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1">
          {onGenerateAll ? (
            <button
              type="button"
              data-testid="autopilot-workbench-action-generate-all"
              onClick={onGenerateAll}
              disabled={baseDisabled}
              aria-disabled={baseDisabled}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-900 px-2 text-[10px] font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <span className="truncate">{generating === "all" ? (locale === "zh-CN" ? "生成中..." : "Generating...") : (locale === "zh-CN" ? "生成全部" : "Generate All")}</span>
            </button>
          ) : null}
          <button
            type="button"
            data-testid="autopilot-workbench-action-export"
            onClick={onExport}
            disabled={isExportDisabled}
            aria-disabled={isExportDisabled}
            className="inline-flex h-7 max-w-[74px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Download className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{exportLabel}</span>
          </button>
          <button
            type="button"
            data-testid="autopilot-workbench-action-review"
            onClick={onReview}
            disabled={isReviewDisabled}
            aria-disabled={isReviewDisabled}
            className="inline-flex h-7 max-w-[74px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{reviewLabel}</span>
          </button>
          <button
            type="button"
            data-testid="autopilot-workbench-action-refresh"
            onClick={onRefresh}
            disabled={isRefreshDisabled}
            aria-disabled={isRefreshDisabled}
            className="inline-flex h-7 max-w-[86px] items-center gap-1 rounded-md bg-slate-900 px-2 text-[10px] font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{refreshLabel}</span>
          </button>
        </div>
      </div>
      {/* Phase 2 / Task 7：三个统计 badge（R2.5） */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1">
          <div className="truncate text-[9px] font-semibold uppercase leading-tight text-slate-400">
            {docsMetricLabel}
          </div>
          <span
            data-testid="autopilot-workbench-stat-docs"
            className="block truncate text-[13px] font-bold leading-tight text-slate-950"
          >{stats.totalDocs} / {stats.targetDocs}</span>
        </div>
        <div className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-1">
          <div className="truncate text-[9px] font-semibold uppercase leading-tight text-emerald-600">
            {tasksMetricLabel}
          </div>
          <span
            data-testid="autopilot-workbench-stat-tasks"
            className="block truncate text-[13px] font-bold leading-tight text-emerald-900"
          >{stats.totalTasks} / {stats.targetTasks}</span>
        </div>
        <div className="min-w-0 rounded-md border border-cyan-100 bg-cyan-50 px-1.5 py-1">
          <div className="truncate text-[9px] font-semibold uppercase leading-tight text-cyan-600">
            {completionMetricLabel}
          </div>
          <span
            data-testid="autopilot-workbench-stat-completion"
            className="block truncate text-[13px] font-bold leading-tight text-cyan-950"
          >{Math.round(stats.completionRate * 100)}%</span>
        </div>
      </div>
      {/* Phase 2 / Task 7：三张文档类型卡片（R2.7） */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <div
          data-testid="autopilot-workbench-doctype-card-requirements"
          className="min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1"
        >
          <span className="block truncate text-[10px] font-semibold leading-tight text-slate-600">
            {docTypeLabels.requirements}
          </span>
          <span className="block truncate text-[11px] font-bold leading-tight text-slate-900">{stats.byType.requirements.generated} / {stats.byType.requirements.completed}</span>
        </div>
        <div
          data-testid="autopilot-workbench-doctype-card-design"
          className="min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1"
        >
          <span className="block truncate text-[10px] font-semibold leading-tight text-slate-600">
            {docTypeLabels.design}
          </span>
          <span className="block truncate text-[11px] font-bold leading-tight text-slate-900">{stats.byType.design.generated} / {stats.byType.design.completed}</span>
        </div>
        <div
          data-testid="autopilot-workbench-doctype-card-tasks"
          className="min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1"
        >
          <span className="block truncate text-[10px] font-semibold leading-tight text-slate-600">
            {docTypeLabels.tasks}
          </span>
          <span className="block truncate text-[11px] font-bold leading-tight text-slate-900">{stats.byType.tasks.generated} / {stats.byType.tasks.completed}</span>
        </div>
      </div>
    </section>
  );
};

export default WorkbenchStatusBar;
