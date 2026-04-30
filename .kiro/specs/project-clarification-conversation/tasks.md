# 任务清单：Project Clarification & Conversation

- [x] 定义项目澄清问题类型和 store 接口
- [x] 将现有补问状态关联到 `projectId`
- [x] 澄清问题生成时写入 `ProjectMessage`
- [x] 用户回答后写入 `ProjectMessage` 和 `ProjectEvidence`
- [x] 支持澄清问题的必答、可跳过和默认假设
- [x] 在 Project Cockpit 展示当前缺失信息和澄清进度
- [x] 将澄清回答作为 `ProjectSpec` 来源
- [x] 在任务执行接管问题中复用项目澄清记录
- [x] 补充测试，覆盖多轮澄清、跳过澄清、合并回答和 spec 来源关联

## 审计说明：2026-04-30

- 现有 TaskHub clarification session 已保存 `commandProjectContextById`，澄清后创建 mission 时不会丢失 projectId。
- 已在 `project-store` 中增加 `ProjectClarificationQuestion` 持久模型、添加 / 回答 / 跳过 store 接口、bundle 暴露和旧 snapshot 迁移兼容，并补充 `project-store.test.ts` 覆盖。
- 生成澄清问题时，`unified-launch-coordinator` 会写入 assistant `ProjectMessage(kind: "clarification")`，并同步写入 `ProjectClarificationQuestion`，保留 command/question/message 来源。
- 用户提交澄清回答时，`unified-launch-coordinator` 会写入 user `ProjectMessage(kind: "clarification")`、更新对应 `ProjectClarificationQuestion.answer`，并追加 `ProjectEvidence(type: "clarification")`。
- 用户提交澄清回答后，`unified-launch-coordinator` 会创建一版轻量 `ProjectSpec(status: "draft")`，并用本次回答产生的 `ProjectMessage` / `ProjectEvidence` id 填充 `sourceMessageIds` / `sourceEvidenceIds`。
- `answerProjectClarificationQuestion` 已收紧必答 / 跳过语义：空回答不会写入；跳过会自动使用默认假设；必答题没有默认假设时不能跳过，并补充对应 store 测试。
- Project Cockpit 已读取 raw `clarificationQuestions` slice，并在 `useMemo` 中派生当前项目的 open / resolved / required / skippable 概况和首个开放问题摘要，补充 Home 与桌面首屏 smoke 测试。
- 已补充 store 测试覆盖多轮澄清回答、跳过默认假设、跨项目隔离、合并回答进入初始 spec 草稿，以及 `sourceMessageIds` 关联。
- 任务执行中心已读取 raw `clarificationQuestions` slice，并通过 `buildTaskClarificationTakeoverSummary` 在选中任务的项目关系区域展示项目澄清记录与接管问题的上下文关系，覆盖 resolved / open / required / skippable 和首个开放问题摘要。
