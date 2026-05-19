# 需求：autopilot 子阶段摘要派生器（Wave 1 / Spec 3）

## 背景

Wave 2 的 `autopilot-right-rail-streaming-layout` 需要为每个子阶段（8 个）派生：

1. 标题（已有 `SUB_STAGE_LABELS`，本 spec 对齐后扩展）
2. API path（如 `POST /api/blueprint/agent-crew`）
3. 一段中英双语 summary 说明
4. 3 个大号数字指标（label + value + 可选 hint）
5. 当前是否「数据就绪」（决定 `active` 状态是否可以渲染完整面板）

如果把这些派生逻辑写在 `AutopilotRightRail.tsx` 主文件里，会把 rail 主文件拉长到 800+ 行。本 spec 先把派生逻辑抽出去，成为一个**纯函数库**，让 rail 主文件只消费返回结果。

## 核心目标

在 `client/src/pages/autopilot/right-rail/` 下新增 `sub-stage-summary.ts` 文件，提供单一入口函数 `deriveSubStageSummary(subStage, props, locale)` 返回结构化摘要，供 Wave 2 rail 主文件直接消费。

## 需求

### 需求 1：新增 `deriveSubStageSummary()` 函数

- 文件位置：`client/src/pages/autopilot/right-rail/sub-stage-summary.ts`
- 函数签名：
  ```ts
  export interface SubStageSummary {
    title: string;
    apiPath: string;
    summary: string;
    metrics: Array<{ label: string; value: string | number; hint?: string }>;
    dataReady: boolean;
  }

  export function deriveSubStageSummary(
    subStage: AutopilotRailSubStage,
    props: AutopilotRightRailProps,
    locale: AppLocale
  ): SubStageSummary;
  ```
- 为 8 个子阶段（`agent_crew_fabric` / `spec_tree` / `spec_documents` / `effect_preview` / `prompt_package` / `runtime_capability` / `engineering_handoff` / `artifact_memory`）各自返回结构化摘要
- 纯函数：无 side effect、不读 `window` / `document` / store

### 需求 2：8 个子阶段摘要内容规范

| 子阶段 | title (zh/en) | apiPath | summary (zh) | 3 个指标来源 |
| --- | --- | --- | --- | --- |
| `agent_crew_fabric` | 协作角色 / Agent Crew | `POST /api/blueprint/agent-crew` | 路线生成协作角色并与运行时能力、日志、浏览器预览资产和证据对齐。 | 角色数 / 事件数 / 活跃数 |
| `spec_tree` | SPEC 树 / Spec Tree | `POST /api/blueprint/spec-tree` | 把选中的路线推导为可编辑的 SPEC 树，冻结 requirements / design / tasks 语义。 | 节点数 / 叶子数 / 版本数 |
| `spec_documents` | SPEC 文档 / Spec Documents | `POST /api/blueprint/spec-documents` | 从 SPEC 树生成规格文档：requirements / design / tasks 三件套可编辑预览。 | 文档数 / 已提交 / 待更新 |
| `effect_preview` | 效果预演 / Effect Preview | `POST /api/blueprint/effect-previews` | 对生成出的方案进行预演，绑定 3D 场景 / HUD / 浏览器运行时。 | 预演数 / 最新版本 / 当前阶段 |
| `prompt_package` | 提示词包 / Prompt Package | `POST /api/blueprint/prompt-packages` | 把效果预演转成可分发的提示词包，支持 Cursor / Kiro / Trae / Codex / Claude。 | 提示词包数 / 平台数 / 当前版本 |
| `runtime_capability` | 运行时能力 / Runtime Capability | `POST /api/blueprint/runtime-capability` | 运行时能力桥：把路线生成的调用映射成实际执行的工具链路，收集证据。 | 能力数 / 调用数 / 证据数 |
| `engineering_handoff` | 工程交接 / Engineering Handoff | `POST /api/blueprint/engineering-handoff` | 把提示词包落到工程执行上，记录落地计划 / 执行步骤 / 验证命令。 | 落地计划数 / 执行步骤数 / 已选平台 |
| `artifact_memory` | 资产记忆 / Artifact Memory | `POST /api/blueprint/artifact-memory` | 沉淀整条 Autopilot 链路的资产、回放、反馈，供后续项目复用。 | 资产数 / 回放数 / 反馈数 |

所有 title / summary 都应提供 `zh-CN` / `en-US` 两个 locale 的版本。

### 需求 3：指标派生逻辑

从 `AutopilotRightRailProps` 的字段计算出每个子阶段的 3 个指标，允许值为 0 或字符串 `-`（未就绪）。

具体派生规则：

- `agent_crew_fabric`：
  - 角色数 = `agentCrew?.roleTimelines.length ?? agentCrew?.presence.length ?? "-"`
  - 事件数 = 所有 role.entries 数量之和
  - 活跃数 = `state === "active"` 的角色数
- `spec_tree`：
  - 节点数 = `specTree?.nodes.length ?? "-"`
  - 叶子数 = `specTree?.nodes.filter(n => no children).length ?? "-"`
  - 版本数 = `"-"`（本 spec 不拿 versions 数据，默认 `-`）
- `spec_documents`：
  - 文档数 = `specTree?.documents.length ?? "-"`
  - 其他两项默认 `-`
- `effect_preview`：
  - 预演数 = `effectPreviews.length`
  - 最新版本 = `effectPreviews[0]?.version ?? "-"`
  - 当前阶段 = `job?.stage ?? "-"`
- `prompt_package`：
  - 所有三项默认 `-`（数据来源在 Spec 5 的 panel wrapping 中仍由独立 hook 加载，本摘要仅显示占位）
- `runtime_capability`：
  - 能力数 = `capabilities.length`
  - 调用数 = `capabilityInvocations.length`
  - 证据数 = `capabilityEvidence.length`
- `engineering_handoff`：
  - 所有三项默认 `-`
- `artifact_memory`：
  - 所有三项默认 `-`

### 需求 4：`dataReady` 判定逻辑

决定子阶段卡片是否渲染「active ● 执行中」（`true`）还是「pending ○ 等待」（`false`）：

- `agent_crew_fabric`: `agentCrew != null && roleTimelines.length > 0`
- `spec_tree`: `specTree != null`
- `spec_documents`: `specTree != null && specTree.documents.length > 0`
- `effect_preview`: `effectPreviews.length > 0`
- `prompt_package`: `specTree != null`
- `runtime_capability`: `capabilities.length > 0 || capabilityInvocations.length > 0 || capabilityEvidence.length > 0`
- `engineering_handoff`: `selection != null`
- `artifact_memory`: `selection != null`

### 需求 5：指标 label / hint 的 i18n

每个指标的 `label` / `hint` 必须是当前 locale 的字面量字符串（不是 i18n key）。示例：

- `{ label: "角色数", value: 5, hint: "活跃 2 / 观察 1" }` (zh-CN)
- `{ label: "ROLES", value: 5, hint: "2 active / 1 watching" }` (en-US)

### 需求 6：单元测试覆盖

- 文件：`client/src/pages/autopilot/right-rail/__tests__/sub-stage-summary.test.ts`
- 至少 16 个 test case：
  - 8 个 case 覆盖每个子阶段在「数据完全就绪」场景下的返回结构（title / apiPath / summary / metrics 长度 = 3 / dataReady = true）
  - 8 个 case 覆盖每个子阶段在「数据完全未就绪」（props 大部分为 null/空数组）场景下的返回结构（metrics 值可以是 `-` / dataReady = false）

### 需求 7：纯函数边界

- 不 import `@/lib/store` / `useAppStore`
- 不 import React（函数是纯数据派生）
- 不依赖 `window` / `document` / `Date.now()` / `Math.random()`
- 同一入参多次调用返回 deep-equal 结果（幂等）

## 非目标

- 本 spec 不渲染任何 UI
- 本 spec 不改 `AutopilotRightRail.tsx` 主文件
- 本 spec 不提供 hook（纯 function，不是 `useSubStageSummary`）
- 本 spec 不负责 `prompt_package` / `engineering_handoff` / `artifact_memory` 的真实指标提取（它们在 panel 内部各自用 `useEffect + fetch` 加载，摘要层不拷贝这段逻辑）

## 完成判定

- `npm run check` 的 TS error 数保持 107 不增长
- `npx vitest run client/src/pages/autopilot/right-rail/__tests__/sub-stage-summary.test.ts` 至少 16 个 case 全过
- 文件 ≤ 400 行（含注释）
