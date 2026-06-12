# Grok Plans Export (导出说明)

## 已导出的计划文件（位于项目根目录）

- `grok-plan-current-session.md`  
  当前活跃会话的 plan（session: 019eb08c-e370-77c1-b8d2-f40500f304df）  
  这是我们最近一直在更新的那份（server LLM wiring + test wiring + shared builder extraction 等）。

- `grok-plan-previous-session.md`  
  较早的会话 plan（session: 019eab7f-bf8a-7631-acee-61d05a71d0c9）  
  对应你说的“上一个账号”的计划内容（Node-Click Re-entry 等早期阶段）。

## 为什么项目根目录原来没有 .grok 计划包？

Grok 的计划（plan.md）默认只存在于**你本机本地**的隐藏目录里：

```
%USERPROFILE%\.grok\sessions\<项目路径编码>\<session-id>\plan.md
```

例如当前两个：

- C:\Users\wangchunji\.grok\sessions\C%3A%5CUsers%5Cwangchunji%5CDocuments%5Ccube-pets-office\019eb08c-...\plan.md
- ...019eab7f-...\plan.md

这个目录通常不会提交到 git，也不会自动出现在你的工作区根目录。所以你没看到。

## 如何在另一个账号 / 另一台机器上继续使用这些计划？

1. **最简单的方式（推荐只带 plan 内容）**：
   - 把 `grok-plan-*.md` 复制到目标机器。
   - 在目标机器上启动对应项目的 Grok 会话（会自动创建一个新 session 文件夹）。
   - 把导出的 .md 内容完整替换掉目标 session 文件夹里的 `plan.md`。
   - 重启 Grok / 重新进入 plan mode 即可继续。

2. **完整 session 迁移（想带历史记录）**：
   - 复制整个 session 文件夹（例如 `019eb08c-...` 整个目录）。
   - 放到目标机器相同路径的 `.grok/sessions/...` 下。
   - 注意：session id 是唯一的，跨账号可能需要手动对齐项目路径编码。

3. **备份到 repo（推荐）**：
   - 直接 `git add grok-plan-*.md GROK_PLANS_EXPORT_README.md`
   - 提交到这个仓库，以后 clone 下来就能看到历史计划了。

## 额外提示

- 如果以后想导出更多历史计划，可以告诉我 session id，我可以继续帮你批量导出来。
- 计划文件是纯 Markdown，随时可以用普通编辑器查看/编辑。
- Grok 本身目前没有官方“一键导出计划包”的 UI，这些本地文件就是真相来源。

需要我再帮你打包成 zip、或者导出更多旧 session 的计划，随时说！