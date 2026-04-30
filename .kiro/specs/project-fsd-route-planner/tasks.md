# 任务清单：Project FSD Route Planner

- [x] 定义项目级 route planner input / output 类型
- [x] 读取 current project、current spec、recent messages 和 constraints
- [x] 生成推荐、快速、深度、保守四类路线
- [x] 在 Project Cockpit 展示路线卡片
- [x] 支持用户选择路线并写入 `ProjectRoute`
- [x] 将路线转换为 mission plan，带 `projectId`、`specId`、`routeId`
- [x] 在任务详情展示路线来源和角色映射
- [x] 将路线选择、调整和 replan 写入 `ProjectEvidence`
- [x] 支持 spec 更新或失败任务触发 replan
- [x] 补充测试，覆盖路线生成、选择、mission 关联和 replan（spec 更新和失败 mission replan 已覆盖）

## 审计说明：2026-04-30

- `/tasks` 任务详情通过 `buildTaskProjectRelationshipSummary` 展示 route / role / runtime / evidence 关系，route 来源于 `ProjectMission.routeId` 或项目当前 route，role 来源于 route steps 的首个角色映射，并已有 `TasksPage.test.tsx` 覆盖。
- Route planner 已覆盖生成、选择、mission plan 关联、route selection evidence，以及 spec 更新/失败 mission 触发 replan 的 store 测试。
