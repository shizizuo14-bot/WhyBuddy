# 任务：autopilot 子阶段面板内容化包裹

## 前置依赖

- Spec 1 / 2 / 3 已合入 main
- **Spec 4 与本 spec 并行执行**（不等 Spec 4 合入）

## 并行边界（与 Spec 4）

本 spec 与 Spec 4 `autopilot-right-rail-streaming-layout` 可完全并行。文件所有权：

| 文件 | Spec 4 | 本 spec（Spec 5） |
| --- | --- | --- |
| `AutopilotRightRail.tsx` | 重写 | **不碰** |
| `right-rail/render-sub-stage-panel.tsx` | 新建（含 adapter wrapper） | **不碰** |
| 6 个 `panels/*.tsx`（除 SpecTree/SpecDocuments 两个 shim） | 不碰 | 剥 chrome |
| `client/src/index.css` | 不碰 | 加 adapter CSS |

adapter CSS class 名 `autopilot-panel-adapter` 是两 spec 之间的唯一约定 — Spec 4 的 `render-sub-stage-panel.tsx` 会把 `SpecTreePanel` / `SpecDocumentsPanel` 外面包一层 `<div className="autopilot-panel-adapter">`；本 spec 只需在 `index.css` 加对应选择器 `.mirofish-rail .autopilot-panel-adapter`，不碰 `render-sub-stage-panel.tsx` 文件本身。

## 可改的 6 个面板改造

- [x] 1. 改造 `panels/AgentCrewFabricPanel.tsx`
  - 根节点 chrome 剥离（移除 rounded-[20px] / bg-white / px-4 py-4）
  - 删除头部 Layers3 icon + "智能体团队" eyebrow + h3 + subtitle + Badge 计数
  - 内部嵌套卡片 rounded 全改直角 + 彩色换灰
  - 清理不再使用的 import（Layers3 / Badge 等）

- [x] 2. 改造 `panels/EffectPreviewPanel.tsx`
  - 根节点 chrome 剥离
  - 删除头部 eyebrow
  - 内部嵌套卡片 + RuntimeProjectionCard rounded 改直角

- [x] 3. 改造 `panels/PromptPackagePanel.tsx`
  - 根节点 chrome 剥离
  - 删除头部 PackageCheck icon + 标题
  - chips / 内容预览 改直角

- [x] 4. 改造 `panels/RuntimeCapabilityPanel.tsx`
  - 根节点 chrome 剥离
  - 删除头部 ListChecks / Sparkles / Terminal icon + 标题
  - SummaryTile + Agent 角色行改直角 + 去彩色

- [x] 5. 改造 `panels/EngineeringHandoffPanel.tsx`
  - 根节点 chrome 剥离
  - 删除头部 FileCheck2 / CheckCircle2 icon + 标题
  - 落地计划 / 运行状态 / 平台选择器改直角

- [x] 6. 改造 `panels/ArtifactMemoryPanel.tsx`
  - 根节点 chrome 剥离
  - 删除头部 GitBranch / Layers3 / PlayCircle eyebrow
  - Summary tile / RouteMetric / feedback 列表改直角

## SpecTree / SpecDocuments 的适配 CSS

Spec 4 已负责在 `render-sub-stage-panel.tsx` 中把这两个 panel 外包 `<div className="autopilot-panel-adapter">`，本 spec 只需加 CSS override。

- [x] 7. 在 `client/src/index.css` 中添加 adapter CSS override
  - 放在 `.mirofish-rail` scope 现有规则末尾
  - 新增如下规则：
    ```css
    .mirofish-rail .autopilot-panel-adapter > * {
      border-radius: 0 !important;
      background: transparent !important;
    }

    .mirofish-rail .autopilot-panel-adapter [class*="rounded-"] {
      border-radius: 0 !important;
    }

    .mirofish-rail .autopilot-panel-adapter [class*="bg-slate-50"],
    .mirofish-rail .autopilot-panel-adapter [class*="bg-slate-100"] {
      background-color: white !important;
    }

    .mirofish-rail .autopilot-panel-adapter [class*="border-slate-200"] {
      border-color: #EAEAEA !important;
    }
    ```
  - 规则仅在 `.mirofish-rail` scope + `.autopilot-panel-adapter` 内部生效，不影响 `/specs` 页面

## 测试

- [x] 8. 更新 `shim-identity.test.ts`
  - 检查是否有 assertion 依赖 `rounded-[20px]` 等字面量
  - 若有，放宽为仅断言 data-testid 存在

- [x] 9. 新增 `panel-chrome-strip.test.ts`
  - 对 6 个可改面板各写 2 个 case：
    - 断言 markup 不含 `rounded-[20px]`
    - 断言 markup 不含 counter badge 文案（如 "N 角色 / M 事件"）
  - 至少 12 个 case

## 验收

- [x] 10. 执行验证
  - `npx vitest run client/src/pages/autopilot` 全部通过
  - `node --run check` TS error 数 = 107
  - 若 Spec 4 尚未合入，rail 仍是旧样式但 panel 已剥 chrome（视觉可能短暂不一致，属预期）

- [x] 11. 提交
  - commit message: `refactor(autopilot): strip panel chrome and add adapter CSS for locked panels`
  - stage 内容：
    - 6 个 `panels/*.tsx` 可改面板
    - `client/src/index.css`（adapter CSS）
    - `panels/__tests__/panel-chrome-strip.test.ts`（新增）
    - `panels/__tests__/shim-identity.test.ts`（如有更新）
    - `.kiro/specs/autopilot-sub-stage-panel-wrapping/tasks.md`（勾选状态）
  - 禁止 stage `.kiro/blueprint-assets/jobs.json`
  - 禁止 stage `AutopilotRightRail.tsx` 或 `render-sub-stage-panel.tsx`（那些属于 Spec 4）
