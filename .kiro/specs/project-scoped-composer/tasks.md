# 任务清单：Project-Scoped Composer

- [x] 为 `UnifiedLaunchComposer` 增加当前项目上下文输入
- [x] 无项目时将输入转为创建项目动作
- [x] 有项目时更新 placeholder 和按钮语义
- [x] 提交前写入 `ProjectMessage`
- [x] 附件上传或选择时关联 `projectId`
- [x] 路由判断时读取项目状态、当前 spec、当前 route、最近消息
- [x] 任务创建成功后写入 `ProjectMission`
- [x] 澄清问题和回答写回 `ProjectMessage`
- [x] 路线判断结果写入 `ProjectRoute`
- [x] 错误、运行时升级和用户取消动作写入项目 evidence
- [x] 补充 `UnifiedLaunchComposer` 测试，覆盖无项目、有项目、澄清、任务创建路径

## 审计说明（2026-04-30）

- `UnifiedLaunchComposer` 已接收 `projectId/projectName`；无当前项目时，第一次输入会创建项目并继续提交。
- 项目消息、运行时升级 evidence、mission/workflow 创建后的 `ProjectMission` 关联由 `unified-launch-coordinator` 统一回写；mission / workflow / clarification 失败会写入 failure evidence。
- 附件在 composer 提交前进入 `ProjectArtifact`；非 composer 入口由 coordinator 兜底登记，避免附件只停留在 workflow input。
- 路由判断已读取项目状态、当前 spec、当前 route 与最近消息；项目内“继续推进”类短输入可借助上下文避免重复澄清。
- 路线判断结果会写入 `ProjectRoute`，并同步一条 route evidence；选中可执行路线时会设为当前路线。
- 澄清问题由 assistant clarification message 回写，澄清回答由 user clarification message 回写。
- 本轮补充了 route / coordinator / composer 定向测试，覆盖项目上下文路由、附件 artifact、ProjectRoute、澄清和失败 evidence。
