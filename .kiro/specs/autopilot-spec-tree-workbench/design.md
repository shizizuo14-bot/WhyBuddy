# Spec Tree 工作台 — 设计文档

## 概念图

```
┌──────────────────────── fabric 阶段右栏 ────────────────────────┐
│                                                                 │
│  ●  agent_crew_fabric    [completed]                            │
│  │                                                              │
│  ●  spec_tree            [active]   ← 树中心工作台               │
│  │   ┌─────────────────────────────────────────────────────┐    │
│  │   │ 顶部双 CTA：                                         │    │
│  │   │  [深色] 生成整棵树文档    [描边] 生成当前节点文档    │    │
│  │   └─────────────────────────────────────────────────────┘    │
│  │   ┌─────────────────────────────────────────────────────┐    │
│  │   │ #1 root.title  · domain        ▶  3/3 accepted · llm│    │
│  │   │ #2 child-1     · scenario      ▶  2/3 reviewing · llm│    │
│  │   │ #3 child-2     · interface     ▼  生成中             │    │
│  │   │   └ requirements [reviewing · llm] 摘要…              │    │
│  │   │   └ design       [draft · llm]    摘要…              │    │
│  │   │   └ tasks        [尚未生成]                           │    │
│  │   │ #4 leaf-3      · contract      ▶  未生成              │    │
│  │   └─────────────────────────────────────────────────────┘    │
│  │                                                              │
│  ●  effect_preview       [future]                               │
│  ○  prompt_package       [future]                               │
│  ○  runtime_capability   [future]                               │
│  ○  engineering_handoff  [future]                               │
│  ○  artifact_memory      [future]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 关键模块

```
                    ┌─────────────────────────────┐
                    │  AutopilotRoutePage         │
                    │  (job / specTree / docs 来源) │
                    └────────────┬────────────────┘
                                 │ props
                                 ▼
                    ┌─────────────────────────────┐
                    │  AutopilotRightRail         │
                    │  - RAIL_SUB_STAGE_ORDER (7) │
                    │  - 渲染每个 sub-stage 卡片   │
                    └────────────┬────────────────┘
                                 │
                                 ▼ (currentSubStage === "spec_tree")
                    ┌─────────────────────────────────────┐
                    │  SpecTreeWorkbench                  │
                    │  - 顶部双 CTA                        │
                    │  - 节点行列表 (with chip)           │
                    │  - 节点行展开式预览                  │
                    │  - 监听 agentReasoning observing    │
                    │  - in-flight 锁                     │
                    └────────────┬────────────────────────┘
                                 │ uses
                ┌────────────────┴───────────────────────┐
                │                                         │
        ┌───────▼────────┐                ┌──────────────▼─────┐
        │ SpecTreeChip   │                │ SpecDocPreviewBlock │
        │ - 聚合状态      │                │ - 单份文档预览       │
        │ - source 标记   │                │ - status / source   │
        └────────────────┘                └────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────────┐
                    │ derive-spec-tree-chip.ts    │
                    │ - 纯函数，pbt 友好            │
                    │ - 输入 docs[] + observing[] │
                    │ - 输出 ChipDescriptor       │
                    └─────────────────────────────┘
```

## 数据流

### 稳定态（无进行中事件）

```
job.artifacts → readAutopilotSpecDocuments(job)
              → BlueprintSpecDocument[]
              → groupBy(nodeId)
              → deriveSpecTreeChip(docsByNodeId, nodeId, /* observing-buffer */ [])
              → ChipDescriptor { label, tone, sourceTag }
```

### 实时态（observing 事件正在流入）

```
useBlueprintRealtimeStore.agentReasoning.entries
  ↓ filter stageId === "spec_docs" && phase === "observing"
  ↓ parse summary → { nodeTitle, success }
  ↓ map → recentNodeProgressByTitle (Map<title, "generating" | "fallback">)
deriveSpecTreeChip(
  docsByNodeId,
  nodeId,
  recentNodeProgressByTitle.get(node.title)
)
```

实时态优先级低于稳定态：当 docs 中已存在该节点对应文档时，以 docs 为准；
当 docs 还没回来时，临时挂上 "生成中" / "fallback" 的浮动状态，让用户
感知 LLM 在工作。

## 子阶段顺序变更

### 原 8 个（types.ts）

```ts
export const RAIL_SUB_STAGE_ORDER = [
  "agent_crew_fabric",
  "spec_tree",
  "spec_documents",   // ← 删除
  "effect_preview",
  "prompt_package",
  "runtime_capability",
  "engineering_handoff",
  "artifact_memory",
] as const;
```

### 新 7 个

```ts
export const RAIL_SUB_STAGE_ORDER = [
  "agent_crew_fabric",
  "spec_tree",
  "effect_preview",
  "prompt_package",
  "runtime_capability",
  "engineering_handoff",
  "artifact_memory",
] as const;
```

`AutopilotRailSubStage` 类型联合中也移除 `"spec_documents"`。
`SpecDocumentsPanel` 文件保留，但 `index.ts` 不再导出，且 right rail 的
`renderSubStagePanel` switch 中的 `"spec_documents"` 分支删除。

## SpecTreeWorkbench 组件契约

```ts
export interface SpecTreeWorkbenchProps {
  jobId: string;
  job: BlueprintGenerationJob | null;
  specTree: BlueprintSpecTree | null;
  specDocuments: BlueprintSpecDocument[];   // 新增字段，从 readAutopilot* 派生
  locale: AppLocale;
  onSpecDocumentsGenerated?: (
    nextDocuments: BlueprintSpecDocument[]
  ) => void;
}

export const SpecTreeWorkbench: FC<SpecTreeWorkbenchProps>;
```

内部状态：

```ts
type WorkbenchState = {
  selectedNodeId: string | null;
  expandedNodeIds: Set<string>;          // 行展开集合
  generating: "none" | "all" | "single"; // CTA in-flight 锁
};
```

行为：

- 点击节点行 → toggle `expandedNodeIds` & 设置 `selectedNodeId`
- 点击 "生成整棵树文档" → 调 `generateBlueprintSpecDocuments(jobId)`
  （不带 nodeId），`generating = "all"`
- 点击 "生成当前节点文档" → 调 `generateBlueprintSpecDocuments(jobId, { nodeId })`，
  `generating = "single"`
- 完成后调 `onSpecDocumentsGenerated(response.documents)` 让父级更新 job

## 状态聚合规则（SpecTreeChip）

实现位置：`client/src/pages/autopilot/right-rail/derive-spec-tree-chip.ts`（纯函数）。

```ts
export type ChipTone =
  | "neutral"   // 未生成
  | "info"      // 生成中
  | "warning"   // 含 fallback / template
  | "success"   // 全部 accepted
  | "danger";   // 含 rejected

export interface SpecTreeChipDescriptor {
  label: string;          // "未生成" / "2/3 reviewing" / "3/3 accepted"
  tone: ChipTone;
  sourceTag?: "llm" | "fallback" | "template";
  detail: {
    requirements?: { status: BlueprintSpecDocumentStatus; source?: GenerationSource };
    design?: { status: BlueprintSpecDocumentStatus; source?: GenerationSource };
    tasks?: { status: BlueprintSpecDocumentStatus; source?: GenerationSource };
  };
  ephemeralProgress?: "generating" | "fallback";
}

export function deriveSpecTreeChip(
  docs: BlueprintSpecDocument[],   // 该节点 0-3 份
  ephemeral?: "generating" | "fallback",
): SpecTreeChipDescriptor;
```

聚合优先级（从高到低）：
1. ephemeral === "generating" 且 docs 不全 → label "生成中" / tone "info"
2. 任一份 status === "rejected" → label "X/3 rejected" / tone "danger"
3. 三份齐全且全部 "accepted" → label "3/3 accepted" / tone "success"
4. 至少一份 "draft" / "reviewing" → label "X/3 reviewing" / tone "info"
5. 全无文档 → label "未生成" / tone "neutral"

source tag 取所有现存文档 generationSource 的"最严重级"：
`template` > `llm_fallback` > `llm`，对应展示 `template` / `fallback` / `llm`。

## 实时事件解析

实现位置：`client/src/pages/autopilot/right-rail/parse-spec-docs-observing.ts`。

```ts
export interface SpecDocsObservingSnapshot {
  byNodeTitle: Map<string, "generating" | "fallback">;
}

export function parseSpecDocsObservingEntries(
  entries: AgentReasoningEntry[],   // 来自 store.agentReasoning.entries
): SpecDocsObservingSnapshot;
```

解析规则（仅处理 `entry.stageId === "spec_docs"` 且 `entry.phase === "observing"`
的条目）：

```
✓ <title> — 规格文档已生成   →  byNodeTitle.set(<title>, "generating")
⚠ <title> — 降级为模板        →  byNodeTitle.set(<title>, "fallback")
```

不处理其他 phase（thinking / acting / completed），不读 jobId
（store 已经按 jobId scope）。

合并到稳定态时：当 stable docs 中该节点已经有 3 份文档（含 fallback 标记），
则忽略 byNodeTitle 中的 ephemeral 信号——稳定数据优先。

## useAutoAdvance 调整

```ts
// before
case "spec_tree":
  if (specTreeReady) advanceTo("spec_documents");
  break;
case "spec_documents":
  if (specDocsReady) advanceTo("effect_preview");
  break;

// after
case "spec_tree":
  if (specDocsReady) advanceTo("effect_preview");
  break;
// "spec_documents" 分支整体删除
```

`specDocsReady` 判定：specTree.nodes.length > 0 && 每个节点都有至少 1 份
非 `draft` 文档（即所有节点都至少进入了 reviewing 或更进阶状态）。

## 测试策略

按本仓约束（不引入 @testing-library/react），分四档：

### 档 1：纯函数 PBT/单测

- `derive-spec-tree-chip.test.ts`（新文件）
  - 11 个用例覆盖 5 档 tone 优先级、source 严重级、ephemeral 信号
- `parse-spec-docs-observing.test.ts`（新文件）
  - 6 个用例覆盖 ✓/⚠/title 含特殊字符/非 spec_docs stage/非 observing phase

### 档 2：常量与类型契约

- `RAIL_SUB_STAGE_ORDER` 长度从 8 → 7，更新所有引用 PBT：
  - `right-rail/__tests__/sub-stage-summary.test.ts`
  - `right-rail/__tests__/resolve-rail-sub-stage.property.test.ts`
  - `right-rail/__tests__/fabric-dispatch.property.test.tsx`
  - `right-rail/hooks/__tests__/use-autopilot-right-rail-data.{test,property.test}.ts`
  - `right-rail/hooks/__tests__/use-right-rail-sub-stage-state.{test,property.test}.ts`
  - `right-rail/panels/__tests__/props-narrowing.property.test.ts`
- 删除断言 spec_documents 存在的用例，新增断言 spec_documents 不在
  ORDER 中的用例。

### 档 3：SSR 渲染契约

- `SpecTreeWorkbench.test.tsx`（新文件）
  - 用 `renderToStaticMarkup` 验证：
    - 顶部 2 个 CTA 按钮 testid 存在
    - 节点行 chip text 与 deriveSpecTreeChip 输出一致
    - 行展开后 3 个 SpecDocPreviewBlock 出现
- 既有 `autopilot-right-rail-cards.test.tsx` 更新断言：
  - 不再期待 `data-sub-stage-placeholder="spec_documents"`
  - 期待 spec_tree 卡片内含 SpecTreeWorkbench 标记

### 档 4：useAutoAdvance 行为

- 更新 `use-auto-advance.spec-tree.test.ts`：spec_tree → effect_preview
  直跳，不再经过 spec_documents

## 落地分波

```
Wave 0 (准备)：
  - 新增 deriveSpecTreeChip + parse-spec-docs-observing 纯函数 + 测试
  - 新增 SpecTreeWorkbench 组件 + SpecTreeChip + SpecDocPreviewBlock
  - 不挂载到右栏（feature flag 关）

Wave 1 (切换)：
  - 修改 RAIL_SUB_STAGE_ORDER（8 → 7）
  - 更新所有引用 PBT
  - 在 spec_tree 卡片内挂载 SpecTreeWorkbench
  - 更新 useAutoAdvance 跳过 spec_documents

Wave 2 (打磨)：
  - HUD 文案对齐（spec_docs stage 仍指向 spec_tree 卡片）
  - 实时事件回填验证（手动测试覆盖）
```

## 不变项

- 后端 stage / API / shared 契约：完全不动
- SpecDocumentsPanel 源文件：保留，仅不再作为平级渲染
- 既有 5140+ 测试：通过更新引用保持运行
- TS 基线：116 不上升

## 风险

- `RAIL_SUB_STAGE_ORDER` 替换时如果遗漏一处 PBT 引用，会出现 spec
  shape mismatch 报错；mitigation：grep 全量 + 跑全套测试。
- 前端实时态判定 ephemeral === "generating" 与 stable docs 之间的覆盖
  顺序可能让 UI 短暂闪烁；mitigation：deriveSpecTreeChip 优先看 docs，
  ephemeral 仅在该节点暂无 docs 时生效。
- HUD 文案对齐项可能与 wave 2 其它 HUD 改造冲突；mitigation：本 spec
  只在 hud 摘要里追加文案，不改 hud 高亮逻辑。
