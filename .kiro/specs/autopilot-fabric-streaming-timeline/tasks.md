# 任务清单:编组(Fabric)流式时间线重构

## Phase 1:时间线骨架

- [x] 1.1 新建 `client/src/pages/autopilot/right-rail/timeline/TimelineNode.tsx` — 三态时间线节点组件(completed / active / future),接收 `SubStageSummary` + status + children
- [x] 1.2 新建 `client/src/pages/autopilot/right-rail/timeline/TimelineCompletedNode.tsx` — 已完成节点:一行标题 + badge + 3 指标 + 可选展开按钮
- [x] 1.3 新建 `client/src/pages/autopilot/right-rail/timeline/TimelineActiveNode.tsx` — 活跃节点:标题 + 进度内容区 + spinner/skeleton
- [x] 1.4 新建 `client/src/pages/autopilot/right-rail/timeline/TimelineFutureNode.tsx` — 未来节点:灰色标题占位
- [x] 1.5 重写 `AutopilotRightRail.tsx` — 从 `FabricCardStream` 改为 `RAIL_SUB_STAGE_ORDER.map()` 渲染三态时间线,复用 `resolveRailSubStage` 判定 activeIndex
- [x] 1.6 删除旧的 `CompletedCard` / `ActiveCard` / `FabricCardStream` 内部组件
- [x] 1.7 更新 `fabric-dispatch.property.test.tsx` — 适配新的 DOM 结构断言

## Phase 2:自动推进

- [x] 2.1 在 `AutopilotRoutePage.tsx` 新增 `useAutoAdvance` hook — 监听 `job.stage` + 各阶段数据就绪状态,自动触发下一阶段 API
- [x] 2.2 实现 spec_tree → spec_docs 自动推进(替代当前的 `SpecTreeAdvanceCTA` + `window.location.reload()`)
- [x] 2.3 实现 spec_docs → effect_preview 自动推进
- [x] 2.4 实现 effect_preview → prompt_packaging 自动推进
- [x] 2.5 实现 prompt_packaging → runtime_capability 自动推进
- [x] 2.6 实现 runtime_capability → engineering_handoff 自动推进
- [x] 2.7 实现 engineering_handoff → engineering_landing(artifact_memory)自动推进
- [x] 2.8 删除 `SpecTreeAdvanceCTA` 组件(不再需要手动按钮)
- [x] 2.9 每步失败时在活跃节点展示错误 + 重试按钮

## Phase 3:流式动画

- [x] 3.1 新建 `client/src/pages/autopilot/right-rail/timeline/timeline-animations.css` — fade-in / slide-up / collapse keyframes
- [x] 3.2 已完成节点切换时添加 collapse 过渡(高度从展开到折叠)
- [x] 3.3 新活跃节点出现时添加 fade-in + slide-up 入场动画
- [x] 3.4 活跃节点内容区的 skeleton / spinner 加载态
- [x] 3.5 实现 `scrollIntoView({ behavior: "smooth" })` 自动滚动到活跃节点
- [x] 3.6 `prefers-reduced-motion` 媒体查询降级

## Phase 4:详情入口

- [x] 4.1 已完成节点添加"查看详情"链接,跳转到 `/specs` 对应 workbench
- [x] 4.2 SPEC 树详情:跳转到 `/specs` 页面的 SpecTreeWorkbenchPanel
- [x] 4.3 规格文档详情:跳转到 `/specs` 页面的 SpecDocumentWorkbenchPanel
- [x] 4.4 其他阶段详情:跳转到 `/specs` 页面对应面板

## Phase 5:清理与回归

- [x] 5.1 删除 `render-sub-stage-panel.tsx` 中不再需要的面板实例化逻辑(已被时间线替代)
- [x] 5.2 删除 `.autopilot-panel-adapter` CSS override(不再需要 workbench 窄宽适配)
- [x] 5.3 更新 `AutopilotRoutePage.test.tsx` 适配新的时间线 DOM 结构
- [x] 5.4 确保 TS 错误基线不扩大
- [x] 5.5 确保 `/specs` 全宽页面的 `BlueprintProgressPanel` 不受影响
- [x] 5.6 全量右栏测试回归通过
