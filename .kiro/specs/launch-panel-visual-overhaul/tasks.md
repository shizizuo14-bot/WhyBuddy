# 任务清单：发起面板视觉大改

## 说明

基于效果图对发起面板进行视觉大改，将当前基础浮层升级为完整的"任务自动驾驶"发起体验。

## 任务

- [x] 1. 升级 LaunchPanelShell 标题栏与遮罩
  - [x] 1.1 确保遮罩使用 `fixed inset-0` 覆盖在 3D 场景上方，背后场景保持可见
  - [x] 1.2 将遮罩背景改为 `rgba(0,0,0,0.5)` 深色半透明
  - [x] 1.3 将卡片最大宽度调整为 760px，最大高度 `calc(100vh - 120px)`，内部 `overflow-y: auto` 滚动，居中显示
  - [x] 1.4 确保面板不会撑出视口，所有内容在卡片内部滚动
  - [x] 1.5 重构标题栏：左侧"任务自动驾驶"主标题 + "Autopilot Control"副标题 + 说明文字
  - [x] 1.6 右侧添加"更新任务"、"刷新"、"更多(…)"三个操作按钮
  - [x] 1.7 添加 i18n 键

- [x] 2. 创建 LaunchModeTabBar 组件
  - [x] 2.1 新建 `client/src/components/launch/LaunchModeTabBar.tsx`
  - [x] 2.2 实现五种模式 Tab：快速模式、标准模式、深度模式、研究模式、自定义模式
  - [x] 2.3 选中态使用 `--foreground` 背景 + 白色文字，未选中态使用 `--muted` 背景
  - [x] 2.4 接入 `nl-command-store` 的 launch mode 状态
  - [x] 2.5 添加 i18n 键
  - [x] 2.6 编写组件测试

- [x] 3. 升级目标输入区样式
  - [x] 3.1 添加"输入你的目标"区块标题
  - [x] 3.2 升级文本框样式：圆角边框、`--card` 背景、placeholder 提示完整目标格式
  - [x] 3.3 添加右下角字数统计（0/1000）
  - [x] 3.4 添加 i18n 键

- [x] 4. 创建 RoutePlannerPreview 组件
  - [x] 4.1 新建 `client/src/components/launch/RoutePlannerPreview.tsx`
  - [x] 4.2 实现"自主规划路线"区块标题和说明文字
  - [x] 4.3 实现四步横向流程图：目的地 → 路线搜索 → 执行步骤 → 校验/证据
  - [x] 4.4 每步包含：圆形图标容器（红/蓝/绿/紫）、标题、描述
  - [x] 4.5 步骤间用虚线箭头连接
  - [x] 4.6 添加 i18n 键
  - [ ] 4.7 编写组件测试

- [x] 5. 创建 CockpitCapabilityGrid 组件
  - [x] 5.1 新建 `client/src/components/launch/CockpitCapabilityGrid.tsx`
  - [x] 5.2 实现"能力驾驶舱 COCKPIT"区块标题和说明文字
  - [x] 5.3 实现能力卡片网格（2x2 或自适应）：浏览器能力、代码执行器、文件系统、知识检索
  - [x] 5.4 每个卡片包含：图标、能力名称、简短描述
  - [x] 5.5 实现"更多能力"展开按钮
  - [x] 5.6 根据当前模式（快速/标准/深度）动态显示可用能力
  - [x] 5.7 添加 i18n 键
  - [ ] 5.8 编写组件测试

- [x] 6. 创建 OutputDeliveryConfig 组件
  - [x] 6.1 新建 `client/src/components/launch/OutputDeliveryConfig.tsx`
  - [x] 6.2 实现"输出与交付"区块标题和说明文字
  - [x] 6.3 实现交付物 chip 列表：结果摘要、生成文件、执行日志、详细截图、操作记录
  - [x] 6.4 实现"完成后自动打开结果"开关
  - [x] 6.5 添加 i18n 键
  - [ ] 6.6 编写组件测试

- [x] 7. 创建 LaunchBottomBar 组件
  - [x] 7.1 新建 `client/src/components/launch/LaunchBottomBar.tsx`
  - [x] 7.2 实现左侧：添加附件按钮（📎图标）、高级设置按钮（⚙图标）
  - [x] 7.3 实现右侧：保存为模板按钮（outline 样式）、启动任务主按钮（深色 + ▶ 图标）
  - [x] 7.4 操作栏顶部有分隔线
  - [x] 7.5 添加 i18n 键
  - [ ] 7.6 编写组件测试

- [x] 8. 组装并集成到 LaunchPanelShell
  - [x] 8.1 在 `LaunchPanelShell.tsx` 中按顺序组装：标题栏 → ModeTabBar → 目标输入 → RoutePlannerPreview → CockpitCapabilityGrid → OutputDeliveryConfig → LaunchBottomBar
  - [x] 8.2 添加区块间的分隔线和间距
  - [x] 8.3 确保滚动行为：内容超出时卡片内部滚动，底部操作栏固定
  - [ ] 8.4 编写集成测试

- [x] 9. 响应式适配
  - [x] 9.1 桌面端（≥1280px）：居中浮层 760px
  - [x] 9.2 平板端（768-1279px）：居中浮层 90vw
  - [x] 9.3 移动端（<768px）：底部抽屉全宽，流程图改为纵向
  - [x] 9.4 验证各断点下布局正确

- [x] 10. 构建验证
  - [x] 10.1 运行 `npm run build` 验证构建成功
  - [x] 10.2 运行 `node --run check` 验证不引入新的 TypeScript 错误
  - [ ] 10.3 运行 `npm run test` 验证不引入新的测试失败
