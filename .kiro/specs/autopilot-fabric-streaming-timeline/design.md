# 编组(Fabric)右栏重构方案:流式时间线

## 当前问题

1. **静态卡片模式** — 8 个 sub-stage 面板按 `resolveRailSubStage` 切换,用户看到的是"当前活跃面板 + 已完成面板折叠"
2. **没有流式感** — 数据到了就全量渲染,没有逐步 append 的体验
3. **没有时间线叙事** — 用户不知道"系统正在做什么、做到哪了、接下来做什么"
4. **操作太多** — SPEC 树工作台里有大量手动操作(添加节点/移动/拆分/删除/保存版本),对于"自动驾驶"产品来说太重
5. **推导规格文档需要手动点** — 应该自动推进
6. **面板内容太密** — SpecTreeWorkbenchPanel 是给全宽 /specs 页面设计的,塞进右栏窄宽后体验差

## MiroFish 精髓提炼

| 特征 | MiroFish 做法 | 当前编组做法 |
|---|---|---|
| 信息流向 | 纵向时间线,内容持续 append 到底部 | 横向 tab / 面板切换 |
| 阶段推进 | 自动完成后进入下一阶段,无需手动点 | 需要手动点"推导规格文档"等按钮 |
| 内容密度 | 每段只展示关键摘要,详情可展开 | 全量展示所有字段和操作 |
| 用户角色 | 观察者 + 关键决策点介入 | 操作者(需要频繁点按钮) |
| 视觉节奏 | 一段完成 → 短暂停顿 → 下一段开始 | 瞬间切换,没有节奏感 |

## 重构目标

把编组右栏从"8 面板工作台"改为"流式时间线":

```
┌─────────────────────────────────────┐
│  ● 协作角色已就位                      │  ← 已完成,折叠为一行摘要
│    6 角色 / 20 事件 / 2 决策           │
├─────────────────────────────────────┤
│  ● SPEC 树已生成                      │  ← 已完成,折叠
│    15 节点 / v1 / 评审中              │
├─────────────────────────────────────┤
│  ◎ 规格文档生成中...                   │  ← 当前活跃,展示进度
│    requirements.md ✓                 │
│    design.md ✓                       │
│    tasks.md ⟳ 生成中                  │
├─────────────────────────────────────┤
│  ○ 效果预演                           │  ← 未来,灰色占位
│  ○ 提示词包                           │
│  ○ 运行时能力                         │
│  ○ 工程落地                           │
│  ○ 产物记忆                           │
└─────────────────────────────────────┘
```

## 核心设计原则

### 1. 三态节点

每个 sub-stage 在时间线上只有三种状态:
- **已完成** (completed):折叠为一行摘要 + 3 个指标数字,可点击展开详情
- **活跃** (active):展示当前进度,可能有流式输出动画
- **未来** (future):灰色标题占位,不渲染任何内容

### 2. 自动推进

- SPEC 树生成完成 → 自动触发规格文档生成(已实现,用 window.reload)
- 规格文档生成完成 → 自动触发效果预演
- 效果预演完成 → 自动触发提示词包
- 每一步完成后,时间线自动滚动到下一个活跃节点

### 3. 摘要优先

已完成的阶段**不再展示完整工作台**,只展示:
- 一行标题 + 状态 badge
- 3 个关键指标
- 可选:点击"展开"查看详情(跳转到 /specs 全宽页面,或展开 inline)

### 4. 流式输出感

活跃阶段的内容用 CSS animation 模拟"逐步出现":
- 新内容从底部 fade-in + slide-up
- 进度条或 skeleton 占位
- 完成时 checkmark 动画

## 技术方案

### 文件结构

```
client/src/pages/autopilot/right-rail/
├── AutopilotRightRail.tsx          ← 重写为流式时间线容器
├── timeline/
│   ├── TimelineNode.tsx            ← 单个时间线节点(三态)
│   ├── TimelineCompletedNode.tsx   ← 已完成节点(折叠摘要)
│   ├── TimelineActiveNode.tsx      ← 活跃节点(进度 + 流式内容)
│   ├── TimelineFutureNode.tsx      ← 未来节点(灰色占位)
│   └── timeline-animations.css     ← fade-in / slide-up 动画
├── sub-stage-summary.ts            ← 保留,供摘要使用
├── resolve-rail-sub-stage.ts       ← 保留,供状态判定使用
└── panels/                         ← 保留但降级为"详情展开"用途
```

### 数据流

```
job.stage (后端) 
  → resolveRailSubStage() (纯函数)
  → activeSubStage (当前活跃子阶段)
  → RAIL_SUB_STAGE_ORDER.map(sub => {
      if (index < activeIndex) → <TimelineCompletedNode>
      if (index === activeIndex) → <TimelineActiveNode>
      if (index > activeIndex) → <TimelineFutureNode>
    })
```

### 自动推进机制

```typescript
// 在 AutopilotRoutePage 层面,监听 job.stage 变化:
useEffect(() => {
  if (job.stage === "spec_tree" && specTree && !specDocuments) {
    // 自动触发规格文档生成
    generateBlueprintSpecDocuments(jobId, { nodeId: rootNodeId, types: [...] });
  }
  if (job.stage === "spec_docs" && specDocuments.length > 0 && !effectPreviews.length) {
    // 自动触发效果预演
    generateBlueprintEffectPreviews(jobId, { ... });
  }
  // ... 后续阶段类推
}, [job.stage, specTree, specDocuments, effectPreviews]);
```

### 已完成节点的摘要结构

```tsx
<TimelineCompletedNode
  title="SPEC 树"
  status="completed"
  metrics={[
    { label: "节点数", value: 15 },
    { label: "叶子数", value: 14 },
    { label: "版本", value: "v1" },
  ]}
  onExpand={() => navigate("/specs")}  // 或 inline 展开
/>
```

### 活跃节点的进度结构

```tsx
<TimelineActiveNode
  title="规格文档生成"
  status="active"
  progress={[
    { label: "requirements.md", done: true },
    { label: "design.md", done: true },
    { label: "tasks.md", done: false, loading: true },
  ]}
/>
```

## 改动范围

### Phase 1:时间线骨架(最小可用)

1. 重写 `AutopilotRightRail.tsx` — 从 `FabricCardStream` 改为纵向时间线
2. 新建 `TimelineNode` 三态组件
3. 已完成节点只展示摘要(复用 `deriveSubStageSummary`)
4. 活跃节点展示简化进度(不再嵌入完整 workbench)
5. 未来节点灰色占位

### Phase 2:自动推进

1. 在 `AutopilotRoutePage` 加 `useEffect` 监听 stage 变化
2. 每个阶段完成后自动触发下一阶段的 API 调用
3. 去掉所有手动"生成"按钮

### Phase 3:流式动画

1. 新内容 fade-in + slide-up
2. 进度条 / skeleton
3. 完成 checkmark 动画
4. 自动滚动到活跃节点

### Phase 4:详情入口

1. 已完成节点可点击展开(跳转 /specs 或 inline drawer)
2. SPEC 树详情保留 antd Tree 但只读
3. 规格文档详情保留 Markdown 预览但只读

## 不改的部分

- 后端 API 不变
- `resolveRailSubStage` 纯函数不变
- `useAutopilotRightRailData` hook 不变(数据层保留)
- `sub-stage-summary.ts` 不变(摘要派生保留)
- `/specs` 全宽页面不变(详情入口仍可用)

## 预期效果

用户选完路线后:
1. 右栏自动开始"协作角色"阶段 → 完成后折叠为摘要
2. 自动进入"SPEC 树"阶段 → 完成后折叠
3. 自动进入"规格文档"阶段 → 逐个文档生成,实时展示进度
4. 自动进入"效果预演" → ...
5. 用户全程只需要**看**,不需要点任何按钮
6. 如果需要干预(例如修改 SPEC 树节点),点击已完成摘要跳转到 /specs 全宽工作台

这就是"任务自动驾驶"的编组体验:系统自动推进,用户只在关键点介入。
