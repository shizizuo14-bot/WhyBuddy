# 任务清单：Project Spec Center

- [x] 定义 `ProjectSpec` 和 spec completeness 类型
- [x] 实现从项目目标和澄清生成初始 spec 草案的接口
- [x] 支持 spec 版本创建、接受、替代
- [x] 在 Project Cockpit 展示当前 spec 摘要和完整度
- [x] 实现 Spec Center 页面或面板入口
- [x] 记录 spec 来源 message / evidence / artifact
- [x] 实现相邻版本 diff 摘要
- [x] 支持用户确认或编辑 spec（本轮完成最小确认；编辑未覆盖）
- [x] 执行结果和用户决策可生成 spec 更新建议
- [x] 补充测试，覆盖 spec 版本、来源、完整度和 route 引用

## 审计说明：2026-04-30

- `acceptProjectSpec` 已支持可选用户确认信息：接受 spec 时可记录 `confirmedBy`、`confirmationNote`、`confirmationEvidenceId`，并把确认 message / evidence 来源合并到 `sourceMessageIds` / `sourceEvidenceIds`。
- 当传入确认说明时，store 会追加一条 `ProjectEvidence(type: "decision")` 作为 spec 接受证据，并把该 evidence id 挂回 accepted spec。
- 本轮只覆盖“用户确认 spec”的最小 store 行为；用户编辑 spec 内容、编辑 diff 和 UI 交互尚未实现。
- 已新增 `/specs` 轻量 Spec Center 页面，并在首页 current spec 卡片提供入口；页面读取当前项目的 spec 版本、当前 spec 内容、evidence/artifact 来源计数。
