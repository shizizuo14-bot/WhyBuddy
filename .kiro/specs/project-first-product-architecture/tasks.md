# 任务清单：Project-First 产品架构

- [x] 建立 Project-first 总纲口径，明确 `Project` 是第一层产品对象
- [x] 将 README / README.zh-CN / 项目概览中的下一阶段方向补充为 Project-first 主线
- [x] 更新或新增架构图，表达 `Project -> Spec -> Route -> Execution -> Evidence` 主链
- [x] 明确首页、任务中心、设置、知识库、数据源的产品职责边界
- [x] 明确 `50+ AIGC 节点` 内聚在 FSD 角色内，不作为独立入口暴露
- [x] 明确 Workflow / Docker / Browser / Native Runtime 是运行承载层
- [x] 为后续 Project Domain、Cockpit、Composer、Clarification、Execution Center 等 spec 提供统一术语
- [x] 定义第一阶段 MVP 边界：项目创建、项目选择、projectId 贯穿、任务中心项目化
- [x] 定义第二阶段边界：Spec Center、Spec version、Spec source、Spec diff
- [x] 定义第三阶段边界：FSD route planner、主路线、备选路线、保守路线
- [x] 定义第四阶段边界：Docker / deep route / GitHub 调研 / artifact 回流
- [x] 定义第五阶段边界：Key Pool / Agent Pool / 并发调度

## 审计说明（2026-04-30）

- Project-first 总纲与阶段边界已沉淀到 `.kiro/steering/project-first-spec-roadmap-2026-04-30.md`。
- `docs/entry-execution-architecture.svg` 已表达 Project 主线，并修正 50+ AIGC 节点属于 FSD 角色内置能力。
- 本轮首页已将项目空间提升为首屏主叙事，任务中心继续承接执行明细，Workflow / Docker 保持运行承载定位。
- README / README.zh-CN / 项目概览已同步 Project-first 下一阶段说明，因此该条已勾选。
