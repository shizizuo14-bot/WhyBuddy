# 设计文档：自动驾驶视觉语言与动效系统

## 设计概述

视觉语言以“导航路线 + 驾驶仪表盘 + 可信证据”为核心，不做科幻过度包装。

## 视觉 token

### Object Colors

- Destination：暖白 / amber
- Route：orange / copper
- Fleet：green
- Drive State：blue
- Takeover：red / amber
- Evidence：slate / teal

### State Colors

- running：blue
- waiting：amber
- blocked：red
- done：green
- replanning：violet
- verified：teal

## 动效规范

- 路线生成：stagger reveal
- 路线切换：path morph / selected glow
- 状态推进：rail advance
- 接管阻塞：pulse warning
- 证据记录：timeline append

## 回补既有缺陷方向

- 检查现有 cockpit / task panel 是否颜色语义冲突。
- 修复紫色/默认 dashboard 倾向，保持当前 workspace 暖色系统。
- 为风险、接管、证据可信度建立统一 class 或 token。
