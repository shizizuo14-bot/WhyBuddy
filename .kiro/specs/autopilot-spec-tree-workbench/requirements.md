# Spec Tree 工作台 — 需求文档

## 背景

当前 `/autopilot` 蓝图驾驶舱右栏 fabric 阶段共有 8 个平铺子节点：

```
agent_crew_fabric → spec_tree → spec_documents → effect_preview
  → prompt_package → runtime_capability → engineering_handoff → artifact_memory
```

其中 `spec_tree` 与 `spec_documents` 在用户心智上高度耦合（"先看 SPEC 树，
再为每个节点生成三份规格文档"），但当前 UI 把它们拆成两个平级的 timeline
节点，造成几个问题：

1. **冗余的导航位**：进入 spec_documents 阶段后用户会看到一个"等用户点"的
   面板，但前面的 spec_tree 阶段刚刚展示过同一棵树的节点列表，看起来像
   "重复一遍"。
2. **文档生成入口分散**：现在每个节点的 3 份文档（requirements / design /
   tasks）由 `SpecDocumentsPanel` 内的按钮逐个或整体触发，而 SPEC 树视图
   不直接展示文档状态，用户必须在两个阶段卡片之间来回切换才能确认进度。
3. **状态回填不可见**：后端在 `spec-docs-llm-generation.ts` 中已经为每个
   节点完成时发出 `role.agent.observing` 事件，但 SPEC 树视图没有消费这
   些事件，状态变更只能等 spec_documents 阶段卡片刷新后才看到。
4. **批量生成意图被掩盖**：当前 SpecDocumentsPanel 顶部的"一键生成"按钮
   藏在 spec_documents 阶段，用户经常误以为需要自己一个个节点点；这与
   "AI 自动驾驶"主线背道而驰。

本 spec 的目标是把 spec_tree + spec_documents 两个 fabric 子阶段在前端
**合并为以树为中心的单一工作台**，让 SPEC 树成为 fabric 阶段的"主舞台"，
文档状态作为节点元数据展示在树节点行上，批量生成由顶部 CTA 一次发起。

## 主线约束（必须遵守）

- **后端 stage 模型不动**。`BlueprintGenerationStage` 仍然包含独立的
  `spec_docs` 阶段；后端 `agentCrewStageActivationDriver` 仍然在 SPEC
  文档生成完成时触发 `spec_docs → effect_preview` 阶段转换；本 spec 只
  在前端把这两个 backend stage 投影到同一张 UI 卡片上。
- **后端 API、shared 契约不动**。`POST /api/blueprint/jobs/:jobId/spec-documents`、
  `BlueprintGenerateSpecDocumentsRequest`、`BlueprintSpecDocument` 字段、
  5-key spec_docs LLM pool 全部保持现状。
- **既有 5140+ 测试不能破坏**。`RAIL_SUB_STAGE_ORDER` 是冻结常量，被大量
  PBT 与 hook 测试引用；本 spec 必须更新这些测试保持其他断言一致，但不
  得删除已存在的测试用例。
- **TS 基线不能扩张**。当前 `node --run check` 基线是 116 个错误（按
  `task-autopilot-phase-1-closure-2026-04-26.md` 口径），本 spec 不得
  让该数字上升。
- **不引入 `@testing-library/react` / jsdom / happy-dom**。所有新增前端
  测试必须沿用本仓的 `react-dom/server` SSR + `vi.mock` 策略。

## 用户故事

### Story 1：树中心工作台代替双子阶段

**作为** 一个使用 `/autopilot` 的用户，
**我希望** 在 fabric 阶段右栏只看到一张 "SPEC 树工作台" 卡片，而不是
"SPEC 树" 与 "SPEC 文档" 两张需要切换的卡片，
**因为** 两个卡片承载的是同一棵树的不同视图，分开显示让我感觉自己在
做重复的工作。

### Story 2：每个树节点的文档状态一目了然

**作为** 一个使用 `/autopilot` 的用户，
**我希望** 在树节点行右侧直接看到该节点 3 份文档的状态（如 "2/3 已接受
· llm" 或 "生成中"），
**因为** 我不想为了知道某个节点是否已经生成完文档而去切阶段卡片。

### Story 3：节点行展开查看完整文档

**作为** 一个使用 `/autopilot` 的用户，
**我希望** 点击树节点行能直接在原位展开看到该节点 3 份文档的预览（标题、
摘要、状态、生成来源），
**因为** 大部分场景下我只需要扫一眼内容就够了，不需要跳到独立 review 页。

### Story 4：状态实时更新

**作为** 一个使用 `/autopilot` 的用户，
**我希望** 系统正在生成某个节点的文档时，对应行的 chip 实时显示 "生成中"，
**因为** 我能看到 LLM 当前在哪个节点上工作，不用怀疑系统是不是卡住了。

### Story 5：整树批量生成的快捷入口

**作为** 一个使用 `/autopilot` 的用户，
**我希望** 工作台顶部有一个明显的 "生成整棵树文档" CTA，让我点一下就能
为所有节点批量生成 requirements / design / tasks，
**因为** 默认我希望 AI 自动驾驶帮我把所有节点都做完，不希望逐个点击。

### Story 6：单节点重新生成的逃生口

**作为** 一个使用 `/autopilot` 的用户，
**我希望** 选中某个树节点后，工作台顶部还会出现 "生成当前节点文档" CTA，
**因为** 偶尔某个节点的文档不满意，我希望只重新生成这一个节点而不是
整树重做。

## 验收准则（EARS 格式）

### AC1：fabric 子阶段顺序更新

THE 系统 SHALL 在 `RAIL_SUB_STAGE_ORDER` 常量中移除 `spec_documents` 项，
最终顺序为：
```
agent_crew_fabric, spec_tree, effect_preview, prompt_package,
runtime_capability, engineering_handoff, artifact_memory
```

WHEN 已完成的子阶段从 8 个减为 7 个，THE 任何依赖 `RAIL_SUB_STAGE_ORDER`
的 PBT 测试 SHALL 同步更新，且不破坏其它断言。

### AC2：进入 spec_tree 卡片自动展示树 + 文档状态

WHEN 用户进入 fabric 阶段且 active 子阶段为 `spec_tree`，
IF `specTree.nodes.length > 0`，
THEN THE 工作台 SHALL 列出每个节点的 `title` / `type` / `summary`，并在
每行右侧显示一个聚合状态 chip。

聚合 chip 的规则如下：
- `requirements / design / tasks` 三份文档均不存在时显示 "未生成"
- 至少一份处于 `draft` / `reviewing` 时显示 "X/3 生成中"（X 为已存在的份数）
- 三份均存在且至少一份处于 `draft|reviewing` 时显示 "X/3 reviewing"
- 三份均存在且全部 `accepted` 时显示 "3/3 accepted"
- 任一份处于 `rejected` 时显示 "X/3 rejected" 并以警示色标记
- 末尾追加 `· llm` / `· fallback` / `· template` 标记，取所有已存在文档
  `provenance.generationSource` 的多数派；混合时取最高严重级（`template` >
  `llm_fallback` > `llm`）

### AC3：节点行展开后显示三份文档预览

WHEN 用户点击 spec_tree 卡片中的某个节点行，
THEN THE 工作台 SHALL 在该行下方原位展开（accordion 风格），并显示该节点
对应的 `requirements` / `design` / `tasks` 三份文档预览块。

每份预览块 SHALL 包含：
- 文档类型徽章（`requirements` / `design` / `tasks`）
- 当前 `status`（`draft` / `reviewing` / `accepted` / `rejected`）
- `generationSource`（`llm` / `llm_fallback` / `template`）
- 文档 `summary`（最多两行省略）
- 一个跳转到完整 review 视图的链接（如已有 review 路由）

WHEN 文档不存在（节点尚未生成）时，THE 预览块 SHALL 显示 "尚未生成"
占位，不显示标题或摘要。

WHEN 用户点击同一节点行第二次，THE 工作台 SHALL 收起该节点的展开预览。

### AC4：实时状态回填

THE 系统 SHALL 订阅 `useBlueprintRealtimeStore` 中 stageId 为
`spec_docs` 的 `role.agent.observing` 事件，并据此更新树节点 chip：
- WHEN observation summary 含 "✓ ${title} — 规格文档已生成"，THE 对应
  `nodeId` 的 chip SHALL 临时显示 "生成中"，直至 `BlueprintSpecDocument`
  数据落入 specTree 派生计算后回归到 AC2 的稳定 chip。
- WHEN observation summary 含 "⚠ ${title} — 降级为模板"，THE 对应
  `nodeId` 的 chip SHALL 在 source 标记位上显示 "fallback"。

事件解析必须容忍 title 含特殊字符；解析失败时静默回退到由 specDocuments
派生的稳定 chip，不报错。

### AC5：顶部双 CTA

WHILE 用户处于 spec_tree 工作台且 specTree 已就绪，THE 工作台顶部
SHALL 显示两个按钮：
- 主按钮 "生成整棵树文档"（深色，主操作）：点击调用
  `POST /api/blueprint/jobs/:jobId/spec-documents`（不带 nodeId / types）
- 次按钮 "生成当前节点文档"（描边，次操作）：仅当用户已选中某个节点行
  时启用；点击调用同接口，但 body 带 `{ nodeId: <选中节点 id> }`

任意一个 CTA 进入 in-flight 时 THE 系统 SHALL 同时禁用两个按钮，并以
spinner 标识；接口返回后恢复可用。

### AC6：批量生成不阻塞 UI

WHEN 整树批量生成请求 in-flight 时，
THE 工作台 SHALL 持续接收来自 `useBlueprintRealtimeStore.agentReasoning.entries`
的事件并实时更新 chip（每个节点一个 observing 事件）。

请求体在前端立即 settle 后，THE 工作台 SHALL 用最新的 `BlueprintSpecDocument[]`
重算 chip，覆盖在过程中临时显示的 "生成中" 状态。

### AC7：useAutoAdvance 跳过 spec_documents

WHEN 当前子阶段为 `spec_tree` 且 `specDocuments` 数据已就绪
（即所有节点的 3 份文档存在且至少一份非 `draft`），
THE `useAutoAdvance` SHALL 直接推进到 `effect_preview`，不再经过
`spec_documents` 中间态。

### AC8：保留 SpecDocumentsPanel 文件不删除

THE 系统 SHALL 保留 `client/src/pages/autopilot/right-rail/panels/SpecDocumentsPanel.tsx`
文件本身（避免破坏 SSR 测试与潜在的其它入口），但不再在 fabric timeline 中
作为平级 sub-stage 渲染。

### AC9：不破坏 5140+ 既有测试

THE 系统 SHALL 在落地后通过完整 client 与 server 测试套件
（不少于 326 个 client 测试、>= 既有 server 测试数量）。

### AC10：HUD 文案对齐

WHEN 当前后端 stage 是 `spec_docs`（即批量生成已开始），
THE `<AutopilotMissionHud>` 与 timeline 高亮 SHALL 仍然指向 spec_tree
卡片（而不是单独高亮 spec_documents），并在 HUD 摘要中追加
"正在为整棵 SPEC 树生成文档" 类文案。

## 不在范围内（非目标）

- 不修改后端 `BlueprintGenerationStage` 枚举
- 不修改后端 LLM 派生 prompt / model / 5-key pool
- 不修改 SPEC 文档 review 路由 / 完整 review 页面
- 不修改 SpecDocumentsPanel 组件源码本身（只是不再作为平级渲染）
- 不引入新的图表、动画、3D 资源
- 不变更 mission-first 任务壳路由或 wall-mounted SandboxMonitor 行为

## 风险与边界

- **冻结常量变更影响面**：`RAIL_SUB_STAGE_ORDER` 在 ~10 处测试中被引用。
  必须用 grep 全量替换并跑全套测试验证，每改一个地方都必须看一下断言
  语义是否还成立。
- **状态聚合 chip 的"多数派"取舍**：当 3 份文档来源不一致时，规则可能
  让用户困惑。AC2 里写明了"取最严重级"，落地时如果发现实际数据混合
  情况太多，需要回到 spec 调整规则。
- **批量生成的取消语义**：本 spec 不引入"取消批量生成"按钮（保持简单）；
  如果未来需要，后端要先支持。
