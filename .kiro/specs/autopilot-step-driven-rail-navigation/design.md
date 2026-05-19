# 设计文档：Autopilot 右栏步骤驱动导航与响应式收口

## 设计概述

本 spec 在 Spec 1-4 已经落地的右栏契约、canonical 面板、fabric 接管、数据 hook 之上，补上「URL / 用户 / `job.stage`」三方共同驱动 `currentSubStage` 的 state 收敛，并把 `onSubStageChange` 从 no-op 升级为真实回调。核心交付物：

1. 新增 `useRightRailSubStageState({ jobStage, resolvedSubStage })` hook（canonical 位置 `client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts`），内部合并「URL `?sub=xxx` 值 + sticky pin state + `resolvedSubStage` 派生」三层输入，对外返回 `{ effectiveSubStage, pinnedSubStage, isPinned, setPinnedSubStage, resetPin, togglePin }`。
2. 在 `<AutopilotRightRail>` scaffolding 中补上：scroll container 与每个子阶段内容块的 `data-sub-stage-anchor`、`useEffect([effectiveSubStage])` 驱动的 `scrollIntoView`、全局 `keydown` 监听（`[` / `]` / `Esc` / `Shift + P`）、Sticky_Toggle UI、sr-announcer、Viewport_Tier 三档（`drawer` / `side-collapsible` / `side-fixed`）渲染分支、折叠开关。
3. 在 `AutopilotRoutePage.tsx` 的 fabric 分支接入 hook：把 `effectiveSubStage` 同时下传给 `<AutopilotRightRail currentSubStage>` 与 Spec 4 `useAutopilotRightRailData(..., { currentSubStage })`，把 `onSubStageChange` 从 `() => {}` 升级为 `(next) => setPinnedSubStage(next)`。

本 spec 的硬约束（与 Requirements 12 对齐）：

- 不修改 Spec 1 冻结的 `AutopilotRightRailProps` / `AutopilotRailSubStage` / `RAIL_SUB_STAGE_ORDER` / `resolveRailSubStage()`。
- 不修改 Spec 2 canonical 面板签名与内部 DOM；`data-sub-stage-anchor` 加在 scaffolding 层（`<AutopilotRightRail>` 为每个子阶段面板外层 `<section>` 注入 anchor 属性）。
- 不修改 Spec 3 fabric 接管结论与 `AutopilotSpecTreeHandoffPanel` 次级链接。
- 不修改 Spec 4 `useAutopilotRightRailData(jobId, options)` 签名。
- 不新增后端契约；URL 同步通过 `wouter` 的 `useLocation()` + `window.history.replaceState` + 手动 `URLSearchParams`。
- 不持久化 pin 到 `localStorage` / `sessionStorage`；只通过 URL `?sub=` 做 session scope 持久化。

---

## 当前架构 vs 目标架构

### Before（Spec 4 完成后、Spec 5 启动前）

```text
AutopilotRoutePage.tsx (fabric 分支)
├── currentSubStage = resolveRailSubStage({
│     currentStage: "fabric",
│     job: latestJob,
│     selection,
│     specTree,
│     agentCrew: autopilotAgentCrew,
│   })                                              // 纯派生，无用户覆盖能力
├── view = useAutopilotRightRailData(jobId, {
│     currentSubStage,
│     onJobStageChange: ...,
│     ...
│   })
└── <AutopilotRightRail
      jobId={jobId}
      currentStage="fabric"
      currentSubStage={currentSubStage}            // 永远 = 派生值
      {...9 个 props}
      onSubStageChange={() => {}}                  // no-op
    />

<AutopilotRightRail>（Spec 1/2/3 已有 scaffolding）
├── fabric switch {
│     case "agent_crew_fabric": <AgentCrewFabricPanel ... />
│     case "spec_tree":         <SpecTreeHandoffPanel ... />
│     ... （8 canonical panels）
│   }
└── 无 anchor、无 scroll、无 keyboard、无 drawer、无 collapse、无 sticky toggle
```

问题：

- `currentSubStage` 只能跟随 `job.stage` 派生，用户无法手动覆盖。
- URL 不承载子阶段状态；刷新丢失阅读位置。
- 右栏内容区无自动滚动；切换子阶段后不知道看哪里。
- 无键盘快捷键。
- `<md` 断点下 400px 右列挤压 3D 场景。

### After（Spec 5 完成后）

```text
AutopilotRoutePage.tsx (fabric 分支)
├── resolvedSubStage = resolveRailSubStage(...)   // 纯派生值（Spec 1 resolver 不变）
├── subStageState = useRightRailSubStageState({
│     jobStage: latestJob?.stage ?? null,
│     resolvedSubStage,
│   })
│   // 返回 { effectiveSubStage, pinnedSubStage, isPinned, setPinnedSubStage, resetPin, togglePin }
├── view = useAutopilotRightRailData(jobId, {
│     currentSubStage: subStageState.effectiveSubStage,  // ← 喂 hook
│     onJobStageChange: ...,
│     ...
│   })
└── <AutopilotRightRail
      jobId={jobId}
      currentStage="fabric"
      currentSubStage={subStageState.effectiveSubStage}  // ← 喂右栏
      {...9 个 props}
      onSubStageChange={subStageState.setPinnedSubStage} // ← 升级为真实回调
    />
    内部额外消费：
      - subStageState.isPinned / togglePin（通过 context 或新增 prop 传入）
      - 或：hook 直接在 <AutopilotRightRail> 内部再调用一次，共享同一 hook（由 design 决策）

<AutopilotRightRail>（Spec 5 补强）
├── 内部通过 useRightRailSubStageStateConsumer()（或通过 props 接收 isPinned / togglePin）
├── 新增 DOM 层（scaffolding，不动 canonical 面板）：
│   ├── <header data-testid="autopilot-right-rail-header">
│   │   ├── 8 sub-stage tabs (data-testid="autopilot-right-rail-sub-stage-tab-<s>")
│   │   ├── <StickyToggle data-testid="autopilot-right-rail-sticky-toggle">
│   │   └── <CollapseToggle data-testid="autopilot-right-rail-collapse-toggle">  // md-xl 下
│   ├── <div data-testid="autopilot-right-rail-scroll-container" ref={scrollRef}>
│   │   {RAIL_SUB_STAGE_ORDER.map((s) => (
│   │     <section data-sub-stage-anchor={s} key={s}>
│   │       {currentSubStage === s ? <CanonicalPanelFor(s) /> : null}
│   │     </section>
│   │   ))}
│   │   // 或者：只渲染 currentSubStage 对应面板 + 一个 anchor <span> 定位
│   ├── <div data-testid="autopilot-right-rail-sr-announcer" aria-live="polite" class="sr-only">
│   └── <KeyboardHint data-testid="autopilot-right-rail-keyboard-hint">
├── Viewport_Tier 三档分支渲染：
│   ├── "drawer"           → 由父 AutopilotRoutePage 渲染 drawer trigger + <HoloDrawer>
│   ├── "side-collapsible" → 400px 列 + CollapseToggle
│   └── "side-fixed"       → Spec 3 现状，不可折叠
└── 内部 effects：
    ├── useEffect([effectiveSubStage]) → scrollIntoView(anchor, { behavior })
    ├── useEffect([effectiveSubStage]) → announcerText = i18n(subStage)
    ├── useEffect(mount) → document.addEventListener("keydown", handler)
    └── useEffect(mount/resize) → viewportTier = resolveViewportTier()
```

---

## State ownership

本 spec 沿用 Spec 1 的分层思想：`AutopilotRightRailProps` 是冻结契约，`<AutopilotRightRail>` 内部不持有权威 state；`currentSubStage` 的权威源头在 `AutopilotRoutePage.tsx`。

具体 ownership：

| State 字段 | 所有者 | 读者 |
| ---------- | ------ | ---- |
| `pinnedSubStage: AutopilotRailSubStage \| null` | `useRightRailSubStageState` 内部 `useState` | hook 内部；通过 `effectiveSubStage` / `isPinned` 对外暴露 |
| `effectiveSubStage: AutopilotRailSubStage \| undefined` | `useRightRailSubStageState` 派生（`useMemo`） | `AutopilotRoutePage` 下传；Spec 4 hook；`<AutopilotRightRail>` 内部 scroll / announce effect |
| URL `?sub=<x>` | `window.history` | hook 初始化读一次、`setPinnedSubStage` / `resetPin` 时写 |
| `viewportTier: "drawer" \| "side-collapsible" \| "side-fixed"` | `<AutopilotRightRail>` 内部 `useViewportTier()` hook（或内联 `useState` + `matchMedia`） | `<AutopilotRightRail>` 渲染分支；drawer trigger 按钮可见性判断；`AutopilotRoutePage` 通过 context 或 prop 读（用于决定是否渲染 drawer trigger）|
| `drawerOpen: boolean` | `AutopilotRoutePage` 或 `<AutopilotRightRail>` parent（具体见下节） | `<HoloDrawer>` open prop；drawer trigger 按钮 |
| `collapsed: boolean`（md-xl 下） | `<AutopilotRightRail>` 内部 `useState` | grid 列宽切换；collapse toggle aria-expanded |

### Hook 调用点（两种方案决策）

**方案 A：hook 在 `AutopilotRoutePage` 单点调用，通过 props 把结果下传**

```tsx
// AutopilotRoutePage.tsx
const resolvedSubStage = resolveRailSubStage({ currentStage: "fabric", job, selection, specTree, agentCrew });
const subStageState = useRightRailSubStageState({ jobStage: latestJob?.stage ?? null, resolvedSubStage });

<AutopilotRightRail
  currentSubStage={subStageState.effectiveSubStage}
  onSubStageChange={subStageState.setPinnedSubStage}
  // 新增扩展 props（非 Spec 1 契约，作为可选 UI hint）
  isPinned={subStageState.isPinned}
  onTogglePin={subStageState.togglePin}
  onResetPin={subStageState.resetPin}
/>
```

但 Spec 1 冻结的 `AutopilotRightRailProps` 只有 9 + 3（`jobId / currentStage / currentSubStage / onSubStageChange / locale`）字段；加 `isPinned / onTogglePin / onResetPin` 会扩展 props 契约。

**方案 B：hook 在 `AutopilotRoutePage` 调用，但 `<AutopilotRightRail>` 内部通过 context 读取 isPinned / togglePin**

引入 `RightRailSubStageContext`：

```tsx
// AutopilotRoutePage.tsx
<RightRailSubStageContext.Provider value={subStageState}>
  <AutopilotRightRail currentSubStage={subStageState.effectiveSubStage} onSubStageChange={subStageState.setPinnedSubStage} ... />
</RightRailSubStageContext.Provider>
```

`<AutopilotRightRail>` 内部：

```tsx
const { isPinned, togglePin } = useRightRailSubStageContext();
```

**方案 C：hook 只负责 `pinnedSubStage` / URL 同步；`<AutopilotRightRail>` 内部也可以调 hook 读取 `isPinned / togglePin`（hook 设计为可重复调用 + 单例 pin state，通过 `useSyncExternalStore` 或 module-level store）**

为了避免双写、也避免扩大 Spec 1 props 契约，本 spec 选择 **方案 B（Context）**。

决策原因：

1. Spec 1 的 `AutopilotRightRailProps` 必须保持 9 字段契约；不能再扩展 `isPinned / togglePin` 为 props。
2. Context 是 React 本地、无外部依赖、不触及 store；unmount 自然清理。
3. Context 作用域限定在 `AutopilotRoutePage.tsx` 的 fabric 分支内部；`/specs` 页面（`SpecCenterPage` → `BlueprintProgressPanel`）不挂 Context Provider，`<AutopilotRightRail>` 内部尝试 `useContext` 时可 fallback 到「无 pin 能力」（或 Spec 5 中 `<AutopilotRightRail>` 就不在 `/specs` 下渲染，因此 Context 缺失是正常）。
4. 方案 C 的 module-level store 跨 tab / 跨 `AutopilotRightRail` 实例行为不可预测，且增加测试复杂度。

Context 定义：

```ts
// client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts
interface RightRailSubStageContextValue {
  effectiveSubStage: AutopilotRailSubStage | undefined;
  pinnedSubStage: AutopilotRailSubStage | null;
  isPinned: boolean;
  setPinnedSubStage: (next: AutopilotRailSubStage | null) => void;
  resetPin: () => void;
  togglePin: () => void;
}

export const RightRailSubStageContext = createContext<RightRailSubStageContextValue | null>(null);

export function useRightRailSubStageContext(): RightRailSubStageContextValue {
  const ctx = useContext(RightRailSubStageContext);
  if (!ctx) {
    // Spec 5 约定：<AutopilotRightRail> 若在非 Provider 作用域内渲染（如未来直接挂在 /specs），
    // context 缺失时返回一个「只读派生」的降级对象，isPinned = false、toggle/reset 为 no-op。
    return NULL_CONTEXT_FALLBACK;
  }
  return ctx;
}

const NULL_CONTEXT_FALLBACK: RightRailSubStageContextValue = {
  effectiveSubStage: undefined,
  pinnedSubStage: null,
  isPinned: false,
  setPinnedSubStage: () => {},
  resetPin: () => {},
  togglePin: () => {},
};
```

---

## URL 同步实现细节

### 读取初始值

```ts
function readInitialSubStageFromUrl(): AutopilotRailSubStage | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("sub");
  if (!raw) return null;
  if ((RAIL_SUB_STAGE_ORDER as readonly string[]).includes(raw)) {
    return raw as AutopilotRailSubStage;
  }
  return null; // 非法值降级到 null（Requirement 1.3）
}
```

初始化在 `useRightRailSubStageState` 内部使用 lazy `useState`：

```ts
const [pinnedSubStage, setPinnedSubStageInternal] = useState<AutopilotRailSubStage | null>(
  () => readInitialSubStageFromUrl(),
);
```

### 写入 URL

```ts
function writeUrlSubParam(next: AutopilotRailSubStage | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (next === null) {
    url.searchParams.delete("sub");
  } else {
    url.searchParams.set("sub", next);
  }
  // 保留 hash、保留其他 query、只更新 sub
  const nextHref = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash;
  window.history.replaceState(null, "", nextHref);
}
```

选择 `replaceState` 而非 `pushState`（Requirement 1.6）：

- 用户在子阶段之间切换不期望污染 browser back/forward 堆栈；
- 用户主动点击 browser back 仍能返回到进入 `/autopilot` 前的路由；
- 未来若需要「每次手动切换记入历史」，需单独开 spec。

### 非法值清理

若初始化时读到非法 `?sub=xxx`，hook 在首次 `useEffect` 中调用 `writeUrlSubParam(null)` 清除 URL 参数（Requirement 1.3）：

```ts
useEffect(() => {
  const raw = new URLSearchParams(window.location.search).get("sub");
  if (raw && !(RAIL_SUB_STAGE_ORDER as readonly string[]).includes(raw)) {
    writeUrlSubParam(null);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // 仅挂载时运行一次
```

### 不使用 wouter navigate 的原因

项目路由库是 `wouter`，`useLocation()` 返回 `[location, setLocation]`。`setLocation` 会触发 wouter 的路由匹配（`<Route>` 组件可能 remount）。本 spec 的 `?sub=xxx` 只是 query 参数，不影响 pathname 匹配；直接用 `window.history.replaceState` 避免触发 wouter 的 re-match 副作用（Requirement 1.7）。

Hook 可以不调用 `useLocation()`；但若需要感知 pathname 变化（例如从 `/autopilot` 导航到 `/specs` 时自动 resetPin），可以只读用 `const [location] = useLocation()` 作为依赖；本 spec 选择**不**额外依赖 pathname（用户自己导航离开时 Provider 会 unmount，hook state 随之清理）。

---

## Sticky pin 实现

### State

```ts
function useRightRailSubStageState(input: {
  jobStage: BlueprintGenerationJob["stage"] | null;
  resolvedSubStage: AutopilotRailSubStage | undefined;
}): RightRailSubStageContextValue {
  const [pinnedSubStage, setPinnedSubStageInternal] = useState<AutopilotRailSubStage | null>(
    () => readInitialSubStageFromUrl(),
  );

  // 首次挂载清理非法 URL 值
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("sub");
    if (raw && !(RAIL_SUB_STAGE_ORDER as readonly string[]).includes(raw)) {
      writeUrlSubParam(null);
    }
  }, []);

  // effectiveSubStage 派生
  const effectiveSubStage = useMemo<AutopilotRailSubStage | undefined>(() => {
    if (pinnedSubStage !== null) return pinnedSubStage;
    return input.resolvedSubStage;
  }, [pinnedSubStage, input.resolvedSubStage]);

  const setPinnedSubStage = useCallback((next: AutopilotRailSubStage | null) => {
    setPinnedSubStageInternal(next);
    writeUrlSubParam(next);
  }, []);

  const resetPin = useCallback(() => {
    setPinnedSubStage(null);
  }, [setPinnedSubStage]);

  const togglePin = useCallback(() => {
    setPinnedSubStageInternal((prev) => {
      if (prev !== null) {
        // 恢复跟随派生
        writeUrlSubParam(null);
        return null;
      }
      // 固定到当前 resolvedSubStage
      const seed = input.resolvedSubStage ?? RAIL_SUB_STAGE_ORDER[0];
      writeUrlSubParam(seed);
      return seed;
    });
  }, [input.resolvedSubStage]);

  const isPinned = pinnedSubStage !== null;

  return useMemo(
    () => ({ effectiveSubStage, pinnedSubStage, isPinned, setPinnedSubStage, resetPin, togglePin }),
    [effectiveSubStage, pinnedSubStage, isPinned, setPinnedSubStage, resetPin, togglePin],
  );
}
```

### 交互路径

| 触发 | 效果 |
| ---- | ---- |
| 点击子阶段 tab `<subStage>` | `setPinnedSubStage(<subStage>)` → pin + 写 URL |
| `[` / `]` 快捷键切换 | `setPinnedSubStage(neighbor)` → pin + 写 URL |
| 点击 Sticky_Toggle 按钮 | `togglePin()` → 在 pin / 跟随之间切换 |
| `Shift + P` 快捷键 | `togglePin()` → 等价于点击 Sticky_Toggle |
| URL 首次挂载 `?sub=<x>` 合法 | 初始化 `pinnedSubStage = <x>`，首屏跳过 scroll 动效 |
| URL 首次挂载 `?sub=<x>` 非法 | 初始化 `pinnedSubStage = null` + `writeUrlSubParam(null)` 清理 URL |
| `job.stage` 推进 | `resolvedSubStage` 变化 → 若 `pinnedSubStage === null` 则 `effectiveSubStage` 跟随，反之保持 pin 值 |

### Sticky_Toggle UI

位置：`<AutopilotRightRail>` header（8 子阶段 tab 栏右侧）。

DOM 样例：

```tsx
<button
  type="button"
  data-testid="autopilot-right-rail-sticky-toggle"
  aria-pressed={isPinned}
  aria-label={
    isPinned
      ? t(locale, "已暂停跟随进度", "Currently pinned - click to follow progress")
      : t(locale, "跟随进度推进", "Following progress - click to pin current step")
  }
  onClick={togglePin}
  className={cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
    isPinned
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-600",
  )}
>
  {isPinned ? <PinIcon /> : <PinOffIcon />}
  <span>{isPinned ? t(locale, "已暂停跟随", "Pinned") : t(locale, "跟随进度", "Following")}</span>
</button>
```

图标来自 `lucide-react`（项目已使用）。`Pin` / `PinOff` 或等价图标。

---

## Step-driven scroll 实现

### Scroll container

`<AutopilotRightRail>` 内部的 scroll container：

```tsx
<div
  ref={scrollRef}
  data-testid="autopilot-right-rail-scroll-container"
  className="relative h-full overflow-y-auto"
>
  {RAIL_SUB_STAGE_ORDER.map((subStage) => (
    <section
      key={subStage}
      data-sub-stage-anchor={subStage}
      className="scroll-mt-4"
    >
      {effectiveSubStage === subStage ? renderPanelFor(subStage, props) : null}
    </section>
  ))}
</div>
```

> 注：上面把 `effectiveSubStage === subStage ? <panel/> : null` 放在 anchor section 内是最简写法。也可以 anchor 恒在（null placeholder）+ 单一 panel slot 切换，具体实现由 `<AutopilotRightRail>` 现有代码结构决定，不影响 Spec 2 canonical 面板签名。

### Scroll effect

```ts
useEffect(() => {
  if (!effectiveSubStage) return;

  const container = scrollRef.current;
  if (!container) return;

  const anchor = container.querySelector(`[data-sub-stage-anchor="${effectiveSubStage}"]`);
  if (!(anchor instanceof HTMLElement)) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isFirstMount = firstMountRef.current;
  firstMountRef.current = false;

  anchor.scrollIntoView({
    behavior: isFirstMount || reducedMotion ? "auto" : "smooth",
    block: "start",
  });
}, [effectiveSubStage]);
```

`firstMountRef` 是 `useRef<boolean>(true)`，在首次 `useEffect` 执行后置为 `false`。首次挂载时即使 `prefers-reduced-motion` 为 `no-preference` 也跳过 smooth（Requirement 3.4），避免首屏跳变。

### 不触碰主滚动

`scrollIntoView` 的 scroll 作用对象是第一个具有溢出的祖先容器（即 `data-testid="autopilot-right-rail-scroll-container"`），不会滚动 `document.scrollingElement`；这满足 Requirement 3.5。

---

## 键盘快捷键实现

### 监听注册

```ts
useEffect(() => {
  function handleKeyDown(event: KeyboardEvent): void {
    // Key_Input_Focus_Guard
    if (isInputFocused(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // 非 fabric 阶段只允许 Esc 关 drawer
    if (currentStage !== "fabric") {
      if (event.key === "Escape" && drawerOpen) {
        event.preventDefault();
        setDrawerOpen(false);
      }
      return;
    }

    if (event.key === "[") {
      event.preventDefault();
      stepPrev();
    } else if (event.key === "]") {
      event.preventDefault();
      stepNext();
    } else if (event.key === "P" && event.shiftKey) {
      event.preventDefault();
      togglePin();
    } else if (event.key === "Escape") {
      if (drawerOpen) {
        event.preventDefault();
        setDrawerOpen(false);
      }
      // 否则 no-op（不阻止 HoloDrawer 自带 Escape）
    }
  }

  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [currentStage, drawerOpen, stepPrev, stepNext, togglePin]);
```

### Key_Input_Focus_Guard

```ts
function isInputFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  // 子孙 contenteditable：
  let node: HTMLElement | null = target;
  while (node) {
    if (node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}
```

### `[` / `]` 边界处理

```ts
const stepPrev = useCallback(() => {
  const idx = effectiveSubStage ? RAIL_SUB_STAGE_ORDER.indexOf(effectiveSubStage) : 0;
  const nextIdx = Math.max(0, idx - 1);
  if (nextIdx === idx) return; // 边界 no-op
  setPinnedSubStage(RAIL_SUB_STAGE_ORDER[nextIdx]);
}, [effectiveSubStage, setPinnedSubStage]);

const stepNext = useCallback(() => {
  const idx = effectiveSubStage
    ? RAIL_SUB_STAGE_ORDER.indexOf(effectiveSubStage)
    : RAIL_SUB_STAGE_ORDER.length - 1;
  const nextIdx = Math.min(RAIL_SUB_STAGE_ORDER.length - 1, idx + 1);
  if (nextIdx === idx) return; // 边界 no-op
  setPinnedSubStage(RAIL_SUB_STAGE_ORDER[nextIdx]);
}, [effectiveSubStage, setPinnedSubStage]);
```

边界到达不循环（Requirement 4.1 / 4.2）；PBT P3 验证。

### Esc 与 HoloDrawer

`HoloDrawer.tsx` 内部已经注册了 `Escape` 关闭逻辑：

```ts
useEffect(() => {
  if (!open) return;
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [open, handleKeyDown]);
```

为避免双重关闭（本 spec 的 `handleKeyDown` + `HoloDrawer` 自带 `handleKeyDown` 同时 `setDrawerOpen(false)`），本 spec 的 Esc 处理遵守：

- 只在 `drawerOpen === true` 时处理 Esc；
- 不 `event.stopPropagation()`，让 `HoloDrawer` 自带逻辑也能跑，但 `setDrawerOpen(false)` 是幂等（`false → false` 无副作用）。

实际表现：Esc 按一次，两个 handler 都把 `drawerOpen` 置 `false`，React reconciliation 只触发一次 re-render；行为符合预期。

---

## 响应式 drawer 实现

### Viewport_Tier hook

```ts
// client/src/pages/autopilot/right-rail/hooks/use-viewport-tier.ts (或内联在 <AutopilotRightRail>)
export type ViewportTier = "drawer" | "side-collapsible" | "side-fixed";

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(() => {
    if (typeof window === "undefined") return "side-fixed";
    return resolveTier(window.innerWidth);
  });

  useEffect(() => {
    const mqlMd = window.matchMedia("(min-width: 768px)");
    const mqlXl = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setTier(resolveTier(window.innerWidth));
    mqlMd.addEventListener("change", onChange);
    mqlXl.addEventListener("change", onChange);
    return () => {
      mqlMd.removeEventListener("change", onChange);
      mqlXl.removeEventListener("change", onChange);
    };
  }, []);

  return tier;
}

function resolveTier(width: number): ViewportTier {
  if (width < 768) return "drawer";
  if (width < 1280) return "side-collapsible";
  return "side-fixed";
}
```

### drawer 模式渲染

在 `AutopilotRoutePage.tsx` 或 `<AutopilotWorkflowRail>` fabric 分支（按 Spec 3 决策，接线点在 `AutopilotWorkflowRail.case "fabric"`）：

```tsx
const tier = useViewportTier();
const [drawerOpen, setDrawerOpen] = useState(false);

// drawer 关闭联动：tier 变化时
useEffect(() => {
  if (tier !== "drawer") {
    setDrawerOpen(false);
  }
}, [tier]);

if (currentStage !== "fabric") {
  return <AutopilotWorkflowRailLegacyFabric ... />; // 非 fabric 阶段原逻辑
}

if (tier === "drawer") {
  return (
    <>
      <button
        type="button"
        data-testid="autopilot-right-rail-drawer-trigger"
        onClick={() => setDrawerOpen(true)}
        className="..."
      >
        {t(locale, "展开右栏", "Expand rail")}
      </button>
      <HoloDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t(locale, "Autopilot 右栏", "Autopilot rail")}
        width={400}
      >
        <div data-testid="autopilot-right-rail-drawer">
          <AutopilotRightRail {...rightRailProps} />
        </div>
      </HoloDrawer>
    </>
  );
}

if (tier === "side-collapsible") {
  return (
    <div
      className={cn("transition-all", collapsed ? "w-0 overflow-hidden" : "w-[400px]")}
    >
      <button
        type="button"
        data-testid="autopilot-right-rail-collapse-toggle"
        aria-expanded={!collapsed}
        aria-controls="autopilot-right-rail-panel"
        onClick={() => setCollapsed(v => !v)}
      >...</button>
      <div id="autopilot-right-rail-panel">
        <AutopilotRightRail {...rightRailProps} />
      </div>
    </div>
  );
}

// side-fixed
return <AutopilotRightRail {...rightRailProps} />;
```

### drawer 内部不渲染左栏时间线

按 Requirement 5.2.c：drawer 内**不**渲染 `<AutopilotWorkflowRail>` 的 5 阶段时间线，只渲染 `<AutopilotRightRail>` 的子阶段面板与 header 元素。因为在 `<768px` 屏幕上 drawer 宽度已经是 400px（clamp 到 ≤420px），再塞入 5 阶段时间线会导致内容密度爆炸；左栏 5 阶段时间线在 `<md` 下应由 `<AutopilotWorkflowRail>` 自己决定是否展示（不在本 spec 范围）。

### grid 列切换

`AutopilotRoutePage.tsx` 当前 grid 结构：

```tsx
<div className="grid w-full gap-4 px-0 py-4 xl:grid-cols-[minmax(0,1fr)_400px]">
  <AutopilotVisualStage ... />
  {currentStage === "fabric" ? <AutopilotRightRail ... /> : <AutopilotWorkflowRail ... />}
</div>
```

Spec 5 修改为按 Viewport_Tier 控制：

```tsx
const gridClassName = useMemo(() => {
  if (tier === "side-fixed") return "xl:grid-cols-[minmax(0,1fr)_400px]";
  if (tier === "side-collapsible" && !collapsed) return "md:grid-cols-[minmax(0,1fr)_400px]";
  return ""; // drawer 或 collapsed 时单列
}, [tier, collapsed]);
```

---

## `onSubStageChange` 真实实现

### Spec 3 / 4 现状

```tsx
<AutopilotRightRail
  ...
  onSubStageChange={() => {}} // no-op 占位
/>
```

### Spec 5 升级

```tsx
<AutopilotRightRail
  ...
  currentSubStage={subStageState.effectiveSubStage}
  onSubStageChange={subStageState.setPinnedSubStage}
/>
```

`<AutopilotRightRail>` 内部在用户点击 8 子阶段 tab 时：

```tsx
<button
  type="button"
  data-testid={`autopilot-right-rail-sub-stage-tab-${subStage}`}
  aria-current={currentSubStage === subStage ? "location" : undefined}
  onClick={() => onSubStageChange(subStage)}
>
  {i18nLabel(subStage, locale)}
</button>
```

`onSubStageChange(subStage)` 即 `setPinnedSubStage(subStage)`；写入 URL + pin state。scroll 由 `useEffect([effectiveSubStage])` 派生触发（Requirement 3.7）。

---

## 首次挂载行为

三种情况：

| URL `?sub` | 初始化 | 首次 scroll |
| ---------- | ------ | ----------- |
| 合法值（如 `?sub=spec_tree`） | `pinnedSubStage = "spec_tree"`、`effectiveSubStage = "spec_tree"` | `firstMountRef = true` → `behavior: "auto"`，瞬时到达 anchor |
| 非法值（如 `?sub=xxx`） | `pinnedSubStage = null`、`effectiveSubStage = resolvedSubStage`、`useEffect` 清理 URL | 若 `resolvedSubStage` 非 `agent_crew_fabric`，首次 `scrollIntoView` `behavior: "auto"` |
| 无 `?sub` | `pinnedSubStage = null`、`effectiveSubStage = resolvedSubStage`、URL 不变 | 同上 |

`firstMountRef` 机制：

```ts
const firstMountRef = useRef(true);

useEffect(() => {
  if (!effectiveSubStage) return;
  // ... scroll logic
  firstMountRef.current = false;
}, [effectiveSubStage]);
```

只在**第一次 useEffect 执行**时跳过 smooth；之后的 effective 变化使用 `smooth`（除非 `prefers-reduced-motion`）。

---

## 与 Spec 4 hook 的集成

`AutopilotRoutePage.tsx` 的 fabric 分支：

```tsx
const resolvedSubStage = useMemo(
  () => resolveRailSubStage({
    currentStage: "fabric",
    job: latestJob,
    selection,
    specTree,
    agentCrew: autopilotAgentCrew,
  }),
  [latestJob, selection, specTree, autopilotAgentCrew],
);

const subStageState = useRightRailSubStageState({
  jobStage: latestJob?.stage ?? null,
  resolvedSubStage,
});

const view = useAutopilotRightRailData(latestJob?.id ?? "", {
  initialData: { ... },
  currentSubStage: subStageState.effectiveSubStage, // ← 喂 hook
  onJobStageChange: (next, prev) => {
    // 可选处理
  },
});

return (
  <RightRailSubStageContext.Provider value={subStageState}>
    <AutopilotRightRail
      jobId={view.job.data?.id ?? ""}
      currentStage="fabric"
      currentSubStage={subStageState.effectiveSubStage}
      job={view.job.data}
      routeSet={view.routeSet.data}
      selection={view.selection.data}
      specTree={view.specTree.data}
      agentCrew={view.agentCrew.data}
      capabilities={view.capabilities.data ?? []}
      capabilityInvocations={view.capabilityInvocations.data ?? []}
      capabilityEvidence={view.capabilityEvidence.data ?? []}
      effectPreviews={view.effectPreviews.data ?? []}
      locale={locale}
      onSubStageChange={subStageState.setPinnedSubStage}
    />
  </RightRailSubStageContext.Provider>
);
```

Spec 4 hook 消费 `effectiveSubStage` 作为懒加载 gate；pin 期间 `effectiveSubStage` 固定，因此下游字段不会因 `job.stage` 推进而被 gate 切换（hook 仍会对当前 subStage 对应字段做 targeted refetch，见 Spec 4 的 Ignore_Stale_Policy）。这满足 Requirement 7.2。

---

## 正确性性质（PBT 候选）

### P1 — URL ⇔ State idempotent

**文件**：`client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.property.test.ts`

**生成器**：

- `subStageSeq`: `fc.array(fc.constantFrom(...RAIL_SUB_STAGE_ORDER), { minLength: 2, maxLength: 6 })`

**策略**：

1. `beforeEach` 清理 `window.history.replaceState(null, "", "/autopilot")`。
2. 用 `@testing-library/react` 的 `renderHook` 挂载 `useRightRailSubStageState({ jobStage: null, resolvedSubStage: undefined })`。
3. 对 `subStageSeq` 中每个 `subStage` 调用 `result.current.setPinnedSubStage(subStage)`。
4. 每次调用后断言：
   - `new URLSearchParams(window.location.search).get("sub") === subStage`
   - `result.current.pinnedSubStage === subStage`
   - `result.current.effectiveSubStage === subStage`
5. 序列结束后再次调用 `setPinnedSubStage(subStageSeq[subStageSeq.length - 1])`（幂等写），断言：URL 不变、state 不变、`history.length` 不增加（`replaceState` 不增堆栈）。

**断言**：

- 最终 URL `?sub` 等于 `subStageSeq[last]`。
- 幂等写相同值不产生 history 条目（通过 `history.length` 对比或 mock `history.replaceState` 计数，后者更可靠）。

**numRuns**：`50`。

**失败样本最小化**：fast-check 自动 shrink 到最短序列。

### P2 — Pin semantics

**文件**：同上

**生成器**：

- `jobStageSeq`: `fc.array(fc.constantFrom("input", "clarification", "route_generation", "route_selection", "agent_crew_fabric", "spec_tree", "spec_docs", "preview", "effect_preview", "prompt_packaging", "runtime_capability", "engineering_handoff", "engineering_landing"), { minLength: 2, maxLength: 8 })`
- `userActions`: `fc.array(fc.oneof(
    fc.record({ type: fc.constant("click-tab"), target: fc.constantFrom(...RAIL_SUB_STAGE_ORDER) }),
    fc.record({ type: fc.constant("key-prev") }),
    fc.record({ type: fc.constant("key-next") }),
    fc.record({ type: fc.constant("toggle-pin") }),
  ), { minLength: 0, maxLength: 10 })`
- `interleavePattern`: 交错方式，例如先推若干 jobStage、再若干 userActions、再推若干 jobStage。

**策略**：

1. `renderHook` 挂载。
2. 按 interleave pattern 依次：
   - 对每个 jobStage，通过 `rerender({ jobStage: stage, resolvedSubStage: resolveRailSubStage({ currentStage: "fabric", job: { stage }, selection: ..., specTree: ..., agentCrew: ... }) })` 模拟 `job.stage` 推进（resolver 复用 Spec 1 真实函数）。
   - 对每个 userAction，调用对应 hook API：
     - `click-tab`: `setPinnedSubStage(target)`
     - `key-prev` / `key-next`: 模拟 `stepPrev()` / `stepNext()`（hook 对外暴露这些 helper，或通过 `setPinnedSubStage(neighbor)` 间接模拟）
     - `toggle-pin`: `togglePin()`
3. 断言最终状态：
   - 若 `result.current.pinnedSubStage !== null`，则 `result.current.effectiveSubStage === result.current.pinnedSubStage`。
   - 若 `result.current.pinnedSubStage === null`，则 `result.current.effectiveSubStage === resolveRailSubStage({ currentStage: "fabric", job: { stage: lastJobStage }, ... })`。

**numRuns**：`50`。

### P3 — Keyboard shortcut boundaries

**文件**：同上

**生成器**：

- `keySeq`: `fc.array(fc.constantFrom("prev", "next"), { minLength: 0, maxLength: 30 })`

**策略**：

1. 挂载 hook，初始 `resolvedSubStage = RAIL_SUB_STAGE_ORDER[0]`（`agent_crew_fabric`）。
2. 对 keySeq 每个元素调用 `stepPrev()` / `stepNext()`。
3. 每次调用后断言 `RAIL_SUB_STAGE_ORDER.indexOf(result.current.effectiveSubStage ?? RAIL_SUB_STAGE_ORDER[0])` ∈ `[0, RAIL_SUB_STAGE_ORDER.length - 1]`。
4. 特别检查：
   - 起点 `agent_crew_fabric` 连续 `prev` 不越界（始终 `agent_crew_fabric`）。
   - 终点 `artifact_memory` 连续 `next` 不越界（始终 `artifact_memory`）。
   - `prev` + `next` 总数差等于当前索引减起点索引（不循环）。

**numRuns**：`100`。

---

## Anchor 注入层

Spec 2 canonical 面板签名不允许修改，因此 `data-sub-stage-anchor` 必须加在 scaffolding 层：

方案：`<AutopilotRightRail>` 内部为每个子阶段渲染一个 `<section data-sub-stage-anchor={subStage}>`，只在 `effectiveSubStage === subStage` 时把对应 canonical 面板渲染进去：

```tsx
{RAIL_SUB_STAGE_ORDER.map((subStage) => (
  <section
    key={subStage}
    data-sub-stage-anchor={subStage}
    className="scroll-mt-4"
    aria-hidden={effectiveSubStage !== subStage}
  >
    {effectiveSubStage === subStage ? <PanelFor subStage={subStage} {...props} /> : null}
  </section>
))}
```

或者：所有 section 常驻 DOM，但非当前子阶段的 section 内容为空 placeholder（空 section 仍可作为 scroll anchor，但此方案 DOM 更臃肿）。建议采用第一种（当前激活 section 渲染 canonical 面板，非激活 section 不渲染内容但保留 `<section>` 外壳以便 anchor 存在）。

这样 scroll effect 的 `querySelector` 始终能找到 anchor，即使对应子阶段面板尚未渲染，scroll 也能定位到空 section 的 offset；当用户切到该子阶段时内容填充进去，用户滚到的位置自然是面板顶部（section `scroll-mt-4` 预留一点顶部间隙）。

---

## 非目标

- 不做乐观更新。
- 不支持跨 tab 同步。
- 不写 `localStorage` / `sessionStorage`（只 URL query）。
- 不修改 Spec 1 契约、Spec 2 面板、Spec 3 结构、Spec 4 hook 签名。
- 不新增后端 API / Socket / DTO。
- 不做 `<xs`（`<360px`）专门优化。
- 不支持多 job 并存。
- 不做 deep link 到具体 testid 级粒度（只 `?sub=<subStage>`）。
- 不做 analytics 埋点。

---

## 回滚

本 spec 所有改动局限于以下文件集合（Requirement 12.9）：

- 新增：
  - `client/src/pages/autopilot/right-rail/hooks/use-right-rail-sub-stage-state.ts`
  - `client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.test.ts`
  - `client/src/pages/autopilot/right-rail/hooks/__tests__/use-right-rail-sub-stage-state.property.test.ts`
  - 可选 `client/src/pages/autopilot/right-rail/hooks/use-viewport-tier.ts`
  - 可选 `client/src/pages/autopilot/right-rail/__tests__/rail-navigation.integration.test.tsx`
- 修改：
  - `client/src/pages/autopilot/right-rail/index.ts`（新增 re-export）
  - `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`（scroll container / anchor / tab / sticky toggle / sr-announcer / keyboard / collapse toggle）
  - `client/src/pages/autopilot/AutopilotRoutePage.tsx`（接入 hook、Provider、Viewport_Tier 分支、drawer trigger）
  - 按需相关测试文件

回滚方式：`git revert` 本 spec 的合入 commit。Spec 1/2/3/4 产物不受影响，`onSubStageChange` 退回为 no-op、`currentSubStage` 退回为 `resolveRailSubStage()` 直接派生、Viewport_Tier 分支消失、右栏恢复 Spec 3/4 现状。

---

## 与后续 spec 的衔接

本 spec 是 autopilot 驾驶舱右栏收敛系列的第 5 份（最后一份，P1 交互层）。完成后右栏收口主线关闭。

未来可能的衍生工作（不在本 spec 范围）：

- **Phase_B_Cleanup**（Spec 4 遗留）：把 `BlueprintProgressPanel` 的 `initial*` props 删除，让 8 个 canonical 面板直接从 Spec 4 hook 消费。
- **跨 tab 同步**：若未来需要多 tab 之间共享 pin 状态（通过 `BroadcastChannel` 或 `storage` event）。
- **URL pushState 策略**：若产品希望每次手动切换子阶段都进入 browser 历史（便于后退回到上一子阶段），需单独开 spec。
- **Analytics 埋点**：pin / toggle / keyboard / drawer 使用情况统计。
- **自定义键位**：让用户配置 `[` / `]` / `Shift+P` 的替代键。
