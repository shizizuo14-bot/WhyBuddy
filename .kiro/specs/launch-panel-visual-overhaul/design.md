# 设计文档：发起面板视觉大改

## 设计概述

基于效果图，将 `LaunchPanelShell` 从当前的基础浮层升级为完整的"任务自动驾驶"发起体验。核心改动集中在视觉层和布局层，不改变底层数据流（仍复用 `nl-command-store`、`tasks-store`、`unified-launch-coordinator`）。

## 布局结构

面板是 3D 办公室场景上方的遮罩浮层，不是独立页面。背后的 3D 场景保持可见。

```
┌─────────────────────────────────────────────────────┐
│  3D 办公室场景 (保持渲染，可见透过遮罩)              │
│  ┌─────────────────────────────────────────────┐    │
│  │  遮罩层 (fixed inset-0, rgba(0,0,0,0.5))   │    │
│  │  ┌───────────────────────────────────────┐  │    │
│  │  │  浮层卡片 (max-w-[760px],             │  │    │
│  │  │   max-h-[calc(100vh-120px)],          │  │    │
│  │  │   overflow-y-auto, 居中)              │  │    │
│  │  标题栏                                        │  │
│  │  任务自动驾驶 · Autopilot Control   [操作按钮] │  │
│  ├───────────────────────────────────────────────┤  │
│  │  模式切换 Tab                                  │  │
│  │  快速 | 标准 | 深度 | 研究 | 自定义            │  │
│  ├───────────────────────────────────────────────┤  │
│  │  目标输入区                                    │  │
│  │  [多行文本框]                        0/1000    │  │
│  ├───────────────────────────────────────────────┤  │
│  │  ⚙ 自主规划路线                               │  │
│  │  [目的地] → [路线搜索] → [执行步骤] → [校验]  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  ⚡ 能力驾驶舱 COCKPIT                         │  │
│  │  [浏览器] [代码执行器] [文件系统] [知识检索]   │  │
│  │                                    [更多能力]  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  📦 输出与交付                                 │  │
│  │  [结果摘要] [生成文件] [执行日志] ...  🔘自动  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  底部操作栏                                    │  │
│  │  📎附件  ⚙设置    [保存为模板] [▶ 启动任务]   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 组件拆分

### 新增组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `LaunchModeTabBar` | `client/src/components/launch/LaunchModeTabBar.tsx` | 五种模式切换 Tab |
| `RoutePlannerPreview` | `client/src/components/launch/RoutePlannerPreview.tsx` | 四步规划路线流程图 |
| `CockpitCapabilityGrid` | `client/src/components/launch/CockpitCapabilityGrid.tsx` | 能力卡片网格 |
| `OutputDeliveryConfig` | `client/src/components/launch/OutputDeliveryConfig.tsx` | 输出交付 chips + 开关 |
| `LaunchBottomBar` | `client/src/components/launch/LaunchBottomBar.tsx` | 底部操作栏 |

### 改造组件

| 组件 | 改动 |
|------|------|
| `LaunchPanelShell` | 重构内部布局，组装上述新组件，升级标题栏样式 |

## 设计令牌消费

所有组件消费 spec 1 定义的 CSS 变量：
- 卡片背景：`--card`
- 边框：`--border`
- 主色：`--primary`
- 文字：`--foreground` / `--muted-foreground`
- 圆角：`--radius`
- 遮罩：`rgba(0,0,0,0.5)` 或 `--overlay`

## 响应式策略

| 视口 | 行为 |
|------|------|
| ≥1280px | 居中浮层 max-width 760px |
| 768-1279px | 居中浮层 90vw |
| <768px | 底部抽屉全宽 |

## 数据流

不改变现有数据流：
- 模式切换 → `nl-command-store.setLaunchMode()`
- 目标输入 → `nl-command-store.setDraftText()`
- 启动任务 → `unified-launch-coordinator.submit()`
- 附件 → 现有 `fileInputRef` 机制
