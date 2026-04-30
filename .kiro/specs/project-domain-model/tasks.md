# 任务清单：Project Domain Model

- [x] 新增 `Project`、`ProjectStatus`、`ProjectMessage`、`ProjectSpec`、`ProjectRoute`、`ProjectMission`、`ProjectArtifact`、`ProjectEvidence` 类型
- [x] 新增 project store，支持 schema version 和 localStorage 持久化
- [x] 实现创建项目、选择当前项目、更新项目、归档项目
- [x] 实现当前项目选择状态，并在刷新页面后恢复
- [x] 实现项目问答和澄清消息写入 `ProjectMessage`
- [x] 实现 spec、route、mission、artifact、evidence 的项目关联写入接口
- [x] 在任务创建成功后写入 `ProjectMission`
- [x] 为历史未绑定任务提供 `unassigned` 展示或归档入口
- [x] 为 store 添加单元测试，覆盖创建、选择、持久化、迁移和关联写入
- [x] 为后续服务端迁移保留 schema version 和 migration 函数

## 审计说明（2026-04-30）

- 第一阶段采用前端 project projection：`ProjectMission` 先作为 mission 与 project 的关联索引，暂不强改后端 `MissionRecord` contract。
- `project-store` 已提供 schema version、localStorage 持久化和基础 migration 入口形态；后续服务端迁移可沿该 snapshot schema 展开。
- 已新增 `client/src/lib/project-store.test.ts` 覆盖创建、选择、持久化、bundle 关联和 mission link 去重。
