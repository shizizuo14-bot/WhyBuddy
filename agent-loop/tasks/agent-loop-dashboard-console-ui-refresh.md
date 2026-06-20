# AgentLoop dashboard console UI refresh

## 目标

把 VS Code dashboard 从“能用的信息页”重构成“运维控制台型”界面：密度高、状态清楚、证据优先，方便快速判断 queue（队列）是否仍在跑、哪个 task（任务）失败、旧 run（运行）是否 stale interrupted（运行中断）。

## 设计口径

- 不引入 React、Ant Design 或额外 runtime dependency。
- 使用 vanilla JS（原生 JS）轻组件化拆分 `dashboard.js`。
- 使用 VS Code theme variables（主题变量）做颜色和背景，保证浅色/深色主题都可用。
- 控制圆角不超过 8px，不做装饰型渐变，不做卡片套卡片。
- overview（总览）优先展示 queue health（队列健康）、当前 run、stale interrupted、失败/崩溃/待跑。
- detail（详情）按状态、gate、证据、review、日志组织，减少视觉噪声。

## 拆分边界

- `agent-loop/vscode-extension/media/dashboard.js`
  - 拆出小型 renderer：toolbar、overview header、queue stats、task table、detail hero、pipeline、status cards、evidence sections、review rounds、agent log、links。
  - 保持单文件，避免 VSIX webview 多文件加载和 CSP（内容安全策略）复杂化。
- `agent-loop/vscode-extension/media/dashboard.css`
  - 重写为 tokens、layout、controls、overview、detail、utilities 分区。
  - 使用表格化任务列表，提升扫读效率。

## 验证标准

- `npm run compile` in `agent-loop/vscode-extension` 通过。
- `npm test` in `agent-loop/vscode-extension` 通过。
- `npm test` in `agent-loop` 通过。
- mojibake（乱码）扫描通过。
- `npm run package` in `agent-loop/vscode-extension` 能重新打包 VSIX。
- VSIX 内容包含 `media/dashboard.js`、`media/dashboard.css` 和扩展 `out` 文件。
