# 任务清单：自动驾驶移动端与响应式驾驶舱

- [x] 定义 desktop/tablet/mobile 的 cockpit 布局断点。
- [x] 为三栏驾驶舱增加 tablet 双栏模式。
- [x] 为移动端增加 Route / Drive / Takeover / Evidence 分段导航。
- [x] 为路线规划浮层增加 bottom sheet 模式。
- [x] 保证阻塞接管点在移动端优先可见。
- [x] 检查底部 launch dock 与浮层按钮是否遮挡。
- [x] 为移动端目的地卡片做压缩展示。
- [x] 回补 `autopilot-cockpit-information-architecture` 中移动端策略缺失说明。
- [x] 修复 OfficeTaskCockpit 在窄屏下状态 chip 溢出问题。
- [x] 为 mobile cockpit 增加基础组件测试。
- [x] 检查 README 中截图或架构说明是否误导为仅桌面能力。
- [x] 记录移动端暂不支持的增强项，避免过度承诺。

## Lane F 文档回补说明（2026-04-26）

- README / README.zh-CN / steering 已补充 desktop / tablet / mobile 能力边界：桌面三栏，tablet 双栏，mobile 分段导航、压缩目的地卡片与 bottom sheet。
- 已明确移动端不是仅桌面能力缺失，而是同一组核心对象的响应式访问方式；移动端暂不承诺同时展示所有桌面高密度面板。
- Lane D 已为窄屏状态 chip 增加换行/断词/最大宽度保护与测试标记；bottom dock / route overlay 高度冲突不在本轮可安全修改范围内，仍由三栏布局任务追踪。
