<!--
 * @Author: wangchunji
 * @Date: 2026-04-27 14:22:09
 * @Description: 
 * @LastEditTime: 2026-04-27 16:12:00
 * @LastEditors: wangchunji
-->
# 任务清单：UI 色板与设计令牌重构

## 任务

- [x] 1. 替换 `:root` 中的核心 OKLCH 设计令牌值
  - [x] 1.1 将 `--background` 从 `oklch(0.97 0.01 80)` 替换为 `oklch(0.98 0 0)`
  - [x] 1.2 将 `--foreground`、`--card-foreground`、`--popover-foreground` 从 `oklch(0.25 0.03 60)` 替换为 `oklch(0.25 0.02 250)`
  - [x] 1.3 将 `--card`、`--popover` 从 `oklch(0.99 0.005 80)` 替换为 `oklch(0.99 0 0)`
  - [x] 1.4 将 `--secondary`、`--muted`、`--accent` 从 hue 80 替换为 hue 250（chroma ≤ 0.003）
  - [x] 1.5 将 `--secondary-foreground`、`--muted-foreground`、`--accent-foreground` 从 hue 60 替换为 hue 250
  - [x] 1.6 将 `--border`、`--input` 从 `oklch(0.9 0.01 80)` 替换为 `oklch(0.9 0.003 250)`
  - [x] 1.7 将所有 sidebar 系列令牌（`--sidebar`、`--sidebar-foreground`、`--sidebar-accent`、`--sidebar-accent-foreground`、`--sidebar-border`）同步更新为冷灰值
  - [x] 1.8 将 chart 系列令牌（`--chart-1` 至 `--chart-5`）更新为冷色板配色方案
  - [x] 1.9 将 `--radius` 从 `0.75rem` 调整为 `0.625rem`
  - [x] 1.10 确认 `--primary`、`--primary-foreground`、`--ring`、`--sidebar-primary`、`--sidebar-ring`、`--destructive`、`--destructive-foreground` 保持不变
- [x] 2. 更新 glass-panel 系列变量和工具类
  - [x] 2.1 将 `--glass-bg`、`--glass-bg-hover`、`--glass-bg-active` 更新为 `rgba(248,250,252,…)` 基底
  - [x] 2.2 将 `--glass-border`、`--glass-border-hover` 更新为 `rgba(226,232,240,…)` 冷灰值
  - [x] 2.3 将 `.glass-panel` 的 background 渐变从暖色替换为 `rgba(248,250,252,…)` / `rgba(241,245,249,…)` 冷色渐变
  - [x] 2.4 将 `.glass-panel` 和 `.glass-panel-strong` 的 box-shadow 中的 `rgba(84,59,37,…)` 替换为 `rgba(15,23,42,…)` 冷灰阴影
  - [x] 2.5 确认所有 glass-panel 类的 `backdrop-filter: blur(…)` 模糊强度未改变
- [x] 3. 更新 studio-shell 系列变量和工具类
  - [x] 3.1 将 `--studio-shell-bg` 从暖米色渐变替换为 `rgba(248,250,252,…)` / `rgba(241,245,249,…)` 冷灰白渐变
  - [x] 3.2 将 `--studio-shell-border` 从 `rgba(151,120,90,0.18)` 替换为 `rgba(148,163,184,0.18)`
  - [x] 3.3 将 `--studio-ink` 从 `#4a3727` 替换为 `#1e293b`，`--studio-ink-soft` 从 `#7d6856` 替换为 `#64748b`
  - [x] 3.4 将 `--studio-accent` 从 `#c98257` 替换为 `#3b82f6`，`--studio-accent-strong` 从 `#b86f45` 替换为 `#2563eb`
  - [x] 3.5 确认 `--studio-sage`（`#5e8b72`）和 `--studio-sage-strong`（`#456b58`）保持不变
  - [x] 3.6 将 `.studio-shell`、`.studio-surface`、`.studio-surface-strong`、`.studio-input`、`.studio-badge` 工具类中的暖棕 rgba 阴影色和边框色替换为冷灰色
  - [x] 3.7 将 `.workflow-studio` 覆盖层中的 `#4a3727` 替换为 `#1e293b`，`#7d6856` 替换为 `#64748b`，暖棕 rgba 替换为冷灰 rgba
- [x] 4. 更新 workspace 系列变量和工具类
  - [x] 4.1 将 `--workspace-page-bg` 从暖色径向渐变替换为冷色线性渐变 `linear-gradient(180deg, #f8fafc 0%, #f1f5f9 52%, #e2e8f0 100%)`
  - [x] 4.2 将 `--workspace-shell-bg`、`--workspace-shell-border` 更新为冷灰值
  - [x] 4.3 将所有 `--workspace-panel-*` 变量（bg、strong-bg、inset-bg、border、shadow、shadow-soft）更新为冷灰值
  - [x] 4.4 将 `--workspace-control-*` 变量（bg、bg-hover、border、text）更新为冷灰值
  - [x] 4.5 将 `--workspace-text-strong`、`--workspace-text`、`--workspace-text-muted`、`--workspace-text-subtle` 从暖棕替换为冷灰（slate 色系）
  - [x] 4.6 将 `--workspace-info`、`--workspace-success`、`--workspace-warning`、`--workspace-danger` 及其 `-soft` 变体更新为高对比度语义色
  - [x] 4.7 将 `.workspace-shell`、`.workspace-panel`、`.workspace-control` 等工具类中的暖棕 rgba 阴影色和边框色替换为冷灰色
  - [x] 4.8 将 `.workspace-tone-*`、`.workspace-badge[data-tone=*]`、`.workspace-pill` 中的暖棕 rgba 替换为冷灰 rgba
- [x] 5. 更新 splitter 组件色彩
  - [x] 5.1 将 `.office-cockpit-splitter` 折叠按钮的 `color: #9c6b47` 替换为 `#64748b`
  - [x] 5.2 将 `.office-cockpit-splitter` 折叠按钮的 `box-shadow` 中的暖棕色替换为冷灰色
  - [x] 5.3 将 `.office-cockpit-splitter` 折叠按钮 hover 的 `background` 从 `rgba(255,248,241,…)` 替换为 `rgba(248,250,252,…)`
  - [x] 5.4 确认 `.office-cockpit-splitter` 折叠按钮 hover 的 `color: #5e8b72` 保留绿色
  - [x] 5.5 对 `.launch-clarification-splitter` 执行相同的冷色替换
- [x] 6. 新增暗色模式占位声明
  - [x] 6.1 在 `:root` 块之后新增 `.dark` 选择器，包含所有核心令牌的暗色占位值
- [x] 7. 验证不破坏约束
  - [x] 7.1 确认 `@theme inline` 块中的变量名映射关系未改变
  - [x] 7.2 确认字体栈（`--font-display`、`--font-mono`、`--font-body`）未改变
  - [x] 7.3 确认 `h1`–`h4`、`[data-slot="card-title"]`、`.font-data` 的排版规则未改变
  - [x] 7.4 确认 `@theme inline` 中的 `--radius-sm/md/lg/xl` 计算公式未改变
  - [x] 7.5 确认没有新增或删除任何 CSS 自定义属性名称（`.dark` 占位除外）
  - [x] 7.6 确认没有修改任何 `.tsx` 组件文件
  - [x] 7.7 确认 `components.json` 未被修改
  - [x] 7.8 运行 `pnpm run build` 验证 Tailwind 构建成功
