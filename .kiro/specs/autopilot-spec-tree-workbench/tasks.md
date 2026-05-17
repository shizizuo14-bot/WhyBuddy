# Spec Tree 工作台 — 任务列表

## Wave 0：纯函数与组件骨架（不挂载）

- [ ] 1. 新增 `derive-spec-tree-chip.ts` 与单测
  - 路径：`client/src/pages/autopilot/right-rail/derive-spec-tree-chip.ts`
  - 导出 `SpecTreeChipDescriptor` / `ChipTone` 类型与 `deriveSpecTreeChip`
    纯函数
  - 测试：`__tests__/derive-spec-tree-chip.test.ts`
    - 5 档 tone 优先级（neutral / info / warning / success / danger）
    - source 严重级（template > llm_fallback > llm）
    - ephemeral "generating" 在 docs 不全时优先；docs 已全时被忽略
    - 1 / 2 / 3 份文档情形下的 X/3 reviewing label
    - rejected 任一份触发 danger tone

- [ ] 2. 新增 `parse-spec-docs-observing.ts` 与单测
  - 路径：`client/src/pages/autopilot/right-rail/parse-spec-docs-observing.ts`
  - 导出 `SpecDocsObservingSnapshot` 与 `parseSpecDocsObservingEntries`
  - 测试：`__tests__/parse-spec-docs-observing.test.ts`
    - "✓ <title> — 规格文档已生成" 解析为 generating
    - "⚠ <title> — 降级为模板" 解析为 fallback
    - title 含特殊字符（破折号、emoji、引号）能正确提取
    - stageId !== "spec_docs" 的事件被跳过
    - phase !== "observing" 的事件被跳过

- [ ] 3. 新增 `SpecTreeChip` 与 `SpecDocPreviewBlock` 子组件
  - 路径：
    - `client/src/pages/autopilot/right-rail/spec-tree-workbench/SpecTreeChip.tsx`
    - `client/src/pages/autopilot/right-rail/spec-tree-workbench/SpecDocPreviewBlock.tsx`
  - 子组件均为只读 SSR 友好；输入 props 直接来自 deriveSpecTreeChip 与
    BlueprintSpecDocument
  - 测试：每个组件一份 `*.test.tsx`，用 `renderToStaticMarkup` 验证
    - chip 的 label / tone class / source tag 渲染
    - preview block 的 type 徽章 / status / source / summary 渲染
    - 不存在文档时显示"尚未生成"

- [ ] 4. 新增 `SpecTreeWorkbench` 主组件
  - 路径：`client/src/pages/autopilot/right-rail/spec-tree-workbench/SpecTreeWorkbench.tsx`
  - props 按 design.md 中 SpecTreeWorkbenchProps 定义
  - 实现节点行展开（accordion）、顶部双 CTA、in-flight 锁
  - 内部使用 deriveSpecTreeChip 与 parseSpecDocsObservingEntries
  - 通过 `useBlueprintRealtimeStore(s => s.agentReasoning.entries)` 取实时态
  - 测试：`SpecTreeWorkbench.test.tsx`
    - 顶部双 CTA testid 存在；selected 时次按钮可用，否则 disabled
    - 节点行渲染顺序与 specTree.nodes 一致
    - 点击节点行触发展开（通过 React 受控状态展开），重渲染后 3 个
      `SpecDocPreviewBlock` 出现

## Wave 1：切换右栏 + 更新顺序常量

- [ ] 5. 修改 `RAIL_SUB_STAGE_ORDER`
  - 路径：`client/src/pages/autopilot/right-rail/types.ts`
  - 删除 `"spec_documents"` 项；同步收紧 `AutopilotRailSubStage` 联合
  - 更新顶部 JSDoc 中的 "8 个" → "7 个"

- [ ] 6. 更新所有依赖 RAIL_SUB_STAGE_ORDER 的 PBT / 测试
  - `right-rail/__tests__/sub-stage-summary.test.ts`：去掉 spec_documents
    分支用例；保留其它子阶段 case
  - `right-rail/__tests__/resolve-rail-sub-stage.property.test.ts`：更新
    arbitrary 列表
  - `right-rail/__tests__/fabric-dispatch.property.test.tsx`：同上
  - `right-rail/hooks/__tests__/use-autopilot-right-rail-data.test.ts`：
    `effectPreviews: 非合法 currentSubStage`、`非 artifact_memory 的其它
    合法 currentSubStage` 两个用例移除 spec_documents 字符串
  - `right-rail/hooks/__tests__/use-autopilot-right-rail-data.property.test.ts`：
    更新 fc.constantFrom 列表
  - `right-rail/hooks/__tests__/use-right-rail-sub-stage-state.test.ts`：
    替换 applySubToSearch case
  - `right-rail/hooks/__tests__/use-right-rail-sub-stage-state.property.test.ts`：
    更新 arbitrary
  - `right-rail/panels/__tests__/props-narrowing.property.test.ts`：去掉
    spec_documents

- [ ] 7. 更新 `autopilot-right-rail-cards.test.tsx`
  - 不再期待 `data-sub-stage-placeholder="spec_documents"`（已是负断言）
  - 新增正断言：spec_tree 卡片内出现 SpecTreeWorkbench testid

- [ ] 8. 在 `AutopilotRightRail` 内挂载 SpecTreeWorkbench
  - 路径：`client/src/pages/autopilot/right-rail/AutopilotRightRail.tsx`
  - 在 spec_tree 子阶段 active 时，渲染 SpecTreeWorkbench；其它子阶段
    保持现状
  - 删除 `SpecDocumentsPanel` 在 fabric timeline 中的渲染分支
  - 不删除 SpecDocumentsPanel 文件本身（AC8）

- [ ] 9. 在 `AutopilotRoutePage` 派生 specDocuments
  - 路径：`client/src/pages/autopilot/AutopilotRoutePage.tsx`
  - 新增 `readAutopilotSpecDocuments(latestJob)` 派生与 useMemo
  - 通过 rightRailView / 直接 prop 传给 SpecTreeWorkbench
  - 接收 onSpecDocumentsGenerated 回调更新 setLatestJob

- [ ] 10. 更新 `useAutoAdvance` 跳过 spec_documents
  - 路径：`client/src/pages/autopilot/right-rail/hooks/use-auto-advance.ts`
  - spec_tree 完成后直接推进 effect_preview
  - 删除 spec_documents 分支
  - 更新测试：`use-auto-advance.spec-tree.test.ts`

## Wave 2：HUD 与回归

- [ ] 11. HUD 文案对齐
  - 路径：`client/src/pages/autopilot/AutopilotRoutePage.tsx` 中
    AutopilotMissionHud
  - 当后端 stage === "spec_docs" 时，hud 摘要追加 "正在为整棵 SPEC 树
    生成文档..." 类文案；timeline 高亮仍指向 spec_tree（前端 stage map
    将 "spec_docs" 映射为 "spec_tree" 卡片）
  - 测试：在 `AutopilotRoutePage.test.tsx` 中加一个 SSR 用例验证文案

- [ ] 12. 完整回归
  - `node --run check`：TS 错误数 ≤ 116（不扩张基线）
  - `& .\node_modules\.bin\vitest.cmd run client/src/pages/autopilot/`：
    326 + 新增（不少于 326）
  - `& .\node_modules\.bin\vitest.cmd run --config vitest.config.server.ts
    server/`：保持既有数量；不期望新增
  - 手动验证：硬刷新 `/autopilot`，跑 1 次完整 input → fabric 流，确认：
    - fabric 阶段右栏 timeline 只显示 7 个子节点
    - spec_tree 卡片同时承载树视图 + 文档状态 chip + 双 CTA
    - 点击 "生成整棵树文档" 后所有节点 chip 实时切换到 "生成中"，
      逐个回到 reviewing
    - 行展开预览三份文档；切换节点时 selectedNodeId 跟随
    - 不再出现独立的 spec_documents 卡片
