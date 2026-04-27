# 设计文档：自动驾驶移动端与响应式驾驶舱

## 设计概述

响应式策略采用“桌面三栏、平板双栏、移动分段驾驶舱”。

## 布局策略

### Desktop

- 左：Destination & Route
- 中：Live Drive
- 右：Takeover & Evidence

### Tablet

- 上：Destination & Route
- 中：Live Drive
- 右侧 drawer：Takeover & Evidence

### Mobile

- 顶部：Destination summary
- 分段 tabs：Route / Drive / Takeover / Evidence
- 底部：Launch / Takeover action

## 优先级规则

当出现阻塞：

1. takeover-required
2. route selection
3. runtime upgrade
4. execution status
5. evidence

## 回补既有缺陷方向

- 检查 `useViewportTier` 是否足够支撑 autopilot cockpit。
- 修复 bottom dock 在移动端遮挡路线确认按钮的问题。
- 为 route overlay 增加 bottom sheet 模式。
