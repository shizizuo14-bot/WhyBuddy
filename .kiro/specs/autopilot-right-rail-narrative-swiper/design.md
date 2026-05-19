# 设计文档：Autopilot 右栏底部叙事 Swiper

## 概述

本设计把 Autopilot 主壳右栏底部的“流式日志输出”从“黑底等宽控制台”升级为“阶段化叙事卡片流”。改造采用**组合 + 视图重排**的策略，不改后端契约、不改 store、不删除既有组件。

总体结构由两条轴构成：

- **右下叙事轴 `NarrativeSwiper`**：固定在右栏底部，承担 6 个阶段的叙事卡片流（reasoning / role-status / capability / fleet-activation / route-decision / artifact）。
- **左下系统流水轴 `MiniConsoleBar`**：把现有 `AutopilotConsolePanel` 折叠为 80-120px 的 mini bar，hover / click 展开为 `ExpandedConsolePanel`，承担 job 调度、HTTP 错误、原始 SSE 等系统流水。

两轴之间通过一份**共享 source-routing 模块**（`right-rail-console-routing.ts`）保证职责互不重叠：同一条原始 entry 可同时出现在左右两侧，但展示字段焦点不同。

> 设计目标：让叙事 Swiper 成为演示主线，让 Mini Console 成为审计抽屉。

## 架构

### 高层组件树

```
<AutopilotRoutePage>
├── <AutopilotWorkflowRail>            // 现有
│   └── <AutopilotRightRail>           // 现有 — 改造点 1：底部新增 NarrativeSwiper
│       ├── <RoleStatusStrip />        // 复用，呈现层接入 NarrativeSwiper（组合）
│       ├── <StageViewport>...</...>   // 6 个产品对象主区，不改
│       ├── <CapabilityRail />         // 复用，呈现层接入 NarrativeSwiper（组合）
│       ├── <FleetActivationLog />     // 复用，呈现层接入 NarrativeSwiper（组合）
│       └── ★ <NarrativeSwiper />      // 新增 — 右栏底部固定，22-30% 高度
└── <AutopilotWorkflowVisualStage>     // 现有 — 改造点 2：把 AutopilotConsolePanel 包成 MiniConsoleBar
    └── <Scene3D />
    └── ★ <MiniConsoleBar>             // 新增 — 默认折叠，80-120px
        └── <ExpandedConsolePanel>     // hover/click 展开，复用现有 AutopilotConsolePanel
```

### 数据流

```
                 ┌─────────────────────────────────────────────┐
                 │  useBlueprintRealtimeStore                  │
                 │  - agentReasoning.entries                   │
                 │  - capabilityStatuses                       │
                 │  - rolePhases                               │
                 │  - agentProgress                            │
                 └──────────┬──────────────────┬───────────────┘
                            │                  │
                            ▼                  ▼
              deriveMiroFishStreamEntries   useRoleCrewState
                  (existing, reused)       (existing, reused)
                            │
                            ▼
              ┌─────────────────────────────────┐
              │  useNarrativeCardStream(...)    │  ← 新 hook
              │  - 合并 6 路 source             │
              │  - 节流（按 source / 1s）        │
              │  - 阶段过滤 + 共享 source-routing│
              │  - 容量 8 + FIFO + 跨阶段保留    │
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │  <NarrativeSwiper />            │  ← 新组件
              │  - Auto_Rotation 调度（≤1 步/s） │
              │  - hover / focus / drag pause   │
              │  - StageVisualLane 主题切换     │
              │  - aria-live 播报               │
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │  <NarrativeCard variant=…/>     │  ← 新组件
              │  按 Card_Source 分发到子卡片：   │
              │  - <ReasoningCard/>             │  （复用 mirofish-stream/cards/*）
              │  - <CapabilityInvocationCard/>  │  （复用）
              │  - <ArtifactCreatedCard/>       │  （复用）
              │  - <RouteDecisionCard/>         │  （复用）
              │  - <NodeCompletedCard/>         │  （复用）
              │  - <RoleStatusCard/>            │  （新，引用 RoleStatusStrip 派生）
              │  - <FleetActivationCard/>       │  （新，引用 FleetActivationLog 派生）
              └─────────────────────────────────┘
```

`MiniConsoleBar` 单独消费 `consoleLines`（既有 `buildConsoleLines` 的产物），并通过共享 `right-rail-console-routing.ts` 决定哪些 entry 不重复出现在 NarrativeSwiper 中。

## 文件规划

新增（落点统一在 `client/src/pages/autopilot/right-rail/narrative-swiper/`）：

| 路径 | 角色 |
| --- | --- |
| `narrative-swiper/NarrativeSwiper.tsx` | 主组件：容器 + Auto_Rotation + 手势 + StageVisualLane 切换 |
| `narrative-swiper/NarrativeCard.tsx` | 单卡分发器：按 `Card_Source` 路由到子卡片 |
| `narrative-swiper/use-narrative-card-stream.ts` | hook：合并 6 路 source + 节流 + 阶段过滤 + 容量 |
| `narrative-swiper/narrative-card-types.ts` | 类型：`NarrativeCard`、`CardSource`、`StageVisualLane` |
| `narrative-swiper/stage-visual-lane.ts` | 6 个 Stage 的视觉 token（背景纹理 / 装饰 / 入退场 motion） |
| `narrative-swiper/use-auto-rotation.ts` | hook：Dwell_Time 调度 + 暂停/恢复 + Reduced_Motion 降级 |
| `narrative-swiper/cards/RoleStatusCard.tsx` | 新子卡：把 `rolePhases` 单条目渲染成圆桌头像气泡 |
| `narrative-swiper/cards/FleetActivationCard.tsx` | 新子卡：把 `agentProgress`/讨论单条目渲染成激活 chip |
| `narrative-swiper/cards/index.ts` | 子卡片 barrel |
| `narrative-swiper/__tests__/NarrativeSwiper.test.tsx` | SSR 契约测试 |
| `narrative-swiper/__tests__/use-narrative-card-stream.test.ts` | hook 单元测试 |
| `narrative-swiper/__tests__/use-auto-rotation.test.ts` | hook 单元测试（fake timers） |
| `right-rail-console-routing.ts` | 共享：决定 entry 走左下 / 右下 / 双侧的 source enum |
| `mini-console/MiniConsoleBar.tsx` | 新组件：折叠态 + 展开触发 |
| `mini-console/ExpandedConsolePanel.tsx` | 新组件：薄包装 `AutopilotConsolePanel`，承担定位与 esc 折叠 |
| `mini-console/use-console-collapse-state.ts` | hook：sessionStorage 偏好 + hover 延迟 |
| `mini-console/__tests__/MiniConsoleBar.test.tsx` | SSR 契约测试 |

修改（不删除）：

| 路径 | 改动 |
| --- | --- |
| `right-rail/AutopilotRightRail.tsx` | 在 `<aside>` return 块底部挂载 `<NarrativeSwiper />`；保留 `RoleStatusStrip / CapabilityRail / FleetActivationLog` 既有挂载（它们仍承担非叙事场景的小条带角色） |
| `AutopilotRoutePage.tsx` | 把 `<AutopilotConsolePanel ... />` 包一层 `<MiniConsoleBar>`（通过 `ExpandedConsolePanel` 复用 `AutopilotConsolePanel`） |
| `right-rail/index.ts` | 导出新组件 |
| `client/src/i18n/zh-CN.ts` / `client/src/i18n/en-US.ts` | 新增叙事文案键（如 `narrativeSwiper.lane.input.empty`） |

> 物理约束：现有 4 个组件的对外 API、`MiroFishCardStream` 的 `derive-mirofish-stream-entries.ts` 签名、`useBlueprintRealtimeStore` 的字段均**不变更**（需求 10.1 / 10.2 / 10.3）。

## 类型与契约

### `NarrativeCard`

```ts
// narrative-card-types.ts
export type CardSource =
  | "reasoning"
  | "role-status"
  | "capability"
  | "fleet-activation"
  | "route-decision"
  | "artifact";

export type Stage =
  | "input"
  | "clarify"
  | "route"
  | "spec-tree"
  | "spec-doc"
  | "preview";

export type CardSeverity = "info" | "success" | "warning" | "danger";

export interface NarrativeCard {
  /** 稳定 id；优先复用底层 entry id，否则按 source + occurredAt 派生。*/
  id: string;
  source: CardSource;
  /** 卡片所属 Stage；缺失时视为 "global"，默认在所有 Stage 显示。*/
  stage: Stage | "global";
  /** 单行主标题，已 i18n。*/
  headline: string;
  /** 可选副文（≤ 80 字），已 i18n。*/
  detail?: string;
  /** 可选演员/角色头像；URL 或资源 token。*/
  actorAvatar?: string;
  severity?: CardSeverity;
  /** 入队 / 更新时间（ms）。*/
  occurredAt: number;
  /** 派生指针：原始底层 entry 的 id，用于原地更新。*/
  sourceEntryId?: string;
  /** 来源路由意图：narrative-only | console-only | both。
   *  与 right-rail-console-routing.ts 输出对齐，判定是否进入队列。*/
  routing: "narrative-only" | "both";
}
```

### `StageVisualLane`

```ts
// stage-visual-lane.ts
export interface StageVisualLane {
  stage: Stage;
  /** 中文 + 英文 i18n 描述键（用于 aria-label）。*/
  ariaLabelKey: string;
  /** 背景纹理 className（基于 Tailwind / 自定义 utility）。*/
  backgroundClass: string;
  /** 卡片边框语言 className。*/
  cardBorderClass: string;
  /** 入场 motion 配置（framer-motion variants）。*/
  enterVariants: Variants;
  /** 退场 motion 配置。*/
  exitVariants: Variants;
  /** 主装饰图标族 token（lucide-react 图标名）。*/
  decorationIcon: string;
  /** Dwell_Time 覆写（ms），不写则用全局默认 5000。*/
  dwellTimeMs?: number;
}

export const STAGE_VISUAL_LANES: Record<Stage, StageVisualLane> = { ... };
```

设计规则（对应需求 1.3 / 11.2）：6 个 Lane 共用 OKLCH 冷灰基底（继承 `--background` / `--accent` / `--muted`），差异化只发生在：

- `backgroundClass`：单据柜台（细横线纹理）/ 圆桌会议（径向暖光）/ 调度台（雷达扫描）/ 图书馆（书脊竖线）/ 写作工坊（纸纹）/ 小剧场（暗场聚光）。
- `decorationIcon`：`Mail` / `Users` / `Radar` / `Library` / `PenTool` / `Spotlight`。
- `enterVariants` / `exitVariants`：clarify 用对话气泡 scale、preview 用幕布 fade，其它阶段共用基础 slide。
- preview lane 的 glow 强度 ≤ `glow-button` 上限（需求 11.4）。

### `right-rail-console-routing.ts`

共享 source-routing（需求 4.5）：

```ts
export type RoutingTarget = "narrative-only" | "console-only" | "both";

export interface RoutingDecision {
  target: RoutingTarget;
  /** 当 target = "both" 时，左下与右下应展示的字段子集。*/
  consoleFields?: ReadonlyArray<"jobId" | "channel" | "raw">;
  narrativeFields?: ReadonlyArray<"headline" | "actorAvatar" | "severity">;
}

export function routeMiroFishEntry(entry: MiroFishStreamEntry): RoutingDecision;
export function routeConsoleLine(line: ConsoleLine): RoutingDecision;
```

固定路由表（需求 4.1 / 4.3）：

| 来源 | 目标 |
| --- | --- |
| `agentReasoning` | `narrative-only` |
| `capabilityStatuses` | `narrative-only` |
| `agentProgress` (RoleStatus / FleetActivation) | `narrative-only` |
| `route_decision`（job artifact） | `both`（左下取 jobId/raw，右下取 headline） |
| `artifact_created` | `both` |
| `node_completed` | `narrative-only`（折叠为 collapsed group） |
| `system_note`（HTTP 错误 / SSE error） | `console-only` |
| `consoleLine.channel = "scheduler"` | `console-only` |

## 组件设计

### `<NarrativeSwiper />`

```tsx
interface NarrativeSwiperProps {
  /** 当前 Stage；由 AutopilotRightRail 传入，对应 STAGE_ORDER 的 6 个值。*/
  stage: Stage;
  /** 当前蓝图 job，用于派生 route_decision / artifact / node_completed。*/
  job: BlueprintGenerationJob | null;
  locale: AppLocale;
  /** 容量上限，默认 8。*/
  capacity?: number;
  /** Dwell_Time 默认 ms。*/
  defaultDwellMs?: number;
}
```

内部状态（受 `useNarrativeCardStream` + `useAutoRotation` 驱动）：

| state | 用途 |
| --- | --- |
| `cards: NarrativeCard[]` | 当前可见队列（≤ capacity） |
| `activeIndex: number` | 当前 Auto_Rotation 指针 |
| `manualUntil: number \| null` | 手动浏览过期时间戳（最近 3s 内手动则暂停 Auto_Rotation） |
| `hovering: boolean` | hover 暂停 |
| `focused: boolean` | 键盘焦点暂停 |
| `lane: StageVisualLane` | 由 stage 推导，stage 切换时触发 600ms 渐变 |

行为：

- **入队**：`cards.length === capacity` 时 FIFO 出队头（需求 2.2）。`sourceEntryId` 已存在则原地更新（需求 3.4）。
- **Auto_Rotation**：`useAutoRotation` 每 `dwellMs` 步进一次；`hovering / focused / manualUntil > now` 任一为真则暂停（需求 2.4-2.8）。
- **手动**：左右按钮、键盘 `←/→`、水平拖拽位移 > 40px 触发 `setActiveIndex` + `setManualUntil(now+3000)`（需求 2.6 / 2.7）。
- **空态**：`cards.length === 0` 时渲染 `<EmptyLanePlaceholder lane={lane}/>`，不显示“等待事件”黑底字样（需求 2.10）。
- **跨阶段保留**：stage 切换时，原 stage 的最后 N=2 张卡片以 `opacity-50` 形态留在队列起始，不参与 Auto_Rotation 主轮播（需求 6.2 / 6.3）。回切 stage 5s 内恢复旧队列状态（需求 6.4）。
- **位置指示器**：`Math.min(activeIndex+1, visible)/visible` 文本，仅反映可见队列（需求 2.9）。
- **错误兜底**：`<ErrorBoundary>` 包住整个组件，渲染失败时回退到 `null`，主壳不受影响（需求 9.6）。

DOM 草图：

```tsx
<section
  role="region"
  aria-label={t(locale, "当前阶段叙事流", "Current stage narrative")}
  data-testid="narrative-swiper"
  data-stage={stage}
  className={cn(
    "relative shrink-0 border-t border-slate-200/40",
    lane.backgroundClass,
    "h-[26%] min-h-[140px] max-h-[240px]",
    "@md:h-[26%] @sm:h-[120px]" // 1280+ 26% / 768-1280 120px
  )}
  onMouseEnter={...} onMouseLeave={...}
  onFocus={...} onBlur={...}
  tabIndex={0}
>
  <Decoration icon={lane.decorationIcon} />
  <CardTrack cards={cards} activeIndex={activeIndex} variants={lane.enterVariants}/>
  <NavButtons onPrev={...} onNext={...} />
  <PositionIndicator value={activeIndex+1} total={cards.length}/>
  <NarrativeAriaLiveRegion text={cards[activeIndex]?.headline}/>
</section>
```

### `<NarrativeCard />`

```tsx
interface NarrativeCardProps {
  card: NarrativeCard;
  lane: StageVisualLane;
  locale: AppLocale;
  isActive: boolean;
}
```

内部按 `card.source` switch 到子卡片，子卡片复用 `mirofish-stream/cards/*`，外层包裹统一的 lane 边框、source 角标、入退场 motion。新增的 2 个子卡片：

- `<RoleStatusCard />`：从 `rolePhases` 中拿到的单条 phase，渲染头像 + 角色名 + 当前阶段标签（圆桌会议样式）。
- `<FleetActivationCard />`：从 `agentProgress` / `discussions` 单条派生，渲染激活 chip + 动作摘要。

### `useNarrativeCardStream(...)`

```ts
export interface UseNarrativeCardStreamOptions {
  stage: Stage;
  job: BlueprintGenerationJob | null;
  locale: AppLocale;
  capacity: number;
}

export interface NarrativeCardStream {
  cards: NarrativeCard[];
  /** 来自 stage 切换的“上一幕回声”张数（≤ N=2），用于视觉淡化标记。*/
  echoCount: number;
}

export function useNarrativeCardStream(opts: UseNarrativeCardStreamOptions): NarrativeCardStream;
```

实现要点（需求 3 / 6 / 9）：

1. 通过 `useBlueprintRealtimeStore` 选择器读取 5 个 slice（reasoning / capability / rolePhases / agentProgress / latestJob.artifacts），每个 selector 都用浅比较防抖。
2. 复用 `deriveMiroFishStreamEntries` 派生 reasoning / capability / artifact / route_decision / node_completed entries（需求 3.2）。
3. `rolePhases` / `agentProgress` 走新增的 `deriveRoleStatusNarrativeCards()` / `deriveFleetActivationNarrativeCards()` 两个纯函数，不耦合 store。
4. 调用 `routeMiroFishEntry()` 过滤掉 `console-only`，并写入 `routing` 字段。
5. 按 `stage` 过滤：保留 `card.stage === stage` 或 `"global"`，加跨阶段回声 N=2。
6. 节流入队（需求 9.2）：以 `(source, 1s)` 为桶，桶内仅入队最新 1 条；通过 `useEffect` 内部 `Map<source, {timeout, latest}>` 实现，卸载时清理。
7. 容量裁剪：从入队序列尾部取 ≤ capacity 张。
8. **不在每张卡切换时触发 store 重渲染**（需求 9.3）：返回 stable reference 通过 `useRef<NarrativeCard[]>` + `useSyncExternalStore` 派生即可，外层组件用 `useMemo` 缓存。

### `useAutoRotation(...)`

```ts
export interface UseAutoRotationOptions {
  total: number;
  defaultDwellMs: number;
  dwellPerCard?: (card: NarrativeCard) => number; // 可按 source/severity 调
  paused: boolean;
  reducedMotion: boolean;
}

export function useAutoRotation(opts: UseAutoRotationOptions): {
  activeIndex: number;
  setActiveIndex: (next: number) => void;
};
```

- 用 `setTimeout` 驱动单次步进；步进结束在 effect cleanup 中 `clearTimeout`，避免悬挂副作用（需求 9.5）。
- `paused = true` 时不调度新的 `setTimeout`。
- `reducedMotion = true` 时直接返回 `activeIndex = 0`，不调度（需求 8.5）。
- 1s 内最多 1 次步进：`Math.max(dwellMs, 1000)`（需求 9.1）。

### `<MiniConsoleBar />` 与 `<ExpandedConsolePanel />`

```tsx
interface MiniConsoleBarProps {
  locale: AppLocale;
  consoleLines: ConsoleLine[];
  /** 把现有 AutopilotConsolePanel 作为 children 渲染于展开层，避免重写日志渲染。*/
  renderExpanded: () => ReactNode;
}
```

行为：

| 状态 | 触发 | 高度 / 形态 |
| --- | --- | --- |
| `collapsed` | 默认（首次渲染）；`collapse()` 调用；`Esc`；点击外部 | 80-120px，显示最近 1-2 行 + 状态指示 + 展开按钮（需求 5.1 / 5.2） |
| `peek` | hover ≥ 250ms | 临时浮起，展开内容；离开 250ms 后回到 `collapsed`（需求 5.3） |
| `expanded` | 点击展开按钮 | 持续展开到再次手动折叠；以左下浮层定位避开右栏（需求 5.4 / 5.7） |

`use-console-collapse-state.ts`：

- `sessionStorage` 键 `autopilot.console.collapsed = "true"|"false"`，仅在用户显式点击时写入（需求 5.8）。
- 提供 `mode: "collapsed"|"peek"|"expanded"`、`expand()`、`collapse()`、`hoverEnter()`、`hoverLeave()`。
- `Esc` 监听器只在 `expanded` 模式下挂载，避免污染全局键盘。

兜底（需求 5.9）：当 `MiniConsoleBar` 渲染抛错（`ErrorBoundary` 捕获），回退到直接渲染 `AutopilotConsolePanel` 完整态。

## 视觉语境（StageVisualLane）实现

每个 Lane 用一份 token 描述（`stage-visual-lane.ts`），不引入新主题色：

| Stage | 背景 | 装饰元素 | 入场 | 退场 | 卡片边框 |
| --- | --- | --- | --- | --- | --- |
| input | `bg-[linear-gradient(180deg,oklch(0.98_0_0)_0%,oklch(0.96_0.003_250)_100%)]` + 细横线纹理 SVG | `Mail` 角标 | slide-up + fade | slide-down + fade | `border-slate-200` |
| clarify | `bg-radial-gradient(circle_at_top,oklch(0.96_0.01_60)_0%,oklch(0.94_0.003_250)_100%)` | `Users` + 头像气泡 | scale + fade（气泡 pop） | shrink + fade | `border-amber-200/50` |
| route | `bg-[conic-gradient(...)]` 雷达扫描伪元素 | `Radar` | slide-left + fade | slide-right + fade | `border-emerald-200/60` |
| spec-tree | `bg-[repeating-linear-gradient(90deg,...)]` 书脊纹理 | `Library` | slide-up + fade | slide-up + fade | `border-slate-300` |
| spec-doc | 纸纹（细 noise SVG） | `PenTool` | typewriter（字符 stagger） | fade | `border-slate-200` |
| preview | 暗场（`bg-slate-950/[0.04]`）+ 聚光 SVG mask | `Spotlight` | fade-in + glow（≤ glow-button 上限） | fade-out + dim | `border-violet-200/40` |

所有 Lane 都从 OKLCH 冷灰板派生（需求 11.1 / 11.3），preview 的 glow 通过 `box-shadow` 控制，不超过既有 `glow-button` 的 max。

资源加载失败兜底（需求 1.8）：`backgroundClass` 用 CSS class（不是 `<img>`），不会出现“资源加载失败”；`decorationIcon` 用 `lucide-react` 已内置图标，零外部资源；如需要 SVG 纹理则做 inline data-uri，零网络依赖。

## 响应式策略

| 视口 | NarrativeSwiper 行为 | MiniConsoleBar 行为 |
| --- | --- | --- |
| ≥ 1280px | 右栏底部固定 26%（22-30%），最小 140px / 最大 240px | 左下 80-120px mini bar |
| 768-1280px | 缩为 96-120px 单行卡片高度，保留左右按钮 + 拖拽（需求 7.2） | 仍为 mini bar；展开时浮层避开右栏 |
| < 768px | 折叠为右下角 chip；点击展开为底部 sheet；preview 阶段强制保持 chip 形态（需求 7.3 / 7.5） | 复用既有 drawer 形态（需求 7.4 与 `office-cockpit-splitter` 断点一致） |

实现：用现有 `useViewportTier()`（已存在于 `right-rail/hooks`）的 `drawer | side-collapsible | side-fixed` 三档，避免新断点系统（需求 7.4）。

## 可访问性

- `role="region"` + `aria-label`（中英文 i18n key），容器键盘可达（需求 8.3）。
- `<NarrativeAriaLiveRegion>`：使用 `aria-live="polite"` + `aria-atomic="false"`，仅在 `activeIndex` 变化时把当前 `card.headline` 写入（需求 8.1）。
- 左右按钮 `<button aria-label="...">`（需求 8.2）。
- `prefers-reduced-motion: reduce` 检测：通过 `window.matchMedia` + `useSyncExternalStore` 订阅；命中时：
  - 关闭 enter/exit motion（用 `transition: none`）；
  - 关闭 Auto_Rotation；
  - aria-live 文案切换为“查看完整流水请展开左下控制台”提示（需求 8.4 / 8.5）。
- `Tab` 聚焦容器：`onFocus` 设置 `focused = true` 暂停轮播，`onBlur` 恢复（需求 8.7）。

## 性能

- `useNarrativeCardStream` 内部所有 selector 通过浅比较 + `useMemo` 隔离（需求 9.3）。
- 节流：`(source, 1s)` 桶，最多 6 路 × 1 = 6 条/秒入队，远低于一次 RAF 渲染瓶颈（需求 9.2）。
- `Auto_Rotation` 用 `setTimeout`（不是 `requestAnimationFrame`）；`Math.max(dwellMs, 1000)` 保证 ≤ 1 步/秒（需求 9.1）。
- 子卡片 `React.memo` 包裹，按 `card.id + activeIndex` 命中复用。
- 卸载清理：`useAutoRotation` 与 `useConsoleCollapseState` 在 cleanup 中清 timer / removeEventListener（需求 9.5）。
- 数据层不依赖浏览器特有 API（`window`、`requestAnimationFrame`）的同步路径；`matchMedia` 仅在 effect 中订阅，SSR 路径走静态分支（需求 9.4）。

## 错误处理

| 场景 | 兜底 |
| --- | --- |
| 某条 source selector 抛错或返回非数组 | `useNarrativeCardStream` 用 `try/catch` 包裹每路 derive，单路失败不影响整体（需求 3.6） |
| `NarrativeSwiper` 渲染异常 | `<ErrorBoundary fallback={null}>` 包裹，整体回退到不显示（需求 9.6） |
| `MiniConsoleBar` 渲染异常 | `<ErrorBoundary fallback={<AutopilotConsolePanel ... />}>` 退化到完整态（需求 5.9） |
| `sessionStorage` 不可用（隐私模式） | `use-console-collapse-state` 通过 `try/catch` 退化为内存态 |
| `i18n` 资源缺失 | 复用现有 `t(locale, zh, en)` helper；后端事件已带 i18n 字段时直接用，未带则走前端 fallback key（需求 12.3） |

## 测试策略

复用现有 `react-dom/server renderToStaticMarkup + vi.mock` 模式（需求 10.4）。

### SSR 契约测试

- `NarrativeSwiper.test.tsx`：
  - 队列为空 → 渲染 `<EmptyLanePlaceholder>`，不出现旧黑底字样。
  - 队列 ≥ 1 张 → 包含 `data-testid="narrative-swiper"` + `data-stage` 属性。
  - 6 个 stage 分别 mock，断言 `data-stage` 与对应 lane 装饰图标的 `<svg>` 标签出现。
  - `aria-label` 与 `role="region"` 出现。
  - 跨阶段回声：mock 切换 stage 后队列前 2 张应有 `data-echo="true"`。
- `MiniConsoleBar.test.tsx`：
  - 默认折叠态：仅展示最近 1-2 行 + 展开按钮，不渲染完整滚动日志。
  - 通过 `expanded={true}` prop 强制展开 → 包含 `<AutopilotConsolePanel>` 完整 markup。
  - `data-testid="autopilot-runtime-console-mini"` / `...-expanded` 双 testid 区分。

### Hook 单元测试

- `use-narrative-card-stream.test.ts`：
  - 6 路 source 合并去重；同 `sourceEntryId` 第二次入队走原地更新。
  - 容量满时 FIFO 出队头。
  - stage 切换后保留 N=2 跨阶段回声。
  - 节流：1s 内同 source 多条只入队 1 条。
  - `routing = "console-only"` 的 entry 被过滤。
- `use-auto-rotation.test.ts`：
  - `vi.useFakeTimers()` 推进 `dwellMs`，`activeIndex` 步进。
  - `paused = true` 不步进；变 `false` 后恢复。
  - `reducedMotion = true` 锁定 `activeIndex = 0`。
  - 至少 1s/步：`dwellMs = 200` 实际 1000ms 才步进。

### 路由测试

- `right-rail-console-routing.test.ts`：
  - 表驱动断言每种 `MiroFishStreamEntry.kind` 与 `ConsoleLine.channel` 的 `RoutingDecision`。

### 现有测试不破坏

- `AutopilotRightRail.subtimeline-mount.test.tsx`：仍断言 `<AgentReasoningSubTimeline />` / 4 个子组件的 fabric 分支挂载点；NarrativeSwiper 作为新增挂载点不影响旧断言。
- `RoleStatusStrip.test.tsx` / `CapabilityRail.test.tsx` / `FleetActivationLog.test.tsx`：原组件 API 不变（需求 10.8 通过组合实现）。
- `MiroFishCardStream` 相关测试：`derive-mirofish-stream-entries.ts` 签名不变。

### 不引入新依赖

- 动效：复用既有 `framer-motion`（已在 `package.json`）。
- 图标：复用 `lucide-react`。
- 节流：手写 `useEffect` + `Map`，不引入 `lodash.throttle`。
- 不引入 `swiper.js` / `keen-slider` 等第三方 swiper 库（需求 10.5）；CardTrack 用 CSS `translate3d` + framer-motion 自实现。

## 边界与决策记录

| 决策 | 备选 | 选择 | 理由 |
| --- | --- | --- | --- |
| Swiper 实现 | swiper.js / keen-slider / 自实现 | 自实现 + framer-motion | 需求 10.5 禁新依赖；自实现 ≤ 200 行 |
| 卡片队列状态 | 全局 store / hook 局部 state | hook 局部 state（`useReducer`） | 需求 9.3 不污染 store 重渲染 |
| Auto_Rotation 调度 | RAF / setTimeout / setInterval | `setTimeout` 单次链式 | 单次 timer 易清理；需求 9.1 ≤ 1 步/秒 |
| Mini Console 展开方式 | 真展开（撑开布局）/ 浮层 | 浮层 | 需求 5.7 不挤压 NarrativeSwiper |
| 跨阶段保留 N | 1 / 2 / 5 | 2 | 需求 6.2 默认 |
| StageVisualLane 资源 | 真实图片 / SVG inline | CSS + lucide-react + inline noise | 需求 1.8 零网络依赖 + 需求 10.5 零体积膨胀 |
| 国际化 | 后端 only / 前端 only / 混合 | 优先后端，前端兜底 | 需求 12.2 / 12.3 |

## 工程边界与迁移安全

1. **不修改** `useBlueprintRealtimeStore`、`derive-mirofish-stream-entries`、`spec-tree-workbench`、`streaming-doc-renderer`、`fabric-dispatch.property.test.tsx` 涉及的对外 API（需求 10.1-10.3）。
2. 现有 `RoleStatusStrip / CapabilityRail / FleetActivationLog` 在 `AutopilotRightRail` 中**保持原挂载点**，作为非叙事场景的小条带继续可见；`NarrativeSwiper` 通过组合方式额外消费它们的派生数据，不删除它们（需求 10.8）。
3. `AutopilotConsolePanel` 函数签名不变；`MiniConsoleBar` 通过 `renderExpanded` prop 引用它，避免重写日志渲染（需求 5.6）。
4. 中文 JSDoc + 中文 commit message + 英文 promptId（需求 10.7）。
5. **不扩大** 当前 117 个 TypeScript 基线错误数：新文件全部 `strict` 通过，并显式覆盖所有 `Stage` 枚举分支（编译器穷举检查）。
6. 阶段化交付建议：

   | 阶段 | 内容 | 可并入主线 |
   | --- | --- | --- |
   | M1 | 类型 + `routeMiroFishEntry` + `useNarrativeCardStream` + 单测 | 是 |
   | M2 | `useAutoRotation` + `<NarrativeSwiper>` 骨架（无视觉 lane）+ SSR 测试 | 是 |
   | M3 | 6 个 `StageVisualLane` 实装 + 跨阶段回声 + 响应式 | 是 |
   | M4 | `<MiniConsoleBar>` + `<ExpandedConsolePanel>` + sessionStorage 偏好 | 是 |
   | M5 | i18n 文案 + 可访问性回归 + 性能验收 | 是 |

每个里程碑独立可回退，不强依赖后续里程碑。

## 与现有文档的关系

- 不修改 `autopilot-streaming-experience` / `autopilot-mirofish-stream` / `autopilot-streaming-doc-renderer` 等已落地 spec 的契约；本设计在它们之上增加“呈现层叙事壳”。
- 与 `autopilot-workbench-stage-rhythm` 的 `STAGE_ORDER` / `STAGE_CONFIG` 直接对齐：`Stage` 枚举从中派生（`input → clarify → route → spec-tree → spec-doc → preview`）。
- 与 `autopilot-stage-progress-indicator` 的 `useStageProgress()` 协同：`NarrativeSwiper` 不复制阶段进度逻辑，只读取当前 stage 决定 lane。

## 验收对照（关键点）

| 需求 | 关键设计落点 |
| --- | --- |
| 1.1 / 1.3 | `STAGE_VISUAL_LANES` 6 个 token + lane 切换 600ms transition |
| 2.1 / 2.2 | `useNarrativeCardStream` 容量 + FIFO |
| 2.3-2.8 | `useAutoRotation` + hover/focus/manualUntil 暂停 |
| 3.1-3.5 | `Card_Source` 枚举 + 复用 `derive-mirofish-stream-entries` + 新 2 子卡 |
| 4.1 / 4.5 | `right-rail-console-routing.ts` 共享路由表 |
| 5.1-5.9 | `MiniConsoleBar` + `useConsoleCollapseState` + ErrorBoundary 兜底 |
| 6.1-6.4 | `NarrativeSwiper` 跨阶段回声 N=2 + 5s 回切恢复 |
| 7.1-7.5 | 复用 `useViewportTier()` 三档 |
| 8.1-8.7 | aria-live + role=region + reduced-motion + Tab 暂停 |
| 9.1-9.6 | setTimeout ≤1步/s + 节流桶 + memo + ErrorBoundary |
| 10.1-10.8 | 不改 store / API；不删旧组件；不引入新依赖；SSR 测试 |
| 11.1-11.5 | OKLCH 基底共用，差异在纹理 / 装饰 / 动效 |
| 12.1-12.5 | 复用 `t()` helper + 后端字段优先 |
