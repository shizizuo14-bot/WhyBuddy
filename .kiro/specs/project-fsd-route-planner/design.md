# 设计文档：Project FSD Route Planner

## 设计概述

FSD Route Planner 的核心原则：

> 用户看路线，不看节点。

它把项目 spec 和上下文翻译成可选择的执行路径，再由系统内部映射到 FSD 角色、mission、workflow 和 runtime。

## 输入

```ts
interface ProjectRoutePlannerInput {
  project: Project;
  currentSpec?: ProjectSpec;
  recentMessages: ProjectMessage[];
  existingMissions: ProjectMission[];
  artifacts: ProjectArtifact[];
  constraints: {
    allowNetwork?: boolean;
    allowDocker?: boolean;
    preferredRuntime?: "frontend" | "advanced";
    budgetHint?: string;
  };
}
```

## 输出

```ts
interface ProjectRoutePlan {
  projectId: string;
  specId?: string;
  routes: ProjectRoute[];
  recommendedRouteId: string;
  reason: string;
  missingInfo: string[];
}
```

## 路线类型

### 推荐路线

系统认为收益、风险和速度最均衡的路线。

### 快速路线

优先产出原型或最小可运行结果。

### 深度路线

优先调研、分析、GitHub repo 对比、架构验证和 spec 完善。

### 保守路线

不立即执行代码，继续澄清或只产出文档。

## 角色映射

路线步骤映射到 FSD 角色：

| 路线步骤 | 可能角色 | 说明 |
| ---- | ---- | ---- |
| 调研 | Researcher | 可调用联网、GitHub、repo 分析能力 |
| 规格整理 | Spec Writer | 可调用总结、结构化、diff 能力 |
| 实现 | Builder | 可调用代码生成、文件编辑、测试能力 |
| 审查 | Reviewer | 可调用测试、风险分析、对照 spec 能力 |
| 规划 | Planner | 可调用分解、排序、估算能力 |

`50+ AIGC 节点` 属于这些角色内部能力，不作为路线图外部节点展示。

## 路线转执行

选择路线后：

```text
ProjectRoute -> Mission Plan -> Workflow / Runtime -> ProjectMission
```

所有执行对象必须带：

- `projectId`
- `routeId`
- `specId`

## Replan 触发

- spec 更新
- mission 失败
- 用户修改目标
- 风险升高
- artifact 与预期不符
- runtime 能力不足

## 非目标

- 不要求用户手工搭 DAG。
- 不把 50+ 节点作为路线选择项。
- 第一阶段不实现完整自动估价和排期系统。

