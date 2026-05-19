# 设计：autopilot 子阶段 MiroFish 风格卡片原语

## 目录结构

```
client/src/pages/autopilot/right-rail/primitives/
├── index.ts                      # 统一 re-export
├── sub-stage-card.tsx            # <SubStageCard>
├── status-capsule.tsx            # <StatusCapsule>
├── metrics-row.tsx               # <MetricsRow>
└── __tests__/
    ├── sub-stage-card.test.tsx
    ├── status-capsule.test.tsx
    └── metrics-row.test.tsx
```

## 共享类型

### `SubStageStatus`

```ts
export type SubStageStatus = "completed" | "active" | "pending";
```

放在 `index.ts` 顶部 re-export，3 个 primitive 共用。

## `<StatusCapsule>` 组件

```tsx
export interface StatusCapsuleProps {
  status: SubStageStatus;
  locale: AppLocale;
}

const LABELS: Record<SubStageStatus, Record<AppLocale, string>> = {
  completed: { "zh-CN": "构建完成", "en-US": "DONE" },
  active:    { "zh-CN": "执行中",   "en-US": "RUNNING" },
  pending:   { "zh-CN": "等待",     "en-US": "PENDING" },
};

const STYLES: Record<SubStageStatus, string> = {
  completed: "bg-[#22c55e] text-white",
  active:    "bg-[#FF4500] text-white",
  pending:   "bg-[#F5F5F5] text-[#999]",
};

export function StatusCapsule({ status, locale }: StatusCapsuleProps) {
  return (
    <span
      data-testid="autopilot-status-capsule"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-none px-2.5 py-1",
        "font-mono text-[11px] font-bold uppercase tracking-[0.05em]",
        STYLES[status]
      )}
    >
      {LABELS[status][locale]}
      {status === "active" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-white" />
      ) : null}
    </span>
  );
}
```

## `<MetricsRow>` 组件

```tsx
export interface Metric {
  label: string;
  value: string | number;
  hint?: string;
}

export interface MetricsRowProps {
  metrics: Metric[];
  columns?: 2 | 3 | 4;
}

const COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function MetricsRow({ metrics, columns = 3 }: MetricsRowProps) {
  return (
    <dl
      data-testid="autopilot-metrics-row"
      data-columns={columns}
      className={cn("grid divide-x divide-[#EAEAEA]", COLS[columns])}
    >
      {metrics.map((metric, idx) => (
        <div key={idx} className="px-5 py-4">
          <dd className="font-mono text-[32px] font-medium leading-none text-black tabular-nums">
            {metric.value}
          </dd>
          <dt className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#999]">
            {metric.label}
          </dt>
          {metric.hint ? (
            <div className="mt-1 text-[11px] leading-[16px] text-[#666]">
              {metric.hint}
            </div>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
```

## `<SubStageCard>` 组件

```tsx
export interface SubStageCardProps {
  index: number;
  title: string;
  apiPath?: string;
  summary?: string;
  status: SubStageStatus;
  children: ReactNode;
  headerRight?: ReactNode;
  onToggleExpanded?: () => void;
  expanded?: boolean;
  locale: AppLocale;
}

const BORDER: Record<SubStageStatus, string> = {
  completed: "border-[#E5E5E5]",
  active:    "border-[#FF4500] border-2",
  pending:   "border-[#EAEAEA] opacity-50",
};

export function SubStageCard({
  index, title, apiPath, summary, status, children,
  headerRight, onToggleExpanded, expanded, locale,
}: SubStageCardProps) {
  const num = String(index + 1).padStart(2, "0");
  const toggleLabel = expanded
    ? (locale === "zh-CN" ? "收起 ↑" : "HIDE ↑")
    : (locale === "zh-CN" ? "展开 ↓" : "SHOW ↓");

  return (
    <article
      data-testid="autopilot-sub-stage-card"
      data-sub-stage-status={status}
      className={cn(
        "group bg-white border",
        BORDER[status]
      )}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#EAEAEA]">
        <div className="flex items-start gap-3 min-w-0">
          <span className="font-mono text-[12px] font-bold tracking-wider text-[#999] pt-0.5">
            {num}
          </span>
          <h3 className="text-[17px] font-medium leading-6 text-black">
            {title}
          </h3>
        </div>
        {headerRight ?? <StatusCapsule status={status} locale={locale} />}
      </header>

      {/* API path + Summary */}
      {(apiPath || summary) && (
        <div className="px-5 py-3 border-b border-[#EAEAEA]">
          {apiPath ? (
            <div className="font-mono text-[11px] text-[#999]">{apiPath}</div>
          ) : null}
          {summary ? (
            <p className="mt-1.5 text-[13px] leading-[22px] text-[#666]">{summary}</p>
          ) : null}
        </div>
      )}

      {/* Body */}
      <div className="py-1">{children}</div>

      {/* Toggle */}
      {onToggleExpanded ? (
        <footer className="px-5 py-2.5 border-t border-dashed border-[#EAEAEA] text-right">
          <button
            type="button"
            onClick={onToggleExpanded}
            data-testid="autopilot-sub-stage-card-toggle"
            className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#999] hover:text-black"
          >
            {toggleLabel}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
```

## 测试策略

### `status-capsule.test.tsx`（至少 3 case）

- 中文 completed 渲染「构建完成」
- 英文 active 渲染「RUNNING」+ 存在 `animate-pulse` 元素
- pending 渲染灰色 class（bg-[#F5F5F5]）

### `metrics-row.test.tsx`（至少 3 case）

- 默认 3 列：渲染 grid-cols-3
- 2 列 + 4 列：正确映射 grid-cols-2 / grid-cols-4
- 每个 metric 渲染 `<dt>` label + `<dd>` value + 可选 hint

### `sub-stage-card.test.tsx`（至少 3 case）

- completed status：border 是 `border-[#E5E5E5]`，右上角渲染 `StatusCapsule` 绿色
- active status：border 是 `border-[#FF4500] border-2`
- pending status：opacity-50
- `onToggleExpanded` + `expanded=false` 时 footer 显示「展开 ↓」，点击触发回调
- `headerRight` 自定义时覆盖默认胶囊
- 序号补零：index=4 渲染 `05`

## 集成点

本 primitive 不直接被任何现有文件 import。Wave 2 的 `autopilot-right-rail-streaming-layout` 会从 `@/pages/autopilot/right-rail/primitives` 引入这 3 个组件并组装。

## 性能边界

- 所有 primitive 是 pure function component，无 useMemo / useCallback（props 规模小）
- `MetricsRow` 的 metrics 数组直接 map，外层由 rail 主文件决定是否 memo 化
- `animate-pulse` 仅 `active` 胶囊使用，开销可忽略

## 可访问性

- `<article>` + `<header>` + `<footer>` + `<dl>/<dt>/<dd>` 语义标签
- toggle 按钮 `type="button"`
- 状态胶囊的状态同时用 `data-status` 暴露（颜色不是唯一信号）
