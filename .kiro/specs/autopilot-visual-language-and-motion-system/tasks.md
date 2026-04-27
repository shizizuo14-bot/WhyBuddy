# 任务清单：自动驾驶视觉语言与动效系统

- [x] 定义 Destination / Route / Fleet / Drive State / Takeover / Evidence 的视觉 token。
- [x] 定义 running / waiting / blocked / done / replanning / verified 状态色。
- [x] 为路线生成设计 stagger reveal 动效。
- [x] 为路线切换设计 selected glow 或 path transition。
- [x] 为 Drive State 推进设计 rail advance 动效。
- [x] 为接管阻塞设计警示但不打扰的动效。
- [x] 为证据记录设计 timeline append 动效。
- [x] 回补 `autopilot-explainability-and-telemetry` 中视觉解释层缺失。
- [x] 检查 TaskAutopilotPanel / OfficeTaskCockpit / MissionWallTaskPanel 的颜色语义是否一致。
- [x] 抽取可复用 class 或设计 token，避免组件内硬编码散落。
- [x] 为 prefers-reduced-motion 增加降级策略。
- [x] 更新架构图或 README 中自动驾驶视觉方向说明。

## 视觉解释层标记

- `AUTOPILOT_ONBOARDING_LAYER_MARKERS` 覆盖 Destination / Route / Fleet / Takeover-Evidence / First-entry cockpit。
- `UNIFIED_LAUNCH_EXPLANATION_LAYER_MARKERS` 覆盖 Destination preview / Confidence / Attachment influence / Missing waypoints / Waypoints complete。
