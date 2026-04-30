# 任务清单：Project Execution Center

- [x] 任务中心读取当前项目并默认按 `projectId` 过滤
- [x] 增加项目选择或项目过滤入口
- [x] 任务卡片显示所属项目、路线、spec 来源
- [x] 支持未归档任务展示
- [x] 支持将未归档任务关联到当前项目
- [x] operator action 写入 `ProjectMessage` 和 `ProjectEvidence`
- [x] 任务日志和 artifact 归档到项目
- [x] 任务详情展示 route / role / runtime / evidence 关系
- [x] 调整任务中心文案，弱化新建任务入口
- [x] 补充 `/tasks` 测试，覆盖项目过滤、未归档任务、终止/重试回写

## 审计说明（2026-04-30）

- 第一阶段 `/tasks` 使用前端 `ProjectMission` projection 进行当前项目过滤，未下推到后端 `/api/tasks`。
- 页面新增项目执行中心 banner，显示当前项目任务数与未归档任务数。
- operator action 已同时写入 `ProjectMessage` 和 `ProjectEvidence`，用于项目执行中心回放接管决策轨迹。
- 未归档任务会保留在当前项目视图中，聚焦后可通过“归入当前项目”操作写入 `ProjectMission`。
- 任务详情焦点卡增加 route / role / runtime / evidence 只读关系摘要，来源于 `ProjectMission`、`ProjectRoute`、运行时通道、项目 evidence/artifact 与本地日志。
- `/tasks` 已新增任务级归档 helper，读取选中任务的 artifacts 与 log summary，按 `projectId + missionId` 幂等写入 `ProjectArtifact` 与 `ProjectEvidence(type: "log")`。
- `TasksPage.test.tsx` 已覆盖项目过滤、未归档任务归入当前项目、operator action 写入 `ProjectMessage` / `ProjectEvidence`，以及任务日志/artifact 归档 helper。
