# 需求文档：Project Domain Model

## 目标

建立 Project-first 改造的最小领域模型，让项目成为问答、澄清、spec、路线、任务、产物、证据和记忆的归属容器。第一阶段可使用前端持久化，后续再迁移到服务端数据库。

## 需求

### 需求 1：Project CRUD 与当前项目

系统应支持创建项目、查看项目列表、选择当前项目、更新项目目标和归档项目。

### 需求 2：Project 持久化

系统应在第一阶段通过前端 store 和 localStorage 保存项目数据，并为后续 server storage / database 迁移保留 schema 兼容空间。

### 需求 3：ProjectMessage

系统应将项目内问答、澄清、用户决策和系统建议保存为 `ProjectMessage`，并通过 `projectId` 关联到项目。

### 需求 4：ProjectSpec

系统应将项目规格文档保存为 `ProjectSpec`，支持版本、来源、摘要、完整度、状态和创建时间。

### 需求 5：ProjectRoute

系统应将路线规划结果保存为 `ProjectRoute`，支持推荐路线、备选路线、保守路线、风险、成本、预计耗时和用户选择状态。

### 需求 6：ProjectMission

系统应将现有 mission / task 与 `projectId` 关联，形成项目下的执行单元索引。

### 需求 7：ProjectArtifact

系统应将文档、代码、SVG、报告、原型、截图等产物挂到项目下，并记录来源 mission、来源 spec、类型和路径。

### 需求 8：ProjectEvidence

系统应将日志、决策、执行轨迹、引用来源、replay 片段等证据挂到项目下，并能反向支撑 spec 和 route。

### 需求 9：兼容未绑定任务

系统应兼容历史任务没有 `projectId` 的情况，并提供 `inbox / unassigned` 或手动归档方式，不应破坏现有任务中心。

### 需求 10：数据迁移与版本

系统应为 project store 提供 schema version，确保后续字段变化、后端迁移和历史数据升级可控。

