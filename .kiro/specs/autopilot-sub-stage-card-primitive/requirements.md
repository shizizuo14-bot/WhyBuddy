# 需求：autopilot 子阶段 MiroFish 风格卡片原语（Wave 1 / Spec 2）

## 背景

Wave 2 的 `autopilot-right-rail-streaming-layout` 会把 8 个子阶段重新按 MiroFish 式卡片流呈现。为了避免 rail 主文件直接写大量样式字符串，本 spec 先抽出共享卡片原语，保证：

- 视觉 token 单源（圆角、边框颜色、间距、胶囊色）
- 已完成 / 活跃 / 未开始三种状态用同一 primitive
- 大号 mono 数字指标行用同一 primitive
- 状态胶囊（绿色「构建完成」/ 橙色「执行中」/ 灰色「等待」）用同一 primitive
- 后续 Spec 5 的面板 wrapping 可复用同一套卡片外壳

## 核心目标

在 `client/src/pages/autopilot/right-rail/primitives/` 下新增 3 个纯视图原语组件，为 Wave 2 准备好可组合的积木。

## 需求

### 需求 1：新增 `<SubStageCard>` 卡片外壳原语

- 文件位置：`client/src/pages/autopilot/right-rail/primitives/sub-stage-card.tsx`
- 接受 props：
  - `index: number` — 序号（从 0 开始，渲染时补零为 `01`）
  - `title: string` — 卡片标题（如「协作角色」）
  - `apiPath?: string` — 可选的 API path 说明（如 `POST /api/blueprint/agent-crew`）
  - `summary?: string` — 可选的 1-2 行说明文字
  - `status: "completed" | "active" | "pending"` — 卡片状态
  - `children: ReactNode` — 卡片主体插槽（通常是 `<MetricsRow>` + 可选展开详情）
  - `headerRight?: ReactNode` — 卡片右上角自定义插槽（默认会被状态胶囊占用）
  - `onToggleExpanded?: () => void` — 可选，展开/折叠点击回调
  - `expanded?: boolean` — 是否展开
- 视觉规则：
  - 直角（`border-radius: 0`）
  - 1px 边框
    - `completed` → `#E5E5E5` 灰
    - `active` → `#FF4500` 橙色（2px 加粗）
    - `pending` → `#EAEAEA` 淡灰 + 整卡 50% 透明度
  - padding: header 16px × 20px，body 20px × 24px
  - 序号 + 标题使用 Space Grotesk，标题 16-18px
  - apiPath 使用 JetBrains Mono 11px `#999`
  - summary 使用 Noto Sans SC 13px `#666`，line-height 22px
- `data-testid="autopilot-sub-stage-card"` 放在根节点
- `data-sub-stage-status="{status}"` 暴露状态用于测试
- 根节点使用 `<article>` 标签

### 需求 2：新增 `<StatusCapsule>` 状态胶囊原语

- 文件位置：`client/src/pages/autopilot/right-rail/primitives/status-capsule.tsx`
- 接受 props：
  - `status: "completed" | "active" | "pending"`
  - `locale: AppLocale`
- 三种状态的视觉规则：
  - `completed`：深绿背景 `#22c55e` + 白字「构建完成 / Done」+ 无动画
  - `active`：橙色背景 `#FF4500` + 白字「执行中 ● / Running ●」+ 圆点 pulse 动画
  - `pending`：灰底 `#F5F5F5` + `#999` 字「等待 / Pending」+ 无动画
- 直角边框 `border-radius: 0`
- padding: 4px × 10px
- 字号 11px，font-mono，uppercase，tracking 0.05em

### 需求 3：新增 `<MetricsRow>` 大号数字指标行原语

- 文件位置：`client/src/pages/autopilot/right-rail/primitives/metrics-row.tsx`
- 接受 props：
  - `metrics: Array<{ label: string; value: string | number; hint?: string }>`
  - `columns?: 2 | 3 | 4`（默认 3）
- 视觉规则：
  - grid 布局，列数按 columns 控制
  - 每个 metric：大号数字（JetBrains Mono / 32-36px / font-weight 500 / `#000`）+ 小号 label（JetBrains Mono 10px uppercase tracking 0.08em `#999`）+ 可选 hint（Noto Sans SC 11px `#666`）
  - metric 之间用垂直分隔线 1px `#EAEAEA`（除最后一列外）
  - padding: 16px 20px
- 根节点使用 `<dl>` 标签，每个 metric 用 `<dt>` + `<dd>`

### 需求 4：实现 `<SubStageCard>` 的展开 / 折叠交互

- 当 `onToggleExpanded` 传入时，卡片 header 显示一个右下角文本按钮（`展开 ↓` / `收起 ↑`）
- 当 `expanded === true` 时：卡片底部在 `children` 之后显示一个 `border-top 1px dashed #EAEAEA` 分隔区；上层会在该区内放展开详情（由 rail 主文件控制）
- 展开区本身不由本 primitive 渲染，本 primitive 只负责提供正确的状态 + 边界样式

### 需求 4.5：根节点预留 `anchorAttr` + `ariaCurrentStep` 属性通道

Wave 2 的 `autopilot-right-rail-streaming-layout` 需要把 `data-sub-stage-placeholder="{sub}"` 与 `aria-current="step"` 挂到活跃卡片的根节点上（满足 `fabric-dispatch.property.test.tsx` 测试契约）。

- `SubStageCardProps` 新增两个可选 prop：
  ```ts
  anchorAttr?: { name: string; value: string };
  ariaCurrentStep?: boolean;
  ```
- 根节点 `<article>` 按**固定顺序**渲染这两个属性：`anchorAttr` 先 spread，`aria-current` 后直接以 JSX 属性写出，确保 `data-sub-stage-placeholder` 出现在 `aria-current` 之前（满足测试中的正则 `data-sub-stage-placeholder="X"[^>]*aria-current="step"`）。
- 示例实现：
  ```tsx
  <article
    data-testid="autopilot-sub-stage-card"
    data-sub-stage-status={status}
    {...(anchorAttr ? { [anchorAttr.name]: anchorAttr.value } : {})}
    aria-current={ariaCurrentStep ? "step" : undefined}
    className={...}
  >
  ```

### 需求 5：无业务耦合

- 3 个 primitive 都是纯展示组件
- 不 import `@/lib/store` / `useAppStore`
- 不 import `AutopilotRightRailProps` / `BlueprintGenerationJob` 等业务类型
- 不读 `window` / `document`（可以用事件处理器但不手动操作 DOM）
- locale 仅影响 `StatusCapsule` 内部静态文案，其他 primitive 透传字符串

### 需求 6：单元测试覆盖

- 每个 primitive 配一份 `.test.tsx`：
  - `sub-stage-card.test.tsx`：测三种 status 边框样式、mirror data-sub-stage-status 属性、展开按钮显示逻辑
  - `status-capsule.test.tsx`：测三种 status 文案（中英各一）、class 样式
  - `metrics-row.test.tsx`：测 2/3/4 列 grid、每个 metric 正确渲染 label+value+hint、dl/dt/dd 结构
- 至少 12 个测试 case（3+3+3+3）

### 需求 7：导出接口

- 在 `client/src/pages/autopilot/right-rail/primitives/index.ts` 导出：
  - `SubStageCard`, `SubStageCardProps`
  - `StatusCapsule`, `StatusCapsuleProps`
  - `MetricsRow`, `MetricsRowProps`
  - `SubStageStatus = "completed" | "active" | "pending"` 类型

## 非目标

- 本 spec 不修改 `AutopilotRightRail.tsx` 主文件
- 本 spec 不修改任何 8 个 panel wrapper
- 本 spec 不引入新的状态管理 hook
- 本 spec 不引入新的 i18n 条目到 i18n 源（primitive 内 hardcode locale 文案）

## 完成判定

- `npm run check` 的 TS error 数保持 107 不增长
- `npx vitest run client/src/pages/autopilot/right-rail/primitives` 至少 12 个测试全部通过
- 所有 primitive 文件加起来 ≤ 300 行（含注释）
