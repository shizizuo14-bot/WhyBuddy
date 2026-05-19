# 手动验证清单：Autopilot 流式体验补完

> 本文件用于配合任务 8 的桌面手测，覆盖 `clarification → route_generation → spec_tree → spec_docs → effect_preview → packaging → landing` 全链路的可见性，以及 `forceAdvance` 5 分钟超时的失败兜底。所有勾选项请在用户实际跑完一次主流程后再回填。

## 1. Preflight

### 1.1 必填 `.env` 开关

请确认本地 `.env` 中以下开关均已配置（`BUILD_TARGET=test` 会强制把流式开关重置为 `false`，因此请勿在执行手测时启用 test 构建目标）：

- [ ] `BLUEPRINT_AGENT_REASONING_STREAM_ENABLED=true`
- [ ] `BLUEPRINT_SPEC_TREE_LLM_ENABLED=true`
- [ ] `BLUEPRINT_SPEC_DOCS_LLM_ENABLED=true`
- [ ] `AUTOPILOT_REAL_RUNTIME=true`
- [ ] `BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS` 已配置 5 个可用 key（逗号或换行分隔，按当前 `.env.example` 约定）
- [ ] `BLUEPRINT_SPEC_DOCS_LLM_POOL_BASE_URL=https://api.rcouyi.com/v1`
- [ ] `BLUEPRINT_SPEC_DOCS_LLM_POOL_MODEL=ouyi-5-preview-thinking`

> 备注：若 `BLUEPRINT_SPEC_DOCS_LLM_POOL_KEYS` 不足 5 个 key，spec_docs 阶段仍可能完成，但容易在并发推进时出现 429 抖动。请尽量补齐到 5 把。

### 1.2 启动与入口

- [ ] 在仓库根目录执行 `npm run dev:all`，等待前端 / 服务端均就绪
- [ ] 浏览器打开 `http://localhost:3000/autopilot`
- [ ] 打开浏览器 DevTools，并在 Network 面板把 `WS` 过滤项保持开启，便于观察 socket.io 帧
- [ ] 在 DevTools Console 中确认没有 `useBlueprintRealtimeStore` 报错（订阅切换时不应出现红色异常）

## 2. 各阶段验证清单

下表覆盖主线七个阶段的最小验收，请逐行勾选实际看到的现象。

### 2.1 阶段 1 — `clarification`

- [ ] **动作**：在中央输入框粘贴一个 GitHub 仓库 URL（推荐使用 `https://github.com/666ghj/MiroFish`），点击提交
- [ ] **期望（≤2 秒）**：右栏当前 active 节点的子时间线**左轨**至少出现一条 `thinking` 条目，例如 `正在分析仓库目录结构…`，而不是只有 spinner
- [ ] **期望**：active 节点不再是空容器；左轨条目随后续 LLM 反思持续追加

### 2.2 阶段 2 — `route_generation`

- [ ] **动作**：在 clarification 卡片中提交澄清问题答案
- [ ] **期望**：右栏子时间线**右轨**至少出现一条 `acting` 与一条 `observing` 条目（典型工具名包括 `github.get_repository`、`github.list_files` 等）
- [ ] **期望**：左栏 `RouteSet` 数据出现时，右栏子时间线**不被清空**，左右两轨继续追加 acting / observing
- [ ] **期望**：subscription key 仍以 `intakeId` 承接，DevTools Network → WS 帧中可看到 `blueprint:subscribe { jobId: "<intakeId>" }`

### 2.3 阶段 3 — `spec_tree`

- [ ] **动作**：进入编组阶段（fabric stage），等待 SPEC 树节点列表生成
- [ ] **期望**：右栏 active 节点同时展示节点列表与子时间线，并继续接收 thinking / acting / observing 流
- [ ] **关键**：页面**不**自动推进到 `spec_docs`，无论 SPEC 树状态是 `running | reviewing | completed`
- [ ] **动作**：手动点击 `确认 SPEC 树并生成规格文档` 按钮（`timeline-confirm-advance`）

### 2.4 阶段 4 — `spec_docs`（点击按钮之后）

- [ ] **期望**：按钮显示 `推进中…` 并禁用，子时间线持续接收 spec_docs 阶段事件
- [ ] **期望**：subscription key 切换到真实 `jobId`，DevTools Network → WS 帧中可看到 `blueprint:subscribe { jobId: "<jobId>" }`，且切换前左右轨被清空一次后重新填充
- [ ] **期望**：阶段最终出现 `completed` 横幅（跨双轨）

### 2.5 阶段 5 → 7 — `effect_preview` / `packaging` / `landing`

- [ ] **期望**：每个阶段进入时，子时间线持续滚动，没有断流
- [ ] **期望**：阶段切换由系统自动推进（无需用户再次点击按钮），与 spec_tree 的“手动确认”契约形成对照
- [ ] **期望**：`landing` 阶段进入 `completed` 后，整体 UI 显示最终交付物链接 / SPEC 文档落点

## 3. 失败路径验证

### 3.1 `forceAdvance` 5 分钟超时

- [ ] **动作**：在 SPEC 树阶段点击 `确认 SPEC 树并生成规格文档`，按钮进入 `推进中…`
- [ ] **构造失败**：人为让后端 spec_docs 调用持续 hang（例如断开 LLM Pool 网络出口、或在 5 个 key 全部失效的情况下观察）
- [ ] **期望（≈5 分钟）**：按钮**自动解锁**，UI 显示 `请求超时` 错误文案
- [ ] **期望**：页面**不**保持在 `推进中…` 状态冻结；用户可再次点击按钮触发重试
- [ ] **期望**：即使后端在超时之后才返回成功，前端也**不**会回调 `onAdvanced`（即不会被前端误判为成功后又重复推进）

> 备注：5 分钟超时是前端安全网；后端可能在超时之后才真正完成 spec_docs，但 UI 不会自动重试。

## 4. 证据收集

请把下列素材一并附在 PR 描述或合并 commit 信息中，便于复核：

- [ ] **截图**：每个阶段（clarification / route_generation / spec_tree / spec_docs / effect_preview / landing）的右栏 active 节点子时间线状态各 1 张
- [ ] **截图**：阶段 3 中 `确认 SPEC 树并生成规格文档` 按钮处于可点击 / 推进中 / 解锁失败 三态各 1 张
- [ ] **Console 日志**：导出（或粘贴）订阅切换前后 `useBlueprintRealtimeStore` 相关日志，重点记录 `subscribe(<intakeId>)` → `unsubscribe()` → `subscribe(<jobId>)` 的次序
- [ ] **Network 面板**：保留 WS 帧序列截图或 HAR 导出，至少覆盖 `blueprint:subscribe`、`blueprint:event`、`blueprint:batch` 三类
- [ ] **附加位置**：把上述素材链接 / 摘要写回到任务 8 的 PR 描述或合并 commit 的 trailer 区域

## 5. 已知前置约束与边界

- **stream key 切换**：clarification 与 route_generation 阶段的事件以 `intakeId` 作为 stream key，spec_docs 阶段切换为 `jobId`。前端通过两段式订阅（`intakeId` 早订阅 → `jobId` 晚切换）透明承接这一切换。
- **回归红线**：如果在 clarification 阶段没看到任何 `thinking` 条目，通常意味着 `AutopilotRoutePage` 中的 `setIntake({id})` 没有在 `POST /api/blueprint/intake/:intakeId/clarifications` 之前发生，这是任务 1 已经修复过的回归点；若复现，请优先怀疑该订阅时机契约被破坏。
- **5 分钟超时是前端兜底**：后端 spec_docs 调用可能在前端超时触发后才真正完成；UI 不会自动重试，需要用户重新触发。
- **流式开关**：`BLUEPRINT_AGENT_REASONING_STREAM_ENABLED` 在 `BUILD_TARGET=test` 下会被强制视为 `false`；手测时请确认当前命令不是以 test 构建目标启动。
- **不要触达**：本规格明令禁止修改 `server/routes/blueprint/agent-reasoning-bridge.ts`、`server/routes/blueprint/callback-receiver.ts`、`server/runtime/lite-agent-runtime.ts` 与 `server/runtime/llm-call.ts`；若手测中发现需要改这些文件才能复现，应单开 spec 而不是直接改这条主线。
