# 设计文档:输入步骤流式时间线重构

## 设计概述

将 `AutopilotWorkflowRail` 的 `case "input"` 分支从"表单堆叠"改为纵向时间线,复用编组阶段的 `TimelineNode` 组件。5 个子阶段按顺序渲染,每个子阶段根据数据状态自动判定 completed / active / future。

## 子阶段状态判定规则

```typescript
type InputSubStage = "target_input" | "intake" | "clarification" | "route_generation" | "route_selection";

function resolveInputActiveSubStage(state): InputSubStage {
  if (selection) return "route_selection"; // 全部完成
  if (routeSet) return "route_selection";  // 路线已生成,等选择
  if (generatingRouteSet) return "route_generation"; // 正在生成路线
  if (isClarificationReady) return "route_generation"; // 澄清就绪,等路线
  if (intake) return "clarification"; // intake 已创建,进入澄清
  return "target_input"; // 初始状态
}
```

## 时间线结构

```
┌─────────────────────────────────────┐
│  ● 目标输入                          │  ← completed: "分析 MiroFish..." + 1 链接
├─────────────────────────────────────┤
│  ● 输入记录                          │  ← completed: 1 来源 / 0 重复 / 已挂接
├─────────────────────────────────────┤
│  ● 澄清                             │  ← completed: 就绪 100% / 1/1 已回答
├─────────────────────────────────────┤
│  ◎ 路线生成                          │  ← active: "正在生成路线..."
├─────────────────────────────────────┤
│  ○ 路线选择                          │  ← future
└─────────────────────────────────────┘
```

## 技术方案

### 改动范围

只改 `AutopilotWorkflowRail` 内部的 `renderActiveStepBody()` → `case "input"` 分支。

不新建文件,不改数据层,不改 API 调用。

### 实现方式

```tsx
case "input":
  return <InputTimeline {...inputTimelineProps} />;
```

`InputTimeline` 是一个内联组件(或独立文件),接收所有现有 props,内部:
1. 计算 `activeInputSubStage`
2. 渲染 5 个 `<TimelineNode>`,每个根据状态展示不同内容
3. 活跃节点内嵌对应的交互 UI(textarea / 问题列表 / 路线卡片)

### 复用 TimelineNode

```tsx
import { TimelineNode } from "./right-rail/timeline";
import type { SubStageSummary } from "./right-rail/sub-stage-summary";
```

为输入步骤的 5 个子阶段各构造一个 `SubStageSummary`:
- title / apiPath / summary / metrics / dataReady

### 自动推进

已有的 `useEffect` 逻辑(澄清就绪后自动生成路线)保持不变。
新增:intake 创建成功后自动触发澄清生成。

## 不改的部分

- `handleCreateIntake` / `handleGenerateClarifications` / `handleSaveAnswers` 等回调
- `ClarificationPanel` 组件
- `RouteOption` 组件
- `MetricBox` 组件
- 所有 useState / useCallback
- AutopilotRoutePage.test.tsx 的断言(可能需要微调)
