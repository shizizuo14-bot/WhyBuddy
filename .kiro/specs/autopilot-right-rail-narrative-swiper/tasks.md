# Implementation Plan: Autopilot 右栏底部叙事 Swiper

## Overview

按设计文档的 M1-M5 阶段化交付计划推进，每个里程碑独立可回退、独立可并入主线：

- **M1** 类型 + `routeMiroFishEntry` + `useNarrativeCardStream` + 单测
- **M2** `useAutoRotation` + `<NarrativeSwiper>` 骨架（无视觉 lane）+ SSR 测试
- **M3** 6 个 `StageVisualLane` 实装 + 跨阶段回声 + 响应式 + ErrorBoundary
- **M4** `<MiniConsoleBar>` + `<ExpandedConsolePanel>` + sessionStorage 偏好
- **M5** i18n 文案 + 可访问性回归 + 性能验收

实现严格遵循以下边界（Req 10）：

- 不修改 `useBlueprintRealtimeStore` / `derive-mirofish-stream-entries` / `RoleStatusStrip` / `CapabilityRail` / `FleetActivationLog` 的对外 API
- 通过组合（不删改原组件）收编 4 个既有子组件的呈现层
- 不引入新的 npm 运行时依赖，复用 `framer-motion` + `lucide-react`
- 沿用 `react-dom/server` SSR + `vi.mock` 测试模式
- 不扩大当前 117 个 TS 基线错误数

## Tasks

- [x] 1. M1 — 类型与数据消费层
  - [x] 1.1 定义 narrative card 类型与枚举
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/narrative-card-types.ts`
    - 定义 `CardSource`、`Stage`、`CardSeverity`、`NarrativeCard`、`NarrativeCardStream`
    - `Stage` 严格继承 `STAGE_ORDER` 的 6 个值，编译期穷举校验
    - 中文 JSDoc 注释，对每个字段说明语义
    - _Requirements: 3.3, 3.7, 10.6, 11.1_

  - [x] 1.2 实现 `right-rail-console-routing.ts` 共享路由模块
    - 新建 `client/src/pages/autopilot/right-rail/right-rail-console-routing.ts`
    - 导出 `RoutingTarget` / `RoutingDecision` 类型与 `routeMiroFishEntry()` / `routeConsoleLine()` 函数
    - 实现固定路由表：reasoning / capability / agentProgress → `narrative-only`，`route_decision` / `artifact_created` → `both`，`system_note` / `scheduler` → `console-only`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 1.3 为 `right-rail-console-routing.ts` 编写单元测试
    - 新建 `client/src/pages/autopilot/right-rail/__tests__/right-rail-console-routing.test.ts`
    - 表驱动断言每种 `MiroFishStreamEntry.kind` 与 `ConsoleLine.channel` 的 `RoutingDecision`
    - 沿用 `vi.mock` 模式
    - _Requirements: 4.1, 4.5_

  - [x] 1.4 实现 `useNarrativeCardStream` hook
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/use-narrative-card-stream.ts`
    - 通过 selector 读取 `agentReasoning / capabilityStatuses / rolePhases / agentProgress / latestJob.artifacts` 5 路 slice，每路浅比较防抖
    - 复用 `derive-mirofish-stream-entries.ts`，新增 `deriveRoleStatusNarrativeCards()` / `deriveFleetActivationNarrativeCards()` 两个纯函数
    - 调用 `routeMiroFishEntry()` 过滤 `console-only`
    - 节流入队：`(source, 1s)` 桶，桶内仅入队最新 1 条；卸载时清理 timer
    - 容量裁剪到 ≤ capacity；同 `sourceEntryId` 原地更新不触发入队动效
    - 单路 derive 失败用 `try/catch` 包裹，不影响其他来源
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 9.2, 9.3, 9.5_

  - [x]* 1.5 为 `useNarrativeCardStream` 编写单元测试
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/__tests__/use-narrative-card-stream.test.ts`
    - 断言 6 路 source 合并去重；同 `sourceEntryId` 走原地更新
    - 断言容量满时 FIFO 出队头
    - 断言 `routing = "console-only"` 的 entry 被过滤
    - 断言单路 derive 抛错时其余来源仍正常入队
    - _Requirements: 2.2, 3.4, 3.6, 4.1_

- [x] 2. M1 检查点 — 确保所有测试通过
  - 运行 narrative-swiper 与 right-rail console routing 相关的单元测试
  - 确保所有测试通过，遇到问题向用户提问

- [x] 3. M2 — Auto_Rotation 与 Swiper 骨架
  - [x] 3.1 实现 `useAutoRotation` hook
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/use-auto-rotation.ts`
    - 用 `setTimeout` 单次链式调度，effect cleanup 中 `clearTimeout`
    - `paused` 为 true 时不调度新 timer；`reducedMotion` 为 true 时锁定 `activeIndex = 0`
    - `Math.max(dwellMs, 1000)` 保证 ≤ 1 步 / 秒
    - `dwellPerCard?: (card: NarrativeCard) => number` 可按 source / severity 调整
    - _Requirements: 2.3, 8.5, 9.1, 9.5_

  - [x]* 3.2 为 `useAutoRotation` 编写单元测试
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/__tests__/use-auto-rotation.test.ts`
    - 用 `vi.useFakeTimers()` 推进 `dwellMs`，断言 `activeIndex` 步进
    - 断言 `paused = true` 不步进；恢复后正常步进
    - 断言 `reducedMotion = true` 锁定 `activeIndex = 0`
    - 断言 `dwellMs = 200` 实际 1000ms 才步进（≤ 1 步 / 秒）
    - 断言卸载时清理 timer，不产生悬挂副作用
    - _Requirements: 2.3, 8.5, 9.1, 9.5_

  - [x] 3.3 实现 `<NarrativeSwiper>` 骨架（无视觉 lane）
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/NarrativeSwiper.tsx`
    - 接入 `useNarrativeCardStream` + `useAutoRotation`
    - 维护 `cards / activeIndex / manualUntil / hovering / focused` 内部状态
    - 实现入队 / 出队 / 原地更新 / FIFO 容量上限（默认 8）
    - 实现左右按钮 + 键盘 ←/→ + 水平拖拽 > 40px 切换；手动操作后 3 秒内暂停 Auto_Rotation
    - hover 进入暂停、离开 300ms 恢复；focus 进入暂停、blur 恢复
    - 队列为空时渲染 `<EmptyLanePlaceholder>`，不显示旧黑底字样
    - 渲染位置指示器（`activeIndex+1 / total`）
    - 暂时不挂 lane 主题，只用基础冷灰中性背景
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 8.7_

  - [x] 3.4 实现 `<NarrativeCard>` 分发器与 2 个新子卡片
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/NarrativeCard.tsx`
    - 按 `card.source` switch 到既有 `mirofish-stream/cards/*` 子卡片（reasoning / capability-invocation / artifact / route-decision / node-completed）
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/cards/RoleStatusCard.tsx`：渲染头像 + 角色名 + 阶段标签
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/cards/FleetActivationCard.tsx`：渲染激活 chip + 动作摘要
    - 新建 `cards/index.ts` barrel
    - 在每张卡上以图标 / 角标标注 `Card_Source`
    - 用 `React.memo` 包裹，按 `card.id + isActive` 命中复用
    - _Requirements: 3.3, 3.5, 9.3, 10.8_

  - [x] 3.5 把 `<NarrativeSwiper>` 挂到 `AutopilotRightRail`
    - 修改 `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`
    - 在 `<aside>` return 块底部挂载 `<NarrativeSwiper stage={stage} job={job} locale={locale} />`
    - 保留 `RoleStatusStrip / CapabilityRail / FleetActivationLog` 既有挂载点（Req 10.8 强制组合）
    - 修改 `client/src/pages/autopilot/right-rail/index.ts` 导出 `NarrativeSwiper`
    - _Requirements: 10.1, 10.3, 10.8_

  - [x]* 3.6 为 `<NarrativeSwiper>` 骨架编写 SSR 契约测试
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/__tests__/NarrativeSwiper.test.tsx`
    - 沿用 `react-dom/server renderToStaticMarkup + vi.mock` 模式
    - 断言队列为空时渲染 `<EmptyLanePlaceholder>`，不出现旧黑底字样
    - 断言队列 ≥ 1 张时包含 `data-testid="narrative-swiper"` + `data-stage` 属性
    - 断言不依赖浏览器特有 API 即可输出可序列化结构
    - _Requirements: 2.10, 9.4, 10.4_

- [x] 4. M2 检查点 — 确保所有测试通过
  - 运行 narrative-swiper 全部测试与既有 right-rail 子组件测试
  - 验证 `AutopilotRightRail.subtimeline-mount.test.tsx` 等既有断言仍通过
  - 确保所有测试通过，遇到问题向用户提问

- [x] 5. M3 — Stage Visual Lanes + 跨阶段回声 + 响应式
  - [x] 5.1 实现 6 个 `StageVisualLane` token
    - 新建 `client/src/pages/autopilot/right-rail/narrative-swiper/stage-visual-lane.ts`
    - 定义 `StageVisualLane` interface 与 `STAGE_VISUAL_LANES: Record<Stage, StageVisualLane>` 常量
    - input / clarify / route / spec-tree / spec-doc / preview 各自的 `backgroundClass`、`cardBorderClass`、`enterVariants`、`exitVariants`、`decorationIcon`、可选 `dwellTimeMs`
    - 全部派生自 OKLCH 冷灰板（`--background` / `--accent` / `--muted`），差异化集中在背景纹理、装饰图标、入退场 motion
    - 使用 `lucide-react` 内置图标（`Mail` / `Users` / `Radar` / `Library` / `PenTool` / `Spotlight`）
    - preview lane 的 glow `box-shadow` 不超过 `glow-button` 的 max
    - 在 `NarrativeSwiper.tsx` 中接入 lane：根据 `stage` 选 lane，stage 切换时 600ms 渐变过渡
    - 在 `<NarrativeCard>` 中应用 lane 的边框与入退场 variants
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 11.1, 11.2, 11.3, 11.4_

  - [x] 5.2 在 `useNarrativeCardStream` 中增加跨阶段回声 (N=2)
    - 修改 `use-narrative-card-stream.ts`
    - stage 切换时保留旧阶段最后 N=2 张卡片，标记为 echo（如 `data-echo="true"`），以视觉淡化方式留在队列起始
    - echo 卡片不参与 Auto_Rotation 主轮播
    - 用户在 5 秒内回切到上一 stage 时，恢复旧阶段卡片队列的最后状态
    - 同 stage 内卡片超过 Capacity_Limit 仍按 FIFO 处理，不引入回声例外
    - 修改 `NarrativeSwiper.tsx` 在 stage 切换时对原 stage 卡片应用退场动效（600ms）
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.3 实现响应式行为
    - 修改 `NarrativeSwiper.tsx`，复用既有 `useViewportTier()` 三档
    - ≥ 1280px：右栏底部固定 26%（22-30%），最小 140px / 最大 240px
    - 768-1280px：缩为 96-120px 单行卡片高度，保留左右按钮 + 拖拽
    - < 768px：折叠为右下角 chip；点击展开为底部 sheet；preview 阶段强制保持 chip 形态
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.4 为 `<NarrativeSwiper>` 添加 `<ErrorBoundary>` 兜底
    - 修改 `AutopilotRightRail.tsx`，用 `<ErrorBoundary fallback={null}>` 包裹 `<NarrativeSwiper>`
    - 渲染异常时不显示 swiper，不影响主壳与右栏主区
    - _Requirements: 9.6_

  - [x]* 5.5 为 lane / echo / 响应式编写 SSR 测试
    - 扩展 `__tests__/NarrativeSwiper.test.tsx`
    - 表驱动断言 6 个 stage 分别 mock 后，`data-stage` 与对应 lane 装饰图标的 `<svg>` 出现
    - 断言 stage 切换后队列前 2 张应有 `data-echo="true"`
    - 断言资源加载失败兜底（lane 用 CSS class，零网络依赖）
    - mock 三档 viewport tier，断言对应渲染分支
    - _Requirements: 1.1, 1.8, 6.2, 7.1, 7.2, 7.3_

- [x] 6. M3 检查点 — 确保所有测试通过
  - 运行 narrative-swiper 全部测试
  - 验证 `node --run check` TS 基线未扩大
  - 确保所有测试通过，遇到问题向用户提问

- [x] 7. M4 — MiniConsoleBar + ExpandedConsolePanel + sessionStorage
  - [x] 7.1 实现 `use-console-collapse-state` hook
    - 新建 `client/src/pages/autopilot/right-rail/mini-console/use-console-collapse-state.ts`
    - 提供 `mode: "collapsed" | "peek" | "expanded"`、`expand()`、`collapse()`、`hoverEnter()`、`hoverLeave()`
    - hover ≥ 250ms 进入 `peek`，离开 250ms 后回 `collapsed`
    - 显式点击展开按钮进入 `expanded`，持续展开直到再次手动折叠
    - sessionStorage 键 `autopilot.console.collapsed`，仅在用户显式点击时写入
    - `Esc` 监听器只在 `expanded` 模式下挂载，避免污染全局键盘
    - sessionStorage 不可用时（隐私模式）通过 `try/catch` 退化为内存态
    - _Requirements: 5.3, 5.4, 5.5, 5.8, 9.5_

  - [x]* 7.2 为 `use-console-collapse-state` 编写单元测试
    - 新建 `client/src/pages/autopilot/right-rail/mini-console/__tests__/use-console-collapse-state.test.ts`
    - 用 `vi.useFakeTimers()` 测试 hover 250ms 阈值
    - 断言点击展开后保持 `expanded` 直到手动折叠
    - 断言 sessionStorage 写入仅发生在显式点击
    - mock `Storage` 抛错的场景，断言退化为内存态
    - _Requirements: 5.3, 5.4, 5.5, 5.8_

  - [x] 7.3 实现 `<MiniConsoleBar>` 组件
    - 新建 `client/src/pages/autopilot/right-rail/mini-console/MiniConsoleBar.tsx`
    - 桌面 1280+ 默认渲染为 80-120px 高度
    - 显示最近 1-2 条系统流水摘要 + 连接状态指示 + 展开按钮
    - 通过 `right-rail-console-routing.routeConsoleLine()` 过滤掉 `narrative-only` 的 entry
    - 接入 `useConsoleCollapseState`，提供 `data-testid="autopilot-runtime-console-mini"`
    - _Requirements: 4.1, 4.2, 5.1, 5.2_

  - [x] 7.4 实现 `<ExpandedConsolePanel>` 包装层
    - 新建 `client/src/pages/autopilot/right-rail/mini-console/ExpandedConsolePanel.tsx`
    - 通过 `renderExpanded` prop 接收既有 `<AutopilotConsolePanel>`，作为 children 渲染
    - 不重写日志渲染、筛选、连接状态展示
    - 以左下浮层定位避开右栏区域，保证 NarrativeSwiper 不被遮挡
    - 提供 `data-testid="autopilot-runtime-console-expanded"`
    - _Requirements: 5.6, 5.7_

  - [x] 7.5 把 `<MiniConsoleBar>` 挂到 `AutopilotRoutePage`
    - 修改 `client/src/pages/autopilot/AutopilotRoutePage.tsx`
    - 把现有 `<AutopilotConsolePanel ... />` 包一层 `<MiniConsoleBar renderExpanded={() => <AutopilotConsolePanel ... />}>`
    - 用 `<ErrorBoundary fallback={<AutopilotConsolePanel ... />}>` 包裹，渲染失败时退化到完整态
    - Stage_Transition 不清空 Expanded_Console_Panel 历史日志
    - _Requirements: 5.7, 5.9, 6.6_

  - [x]* 7.6 为 `<MiniConsoleBar>` 编写 SSR 契约测试
    - 新建 `client/src/pages/autopilot/right-rail/mini-console/__tests__/MiniConsoleBar.test.tsx`
    - 默认折叠态：仅展示最近 1-2 行 + 展开按钮，不渲染完整滚动日志
    - 通过 `expanded={true}` prop 强制展开，断言包含 `<AutopilotConsolePanel>` 完整 markup
    - 断言双 testid（mini / expanded）区分清晰
    - 断言 ErrorBoundary fallback 渲染原始完整态
    - _Requirements: 5.1, 5.6, 5.9_

- [x] 8. M4 检查点 — 确保所有测试通过
  - 运行 mini-console 与 narrative-swiper 全部测试
  - 验证既有 `AutopilotConsolePanel` 测试未受影响
  - 确保所有测试通过，遇到问题向用户提问

- [x] 9. M5 — i18n + 可访问性 + 性能验收
  - [x] 9.1 添加叙事文案 i18n 键
    - 修改 `client/src/i18n/zh-CN.ts` 与 `client/src/i18n/en-US.ts`
    - 新增 `narrativeSwiper.lane.{stage}.empty`、`narrativeSwiper.aria.region`、`narrativeSwiper.aria.prevButton` / `nextButton`、`narrativeSwiper.reducedMotionHint` 等键
    - prompt 字面量与 promptId 保持英文，不进入 i18n 资源
    - 后端事件已带 i18n 字段时直接使用，未带则走前端 fallback 键
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 9.2 实现 aria-live 区域 + Reduced_Motion + Tab focus
    - 修改 `NarrativeSwiper.tsx`
    - 容器暴露为 `role="region"` + `aria-label`（i18n 中英文）
    - 新增 `<NarrativeAriaLiveRegion>`：`aria-live="polite"` + `aria-atomic="false"`，仅在 `activeIndex` 变化时把当前 `card.headline` 写入
    - 左右按钮提供 `aria-label`（中文 i18n），键盘焦点环可达
    - 通过 `window.matchMedia('(prefers-reduced-motion: reduce)')` + `useSyncExternalStore` 订阅
    - 命中 Reduced_Motion 时：关闭入场 / 退场 / Stage_Transition 动效（50ms 内瞬时切换）；关闭 Auto_Rotation 改为完全手动驱动
    - Tab 聚焦容器时暂停轮播，blur 后恢复
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x]* 9.3 编写可访问性回归测试
    - 扩展 `__tests__/NarrativeSwiper.test.tsx`
    - 断言 `role="region"` 与 `aria-label` 输出
    - 断言左右按钮的 `aria-label` 中英文 i18n
    - mock `matchMedia` 命中 Reduced_Motion，断言 Auto_Rotation 关闭、动效降级
    - 断言 Tab 焦点进入容器后 `focused` 状态变更
    - 断言 aria-live 文本随 `activeIndex` 变化
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [x]* 9.4 编写性能节流验收测试
    - 扩展 `__tests__/use-narrative-card-stream.test.ts`
    - 用 `vi.useFakeTimers()` 模拟后端 1 秒内推送 20 条 entry
    - 断言同 source 1 秒桶内仅最新 1 条入队，Capacity_Limit 不被瞬时打满
    - 断言 Auto_Rotation 1 秒内最多 1 次步进
    - 断言卡片切换路径不触发右栏主区组件的重新渲染（通过 selector 隔离 + memo 验证）
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 9.5 收口 barrel 导出与最终接线
    - 修改 `client/src/pages/autopilot/right-rail/index.ts` 导出 `NarrativeSwiper` / `MiniConsoleBar` / 类型
    - 中文 JSDoc 与项目其它模块一致，commit message 使用中文
    - 确认未引入新的 npm 运行时依赖（仅复用 `framer-motion` + `lucide-react`）
    - 运行 `node --run check` 确认 TS 基线未扩大
    - _Requirements: 10.5, 10.6, 10.7_

- [x] 10. M5 最终检查点 — 确保所有测试通过
  - 运行 narrative-swiper、mini-console、right-rail 全部测试
  - 运行既有 4 个组件测试（`RoleStatusStrip` / `CapabilityRail` / `FleetActivationLog` / `MiroFishCardStream`）确认 API 未变更
  - 运行 `node --run check` 确认 TS 基线未扩大（Req 10.6）
  - 确保所有测试通过，遇到问题向用户提问

## Notes

- 标 `*` 的子任务是可选测试任务，可跳过以加速 MVP；核心实现任务（不带 `*`）必须实施
- 每个里程碑（M1-M5）末尾都有 checkpoint 任务，确保增量可回退、可并入主线
- 任务粒度沿用现有 `right-rail` 子组件结构，所有新文件统一落在 `client/src/pages/autopilot/right-rail/narrative-swiper/` 与 `mini-console/` 子目录
- 通过组合方式收编现有 4 个组件，原组件保留并继续作为非叙事场景的小条带（Req 10.8）
- 不修改 `useBlueprintRealtimeStore` / `derive-mirofish-stream-entries.ts` 的对外 API（Req 10.1, 10.2）
- 不引入新 npm 运行时依赖，复用 `framer-motion` 与 `lucide-react`（Req 10.5）
- 测试沿用 `react-dom/server` SSR + `vi.mock` 模式，不引入新测试框架（Req 10.4）
- 性能、可访问性、i18n 三类约束在 M5 集中验收，避免前置阶段为合规返工

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "3.1", "7.2", "7.4"] },
    { "id": 2, "tasks": ["1.3", "1.4", "3.2", "7.3"] },
    { "id": 3, "tasks": ["1.5", "3.3"] },
    { "id": 4, "tasks": ["3.4"] },
    { "id": 5, "tasks": ["3.5", "7.5"] },
    { "id": 6, "tasks": ["3.6", "7.6"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["5.3", "5.4"] },
    { "id": 10, "tasks": ["5.5"] },
    { "id": 11, "tasks": ["9.2"] },
    { "id": 12, "tasks": ["9.3", "9.4", "9.5"] }
  ]
}
```
