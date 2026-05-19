# 任务：autopilot 右栏 MiroFish 式流式卡片布局

## 前置依赖

- Spec 1 `autopilot-cockpit-shell-cleanup` 已合入 main
- Spec 2 `autopilot-sub-stage-card-primitive` 已合入 main，`SubStageCard` 已原生支持 `anchorAttr` / `ariaCurrentStep` 两个 prop
- Spec 3 `autopilot-sub-stage-metrics-extractor` 已合入 main

## 并行边界（与 Spec 5）

本 spec 与 Spec 5 `autopilot-sub-stage-panel-wrapping` 可完全并行。文件所有权：

| 文件 | Spec 4（本 spec） | Spec 5 |
| --- | --- | --- |
| `AutopilotRightRail.tsx` | 重写 | 不碰 |
| `right-rail/render-sub-stage-panel.tsx` | 新建（含 adapter wrapper） | 不碰 |
| 6 个 `panels/*.tsx`（除 SpecTree/SpecDocuments 两个 shim） | 不碰 | 剥 chrome |
| `client/src/index.css` | 不碰 | 加 adapter CSS |
| `__tests__/autopilot-right-rail-cards.test.tsx` | 新建 | 不碰 |
| `__tests__/panel-chrome-strip.test.ts` | 不碰 | 新建 |

零文件重叠。adapter CSS class 名 `autopilot-panel-adapter` 是两 spec 之间的唯一约定，必须双方保持一致。

## 任务清单

- [x] 1. 新建 `render-sub-stage-panel.tsx`
  - 新建文件 `client/src/pages/autopilot/right-rail/render-sub-stage-panel.tsx`
  - 把 `AutopilotRightRail.tsx` 中的 `renderSubStagePanel` 函数完整搬过去
  - 导出 `export function renderSubStagePanel(params): ReactNode`
  - 参数签名保持一致

- [x] 2. 为 `spec_tree` / `spec_documents` 加 adapter wrapper
  - 这两个 sub-stage 的 panel 组件不能修改内部实现（原 spec `autopilot-right-rail-stage-panels` 需求 9.1 / 9.2）
  - 在 `render-sub-stage-panel.tsx` 的这两个分支渲染时外层包一层 adapter div：
    ```tsx
    if (subStage === "spec_tree") {
      return (
        <div className="autopilot-panel-adapter" data-panel-adapter="spec-tree">
          <SpecTreePanel ... />
        </div>
      );
    }
    if (subStage === "spec_documents") {
      return (
        <div className="autopilot-panel-adapter" data-panel-adapter="spec-documents">
          <SpecDocumentsPanel ... />
        </div>
      );
    }
    ```
  - 其他 6 个 sub-stage 不需要 adapter 包裹（Spec 5 会直接改它们的内部样式）
  - adapter CSS class 名 `autopilot-panel-adapter` 必须与 Spec 5 在 index.css 中的选择器字符串一致

- [x] 3. 重写 `AutopilotRightRail.tsx` 主入口
  - 删除 `CompletedSubStageRow` / `readSubStageMetric` / `isSubStageDataReady` 等旧内部组件与函数（如果存在）
  - 删除 fabric 分支顶部旧 eyebrow 文本、「后续 N 步」提示、LIVE/PENDING 提示条（如果存在）
  - 用新的 `FabricCardStream` 内部组件重写 fabric 分支
  - import `SubStageCard` / `MetricsRow` / `StatusCapsule` / `deriveSubStageSummary` / `renderSubStagePanel`

- [x] 4. 实现 `FabricCardStream` 内部组件
  - 计算 `completed = RAIL_SUB_STAGE_ORDER.slice(0, activeIndex)`
  - 局部 state: `expanded: Partial<Record<AutopilotRailSubStage, boolean>>`
  - 容器外层 `bg-[#FAFAFA] px-5 py-5 space-y-4`
  - 渲染 `completed.map(sub => <CompletedCard>)` + `activeSubStage ? <ActiveCard> : null`

- [x] 5. 实现 `CompletedCard` 内部组件
  - 调用 `deriveSubStageSummary(sub, props, locale)`
  - 渲染 `<SubStageCard status="completed" expanded={expanded[sub]} onToggleExpanded={() => toggle(sub)} locale={locale}>`
  - body: `<MetricsRow>` + (expanded ? `renderSubStagePanel()` : null)

- [x] 6. 实现 `ActiveCard` 内部组件
  - 调用 `deriveSubStageSummary`
  - 渲染 `<SubStageCard status={dataReady ? "active" : "pending"} anchorAttr={{name:"data-sub-stage-placeholder", value:sub}} ariaCurrentStep locale={locale}>`
  - body: `<MetricsRow>` + (dataReady ? `renderSubStagePanel()` : `<PendingInlineState>`)

- [x] 7. 实现 `PendingInlineState` 内部 helper
  - 按 design.md 的代码块实现
  - 虚线边框 + mono 小字 + 双语文案

- [x] 8. 更新 `fabric-dispatch.property.test.tsx`
  - 确保 assertions 仍然通过（aside 根 / placeholder / aria-current 顺序）
  - 若因 `<section>` 标签变为 `<article>` 导致断言失败，更新为通过 data-* 属性定位

- [x] 9. 新增 `autopilot-right-rail-cards.test.tsx`
  - case 1：activeSubStage=`spec_tree` + 数据就绪，断言同时存在 `data-sub-stage-status="completed"` 与 `data-sub-stage-status="active"`
  - case 2：activeSubStage=`spec_tree` + `specTree=null`，断言 `data-sub-stage-status="pending"` + 「AWAITING UPSTREAM DATA」
  - case 3：activeSubStage=`agent_crew_fabric`，断言未来 7 个子阶段不渲染（markup 不含 spec_tree/spec_documents/... 相关子字符串）
  - case 4：adapter wrapper 存在 — activeSubStage=`spec_tree`，markup 包含 `data-panel-adapter="spec-tree"` 且 class 含 `autopilot-panel-adapter`

- [x] 10. 执行验证
  - `npx vitest run client/src/pages/autopilot` 全过
  - `node --run check` TS error 数 = 107
  - 人工目视（可选，Wave 2 完成后再做）：fabric 阶段可见 MiroFish 卡片流

- [x] 11. 提交
  - commit message: `feat(autopilot): rewrite right rail as MiroFish streaming card layout`
  - stage 内容：
    - `client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`
    - `client/src/pages/autopilot/right-rail/render-sub-stage-panel.tsx`（新增）
    - `client/src/pages/autopilot/right-rail/__tests__/autopilot-right-rail-cards.test.tsx`（新增）
    - `.kiro/specs/autopilot-right-rail-streaming-layout/tasks.md`（勾选状态）
  - 禁止 stage `.kiro/blueprint-assets/jobs.json` 或 6 个 panel 文件 或 `index.css`（那些属于 Spec 5）
