# 需求：autopilot 子阶段面板内容化包裹（Wave 3 / Spec 5）

## 背景

8 个子阶段面板（`AgentCrewFabricPanel` / `SpecTreePanel` / `SpecDocumentsPanel` / `EffectPreviewPanel` / `PromptPackagePanel` / `RuntimeCapabilityPanel` / `EngineeringHandoffPanel` / `ArtifactMemoryPanel`）目前每个都自带一层「外壳 chrome」：

- `rounded-[20px]` 圆角大盒子
- 自带头部 icon + 标题 + 副标题 + 右上 Badge
- 内部嵌套 `rounded-[14px]` 中等卡片 + `rounded-[12px]` 小卡片（三层嵌套）

这种 chrome 在 Spec 4 的 `SubStageCard` 里会产生「卡片套卡片」的重复视觉，本 spec 把面板的**外壳 chrome 剥掉**，让面板内容作为「纯内容插槽」渲染在 `SubStageCard` 内部。

## 硬约束：不能修改 `SpecTreePanel` 与 `SpecDocumentsPanel` 内部实现

根据原 spec `autopilot-right-rail-stage-panels` 需求 9.1 / 9.2，`SpecTreeWorkbenchPanel.tsx` 与 `SpecDocumentWorkbenchPanel.tsx` 的代码不得修改。

本 spec 的策略：
- 对**能修改的 6 个面板**（AgentCrewFabric / EffectPreview / PromptPackage / RuntimeCapability / EngineeringHandoff / ArtifactMemory）：剥离外壳 chrome，让组件根节点变为一个纯 `<div>` + padding
- 对**不能修改的 2 个面板**（SpecTree / SpecDocuments）：保持原样，仅在 `render-sub-stage-panel.tsx` 中做**外层样式适配层**（外面包一层 `<div class="...">` 覆盖嵌套圆角）

## 核心目标

让 8 个面板在 `SubStageCard` 里看起来统一：不再嵌套圆角、不再自带标题、不再有彩色 badge，只保留真正的数据内容（表格、列表、指标、输入框、按钮）。

## 需求

### 需求 1：剥离可改 6 个面板的外壳 chrome

以下 6 个面板文件可以直接编辑：

- `panels/AgentCrewFabricPanel.tsx`
- `panels/EffectPreviewPanel.tsx`
- `panels/PromptPackagePanel.tsx`
- `panels/RuntimeCapabilityPanel.tsx`
- `panels/EngineeringHandoffPanel.tsx`
- `panels/ArtifactMemoryPanel.tsx`

对每个面板：

1. **移除根节点的 `rounded-[20px]` / `bg-white` / `px-4 py-4` 外壳**
2. **移除自带的 header 块**（icon + 标题 + 副标题 + `<Badge variant="outline">` 右上统计标签），因为 `SubStageCard` 已提供卡片头
3. **移除面板内开头的 "Agent Crew / 智能体团队" 一类的 eyebrow label**
4. **保留**：
   - 核心数据展示（角色列表、预览列表、表单、按钮等）
   - 内部嵌套的 sub-card 可以保留但要把圆角从 `rounded-[14px]` / `rounded-[12px]` **改成直角 `rounded-none`**
5. **根节点改为 `<div className="grid gap-3">`**（无 padding，因为 `SubStageCard` 已提供）

### 需求 2：不能修改的 2 个面板用外层适配

对 `SpecTreePanel.tsx` 与 `SpecDocumentsPanel.tsx`：

- **不修改组件内部**（遵守原 spec 9.1 / 9.2 约束）
- 在 `render-sub-stage-panel.tsx` 中渲染时，**外面包一层适配 div**：

```tsx
if (subStage === "spec_tree") {
  return (
    <div className="autopilot-panel-adapter">
      <SpecTreePanel ... />
    </div>
  );
}
```

- 在 `client/src/index.css` 新增一条 CSS override（放在 `.mirofish-rail` scope 下）：

```css
.mirofish-rail .autopilot-panel-adapter > * {
  /* 覆盖 SpecTreeWorkbenchPanel 自带的 rounded / bg / padding */
  border-radius: 0 !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}
```

这种外层 override 策略在原 spec `autopilot-right-rail-stage-panels` 的需求 2.9 中被允许作为「降级路径」。

### 需求 3：面板内部嵌套卡片统一转直角

对所有**可改**面板内部的嵌套小卡片：

- `rounded-[14px]` → `rounded-none`
- `rounded-[12px]` → `rounded-none`
- `rounded-full` （Badge 小胶囊）保留但改为 `rounded-none`
- `border-slate-200 / bg-slate-50 / border-emerald-200 / bg-emerald-50 / border-sky-200 / bg-sky-50 / border-amber-200 / bg-amber-50` 等彩色边框背景一律换为 `border-[#EAEAEA] / bg-white`
- 彩色 Badge（`bg-emerald-50 text-emerald-700` 等）改为 `border-[#CCCCCC] bg-white text-black`

注意这一步与全局 CSS 的 `.mirofish-rail` scope 覆盖有部分重叠，但直接在 JSX 改可以避免依赖 `!important` hack。

### 需求 4：保留所有业务交互与 data-testid

- 不修改任何 `data-testid="autopilot-..."` / `data-testid="blueprint-..."` 属性
- 不修改面板内部的 fetch / useEffect / useState 逻辑
- 不修改面板的 props 签名
- 不修改 i18n 文案

### 需求 5：保留 Rendering Parity 测试

原 spec `autopilot-right-rail-stage-panels` 的 `panels/__tests__/shim-identity.test.ts` 与 `panels/__tests__/props-narrowing.property.test.ts` 的断言重点：

- 面板 props 的窄化契约不变
- 面板输入 null/undefined 时的降级行为不变
- 面板的 data-testid / DOM 结构不变（**但允许 class / border-radius 变化**）

本 spec 的改动只影响 class / border-radius / 头部块是否渲染，不影响 props / data-testid / 业务行为。需要：

- 逐个检查 shim-identity 测试是否断言 `rounded-[20px]` 等 class 字面量
- 若有断言依赖某 class，需更新测试断言（允许调整，因为 spec 明确要求视觉重构）

### 需求 6：新增视觉一致性测试

新增 `panels/__tests__/panel-chrome-strip.test.ts`：

- 对每个可改面板，renderToStaticMarkup 后断言：
  - 根节点没有 `rounded-[20px]` class
  - 不含 `<Badge variant="outline">` 的计数标签（如 "N 角色 / M 事件"）
  - 不含自带的 icon + 标题 eyebrow 块

至少 6 个测试 case（6 个可改面板各一个）。

## 非目标

- 不修改 `SpecTreeWorkbenchPanel` 与 `SpecDocumentWorkbenchPanel` 的内部实现
- 不删除任何面板的业务逻辑
- 不修改 `BlueprintProgressPanel`（`/specs` 页面）
- 不修改 rail 主文件 / primitive / summary extractor

## 完成判定

- `npm run check` TS error 数保持 107 不增长
- `npx vitest run client/src/pages/autopilot` 全过
- 人工目视：
  - 每张 `SubStageCard` 展开后，面板内容与卡片 header 之间视觉统一
  - 不再出现卡片套卡片的圆角嵌套
  - 不再出现重复的标题 / 副标题 / icon
  - SpecTree / SpecDocuments 两个「不能改」的面板看起来与其他 6 个一致（靠 CSS adapter 层覆盖）
