# 任务清单：Project Evidence, Artifact & Replay

- [x] 定义 `ProjectArtifact` 和 `ProjectEvidence` 类型
- [x] 用户输入、澄清、路线选择、operator action 写入 evidence
- [x] mission 创建、完成、失败、取消时写入 evidence
- [x] runtime logs 和 artifacts 关联 `projectId`
- [x] Project Cockpit 展示最近 evidence 和 artifact 摘要
- [x] Project Execution Center 展示任务级证据和产物
- [x] 实现项目 replay timeline 的最小版本
- [x] SVG 架构图和进度图支持作为 project artifact 引用
- [x] spec 版本引用 evidence / artifact 来源
- [x] 补充测试，覆盖 evidence 写入、artifact 关联、replay timeline 排序

## 进展记录

- `ProjectArtifact` / `ProjectEvidence` 类型已在 `client/src/lib/project-store.ts` 定义；`project-replay` helper 只消费这些 store 类型，不重复定义。
- 已新增 `project-replay` helper，将 `ProjectEvidence`、`ProjectArtifact`、`ProjectMission` 合并为按时间倒序的项目 replay timeline，并补充 replay 排序与摘要测试。
- 已新增 SVG artifact reference normalization helper，可将 docs 下 SVG 架构图/进度图规范化为 project artifact 引用输入（`type: "svg"`、`projectId`、`title`、`path`/`uri`、可选 `sourceSpecId`/`sourceMissionId`），不移动文件。
- 已补充 Project Cockpit 最近 evidence/artifact 摘要的底层输入 helper，提供最新条目、总数和最近更新时间；UI 接入留给后续 cockpit/home 迭代。
- 已补充 spec 版本来源引用解析 helper，可将 `sourceEvidenceIds` / `sourceArtifactIds` 解析为同项目 evidence/artifact 引用，并报告缺失来源 ID。
- 已补充 Project Execution Center 任务级 evidence/artifact 摘要 helper，可按 `projectId` + `missionId` 提供任务来源条目、计数和最新时间；UI 接入留给后续 `/tasks` 迭代。
- `/tasks` 已接入任务日志和任务 artifact 的项目归档：选中任务时将本地 log summary 写入 `ProjectEvidence(type: "log")`，将任务 artifacts 写入 `ProjectArtifact`，并保留 `projectId` 与 `sourceMissionId`。
- 测试已覆盖 SVG artifact reference、artifact 关联摘要和 replay timeline 排序；总测试项暂不勾选，剩余范围是 evidence 写入路径（用户输入、澄清、operator action、mission lifecycle、runtime log）的端到端/存储行为。
- `addProjectMessage({ createEvidence: true })` 可将用户输入显式写入 `ProjectEvidence(type: "message")`；统一发起入口已对项目发起文本开启该写入。
- mission 创建会写入 `Mission created` runtime evidence；mission 完成、失败、取消会分别写入 runtime/failure evidence，并携带 `sourceMissionId/sourceSpecId/sourceRouteId`。
- `project-store.test.ts` 已覆盖用户输入、澄清、路线选择、operator action、mission lifecycle 的 evidence 写入；`project-replay.test.ts` 覆盖 artifact 关联和 replay timeline 排序。
